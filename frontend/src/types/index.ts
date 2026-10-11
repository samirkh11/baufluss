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
  hourlyRate?: string | null; // internal rate, only sent to OWNER/ADMIN
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
  _count: { reports: number; documents: number };
  // only present on the detail endpoint
  documentCounts?: Partial<Record<DocumentType, number>>;
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

export type DocumentType = 'QUOTE' | 'ORDER' | 'INVOICE' | 'CREDIT_NOTE';
export type DocumentStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
export type DocumentItemKind = 'POSITION' | 'HEADING' | 'TEXT';

// Decimal columns arrive as strings (see CatalogItem).
export interface DocumentItem {
  id: string;
  kind: DocumentItemKind;
  catalogItemId: string | null;
  deductsDocumentId: string | null; // final invoice: the partial invoice this line deducts
  oz: string | null; // original GAEB Ordnungszahl of imported lines
  sku: string | null;
  name: string;
  description: string | null;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
  discountPercent: string;
  isOptional: boolean;
  lineTotal: string;
}

// "BusinessDocument" because "Document" is a browser global.
export interface BusinessDocument {
  id: string;
  projectId: string;
  project: { id: string; number: string; name: string };
  type: DocumentType;
  status: DocumentStatus;
  number: string | null;
  recipientContactId: string | null;
  recipientName: string | null;
  recipientStreet: string | null;
  recipientZipCode: string | null;
  recipientCity: string | null;
  subject: string | null;
  introText: string | null;
  closingText: string | null;
  documentDate: string;
  validUntil: string | null;
  netTotal: string;
  vatTotal: string;
  grossTotal: string;
  finalizedAt: string | null;
  updatedAt: string;
  items: DocumentItem[];
  invoiceDetails: InvoiceDetails | null; // invoices only
  payments?: Payment[]; // invoices / credit notes
  paymentSummary?: PaymentSummary | RefundSummary | null;
  payment?: { status: PaymentStatus; open: string; overdueDays: number } | null; // list rows of invoices
  // conversion chain (quote -> order -> invoice)
  sourceDocument: DocumentRef | null;
  derivedDocuments: DocumentRef[];
}

export type InvoiceKind = 'STANDARD' | 'PARTIAL' | 'FINAL';

export interface InvoiceDetails {
  kind: InvoiceKind;
  partialNumber: number | null;
  retentionPercent: string | null; // Sicherheitseinbehalt in percent
  retentionAmount: string | null; // fixed when issued
  retentionDueDate: string | null;
  serviceDateFrom: string | null;
  serviceDateTo: string | null;
  paymentTermDays: number;
  dueDate: string | null;
  reverseCharge: boolean;
  recipientVatId: string | null;
  orderReference: string | null;
  buyerReference: string | null;
}

export interface DocumentRef {
  id: string;
  type: DocumentType;
  number: string | null;
  status: DocumentStatus;
}

export interface TimeEntry {
  id: string;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  projectId: string | null;
  project: { id: string; number: string; name: string } | null;
  date: string; // ISO timestamp at UTC midnight
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  breakMinutes: number;
  durationMinutes: number;
  isRunning: boolean;
  activity: string | null;
  note: string | null;
  status: 'OPEN' | 'APPROVED';
}

export interface TimeSummaryUser {
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  minutes: number;
  cost?: number; // OWNER/ADMIN only
}

export interface TimeSummary {
  from: string;
  to: string;
  totalMinutes: number;
  totalCost?: number; // OWNER/ADMIN only
  byProject: {
    projectId: string | null; // null = internal time
    project: { id: string; number: string; name: string } | null;
    minutes: number;
    cost?: number;
    plannedHours?: number | null;
    byUser: TimeSummaryUser[];
  }[];
  byUser: TimeSummaryUser[];
}

export interface ContractBilling {
  contractNet: string;
  contractGross: string;
  billedNet: string;
  openNet: string;
  percentBilled: number;
  invoices: {
    id: string;
    number: string | null;
    status: DocumentStatus;
    kind: InvoiceKind;
    partialNumber: number | null;
    documentDate: string;
    netTotal: string;
    grossTotal: string;
  }[];
}

export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type PaymentTarget = 'INVOICE' | 'RETENTION';
export type PaymentMethod = 'BANK_TRANSFER' | 'CASH' | 'CARD' | 'OTHER';

export interface Payment {
  id: string;
  target: PaymentTarget;
  paidAt: string;
  amount: string;
  method: PaymentMethod;
  reference: string | null;
  note: string | null;
}

// Amounts arrive as decimal strings.
export interface PaymentSummary {
  payable: string;
  paid: string;
  open: string;
  retention: string;
  retentionPaid: string;
  retentionOpen: string;
  status: PaymentStatus;
  overdueDays: number;
  retentionOverdueDays: number;
}

// Credit note: money owed back to the customer for an invoice that was already (partly) paid.
export interface RefundSummary {
  refundDue: string;
  refunded: string;
  open: string;
}

export interface Receivable {
  kind: 'INVOICE' | 'RETENTION' | 'REFUND';
  documentId: string;
  documentType: DocumentType;
  number: string | null;
  invoiceKind: InvoiceKind | null;
  recipientName: string | null;
  project: { id: string; number: string; name: string };
  documentDate: string;
  dueDate: string | null;
  amount: string;
  open: string; // negative for refunds
  overdueDays: number;
}

export interface Receivables {
  items: Receivable[];
  totals: { open: string; overdue: string; retention: string; refunds: string };
}
