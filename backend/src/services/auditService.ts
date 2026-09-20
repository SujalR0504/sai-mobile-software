import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";

export interface LogAuditInput {
  businessId?: string;
  userId?: string;
  userName?: string;
  action: string;
  module: string;
  recordId?: string;
  oldValue?: any;
  newValue?: any;
  reason?: string;
  adminApprovedBy?: string;
}

export function logAudit(db: DatabaseSync, input: LogAuditInput): void {
  try {
    const id = uid("aud");
    const now = new Date().toISOString();
    const oldStr = input.oldValue !== undefined ? (typeof input.oldValue === "string" ? input.oldValue : JSON.stringify(input.oldValue)) : null;
    const newStr = input.newValue !== undefined ? (typeof input.newValue === "string" ? input.newValue : JSON.stringify(input.newValue)) : null;

    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, business_id, user_id, user_name, action, module, record_id, old_value, new_value, reason, admin_approved_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.businessId ?? "biz_default",
      input.userId ?? "system",
      input.userName ?? "System",
      input.action,
      input.module,
      input.recordId ?? null,
      oldStr,
      newStr,
      input.reason ?? null,
      input.adminApprovedBy ?? null,
      now
    );
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
