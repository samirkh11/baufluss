import { Body, Controller, Get, HttpCode, Injectable, Post, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard, PassportStrategy } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { IsEmail, IsString } from 'class-validator';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../common/prisma/prisma.service';

// Token of the operator staff. Same signing secret as the app tokens, but a different payload
// (`kind: 'platform'`): the app strategy never accepts it (no company) and this strategy never accepts
// an app token.
export interface PlatformJwtPayload {
  sub: string;
  kind: 'platform';
}
export interface PlatformUser {
  id: string;
  name: string;
  email: string;
}

@Injectable()
export class PlatformJwtStrategy extends PassportStrategy(Strategy, 'platform-jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: configService.getOrThrow<string>('JWT_SECRET') });
  }

  async validate(payload: PlatformJwtPayload): Promise<PlatformUser> {
    if (payload.kind !== 'platform') throw new UnauthorizedException();
    const admin = await this.prisma.platformAdmin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive) throw new UnauthorizedException();
    return { id: admin.id, name: `${admin.firstName} ${admin.lastName}`, email: admin.email };
  }
}

@Injectable()
export class PlatformAuthGuard extends AuthGuard('platform-jwt') {}

export const CurrentAdmin = createParamDecorator((_: unknown, ctx: ExecutionContext): PlatformUser => ctx.switchToHttp().getRequest().user);

class AdminLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

@ApiTags('admin')
@Controller('admin/auth')
export class PlatformAuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: AdminLoginDto) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email: dto.email } });
    if (!admin || !admin.isActive || !(await bcrypt.compare(dto.password, admin.passwordHash))) {
      throw new UnauthorizedException('E-Mail oder Passwort ist falsch.');
    }
    const payload: PlatformJwtPayload = { sub: admin.id, kind: 'platform' };
    return {
      accessToken: this.jwt.sign(payload, { expiresIn: '8h' }),
      admin: { id: admin.id, email: admin.email, firstName: admin.firstName, lastName: admin.lastName },
    };
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(PlatformAuthGuard)
  me(@CurrentAdmin() admin: PlatformUser) {
    return admin;
  }
}
