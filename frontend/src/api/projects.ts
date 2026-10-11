import { apiClient } from './client';
import { Paginated, Project, ProjectStatus } from '../types';

export interface ListProjectsParams {
  q?: string;
  status?: ProjectStatus;
  customerId?: string;
  page?: number;
  pageSize?: number;
}

// null clears an optional field on update; memberIds replaces the whole team.
export interface ProjectPayload {
  name?: string;
  status?: ProjectStatus;
  description?: string | null;
  customerId?: string | null;
  siteStreet?: string | null;
  siteZipCode?: string | null;
  siteCity?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  managerId?: string | null;
  memberIds?: string[];
}

export async function listProjects(params: ListProjectsParams): Promise<Paginated<Project>> {
  const { data } = await apiClient.get<Paginated<Project>>('/projects', { params });
  return data;
}

export async function getProject(id: string): Promise<Project> {
  const { data } = await apiClient.get<Project>(`/projects/${id}`);
  return data;
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  const { data } = await apiClient.post<Project>('/projects', payload);
  return data;
}

export async function updateProject(id: string, payload: ProjectPayload): Promise<Project> {
  const { data } = await apiClient.patch<Project>(`/projects/${id}`, payload);
  return data;
}

export async function deleteProject(id: string): Promise<void> {
  await apiClient.delete(`/projects/${id}`);
}
