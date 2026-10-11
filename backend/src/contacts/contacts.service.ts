import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { ListContactsQueryDto } from './dto/list-contacts-query.dto';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(companyId: string, query: ListContactsQueryDto) {
    const where: Prisma.ContactWhereInput = {
      companyId,
      ...(query.includeInactive ? {} : { isActive: true }),
      ...(query.type ? { types: { has: query.type } } : {}),
      ...(query.q
        ? {
            OR: [
              { organizationName: { contains: query.q, mode: 'insensitive' } },
              { firstName: { contains: query.q, mode: 'insensitive' } },
              { lastName: { contains: query.q, mode: 'insensitive' } },
              { number: { contains: query.q, mode: 'insensitive' } },
              { email: { contains: query.q, mode: 'insensitive' } },
              { city: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.contact.findMany({
        where,
        orderBy: [{ organizationName: 'asc' }, { lastName: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contact.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    // Filtering by companyId as well as id is what keeps tenants isolated.
    const contact = await this.prisma.contact.findFirst({ where: { id, companyId } });
    if (!contact) {
      throw new NotFoundException();
    }
    return contact;
  }

  async create(companyId: string, dto: CreateContactDto) {
    try {
      return await this.prisma.contact.create({ data: { ...dto, companyId } });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async update(companyId: string, id: string, dto: UpdateContactDto) {
    await this.findOne(companyId, id);
    try {
      return await this.prisma.contact.update({ where: { id }, data: dto });
    } catch (error) {
      this.rethrowUniqueViolation(error);
    }
  }

  async remove(companyId: string, id: string) {
    const contact = await this.findOne(companyId, id);
    await this.prisma.contact.delete({ where: { id } });
    await deleteUploadedFile(contact.imagePath);
  }

  // Replaces the contact's single picture. The freshly uploaded file is removed again if the
  // contact doesn't exist for this tenant, so rejected requests leave no orphan files behind.
  async setImage(companyId: string, id: string, imagePath: string) {
    let previous;
    try {
      previous = await this.findOne(companyId, id);
    } catch (error) {
      await deleteUploadedFile(imagePath);
      throw error;
    }
    const contact = await this.prisma.contact.update({ where: { id }, data: { imagePath } });
    await deleteUploadedFile(previous.imagePath);
    return contact;
  }

  async removeImage(companyId: string, id: string) {
    const previous = await this.findOne(companyId, id);
    const contact = await this.prisma.contact.update({ where: { id }, data: { imagePath: null } });
    await deleteUploadedFile(previous.imagePath);
    return contact;
  }

  private rethrowUniqueViolation(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('Diese Nummer wird bereits verwendet.');
    }
    throw error;
  }
}
