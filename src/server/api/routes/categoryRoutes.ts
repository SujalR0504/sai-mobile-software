import {
  createBrand,
  createCategory,
  createModel,
  createSubcategory,
  deleteBrand,
  deleteCategory,
  deleteModel,
  deleteSubcategory,
  getBrands,
  getCategories,
  getCategoryHierarchy,
  getModels,
  getSubcategories,
  updateBrand,
  updateCategory,
  updateModel,
  updateSubcategory,
} from "../../services/categoryService";
import { checkEmployeePermission } from "../../services/permissionService";
import { jsonResponse, type RouteContext } from "./types";

export async function categoryRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Categories Hierarchy Master Management
  if (pathname === "/api/categories") {
    if (method === "GET") return jsonResponse(getCategories(db));
    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing CATEGORY_CREATE permission", success: false }, 403);
        }
      }
      return jsonResponse(createCategory(db, body), 201);
    }
  }

  const catMatch = pathname.match(/^\/api\/categories\/([^/]+)$/);
  if (catMatch) {
    const catId = catMatch[1];
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateCategory(db, catId, body));
    }
    if (method === "DELETE") {
      deleteCategory(db, catId);
      return jsonResponse({ success: true });
    }
  }

  // Subcategories
  if (pathname === "/api/subcategories") {
    if (method === "GET") {
      const categoryId = url.searchParams.get("categoryId") || undefined;
      return jsonResponse(getSubcategories(db, categoryId));
    }
    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing SUBCATEGORY_CREATE permission", success: false }, 403);
        }
      }
      return jsonResponse(createSubcategory(db, body), 201);
    }
  }

  const subcatMatch = pathname.match(/^\/api\/subcategories\/([^/]+)$/);
  if (subcatMatch) {
    const subId = subcatMatch[1];
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateSubcategory(db, subId, body));
    }
    if (method === "DELETE") {
      deleteSubcategory(db, subId);
      return jsonResponse({ success: true });
    }
  }

  // Brands
  if (pathname === "/api/brands") {
    if (method === "GET") {
      const subcategoryId = url.searchParams.get("subcategoryId") || undefined;
      return jsonResponse(getBrands(db, subcategoryId));
    }
    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing BRAND_CREATE permission", success: false }, 403);
        }
      }
      return jsonResponse(createBrand(db, body), 201);
    }
  }

  const brandMatch = pathname.match(/^\/api\/brands\/([^/]+)$/);
  if (brandMatch) {
    const bId = brandMatch[1];
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateBrand(db, bId, body));
    }
    if (method === "DELETE") {
      deleteBrand(db, bId);
      return jsonResponse({ success: true });
    }
  }

  // Models
  if (pathname === "/api/models") {
    if (method === "GET") {
      const brandId = url.searchParams.get("brandId") || undefined;
      return jsonResponse(getModels(db, brandId));
    }
    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Products", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing MODEL_CREATE permission", success: false }, 403);
        }
      }
      return jsonResponse(createModel(db, body), 201);
    }
  }

  const modelMatch = pathname.match(/^\/api\/models\/([^/]+)$/);
  if (modelMatch) {
    const mId = modelMatch[1];
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateModel(db, mId, body));
    }
    if (method === "DELETE") {
      deleteModel(db, mId);
      return jsonResponse({ success: true });
    }
  }

  // Hierarchy
  if (pathname === "/api/categories/hierarchy" && method === "GET") {
    return jsonResponse(getCategoryHierarchy(db));
  }

  return null;
}
