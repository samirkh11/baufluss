import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/types/jwt-payload.type';

// Reads the authenticated user (populated by JwtStrategy.validate) out of the request.
// Usage: findAll(@CurrentUser() user: AuthenticatedUser)
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthenticatedUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
