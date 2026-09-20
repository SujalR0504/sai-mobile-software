import type { RouteContext } from "../routes/types";
import { errorResponse } from "../routes/types";
import { checkPermission } from "../services/permissionService";
import { getAuthenticatedUser } from "./authMiddleware";

export function requirePermission(ctx: RouteContext, module: string, action: string = "VIEW"): boolean | Response {
  const user = getAuthenticatedUser(ctx);
  if (!user) {
    return errorResponse("Authentication required", 401, "UNAUTHORIZED");
  }

  const allowed = checkPermission(ctx.db, user.id, module, action);
  if (!allowed) {
    return errorResponse(`Forbidden: You do not have : permission`, 403, "FORBIDDEN");
  }

  return true;
}
