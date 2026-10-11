import { apiClient } from './client';
import { BusinessDocument, DocumentItemKind, DocumentStatus, DocumentType, Paginated } from '../types';

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

export async function duplicateDocument(id: string): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${id}/duplicate`);
  return data;
}

// The PDF endpoint needs the auth header, so it is fetched as a blob and opened from an object URL.
export async function openDocumentPdf(id: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/documents/${id}/pdf`, { responseType: 'blob' });
  window.open(URL.createObjectURL(data), '_blank');
}
