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

// Paginated list envelope returned by all list endpoints.
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type ContactType = 'CUSTOMER' | 'SUPPLIER' | 'SUBCONTRACTOR';

export interface Contact {
  id: string;
  types: ContactType[];
  number: string | null;
  isOrganization: boolean;
  organizationName: string | null;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  street: string | null;
  zipCode: string | null;
  city: string | null;
  country: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  vatId: string | null;
  taxId: string | null;
  iban: string | null;
  bic: string | null;
  paymentTermDays: number | null;
  notes: string | null;
  isActive: boolean;
}

export type CatalogItemKind = 'SERVICE' | 'ARTICLE';

// Prisma serializes Decimal columns as strings; convert with Number() when computing or editing.
export interface CatalogItem {
  id: string;
  kind: CatalogItemKind;
  sku: string | null;
  name: string;
  description: string | null;
  unit: string;
  netPrice: string;
  purchasePrice: string | null;
  vatRate: string;
  isActive: boolean;
}
