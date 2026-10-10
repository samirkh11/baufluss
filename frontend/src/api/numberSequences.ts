import { apiClient } from './client';

export interface NumberSequence {
  id: string;
  documentType: string;
  prefix: string;
  nextNumber: number;
  digits: number;
  resetYearly: boolean;
}

export interface UpsertNumberSequencePayload {
  documentType: string;
  prefix?: string;
  nextNumber?: number;
  digits?: number;
  resetYearly?: boolean;
}

export async function listNumberSequences(): Promise<NumberSequence[]> {
  const { data } = await apiClient.get<NumberSequence[]>('/companies/me/number-sequences');
  return data;
}

export async function upsertNumberSequence(payload: UpsertNumberSequencePayload): Promise<NumberSequence> {
  const { data } = await apiClient.put<NumberSequence>('/companies/me/number-sequences', payload);
  return data;
}

export async function deleteNumberSequence(documentType: string): Promise<void> {
  await apiClient.delete(`/companies/me/number-sequences/${documentType}`);
}
