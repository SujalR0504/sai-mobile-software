import type { PaymentAccount, PaymentAccountTransaction } from "../../lib/types";
import { apiClient } from "./apiClient";

export const paymentAccountsApi = {
  getPaymentAccounts: () => apiClient.get<PaymentAccount[]>("/api/payment-accounts"),

  createPaymentAccount: (data: {
    accountName: string;
    accountType: "CASH" | "UPI" | "BANK" | "CARD";
    bankName?: string;
    upiId?: string;
    accountNumber?: string;
    ifsc?: string;
    openingBalance?: number;
    isDefault?: boolean;
  }) => apiClient.post<PaymentAccount>("/api/payment-accounts", data),

  updatePaymentAccount: (id: string, patch: Partial<PaymentAccount>) =>
    apiClient.patch<PaymentAccount>(`/api/payment-accounts/${id}`, patch),

  getAccountTransactions: (accountId?: string, limit = 100) =>
    apiClient.get<PaymentAccountTransaction[]>(
      accountId
        ? `/api/payment-accounts/${accountId}/transactions?limit=${limit}`
        : `/api/payment-accounts/transactions/all?limit=${limit}`
    ),

  getDefaultCashAccount: () => apiClient.get<PaymentAccount>("/api/payment-accounts/default-cash"),
};
