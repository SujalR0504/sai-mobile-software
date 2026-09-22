import type {
  DebitNote,
  DebitNoteReportRow,
  DealerCreditBalanceRow,
} from "../../lib/types";
import { apiClient } from "./apiClient";

export const debitNotesApi = {
  getDebitNotes: (filters?: {
    dealerId?: string;
    purchaseId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.dealerId) params.append("dealerId", filters.dealerId);
    if (filters?.purchaseId) params.append("purchaseId", filters.purchaseId);
    if (filters?.status && filters.status !== "ALL") params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.append("dateTo", filters.dateTo);

    const query = params.toString();
    return apiClient.get<DebitNote[]>(query ? `/api/debit-notes?${query}` : "/api/debit-notes");
  },

  getDebitNote: (id: string) => apiClient.get<DebitNote>(`/api/debit-notes/${id}`),

  createDebitNote: (body: any) => apiClient.post<DebitNote>("/api/debit-notes", body),

  applyDebitNote: (id: string, body: { targetPurchaseId: string; amount: number; notes?: string }) =>
    apiClient.post<DebitNote>(`/api/debit-notes/${id}/apply`, body),

  refundDebitNote: (
    id: string,
    body: {
      amount: number;
      paymentMethod: string;
      paymentAccountId?: string;
      referenceNumber?: string;
      remarks?: string;
    }
  ) => apiClient.post<DebitNote>(`/api/debit-notes/${id}/refund`, body),

  cancelDebitNote: (id: string, body: { reason: string }) =>
    apiClient.post<DebitNote>(`/api/debit-notes/${id}/cancel`, body),

  getReport: (filters?: { dateFrom?: string; dateTo?: string; dealerId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.append("dateTo", filters.dateTo);
    if (filters?.dealerId) params.append("dealerId", filters.dealerId);
    if (filters?.status && filters.status !== "ALL") params.append("status", filters.status);

    const query = params.toString();
    return apiClient.get<DebitNoteReportRow[]>(
      query ? `/api/reports/debit-notes?${query}` : "/api/reports/debit-notes"
    );
  },

  getDealerCreditBalances: () =>
    apiClient.get<DealerCreditBalanceRow[]>("/api/reports/dealer-credit-balance"),
};
