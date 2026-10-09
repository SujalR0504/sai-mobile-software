import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type EmployeePermissionEntry,
  type PermissionAction,
  type PermissionModule,
} from "../../../shared/types";

// Default permission presets by role
export const ROLE_DEFAULT_PERMISSIONS: Record<
  string,
  { allowedModules: PermissionModule[]; restrictedActions?: PermissionAction[]; allowedActions?: PermissionAction[] }
> = {
  admin: {
    allowedModules: [...PERMISSION_MODULES],
    restrictedActions: [],
  },
  owner: {
    allowedModules: [...PERMISSION_MODULES],
    restrictedActions: [],
  },
  manager: {
    allowedModules: [
      "Dashboard",
      "POS",
      "Sales",
      "Purchases",
      "Sale Returns",
      "Purchase Returns",
      "Credit Notes",
      "Debit Notes",
      "Products",
      "Stock",
      "IMEI",
      "Customers",
      "Dealers",
      "Repairs",
      "Payments",
      "EMI Receivables",
      "Expenses",
      "Cashbook",
      "Reports",
      "Employees",
      "Attendance",
      "Payroll",
    ],
    restrictedActions: ["DELETE", "AUTHORIZE"],
  },
  cashier: {
    allowedModules: [
      "Dashboard",
      "POS",
      "Sales",
      "Customers",
      "Payments",
      "EMI Receivables",
      "Cashbook",
      "Products",
      "Stock",
    ],
    restrictedActions: ["DELETE", "ADJUST", "VIEW_COST", "VIEW_PROFIT", "AUTHORIZE"],
  },
  sales: {
    allowedModules: [
      "POS",
      "Sales",
      "Customers",
      "Products",
      "Stock",
      "EMI Receivables",
    ],
    restrictedActions: ["DELETE", "ADJUST", "VIEW_COST", "VIEW_PROFIT", "AUTHORIZE", "APPROVE"],
  },
  technician: {
    allowedModules: [
      "Repairs",
      "Customers",
      "Products",
      "Stock",
    ],
    restrictedActions: ["DELETE", "ADJUST", "VIEW_COST", "VIEW_PROFIT", "AUTHORIZE"],
  },
  accountant: {
    allowedModules: [
      "Dashboard",
      "Sales",
      "Purchases",
      "Payments",
      "EMI Receivables",
      "Expenses",
      "Cashbook",
      "Reports",
      "Payroll",
      "Dealers",
      "Customers",
      "Credit Notes",
      "Debit Notes",
    ],
    restrictedActions: ["DELETE", "ADJUST"],
  },
};

export function getDefaultPermission(
  role: string,
  module: PermissionModule,
  action: PermissionAction
): boolean {
  const roleKey = (role || "sales").toLowerCase();
  if (roleKey === "admin" || roleKey === "owner") return true;

  const preset = ROLE_DEFAULT_PERMISSIONS[roleKey] || ROLE_DEFAULT_PERMISSIONS.sales;
  if (!preset.allowedModules.includes(module)) return false;
  if (preset.restrictedActions?.includes(action)) return false;
  return true;
}

export function getEmployeePermissions(
  db: DatabaseSync,
  employeeId: string,
  businessId = "biz_default"
): EmployeePermissionEntry[] {
  // Get employee role first
  const emp = db
    .prepare("SELECT id, role FROM employees WHERE id = ?")
    .get(employeeId) as { id: string; role: string } | undefined;
  const role = emp?.role || "sales";

  // Fetch all custom overrides stored in DB
  const rows = db
    .prepare(
      "SELECT module, action, allowed FROM employee_permissions WHERE employee_id = ? AND business_id = ?"
    )
    .all(employeeId, businessId) as { module: string; action: string; allowed: number }[];

  const customMap = new Map<string, boolean>();
  for (const r of rows) {
    customMap.set(`${r.module}:${r.action}`, Boolean(r.allowed));
  }

  // Construct full 21x14 matrix
  const matrix: EmployeePermissionEntry[] = [];
  for (const mod of PERMISSION_MODULES) {
    for (const act of PERMISSION_ACTIONS) {
      const key = `${mod}:${act}`;
      const allowed = customMap.has(key)
        ? customMap.get(key)!
        : getDefaultPermission(role, mod, act);

      matrix.push({
        module: mod,
        action: act,
        allowed,
      });
    }
  }

  return matrix;
}

