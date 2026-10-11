import { DunningLevel } from '@prisma/client';
import {
  calculateInterest,
  computeDunning,
  DunningRules,
  interestRatePercent,
  isNextLevelDue,
  levelFee,
  nextLevel,
} from './dunning-calc';

const rules: DunningRules = {
  reminderAfterDays: 3,
  graceDays: 7,
  feeFirst: 5,
  feeSecond: 10,
  feeFinal: 15,
  interestEnabled: true,
  baseRatePercent: 1.27,
  lumpSumB2B: 40,
};

describe('nextLevel', () => {
  it('escalates step by step and ends after the final dunning', () => {
    expect(nextLevel(null)).toBe(DunningLevel.REMINDER);
    expect(nextLevel(DunningLevel.REMINDER)).toBe(DunningLevel.FIRST);
    expect(nextLevel(DunningLevel.FIRST)).toBe(DunningLevel.SECOND);
    expect(nextLevel(DunningLevel.SECOND)).toBe(DunningLevel.FINAL);
    expect(nextLevel(DunningLevel.FINAL)).toBeNull();
  });
});

describe('isNextLevelDue', () => {
  const today = new Date('2026-10-11');
  it('suggests the first letter only after the configured number of days past due', () => {
    expect(isNextLevelDue(null, 2, today, rules)).toBe(false);
    expect(isNextLevelDue(null, 3, today, rules)).toBe(true);
  });

  it('waits until the deadline of the previous letter has expired', () => {
    expect(isNextLevelDue({ dueDate: new Date('2026-10-11') }, 9, today, rules)).toBe(false); // deadline is today
    expect(isNextLevelDue({ dueDate: new Date('2026-10-09') }, 9, today, rules)).toBe(true);
  });
});

describe('interest', () => {
  it('uses base rate + 9 points for businesses and + 5 for consumers', () => {
    expect(interestRatePercent(1.27, true).toString()).toBe('10.27');
    expect(interestRatePercent(1.27, false).toString()).toBe('6.27');
  });

  it('calculates actual days / 365, rounded to cents', () => {
    // 1000 € * 10.27 % * 30 / 365 = 8.4411...
    expect(calculateInterest(1000, 10.27, 30).toString()).toBe('8.44');
    expect(calculateInterest(1000, 10.27, 0).toString()).toBe('0');
    expect(calculateInterest(12691.78, 10.27, 7).toString()).toBe('25');
  });
});

describe('levelFee', () => {
  it('is free for reminders and rises per level', () => {
    expect(
      [DunningLevel.REMINDER, DunningLevel.FIRST, DunningLevel.SECOND, DunningLevel.FINAL].map((level) =>
        levelFee(rules, level).toString(),
      ),
    ).toEqual(['0', '5', '10', '15']);
  });
});

describe('computeDunning', () => {
  const base = { openAmount: 1000, overdueDays: 30, isBusiness: true, lumpSumAlreadyCharged: false, rules };

  it('only asks for the open amount in a reminder', () => {
    const result = computeDunning({ ...base, level: DunningLevel.REMINDER });
    expect(result.total.toString()).toBe('1000');
    expect(result.fee.toString()).toBe('0');
    expect(result.interest.toString()).toBe('0');
    expect(result.lumpSum.toString()).toBe('0');
  });

  it('adds fee, interest and the lump sum from the first dunning on (business customer)', () => {
    const result = computeDunning({ ...base, level: DunningLevel.FIRST });
    expect(result.fee.toString()).toBe('5');
    expect(result.interest.toString()).toBe('8.44');
    expect(result.lumpSum.toString()).toBe('40');
    expect(result.total.toString()).toBe('1053.44');
  });

  it('charges the lump sum only once per invoice and not to consumers', () => {
    expect(
      computeDunning({ ...base, level: DunningLevel.SECOND, lumpSumAlreadyCharged: true }).lumpSum.toString(),
    ).toBe('0');
    const consumer = computeDunning({ ...base, isBusiness: false, level: DunningLevel.FIRST });
    expect(consumer.lumpSum.toString()).toBe('0');
    expect(consumer.interestRate.toString()).toBe('6.27');
  });

  it('can switch interest off', () => {
    const result = computeDunning({
      ...base,
      level: DunningLevel.FIRST,
      rules: { ...rules, interestEnabled: false },
    });
    expect(result.interest.toString()).toBe('0');
    expect(result.total.toString()).toBe('1045');
  });
});
