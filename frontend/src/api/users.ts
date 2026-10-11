import { apiClient } from './client';
import { CompanyUser } from '../types';

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role?: 'OWNER' | 'ADMIN' | 'MEMBER';
}

export async function listUsers(): Promise<CompanyUser[]> {
  const { data } = await apiClient.get<CompanyUser[]>('/users');
  return data;
}

export async function createUser(payload: CreateUserPayload): Promise<CompanyUser> {
  const { data } = await apiClient.post<CompanyUser>('/users', payload);
  return data;
}

export async function updateUser(id: string, payload: Partial<CreateUserPayload & { isActive: boolean }>): Promise<CompanyUser> {
  const { data } = await apiClient.patch<CompanyUser>(`/users/${id}`, payload);
  return data;
}

export async function deleteUser(id: string): Promise<void> {
  await apiClient.delete(`/users/${id}`);
}

// One profile picture per user; uploading again replaces it.
export async function setUserImage(id: string, file: File): Promise<CompanyUser> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<CompanyUser>(`/users/${id}/image`, formData);
  return data;
}

export async function removeUserImage(id: string): Promise<CompanyUser> {
  const { data } = await apiClient.delete<CompanyUser>(`/users/${id}/image`);
  return data;
}
