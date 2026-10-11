import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { PrismaService } from '../common/prisma/prisma.service';

const SECRET_KEYS = /password|token|secret|authorization/i;
const SKIPPED_ENTITIES = new Set(['dashboard']); // layout saves are UI noise, not business changes

// Removes secrets and shortens long values so the log stays readable and small.
export function sanitizeDetails(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  if (typeof value !== 'object') return value;
  if (depth > 3) return '…';
  if (Array.isArray(value)) return value.slice(0, 20).map((entry) => sanitizeDetails(entry, depth + 1));
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, SECRET_KEYS.test(key) ? '***' : sanitizeDetails(entry, depth + 1)]),
  );
}

export interface AuditEntry {
  method: string;
  route: string;
  entityType: string;
  entityId?: string | null;
  entityLabel?: string | null;
  details?: unknown;
}

// Append-only audit trail (GoBD Nachvollziehbarkeit). There is intentionally no update/delete method.
@Injectable()
export class AuditService {
  private readonly names = new Map<string, { name: string; at: number }>();

  constructor(private readonly prisma: PrismaService) {}

  private async userName(userId: string): Promise<string> {
    const cached = this.names.get(userId);
    if (cached && Date.now() - cached.at < 300000) return cached.name;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const name = user ? `${user.firstName} ${user.lastName}` : 'Unbekannt';
    this.names.set(userId, { name, at: Date.now() });
    return name;
  }

  async log(actor: { id: string; companyId: string; impersonatedBy?: { id: string; name: string } }, entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          companyId: actor.companyId,
          userId: actor.id,
          userName: actor.impersonatedBy ? `Support (${actor.impersonatedBy.name}) als ${await this.userName(actor.id)}` : await this.userName(actor.id),
          method: entry.method,
          route: entry.route,
          entityType: entry.entityType,
          entityId: entry.entityId ?? null,
          entityLabel: entry.entityLabel ?? null,
          details: entry.details === undefined ? undefined : (sanitizeDetails(entry.details) as Prisma.InputJsonValue),
        },
      });
    } catch {
      // the audit trail must never break the business request
    }
  }

  async list(companyId: string, query: { entityType?: string; entityId?: string; userId?: string; from?: string; to?: string; q?: string; page: number; pageSize: number }) {
    const where: Prisma.AuditLogWhereInput = { companyId };
    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.userId) where.userId = query.userId;
    if (query.from || query.to) {
      where.createdAt = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lt: new Date(new Date(query.to).getTime() + 86400000) } : {}) };
    }
    if (query.q?.trim()) {
      where.OR = [
        { entityLabel: { contains: query.q.trim(), mode: 'insensitive' } },
        { route: { contains: query.q.trim(), mode: 'insensitive' } },
        { userName: { contains: query.q.trim(), mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
}

// Records every successful write request of a logged-in user.
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) || !request.user) return next.handle();
    const route: string = request.route?.path ?? request.path;
    const entityType = route.split('/').filter(Boolean)[0] ?? 'unknown';
    if (SKIPPED_ENTITIES.has(entityType)) return next.handle();
    const actor = request.user;
    return next.handle().pipe(
      tap((response) => {
        const result = (response ?? {}) as { id?: string; number?: string | null; name?: string | null };
        void this.audit.log(actor, {
          method: request.method,
          route,
          entityType,
          entityId: request.params?.id ?? result.id ?? null,
          entityLabel: result.number ?? result.name ?? null,
          details: request.body && Object.keys(request.body).length > 0 ? request.body : undefined,
        });
      }),
    );
  }
}
