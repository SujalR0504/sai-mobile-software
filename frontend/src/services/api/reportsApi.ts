import { apiClient } from "./apiClient";

export const reportsApi = {
  getKPIs: () => apiClient.get<any>("/api/dashboard"),
  getValuation: () => apiClient.get<any>("/api/valuation"),
  getCategoryStockReport: () => apiClient.get<any[]>("/api/reports/categories"),
  getDealerReport: () => apiClient.get<any[]>("/api/reports/dealers"),
  getEMIReport: () => apiClient.get<any>("/api/reports/emi"),

  getItemWiseReport: (filters?: Record<string, string>) => {
    const query = filters ? "?" + new URLSearchParams(filters).toString() : "";
    return apiClient.get<any[]>(`/api/reports/item-wise${query}`);
  },

  getItemDrilldown: (productId: string) =>
    apiClient.get<any>(`/api/reports/item-wise/${productId}/drilldown`),

  getImeiWiseReport: (filters?: Record<string, string>) => {
    const query = filters ? "?" + new URLSearchParams(filters).toString() : "";
    return apiClient.get<any[]>(`/api/reports/imei-wise${query}`);
  },
};
