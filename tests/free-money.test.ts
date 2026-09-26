import { describe, expect, it } from 'vitest';
import {
  calculateFreeMoney,
  obligationBreakdownSchema,
  totalObligations,
  unallocatedObligations,
} from '../shared/free-money';

describe('free money after confirmed obligations', () => {
  const obligations = {
    housing: 350_000,
    communication: 50_000,
    transport: 85_000,
    subscriptions: 29_900,
    other: 375_100,
  };

  it('deducts each category exactly once from current balance, excluding future income', () => {
    expect(totalObligations(obligations)).toBe(890_000);
    expect(calculateFreeMoney(2_140_000, obligations)).toEqual({
      reservedKopecks: 890_000,
      afterObligationsKopecks: 1_250_000,
      freeKopecks: 1_250_000,
      deficitKopecks: 0,
    });
  });

  it('shows zero spendable money and a separate deficit when bills exceed the balance', () => {
    const result = calculateFreeMoney(500_000, obligations);
    expect(result.freeKopecks).toBe(0);
    expect(result.deficitKopecks).toBe(390_000);
  });

  it('keeps unknown balance or obligations unknown; explicit zero is valid', () => {
    expect(calculateFreeMoney(null, obligations).freeKopecks).toBeNull();
    expect(calculateFreeMoney(2_140_000, null).freeKopecks).toBeNull();
    expect(calculateFreeMoney(0, unallocatedObligations(0)).freeKopecks).toBe(0);
    expect(unallocatedObligations(890_000)?.other).toBe(890_000);
  });

  it('rejects negative, fractional and excessive total obligations', () => {
    expect(obligationBreakdownSchema.safeParse({ ...obligations, housing: -1 }).success).toBe(
      false,
    );
    expect(obligationBreakdownSchema.safeParse({ ...obligations, housing: 0.5 }).success).toBe(
      false,
    );
    expect(
      obligationBreakdownSchema.safeParse({
        housing: 100_000_000_00,
        communication: 1,
        transport: 0,
        subscriptions: 0,
        other: 0,
      }).success,
    ).toBe(false);
  });
});
