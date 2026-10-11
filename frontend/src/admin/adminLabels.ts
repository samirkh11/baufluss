import { CompanyStatus } from './adminApi';

export const COMPANY_STATUS: Record<CompanyStatus, { label: string; color: string }> = {
  TRIAL: { label: 'Testphase', color: 'blue' },
  ACTIVE: { label: 'Aktiv', color: 'green' },
  SUSPENDED: { label: 'Gesperrt', color: 'red' },
  CANCELLED: { label: 'Gekündigt', color: 'default' },
};

export const INVOICE_STATUS = {
  OPEN: { label: 'Offen', color: 'gold' },
  PAID: { label: 'Bezahlt', color: 'green' },
  VOID: { label: 'Storniert', color: 'default' },
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
