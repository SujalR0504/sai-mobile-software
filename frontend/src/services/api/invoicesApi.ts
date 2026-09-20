import { apiClient } from "./apiClient";

export interface InvoiceVerifiedData {
  success: boolean;
  type: "SALE" | "PURCHASE";
  shop: {
    name: string;
    tagline?: string;
    owner?: string;
    phone: string;
    address: string;
    gstin: string;
  };
  transaction: any;
  customer?: any;
  supplier?: any;
  customerDue?: number;
}

export const invoicesApi = {
  getInvoiceData: (id: string) => apiClient.get<InvoiceVerifiedData>(`/api/invoices/${id}`),
};
