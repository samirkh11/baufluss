import { Injectable } from '@nestjs/common';
import { CompanyStatus, Prisma } from '@prisma/client';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';

async function directorySize(path: string): Promise<number> {
  let total = 0;
  try {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      total += entry.isDirectory() ? await directorySize(child) : (await stat(child)).size;
    }
  } catch {
    // directory does not exist yet
  }
  return total;
}

// Key figures and system health for the operator dashboard.
@Injectable()
export class PlatformOverviewService {
  constructor(private readonly prisma: PrismaService) {}

  async stats() {
    const now = new Date();
    const [companies, activePlans, openInvoices, topCompanies, newest] = await Promise.all([
      this.prisma.company.findMany({ select: { id: true, name: true, status: true, trialEndsAt: true, createdAt: true, plan: { select: { priceMonthly: true } } } }),
      this.prisma.company.findMany({ where: { status: CompanyStatus.ACTIVE }, select: { plan: { select: { priceMonthly: true } } } }),
      this.prisma.platformInvoice.findMany({ where: { status: 'OPEN' }, select: { gross: true, dueDate: true } }),
      this.prisma.company.findMany({ take: 5, orderBy: { documents: { _count: 'desc' } }, select: { id: true, name: true, _count: { select: { documents: true, users: true } } } }),
      this.prisma.company.findMany({ take: 5, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, status: true, createdAt: true } }),
    ]);

    const byStatus = Object.fromEntries(Object.values(CompanyStatus).map((status) => [status, companies.filter((c) => c.status === status).length]));
    const mrr = activePlans.reduce((sum, company) => sum.plus(company.plan?.priceMonthly ?? 0), new Prisma.Decimal(0));
    const in7days = new Date(now.getTime() + 7 * 86400000);
    const trialsEnding = companies.filter((c) => c.status === CompanyStatus.TRIAL && c.trialEndsAt && c.trialEndsAt <= in7days).map((c) => ({ id: c.id, name: c.name, trialEndsAt: c.trialEndsAt }));

    // signups of the last 6 months
    const signups = Array.from({ length: 6 }, (_, index) => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (5 - index), 1));
      const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      return { month: start.toISOString().slice(0, 7), count: companies.filter((c) => c.createdAt >= start && c.createdAt < end).length };
    });

    return {
      companies: companies.length,
      byStatus,
      mrr: mrr.toFixed(2),
      arr: mrr.mul(12).toFixed(2),
      openInvoices: { count: openInvoices.length, gross: openInvoices.reduce((sum, i) => sum.plus(i.gross), new Prisma.Decimal(0)).toFixed(2), overdue: openInvoices.filter((i) => i.dueDate < now).length },
      trialsEnding,
      signups,
      topCompanies: topCompanies.map((c) => ({ id: c.id, name: c.name, documents: c._count.documents, users: c._count.users })),
      newest,
    };
  }

  async system() {
    const started = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - started;
    const [dbSize] = await this.prisma.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    const [users, documents, files] = await Promise.all([this.prisma.user.count(), this.prisma.document.count(), this.prisma.archivedFile.count()]);
    const [uploads, storage] = await Promise.all([directorySize(join(process.cwd(), 'uploads')), directorySize(join(process.cwd(), 'storage'))]);
    const memory = process.memoryUsage();
    return {
      status: 'ok',
      node: process.version,
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(memory.rss / 1048576),
      db: { latencyMs: dbLatencyMs, sizeMb: Math.round(Number(dbSize.size) / 1048576) },
      totals: { users, documents, archivedFiles: files },
      files: { uploadsMb: Math.round(uploads / 1048576), storageMb: Math.round(storage / 1048576) },
      time: new Date().toISOString(),
    };
  }
}
