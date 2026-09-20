import type { DatabaseSync } from "node:sqlite";
import crypto from "node:crypto";
import { logAudit } from "./auditService";

export type RestrictedAction =
  | "STOCK_ADJUSTMENT"
  | "CHANGE_PURCHASE_COST"
  | "PRICE_OVERRIDE"
  | "NEGATIVE_STOCK_OVERRIDE"
  | "FINANCIAL_TRANSACTION_VOID"
  | "PAYMENT_DELETE"
  | "LARGE_REFUND"
  | "EMPLOYEE_PERMISSION_CHANGE"
  | "PAYROLL_APPROVAL"
  | "SYSTEM_SETTINGS_CHANGE";

export const RESTRICTED_ACTIONS: RestrictedAction[] = [
  "STOCK_ADJUSTMENT",
  "CHANGE_PURCHASE_COST",
  "PRICE_OVERRIDE",
  "NEGATIVE_STOCK_OVERRIDE",
  "FINANCIAL_TRANSACTION_VOID",
  "PAYMENT_DELETE",
  "LARGE_REFUND",
  "EMPLOYEE_PERMISSION_CHANGE",
  "PAYROLL_APPROVAL",
  "SYSTEM_SETTINGS_CHANGE",
];

function hashPin(pin: string): string {
  return crypto.createHash("sha256").update(pin.trim()).digest("hex");
}

export function verifyAdminPin(
  db: DatabaseSync,
  pin: string,
  action: RestrictedAction,
  reason: string,
  recordId?: string,
  employeeId?: string,
  employeeName?: string
): boolean {
  if (!pin) return false;
  const hashed = hashPin(pin);

  const row = db.prepare("SELECT pin_hash FROM admin_pins WHERE business_id = 'biz_default'").get() as any;
  const validHash = row?.pin_hash || hashPin("1234");

  if (hashed !== validHash) {
    logAudit(db, {
      userId: employeeId ?? "unknown",
      userName: employeeName ?? "Employee",
      action: `FAILED_${action}_ATTEMPT`,
      module: "SECURITY",
      recordId,
      reason: `Unauthorized attempt: incorrect Admin PIN for ${action}`,
    });
    return false;
  }

  // Record successful admin override in audit log
  logAudit(db, {
    userId: employeeId ?? "admin",
    userName: employeeName ?? "Admin Approver",
    action: `ADMIN_AUTHORIZED_${action}`,
    module: "SECURITY",
    recordId,
    reason,
    adminApprovedBy: "Admin via PIN Authorization",
  });

  return true;
}

export function setAdminPin(db: DatabaseSync, newPin: string, updatedBy = "Owner"): void {
  if (newPin.length < 4) {
    throw new Error("Admin PIN must be at least 4 digits");
  }
  const hashed = hashPin(newPin);
  const now = new Date().toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO admin_pins (id, business_id, pin_hash, created_by, updated_at)
    VALUES ('pin_default', 'biz_default', ?, ?, ?)
  `).run(hashed, updatedBy, now);

  logAudit(db, {
    userName: updatedBy,
    action: "ADMIN_PIN_UPDATED",
    module: "SETTINGS",
    reason: "Store Admin Authorization PIN changed",
  });
}
