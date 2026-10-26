import { Tone } from '../theme/tokens';
import {
  DocumentStatus,
  DocumentType,
  DunningLevel,
  IncomingInvoiceStatus,
  PaymentMethod,
  PaymentStatus,
  Project,
  ProjectStatus,
  ReportType,
} from '../types';

// Label + semantic tone of a status value; rendered with <StatusTag tone={…}>.
export type StatusLabel = { label: string; tone: Tone };

export const PROJECT_STATUS: Record<ProjectStatus, StatusLabel> = {
  PLANNING: { label: 'In Planung', tone: 'info' },
  IN_PROGRESS: { label: 'In Ausführung', tone: 'success' },
  ON_HOLD: { label: 'Pausiert', tone: 'warning' },
  COMPLETED: { label: 'Abgeschlossen', tone: 'neutral' },
  CANCELLED: { label: 'Abgebrochen', tone: 'error' },
};

export const REPORT_TYPE: Record<ReportType, StatusLabel> = {
  DAILY: { label: 'Tagesbericht', tone: 'info' },
  PROGRESS: { label: 'Baufortschritt', tone: 'info' },
  DEFECT: { label: 'Mängelbericht', tone: 'error' },
  ACCEPTANCE: { label: 'Abnahme', tone: 'success' },
  INCIDENT: { label: 'Vorkommnis', tone: 'warning' },
  OTHER: { label: 'Sonstiges', tone: 'neutral' },
};

export function optionsOf(map: Record<string, { label: string }>) {
  return Object.entries(map).map(([value, { label }]) => ({ value, label }));
}

// Dates arrive as ISO timestamps at UTC midnight; format them in UTC so they never shift a day.
export function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString('de-DE', { timeZone: 'UTC' }) : '';
}

// "YYYY-MM-DD" for <input type="date">.
export function toDateInput(iso: string | null | undefined): string | undefined {
  return iso ? iso.slice(0, 10) : undefined;
}

export function todayDateInput(): string {
  return new Date().toLocaleDateString('sv-SE');
}

export function customerName(customer: Project['customer']): string {
  if (!customer) {
    return '';
  }
  return customer.organizationName || [customer.firstName, customer.lastName].filter(Boolean).join(' ');
}

export function siteAddress(project: Pick<Project, 'siteStreet' | 'siteZipCode' | 'siteCity'>): string {
  return [project.siteStreet, [project.siteZipCode, project.siteCity].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
}

export const DOCUMENT_STATUS: Record<DocumentStatus, StatusLabel> = {
  DRAFT: { label: 'Entwurf', tone: 'neutral' },
  SENT: { label: 'Ausgestellt', tone: 'info' },
  ACCEPTED: { label: 'Angenommen', tone: 'success' },
  REJECTED: { label: 'Abgelehnt', tone: 'error' },
  CANCELLED: { label: 'Storniert', tone: 'neutral' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, StatusLabel> = {
  UNPAID: { label: 'Offen', tone: 'info' },
  PARTIALLY_PAID: { label: 'Teilweise bezahlt', tone: 'warning' },
  PAID: { label: 'Bezahlt', tone: 'success' },
  OVERDUE: { label: 'Überfällig', tone: 'error' },
  CANCELLED: { label: 'Storniert', tone: 'neutral' },
};

export const DUNNING_LEVEL: Record<DunningLevel, StatusLabel> = {
  REMINDER: { label: 'Zahlungserinnerung', tone: 'info' },
  FIRST: { label: '1. Mahnung', tone: 'warning' },
  SECOND: { label: '2. Mahnung', tone: 'warning' },
  FINAL: { label: 'Letzte Mahnung', tone: 'error' },
};

export const INCOMING_STATUS: Record<IncomingInvoiceStatus, StatusLabel> = {
  RECEIVED: { label: 'Zu prüfen', tone: 'warning' },
  APPROVED: { label: 'Freigegeben', tone: 'info' },
  REJECTED: { label: 'Abgelehnt', tone: 'error' },
  PAID: { label: 'Bezahlt', tone: 'success' },
};

export const EINVOICE_FORMAT: Record<string, string> = {
  XRECHNUNG_UBL: 'XRechnung (UBL)',
  XRECHNUNG_CII: 'XRechnung (CII)',
  ZUGFERD: 'ZUGFeRD / Factur-X',
};

export const PAYMENT_METHOD: Record<PaymentMethod, { label: string }> = {
  BANK_TRANSFER: { label: 'Überweisung' },
  CASH: { label: 'Bar' },
  CARD: { label: 'Karte' },
  OTHER: { label: 'Sonstiges' },
};

export const DOCUMENT_TYPE: Record<DocumentType, string> = {
  QUOTE: 'Angebot',
  ORDER: 'Auftragsbestätigung',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Stornorechnung',
};

// Plural names (menu, tabs) and list route per document type. The editor lives under the same
// route (`/quotes/:id`), so the right menu entry stays highlighted.
export const DOCUMENT_TYPE_PLURAL: Record<DocumentType, string> = {
  QUOTE: 'Angebote',
  ORDER: 'Aufträge',
  INVOICE: 'Rechnungen',
  CREDIT_NOTE: 'Stornorechnungen',
};

export const DOCUMENT_NEW_LABEL: Record<DocumentType, string> = {
  QUOTE: 'Neues Angebot',
  ORDER: 'Neue Auftragsbestätigung',
  INVOICE: 'Neue Rechnung',
  CREDIT_NOTE: 'Neue Stornorechnung',
};

export const DOCUMENT_ROUTE: Record<DocumentType, string> = {
  QUOTE: '/quotes',
  ORDER: '/orders',
  INVOICE: '/invoices',
  CREDIT_NOTE: '/credit-notes',
};

export const documentPath = (type: DocumentType, id: string) => `${DOCUMENT_ROUTE[type]}/${id}`;

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

// Accepts numbers and the decimal strings returned by the API.
export function formatMoney(value: number | string | null | undefined): string {
  return euro.format(Number(value ?? 0));
}
