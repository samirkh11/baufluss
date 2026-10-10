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
