import { Injectable } from '@nestjs/common';
import { DocumentStatus, DocumentType, IncomingInvoiceStatus, Prisma, TimeEntryStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { DocumentsService } from '../documents/documents.service';
import { DunningService } from '../documents/dunning.service';
import { PaymentsService } from '../documents/payments.service';
import { IncomingInvoicesService } from '../incoming-invoices/incoming-invoices.service';
import { DashboardItemDto } from './dto/dashboard.dto';

const dec = (value: Prisma.Decimal.Value) => new Prisma.Decimal(value);
const day = (date: Date) => date.toISOString().slice(0, 10);

// Monday of the week containing the date (UTC, dates are stored as plain days).
function weekStart(date: Date): Date {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  result.setUTCDate(result.getUTCDate() - ((result.getUTCDay() + 6) % 7));
  return result;
}

// Lean read models for the dashboard widgets. Each widget gets one small block, so the dashboard
// never loads raw lists. Money values are returned as decimal strings.
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly dunning: DunningService,
    private readonly documents: DocumentsService,
    private readonly incoming: IncomingInvoicesService,
  ) {}

  async getLayout(userId: string) {
    const layout = await this.prisma.dashboardLayout.findUnique({ where: { userId } });
    return { items: (layout?.items as unknown as DashboardItemDto[] | undefined) ?? null };
  }

  async saveLayout(userId: string, items: DashboardItemDto[]) {
    const data = items as unknown as Prisma.InputJsonValue;
    await this.prisma.dashboardLayout.upsert({ where: { userId }, create: { userId, items: data }, update: { items: data } });
    return { items };
  }

  async resetLayout(userId: string) {
    await this.prisma.dashboardLayout.deleteMany({ where: { userId } });
    return { items: null };
  }

  // Everything the office widgets show, in one request.
  async office(companyId: string) {
    const [receivables, dunning, incoming, quotes, unbilled, timeApprovals] = await Promise.all([
      this.payments.receivables(companyId, {}),
      this.dunning.proposals(companyId),
      this.incoming.findAll(companyId, {}),
      this.quotePipeline(companyId),
      this.unbilledOrders(companyId),
      this.timeApprovals(companyId),
    ]);
    const approvedInvoices = await this.prisma.incomingInvoice.findMany({
      where: { companyId, status: IncomingInvoiceStatus.APPROVED },
      select: { number: true, supplierName: true, supplier: { select: { organizationName: true } }, grossAmount: true, dueDate: true },
      orderBy: { dueDate: 'asc' },
    });

    const openItems = receivables.items.filter((item) => item.kind !== 'REFUND');
    return {
      openItems: {
        open: receivables.totals.open.toFixed(2),
        overdue: receivables.totals.overdue.toFixed(2),
        count: openItems.length,
        // most overdue first
        top: [...openItems]
          .sort((a, b) => b.overdueDays - a.overdueDays || b.open.comparedTo(a.open))
          .slice(0, 5)
          .map((item) => ({
            documentId: item.documentId,
            documentType: item.documentType,
            number: item.number,
            recipientName: item.recipientName,
            open: item.open.toFixed(2),
            overdueDays: item.overdueDays,
          })),
      },
      dunning: { count: dunning.totals.count, open: dunning.totals.open.toFixed(2) },
      incoming: {
        toReview: incoming.totals.RECEIVED ?? { count: 0, gross: '0.00' },
        toPay: incoming.totals.APPROVED ?? { count: 0, gross: '0.00' },
        nextDue: approvedInvoices.slice(0, 3).map((invoice) => ({
          number: invoice.number,
          supplier: invoice.supplier?.organizationName ?? invoice.supplierName,
          gross: invoice.grossAmount.toFixed(2),
          dueDate: invoice.dueDate ? day(invoice.dueDate) : null,
        })),
      },
      liquidity: this.liquidity(
        openItems.filter((item) => item.open.gt(0)).map((item) => ({ due: item.dueDate, amount: item.open })),
        approvedInvoices.map((invoice) => ({ due: invoice.dueDate, amount: invoice.grossAmount })),
      ),
      quotes,
      unbilledOrders: unbilled,
      timeApprovals,
    };
  }

  // Money expected in / due to be paid out per week: overdue items first, then the next 8 weeks.
  private liquidity(inflows: { due: Date | null; amount: Prisma.Decimal }[], outflows: { due: Date | null; amount: Prisma.Decimal }[]) {
    const first = weekStart(new Date());
    const weeks = Array.from({ length: 8 }, (_, index) => {
      const start = new Date(first);
      start.setUTCDate(start.getUTCDate() + index * 7);
      return { start, inflow: dec(0), outflow: dec(0) };
    });
    const overdue = { inflow: dec(0), outflow: dec(0) };
    const place = (due: Date | null, amount: Prisma.Decimal, key: 'inflow' | 'outflow') => {
      if (!due || due < first) {
        overdue[key] = overdue[key].plus(amount); // overdue or no due date = due now
        return;
      }
      const bucket = [...weeks].reverse().find((week) => week.start <= due);
      if (bucket && due < new Date(weeks[7].start.getTime() + 7 * 86400000)) {
        bucket[key] = bucket[key].plus(amount);
      }
    };
    inflows.forEach((entry) => place(entry.due, entry.amount, 'inflow'));
    outflows.forEach((entry) => place(entry.due, entry.amount, 'outflow'));
    const row = (label: string, bucket: { inflow: Prisma.Decimal; outflow: Prisma.Decimal }) => ({
      label,
      inflow: bucket.inflow.toFixed(2),
      outflow: bucket.outflow.toFixed(2),
      balance: bucket.inflow.minus(bucket.outflow).toFixed(2),
    });
    const rows = [row('overdue', overdue), ...weeks.map((week) => row(day(week.start), week))];
    const totalIn = rows.reduce((sum, r) => sum.plus(r.inflow), dec(0));
    const totalOut = rows.reduce((sum, r) => sum.plus(r.outflow), dec(0));
    return { rows, inflow: totalIn.toFixed(2), outflow: totalOut.toFixed(2), balance: totalIn.minus(totalOut).toFixed(2) };
  }

  private async quotePipeline(companyId: string) {
    const grouped = await this.prisma.document.groupBy({
      by: ['status'],
      where: { companyId, type: DocumentType.QUOTE, status: { in: [DocumentStatus.SENT, DocumentStatus.ACCEPTED, DocumentStatus.REJECTED] } },
      _sum: { grossTotal: true },
      _count: true,
    });
    const of = (status: DocumentStatus) => {
      const entry = grouped.find((g) => g.status === status);
      return { count: entry?._count ?? 0, gross: (entry?._sum.grossTotal ?? dec(0)).toFixed(2) };
    };
    const limit = new Date();
    limit.setUTCDate(limit.getUTCDate() - 14);
    const stale = await this.prisma.document.count({
      where: { companyId, type: DocumentType.QUOTE, status: DocumentStatus.SENT, documentDate: { lt: limit } },
    });
    const accepted = of(DocumentStatus.ACCEPTED);
    const rejected = of(DocumentStatus.REJECTED);
    const decided = accepted.count + rejected.count;
    return {
      open: of(DocumentStatus.SENT),
      accepted,
      rejected,
      staleOpen: stale,
      acceptanceRate: decided === 0 ? null : Math.round((accepted.count / decided) * 100),
    };
  }

  // Orders that are not fully invoiced yet, with the net amount still to bill.
  private async unbilledOrders(companyId: string) {
    const orders = await this.prisma.document.findMany({
      where: { companyId, type: DocumentType.ORDER, status: { in: [DocumentStatus.SENT, DocumentStatus.ACCEPTED] } },
      select: { id: true, number: true, project: { select: { number: true, name: true } } },
      orderBy: { documentDate: 'desc' },
      take: 50,
    });
    const rows = [];
    for (const order of orders) {
      const billing = await this.documents.billing(companyId, order.id);
      if (billing.openNet.gt(0.005)) {
        rows.push({
          id: order.id,
          number: order.number,
          project: order.project ? `${order.project.number} ${order.project.name}` : '',
          openNet: billing.openNet.toFixed(2),
          percentBilled: billing.percentBilled,
        });
      }
    }
    rows.sort((a, b) => Number(b.openNet) - Number(a.openNet));
    const total = rows.reduce((sum, row) => sum.plus(row.openNet), dec(0));
    return { count: rows.length, openNet: total.toFixed(2), top: rows.slice(0, 5) };
  }

  // Finished time entries of earlier weeks that the office has not approved yet.
  private async timeApprovals(companyId: string) {
    const entries = await this.prisma.timeEntry.groupBy({
      by: ['userId'],
      where: { companyId, status: TimeEntryStatus.OPEN, date: { lt: weekStart(new Date()) }, NOT: { startMinute: { not: null }, endMinute: null } },
      _sum: { durationMinutes: true },
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: entries.map((entry) => entry.userId) } },
      select: { id: true, firstName: true, lastName: true },
    });
    return {
      employees: entries.length,
      hours: Math.round((entries.reduce((sum, entry) => sum + (entry._sum.durationMinutes ?? 0), 0) / 60) * 10) / 10,
      list: entries
        .map((entry) => {
          const user = users.find((u) => u.id === entry.userId);
          return { name: user ? `${user.firstName} ${user.lastName}` : '', hours: Math.round(((entry._sum.durationMinutes ?? 0) / 60) * 10) / 10 };
        })
        .sort((a, b) => b.hours - a.hours)
        .slice(0, 5),
    };
  }
}