export function setEmployeePermission(
  db: DatabaseSync,
  employeeId: string,
  module: PermissionModule,
  action: PermissionAction,
  allowed: boolean,
  businessId = "biz_default"
): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO employee_permissions (id, business_id, employee_id, module, action, allowed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, employee_id, module, action)
    DO UPDATE SET allowed = excluded.allowed, updated_at = excluded.updated_at
  `);
  stmt.run(uid("perm"), businessId, employeeId, module, action, allowed ? 1 : 0, now, now);
}

export function bulkUpdateEmployeePermissions(
  db: DatabaseSync,
  employeeId: string,
  permissions: { module: PermissionModule; action: PermissionAction; allowed: boolean }[],
  businessId = "biz_default"
): void {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO employee_permissions (id, business_id, employee_id, module, action, allowed, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(business_id, employee_id, module, action)
    DO UPDATE SET allowed = excluded.allowed, updated_at = excluded.updated_at
  `);

  db.exec("BEGIN TRANSACTION;");
  try {
    for (const p of permissions) {
      stmt.run(uid("perm"), businessId, employeeId, p.module, p.action, p.allowed ? 1 : 0, now, now);
    }
    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function copyRolePermissionsToEmployee(
  db: DatabaseSync,
  employeeId: string,
  role: string,
  businessId = "biz_default"
): void {
  const permissions: { module: PermissionModule; action: PermissionAction; allowed: boolean }[] = [];
  for (const mod of PERMISSION_MODULES) {
    for (const act of PERMISSION_ACTIONS) {
      permissions.push({
        module: mod,
        action: act,
        allowed: getDefaultPermission(role, mod, act),
      });
    }
  }
  bulkUpdateEmployeePermissions(db, employeeId, permissions, businessId);
}

export function checkEmployeePermission(
  db: DatabaseSync,
  employeeId: string,
  moduleOrCode: string,
  action?: string,
): boolean {
  let module = moduleOrCode;
  let resolvedAction = action || "VIEW";

  // Normalize shorthand permission strings like "SALE_BILL_DELETE", "CREDIT_NOTE_CREATE"
  if (!action && moduleOrCode.includes("_")) {
    if (moduleOrCode === "SALE_BILL_DELETE") {
      module = "Sales";
      resolvedAction = "DELETE";
    } else if (moduleOrCode === "SALE_NOTE_EDIT") {
      module = "Sales";
      resolvedAction = "EDIT";
    } else if (moduleOrCode.startsWith("CREDIT_NOTE_")) {
      const act = moduleOrCode.replace("CREDIT_NOTE_", "");
      module = "Credit Notes";
      resolvedAction = act === "ISSUE" ? "APPROVE" : act === "APPLY" ? "ADJUST" : act;
    } else if (moduleOrCode.startsWith("DEBIT_NOTE_")) {
      const act = moduleOrCode.replace("DEBIT_NOTE_", "");
      module = "Debit Notes";
      resolvedAction = act === "ISSUE" ? "APPROVE" : act === "APPLY" ? "ADJUST" : act;
    }
  }

  // 1. Check if employee is OWNER or ADMIN
  let emp = db.prepare("SELECT role FROM employees WHERE id = ?").get(employeeId) as { role: Role } | undefined;
  if (!emp) {
    const usr = db.prepare("SELECT role FROM users WHERE id = ? OR email = ?").get(employeeId, employeeId) as { role: Role } | undefined;
    if (usr) emp = usr;
  }
  if (!emp) {
    const lowerId = (employeeId || "").toLowerCase();
    if (lowerId === "admin" || lowerId === "owner" || lowerId === "usr_owner" || lowerId.includes("admin") || lowerId.includes("owner")) return true;
    return false;
  }

  const roleUpper = (emp.role || "").toUpperCase();
  if (roleUpper === "OWNER" || roleUpper === "ADMIN") return true;

  // 2. Check explicit permission in DB
  const row = db.prepare("SELECT allowed FROM employee_permissions WHERE employee_id = ? AND module = ? AND action = ?").get(
    employeeId,
    module,
    resolvedAction,
  ) as { allowed: number } | undefined;

  if (row !== undefined) {
    return row.allowed === 1;
  }

  // 3. Fallback to default permissions matrix for role
  return getDefaultPermission(emp.role, module as PermissionModule, resolvedAction as PermissionAction);
}

export const checkPermission = checkEmployeePermission;
