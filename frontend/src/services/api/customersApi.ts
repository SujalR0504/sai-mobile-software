import type { Customer, CustomerLedgerEntry } from "../../lib/types";
import { apiClient } from "./apiClient";

export interface CustomerOutstandingResponse {
  customerId: string;
  totalSales: number;
  totalPaid: number;
  totalDue: number;
  invoiceWiseDue: Array<{
    saleId: string;
    invoiceNo: string;
    date: string;
    total: number;
    paid: number;
    due: number;
  }>;
}

export const customersApi = {
  getCustomers: () => apiClient.get<Customer[]>("/api/customers"),

  addCustomer: (customer: Omit<Customer, "id" | "createdAt">) =>
    apiClient.post<Customer>("/api/customers", customer),

  updateCustomer: (id: string, patch: Partial<Customer>) =>
    apiClient.patch<Customer>(`/api/customers/${id}`, patch),

  getCustomerDue: (id: string) =>
    apiClient.get<{ customerId: string; due: number }>(`/api/customers/${id}/due`),

  getCustomerOutstanding: (id: string) =>
    apiClient.get<CustomerOutstandingResponse>(`/api/customers/${id}/outstanding`),

  getCustomerLedger: (id: string) =>
    apiClient.get<CustomerLedgerEntry[]>(`/api/ledgers/customer/${id}`),

  recordCustomerPayment: (
    customerId: string,
    data: {
      amount: number;
      paymentMethod?: string;
      paymentAccountId?: string;
      date?: string;
      referenceNumber?: string;
      remarks?: string;
    }
  ) =>
    apiClient.post<{
      success: boolean;
      id: string;
      customerId: string;
      amount: number;
      paymentMethod: string;
      paymentAccountId: string;
      accountBalance: number;
      newDue: number;
      date: string;
    }>(`/api/customers/${customerId}/payment`, data),
};

