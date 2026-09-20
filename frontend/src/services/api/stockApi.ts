import type { StockMovement } from "../../lib/types";
import { apiClient } from "./apiClient";

export const stockApi = {
  getMovements: () => apiClient.get<StockMovement[]>("/api/stock/movements"),
  adjustStock: (body: any) => apiClient.post<{ success: boolean; movement: StockMovement }>("/api/stock/adjust", body),
  getLowStock: () => apiClient.get<any[]>("/api/stock/low"),
};
