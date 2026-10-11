import { DocumentItemKind, Prisma } from '@prisma/client';
import { calculateTotals } from '../documents/calculations';
import { csvLine } from './csv';

// DATEV "Buchungsstapel" export (format category 21, version 700 header / format version 12).
// Pure functions: the bookings are derived from plain input so they can be unit tested. The export is a
// draft for the tax advisor: it books gross amounts per VAT rate against revenue/expense accounts and
// does not replace the advisor's own accounting (discounts, advance payments, asset purchases ...).

const D = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

export interface DatevAccounts {
  revenue19: number;
  revenue7: number;
  revenueExempt: number; // 0 % and § 13b
  expense19: number;
  expense7: number;
  expenseNoVat: number;
  bank: number;
  debtorBase: number;
  creditorBase: number;
}

export interface DatevInvoice {
  number: string;
  isCreditNote: boolean;
  date: Date;
  contactNumber: string | null;
  contactName: string;
  reverseCharge: boolean;
  items: { kind: DocumentItemKind; quantity: Prisma.Decimal.Value; unitPrice: Prisma.Decimal.Value; vatRate: Prisma.Decimal.Value; discountPercent: Prisma.Decimal.Value; isOptional: boolean }[];
}
export interface DatevPayment {
  documentNumber: string;
  isCreditNote: boolean; // a refund of a credit note: money goes out
  date: Date;
  amount: Prisma.Decimal.Value;
  contactNumber: string | null;
}
export interface DatevIncoming {
  number: string; // internal ER number
  invoiceNumber: string | null;
  date: Date;
  supplierNumber: string | null;
  supplierName: string;
  net: Prisma.Decimal.Value;
  vat: Prisma.Decimal.Value;
  gross: Prisma.Decimal.Value;
  paidAt: Date | null;
}

export interface Booking {
  amount: Prisma.Decimal; // always positive
  side: 'S' | 'H';
  account: number;
  counterAccount: number;
  date: Date;
  reference: string; // Belegfeld 1
  text: string;
}

// Personenkonto from the contact number: "K-1001" -> base + 1001. Contacts without a usable number get
// a stable fallback from their position, so every contact has one account.
export function personAccount(base: number, contactNumber: string | null, fallbackIndex: number): number {
  const digits = (contactNumber ?? '').replace(/\D/g, '');
  const parsed = digits ? parseInt(digits, 10) : NaN;
  return base + (Number.isFinite(parsed) && parsed < 9999 ? parsed : 9000 + fallbackIndex);
}

export function revenueAccount(rate: Prisma.Decimal, reverseCharge: boolean, accounts: DatevAccounts): number {
  if (reverseCharge || rate.lte(0)) return accounts.revenueExempt;
  return rate.lte(10) ? accounts.revenue7 : accounts.revenue19;
}

export function expenseAccount(net: Prisma.Decimal, vat: Prisma.Decimal, accounts: DatevAccounts): number {
  if (vat.lte(0) || net.lte(0)) return accounts.expenseNoVat;
  return vat.div(net).lte(0.1) ? accounts.expense7 : accounts.expense19;
}

