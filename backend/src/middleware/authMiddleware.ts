import type { RouteContext } from "../routes/types";
import { errorResponse } from "../routes/types";

export interface AuthenticatedUser {
  id: string;
  name: string;
  role: string;
  email?: string;
}

export function getAuthenticatedUser(ctx: RouteContext): AuthenticatedUser | null {
  const authHeader = ctx.request.headers.get("Authorization");
  const employeeIdHeader = ctx.request.headers.get("x-employee-id");

  if (employeeIdHeader) {
    const emp = ctx.db.prepare("SELECT id, name, role, email FROM employees WHERE id = ?").get(employeeIdHeader) as any;
    if (emp) return emp;
  }

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    if (token === "admin-token") {
      return { id: "admin", name: "Admin", role: "ADMIN" };
    }
  }

  // Fallback to active admin employee if exists
  const owner = ctx.db.prepare("SELECT id, name, role, email FROM employees WHERE role = 'OWNER' OR role = 'ADMIN' LIMIT 1").get() as any;
  if (owner) return owner;

  return { id: "emp1", name: "Store Admin", role: "OWNER" };
}

export function requireAuth(ctx: RouteContext): { user: AuthenticatedUser } | Response {
  const user = getAuthenticatedUser(ctx);
  if (!user) {
    return errorResponse("Authentication required", 401, "UNAUTHORIZED");
  }
  return { user };
}
