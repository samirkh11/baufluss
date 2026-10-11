import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, DunningLevel, InvoiceKind, PaymentTarget, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../common/prisma/prisma.service';
import { localNow } from '../time-entries/time-utils';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { ListReceivablesQueryDto } from './dto/list-receivables-query.dto';
import { summarizePayments, summarizeRefund } from './payment-status';

// One line of the open-items list ("Offene Posten").
export type ReceivableKind = 'INVOICE' | 'RETENTION' | 'REFUND';

const todayUtc = () => new Date(localNow().date);
const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  // Records an incoming payment on an issued invoice (or a refund paid out on a credit note).
  // Amounts must not exceed what is still open, so over-payments can't be booked by accident.
  async create(actor: AuthenticatedUser, documentId: string, dto: CreatePaymentDto) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId: actor.companyId },
      include: { invoiceDetails: true, payments: true },
    });
    if (!document) {
      throw new NotFoundException();
    }
    if (document.type !== DocumentType.INVOICE && document.type !== DocumentType.CREDIT_NOTE) {
      throw new BadRequestException('Zahlungen gibt es nur bei Rechnungen und Stornorechnungen.');
    }
    if (document.status !== DocumentStatus.SENT) {
      throw new ConflictException(
        document.status === DocumentStatus.CANCELLED
          ? 'Die Rechnung ist storniert.'
          : 'Zahlungen können erst nach dem Ausstellen erfasst werden.',
      );
    }
    if (dto.paidAt.slice(0, 10) > localNow().date) {
      throw new BadRequestException('Das Zahlungsdatum liegt in der Zukunft.');
    }

    const target = dto.target ?? PaymentTarget.INVOICE;
    const amount = dec(dto.amount);
    let openAmount: Prisma.Decimal;

    if (document.type === DocumentType.CREDIT_NOTE) {
      if (target === PaymentTarget.RETENTION) {
        throw new BadRequestException('Bei einer Stornorechnung gibt es keinen Einbehalt.');
      }
      const original = document.sourceDocumentId
        ? await this.prisma.payment.findMany({ where: { documentId: document.sourceDocumentId } })
        : [];
      const paidOnInvoice = original.reduce((sum, payment) => sum.plus(payment.amount), dec(0));
      openAmount = summarizeRefund(
        paidOnInvoice,
        document.payments.reduce((sum, payment) => sum.plus(payment.amount), dec(0)),
      ).open;
    } else {
      const summary = summarizePayments({
        status: document.status,
        grossTotal: document.grossTotal,
        retentionAmount: document.invoiceDetails?.retentionAmount,
        payments: document.payments,
        today: todayUtc(),
      });
      if (target === PaymentTarget.RETENTION && summary.retention.lte(0)) {
        throw new BadRequestException('Diese Rechnung hat keinen Sicherheitseinbehalt.');
      }
      openAmount = target === PaymentTarget.RETENTION ? summary.retentionOpen : summary.open;
    }
    if (amount.gt(openAmount)) {
      throw new ConflictException('Die Zahlung übersteigt den offenen Betrag.');
    }

    return this.prisma.payment.create({
      data: {
        companyId: actor.companyId,
        documentId,
        target,
        paidAt: new Date(dto.paidAt.slice(0, 10)),
        amount,
        method: dto.method,
        reference: dto.reference,
        note: dto.note,
        createdById: actor.id,
      },
    });
  }

  // Corrects a wrongly booked payment.
  async remove(companyId: string, paymentId: string) {
    const payment = await this.prisma.payment.findFirst({ where: { id: paymentId, companyId } });
    if (!payment) {
      throw new NotFoundException();
    }
    await this.prisma.payment.delete({ where: { id: paymentId } });
  }

  // Open items: unpaid invoice amounts, retentions and refunds still owed to customers, sorted by due
  // date (oldest first), with the days overdue.
  async receivables(companyId: string, query: ListReceivablesQueryDto) {
    const today = todayUtc();
    const documents = await this.prisma.document.findMany({
      where: {
        companyId,
        status: DocumentStatus.SENT,
        type: { in: [DocumentType.INVOICE, DocumentType.CREDIT_NOTE] },
        ...(query.customerId ? { recipientContactId: query.customerId } : {}),
      },
      include: {
        invoiceDetails: true,
        payments: true,
        project: { select: { id: true, number: true, name: true } },
        sourceDocument: { select: { id: true, number: true, payments: true } },
      },
    });

    const items: {
      kind: ReceivableKind;
      documentId: string;
      documentType: DocumentType;
      number: string | null;
      invoiceKind: InvoiceKind | null;
      recipientName: string | null;
      project: { id: string; number: string; name: string };
      documentDate: Date;
      dueDate: Date | null;
      amount: Prisma.Decimal;
      open: Prisma.Decimal;
      overdueDays: number;
      // latest dunning level sent for the invoice, and whether dunning is paused
      dunningLevel: DunningLevel | null;
      dunningBlocked: boolean;
    }[] = [];

    // Latest dunning level per invoice, for the "Mahnstufe" column of the open-items list.
    const dunnings = await this.prisma.dunning.findMany({
      where: { companyId, documentId: { in: documents.map((document) => document.id) } },
      orderBy: { createdAt: 'asc' },
      select: { documentId: true, level: true },
    });
    const lastLevel = new Map(dunnings.map((dunning) => [dunning.documentId, dunning.level]));

    for (const document of documents) {
      const common = {
        dunningLevel: lastLevel.get(document.id) ?? null,
        dunningBlocked: document.invoiceDetails?.dunningBlocked ?? false,
        documentId: document.id,
        documentType: document.type,
        number: document.number,
        invoiceKind: document.invoiceDetails?.kind ?? null,
        recipientName: document.recipientName,
        project: document.project,
        documentDate: document.documentDate,
      };
      if (document.type === DocumentType.CREDIT_NOTE) {
        const paidOnInvoice = (document.sourceDocument?.payments ?? []).reduce(
          (sum, payment) => sum.plus(payment.amount),
          dec(0),
        );
        const refund = summarizeRefund(
          paidOnInvoice,
          document.payments.reduce((sum, payment) => sum.plus(payment.amount), dec(0)),
        );
        if (refund.open.gt(0)) {
          items.push({
            ...common,
            kind: 'REFUND',
            dueDate: null,
            amount: refund.refundDue,
            open: refund.open.negated(),
            overdueDays: 0,
          });
        }
        continue;
      }
      const summary = summarizePayments({
        status: document.status,
        grossTotal: document.grossTotal,
        retentionAmount: document.invoiceDetails?.retentionAmount,
        dueDate: document.invoiceDetails?.dueDate,
        retentionDueDate: document.invoiceDetails?.retentionDueDate,
        payments: document.payments,
        today,
      });
      if (summary.open.gt(0)) {
        items.push({
          ...common,
          kind: 'INVOICE',
          dueDate: document.invoiceDetails?.dueDate ?? null,
          amount: summary.payable,
          open: summary.open,
          overdueDays: summary.overdueDays,
        });
      }
      if (summary.retentionOpen.gt(0)) {
        items.push({
          ...common,
          kind: 'RETENTION',
          dueDate: document.invoiceDetails?.retentionDueDate ?? null,
          amount: summary.retention,
          open: summary.retentionOpen,
          overdueDays: summary.retentionOverdueDays,
        });
      }
    }

    const filtered = items.filter((item) => !query.overdueOnly || item.overdueDays > 0);
    filtered.sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));

    const sum = (list: typeof filtered) => list.reduce((total, item) => total.plus(item.open), dec(0));
    return {
      items: filtered,
      totals: {
        open: sum(filtered.filter((item) => item.kind !== 'REFUND')),
        overdue: sum(filtered.filter((item) => item.overdueDays > 0)),
        retention: sum(filtered.filter((item) => item.kind === 'RETENTION')),
        refunds: sum(filtered.filter((item) => item.kind === 'REFUND')),
      },
    };
  }
}
