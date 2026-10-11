import { apiClient } from './client';
import { BusinessDocument, Payment, PaymentMethod, PaymentTarget, Receivables } from '../types';

export interface PaymentPayload {
  paidAt: string;
  amount: number;
  method?: PaymentMethod;
  target?: PaymentTarget;
  reference?: string;
  note?: string;
}

// Incoming payment on an issued invoice (or refund paid out on a credit note).
export async function addPayment(documentId: string, payload: PaymentPayload): Promise<Payment> {
  const { data } = await apiClient.post<Payment>(`/documents/${documentId}/payments`, payload);
  return data;
}

export async function deletePayment(paymentId: string): Promise<void> {
  await apiClient.delete(`/payments/${paymentId}`);
}

// Cancels an issued invoice: creates the credit note (Stornorechnung) as a draft.
export async function cancelInvoice(documentId: string): Promise<BusinessDocument> {
  const { data } = await apiClient.post<BusinessDocument>(`/documents/${documentId}/cancel`);
  return data;
}

// Open items: unpaid amounts, retentions and refunds, oldest due date first.
export async function getReceivables(
  params: { overdueOnly?: boolean; customerId?: string } = {},
): Promise<Receivables> {
  const { data } = await apiClient.get<Receivables>('/receivables', { params });
  return data;
}
