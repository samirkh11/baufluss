import { apiClient } from './client';

export interface DashboardItem {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Money = { count: number; gross: string };

// Aggregated figures for the office widgets (GET /dashboard/office); money values are decimal strings.
export interface OfficeDashboard {
  openItems: {
    open: string;
    overdue: string;
    count: number;
    top: { documentId: string; documentType: string; number: string | null; recipientName: string | null; open: string; overdueDays: number }[];
  };
  dunning: { count: number; open: string };
  incoming: { toReview: Money; toPay: Money; nextDue: { number: string; supplier: string | null; gross: string; dueDate: string | null }[] };
  liquidity: { rows: { label: string; inflow: string; outflow: string; balance: string }[]; inflow: string; outflow: string; balance: string };
  quotes: { open: Money; accepted: Money; rejected: Money; staleOpen: number; acceptanceRate: number | null };
  unbilledOrders: { count: number; openNet: string; top: { id: string; number: string | null; project: string; openNet: string; percentBilled: number }[] };
  timeApprovals: { employees: number; hours: number; list: { name: string; hours: number }[] };
}

export async function getDashboardLayout(): Promise<DashboardItem[] | null> {
  const { data } = await apiClient.get<{ items: DashboardItem[] | null }>('/dashboard/layout');
  return data.items;
}

export async function saveDashboardLayout(items: DashboardItem[]): Promise<void> {
  await apiClient.put('/dashboard/layout', { items });
}

export async function resetDashboardLayout(): Promise<void> {
  await apiClient.delete('/dashboard/layout');
}

export async function getOfficeDashboard(): Promise<OfficeDashboard> {
  const { data } = await apiClient.get<OfficeDashboard>('/dashboard/office');
  return data;
}
