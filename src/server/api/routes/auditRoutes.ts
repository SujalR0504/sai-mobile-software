import { getAuditLogs, getCashbook, getExpenses, getPayments } from "../../db/repository";
import { logAudit } from "../../services/auditService";
import { addExpense, addPayment } from "../../services/duesAndPaymentsService";
import { jsonResponse, type RouteContext } from "./types";

export async function auditRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Audit Logs
  if (pathname === "/api/audit-logs") {
    if (method === "GET") return jsonResponse(getAuditLogs(db));
    if (method === "POST") {
      const body = await request.json();
      logAudit(db, body);
      return jsonResponse({ success: true }, 201);
    }
  }

  // Cashbook
  if (pathname === "/api/cashbook" && method === "GET") {
    return jsonResponse(getCashbook(db));
  }

  // Expenses
  if (pathname === "/api/expenses") {
    if (method === "GET") return jsonResponse(getExpenses(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addExpense(db, body), 201);
    }
  }

  // Payments
  if (pathname === "/api/payments") {
    if (method === "GET") return jsonResponse(getPayments(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addPayment(db, body), 201);
    }
  }

  return null;
}
