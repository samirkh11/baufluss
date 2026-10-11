import { Prisma } from '@prisma/client';
import { amountFromPercent, splitPartialAmount } from './partial-invoice';

const D = (value: number) => new Prisma.Decimal(value);

describe('amountFromPercent', () => {
  it('computes a percentage of the contract net value', () => {
    expect(amountFromPercent(35551.2, 30).toString()).toBe('10665.36');
  });

  it('rounds half up to cents', () => {
    expect(amountFromPercent(100.05, 10).toString()).toBe('10.01'); // 10.005
  });
});

describe('splitPartialAmount', () => {
  it('keeps a single VAT rate as it is', () => {
    const result = splitPartialAmount([{ vatRate: D(19), net: D(1000) }], 300);
    expect(result.map((part) => [part.vatRate.toString(), part.net.toString()])).toEqual([['19', '300']]);
  });

  it('splits proportionally over several VAT rates', () => {
    const result = splitPartialAmount([{ vatRate: D(19), net: D(750) }, { vatRate: D(7), net: D(250) }], 400);
    expect(result.map((part) => part.net.toString())).toEqual(['300', '100']);
  });

  it('makes the parts add up exactly even when rounding would drift', () => {
    const groups = [{ vatRate: D(19), net: D(100) }, { vatRate: D(7), net: D(100) }, { vatRate: D(0), net: D(100) }];
    const result = splitPartialAmount(groups, 100);
    expect(result.reduce((sum, part) => sum.plus(part.net), D(0)).toString()).toBe('100');
    expect(result.map((part) => part.net.toString())).toEqual(['33.33', '33.33', '33.34']);
  });

  it('returns nothing for an empty contract', () => {
    expect(splitPartialAmount([], 100)).toEqual([]);
    expect(splitPartialAmount([{ vatRate: D(19), net: D(0) }], 100)).toEqual([]);
  });
});
