import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(companyId: string) {
    return this.prisma.user.findMany({
      where: { companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
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

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        companyId,
        email: dto.email,
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        role: dto.role,
      },
    });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  async update(companyId: string, userId: string, dto: UpdateUserDto) {
    await this.ensureBelongsToCompany(companyId, userId);
    const user = await this.prisma.user.update({ where: { id: userId }, data: dto });
    const { passwordHash: _omit, ...safeUser } = user;
    return safeUser;
  }

  async remove(companyId: string, userId: string) {
    await this.ensureBelongsToCompany(companyId, userId);
    await this.prisma.user.delete({ where: { id: userId } });
  }

  // Tenant-isolation guard: every mutation must confirm the target user belongs to the
  // caller's company before touching it, otherwise one tenant could edit another tenant's users.
  private async ensureBelongsToCompany(companyId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, companyId } });
    if (!user) {
      throw new NotFoundException();
    }
  }
}
