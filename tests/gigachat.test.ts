import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { demoResponse } from '../server/gigachat/demo-response';
import { parseCsv } from '../server/statement-import/parser';
import { readFileSync } from 'node:fs';
const rows = parseCsv(readFileSync('public/demo-statement.csv', 'utf8'));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GIGACHAT_AUTH_KEY', 'test-only-placeholder');
  vi.stubEnv('GIGACHAT_BASE_URL', 'https://api.giga.chat/v1');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe('GigaChat server adapter with mocked HTTP transport', () => {
  it('uses OAuth, exact structured-output parameters, parses content and caches tokens', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'test-token', expires_at: Date.now() + 1800000 }),
      )
      .mockImplementation(async () =>
        Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(demoResponse) } }],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { extractWithGigaChat } = await import('../server/gigachat/adapter');
    const result = await extractWithGigaChat(rows);
    expect(result.transactions).toHaveLength(12);
    await extractWithGigaChat(rows);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v2/oauth');
    expect(options.headers.RqUID).toMatch(/^[0-9a-f-]{36}$/);
    expect(options.body.toString()).toBe('scope=GIGACHAT_API_PERS');
    const [chatUrl, chatOptions] = fetchMock.mock.calls[1];
    expect(chatUrl).toBe('https://api.giga.chat/v1/chat/completions');
    const body = JSON.parse(chatOptions.body);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.strict).toBe(true);
    expect(body.response_format.schema.required).toEqual(['transactions', 'skipped']);
    expect(body.messages[1].content).toContain('row-13');
  });
  it('rejects truncated responses and free text', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ access_token: 'token', expires_at: Date.now() + 1800000 }),
      )
      .mockResolvedValueOnce(
        Response.json({ choices: [{ finish_reason: 'length', message: { content: '{}' } }] }),
      )
      .mockResolvedValue(
        Response.json({
          choices: [
            { finish_reason: 'stop', message: { content: 'Расходы составили сто рублей' } },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);
    const { extractWithGigaChat } = await import('../server/gigachat/adapter');
    await expect(extractWithGigaChat(rows)).rejects.toThrow('Incomplete');
    await expect(extractWithGigaChat(rows)).rejects.toThrow();
  });
  it('returns a controlled failure for unavailable OAuth', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    const { extractWithGigaChat } = await import('../server/gigachat/adapter');
    await expect(extractWithGigaChat(rows)).rejects.toThrow('OAuth HTTP 503');
  });
});
