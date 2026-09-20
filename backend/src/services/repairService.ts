import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { Repair, RepairPart, RepairStatus } from "../../../shared/types";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordCustomerLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";

export interface CreateRepairInput {
  customerId: string;
  customerMobile?: string;
  deviceBrand?: string;
  device: string;
  imei?: string;
  problem: string;
  physicalCondition?: string;
  accessoriesReceived?: string;
  estimate: number;
  advance: number;
  technician: string;
  warrantyStatus?: "ACTIVE" | "EXPIRED" | "NONE";
  expectedDeliveryDate?: string;
  user?: string;
}

export function generateJobId(db: DatabaseSync): string {
  const currentYear = new Date().getFullYear();
  const rows = db.prepare("SELECT job_id FROM repairs").all() as { job_id: string }[];
  const nums = rows
    .map((r) => Number(r.job_id.replace(/\D/g, "")))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 1000) + 1;
  return `REP-${currentYear}-${next}`;
}

export function addRepair(db: DatabaseSync, input: CreateRepairInput): Repair {
  const customer = db.prepare("SELECT id, name, phone FROM customers WHERE id = ?").get(input.customerId) as any;
  if (!customer) throw new Error(`Customer ${input.customerId} not found`);

  const id = uid("r");
  const jobId = generateJobId(db);
  const date = todayISO();
  const status = "RECEIVED";
  const advance = Math.max(0, input.advance || 0);

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertStmt = db.prepare(`
      INSERT INTO repairs (id, business_id, branch_id, job_id, customer_id, customer_mobile, device_brand, device, imei, problem, physical_condition, accessories_received, estimate, advance, technician, status, warranty_status, expected_delivery_date, created_at)
      VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      id,
      jobId,
      input.customerId,
      input.customerMobile || customer.phone,
      input.deviceBrand ?? null,
      input.device,
      input.imei?.trim() ?? null,
      input.problem,
      input.physicalCondition ?? null,
      input.accessoriesReceived ?? null,
      input.estimate,
      advance,
      input.technician,
      status,
      input.warrantyStatus ?? "NONE",
      input.expectedDeliveryDate ?? null,
      date
    );

    if (advance > 0) {
      const insertPaymentStmt = db.prepare(`
        INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, note)
        VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, 'Cash', ?)
      `);
      insertPaymentStmt.run(
        uid("pay"),
        date,
        input.customerId,
        jobId,
        advance,
        `Advance payment for repair ${jobId} (${input.device})`
      );

      recordCustomerLedger(db, input.customerId, "PAYMENT", jobId, 0, advance, `Advance for repair ${jobId}`);
      recordCashbookEntry(db, "REPAIR_ADVANCE_CASH", jobId, "Repairs", advance, 0, `Advance for repair job ${jobId}`);
    }

    logAudit(db, {
      userId: input.user,
      userName: input.user || input.technician,
      action: "REPAIR_CREATE",
      module: "REPAIRS",
      recordId: id,
      newValue: { jobId, device: input.device, problem: input.problem },
      reason: `Created repair job card ${jobId}`,
    });

    db.exec("COMMIT;");

    return {
      id,
      jobId,
      customerId: input.customerId,
      customerMobile: input.customerMobile || customer.phone,
      deviceBrand: input.deviceBrand,
      device: input.device,
      imei: input.imei,
      problem: input.problem,
      physicalCondition: input.physicalCondition,
      accessoriesReceived: input.accessoriesReceived,
      estimate: input.estimate,
      advance,
      technician: input.technician,
      status,
      warrantyStatus: input.warrantyStatus,
      expectedDeliveryDate: input.expectedDeliveryDate,
      partsUsed: [],
      createdAt: date,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export interface UseRepairPartInput {
  repairId: string;
  productId: string;
  qty: number;
  sellingPrice: number;
  user?: string;
}

export function useRepairPart(db: DatabaseSync, input: UseRepairPartInput): RepairPart {
  const repair = db.prepare("SELECT * FROM repairs WHERE id = ?").get(input.repairId) as any;
  if (!repair) throw new Error("Repair job not found");

  const prod = db.prepare("SELECT * FROM products WHERE id = ?").get(input.productId) as any;
  if (!prod) throw new Error("Product/part not found");

  if (!prod.tracked && prod.qty < input.qty) {
    throw new Error(`Insufficient stock for spare part '${prod.name}'. Current stock: ${prod.qty}`);
  }

  const id = uid("rpart");
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    // Deduct stock
    if (!prod.tracked) {
      db.prepare("UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?").run(input.qty, input.productId);
    }

    // Insert repair part record
    db.prepare(`
      INSERT INTO repair_parts (id, repair_id, product_id, part_name, qty, cost_price, selling_price, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.repairId,
      input.productId,
      prod.name,
      input.qty,
      prod.purchase_price,
      input.sellingPrice,
      now
    );

    // Create REPAIR_PART_USED stock movement
    recordStockMovement(db, {
      productId: input.productId,
      movementType: "REPAIR_PART_USED",
      quantity: -input.qty,
      costPerUnit: prod.purchase_price,
      referenceId: input.repairId,
      notes: `Used in repair job ${repair.job_id} (${repair.device})`,
      createdBy: input.user || repair.technician,
    });

    logAudit(db, {
      userId: input.user,
      userName: input.user || repair.technician,
      action: "REPAIR_PART_USED",
      module: "REPAIRS",
      recordId: input.repairId,
      newValue: { partName: prod.name, qty: input.qty, charge: input.sellingPrice },
      reason: `Spare part consumed in ${repair.job_id}`,
    });

    db.exec("COMMIT;");

    return {
      id,
      repairId: input.repairId,
      productId: input.productId,
      partName: prod.name,
      qty: input.qty,
      costPrice: prod.purchase_price,
      sellingPrice: input.sellingPrice,
    };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function setRepairStatus(
  db: DatabaseSync,
  id: string,
  status: string,
  user = "Technician"
): void {
  const repair = db.prepare("SELECT * FROM repairs WHERE id = ?").get(id) as any;
  if (!repair) throw new Error("Repair record not found");

  db.prepare("UPDATE repairs SET status = ? WHERE id = ?").run(status, id);

  logAudit(db, {
    userName: user,
    action: "REPAIR_STATUS_CHANGE",
    module: "REPAIRS",
    recordId: id,
    oldValue: repair.status,
    newValue: status,
    reason: `Repair status transitioned from ${repair.status} to ${status}`,
  });
}
