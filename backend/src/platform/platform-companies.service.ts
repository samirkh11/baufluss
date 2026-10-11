import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRole, CompanyStatus, Prisma } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuditService } from '../compliance/audit.service';
import { PlatformUser } from './platform-auth';
import { PlatformAuditService } from './platform-audit.service';
import { ImpersonateDto, ListCompaniesQueryDto, UpdateCompanyDto } from './dto/platform.dto';

// Tenant management for the operator: look at customers, change status/plan/trial, support access.
@Injectable()
export class PlatformCompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly platformAudit: PlatformAuditService,
    private readonly companyAudit: AuditService,
  ) {}

  async list(query: ListCompaniesQueryDto) {
    const where: Prisma.CompanyWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.q?.trim()) where.OR = [{ name: { contains: query.q.trim(), mode: 'insensitive' } }, { email: { contains: query.q.trim(), mode: 'insensitive' } }, { city: { contains: query.q.trim(), mode: 'insensitive' } }];
    const companies = await this.prisma.company.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, name: true, priceMonthly: true } }, _count: { select: { users: true, documents: true, projects: true } } },
    });
    const activity = await this.prisma.auditLog.groupBy({ by: ['companyId'], _max: { createdAt: true }, where: { companyId: { in: companies.map((c) => c.id) } } });
    const openInvoices = await this.prisma.platformInvoice.groupBy({ by: ['companyId'], where: { status: 'OPEN' }, _sum: { gross: true }, _count: true });
    return companies.map((company) => ({
      id: company.id,
      name: company.name,
      city: company.city,
      email: company.email,
      status: company.status,
      statusReason: company.statusReason,
      trialEndsAt: company.trialEndsAt,
      plan: company.plan,
      createdAt: company.createdAt,
      users: company._count.users,
      documents: company._count.documents,
      projects: company._count.projects,
      lastActivity: activity.find((entry) => entry.companyId === company.id)?._max.createdAt ?? null,
      openInvoiceAmount: (openInvoices.find((entry) => entry.companyId === company.id)?._sum.gross ?? new Prisma.Decimal(0)).toFixed(2),
    }));
  }

  async detail(id: string) {
    const company = await this.prisma.company.findUnique({
      where: { id },
      include: {
        plan: true,
        users: { select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true }, orderBy: [{ role: 'asc' }, { lastName: 'asc' }] },
        _count: { select: { documents: true, projects: true, contacts: true, incomingInvoices: true, timeEntries: true, reports: true } },
        platformInvoices: { orderBy: { periodStart: 'desc' }, take: 12 },
      },
    });
    if (!company) throw new NotFoundException('Mandant nicht gefunden.');
    const lastActivity = await this.prisma.auditLog.aggregate({ where: { companyId: id }, _max: { createdAt: true } });
    return { ...company, lastActivity: lastActivity._max.createdAt };
  }

  async update(admin: PlatformUser, id: string, dto: UpdateCompanyDto) {
    const company = await this.prisma.company.findUnique({ where: { id } });
    if (!company) throw new NotFoundException('Mandant nicht gefunden.');
    if (dto.planId) {
      const plan = await this.prisma.plan.findUnique({ where: { id: dto.planId } });
      if (!plan) throw new BadRequestException('Tarif nicht gefunden.');
      if (!plan.isActive && plan.id !== company.planId) throw new BadRequestException('Dieser Tarif ist nicht mehr buchbar.');
    }
    const data: Prisma.CompanyUncheckedUpdateInput = {};
    if (dto.status) {
      data.status = dto.status;
      // the reason only makes sense for locked accounts
      data.statusReason = dto.status === CompanyStatus.SUSPENDED || dto.status === CompanyStatus.CANCELLED ? dto.statusReason ?? null : null;
    }
    if (dto.trialEndsAt) data.trialEndsAt = new Date(dto.trialEndsAt);
    if (dto.planId) data.planId = dto.planId;
    if (dto.operatorNotes !== undefined) data.operatorNotes = dto.operatorNotes;
    await this.prisma.company.update({ where: { id }, data });
    await this.platformAudit.log(admin, dto.status && dto.status !== company.status ? `COMPANY_${dto.status}` : 'COMPANY_UPDATE', company, { from: { status: company.status, planId: company.planId, trialEndsAt: company.trialEndsAt }, change: dto });
    return this.detail(id);
  }

  // Logs the operator in as a user of the company (default: an active owner) for support. The token is valid for one
  // hour, carries the operator's id, and everything done with it is marked as support access in the company's audit log.
  async impersonate(admin: PlatformUser, companyId: string, dto: ImpersonateDto) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Mandant nicht gefunden.');
    const user = dto.userId
      ? await this.prisma.user.findFirst({ where: { id: dto.userId, companyId, isActive: true } })
      : await this.prisma.user.findFirst({ where: { companyId, isActive: true, role: CompanyRole.OWNER }, orderBy: { createdAt: 'asc' } });
    if (!user) throw new BadRequestException('Kein aktiver Nutzer gefunden.');
    await this.platformAudit.log(admin, 'IMPERSONATE', company, { userId: user.id, email: user.email });
    await this.companyAudit.log(
      { id: user.id, companyId, impersonatedBy: { id: admin.id, name: admin.name } },
      { method: 'POST', route: '/admin/impersonate', entityType: 'support', entityLabel: 'Support-Zugriff gestartet' },
    );
    const accessToken = this.jwt.sign({ sub: user.id, companyId, role: user.role, imp: admin.id }, { expiresIn: '1h' });
    return {
      accessToken,
      user: { id: user.id, companyId, role: user.role, email: user.email, firstName: user.firstName, lastName: user.lastName, impersonatedBy: admin.name },
    };
  }
}
