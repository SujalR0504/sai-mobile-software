import { getProducts } from "../../db/repository";
import { checkEmployeePermission } from "../../services/permissionService";
import { addProduct, addUnits, deleteProduct, updateProduct } from "../../services/stockService";
import { bulkImportHierarchyAndProducts } from "../../services/categoryService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function productRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Bulk import products and category/subcategory/brand/model hierarchy
  if (pathname === "/api/products/bulk-import" && method === "POST") {
    const body = await request.json();
    const rows = Array.isArray(body) ? body : (body.rows || []);
    return jsonResponse(bulkImportHierarchyAndProducts(db, rows));
  }
  // Barcode & Product Quick Lookup
  if (pathname === "/api/barcode/lookup" && method === "GET") {
    const code = url.searchParams.get("code")?.trim() || "";
    if (!code) return errorResponse("Barcode required", 400, "VALIDATION_ERROR");

    // Search products by barcode, sku, model
    const prod = db.prepare(`
      SELECT * FROM products
      WHERE barcode = ? OR sku = ? OR model LIKE ?
    `).get(code, code, `%${code}%`) as any;

    if (!prod) {
      // Also check if code is an IMEI
      const unit = db.prepare("SELECT * FROM units WHERE imei1 = ? OR imei2 = ?").get(code, code) as any;
      if (unit) {
        const unitProd = db.prepare("SELECT * FROM products WHERE id = ?").get(unit.product_id) as any;
        return jsonResponse({ found: true, type: "IMEI", unit, product: unitProd });
      }
      return jsonResponse({ found: false, code });
    }

    const availableUnits = prod.tracked
      ? db.prepare("SELECT * FROM units WHERE product_id = ? AND status = 'available'").all(prod.id)
      : [];

    return jsonResponse({ found: true, type: "PRODUCT", product: prod, availableUnits });
  }

  // Products collection
  if (pathname === "/api/products") {
    if (method === "GET") return jsonResponse(getProducts(db));
    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing PRODUCT_CREATE permission", success: false }, 403);
        }
      }
      return jsonResponse(addProduct(db, body), 201);
    }
  }

  // Single Product
  const productMatch = pathname.match(/^\/api\/products\/([^/]+)$/);
  if (productMatch) {
    const id = productMatch[1];
    if (method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateProduct(db, id, body));
    }
    if (method === "DELETE") {
      const empId = request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "DELETE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing PRODUCT_DELETE permission", success: false }, 403);
        }
      }
      const force = url.searchParams.get("force") === "true";
      try {
        const result = deleteProduct(db, id, force);
        return jsonResponse(result);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to delete product", 400);
      }
    }
  }

  // Add Product Units
  const productUnitsMatch = pathname.match(/^\/api\/products\/([^/]+)\/units$/);
  if (productUnitsMatch && method === "POST") {
    const productId = productUnitsMatch[1];
    const body = await request.json();
    return jsonResponse(addUnits(db, productId, body.rows || []), 201);
  }

  return null;
}
