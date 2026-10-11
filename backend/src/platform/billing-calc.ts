import { Prisma } from '@prisma/client';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

// "2026-10" -> first and last day of the month (UTC dates) and the German label "Oktober 2026".
export function billingPeriod(month: string): { start: Date; end: Date; label: string } {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)),
    end: new Date(Date.UTC(year, monthNumber, 0)),
    label: `${MONTHS[monthNumber - 1]} ${year}`,
  };
}

// Net price + VAT, rounded commercially to cents.
export function invoiceAmounts(net: Prisma.Decimal.Value, vatRate: Prisma.Decimal.Value) {
  const netAmount = new Prisma.Decimal(net).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const vat = netAmount.mul(vatRate).div(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return { net: netAmount, vat, gross: netAmount.plus(vat) };
}

// PR-2026-0007
export const platformInvoiceNumber = (year: number, sequence: number) => `PR-${year}-${String(sequence).padStart(4, '0')}`;

// Billing starts with the first full month after the trial ended; only ACTIVE companies with a priced plan are billed.
export function isBillableIn(company: { status: string; trialEndsAt: Date | null; planPrice: Prisma.Decimal.Value | null }, periodStart: Date): boolean {
  if (company.status !== 'ACTIVE' || company.planPrice === null || new Prisma.Decimal(company.planPrice).lte(0)) return false;
  return !(company.trialEndsAt && company.trialEndsAt >= periodStart);
}
