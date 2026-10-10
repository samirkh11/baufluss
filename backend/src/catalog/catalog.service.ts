import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: ListCatalogItemsQueryDto) {
    const where: Prisma.CatalogItemWhereInput = {
      companyId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.kind ? { kind: query.kind } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { sku: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.catalogItem.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.catalogItem.findFirst({ where: { id, companyId } });
    if (!item) {
      throw new NotFoundException();
    }
    return item;
  }

  async create(companyId: string, dto: CreateCatalogItemDto) {
    try {
      return await this.prisma.catalogItem.create({ data: { ...dto, companyId } });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async update(companyId: string, id: string, dto: UpdateCatalogItemDto) {
    await this.findOne(companyId, id);
    try {
      return await this.prisma.catalogItem.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    await this.prisma.catalogItem.delete({ where: { id } });
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Diese Artikel-/Leistungsnummer wird bereits verwendet.');
    }
    throw error;
  }
}
