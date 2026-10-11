import { DocumentItemKind } from '@prisma/client';
import { buildOrdinals, calculateTotals, CalcItem, lineTotal } from './calculations';

const { POSITION, HEADING, TEXT } = DocumentItemKind;

function position(quantity: number, unitPrice: number, vatRate = 19, discountPercent = 0, isOptional = false): CalcItem {
  return { kind: POSITION, quantity, unitPrice, vatRate, discountPercent, isOptional };
}

describe('lineTotal', () => {
  it('multiplies quantity and unit price', () => {
    expect(lineTotal(position(320, 95)).toString()).toBe('30400');
  });

  it('applies the discount and rounds half up to cents', () => {
    // 3 * 1.45 = 4.35; minus 10 % = 3.915 -> 3.92
    expect(lineTotal(position(3, 1.45, 19, 10)).toString()).toBe('3.92');
  });

  it('handles fractional quantities', () => {
    expect(lineTotal(position(2.5, 68)).toString()).toBe('170');
  });

  it('is zero for headings and text lines', () => {
    const base = { quantity: 5, unitPrice: 10, vatRate: 19, discountPercent: 0, isOptional: false };
    expect(lineTotal({ ...base, kind: HEADING }).toString()).toBe('0');
    expect(lineTotal({ ...base, kind: TEXT }).toString()).toBe('0');
  });
});

describe('calculateTotals', () => {
  it('sums net, VAT and gross', () => {
    const totals = calculateTotals([position(10, 100), position(1, 50)]);
    expect(totals.net.toString()).toBe('1050');
    expect(totals.vat.toString()).toBe('199.5');
    expect(totals.gross.toString()).toBe('1249.5');
  });

  it('groups VAT by rate and rounds per group, not per line', () => {
    // 3 x 0.33 net at 19 %: per line 0.0627 -> 0.06 (=0.18) but per group 0.99 * 0.19 = 0.1881 -> 0.19
    const totals = calculateTotals([position(1, 0.33), position(1, 0.33), position(1, 0.33), position(1, 100, 7)]);
    expect(totals.vatGroups.map((g) => [g.vatRate.toString(), g.net.toString(), g.vat.toString()])).toEqual([
      ['19', '0.99', '0.19'],
      ['7', '100', '7'],
    ]);
    expect(totals.vat.toString()).toBe('7.19');
    expect(totals.gross.toString()).toBe('108.18');
  });

  it('excludes optional positions, headings and text from the totals', () => {
    const totals = calculateTotals([
      { kind: HEADING, quantity: 1, unitPrice: 999, vatRate: 19, discountPercent: 0, isOptional: false },
      position(1, 100),
      position(1, 500, 19, 0, true),
      { kind: TEXT, quantity: 1, unitPrice: 999, vatRate: 19, discountPercent: 0, isOptional: false },
    ]);
    expect(totals.net.toString()).toBe('100');
    expect(totals.gross.toString()).toBe('119');
  });

  it('returns zero totals for an empty document', () => {
    const totals = calculateTotals([]);
    expect(totals.gross.toString()).toBe('0');
    expect(totals.vatGroups).toEqual([]);
  });

  it('supports 0 % VAT (e.g. reverse charge)', () => {
    const totals = calculateTotals([position(1, 1000, 0)]);
    expect(totals.vat.toString()).toBe('0');
    expect(totals.gross.toString()).toBe('1000');
  });
});

describe('buildOrdinals', () => {
  it('numbers headings and positions hierarchically', () => {
    expect(buildOrdinals([HEADING, POSITION, POSITION, TEXT, HEADING, POSITION])).toEqual(['1', '1.1', '1.2', null, '2', '2.1']);
  });

  it('numbers positions without a heading plainly', () => {
    expect(buildOrdinals([POSITION, POSITION])).toEqual(['1', '2']);
  });
});
