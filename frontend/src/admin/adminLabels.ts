import { CompanyStatus } from './adminApi';
import { StatusLabel } from '../utils/labels';

export const COMPANY_STATUS: Record<CompanyStatus, StatusLabel> = {
  TRIAL: { label: 'Testphase', tone: 'info' },
  ACTIVE: { label: 'Aktiv', tone: 'success' },
  SUSPENDED: { label: 'Gesperrt', tone: 'error' },
  CANCELLED: { label: 'Gekündigt', tone: 'neutral' },
};

export const INVOICE_STATUS = {
  OPEN: { label: 'Offen', tone: 'warning' },
  PAID: { label: 'Bezahlt', tone: 'success' },
  VOID: { label: 'Storniert', tone: 'neutral' },
} as const;

export const ADMIN_ACTIONS: Record<string, string> = {
  COMPANY_SUSPENDED: 'Mandant gesperrt',
  COMPANY_ACTIVE: 'Mandant aktiviert',
  COMPANY_TRIAL: 'Testphase gesetzt',
  COMPANY_CANCELLED: 'Mandant gekündigt',
  COMPANY_UPDATE: 'Mandant geändert',
  IMPERSONATE: 'Support-Zugriff',
  PLAN_CREATE: 'Tarif angelegt',
  PLAN_UPDATE: 'Tarif geändert',
  INVOICE_RUN: 'Rechnungslauf',
  INVOICE_PAID: 'Rechnung bezahlt',
  INVOICE_VOID: 'Rechnung storniert',
  SETTINGS_UPDATE: 'Einstellungen geändert',
};
