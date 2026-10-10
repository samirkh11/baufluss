import { apiClient } from './client';
import { Company } from '../types';

export async function getOwnCompany(): Promise<Company> {
  const { data } = await apiClient.get<Company>('/companies/me');
  return data;
}

export async function updateOwnCompany(payload: Partial<Company>): Promise<Company> {
  const { data } = await apiClient.patch<Company>('/companies/me', payload);
  return data;
}

export async function uploadCompanyLogo(file: File): Promise<Company> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<Company>('/companies/me/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
