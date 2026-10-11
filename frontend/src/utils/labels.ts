import { Project, ProjectStatus, ReportType } from '../types';

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
