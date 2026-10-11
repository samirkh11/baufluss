import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { PlatformUser } from './platform-auth';

// Append-only log of operator actions.
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(admin: PlatformUser, action: string, company?: { id: string; name: string } | null, details?: unknown) {
    await this.prisma.platformAuditLog.create({
      data: { adminId: admin.id, adminName: admin.name, action, companyId: company?.id, companyName: company?.name, details: details as Prisma.InputJsonValue | undefined },
    });
  }

  list(query: { companyId?: string; page: number; pageSize: number }) {
    const where: Prisma.PlatformAuditLogWhereInput = query.companyId ? { companyId: query.companyId } : {};
    return Promise.all([
      this.prisma.platformAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.platformAuditLog.count({ where }),
    ]).then(([items, total]) => ({ items, total, page: query.page, pageSize: query.pageSize }));
  }
}
