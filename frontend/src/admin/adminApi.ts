import axios from 'axios';
import { AuthUser } from '../types';

// The operator back office has its own token and API client, completely separate from the customer app.
const ADMIN_TOKEN_KEY = 'meisterwerk.adminToken';
const ADMIN_NAME_KEY = 'meisterwerk.adminName';

export const adminClient = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000' });

adminClient.interceptors.request.use((config) => {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
adminClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !String(error.config?.url).includes('/auth/login')) {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      if (window.location.pathname !== '/admin/login') window.location.href = '/admin/login';
    }
    return Promise.reject(error);
  },
);

export const hasAdminToken = () => !!localStorage.getItem(ADMIN_TOKEN_KEY);
export const adminName = () => localStorage.getItem(ADMIN_NAME_KEY) ?? '';
export function adminSignOut() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_NAME_KEY);
}

export type CompanyStatus = 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED';

export interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  priceMonthly: string;
  maxUsers: number | null;
  isActive: boolean;
  sortOrder: number;
  _count?: { companies: number };
}

export interface AdminCompanyRow {
  id: string;
  name: string;
  city: string | null;
  email: string | null;
  status: CompanyStatus;
  statusReason: string | null;
  trialEndsAt: string | null;
  plan: { id: string; name: string; priceMonthly: string } | null;
  createdAt: string;
  users: number;
  documents: number;
  projects: number;
  lastActivity: string | null;
  openInvoiceAmount: string;
}

export interface AdminInvoice {
  id: string;
  number: string;
  companyId: string;
  company?: { name: string };
  periodStart: string;
  periodEnd: string;
  planName: string;
  description: string;
  net: string;
  vat: string;
  gross: string;
  status: 'OPEN' | 'PAID' | 'VOID';
  issuedAt: string;
  dueDate: string;
  paidAt: string | null;
  overdue?: boolean;
}

export interface AdminCompanyDetail {
  id: string;
  name: string;
  legalForm: string | null;
  street: string | null;
  zipCode: string | null;
  city: string | null;
  email: string | null;
  phone: string | null;
  status: CompanyStatus;
  statusReason: string | null;
  trialEndsAt: string | null;
  operatorNotes: string | null;
  createdAt: string;
  lastActivity: string | null;
  plan: Plan | null;
  users: { id: string; email: string; firstName: string; lastName: string; role: string; isActive: boolean }[];
  platformInvoices: AdminInvoice[];
  _count: Record<string, number>;
}

export interface AdminStats {
  companies: number;
  byStatus: Record<CompanyStatus, number>;
  mrr: string;
  arr: string;
  openInvoices: { count: number; gross: string; overdue: number };
  trialsEnding: { id: string; name: string; trialEndsAt: string }[];
  signups: { month: string; count: number }[];
  topCompanies: { id: string; name: string; documents: number; users: number }[];
  newest: { id: string; name: string; status: CompanyStatus; createdAt: string }[];
}

export interface AdminSystem {
  status: string;
  node: string;
  uptimeSeconds: number;
  memoryMb: number;
  db: { latencyMs: number; sizeMb: number };
  totals: { users: number; documents: number; archivedFiles: number };
  files: { uploadsMb: number; storageMb: number };
  time: string;
}

export interface PlatformSettings {
  operatorName: string;
  street: string | null;
  zipCode: string | null;
  city: string | null;
  vatId: string | null;
  taxId: string | null;
  iban: string | null;
  bic: string | null;
  email: string | null;
  trialDays: number;
  vatRate: string;
  paymentTermDays: number;
  defaultPlanKey: string;
}

export async function adminLogin(email: string, password: string): Promise<void> {
  const { data } = await adminClient.post('/admin/auth/login', { email, password });
  localStorage.setItem(ADMIN_TOKEN_KEY, data.accessToken);
  localStorage.setItem(ADMIN_NAME_KEY, `${data.admin.firstName} ${data.admin.lastName}`);
}

const get = async <T>(url: string, params?: object) => (await adminClient.get<T>(url, { params })).data;
export const getStats = () => get<AdminStats>('/admin/stats');
export const getSystem = () => get<AdminSystem>('/admin/system');
export const listCompanies = (params: { status?: string; q?: string }) => get<AdminCompanyRow[]>('/admin/companies', params);
export const getCompany = (id: string) => get<AdminCompanyDetail>(`/admin/companies/${id}`);
export const updateCompany = async (id: string, payload: { status?: CompanyStatus; statusReason?: string; trialEndsAt?: string; planId?: string; operatorNotes?: string }) =>
  (await adminClient.patch<AdminCompanyDetail>(`/admin/companies/${id}`, payload)).data;
export const impersonate = async (companyId: string, userId?: string) =>
  (await adminClient.post<{ accessToken: string; user: AuthUser }>(`/admin/companies/${companyId}/impersonate`, { userId })).data;
export const listPlans = () => get<Plan[]>('/admin/plans');
export const createPlan = async (payload: Partial<Plan> & { priceMonthly?: number | string }) => (await adminClient.post<Plan>('/admin/plans', payload)).data;
export const updatePlan = async (id: string, payload: Partial<Omit<Plan, 'priceMonthly'>> & { priceMonthly?: number }) => (await adminClient.patch<Plan>(`/admin/plans/${id}`, payload)).data;
export const listInvoices = (params: { status?: string; companyId?: string }) => get<AdminInvoice[]>('/admin/invoices', params);
export const runInvoices = async (month: string) => (await adminClient.post<{ created: string[]; skipped: number }>('/admin/invoices/run', { month })).data;
export const payInvoice = async (id: string, paidAt?: string) => (await adminClient.post(`/admin/invoices/${id}/pay`, { paidAt })).data;
export const voidInvoice = async (id: string) => (await adminClient.post(`/admin/invoices/${id}/void`)).data;
export async function downloadInvoicePdf(id: string, number: string) {
  const { data } = await adminClient.get<Blob>(`/admin/invoices/${id}/pdf`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${number}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
export const listAdminLog = (params: { page: number; pageSize: number; companyId?: string }) =>
  get<{ items: { id: string; adminName: string; action: string; companyName: string | null; details: unknown; createdAt: string }[]; total: number }>('/admin/audit-log', params);
export const getSettings = () => get<PlatformSettings>('/admin/settings');
export const updateSettings = async (payload: Partial<PlatformSettings> & { vatRate?: number }) => (await adminClient.put<PlatformSettings>('/admin/settings', payload)).data;
