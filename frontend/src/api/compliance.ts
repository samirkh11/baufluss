import { apiClient } from './client';

export interface ComplianceSettings {
  responsiblePerson: string | null;
  hostingDescription: string | null;
  backupDescription: string | null;
  retentionYearsInvoices: number;
  retentionYearsOther: number;
  datevAdvisorNumber: number | null;
  datevClientNumber: number | null;
  accountRevenue19: number;
  accountRevenue7: number;
  accountRevenueExempt: number;
  accountExpense19: number;
  accountExpense7: number;
  accountExpenseNoVat: number;
  accountBank: number;
  accountDebtorBase: number;
  accountCreditorBase: number;
}

export interface ArchiveCheck {
  checked: number;
  archivedDocuments: number;
  unarchivedDocuments: number;
  problems: { file: string; problem: 'MISSING' | 'ALTERED'; ref: string }[];
  ok: boolean;
}

export interface AuditEntry {
  id: string;
  userName: string;
  method: string;
  route: string;
  entityType: string;
  entityId: string | null;
  entityLabel: string | null;
  details: unknown;
  createdAt: string;
}

export interface ErasureInfo {
  alreadyErased: boolean;
  canDeleteCompletely: boolean;
  blockers: string[];
  retainUntil: string | null;
}

export async function getComplianceSettings(): Promise<ComplianceSettings> {
  const { data } = await apiClient.get<ComplianceSettings>('/compliance/settings');
  return data;
}

export async function updateComplianceSettings(payload: Partial<ComplianceSettings>): Promise<ComplianceSettings> {
  const { data } = await apiClient.put<ComplianceSettings>('/compliance/settings', payload);
  return data;
}

export async function verifyArchive(): Promise<ArchiveCheck> {
  const { data } = await apiClient.get<ArchiveCheck>('/compliance/archive/verify');
  return data;
}

export async function completeArchive(): Promise<{ archived: number }> {
  const { data } = await apiClient.post<{ archived: number }>('/compliance/archive/complete');
  return data;
}

export async function listAuditLog(params: { entityType?: string; q?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const { data } = await apiClient.get<{ items: AuditEntry[]; total: number }>('/compliance/audit-log', { params });
  return data;
}

export async function getErasureInfo(contactId: string): Promise<ErasureInfo> {
  const { data } = await apiClient.get<ErasureInfo>(`/compliance/contacts/${contactId}/erasure`);
  return data;
}

export async function eraseContact(contactId: string): Promise<{ result: 'deleted' | 'anonymized' }> {
  const { data } = await apiClient.post<{ result: 'deleted' | 'anonymized' }>(`/compliance/contacts/${contactId}/erase`);
  return data;
}

// Saves a response blob as a file. Server errors of blob requests arrive as Blob; they are unpacked so the
// readable message reaches the caller.
async function saveBlob(path: string, params: Record<string, string> | undefined, fallbackName: string): Promise<void> {
  try {
    const response = await apiClient.get<Blob>(path, { params, responseType: 'blob' });
    const disposition: string = response.headers['content-disposition'] ?? '';
    const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(response.data);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    const body = (error as { response?: { data?: unknown } }).response?.data;
    if (body instanceof Blob) {
      try {
        (error as { response: { data: unknown } }).response.data = JSON.parse(await body.text());
      } catch {
        // keep original
      }
    }
    throw error;
  }
}

export const downloadProcedureDocumentation = () => saveBlob('/compliance/procedure-documentation', undefined, 'Verfahrensdokumentation.pdf');
export const downloadPrivacyDocumentation = () => saveBlob('/compliance/privacy-documentation', undefined, 'Datenschutz.pdf');
export const downloadTaxAuditExport = (from: string, to: string) => saveBlob('/compliance/export/tax-audit', { from, to }, `Betriebspruefung_${from}_${to}.zip`);
export const downloadDatev = (from: string, to: string) => saveBlob('/compliance/export/datev', { from, to }, `EXTF_Buchungsstapel_${from}_${to}.csv`);

// JSON data export of one contact / employee (Art. 15 DSGVO) saved as a file.
async function saveJson(path: string, filename: string): Promise<void> {
  const { data } = await apiClient.get(path);
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
export const downloadContactExport = (id: string, label: string) => saveJson(`/compliance/contacts/${id}/export`, `Datenauskunft_${label}.json`);
export const downloadUserExport = (id: string, label: string) => saveJson(`/compliance/users/${id}/export`, `Datenauskunft_${label}.json`);
