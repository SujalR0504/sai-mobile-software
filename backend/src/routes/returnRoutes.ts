import { getReturns } from "../repositories/repository";
import { recordPurchaseReturn, recordSaleReturn } from "../services/returnService";
import { jsonResponse, type RouteContext } from "./types";

export async function returnRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Returns
  if (pathname === "/api/returns" && method === "GET") {
    return jsonResponse(getReturns(db));
  }

  if (pathname === "/api/returns/sale" && method === "POST") {
    const body = await request.json();
    return jsonResponse(recordSaleReturn(db, body), 201);
  }

  if (pathname === "/api/returns/purchase" && method === "POST") {
    const body = await request.json();
    return jsonResponse(recordPurchaseReturn(db, body), 201);
  }

  return null;
}