export function buildBookings(
  input: { invoices: DatevInvoice[]; payments: DatevPayment[]; incoming: DatevIncoming[]; debtor: (contactNumber: string | null, name: string) => number; creditor: (contactNumber: string | null, name: string) => number },
  accounts: DatevAccounts,
): Booking[] {
  const bookings: Booking[] = [];

  for (const invoice of input.invoices) {
    const debtor = input.debtor(invoice.contactNumber, invoice.contactName);
    // one booking per VAT rate: debtor / revenue account, gross amount
    const totals = calculateTotals(invoice.items.map((item) => ({ ...item, kind: item.kind })));
    for (const group of totals.vatGroups) {
      const gross = group.net.plus(group.vat);
      if (gross.isZero()) continue;
      bookings.push({
        amount: gross.abs(),
        // the stored amounts are signed: positive = debit the debtor, negative (credit note) = credit him
        side: gross.isNegative() ? 'H' : 'S',
        account: debtor,
        counterAccount: revenueAccount(group.vatRate, invoice.reverseCharge, accounts),
        date: invoice.date,
        reference: invoice.number,
        text: `${invoice.isCreditNote ? 'Gutschrift' : 'Rechnung'} ${invoice.contactName}`.slice(0, 60),
      });
    }
  }

  for (const payment of input.payments) {
    const debtor = input.debtor(payment.contactNumber, '');
    const amount = D(payment.amount).abs();
    bookings.push(
      payment.isCreditNote
        ? { amount, side: 'S', account: debtor, counterAccount: accounts.bank, date: payment.date, reference: payment.documentNumber, text: `Erstattung ${payment.documentNumber}` }
        : { amount, side: 'S', account: accounts.bank, counterAccount: debtor, date: payment.date, reference: payment.documentNumber, text: `Zahlung ${payment.documentNumber}` },
    );
  }

  for (const invoice of input.incoming) {
    const creditor = input.creditor(invoice.supplierNumber, invoice.supplierName);
    const net = D(invoice.net);
    const vat = D(invoice.vat);
    bookings.push({
      amount: D(invoice.gross),
      side: 'S',
      account: expenseAccount(net, vat, accounts),
      counterAccount: creditor,
      date: invoice.date,
      reference: (invoice.invoiceNumber ?? invoice.number).slice(0, 36),
      text: `ER ${invoice.supplierName}`.slice(0, 60),
    });
    if (invoice.paidAt) {
      bookings.push({
        amount: D(invoice.gross),
        side: 'S',
        account: creditor,
        counterAccount: accounts.bank,
        date: invoice.paidAt,
        reference: (invoice.invoiceNumber ?? invoice.number).slice(0, 36),
        text: `Zahlung ${invoice.supplierName}`.slice(0, 60),
      });
    }
  }
  return bookings.sort((a, b) => a.date.getTime() - b.date.getTime());
}

const ddmm = (date: Date) => {
  const iso = date.toISOString().slice(0, 10);
  return iso.slice(8, 10) + iso.slice(5, 7);
};
const yyyymmdd = (date: Date) => date.toISOString().slice(0, 10).replace(/-/g, '');

const COLUMNS = [
  'Umsatz (ohne Soll/Haben-Kz)', 'Soll/Haben-Kennzeichen', 'WKZ Umsatz', 'Kurs', 'Basis-Umsatz', 'WKZ Basis-Umsatz',
  'Konto', 'Gegenkonto (ohne BU-Schlüssel)', 'BU-Schlüssel', 'Belegdatum', 'Belegfeld 1', 'Belegfeld 2', 'Skonto', 'Buchungstext',
];

// Whole file as text (convert with toWindows1252 before sending). Header line, column line, one line per booking.
export function datevFile(
  bookings: Booking[],
  meta: { advisor: number | null; client: number | null; from: Date; to: Date; label: string; now: Date },
): string {
  const quote = (value: string) => `"${value}"`;
  const stamp = meta.now.toISOString().replace(/[-:T]/g, '').slice(0, 14) + '000';
  const header = [
    quote('EXTF'), 700, 21, quote('Buchungsstapel'), 12, stamp, '', quote('RE'), quote(''), quote(''),
    meta.advisor ?? '', meta.client ?? '', yyyymmdd(new Date(Date.UTC(meta.from.getUTCFullYear(), 0, 1))), 4,
    yyyymmdd(meta.from), yyyymmdd(meta.to), quote(meta.label.slice(0, 30)), '', 1, 0, 0, quote('EUR'), '', '', '', '', quote(''), quote(''), '', '',
  ].join(';');
  const lines = bookings.map((booking) =>
    csvLine([
      booking.amount.toFixed(2).replace('.', ','), booking.side, 'EUR', '', '', '', booking.account, booking.counterAccount, '',
      ddmm(booking.date), booking.reference, '', '', booking.text,
    ]),
  );
  return [header, COLUMNS.map(quote).join(';'), ...lines].join('\r\n') + '\r\n';
}

// DATEV expects Windows-1252; characters outside Latin-1 (e.g. €) are replaced.
export function toWindows1252(text: string): Buffer {
  return Buffer.from(text.replace(/€/g, 'EUR'), 'latin1');
}
