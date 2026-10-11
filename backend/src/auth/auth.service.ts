import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { CompanyRole } from '@prisma/client';
import { blockedReason } from '../common/company-access';
import { PrismaService } from '../common/prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './types/jwt-payload.type';

const PASSWORD_SALT_ROUNDS = 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Creates a new tenant (Company) together with its first user, who becomes OWNER.
  // This is the only place a Company is allowed to be created outside of seed scripts.
  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('E-Mail-Adresse wird bereits verwendet.');
    }

    const passwordHash = await bcrypt.hash(dto.password, PASSWORD_SALT_ROUNDS);

    // New customers start with a free trial on the default plan (operator settings).
    const settings = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    const trialDays = settings?.trialDays ?? 14;
    const plan = await this.prisma.plan.findUnique({ where: { key: settings?.defaultPlanKey ?? 'starter' } });

    const company = await this.prisma.company.create({
      data: {
        name: dto.companyName,
        status: 'TRIAL',
        trialEndsAt: new Date(Date.now() + trialDays * 86400000),
        planId: plan?.id,
        users: {
          create: {
            email: dto.email,
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: CompanyRole.OWNER,
          },
        },
      },
      include: { users: true },
    });

    const user = company.users[0];
    return this.buildAuthResponse(user.id, user.companyId, user.role, user.email, user.firstName, user.lastName);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email }, include: { company: true } });

    if (!user || !user.isActive || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch.');
    }
    // Only after the password was verified, so the lock reason is not revealed to strangers.
    const blocked = blockedReason(user.company);
    if (blocked) {
      throw new ForbiddenException(blocked);
    }

    return this.buildAuthResponse(user.id, user.companyId, user.role, user.email, user.firstName, user.lastName);
  }

  private buildAuthResponse(
    userId: string,
    companyId: string,
    role: CompanyRole,
    email: string,
    firstName: string,
    lastName: string,
  ) {
    const payload: JwtPayload = { sub: userId, companyId, role };
    return {
      accessToken: this.jwtService.sign(payload),
      user: { id: userId, companyId, role, email, firstName, lastName },
    };
  }
}
