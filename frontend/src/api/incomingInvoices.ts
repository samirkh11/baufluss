import { apiClient } from './client';
import { IncomingInvoice, IncomingInvoiceStatus } from '../types';

export interface IncomingInvoicePayload {
  supplierId?: string | null;
  supplierName?: string;
  invoiceNumber?: string;
  invoiceDate?: string;
  serviceDate?: string;
  dueDate?: string;
  description?: string;
  netAmount?: number;
  vatAmount?: number;
  grossAmount?: number;
  reverseCharge?: boolean;
  projectId?: string | null;
}

export interface IncomingInvoiceList {
  items: IncomingInvoice[];
  totals: Partial<Record<IncomingInvoiceStatus, { count: number; gross: string }>>;
}

export async function listIncomingInvoices(params: { status?: IncomingInvoiceStatus; q?: string; projectId?: string }): Promise<IncomingInvoiceList> {
  const { data } = await apiClient.get<IncomingInvoiceList>('/incoming-invoices', { params });
  return data;
}

export async function getIncomingInvoice(id: string): Promise<IncomingInvoice> {
  const { data } = await apiClient.get<IncomingInvoice>(`/incoming-invoices/${id}`);
  return data;
}

export async function uploadIncomingInvoice(file: File): Promise<IncomingInvoice> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<IncomingInvoice>('/incoming-invoices/upload', form);
  return data;
}

export async function createIncomingInvoice(payload: IncomingInvoicePayload): Promise<IncomingInvoice> {
  const { data } = await apiClient.post<IncomingInvoice>('/incoming-invoices', payload);
  return data;
}

export async function updateIncomingInvoice(id: string, payload: IncomingInvoicePayload): Promise<IncomingInvoice> {
  const { data } = await apiClient.patch<IncomingInvoice>(`/incoming-invoices/${id}`, payload);
  return data;
}

export async function incomingInvoiceAction(id: string, action: 'approve' | 'reject' | 'reopen' | 'pay', body?: { reason?: string; paidAt?: string }): Promise<IncomingInvoice> {
  const { data } = await apiClient.post<IncomingInvoice>(`/incoming-invoices/${id}/${action}`, body ?? {});
  return data;
}

export async function deleteIncomingInvoice(id: string): Promise<void> {
  await apiClient.delete(`/incoming-invoices/${id}`);
}

// The file endpoint needs the auth header, so it is fetched as a blob (object URL for preview/download).
export async function fetchIncomingInvoiceFile(id: string): Promise<Blob> {
  const { data } = await apiClient.get<Blob>(`/incoming-invoices/${id}/file`, { responseType: 'blob' });
  return data;
}
