import type { Product, Unit } from "../../lib/types";
import { apiClient } from "./apiClient";

export const productsApi = {
  getProducts: () => apiClient.get<Product[]>("/api/products"),

  addProduct: (product: Omit<Product, "id"> & { id?: string; employeeId?: string }) =>
    apiClient.post<Product>("/api/products", product),

  updateProduct: (id: string, patch: Partial<Product>) =>
    apiClient.patch<Product>(`/api/products/${id}`, patch),

  addUnits: (productId: string, rows: Array<Omit<Unit, "id" | "productId" | "status">>) =>
    apiClient.post<Unit[]>(`/api/products/${productId}/units`, { rows }),

  lookupBarcode: (code: string) =>
    apiClient.get<{ found: boolean; type?: "PRODUCT" | "IMEI"; product?: Product; unit?: Unit; availableUnits?: Unit[]; code?: string }>(
      `/api/barcode/lookup?code=${encodeURIComponent(code)}`
    ),
};
