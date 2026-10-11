import { apiClient } from './client';
import { Contact, ContactType, Paginated } from '../types';

export interface ListContactsParams {
  q?: string;
  type?: ContactType;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

export type ContactPayload = Partial<Omit<Contact, 'id'>>;

export async function listContacts(params: ListContactsParams): Promise<Paginated<Contact>> {
  const { data } = await apiClient.get<Paginated<Contact>>('/contacts', { params });
  return data;
}

export async function createContact(payload: ContactPayload): Promise<Contact> {
  const { data } = await apiClient.post<Contact>('/contacts', payload);
  return data;
}

export async function updateContact(id: string, payload: ContactPayload): Promise<Contact> {
  const { data } = await apiClient.patch<Contact>(`/contacts/${id}`, payload);
  return data;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/contacts/${id}`);
}

// One picture per contact; uploading again replaces it.
export async function setContactImage(id: string, file: File): Promise<Contact> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<Contact>(`/contacts/${id}/image`, formData);
  return data;
}

export async function removeContactImage(id: string): Promise<Contact> {
  const { data } = await apiClient.delete<Contact>(`/contacts/${id}/image`);
  return data;
}
