import type { Sale } from "../../lib/types";
import { apiClient } from "./apiClient";

export const salesApi = {
  getSales: () => apiClient.get<Sale[]>("/api/sales"),
  getSale: (id: string) => apiClient.get<Sale>(`/api/sales/${id}`),
  createSale: (saleData: any) => apiClient.post<Sale>("/api/sales", saleData),
  voidSale: (id: string, reason: string, user?: string) =>
    apiClient.post<{ success: boolean; id: string }>(`/api/sales/${id}/void`, { reason, user }),
};

export const returnsApi = {
  getReturns: () => apiClient.get<any[]>("/api/returns"),
  recordSaleReturn: (data: any) => apiClient.post<any>("/api/returns/sale", data),
  recordPurchaseReturn: (data: any) => apiClient.post<any>("/api/returns/purchase", data),
};
