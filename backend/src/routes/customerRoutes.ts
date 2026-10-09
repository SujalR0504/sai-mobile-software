import { getCustomerLedger, getCustomers } from "../repositories/repository";
import {
  addCustomer,
  deleteCustomer,
  getCustomerDue,
  getCustomerOutstandingBreakdown,
  recordCustomerPayment,
  updateCustomer,
} from "../services/duesAndPaymentsService";
import { checkEmployeePermission } from "../services/permissionService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function customerRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Customers collection
  if (pathname === "/api/customers") {
    if (method === "GET") return jsonResponse(getCustomers(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addCustomer(db, body), 201);
    }
  }

  // Customer outstanding breakdown (Section 17)
  const customerOutstandingMatch = pathname.match(/^\/api\/customers\/([^/]+)\/outstanding$/);
  if (customerOutstandingMatch && method === "GET") {
    const id = customerOutstandingMatch[1];
    const data = getCustomerOutstandingBreakdown(db, id);
    return jsonResponse(data);
  }

  // Customer Due (single value for backward compatibility)
  const customerDueMatch = pathname.match(/^\/api\/customers\/([^/]+)\/due$/);
  if (customerDueMatch && method === "GET") {
    const id = customerDueMatch[1];
    return jsonResponse({ customerId: id, due: getCustomerDue(db, id) });
  }

  // Customer Ledger
  if (pathname.startsWith("/api/ledgers/customer/")) {
    const customerId = pathname.replace("/api/ledgers/customer/", "");
    return jsonResponse(getCustomerLedger(db, customerId));
  }

  // Customer Payment (Section 19: Receive Payment)
  const customerPayMatch = pathname.match(/^\/api\/customers\/([^/]+)\/payment$/);
  if (customerPayMatch && method === "POST") {
    const id = customerPayMatch[1];
    try {
      const body = await request.json();
      const result = recordCustomerPayment(db, {
        customerId: id,
        ...body,
      });
      return jsonResponse(result, 201);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to record customer payment", 400, "BAD_REQUEST");
    }
  }

// Update or Delete customer
  const customerMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch) {
    const id = customerMatch[1];
    if (method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateCustomer(db, id, body));
    }
    if (method === "DELETE") {
      const url = new URL(request.url);
      let force = url.searchParams.get("force") === "true";
      let user = "Admin";
      let employeeId = request.headers.get("x-employee-id") || request.headers.get("x-user-id") || undefined;

      // Also allow reading force / employee info from JSON body if present
      try {
        const body = await request.json();
        if (body?.force !== undefined) force = Boolean(body.force);
        if (body?.employeeId) employeeId = body.employeeId;
        if (body?.user) user = body.user;
      } catch {
        // empty body ok
      }

      // Check permission if employee provided
      if (employeeId && !checkEmployeePermission(db, employeeId, "Customers", "DELETE")) {
        return errorResponse("User does not have permission to delete customers (Customers:DELETE required)", 403, "FORBIDDEN");
      }

      try {
        const result = deleteCustomer(db, id, force, user);
        return jsonResponse(result);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to delete customer", 400, "BAD_REQUEST");
      }
    }
  }

  return null;
}
