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
  imagePath: string | null;
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
  imagePath: string | null;
  isActive: boolean;
}

export type CatalogItemKind = 'SERVICE' | 'ARTICLE';

// Prisma serializes Decimal columns as strings; convert with Number() when computing or editing.
export interface CatalogItemImage {
  id: string;
  path: string;
  sortOrder: number;
}

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
  images: CatalogItemImage[];
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  imagePath: string | null;
}

export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';

export interface Project {
  id: string;
  number: string;
  name: string;
  status: ProjectStatus;
  description: string | null;
  customerId: string | null;
  customer: {
    id: string;
    number: string | null;
    organizationName: string | null;
    firstName: string | null;
    lastName: string | null;
  } | null;
  siteStreet: string | null;
  siteZipCode: string | null;
  siteCity: string | null;
  // ISO timestamps at UTC midnight (the API stores plain dates)
  startDate: string | null;
  endDate: string | null;
  managerId: string | null;
  manager: UserSummary | null;
  members: UserSummary[];
  _count: { reports: number };
}

export type ReportType = 'DAILY' | 'PROGRESS' | 'DEFECT' | 'ACCEPTANCE' | 'INCIDENT' | 'OTHER';

export interface ReportPhoto {
  id: string;
  path: string;
  sortOrder: number;
}

export interface Report {
  id: string;
  number: string;
  type: ReportType;
  title: string;
  reportDate: string;
  projectId: string;
  project: { id: string; number: string; name: string };
  authorId: string | null;
  authorName: string;
  weather: string | null;
  workPerformed: string | null;
  issues: string | null;
  progressPercent: number | null;
  photos: ReportPhoto[];
}
