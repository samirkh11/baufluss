// Mirrors the backend's CompanyRole enum (backend/prisma/schema.prisma).
export type CompanyRole = 'OWNER' | 'ADMIN' | 'MEMBER';

export interface AuthUser {
  id: string;
  companyId: string;
  role: CompanyRole;
  email: string;
  firstName: string;
  lastName: string;
  impersonatedBy?: string; // name of the operator staff member when this is a support session
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
  // subscription (set by the operator)
  status?: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';
  trialEndsAt?: string | null;
  plan?: { name: string } | null;
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
  erasedAt?: string | null;
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
  dunningBlocked: boolean; // Mahnsperre
  dunningBlockReason: string | null;
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
  dunningLevel: DunningLevel | null; // latest dunning letter sent
  dunningBlocked: boolean;
}

export interface Receivables {
  items: Receivable[];
  totals: { open: string; overdue: string; retention: string; refunds: string };
}

export type DunningLevel = 'REMINDER' | 'FIRST' | 'SECOND' | 'FINAL';

export interface DunningLetter {
  id: string;
  number: string | null;
  level: DunningLevel;
  dunningDate: string;
  dueDate: string;
  openAmount: string;
  feeAmount: string;
  interestRate: string;
  interestDays: number;
  interestAmount: string;
  lumpSumAmount: string;
  totalAmount: string;
}

// What the next letter of an invoice would contain (decimal strings).
export interface DunningPreview {
  level: DunningLevel;
  suggestedLevel: DunningLevel | null;
  lastLevel: DunningLevel | null;
  overdueDays: number;
  isBusiness: boolean;
  blocked: boolean;
  blockReason: string | null;
  dunningDate: string;
  dueDate: string;
  openAmount: string;
  fee: string;
  interestRate: string;
  interestDays: number;
  interest: string;
  lumpSum: string;
  total: string;
}

export interface DunningProposal {
  documentId: string;
  number: string | null;
  recipientName: string | null;
  project: { id: string; number: string; name: string };
  invoiceDate: string;
  dueDate: string | null;
  overdueDays: number;
  open: string;
  lastLevel: DunningLevel | null;
  lastDunningDate: string | null;
  suggestedLevel: DunningLevel | null; // null = final dunning already sent
  amounts: { openAmount: string; fee: string; interest: string; lumpSum: string; total: string; interestRate: string; interestDays: number } | null;
}

export interface DunningSettings {
  reminderAfterDays: number;
  graceDays: number;
  feeFirst: string;
  feeSecond: string;
  feeFinal: string;
  interestEnabled: boolean;
  baseRatePercent: string;
  lumpSumB2B: string;
}

export type IncomingInvoiceStatus = 'RECEIVED' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface IncomingInvoice {
  id: string;
  number: string; // internal ER-0001
  supplierId: string | null;
  supplierName: string | null;
  supplier: { id: string; number: string | null; organizationName: string | null; firstName: string | null; lastName: string | null } | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  serviceDate: string | null;
  dueDate: string | null;
  description: string | null;
  netAmount: string;
  vatAmount: string;
  grossAmount: string;
  reverseCharge: boolean;
  projectId: string | null;
  project: { id: string; number: string; name: string } | null;
  status: IncomingInvoiceStatus;
  source: 'UPLOAD' | 'EMAIL' | 'MANUAL';
  rejectionReason: string | null;
  fileName: string | null;
  mimeType: string | null;
  uploadedBy: { firstName: string; lastName: string } | null;
  approvedBy: { firstName: string; lastName: string } | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  // Parsed content when the upload was a structured e-invoice (XRechnung / ZUGFeRD)
  eInvoice?: {
    format: 'XRECHNUNG_UBL' | 'XRECHNUNG_CII' | 'ZUGFERD';
    isCreditNote: boolean;
    supplierMatched: boolean;
    seller: { name: string | null; iban: string | null; vatId: string | null };
    lines: { position: string | null; name: string; quantity: string | null; unit: string | null; unitPrice: string | null; net: string | null }[];
  } | null;
  issues?: string[]; // what still blocks the approval (detail only)
  duplicateOf?: { id: string; number: string } | null;
}
