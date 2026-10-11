import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { billingPeriod, invoiceAmounts, isBillableIn, platformInvoiceNumber } from './billing-calc';
import { PlanDto, UpdatePlatformSettingsDto } from './dto/platform.dto';
import { PlatformUser } from './platform-auth';
import { PlatformAuditService } from './platform-audit.service';

// Plans, operator settings and the invoices the operator sends to its customers.
@Injectable()
export class PlatformBillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: PlatformAuditService,
  ) {}

  // ---- settings
  async getSettings() {
    return (await this.prisma.platformSettings.findUnique({ where: { id: 1 } })) ?? this.prisma.platformSettings.create({ data: { id: 1 } });
  }
  async updateSettings(admin: PlatformUser, dto: UpdatePlatformSettingsDto) {
    const settings = await this.prisma.platformSettings.upsert({ where: { id: 1 }, create: { id: 1, ...dto }, update: dto });
    await this.audit.log(admin, 'SETTINGS_UPDATE', null, dto);
    return settings;
  }

  // ---- plans
  listPlans() {
    return this.prisma.plan.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { companies: true } } } });
  }
  async savePlan(admin: PlatformUser, id: string | null, dto: PlanDto) {
    try {
      const plan = id
        ? await this.prisma.plan.update({ where: { id }, data: { ...dto, key: undefined } }) // the key is permanent
        : await this.prisma.plan.create({ data: { key: dto.key ?? '', name: dto.name ?? '', description: dto.description, priceMonthly: dto.priceMonthly ?? 0, maxUsers: dto.maxUsers ?? null, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0 } });
      await this.audit.log(admin, id ? 'PLAN_UPDATE' : 'PLAN_CREATE', null, { plan: plan.key, ...dto });
      return plan;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('Dieser Tarif-Schlüssel existiert bereits.');
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') throw new NotFoundException('Tarif nicht gefunden.');
      throw error;
    }
  }

  // ---- invoices
  async listInvoices(query: { status?: string; companyId?: string }) {
    const where: Prisma.PlatformInvoiceWhereInput = {};
    if (query.status) where.status = query.status as never;
    if (query.companyId) where.companyId = query.companyId;
    const invoices = await this.prisma.platformInvoice.findMany({ where, orderBy: [{ periodStart: 'desc' }, { number: 'desc' }], include: { company: { select: { name: true } } } });
    const today = new Date();
    return invoices.map((invoice) => ({ ...invoice, overdue: invoice.status === 'OPEN' && invoice.dueDate < today }));
  }

  // Creates the invoices of one billing month for every billable company (idempotent per company and month).
  async runInvoices(admin: PlatformUser, month: string) {
    const period = billingPeriod(month);
    const settings = await this.getSettings();
    const companies = await this.prisma.company.findMany({
      where: { status: CompanyStatus.ACTIVE, planId: { not: null }, createdAt: { lte: new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate(), 23, 59, 59)) } },
      include: { plan: true, _count: { select: { users: { where: { isActive: true } } } } },
    });
    const created: string[] = [];
    let skipped = 0;
    for (const company of companies) {
      if (!company.plan || !isBillableIn({ status: company.status, trialEndsAt: company.trialEndsAt, planPrice: company.plan.priceMonthly }, period.start)) {
        skipped += 1;
        continue;
      }
      if (await this.prisma.platformInvoice.findUnique({ where: { companyId_periodStart: { companyId: company.id, periodStart: period.start } } })) {
        skipped += 1;
        continue;
      }
      const amounts = invoiceAmounts(company.plan.priceMonthly, settings.vatRate);
      const number = await this.nextNumber(period.start.getUTCFullYear());
      await this.prisma.platformInvoice.create({
        data: {
          number, companyId: company.id, periodStart: period.start, periodEnd: period.end, planName: company.plan.name,
          description: `Meisterwerk ${company.plan.name} – ${period.label} (${company._count.users} aktive Nutzer)`,
          ...amounts, dueDate: new Date(Date.now() + settings.paymentTermDays * 86400000),
        },
      });
      created.push(number);
    }
    await this.audit.log(admin, 'INVOICE_RUN', null, { month, created: created.length, skipped });
    return { month, created, skipped };
  }

  // Sequential per year. The unique constraint on the number makes concurrent runs fail instead of duplicating.
  private async nextNumber(year: number): Promise<string> {
    const last = await this.prisma.platformInvoice.findFirst({ where: { number: { startsWith: `PR-${year}-` } }, orderBy: { number: 'desc' }, select: { number: true } });
    return platformInvoiceNumber(year, last ? parseInt(last.number.split('-')[2], 10) + 1 : 1);
  }

  async markPaid(admin: PlatformUser, id: string, paidAt?: string) {
    const invoice = await this.getInvoice(id);
    if (invoice.status !== 'OPEN') throw new ConflictException('Nur offene Rechnungen können als bezahlt markiert werden.');
    const updated = await this.prisma.platformInvoice.update({ where: { id }, data: { status: 'PAID', paidAt: paidAt ? new Date(paidAt) : new Date() } });
    await this.audit.log(admin, 'INVOICE_PAID', { id: invoice.companyId, name: invoice.company.name }, { number: invoice.number });
    return updated;
  }

  async voidInvoice(admin: PlatformUser, id: string) {
    const invoice = await this.getInvoice(id);
    if (invoice.status !== 'OPEN') throw new ConflictException('Nur offene Rechnungen können storniert werden.');
    const updated = await this.prisma.platformInvoice.update({ where: { id }, data: { status: 'VOID' } });
    await this.audit.log(admin, 'INVOICE_VOID', { id: invoice.companyId, name: invoice.company.name }, { number: invoice.number });
    return updated;
  }

  async getInvoice(id: string) {
    const invoice = await this.prisma.platformInvoice.findUnique({ where: { id }, include: { company: true } });
    if (!invoice) throw new NotFoundException('Rechnung nicht gefunden.');
    return invoice;
  }
}
