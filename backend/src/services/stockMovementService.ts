import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { StockMovement, StockMovementType } from "../../../shared/types";
import { logAudit } from "./auditService";

export interface RecordMovementInput {
  businessId?: string;
  branchId?: string;
  productId: string;
  unitId?: string;
  imei?: string;
  movementType: StockMovementType;
  quantity: number;
  costPerUnit: number;
  referenceId?: string;
  notes?: string;
  createdBy?: string;
}

export function recordStockMovement(db: DatabaseSync, input: RecordMovementInput): StockMovement {
  const prod = db.prepare("SELECT name FROM products WHERE id = ?").get(input.productId) as any;
  const productName = prod?.name || "Product";
  const id = uid("mov");
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO stock_movements (id, business_id, branch_id, product_id, product_name, unit_id, imei, movement_type, quantity, qty, cost_per_unit, reference_id, notes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.businessId ?? "biz_default",
    input.branchId ?? "branch_01",
    input.productId,
    productName,
    input.unitId ?? null,
    input.imei ?? null,
    input.movementType,
    input.quantity,
    input.quantity,
    input.costPerUnit,
    input.referenceId ?? null,
    input.notes ?? null,
    input.createdBy ?? "System",
    now
  );

  return {
    id,
    businessId: input.businessId,
    branchId: input.branchId,
    productId: input.productId,
    productName,
    unitId: input.unitId,
    imei: input.imei,
    movementType: input.movementType,
    quantity: input.quantity,
    costPerUnit: input.costPerUnit,
    referenceId: input.referenceId,
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now,
  };
}

export interface AdjustStockInput {
  productId: string;
  type: "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "DAMAGE" | "LOSS";
  quantity: number;
  reason: string;
  adminApprovedBy?: string;
  user?: string;
}

export function adjustStock(db: DatabaseSync, input: AdjustStockInput): StockMovement {
  if (input.quantity <= 0) throw new Error("Quantity must be greater than 0");

  const prod = db.prepare("SELECT id, name, qty, purchase_price, tracked FROM products WHERE id = ?").get(input.productId) as any;
  if (!prod) throw new Error(`Product ${input.productId} not found`);

  db.exec("BEGIN TRANSACTION;");
  try {
    const isAdding = input.type === "ADJUSTMENT_IN";
    if (!isAdding && !prod.tracked && prod.qty < input.quantity) {
      throw new Error(`Cannot deduct ${input.quantity} units. Current stock is only ${prod.qty}`);
    }

    if (!prod.tracked) {
      if (isAdding) {
        db.prepare("UPDATE products SET qty = qty + ? WHERE id = ?").run(input.quantity, input.productId);
      } else {
        db.prepare("UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?").run(input.quantity, input.productId);
      }
    }

    const movement = recordStockMovement(db, {
      productId: input.productId,
      movementType: input.type,
      quantity: isAdding ? input.quantity : -input.quantity,
      costPerUnit: prod.purchase_price,
      notes: `${input.reason} (Approved by: ${input.adminApprovedBy || "Direct"})`,
      createdBy: input.user || "Staff",
    });

    logAudit(db, {
      userId: input.user,
      userName: input.user || "Staff",
      action: input.type,
      module: "STOCK",
      recordId: input.productId,
      newValue: { quantity: input.quantity, type: input.type },
      reason: input.reason,
      adminApprovedBy: input.adminApprovedBy,
    });

    db.exec("COMMIT;");
    return movement;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
