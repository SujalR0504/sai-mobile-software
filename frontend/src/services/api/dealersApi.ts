import type { DebitNote, Supplier, SupplierLedgerEntry } from "../../lib/types";
import { apiClient } from "./apiClient";

export const dealersApi = {
  getDealers: () => apiClient.get<Supplier[]>("/api/dealers"),

  getDealer: (id: string) => apiClient.get<{ dealer: Supplier; due: number; purchases: any[]; payments: any[]; debitNotes: any[] }>(`/api/dealers/${id}`),

  addDealer: (dealer: Omit<Supplier, "id">) =>
    apiClient.post<Supplier>("/api/dealers", dealer),

  updateDealer: (id: string, patch: Partial<Supplier>) =>
    apiClient.patch<Supplier>(`/api/dealers/${id}`, patch),

  getDealerDue: (id: string) =>
    apiClient.get<{ dealerId: string; supplierId: string; due: number }>(`/api/dealers/${id}/due`),

  getDealerLedger: (id: string) =>
    apiClient.get<SupplierLedgerEntry[]>(`/api/ledgers/supplier/${id}`),

  getDebitNotes: (dealerId?: string) =>
    apiClient.get<DebitNote[]>(dealerId ? `/api/debit-notes?dealerId=${dealerId}` : "/api/debit-notes"),

  recordDebitNote: (body: any) =>
    apiClient.post<DebitNote>("/api/debit-notes", body),

  recordDealerPayment: (
    dealerId: string,
    data: {
      amount: number;
      paymentMethod: string;
      paymentAccountId?: string;
      referenceNo?: string;
      notes?: string;
      createdBy?: string;
    }
  ) =>
    apiClient.post<{ payment: any; ledger: any; accountTx?: any; newDue: number }>(
      `/api/dealers/${dealerId}/payment`,
      data
    ),
};
