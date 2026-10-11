import { DocumentStatus, DocumentType, Project, ProjectStatus, ReportType } from '../types';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; color: string }> = {
  PLANNING: { label: 'In Planung', color: 'blue' },
  IN_PROGRESS: { label: 'In Ausführung', color: 'green' },
  ON_HOLD: { label: 'Pausiert', color: 'orange' },
  COMPLETED: { label: 'Abgeschlossen', color: 'default' },
  CANCELLED: { label: 'Abgebrochen', color: 'red' },
};

export const REPORT_TYPE: Record<ReportType, { label: string; color: string }> = {
  DAILY: { label: 'Tagesbericht', color: 'blue' },
  PROGRESS: { label: 'Baufortschritt', color: 'cyan' },
  DEFECT: { label: 'Mängelbericht', color: 'red' },
  ACCEPTANCE: { label: 'Abnahme', color: 'green' },
  INCIDENT: { label: 'Vorkommnis', color: 'volcano' },
  OTHER: { label: 'Sonstiges', color: 'default' },
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

export const DOCUMENT_STATUS: Record<DocumentStatus, { label: string; color: string }> = {
  DRAFT: { label: 'Entwurf', color: 'default' },
  SENT: { label: 'Ausgestellt', color: 'blue' },
  ACCEPTED: { label: 'Angenommen', color: 'green' },
  REJECTED: { label: 'Abgelehnt', color: 'red' },
};

export const DOCUMENT_TYPE: Record<DocumentType, string> = {
  QUOTE: 'Angebot',
  ORDER: 'Auftragsbestätigung',
  INVOICE: 'Rechnung',
  CREDIT_NOTE: 'Gutschrift',
};

// Plural names (menu, tabs) and list route per document type. The editor lives under the same
// route (`/quotes/:id`), so the right menu entry stays highlighted.
export const DOCUMENT_TYPE_PLURAL: Record<DocumentType, string> = {
  QUOTE: 'Angebote',
  ORDER: 'Aufträge',
  INVOICE: 'Rechnungen',
  CREDIT_NOTE: 'Gutschriften',
};

export const DOCUMENT_NEW_LABEL: Record<DocumentType, string> = {
  QUOTE: 'Neues Angebot',
  ORDER: 'Neue Auftragsbestätigung',
  INVOICE: 'Neue Rechnung',
  CREDIT_NOTE: 'Neue Gutschrift',
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
