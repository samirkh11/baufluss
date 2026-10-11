import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { CompanyRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/jwt-payload.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // The internal hourly rate is only returned to OWNER/ADMIN; colleagues must not see each other's rates.
  findAll(companyId: string, includeHourlyRate = false) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: {
        hourlyRate: includeHourlyRate,
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        imagePath: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(companyId: string, dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-Mail-Adresse wird bereits verwendet.');
    }

    // Plan limit: the subscription may cap the number of active users.
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { plan: true } });
    if (company?.plan?.maxUsers != null) {
      const active = await this.prisma.user.count({ where: { companyId, isActive: true } });
      if (active >= company.plan.maxUsers) {
        throw new ConflictException(`Der Tarif „${company.plan.name}“ erlaubt höchstens ${company.plan.maxUsers} aktive Nutzer. Bitte den Tarif wechseln.`);
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        companyId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
        hourlyRate: dto.hourlyRate,
      },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  // Rules (enforced here, not only in the UI):
  //  - ADMINs may not touch OWNER accounts or hand out the OWNER role (only an OWNER may).
  //  - Nobody may change their own role or deactivate themselves (prevents locking the company out).
  async update(actor: AuthenticatedUser, userId: string, dto: UpdateUserDto) {
    const target = await this.ensureBelongsToCompany(actor.companyId, userId);
    this.assertMayManage(actor, target.role, dto.role);

    if (actor.id === userId && ((dto.role && dto.role !== target.role) || dto.isActive === false)) {
      throw new ForbiddenException('Eigene Rolle oder Aktivstatus kann nicht geändert werden.');
    }

    if (dto.email && dto.email !== target.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) {
        throw new ConflictException('E-Mail-Adresse wird bereits verwendet.');
      }
    }

    const { password, ...fields } = dto;
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { ...fields, ...(password ? { passwordHash: await bcrypt.hash(password, PASSWORD_SALT_ROUNDS) } : {}) },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  async remove(actor: AuthenticatedUser, userId: string) {
    const user = await this.ensureBelongsToCompany(actor.companyId, userId);
    this.assertMayManage(actor, user.role);
    if (actor.id === userId) {
      throw new ForbiddenException('Der eigene Zugang kann nicht gelöscht werden.');
    }
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch (error) {
      // P2003 = foreign key violation: recorded working times must be kept (ArbZG), so the
      // employee can only be deactivated.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new ConflictException('Der Mitarbeiter hat Zeiteinträge und kann nur deaktiviert werden.');
      }
      throw error;
    }
    await deleteUploadedFile(user.imagePath);
  }

  private assertMayManage(actor: AuthenticatedUser, targetRole: CompanyRole, newRole?: CompanyRole) {
    if (actor.role !== CompanyRole.OWNER && (targetRole === CompanyRole.OWNER || newRole === CompanyRole.OWNER)) {
      throw new ForbiddenException('Nur der Inhaber darf Inhaber-Konten verwalten.');
    }
  }

  // Replaces the user's single profile picture; removes the new file again if the user isn't
  // part of the caller's company (no orphan files from rejected requests).
  async setImage(companyId: string, userId: string, imagePath: string) {
    let previous;
    try {
      previous = await this.ensureBelongsToCompany(companyId, userId);
    } catch (error) {
      await deleteUploadedFile(imagePath);
      throw error;
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { imagePath } });
    await deleteUploadedFile(previous.imagePath);
    const { passwordHash: _omit, hourlyRate: _rate, ...safeUser } = user;
    return safeUser;
  }

  async removeImage(companyId: string, userId: string) {
    const previous = await this.ensureBelongsToCompany(companyId, userId);
    const user = await this.prisma.user.update({ where: { id: userId }, data: { imagePath: null } });
    await deleteUploadedFile(previous.imagePath);
    const { passwordHash: _omit, hourlyRate: _rate, ...safeUser } = user;
    return safeUser;
  }

  // Tenant-isolation guard: every mutation must confirm the target user belongs to the
  // caller's company before touching it, otherwise one tenant could edit another tenant's users.
  private async ensureBelongsToCompany(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) {
      throw new NotFoundException();
    }
    return user;
  }
}
