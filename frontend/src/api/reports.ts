import { apiClient } from './client';
import { Paginated, Report, ReportPhoto, ReportType } from '../types';

export interface ListReportsParams {
  q?: string;
  projectId?: string;
  type?: ReportType;
  authorId?: string;
  page?: number;
  pageSize?: number;
}

export interface ReportPayload {
  type?: ReportType;
  title?: string;
  reportDate?: string;
  weather?: string | null;
  workPerformed?: string | null;
  issues?: string | null;
  progressPercent?: number | null;
}

export async function listReports(params: ListReportsParams): Promise<Paginated<Report>> {
  const { data } = await apiClient.get<Paginated<Report>>('/reports', { params });
  return data;
}

export async function createReport(projectId: string, payload: ReportPayload): Promise<Report> {
  const { data } = await apiClient.post<Report>(`/projects/${projectId}/reports`, payload);
  return data;
}

export async function updateReport(id: string, payload: ReportPayload): Promise<Report> {
  const { data } = await apiClient.patch<Report>(`/reports/${id}`, payload);
  return data;
}

export async function deleteReport(id: string): Promise<void> {
  await apiClient.delete(`/reports/${id}`);
}

export async function addReportPhoto(id: string, file: File): Promise<ReportPhoto> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<ReportPhoto>(`/reports/${id}/photos`, formData);
  return data;
}

export async function removeReportPhoto(id: string, photoId: string): Promise<void> {
  await apiClient.delete(`/reports/${id}/photos/${photoId}`);
}
