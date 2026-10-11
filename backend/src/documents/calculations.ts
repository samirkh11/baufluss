import { DocumentItemKind, Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;

// Money is rounded commercially (half up) to cents at the line level and per VAT rate.
const ROUND = Decimal.ROUND_HALF_UP;

export interface CalcItem {
  kind: DocumentItemKind;
  quantity: Prisma.Decimal.Value;
  unitPrice: Prisma.Decimal.Value;
  vatRate: Prisma.Decimal.Value;
  discountPercent: Prisma.Decimal.Value;
  isOptional: boolean;
}

export interface VatGroup {
  vatRate: Decimal;
  net: Decimal;
  vat: Decimal;
}

export interface DocumentTotals {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
  vatGroups: VatGroup[];
}

// Net amount of one line: quantity * unit price * (1 - discount), rounded to cents.
// Headings and text lines carry no amount.
export function lineTotal(item: CalcItem): Decimal {
  if (item.kind !== DocumentItemKind.POSITION) {
    return new Decimal(0);
  }
  const factor = new Decimal(100).minus(item.discountPercent).div(100);
  return new Decimal(item.quantity).mul(item.unitPrice).mul(factor).toDecimalPlaces(2, ROUND);
}

// Totals over all non-optional positions. VAT is calculated per rate on the summed net (not per
// line), as required on German invoices, so rounding differences stay minimal.
export function calculateTotals(items: CalcItem[]): DocumentTotals {
  const netByRate = new Map<string, { vatRate: Decimal; net: Decimal }>();

  for (const item of items) {
    if (item.kind !== DocumentItemKind.POSITION || item.isOptional) {
      continue;
    }
    const rate = new Decimal(item.vatRate);
    const key = rate.toFixed(2);
    const group = netByRate.get(key) ?? { vatRate: rate, net: new Decimal(0) };
    group.net = group.net.plus(lineTotal(item));
    netByRate.set(key, group);
  }

  const vatGroups: VatGroup[] = [...netByRate.values()]
    .sort((a, b) => b.vatRate.comparedTo(a.vatRate))
    .map((group) => ({ ...group, vat: group.net.mul(group.vatRate).div(100).toDecimalPlaces(2, ROUND) }));

  const net = vatGroups.reduce((sum, group) => sum.plus(group.net), new Decimal(0));
  const vat = vatGroups.reduce((sum, group) => sum.plus(group.vat), new Decimal(0));
  return { net, vat, gross: net.plus(vat), vatGroups };
}

// Display numbers ("Ordnungszahlen"): headings are 1, 2, ...; positions below a heading are 1.1,
// 1.2, ...; positions before the first heading are plain 1, 2, ... Text lines have none.
export function buildOrdinals(kinds: DocumentItemKind[]): (string | null)[] {
  let heading = 0;
  let position = 0;
  return kinds.map((kind) => {
    if (kind === DocumentItemKind.HEADING) {
      heading++;
      position = 0;
      return String(heading);
    }
    if (kind === DocumentItemKind.POSITION) {
      position++;
      return heading > 0 ? `${heading}.${position}` : String(position);
    }
    return null;
  });
}
