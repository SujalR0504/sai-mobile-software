import type { Purchase, PurchaseAttachment } from "../../lib/types";
import { apiClient } from "./apiClient";

export const purchasesApi = {
  getPurchases: () => apiClient.get<Purchase[]>("/api/purchases"),
  getPurchase: (id: string) => apiClient.get<Purchase>(`/api/purchases/${id}`),
  checkDuplicate: (dealerId: string, invoiceNo: string) =>
    apiClient.get<{ exists: boolean; purchase?: Purchase }>(
      `/api/purchases/check-duplicate?dealerId=${encodeURIComponent(dealerId)}&invoiceNo=${encodeURIComponent(invoiceNo)}`
    ),
  recordPurchase: (input: any) => apiClient.post<Purchase>("/api/purchases", input),
  extractInvoice: (payload: any) => apiClient.post<any>("/api/purchases/extract-invoice", payload),

  getAttachments: (purchaseId: string) =>
    apiClient.get<PurchaseAttachment[]>(`/api/purchases/${purchaseId}/attachments`),
  saveAttachment: (purchaseId: string, attachment: { fileName: string; fileType: string; fileSize?: number; fileData: string }) =>
    apiClient.post<{ success: boolean; id: string }>(`/api/purchases/${purchaseId}/attachments`, attachment),
  deleteAttachment: (attachmentId: string) =>
    apiClient.delete<{ success: boolean; id: string }>(`/api/purchases/attachments/${attachmentId}`),

  getPayments: (purchaseId: string) =>
    apiClient.get<any[]>(`/api/purchases/${purchaseId}/payments`),
  recordPayment: (purchaseId: string, payment: any) =>
    apiClient.post<any>(`/api/purchases/${purchaseId}/payments`, payment),
  deletePayment: (purchaseId: string, paymentId: string) =>
    apiClient.delete<any>(`/api/purchases/${purchaseId}/payments/${paymentId}`),
};
