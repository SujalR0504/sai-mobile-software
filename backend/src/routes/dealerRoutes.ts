import { getDebitNotes, getSupplierLedger, getSuppliers } from "../repositories/repository";
import {
  addSupplier,
  getSupplierDue,
  recordDealerPayment,
  updateSupplier,
} from "../services/duesAndPaymentsService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function dealerRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Dealers / Suppliers collection
  if (pathname === "/api/dealers" || pathname === "/api/suppliers") {
    if (method === "GET") return jsonResponse(getSuppliers(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addSupplier(db, body), 201);
    }
  }

  // Dealer Payment (Section 21: Pay Dealer)
  const dealerPayMatch = pathname.match(/^\/api\/(?:dealers|suppliers)\/([^/]+)\/payment$/);
  if (dealerPayMatch && method === "POST") {
    const id = dealerPayMatch[1];
    try {
      const body = await request.json();
      const result = recordDealerPayment(db, {
        dealerId: id,
        ...body,
      });
      return jsonResponse(result, 201);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to record dealer payment", 400, "BAD_REQUEST");
    }
  }

  // Single Dealer / Supplier
  const dealerMatch = pathname.match(/^\/api\/(?:dealers|suppliers)\/([^/]+)$/);
  if (dealerMatch) {
    const id = dealerMatch[1];
    if (method === "GET") {
      const dealer = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as any;
      if (!dealer) return errorResponse("Dealer not found", 404, "NOT_FOUND");
      const purchases = db.prepare("SELECT * FROM purchases WHERE supplier_id = ? ORDER BY date DESC").all(id);
      const payments = db.prepare("SELECT * FROM payments WHERE (party = 'supplier' OR party = 'dealer') AND party_id = ? ORDER BY date DESC").all(id);
      const debitNotes = getDebitNotes(db, id);
      const due = getSupplierDue(db, id);
      return jsonResponse({
        dealer: {
          id: dealer.id,
          name: dealer.name,
          company: dealer.company || dealer.name,
          phone: dealer.phone,
          mobile: dealer.mobile || dealer.phone,
          email: dealer.email,
          gstin: dealer.gstin,
          address: dealer.address,
          city: dealer.city,
          state: dealer.state,
          stateCode: dealer.state_code,
          contactPerson: dealer.contact_person,
        },
        due,
        purchases,
        payments,
        debitNotes,
      });
    }
    if (method === "PATCH" || method === "PUT") {
      const body = await request.json();
      return jsonResponse(updateSupplier(db, id, body));
    }
  }

  // Dealer Due
  const dealerDueMatch = pathname.match(/^\/api\/(?:dealers|suppliers)\/([^/]+)\/due$/);
  if (dealerDueMatch && method === "GET") {
    const id = dealerDueMatch[1];
    return jsonResponse({ dealerId: id, supplierId: id, due: getSupplierDue(db, id) });
  }

  // Dealer / Supplier Ledger
  if (pathname.startsWith("/api/ledgers/supplier/")) {
    const supplierId = pathname.replace("/api/ledgers/supplier/", "");
    return jsonResponse(getSupplierLedger(db, supplierId));
  }

  return null;
}
