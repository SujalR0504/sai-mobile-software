import { getSales } from "../../db/repository";
import { createSale, getSaleById, voidSale } from "../../services/salesService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function salesRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Sales collection
  if (pathname === "/api/sales") {
    if (method === "GET") return jsonResponse(getSales(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(createSale(db, body), 201);
    }
  }

  // Void Sale
  const saleVoidMatch = pathname.match(/^\/api\/sales\/([^/]+)\/void$/);
  if (saleVoidMatch && method === "POST") {
    const id = saleVoidMatch[1];
    const body = await request.json();
    voidSale(db, id, body.reason || "Voided by admin", body.user);
    return jsonResponse({ success: true, id });
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
