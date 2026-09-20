import type { EMICalculationResult, EMICalculatorInputs, EMIFinanceCompany } from "../../lib/types";
import { apiClient } from "./apiClient";

export const emiApi = {
  getCompanies: () => apiClient.get<EMIFinanceCompany[]>("/api/emi/companies"),
  createCompany: (company: any) => apiClient.post<EMIFinanceCompany>("/api/emi/companies", company),
  updateCompany: (id: string, patch: any) => apiClient.patch<EMIFinanceCompany>(`/api/emi/companies/${id}`, patch),
  deleteCompany: (id: string) => apiClient.delete<{ success: boolean }>(`/api/emi/companies/${id}`),

  getDashboard: () => apiClient.get<any>("/api/emi/dashboard"),

  getReceivables: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiClient.get<any[]>(`/api/emi/receivables${query}`);
  },
  getReceivable: (id: string) => apiClient.get<any>(`/api/emi/receivables/${id}`),

  recordReceipt: (receipt: any) => apiClient.post<any>("/api/emi/receipt", receipt),

  calculateEMI: (inputs: EMICalculatorInputs) =>
    apiClient.post<EMICalculationResult>("/api/emi/calculate", inputs),

  getAccounts: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiClient.get<any[]>(`/api/emi/accounts${query}`);
  },
  getAccount: (id: string) => apiClient.get<any>(`/api/emi/accounts/${id}`),
  createAccount: (accountData: any) => apiClient.post<any>("/api/emi/accounts", accountData),
  recordPayment: (accountId: string, paymentData: any) =>
    apiClient.post<any>(`/api/emi/accounts/${accountId}/payment`, paymentData),
  forecloseAccount: (accountId: string, data: any) =>
    apiClient.post<any>(`/api/emi/accounts/${accountId}/foreclose`, data),

  getReport: (params?: Record<string, string>) => {
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    return apiClient.get<any>(`/api/emi/reports/detailed${query}`);
  },
};
