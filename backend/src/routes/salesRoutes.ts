import { getSales } from "../repositories/repository";
import {
  cancelSaleInvoice,
  createSale,
  getCancelledBills,
  getSaleById,
  updateInvoiceNote,
  voidSale,
} from "../services/salesService";
import { checkEmployeePermission } from "../services/permissionService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function salesRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  const url = new URL(request.url);

  // Cancelled Bills endpoint
  if (pathname === "/api/sales/cancelled" && method === "GET") {
    return jsonResponse(getCancelledBills(db));
  }

  // Sales collection
  if (pathname === "/api/sales") {
    if (method === "GET") {
      const status = url.searchParams.get("status") || undefined;
      const includeCancelled = url.searchParams.get("includeCancelled") === "true";
      return jsonResponse(getSales(db, { status, includeCancelled }));
    }
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(createSale(db, body), 201);
    }
  }

  // Cancel / Delete Sale Bill
  const saleCancelMatch = pathname.match(/^\/api\/sales\/([^/]+)\/cancel$/);
  if ((saleCancelMatch && method === "POST") || (pathname.match(/^\/api\/sales\/([^/]+)$/) && method === "DELETE")) {
    const id = saleCancelMatch ? saleCancelMatch[1] : pathname.split("/").pop()!;
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const employeeId = body.employeeId || body.userId;
    const userRole = body.role;

    // Check SALE_BILL_DELETE permission
    if (employeeId) {
      const allowed = checkEmployeePermission(db, employeeId, "SALE_BILL_DELETE");
      if (!allowed) {
        return errorResponse("User does not have permission to delete/cancel bills (SALE_BILL_DELETE required)", 403, "FORBIDDEN");
      }
    } else if (userRole && userRole.toUpperCase() !== "ADMIN" && userRole.toUpperCase() !== "OWNER") {
      return errorResponse("User does not have permission to delete/cancel bills (SALE_BILL_DELETE required)", 403, "FORBIDDEN");
    }

    const reason = body.reason || "Bill Cancelled";
    const user = body.user || body.userName || "Admin";

    try {
      const result = cancelSaleInvoice(db, id, reason, user, employeeId);
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to cancel bill", 400, "BAD_REQUEST");
    }
  }

  // Void Sale (Legacy endpoint preserved)
  const saleVoidMatch = pathname.match(/^\/api\/sales\/([^/]+)\/void$/);
  if (saleVoidMatch && method === "POST") {
    const id = saleVoidMatch[1];
    const body = await request.json();
    voidSale(db, id, body.reason || "Voided by admin", body.user);
    return jsonResponse({ success: true, id });
  }

  // Update Customer Note
  const saleNoteMatch = pathname.match(/^\/api\/sales\/([^/]+)\/note$/);
  if (saleNoteMatch && (method === "PATCH" || method === "POST")) {
    const id = saleNoteMatch[1];
    const body = await request.json();
    updateInvoiceNote(db, id, body.customerNote || body.note || "", body.user || "Admin");
    return jsonResponse({ success: true, id, customerNote: body.customerNote || body.note || "" });
  }

  // Single Sale
  const saleMatch = pathname.match(/^\/api\/sales\/([^/]+)$/);
  if (saleMatch && method === "GET") {
    const id = saleMatch[1];
    const sale = getSaleById(db, id);
    if (!sale) return errorResponse("Sale not found", 404, "NOT_FOUND");
    return jsonResponse(sale);
  }

  return null;
}
