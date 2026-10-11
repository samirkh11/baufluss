import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRole, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { NumberSequencesService } from '../companies/number-sequences/number-sequences.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportDto } from './dto/update-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';

export const MAX_PHOTOS_PER_REPORT = 20;

const REPORT_INCLUDE = {
  project: { select: { id: true, number: true, name: true } },
  photos: { orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ReportInclude;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numberSequences: NumberSequencesService,
  ) {}

  async findAll(companyId: string, query: ListReportsQueryDto) {
    const where: Prisma.ReportWhereInput = {
      companyId,
      ...(query.projectId ? { projectId: query.projectId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.authorId ? { authorId: query.authorId } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { number: { contains: query.q, mode: 'insensitive' } },
              { workPerformed: { contains: query.q, mode: 'insensitive' } },
              { issues: { contains: query.q, mode: 'insensitive' } },
              { project: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.report.findMany({
        where,
        include: REPORT_INCLUDE,
        orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.report.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(companyId: string, id: string) {
    const report = await this.prisma.report.findFirst({ where: { id, companyId }, include: REPORT_INCLUDE });
    if (!report) {
      throw new NotFoundException();
    }
    return report;
  }

  // Any employee may write reports (site crews keep the Bautagebuch).
  async create(actor: AuthenticatedUser, projectId: string, dto: CreateReportDto) {
    const project = await this.prisma.project.findFirst({ where: { id: projectId, companyId: actor.companyId } });
    if (!project) {
      throw new NotFoundException();
    }
    const author = await this.prisma.user.findUniqueOrThrow({ where: { id: actor.id } });

    const id = await this.prisma.$transaction(async (tx) => {
      const number = await this.numberSequences.next(tx, actor.companyId, 'REPORT');
      const report = await tx.report.create({
        data: {
          ...dto,
          reportDate: new Date(dto.reportDate),
          companyId: actor.companyId,
          projectId,
          number,
          authorId: author.id,
          authorName: `${author.firstName} ${author.lastName}`,
        },
      });
      return report.id;
    });
    return this.findOne(actor.companyId, id);
  }

  async update(actor: AuthenticatedUser, id: string, dto: UpdateReportDto) {
    const report = await this.findOne(actor.companyId, id);
    this.assertMayModify(actor, report.authorId);
    await this.prisma.report.update({
      where: { id },
      data: { ...dto, reportDate: dto.reportDate ? new Date(dto.reportDate) : undefined },
    });
    return this.findOne(actor.companyId, id);
  }

  async remove(actor: AuthenticatedUser, id: string) {
    const report = await this.findOne(actor.companyId, id);
    this.assertMayModify(actor, report.authorId);
    await this.prisma.report.delete({ where: { id } });
    await Promise.all(report.photos.map((photo) => deleteUploadedFile(photo.path)));
  }

  // Appends a photo. The uploaded file is removed again when the request is rejected (not allowed,
  // unknown report, limit reached) so no orphan files remain.
  async addPhoto(actor: AuthenticatedUser, id: string, photoPath: string) {
    try {
      const report = await this.findOne(actor.companyId, id);
      this.assertMayModify(actor, report.authorId);
      if (report.photos.length >= MAX_PHOTOS_PER_REPORT) {
        throw new BadRequestException(`Maximal ${MAX_PHOTOS_PER_REPORT} Fotos pro Bericht.`);
      }
      const nextOrder = report.photos.reduce((max, photo) => Math.max(max, photo.sortOrder), -1) + 1;
      return await this.prisma.reportPhoto.create({ data: { reportId: id, path: photoPath, sortOrder: nextOrder } });
    } catch (error) {
      await deleteUploadedFile(photoPath);
      throw error;
    }
  }

  async removePhoto(actor: AuthenticatedUser, id: string, photoId: string) {
    const report = await this.findOne(actor.companyId, id);
    this.assertMayModify(actor, report.authorId);
    const photo = report.photos.find((candidate) => candidate.id === photoId);
    if (!photo) {
      throw new NotFoundException();
    }
    await this.prisma.reportPhoto.delete({ where: { id: photoId } });
    await deleteUploadedFile(photo.path);
  }

  // Authors may change their own reports; OWNER/ADMIN may change any report.
  private assertMayModify(actor: AuthenticatedUser, authorId: string | null) {
    const privileged = actor.role === CompanyRole.OWNER || actor.role === CompanyRole.ADMIN;
    if (!privileged && authorId !== actor.id) {
      throw new ForbiddenException('Nur der Verfasser oder ein Administrator darf diesen Bericht ändern.');
    }
  }
}
