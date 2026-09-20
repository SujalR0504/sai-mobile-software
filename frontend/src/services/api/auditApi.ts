import type { AuditLog, CashbookEntry, Expense, PaymentEntry } from "../../lib/types";
import { apiClient } from "./apiClient";

export const auditApi = {
  getAuditLogs: () => apiClient.get<AuditLog[]>("/api/audit-logs"),
  logAudit: (data: any) => apiClient.post<{ success: boolean }>("/api/audit-logs", data),
  getCashbook: () => apiClient.get<CashbookEntry[]>("/api/cashbook"),
  getExpenses: () => apiClient.get<Expense[]>("/api/expenses"),
  addExpense: (expense: Omit<Expense, "id">) => apiClient.post<Expense>("/api/expenses", expense),
  getPayments: () => apiClient.get<PaymentEntry[]>("/api/payments"),
  addPayment: (payment: Omit<PaymentEntry, "id">) => apiClient.post<PaymentEntry>("/api/payments", payment),
};
