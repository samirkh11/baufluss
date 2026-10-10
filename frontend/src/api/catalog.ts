import { apiClient } from './client';
import { CatalogItem, CatalogItemKind, Paginated } from '../types';

export interface ListCatalogParams {
  q?: string;
  kind?: CatalogItemKind;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
}

// Prices are sent as numbers; the API returns them as decimal strings.
export interface CatalogItemPayload {
  kind?: CatalogItemKind;
  sku?: string;
  name?: string;
  description?: string;
  unit?: string;
  netPrice?: number;
  purchasePrice?: number;
  vatRate?: number;
  isActive?: boolean;
}

export async function listCatalogItems(params: ListCatalogParams): Promise<Paginated<CatalogItem>> {
  const { data } = await apiClient.get<Paginated<CatalogItem>>('/catalog-items', { params });
  return data;
}

export async function createCatalogItem(payload: CatalogItemPayload): Promise<CatalogItem> {
  const { data } = await apiClient.post<CatalogItem>('/catalog-items', payload);
  return data;
}

export async function updateCatalogItem(id: string, payload: CatalogItemPayload): Promise<CatalogItem> {
  const { data } = await apiClient.patch<CatalogItem>(`/catalog-items/${id}`, payload);
  return data;
}

export async function deleteCatalogItem(id: string): Promise<void> {
  await apiClient.delete(`/catalog-items/${id}`);
}
