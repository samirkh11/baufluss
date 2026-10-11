import { DunningLevel, Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;
type DecimalValue = Prisma.Decimal.Value;

const round2 = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export const LEVEL_ORDER: DunningLevel[] = [
  DunningLevel.REMINDER,
  DunningLevel.FIRST,
  DunningLevel.SECOND,
  DunningLevel.FINAL,
];

export interface DunningRules {
  reminderAfterDays: number;
  graceDays: number;
  feeFirst: DecimalValue;
  feeSecond: DecimalValue;
  feeFinal: DecimalValue;
  interestEnabled: boolean;
  baseRatePercent: DecimalValue;
  lumpSumB2B: DecimalValue;
}

// Next escalation step after `last` (null = no letter yet). null after the final dunning: the
// matter has to go to a collection agency / lawyer.
export function nextLevel(last: DunningLevel | null): DunningLevel | null {
  const index = last === null ? -1 : LEVEL_ORDER.indexOf(last);
  return LEVEL_ORDER[index + 1] ?? null;
}

export const levelRank = (level: DunningLevel) => LEVEL_ORDER.indexOf(level);

// Is the next letter due? The first one when the invoice is `reminderAfterDays` past due; every
// following one once the deadline of the previous letter has expired.
export function isNextLevelDue(
  last: { dueDate: Date } | null,
  overdueDays: number,
  today: Date,
  rules: Pick<DunningRules, 'reminderAfterDays'>,
): boolean {
  if (last === null) {
    return overdueDays >= rules.reminderAfterDays;
  }
  return today.getTime() > last.dueDate.getTime();
}

// Default interest rate for late payment (§ 288 BGB): base rate + 9 points between businesses,
// + 5 points for consumers.
export function interestRatePercent(baseRatePercent: DecimalValue, isBusiness: boolean): Decimal {
  return new Decimal(baseRatePercent).plus(isBusiness ? 9 : 5);
}

// Default interest on the open amount for the days in arrears (actual days / 365).
export function calculateInterest(
  openAmount: DecimalValue,
  ratePercent: DecimalValue,
  days: number,
): Decimal {
  if (days <= 0) {
    return new Decimal(0);
  }
  return round2(new Decimal(openAmount).mul(ratePercent).div(100).mul(days).div(365));
}

export function levelFee(rules: DunningRules, level: DunningLevel): Decimal {
  switch (level) {
    case DunningLevel.FIRST:
      return new Decimal(rules.feeFirst);
    case DunningLevel.SECOND:
      return new Decimal(rules.feeSecond);
    case DunningLevel.FINAL:
      return new Decimal(rules.feeFinal);
    default:
      return new Decimal(0); // reminders are free of charge
  }
}

export interface DunningAmounts {
  openAmount: Decimal;
  fee: Decimal;
  interestRate: Decimal;
  interestDays: number;
  interest: Decimal;
  lumpSum: Decimal;
  total: Decimal;
}

// Amounts of a dunning letter. Reminders only ask for the open amount; from the first dunning on,
// fees and default interest are added, and business customers owe the lump sum once per invoice.
export function computeDunning(input: {
  openAmount: DecimalValue;
  level: DunningLevel;
  overdueDays: number;
  isBusiness: boolean;
  lumpSumAlreadyCharged: boolean;
  rules: DunningRules;
}): DunningAmounts {
  const { level, rules } = input;
  const openAmount = new Decimal(input.openAmount);
  const escalated = level !== DunningLevel.REMINDER;

  const interestRate =
    escalated && rules.interestEnabled
      ? interestRatePercent(rules.baseRatePercent, input.isBusiness)
      : new Decimal(0);
  const interestDays = escalated && rules.interestEnabled ? Math.max(0, input.overdueDays) : 0;
  const interest = calculateInterest(openAmount, interestRate, interestDays);
  const fee = levelFee(rules, level);
  const lumpSum =
    escalated && input.isBusiness && !input.lumpSumAlreadyCharged
      ? new Decimal(rules.lumpSumB2B)
      : new Decimal(0);

  return {
    openAmount,
    fee,
    interestRate,
    interestDays,
    interest,
    lumpSum,
    total: openAmount.plus(fee).plus(interest).plus(lumpSum),
  };
}
