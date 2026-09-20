import type { BrandMaster, CategoryMaster, ModelMaster, SubcategoryMaster } from "../../lib/types";
import { apiClient } from "./apiClient";

export const categoriesApi = {
  getCategories: () => apiClient.get<CategoryMaster[]>("/api/categories"),
  createCategory: (data: { name: string; description?: string; code?: string; employeeId?: string }) =>
    apiClient.post<CategoryMaster>("/api/categories", data),
  updateCategory: (id: string, patch: Partial<CategoryMaster>) =>
    apiClient.patch<CategoryMaster>(`/api/categories/${id}`, patch),
  deleteCategory: (id: string) => apiClient.delete<{ success: boolean }>(`/api/categories/${id}`),

  getSubcategories: (categoryId?: string) =>
    apiClient.get<SubcategoryMaster[]>(categoryId ? `/api/subcategories?categoryId=${categoryId}` : "/api/subcategories"),
  createSubcategory: (data: { categoryId: string; name: string; description?: string; employeeId?: string }) =>
    apiClient.post<SubcategoryMaster>("/api/subcategories", data),
  updateSubcategory: (id: string, patch: Partial<SubcategoryMaster>) =>
    apiClient.patch<SubcategoryMaster>(`/api/subcategories/${id}`, patch),
  deleteSubcategory: (id: string) => apiClient.delete<{ success: boolean }>(`/api/subcategories/${id}`),

  getBrands: (subcategoryId?: string) =>
    apiClient.get<BrandMaster[]>(subcategoryId ? `/api/brands?subcategoryId=${subcategoryId}` : "/api/brands"),
  createBrand: (data: { name: string; subcategoryId?: string; description?: string; employeeId?: string }) =>
    apiClient.post<BrandMaster>("/api/brands", data),
  updateBrand: (id: string, patch: Partial<BrandMaster>) =>
    apiClient.patch<BrandMaster>(`/api/brands/${id}`, patch),
  deleteBrand: (id: string) => apiClient.delete<{ success: boolean }>(`/api/brands/${id}`),

  getModels: (brandId?: string) =>
    apiClient.get<ModelMaster[]>(brandId ? `/api/models?brandId=${brandId}` : "/api/models"),
  createModel: (data: { brandId: string; name: string; basePrice?: number; description?: string; employeeId?: string }) =>
    apiClient.post<ModelMaster>("/api/models", data),
  updateModel: (id: string, patch: Partial<ModelMaster>) =>
    apiClient.patch<ModelMaster>(`/api/models/${id}`, patch),
  deleteModel: (id: string) => apiClient.delete<{ success: boolean }>(`/api/models/${id}`),

  getHierarchy: () => apiClient.get<CategoryMaster[]>("/api/categories/hierarchy"),
};
