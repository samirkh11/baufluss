import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, DunningLevel, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { localNow } from '../time-entries/time-utils';
import { computeDunning, isNextLevelDue, levelRank, nextLevel } from './dunning-calc';
import { DunningBlockDto, UpdateDunningSettingsDto } from './dto/dunning.dto';
import { issuerSnapshotOf } from './issuer-snapshot';
import { summarizePayments } from './payment-status';

const DAY_MS = 24 * 60 * 60 * 1000;
const todayUtc = () => new Date(localNow().date);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

@Injectable()
export class DunningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  // ------------------------------------------------------------------ settings

  // Rules of the company; created with the defaults of the schema on first use.
  getSettings(companyId: string) {
    return this.prisma.dunningSettings.upsert({ where: { companyId }, create: { companyId }, update: {} });
  }

  updateSettings(companyId: string, dto: UpdateDunningSettingsDto) {
    return this.prisma.dunningSettings.upsert({
      where: { companyId },
      create: { companyId, ...dto },
      update: dto,
    });
  }

  // ------------------------------------------------------------------ letters

  list(companyId: string, documentId: string) {
    return this.prisma.dunning.findMany({
      where: { companyId, documentId },
      orderBy: [{ dunningDate: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        number: true,
        level: true,
        dunningDate: true,
        dueDate: true,
        openAmount: true,
        feeAmount: true,
        interestRate: true,
        interestDays: true,
        interestAmount: true,
        lumpSumAmount: true,
        totalAmount: true,
      },
    });
  }

  // What the next letter of an invoice would look like (for the confirmation dialog).
  async preview(companyId: string, documentId: string, level?: DunningLevel) {
    const context = await this.context(companyId, documentId);
    const chosen = level ?? context.suggestedLevel;
    if (!chosen) {
      throw new ConflictException(
        'Die höchste Mahnstufe ist erreicht. Weitere Schritte (Inkasso/Rechtsanwalt) liegen außerhalb dieser Anwendung.',
      );
    }
    if (context.lastLevel !== null && levelRank(chosen) <= levelRank(context.lastLevel)) {
      throw new ConflictException('Diese Mahnstufe wurde bereits erreicht.');
    }
    const amounts = computeDunning({
      openAmount: context.open,
      level: chosen,
      overdueDays: context.overdueDays,
      isBusiness: context.isBusiness,
      lumpSumAlreadyCharged: context.lumpSumAlreadyCharged,
      rules: context.settings,
    });
    const dunningDate = todayUtc();
    return {
      level: chosen,
      suggestedLevel: context.suggestedLevel,
      lastLevel: context.lastLevel,
      overdueDays: context.overdueDays,
      isBusiness: context.isBusiness,
      blocked: context.blocked,
      blockReason: context.blockReason,
      dunningDate,
      dueDate: addDays(dunningDate, context.settings.graceDays),
      ...amounts,
    };
  }

  // Issues a dunning letter: freezes the amounts and the sender data and numbers it.
  async create(actor: AuthenticatedUser, documentId: string, level?: DunningLevel) {
    const preview = await this.preview(actor.companyId, documentId, level);
    if (preview.blocked) {
      throw new ConflictException(`Mahnsperre${preview.blockReason ? `: ${preview.blockReason}` : ''}`);
    }
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: actor.companyId } });
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numberSequences.next(tx, actor.companyId, 'DUNNING');
      return tx.dunning.create({
        data: {
          companyId: actor.companyId,
          documentId,
          number,
          level: preview.level,
          dunningDate: preview.dunningDate,
          dueDate: preview.dueDate,
          openAmount: preview.openAmount,
          feeAmount: preview.fee,
          interestRate: preview.interestRate,
          interestDays: preview.interestDays,
          interestAmount: preview.interest,
          lumpSumAmount: preview.lumpSum,
          totalAmount: preview.total,
          issuerSnapshot: issuerSnapshotOf(company),
          createdById: actor.id,
        },
      });
    });
  }

  // Corrects a letter that was created by mistake (only the latest one of an invoice, otherwise the
  // escalation history would have gaps).
  async remove(companyId: string, dunningId: string) {
    const dunning = await this.prisma.dunning.findFirst({ where: { id: dunningId, companyId } });
    if (!dunning) {
      throw new NotFoundException();
    }
    const later = await this.prisma.dunning.count({
      where: {
        documentId: dunning.documentId,
        OR: [
          { dunningDate: { gt: dunning.dunningDate } },
          { dunningDate: dunning.dunningDate, createdAt: { gt: dunning.createdAt } },
        ],
      },
    });
    if (later > 0) {
      throw new ConflictException('Es kann nur die jeweils letzte Mahnung gelöscht werden.');
    }
    await this.prisma.dunning.delete({ where: { id: dunningId } });
  }

  // Mahnsperre: pauses dunning for a disputed invoice or a payment arrangement.
  async setBlock(companyId: string, documentId: string, dto: DunningBlockDto) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId, type: DocumentType.INVOICE },
      include: { invoiceDetails: true },
    });
    if (!document?.invoiceDetails) {
      throw new NotFoundException();
    }
    return this.prisma.invoiceDetails.update({
      where: { documentId },
      data: { dunningBlocked: dto.blocked, dunningBlockReason: dto.blocked ? (dto.reason ?? null) : null },
      select: { dunningBlocked: true, dunningBlockReason: true },
    });
  }

  // ------------------------------------------------------------------ proposals

  // Overdue invoices for which the next letter is due, with the amounts it would carry.
  async proposals(companyId: string) {
    const settings = await this.getSettings(companyId);
    const today = todayUtc();
    const invoices = await this.prisma.document.findMany({
      where: { companyId, type: DocumentType.INVOICE, status: DocumentStatus.SENT },
      include: {
        invoiceDetails: true,
        payments: true,
        dunnings: { orderBy: [{ dunningDate: 'asc' }, { createdAt: 'asc' }] },
        project: { select: { id: true, number: true, name: true } },
        recipientContact: { select: { number: true, isOrganization: true } },
      },
    });

    const items = [];
    for (const invoice of invoices) {
      const summary = summarizePayments({
        status: invoice.status,
        grossTotal: invoice.grossTotal,
        retentionAmount: invoice.invoiceDetails?.retentionAmount,
        dueDate: invoice.invoiceDetails?.dueDate,
        payments: invoice.payments,
        today,
      });
      if (summary.open.lte(0) || summary.overdueDays <= 0 || invoice.invoiceDetails?.dunningBlocked) {
        continue;
      }
      const last = invoice.dunnings.at(-1) ?? null;
      const level = nextLevel(last?.level ?? null);
      const due = level !== null && isNextLevelDue(last, summary.overdueDays, today, settings);
      // After the final dunning nothing more can be done here: flag it so it doesn't get lost.
      if (level !== null && !due) {
        continue;
      }
      const isBusiness = invoice.recipientContact?.isOrganization ?? true;
      const amounts =
        level === null
          ? null
          : computeDunning({
              openAmount: summary.open,
              level,
              overdueDays: summary.overdueDays,
              isBusiness,
              lumpSumAlreadyCharged: invoice.dunnings.some((dunning) => dunning.lumpSumAmount.gt(0)),
              rules: settings,
            });
      items.push({
        documentId: invoice.id,
        number: invoice.number,
        recipientName: invoice.recipientName,
        project: invoice.project,
        invoiceDate: invoice.documentDate,
        dueDate: invoice.invoiceDetails?.dueDate ?? null,
        overdueDays: summary.overdueDays,
        open: summary.open,
        lastLevel: last?.level ?? null,
        lastDunningDate: last?.dunningDate ?? null,
        suggestedLevel: level, // null = final dunning already sent: collection/lawyer next
        amounts,
      });
    }
    items.sort((a, b) => b.overdueDays - a.overdueDays);
    return {
      items,
      totals: {
        count: items.length,
        open: items.reduce((sum, item) => sum.plus(item.open), new Prisma.Decimal(0)),
      },
    };
  }

  // ------------------------------------------------------------------ helpers

  // Everything the dunning rules need to know about one invoice.
  private async context(companyId: string, documentId: string) {
    const [settings, document] = await Promise.all([
      this.getSettings(companyId),
      this.prisma.document.findFirst({
        where: { id: documentId, companyId },
        include: {
          invoiceDetails: true,
          payments: true,
          dunnings: { orderBy: [{ dunningDate: 'asc' }, { createdAt: 'asc' }] },
          recipientContact: { select: { isOrganization: true } },
        },
      }),
    ]);
    if (!document) {
      throw new NotFoundException();
    }
    if (document.type !== DocumentType.INVOICE) {
      throw new BadRequestException('Mahnungen gibt es nur zu Rechnungen.');
    }
    if (document.status !== DocumentStatus.SENT) {
      throw new ConflictException(
        document.status === DocumentStatus.CANCELLED
          ? 'Die Rechnung ist storniert.'
          : 'Nur ausgestellte Rechnungen können angemahnt werden.',
      );
    }
    const summary = summarizePayments({
      status: document.status,
      grossTotal: document.grossTotal,
      retentionAmount: document.invoiceDetails?.retentionAmount,
      dueDate: document.invoiceDetails?.dueDate,
      payments: document.payments,
      today: todayUtc(),
    });
    if (summary.open.lte(0)) {
      throw new ConflictException('Die Rechnung ist bereits bezahlt.');
    }
    if (summary.overdueDays <= 0) {
      throw new ConflictException('Die Rechnung ist noch nicht überfällig.');
    }
    const last = document.dunnings.at(-1) ?? null;
    return {
      settings,
      open: summary.open,
      overdueDays: summary.overdueDays,
      isBusiness: document.recipientContact?.isOrganization ?? true,
      lumpSumAlreadyCharged: document.dunnings.some((dunning) => dunning.lumpSumAmount.gt(0)),
      lastLevel: last?.level ?? null,
      suggestedLevel: nextLevel(last?.level ?? null),
      blocked: document.invoiceDetails?.dunningBlocked ?? false,
      blockReason: document.invoiceDetails?.dunningBlockReason ?? null,
    };
  }
}
