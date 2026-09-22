import type {
  CreditNote,
  CreditNoteReportRow,
  CustomerCreditBalanceRow,
} from "../../lib/types";
import { apiClient } from "./apiClient";

export const creditNotesApi = {
  getCreditNotes: (filters?: {
    customerId?: string;
    saleId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => {
    const params = new URLSearchParams();
    if (filters?.customerId) params.append("customerId", filters.customerId);
    if (filters?.saleId) params.append("saleId", filters.saleId);
    if (filters?.status && filters.status !== "ALL") params.append("status", filters.status);
    if (filters?.search) params.append("search", filters.search);
    if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.append("dateTo", filters.dateTo);

    const query = params.toString();
    return apiClient.get<CreditNote[]>(query ? `/api/credit-notes?${query}` : "/api/credit-notes");
  },

  getCreditNote: (id: string) => apiClient.get<CreditNote>(`/api/credit-notes/${id}`),

  createCreditNote: (body: any) => apiClient.post<CreditNote>("/api/credit-notes", body),

  applyCreditNote: (id: string, body: { targetSaleId: string; amount: number; notes?: string }) =>
    apiClient.post<CreditNote>(`/api/credit-notes/${id}/apply`, body),

  refundCreditNote: (
    id: string,
    body: {
      amount: number;
      paymentMethod: string;
      paymentAccountId?: string;
      referenceNumber?: string;
      remarks?: string;
    }
  ) => apiClient.post<CreditNote>(`/api/credit-notes/${id}/refund`, body),

  cancelCreditNote: (id: string, body: { reason: string }) =>
    apiClient.post<CreditNote>(`/api/credit-notes/${id}/cancel`, body),

  getReport: (filters?: { dateFrom?: string; dateTo?: string; customerId?: string; status?: string }) => {
    const params = new URLSearchParams();
    if (filters?.dateFrom) params.append("dateFrom", filters.dateFrom);
    if (filters?.dateTo) params.append("dateTo", filters.dateTo);
    if (filters?.customerId) params.append("customerId", filters.customerId);
    if (filters?.status && filters.status !== "ALL") params.append("status", filters.status);

    const query = params.toString();
    return apiClient.get<CreditNoteReportRow[]>(
      query ? `/api/reports/credit-notes?${query}` : "/api/reports/credit-notes"
    );
  },

  getCustomerCreditBalances: () =>
    apiClient.get<CustomerCreditBalanceRow[]>("/api/reports/customer-credit-balance"),
};
