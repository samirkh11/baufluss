import { DocumentStatus, PaymentTarget } from '@prisma/client';
import { summarizePayments } from './payment-status';

const today = new Date('2026-10-11');
const base = {
  status: DocumentStatus.SENT,
  grossTotal: 1190,
  retentionAmount: null,
  dueDate: new Date('2026-10-25'),
  retentionDueDate: null,
  payments: [] as { target: PaymentTarget; amount: number }[],
  today,
};

describe('summarizePayments', () => {
  it('is unpaid before the due date', () => {
    const result = summarizePayments(base);
    expect(result.status).toBe('UNPAID');
    expect(result.open.toString()).toBe('1190');
    expect(result.overdueDays).toBe(0);
  });

  it('is overdue after the due date and counts the days', () => {
    const result = summarizePayments({ ...base, dueDate: new Date('2026-10-04') });
    expect(result.status).toBe('OVERDUE');
    expect(result.overdueDays).toBe(7);
  });

  it('is partially paid after a partial payment', () => {
    const result = summarizePayments({ ...base, payments: [{ target: PaymentTarget.INVOICE, amount: 500 }] });
    expect(result.status).toBe('PARTIALLY_PAID');
    expect(result.paid.toString()).toBe('500');
    expect(result.open.toString()).toBe('690');
  });

  it('stays overdue (not partially paid) when the rest is still late', () => {
    const result = summarizePayments({ ...base, dueDate: new Date('2026-10-04'), payments: [{ target: PaymentTarget.INVOICE, amount: 500 }] });
    expect(result.status).toBe('OVERDUE');
  });

  it('is paid when the payments cover the payable amount, also over several payments', () => {
    const result = summarizePayments({
      ...base,
      payments: [
        { target: PaymentTarget.INVOICE, amount: 700 },
        { target: PaymentTarget.INVOICE, amount: 490 },
      ],
    });
    expect(result.status).toBe('PAID');
    expect(result.open.toString()).toBe('0');
  });

  it('treats the retention as a separate receivable', () => {
    const input = { ...base, grossTotal: 1000, retentionAmount: 50, retentionDueDate: new Date('2031-10-12') };
    const unpaid = summarizePayments(input);
    expect(unpaid.payable.toString()).toBe('950');
    expect(unpaid.retentionOpen.toString()).toBe('50');

    const paid = summarizePayments({ ...input, payments: [{ target: PaymentTarget.INVOICE, amount: 950 }] });
    expect(paid.status).toBe('PAID'); // the invoice is settled, only the retention is still open
    expect(paid.retentionOpen.toString()).toBe('50');
    expect(paid.retentionOverdueDays).toBe(0);

    const late = summarizePayments({ ...input, retentionDueDate: new Date('2026-09-11'), payments: [{ target: PaymentTarget.INVOICE, amount: 950 }] });
    expect(late.retentionOverdueDays).toBe(30);
  });

  it('keeps cancelled invoices out of the open items', () => {
    expect(summarizePayments({ ...base, status: DocumentStatus.CANCELLED }).status).toBe('CANCELLED');
  });
});

import { summarizeRefund } from './payment-status';

describe('summarizeRefund', () => {
  it('owes the customer what was paid on the cancelled invoice, minus refunds already made', () => {
    expect(summarizeRefund(1190, 0).open.toString()).toBe('1190');
    expect(summarizeRefund(1190, 500).open.toString()).toBe('690');
    expect(summarizeRefund(0, 0).open.toString()).toBe('0');
  });
});
