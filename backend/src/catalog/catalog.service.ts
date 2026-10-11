import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { CreateCatalogItemDto } from './dto/create-catalog-item.dto';
import { UpdateCatalogItemDto } from './dto/update-catalog-item.dto';
import { ListCatalogItemsQueryDto } from './dto/list-catalog-items-query.dto';

// Maximum number of pictures per service/article.
export const MAX_IMAGES_PER_ITEM = 10;

// Images are always returned together with the item, in display order.
const WITH_IMAGES = { images: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] } };

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
        include: WITH_IMAGES,
        orderBy: { name: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.catalogItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    const item = await this.prisma.catalogItem.findFirst({ where: { id, companyId }, include: WITH_IMAGES });
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
    const item = await this.findOne(companyId, id);
    await this.prisma.catalogItem.delete({ where: { id } });
    await Promise.all(item.images.map((image) => deleteUploadedFile(image.path)));
  }

  // Appends a picture to the item. The uploaded file is removed again when the request is rejected
  // (unknown item for this tenant, or image limit reached) so no orphan files remain.
  async addImage(companyId: string, id: string, imagePath: string) {
    try {
      const item = await this.findOne(companyId, id);
      if (item.images.length >= MAX_IMAGES_PER_ITEM) {
        throw new BadRequestException(`Maximal ${MAX_IMAGES_PER_ITEM} Bilder pro Eintrag.`);
      }
      const nextOrder = item.images.reduce((max, image) => Math.max(max, image.sortOrder), -1) + 1;
      return await this.prisma.catalogItemImage.create({
        data: { catalogItemId: id, path: imagePath, sortOrder: nextOrder },
      });
    } catch (error) {
      await deleteUploadedFile(imagePath);
      throw error;
    }
  }

  async removeImage(companyId: string, id: string, imageId: string) {
    const item = await this.findOne(companyId, id);
    const image = item.images.find((candidate) => candidate.id === imageId);
    if (!image) {
      throw new NotFoundException();
    }
    await this.prisma.catalogItemImage.delete({ where: { id: imageId } });
    await deleteUploadedFile(image.path);
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Diese Artikel-/Leistungsnummer wird bereits verwendet.');
    }
    throw error;
  }
}
