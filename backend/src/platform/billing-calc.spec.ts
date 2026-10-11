import { billingPeriod, invoiceAmounts, isBillableIn, platformInvoiceNumber } from './billing-calc';

describe('billing-calc', () => {
  it('computes the period and label of a month', () => {
    const period = billingPeriod('2026-02');
    expect(period.start.toISOString().slice(0, 10)).toBe('2026-02-01');
    expect(period.end.toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(period.label).toBe('Februar 2026');
    expect(billingPeriod('2028-02').end.toISOString().slice(0, 10)).toBe('2028-02-29');
  });

  it('adds VAT with commercial rounding', () => {
    expect(invoiceAmounts(79, 19)).toMatchObject({ net: expect.anything(), vat: expect.anything(), gross: expect.anything() });
    const amounts = invoiceAmounts(79, 19);
    expect([amounts.net.toFixed(2), amounts.vat.toFixed(2), amounts.gross.toFixed(2)]).toEqual(['79.00', '15.01', '94.01']);
    expect(invoiceAmounts('29.99', 19).vat.toFixed(2)).toBe('5.70');
  });

  it('formats invoice numbers', () => {
    expect(platformInvoiceNumber(2026, 7)).toBe('PR-2026-0007');
  });

  it('bills only active companies with a priced plan whose trial is over', () => {
    const october = new Date('2026-10-01');
    expect(isBillableIn({ status: 'ACTIVE', trialEndsAt: null, planPrice: 79 }, october)).toBe(true);
    expect(isBillableIn({ status: 'TRIAL', trialEndsAt: null, planPrice: 79 }, october)).toBe(false);
    expect(isBillableIn({ status: 'ACTIVE', trialEndsAt: null, planPrice: 0 }, october)).toBe(false);
    expect(isBillableIn({ status: 'ACTIVE', trialEndsAt: null, planPrice: null }, october)).toBe(false);
    expect(isBillableIn({ status: 'ACTIVE', trialEndsAt: new Date('2026-10-20'), planPrice: 79 }, october)).toBe(false);
    expect(isBillableIn({ status: 'ACTIVE', trialEndsAt: new Date('2026-09-20'), planPrice: 79 }, october)).toBe(true);
  });
});
