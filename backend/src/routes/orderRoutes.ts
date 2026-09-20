import {
  getOrders,
  getOrderById,
  createOrder,
  receiveOrderPayment,
  updateOrderStatus,
  assignOrderImei,
  convertOrderToSale,
  cancelOrder,
  getOrderReports,
} from "../services/orderService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function orderRoutes({
  request,
  pathname,
  method,
  db,
}: RouteContext): Promise<Response | null> {
  // 1. Order Reports
  if (pathname === "/api/orders/reports" && method === "GET") {
    try {
      const url = new URL(request.url);
      const startDate = url.searchParams.get("startDate") || undefined;
      const endDate = url.searchParams.get("endDate") || undefined;
      const reports = getOrderReports(db, { startDate, endDate });
      return jsonResponse(reports);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to load order reports", 400);
    }
  }

  // 2. Orders Collection: GET / POST
  if (pathname === "/api/orders") {
    if (method === "GET") {
      try {
        const url = new URL(request.url);
        const status = url.searchParams.get("status") || undefined;
        const paymentStatus = url.searchParams.get("paymentStatus") || undefined;
        const customerId = url.searchParams.get("customerId") || undefined;
        const search = url.searchParams.get("search") || undefined;
        const startDate = url.searchParams.get("startDate") || undefined;
        const endDate = url.searchParams.get("endDate") || undefined;

        const orders = getOrders(db, {
          status,
          paymentStatus,
          customerId,
          search,
          startDate,
          endDate,
        });
        return jsonResponse(orders);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to fetch orders", 400);
      }
    }

    if (method === "POST") {
      try {
        const body = await request.json();
        const created = createOrder(db, body);
        return jsonResponse(created, 201);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to create order", 400);
      }
    }
  }

  // 3. Receive Order Payment: POST /api/orders/:id/payments
  const payMatch = pathname.match(/^\/api\/orders\/([^/]+)\/payments$/);
  if (payMatch && method === "POST") {
    try {
      const orderId = payMatch[1];
      const body = await request.json();
      const updated = receiveOrderPayment(db, orderId, body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to receive order payment", 400);
    }
  }

  // 4. Convert Order to Sale: POST /api/orders/:id/convert-to-sale
  const convertMatch = pathname.match(/^\/api\/orders\/([^/]+)\/convert-to-sale$/);
  if (convertMatch && method === "POST") {
    try {
      const orderId = convertMatch[1];
      const body = await request.json();
      const result = convertOrderToSale(db, orderId, body);
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to convert order to sale", 400);
    }
  }

  // 5. Cancel Order: POST /api/orders/:id/cancel
  const cancelMatch = pathname.match(/^\/api\/orders\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    try {
      const orderId = cancelMatch[1];
      const body = await request.json();
      const cancelled = cancelOrder(db, orderId, body);
      return jsonResponse(cancelled);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to cancel order", 400);
    }
  }

  // 6. Update Order Status: PATCH /api/orders/:id/status
  const statusMatch = pathname.match(/^\/api\/orders\/([^/]+)\/status$/);
  if (statusMatch && (method === "PATCH" || method === "POST")) {
    try {
      const orderId = statusMatch[1];
      const body = await request.json();
      const updated = updateOrderStatus(db, orderId, body.status, body.remarks, body.user);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to update order status", 400);
    }
  }

  // 7. Assign IMEI: POST /api/orders/:id/assign-imei
  const imeiMatch = pathname.match(/^\/api\/orders\/([^/]+)\/assign-imei$/);
  if (imeiMatch && method === "POST") {
    try {
      const orderId = imeiMatch[1];
      const body = await request.json();
      const updated = assignOrderImei(
        db,
        orderId,
        body.itemId,
        body.unitId,
        body.imei,
        body.user
      );
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to assign IMEI to order", 400);
    }
  }

  // 8. Single Order: GET /api/orders/:id
  const singleMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (singleMatch && method === "GET") {
    try {
      const orderId = singleMatch[1];
      const order = getOrderById(db, orderId);
      if (!order) return errorResponse("Order not found", 404, "NOT_FOUND");
      return jsonResponse(order);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to get order", 400);
    }
  }

  return null;
}
