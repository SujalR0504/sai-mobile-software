import type {
  CancelOrderInput,
  ConvertOrderToSaleInput,
  CreateOrderInput,
  CustomerOrder,
  OrderStatus,
  ReceiveOrderPaymentInput,
  Sale,
} from "../../lib/types";
import { apiClient } from "./apiClient";

export interface OrderFilters {
  status?: string;
  paymentStatus?: string;
  customerId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

export const ordersApi = {
  getOrders: (filters?: OrderFilters) => {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.paymentStatus) params.set("paymentStatus", filters.paymentStatus);
    if (filters?.customerId) params.set("customerId", filters.customerId);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.startDate) params.set("startDate", filters.startDate);
    if (filters?.endDate) params.set("endDate", filters.endDate);
    const qs = params.toString();
    return apiClient.get<CustomerOrder[]>(`/api/orders${qs ? `?${qs}` : ""}`);
  },

  getOrder: (id: string) => apiClient.get<CustomerOrder>(`/api/orders/${id}`),

  createOrder: (data: CreateOrderInput) =>
    apiClient.post<CustomerOrder>("/api/orders", data),

  receivePayment: (orderId: string, data: ReceiveOrderPaymentInput) =>
    apiClient.post<CustomerOrder>(`/api/orders/${orderId}/payments`, data),

  convertToSale: (orderId: string, data: ConvertOrderToSaleInput) =>
    apiClient.post<{ sale: Sale; order: CustomerOrder }>(
      `/api/orders/${orderId}/convert-to-sale`,
      data
    ),

  cancelOrder: (orderId: string, data: CancelOrderInput) =>
    apiClient.post<CustomerOrder>(`/api/orders/${orderId}/cancel`, data),

  updateStatus: (orderId: string, status: OrderStatus, remarks?: string, user?: string) =>
    apiClient.patch<CustomerOrder>(`/api/orders/${orderId}/status`, {
      status,
      remarks,
      user,
    }),

  assignImei: (orderId: string, itemId: string, unitId: string, imei: string, user?: string) =>
    apiClient.post<CustomerOrder>(`/api/orders/${orderId}/assign-imei`, {
      itemId,
      unitId,
      imei,
      user,
    }),

  getOrderReports: (filters?: { startDate?: string; endDate?: string }) => {
    const params = new URLSearchParams();
    if (filters?.startDate) params.set("startDate", filters.startDate);
    if (filters?.endDate) params.set("endDate", filters.endDate);
    const qs = params.toString();
    return apiClient.get<any>(`/api/orders/reports${qs ? `?${qs}` : ""}`);
  },
};
