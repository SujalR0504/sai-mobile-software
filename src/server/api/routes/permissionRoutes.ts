import { PERMISSION_ACTIONS, PERMISSION_MODULES } from "../../../lib/types";
import {
  bulkUpdateEmployeePermissions,
  checkEmployeePermission,
  copyRolePermissionsToEmployee,
  getEmployeePermissions,
  setEmployeePermission,
} from "../../services/permissionService";
import { jsonResponse, type RouteContext } from "./types";

export async function permissionRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Employee Permissions Matrix
  if (pathname === "/api/permissions/modules" && method === "GET") {
    return jsonResponse({
      modules: PERMISSION_MODULES,
      actions: PERMISSION_ACTIONS,
    });
  }

  const empPermMatch = pathname.match(/^\/api\/permissions\/employee\/([^/]+)$/);
  if (empPermMatch) {
    const employeeId = empPermMatch[1];
    if (method === "GET") {
      return jsonResponse(getEmployeePermissions(db, employeeId));
    }
    if (method === "POST") {
      const body = await request.json();
      setEmployeePermission(db, employeeId, body.module, body.action, body.allowed);
      return jsonResponse({ success: true });
    }
  }

  const empPermBulkMatch = pathname.match(/^\/api\/permissions\/employee\/([^/]+)\/bulk$/);
  if (empPermBulkMatch && method === "POST") {
    const employeeId = empPermBulkMatch[1];
    const body = await request.json();
    bulkUpdateEmployeePermissions(db, employeeId, body.permissions || []);
    return jsonResponse({ success: true, count: body.permissions?.length || 0 });
  }

  const empPermResetMatch = pathname.match(/^\/api\/permissions\/employee\/([^/]+)\/reset$/);
  if (empPermResetMatch && method === "POST") {
    const employeeId = empPermResetMatch[1];
    const body = await request.json();
    copyRolePermissionsToEmployee(db, employeeId, body.role);
    return jsonResponse({ success: true });
  }

  if (pathname === "/api/permissions/check" && method === "POST") {
    const body = await request.json();
    const allowed = checkEmployeePermission(db, body.employeeId, body.module, body.action);
    return jsonResponse({ allowed });
  }

  return null;
}
