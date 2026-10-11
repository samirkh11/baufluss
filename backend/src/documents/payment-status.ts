import { DocumentStatus, PaymentTarget, Prisma } from '@prisma/client';

const { Decimal } = Prisma;
type Decimal = Prisma.Decimal;
type DecimalValue = Prisma.Decimal.Value;

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface PaymentSummaryInput {
  status: DocumentStatus;
  grossTotal: DecimalValue;
  retentionAmount?: DecimalValue | null;
  dueDate?: Date | null;
  retentionDueDate?: Date | null;
  payments: { target: PaymentTarget; amount: DecimalValue }[];
  today: Date; // date only (UTC midnight)
}

export interface PaymentSummary {
  payable: Decimal; // gross minus retention: what is due at the due date
  paid: Decimal;
  open: Decimal;
  retention: Decimal;
  retentionPaid: Decimal;
  retentionOpen: Decimal;
  status: PaymentStatus;
  overdueDays: number; // days past due (0 if not overdue)
  retentionOverdueDays: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const zero = () => new Decimal(0);
const sum = (values: DecimalValue[]) => values.reduce<Decimal>((total, value) => total.plus(value), zero());
const daysLate = (due: Date | null | undefined, today: Date) =>
  due && due.getTime() < today.getTime() ? Math.round((today.getTime() - due.getTime()) / DAY_MS) : 0;

// Payment state of an issued invoice. The retention is a separate receivable: the invoice counts as
// paid once the payable amount is settled, while the retention can stay open until its due date.
export function summarizePayments(input: PaymentSummaryInput): PaymentSummary {
  const gross = new Decimal(input.grossTotal);
  const retention = new Decimal(input.retentionAmount ?? 0);
  const payable = gross.minus(retention);
  const paid = sum(input.payments.filter((payment) => payment.target === PaymentTarget.INVOICE).map((payment) => payment.amount));
  const retentionPaid = sum(input.payments.filter((payment) => payment.target === PaymentTarget.RETENTION).map((payment) => payment.amount));
  const open = payable.minus(paid);
  const retentionOpen = retention.minus(retentionPaid);
  const overdueDays = open.gt(0) ? daysLate(input.dueDate, input.today) : 0;
  const retentionOverdueDays = retentionOpen.gt(0) ? daysLate(input.retentionDueDate, input.today) : 0;

  let status: PaymentStatus;
  if (input.status === DocumentStatus.CANCELLED) {
    status = 'CANCELLED';
  } else if (open.lte(0)) {
    status = 'PAID';
  } else if (overdueDays > 0) {
    status = 'OVERDUE';
  } else if (paid.gt(0)) {
    status = 'PARTIALLY_PAID';
  } else {
    status = 'UNPAID';
  }
  return { payable, paid, open, retention, retentionPaid, retentionOpen, status, overdueDays, retentionOverdueDays };
}

// A credit note (Storno) does not collect money: if the cancelled invoice had already been paid,
// the customer is owed a refund. `refundDue` is what was paid on the invoice, `open` what is still
// to be paid back.
export function summarizeRefund(paidOnInvoice: DecimalValue, refunded: DecimalValue) {
  const refundDue = new Decimal(paidOnInvoice);
  const open = refundDue.minus(refunded);
  return { refundDue, refunded: new Decimal(refunded), open: open.lt(0) ? zero() : open };
}
