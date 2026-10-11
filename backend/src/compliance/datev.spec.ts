import { DocumentItemKind, Prisma } from '@prisma/client';
import { Booking, buildBookings, datevFile, DatevAccounts, expenseAccount, personAccount, revenueAccount, toWindows1252 } from './datev';

const accounts: DatevAccounts = { revenue19: 8400, revenue7: 8300, revenueExempt: 8337, expense19: 3400, expense7: 3300, expenseNoVat: 3200, bank: 1200, debtorBase: 10000, creditorBase: 70000 };
const D = (n: number | string) => new Prisma.Decimal(n);
const item = (price: number, rate: number, quantity = 1) => ({ kind: DocumentItemKind.POSITION, quantity, unitPrice: price, vatRate: rate, discountPercent: 0, isOptional: false });
const lookups = { debtor: (n: string | null) => personAccount(10000, n, 1), creditor: (n: string | null) => personAccount(70000, n, 1) };

describe('personAccount', () => {
  it('derives the account from the contact number', () => {
    expect(personAccount(10000, 'K-1001', 5)).toBe(11001);
    expect(personAccount(70000, 'L-2002', 5)).toBe(72002);
  });
  it('falls back to a stable account for missing numbers', () => {
    expect(personAccount(10000, null, 3)).toBe(19003);
  });
});

describe('account selection', () => {
  it('maps rates to revenue accounts', () => {
    expect(revenueAccount(D(19), false, accounts)).toBe(8400);
    expect(revenueAccount(D(7), false, accounts)).toBe(8300);
    expect(revenueAccount(D(0), false, accounts)).toBe(8337);
    expect(revenueAccount(D(19), true, accounts)).toBe(8337);
  });
  it('infers the expense account from VAT/net', () => {
    expect(expenseAccount(D(1000), D(190), accounts)).toBe(3400);
    expect(expenseAccount(D(1000), D(70), accounts)).toBe(3300);
    expect(expenseAccount(D(1000), D(0), accounts)).toBe(3200);
  });
});

describe('buildBookings', () => {
  const date = new Date('2026-10-05');
  it('books an invoice per VAT rate, gross amounts, debit debtor', () => {
    const bookings = buildBookings({ ...lookups, payments: [], incoming: [], invoices: [{ number: 'RE-1', isCreditNote: false, date, contactNumber: 'K-1001', contactName: 'Kunde', reverseCharge: false, items: [item(100, 19), item(100, 7)] }] }, accounts);
    expect(bookings).toHaveLength(2);
    expect(bookings.map((b) => [b.amount.toFixed(2), b.side, b.account, b.counterAccount])).toEqual([
      ['119.00', 'S', 11001, 8400],
      ['107.00', 'S', 11001, 8300],
    ]);
  });

  it('books a credit note on the credit side (stored with negative quantities)', () => {
    const [booking] = buildBookings({ ...lookups, payments: [], incoming: [], invoices: [{ number: 'GS-1', isCreditNote: true, date, contactNumber: 'K-1001', contactName: 'Kunde', reverseCharge: false, items: [item(100, 19, -1)] }] }, accounts);
    expect(booking.side).toBe('H');
    expect(booking.amount.toFixed(2)).toBe('119.00');
  });

  it('books payments bank / debtor and refunds the other way round', () => {
    const bookings = buildBookings({ ...lookups, invoices: [], incoming: [], payments: [{ documentNumber: 'RE-1', isCreditNote: false, date, amount: 50, contactNumber: 'K-1001' }, { documentNumber: 'GS-1', isCreditNote: true, date, amount: 20, contactNumber: 'K-1001' }] }, accounts);
    expect([bookings[0].account, bookings[0].counterAccount]).toEqual([1200, 11001]);
    expect([bookings[1].account, bookings[1].counterAccount]).toEqual([11001, 1200]);
  });

  it('books incoming invoices to expense / creditor and their payment', () => {
    const bookings = buildBookings({ ...lookups, invoices: [], payments: [], incoming: [{ number: 'ER-1', invoiceNumber: 'T-9', date, supplierNumber: 'L-2002', supplierName: 'Tondach', net: 1000, vat: 190, gross: 1190, paidAt: new Date('2026-10-20') }] }, accounts);
    expect(bookings).toHaveLength(2);
    expect([bookings[0].account, bookings[0].counterAccount, bookings[0].amount.toFixed(2)]).toEqual([3400, 72002, '1190.00']);
    expect([bookings[1].account, bookings[1].counterAccount]).toEqual([72002, 1200]);
  });
});

describe('datevFile', () => {
  it('writes header, column line and one line per booking in DATEV notation', () => {
    const booking: Booking = { amount: D(1190), side: 'S', account: 11001, counterAccount: 8400, date: new Date('2026-10-05'), reference: 'RE-1', text: 'Rechnung' };
    const text = datevFile([booking], { advisor: 1234, client: 56789, from: new Date('2026-01-01'), to: new Date('2026-12-31'), label: 'Meisterwerk', now: new Date('2026-10-11T14:30:00Z') });
    const lines = text.trim().split('\r\n');
    expect(lines[0].startsWith('"EXTF";700;21;"Buchungsstapel";12;20261011143000000')).toBe(true);
    expect(lines[0]).toContain(';1234;56789;20260101;4;20260101;20261231;');
    expect(lines[1].startsWith('"Umsatz (ohne Soll/Haben-Kz)";"Soll/Haben-Kennzeichen"')).toBe(true);
    expect(lines[2]).toBe('1190,00;S;EUR;;;;11001;8400;;0510;RE-1;;;Rechnung');
  });

  it('encodes umlauts as Windows-1252 and replaces the euro sign', () => {
    expect(toWindows1252('Müller €')).toEqual(Buffer.from([0x4d, 0xfc, 0x6c, 0x6c, 0x65, 0x72, 0x20, 0x45, 0x55, 0x52]));
  });
});
