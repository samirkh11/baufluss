// Mirrors the backend's CompanyRole enum (backend/prisma/schema.prisma).
export type CompanyRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface AuthUser {
  id: string;
  companyId: string;
  role: CompanyRole;
  email: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  accessToken: string;
  user: AuthUser;
}

export interface Company {
  id: string;
  name: string;
  legalForm: string | null;
  street: string | null;
  zipCode: string | null;
  city: string | null;
  country: string;
  taxId: string | null;
  vatId: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  logoPath: string | null;
  letterheadHeaderText: string | null;
  letterheadFooterText: string | null;
}

export interface CompanyUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: CompanyRole;
  isActive: boolean;
  createdAt: string;
}
