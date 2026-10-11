import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertNumberSequenceDto } from './dto/upsert-number-sequence.dto';

// Defaults used when a document type is numbered before the company configured its range.
const DEFAULT_PREFIXES: Record<string, string> = {
  PROJECT: 'P-',
  REPORT: 'BE-',
  QUOTE: 'AN-',
  ORDER: 'AB-',
  INVOICE: 'RE-',
  CREDIT_NOTE: 'GS-',
  DUNNING: 'MA-',
  INCOMING_INVOICE: 'ER-',
};

@Injectable()
export class NumberSequencesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.numberSequence.findMany({ where: { companyId }, orderBy: { documentType: 'asc' } });
  }

  // Creates the sequence for a document type if it doesn't exist yet, otherwise updates it.
  // One sequence per (companyId, documentType) — enforced by the @@unique constraint in the schema.
  upsert(companyId: string, dto: UpsertNumberSequenceDto) {
    return this.prisma.numberSequence.upsert({
      where: { companyId_documentType: { companyId, documentType: dto.documentType } },
      create: {
        companyId,
        documentType: dto.documentType,
        prefix: dto.prefix ?? '',
        nextNumber: dto.nextNumber ?? 1,
        digits: dto.digits ?? 4,
        resetYearly: dto.resetYearly ?? false,
      },
      update: {
        prefix: dto.prefix,
        nextNumber: dto.nextNumber,
        digits: dto.digits,
        resetYearly: dto.resetYearly,
      },
    });
  }

  async remove(companyId: string, documentType: string) {
    const sequence = await this.prisma.numberSequence.findUnique({
      where: { companyId_documentType: { companyId, documentType } },
    });
    if (!sequence) {
      throw new NotFoundException();
    }
    await this.prisma.numberSequence.delete({ where: { id: sequence.id } });
  }

  // Hands out the next number of a sequence, e.g. "P-0007". MUST be called with the transaction
  // client of the operation that stores the number, so a rolled-back save never burns a number
  // (gap-free numbering is required for invoices under GoBD). Concurrent callers are serialized
  // by the row lock of the UPDATE statements.
  async next(tx: Prisma.TransactionClient, companyId: string, documentType: string): Promise<string> {
    // Create the range with defaults on first use.
    await tx.numberSequence.upsert({
      where: { companyId_documentType: { companyId, documentType } },
      create: { companyId, documentType, prefix: DEFAULT_PREFIXES[documentType] ?? '' },
      update: {},
    });

    // Yearly reset: restart at 1 once per calendar year.
    const year = new Date().getFullYear();
    await tx.numberSequence.updateMany({
      where: {
        companyId,
        documentType,
        resetYearly: true,
        OR: [{ lastResetYear: null }, { lastResetYear: { lt: year } }],
      },
      data: { nextNumber: 1, lastResetYear: year },
    });

    // Atomic increment; the value before the increment is the number we hand out.
    const sequence = await tx.numberSequence.update({
      where: { companyId_documentType: { companyId, documentType } },
      data: { nextNumber: { increment: 1 } },
    });
    const assigned = sequence.nextNumber - 1;
    return `${sequence.prefix}${String(assigned).padStart(sequence.digits, '0')}`;
  }
}
