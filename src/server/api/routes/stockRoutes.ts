import { getStockMovements } from "../../db/repository";
import { checkEmployeePermission } from "../../services/permissionService";
import { adjustStock } from "../../services/stockMovementService";
import { getLowStockProducts } from "../../services/stockService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function stockRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Stock Movements
  if (pathname === "/api/stock/movements" && method === "GET") {
    return jsonResponse(getStockMovements(db));
  }

  // Stock Adjustment
  if (pathname === "/api/stock/adjust" && method === "POST") {
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Stock", "ADJUST");
      if (!allowed) {
        return errorResponse("Authorization Error: You do not have permission to adjust stock.", 403, "FORBIDDEN");
      }
    }
    const movement = adjustStock(db, body);
    return jsonResponse({ success: true, movement });
  }

  // Low Stock
  if (pathname === "/api/stock/low" && method === "GET") {
    return jsonResponse(getLowStockProducts(db));
  }

  return null;
}
