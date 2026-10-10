import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Delegates to Passport's "jwt" strategy (see auth/strategies/jwt.strategy.ts).
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
