import { setAdminPin, verifyAdminPin, type RestrictedAction } from "../../services/adminAuthService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function authRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // 1. Authentication & User Session
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await request.json();

    // PIN Quick Switch login
    if (body.pin) {
      const valid = verifyAdminPin(db, body.pin, "ADMIN_OVERRIDE", "Quick PIN Switch Login");
      if (valid) {
        return jsonResponse({
          success: true,
          user: {
            id: "usr_owner",
            name: "Sanjay Sharma",
            email: "admin@mobilestore.in",
            role: "OWNER",
            branchId: "branch_01",
          },
        });
      } else {
        return errorResponse("Invalid PIN", 401, "AUTH_INVALID_PIN");
      }
    }

    // Email / Phone & Password login
    const identifier = (body.identifier || body.email || "").trim().toLowerCase();
    const password = (body.password || "").trim();

    let user = null;
    try {
      user = db.prepare("SELECT * FROM users WHERE LOWER(email) = ?").get(identifier) as any;
    } catch {}

    if (user) {
      return jsonResponse({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          branchId: user.branch_id || "branch_01",
        },
      });
    }

    // Fallback demo accounts
    const demoUsers: Record<string, { name: string; role: string; email: string }> = {
      "admin@mobilestore.in": { name: "Sanjay Sharma", role: "OWNER", email: "admin@mobilestore.in" },
      "sales@mobilestore.in": { name: "Vikram Sharma", role: "SALES", email: "sales@mobilestore.in" },
      "tech@mobilestore.in": { name: "Ramesh Kumar", role: "TECHNICIAN", email: "tech@mobilestore.in" },
      "accounts@mobilestore.in": { name: "Pooja Verma", role: "ACCOUNTANT", email: "accounts@mobilestore.in" },
    };

    if (demoUsers[identifier]) {
      return jsonResponse({
        success: true,
        user: {
          id: "usr_" + demoUsers[identifier].role.toLowerCase(),
          name: demoUsers[identifier].name,
          email: demoUsers[identifier].email,
          role: demoUsers[identifier].role,
          branchId: "branch_01",
        },
      });
    }

    return errorResponse("Invalid email/phone or password", 401, "AUTH_FAILED");
  }

  // Admin PIN Verification
  if (pathname === "/api/auth/verify-pin" && method === "POST") {
    const body = await request.json();
    const valid = verifyAdminPin(
      db,
      body.pin,
      body.action as RestrictedAction,
      body.reason || "Admin authorization requested",
      body.recordId,
      body.employeeId,
      body.employeeName
    );
    if (!valid) {
      return errorResponse("Invalid Admin Authorization PIN", 403, "PIN_INVALID");
    }
    return jsonResponse({ success: true, verified: true });
  }

  if (pathname === "/api/auth/set-pin" && method === "POST") {
    const body = await request.json();
    setAdminPin(db, body.pin, body.updatedBy);
    return jsonResponse({ success: true });
  }

  return null;
}
