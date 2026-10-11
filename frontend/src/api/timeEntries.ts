import { apiClient } from './client';
import { Paginated, TimeEntry, TimeSummary } from '../types';

export interface ListTimeEntriesParams {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  page?: number;
  pageSize?: number;
}

export interface TimePeriodParams {
  from: string;
  to: string;
  userId?: string;
  projectId?: string;
}

// Either a time range (startTime/endTime/breakMinutes) or a plain durationMinutes.
// null clears an optional field on update.
export interface TimeEntryPayload {
  userId?: string;
  projectId?: string | null;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  breakMinutes?: number;
  durationMinutes?: number;
  activity?: string | null;
  note?: string | null;
}

export async function listTimeEntries(params: ListTimeEntriesParams): Promise<Paginated<TimeEntry>> {
  const { data } = await apiClient.get<Paginated<TimeEntry>>('/time-entries', { params });
  return data;
}

export async function getRunningTimer(): Promise<TimeEntry | null> {
  const { data } = await apiClient.get<TimeEntry | ''>('/time-entries/running');
  return data === '' ? null : data;
}

export async function startTimer(payload: { projectId?: string; activity?: string }): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>('/time-entries/start', payload);
  return data;
}

export async function stopTimer(id: string, breakMinutes = 0): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>(`/time-entries/${id}/stop`, { breakMinutes });
  return data;
}

export async function createTimeEntry(payload: TimeEntryPayload): Promise<TimeEntry> {
  const { data } = await apiClient.post<TimeEntry>('/time-entries', payload);
  return data;
}

export async function updateTimeEntry(id: string, payload: TimeEntryPayload): Promise<TimeEntry> {
  const { data } = await apiClient.patch<TimeEntry>(`/time-entries/${id}`, payload);
  return data;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await apiClient.delete(`/time-entries/${id}`);
}

export async function getTimeSummary(params: TimePeriodParams): Promise<TimeSummary> {
  const { data } = await apiClient.get<TimeSummary>('/time-entries/summary', { params });
  return data;
}

// OWNER/ADMIN: release (or reopen) the finished entries of a period.
export async function approveTimeEntries(payload: {
  from: string;
  to: string;
  userId?: string;
}): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ count: number }>('/time-entries/approve', payload);
  return data;
}

export async function reopenTimeEntries(payload: {
  from: string;
  to: string;
  userId?: string;
}): Promise<{ count: number }> {
  const { data } = await apiClient.post<{ count: number }>('/time-entries/reopen', payload);
  return data;
}

// CSV download (OWNER/ADMIN); needs the auth header, so it goes through axios.
export async function downloadTimeCsv(params: TimePeriodParams): Promise<void> {
  const response = await apiClient.get<Blob>('/time-entries/export', { params, responseType: 'blob' });
  const disposition: string = response.headers['content-disposition'] ?? '';
  const filename = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? 'Zeiten.csv';
  const url = URL.createObjectURL(response.data);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
