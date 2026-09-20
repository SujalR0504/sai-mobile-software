import {
  createPaymentAccount,
  getAccountTransactions,
  getDefaultCashAccount,
  getPaymentAccountById,
  getPaymentAccounts,
  updatePaymentAccount,
} from "../services/paymentAccountService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function paymentAccountRoutes({
  request,
  url,
  pathname,
  method,
  db,
}: RouteContext): Promise<Response | null> {
  // Collection: /api/payment-accounts
  if (pathname === "/api/payment-accounts") {
    if (method === "GET") {
      return jsonResponse(getPaymentAccounts(db));
    }
    if (method === "POST") {
      try {
        const body = await request.json();
        const created = createPaymentAccount(db, body);
        return jsonResponse(created, 201);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to create payment account", 400, "BAD_REQUEST");
      }
    }
  }

  // Default cash account: /api/payment-accounts/default-cash
  if (pathname === "/api/payment-accounts/default-cash" && method === "GET") {
    return jsonResponse(getDefaultCashAccount(db));
  }

  // All transactions: /api/payment-accounts/transactions/all
  if (pathname === "/api/payment-accounts/transactions/all" && method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 100;
    return jsonResponse(getAccountTransactions(db, undefined, limit));
  }

  // Transactions for specific account: /api/payment-accounts/:id/transactions
  const txMatch = pathname.match(/^\/api\/payment-accounts\/([^/]+)\/transactions$/);
  if (txMatch && method === "GET") {
    const accountId = txMatch[1];
    const limit = Number(url.searchParams.get("limit")) || 100;
    return jsonResponse(getAccountTransactions(db, accountId, limit));
  }

  // Single account: /api/payment-accounts/:id
  const singleMatch = pathname.match(/^\/api\/payment-accounts\/([^/]+)$/);
  if (singleMatch) {
    const id = singleMatch[1];
    if (method === "GET") {
      const acct = getPaymentAccountById(db, id);
      if (!acct) return errorResponse("Payment Account not found", 404, "NOT_FOUND");
      return jsonResponse(acct);
    }
    if (method === "PATCH" || method === "PUT") {
      try {
        const body = await request.json();
        const updated = updatePaymentAccount(db, id, body);
        return jsonResponse(updated);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to update payment account", 400, "BAD_REQUEST");
      }
    }
  }

  return null;
}
