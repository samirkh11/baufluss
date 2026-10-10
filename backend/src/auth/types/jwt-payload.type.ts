import { CompanyRole } from '@prisma/client';

// Shape of the data encoded into the JWT access token and, after validation,
// attached to the request as `request.user`.
export interface JwtPayload {
  sub: string; // user id
  companyId: string;
  role: CompanyRole;
}

export interface AuthenticatedUser {
  id: string;
  companyId: string;
  role: CompanyRole;
}
