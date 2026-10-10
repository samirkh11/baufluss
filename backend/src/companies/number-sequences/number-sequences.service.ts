import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertNumberSequenceDto } from './dto/upsert-number-sequence.dto';

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
}
