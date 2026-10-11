import { apiClient } from './client';
import {
  BusinessDocument,
  ContractBilling,
  DocumentItemKind,
  DocumentStatus,
  DocumentType,
  InvoiceKind,
  Paginated,
} from '../types';

export interface ListDocumentsParams {
  q?: string;
  type?: DocumentType;
  status?: DocumentStatus;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export interface DocumentItemPayload {
  kind: DocumentItemKind;
  catalogItemId?: string;
  deductsDocumentId?: string;
  oz?: string;
  sku?: string;
  name: string;
  description?: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPercent: number;
  isOptional: boolean;
}

export interface DocumentPayload {
  recipientContactId?: string | null;
  subject?: string | null;
  introText?: string | null;
  closingText?: string | null;
  documentDate?: string;
  validUntil?: string | null;
  // Always the complete list; replaces the stored lines.
  items?: DocumentItemPayload[];
  // Invoices only
  invoice?: {
    serviceDateFrom?: string | null;
    serviceDateTo?: string | null;
    paymentTermDays?: number;
    reverseCharge?: boolean;
    retentionPercent?: number | null;
    retentionDueDate?: string | null;
    orderReference?: string | null;
    buyerReference?: string | null;
  };
}

export async function listDocuments(params: ListDocumentsParams): Promise<Paginated<BusinessDocument>> {
  const { data } = await apiClient.get<Paginated<BusinessDocument>>('/documents', { params });
  return data;
}

export async function getDocument(id: string): Promise<BusinessDocument> {
  const { data } = await apiClient.get<BusinessDocument>(`/documents/${id}`);
  return data;
}

export async function createDocument(
  projectId: string,
  type: DocumentType,
  payload: DocumentPayload = {},
): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/projects/${projectId}/documents`, {
    type,
    ...payload,
  });
  return data;
}

// Problems that would block issuing the (saved) document, e.g. missing service date; empty = ready.
export async function getDocumentIssues(id: string): Promise<string[]> {
  const { data } = await apiClient.get<{ issues: string[] }>(`/documents/${id}/issues`);
  return data.issues;
}

export async function updateDocument(id: string, payload: DocumentPayload): Promise<BusinessDocument> {
  const { data } = await apiClient.patch<BusinessDocument>(`/documents/${id}`, payload);
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}`);
}

export async function finalizeDocument(id: string): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/finalize`);
  return data;
}

export async function setDocumentStatus(
  id: string,
  status: 'ACCEPTED' | 'REJECTED',
): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/status`, { status });
  return data;
}

// Creates the next document of the chain as a draft: quote -> order, quote -> invoice, order -> invoice.
export interface ConvertOptions {
  targetType: 'ORDER' | 'INVOICE';
  // Invoices: complete (default), partial (Abschlag, needs percent or netAmount) or final (Schluss)
  invoiceKind?: InvoiceKind;
  percent?: number;
  netAmount?: number;
}

export async function convertDocument(id: string, options: ConvertOptions): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/convert`, options);
  return data;
}

// Billing overview of a quote/order: invoices so far, billed vs. open amount.
export async function getBilling(id: string): Promise<ContractBilling> {
  const { data } = await apiClient.get<ContractBilling>(`/documents/${id}/billing`);
  return data;
}

// Final invoice draft: rebuilds the deduction lines from the partial invoices issued so far.
export async function refreshDeductions(id: string): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/refresh-deductions`);
  return data;
}

export async function duplicateDocument(id: string): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/duplicate`);
  return data;
}

// The PDF endpoint needs the auth header, so it is fetched as a blob and opened from an object URL.
export async function openDocumentPdf(id: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/documents/${id}/pdf`, { responseType: 'blob' });
  window.open(URL.createObjectURL(data), '_blank');
}

export interface GaebImportResult {
  document: BusinessDocument;
  warnings: string[];
  source: { version: string | null; phase: string | null; name: string | null };
}

// Uploads a GAEB DA XML bill of quantities; the server creates a quote draft from it.
export async function importGaeb(projectId: string, file: File): Promise<GaebImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<GaebImportResult>(
    `/projects/${projectId}/documents/import-gaeb`,
    formData,
  );
  return data;
}

// Downloads the quote as GAEB X84 (with prices). Needs the auth header, so it goes through axios
// and is saved from an object URL.
export async function downloadGaeb(id: string): Promise<void> {
  const response = await apiClient.get<Blob>(`/documents/${id}/gaeb`, { responseType: 'blob' });
  const disposition: string = response.headers['content-disposition'] ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'Angebot.x84';
  const url = URL.createObjectURL(response.data);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
