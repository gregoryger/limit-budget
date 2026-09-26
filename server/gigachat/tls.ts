import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rootCertificates } from 'node:tls';
import { Agent } from 'undici';

// Серверы GigaChat подписаны корневым сертификатом Минцифры (Russian Trusted Root CA).
// Добавляем его к стандартным корневым сертификатам только для запросов к GigaChat,
// чтобы не требовать установки в систему. Проверка TLS не отключается.
const CERT_NAME = 'russian_trusted_root_ca.pem';

function certificatePath() {
  const candidates = [
    process.env.GIGACHAT_CA_FILE,
    fileURLToPath(new URL(`../certs/${CERT_NAME}`, import.meta.url)),
    resolve(process.cwd(), 'server', 'certs', CERT_NAME),
  ];
  return candidates.find((file): file is string => Boolean(file) && existsSync(file!));
}

let dispatcher: Agent | undefined;

export function gigachatTransport(): Record<string, unknown> {
  if (!dispatcher) {
    const file = certificatePath();
    const extra = file ? [readFileSync(file, 'utf8')] : [];
    dispatcher = new Agent({ connect: { ca: [...rootCertificates, ...extra] } });
  }
  return { dispatcher };
}
