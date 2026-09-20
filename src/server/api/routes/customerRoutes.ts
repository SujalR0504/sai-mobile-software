import { getCustomerLedger, getCustomers } from "../../db/repository";
import {
  addCustomer,
  getCustomerDue,
  getCustomerOutstandingBreakdown,
  updateCustomer,
} from "../../services/duesAndPaymentsService";
import { jsonResponse, type RouteContext } from "./types";

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

  // Update customer
  const customerMatch = pathname.match(/^\/api\/customers\/([^/]+)$/);
  if (customerMatch && method === "PATCH") {
    const id = customerMatch[1];
    const body = await request.json();
    return jsonResponse(updateCustomer(db, id, body));
  }

  return null;
}
