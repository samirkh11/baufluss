import { apiClient } from './client';
import { DunningLetter, DunningLevel, DunningPreview, DunningProposal, DunningSettings } from '../types';

export async function getDunningSettings(): Promise<DunningSettings> {
  const { data } = await apiClient.get<DunningSettings>('/dunning/settings');
  return data;
}

export async function updateDunningSettings(payload: Partial<Record<keyof DunningSettings, number | boolean>>): Promise<DunningSettings> {
  const { data } = await apiClient.put<DunningSettings>('/dunning/settings', payload);
  return data;
}

// Overdue invoices that are due for the next letter.
export async function getDunningProposals(): Promise<{ items: DunningProposal[]; totals: { count: number; open: string } }> {
  const { data } = await apiClient.get('/dunning/proposals');
  return data;
}

export async function listDunnings(documentId: string): Promise<DunningLetter[]> {
  const { data } = await apiClient.get<DunningLetter[]>(`/documents/${documentId}/dunnings`);
  return data;
}

export async function previewDunning(documentId: string, level?: DunningLevel): Promise<DunningPreview> {
  const { data } = await apiClient.get<DunningPreview>(`/documents/${documentId}/dunning-preview`, { params: { level } });
  return data;
}

export async function createDunning(documentId: string, level?: DunningLevel): Promise<DunningLetter> {
  const { data } = await apiClient.post<DunningLetter>(`/documents/${documentId}/dunnings`, { level });
  return data;
}

export async function setDunningBlock(documentId: string, blocked: boolean, reason?: string): Promise<{ dunningBlocked: boolean; dunningBlockReason: string | null }> {
  const { data } = await apiClient.patch(`/documents/${documentId}/dunning-block`, { blocked, reason });
  return data;
}

export async function deleteDunning(id: string): Promise<void> {
  await apiClient.delete(`/dunnings/${id}`);
}

// The PDF endpoint needs the auth header, so it is fetched as a blob and opened from an object URL.
export async function openDunningPdf(id: string): Promise<void> {
  const { data } = await apiClient.get<Blob>(`/dunnings/${id}/pdf`, { responseType: 'blob' });
  window.open(URL.createObjectURL(data), '_blank');
}
