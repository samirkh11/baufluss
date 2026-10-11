import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { ListProjectsQueryDto } from './dto/list-projects-query.dto';

// Related data returned with every project (list and detail).
const PROJECT_INCLUDE = {
  customer: { select: { id: true, number: true, organizationName: true, firstName: true, lastName: true } },
  manager: { select: { id: true, firstName: true, lastName: true, imagePath: true } },
  members: {
    select: { user: { select: { id: true, firstName: true, lastName: true, imagePath: true } } },
  },
  _count: { select: { reports: true } },
} satisfies Prisma.ProjectInclude;

// Date-only strings from the API ("2026-09-14") -> Date; null clears, undefined leaves untouched.
function toDate(value: string | null | undefined): Date | null | undefined {
  return value === undefined || value === null ? value : new Date(value);
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  async findAll(companyId: string, query: ListProjectsQueryDto) {
    const where: Prisma.ProjectWhereInput = {
      companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' } },
              { number: { contains: query.q, mode: 'insensitive' } },
              { siteCity: { contains: query.q, mode: 'insensitive' } },
              { siteStreet: { contains: query.q, mode: 'insensitive' } },
              { customer: { organizationName: { contains: query.q, mode: 'insensitive' } } },
              { customer: { lastName: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.project.findMany({
        where,
        include: PROJECT_INCLUDE,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.project.count({ where }),
    ]);
    return { items: items.map(flattenMembers), total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    // Filtering by companyId as well as id keeps tenants isolated.
    const project = await this.prisma.project.findFirst({ where: { id, companyId }, include: PROJECT_INCLUDE });
    if (!project) {
      throw new NotFoundException();
    }
    return flattenMembers(project);
  }

  async create(companyId: string, dto: CreateProjectDto) {
    await this.assertReferencesBelongToCompany(companyId, dto);
    this.assertDateOrder(dto.startDate, dto.endDate);
    const { memberIds, startDate, endDate, ...fields } = dto;

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSequences.next(tx, companyId, 'PROJECT');
      const project = await tx.project.create({
        data: {
          ...fields,
          companyId,
          number,
          startDate: toDate(startDate),
          endDate: toDate(endDate),
          members: { create: (memberIds ?? []).map((userId) => ({ userId })) },
        },
      });
      return project.id;
    });
    return this.findOne(companyId, id);
  }

  async update(companyId: string, id: string, dto: UpdateProjectDto) {
    const existing = await this.findOne(companyId, id);
    await this.assertReferencesBelongToCompany(companyId, dto);
    this.assertDateOrder(
      dto.startDate === undefined ? existing.startDate?.toISOString() : (dto.startDate ?? undefined),
      dto.endDate === undefined ? existing.endDate?.toISOString() : (dto.endDate ?? undefined),
    );
    const { memberIds, startDate, endDate, ...fields } = dto;

    await this.prisma.project.update({
      where: { id },
      data: {
        ...fields,
        startDate: toDate(startDate),
        endDate: toDate(endDate),
        // Team is replaced as a whole when memberIds is sent.
        ...(memberIds ? { members: { deleteMany: {}, create: memberIds.map((userId) => ({ userId })) } } : {}),
      },
    });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string) {
    await this.findOne(companyId, id);
    // Report photos are files on disk; the DB cascade removes the rows but not the files.
    const photos = await this.prisma.reportPhoto.findMany({ where: { report: { projectId: id } }, select: { path: true } });
    await this.prisma.project.delete({ where: { id } });
    await Promise.all(photos.map((photo) => deleteUploadedFile(photo.path)));
  }

  // Customer, manager and team members must belong to the caller's company; otherwise a client
  // could link foreign records into its own project.
  private async assertReferencesBelongToCompany(companyId: string, dto: Partial<CreateProjectDto>) {
    if (dto.customerId) {
      const customer = await this.prisma.contact.findFirst({ where: { id: dto.customerId, companyId } });
      if (!customer) {
        throw new BadRequestException('Kunde nicht gefunden.');
      }
    }
    const userIds = [...(dto.managerId ? [dto.managerId] : []), ...(dto.memberIds ?? [])];
    if (userIds.length > 0) {
      const unique = [...new Set(userIds)];
      const count = await this.prisma.user.count({ where: { id: { in: unique }, companyId } });
      if (count !== unique.length) {
        throw new BadRequestException('Mitarbeiter nicht gefunden.');
      }
    }
  }

  private assertDateOrder(start?: string, end?: string) {
    if (start && end && new Date(end) < new Date(start)) {
      throw new BadRequestException('Das Enddatum liegt vor dem Startdatum.');
    }
  }
}

// { members: [{ user }] } -> { members: [user] } for a simpler API shape.
function flattenMembers<T extends { members: { user: unknown }[] }>(project: T) {
  return { ...project, members: project.members.map((member) => member.user) } as Omit<T, 'members'> & {
    members: T['members'][number]['user'][];
  };
}
