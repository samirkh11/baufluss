import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { blockedReason } from '../../common/company-access';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../types/jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  // Runs on every authenticated request. Re-checking the user against the database (instead of
  // trusting the token payload alone) means a deactivated user or deleted company is rejected
  // immediately rather than only once the token expires.
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, include: { company: true } });

    if (!user || !user.isActive || user.companyId !== payload.companyId) {
      throw new UnauthorizedException();
    }
    // A suspended/cancelled company or an expired trial locks out running sessions too.
    if (blockedReason(user.company)) {
      throw new UnauthorizedException();
    }

    const result: AuthenticatedUser = { id: user.id, companyId: user.companyId, role: user.role };
    if (payload.imp) {
      const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.imp } });
      if (!admin || !admin.isActive) throw new UnauthorizedException();
      result.impersonatedBy = { id: admin.id, name: `${admin.firstName} ${admin.lastName}` };
    }
    return result;
  }
}
