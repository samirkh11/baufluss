import { SetMetadata } from '@nestjs/common';
import { CompanyRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

// Marks a route handler as restricted to the given company roles; enforced by RolesGuard.
export const Roles = (...roles: CompanyRole[]) => SetMetadata(ROLES_KEY, roles);
