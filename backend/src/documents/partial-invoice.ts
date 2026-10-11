import { Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;
type DecimalValue = Prisma.Decimal.Value;

export interface VatGroupNet {
  vatRate: Decimal;
  net: Decimal;
}

const round2 = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

// Net amount of a partial invoice given as a percentage of the contract net value.
export function amountFromPercent(contractNet: DecimalValue, percent: DecimalValue): Decimal {
  return round2(new Decimal(contractNet).mul(percent).div(100));
}

// Splits a partial net amount over the VAT rates of the contract, proportionally to each rate's
// share of the contract net value. Every share is rounded to cents; the last group takes the
// remainder so the parts always add up to exactly the requested amount (important: the invoice
// total must equal what was agreed).
export function splitPartialAmount(groups: VatGroupNet[], target: DecimalValue): VatGroupNet[] {
  const total = groups.reduce((sum, group) => sum.plus(group.net), new Decimal(0));
  if (groups.length === 0 || total.lte(0)) {
    return [];
  }
  const wanted = new Decimal(target);
  let assigned = new Decimal(0);
  return groups.map((group, index) => {
    const isLast = index === groups.length - 1;
    const net = isLast ? wanted.minus(assigned) : round2(wanted.mul(group.net).div(total));
    assigned = assigned.plus(net);
    return { vatRate: group.vatRate, net };
  });
}
