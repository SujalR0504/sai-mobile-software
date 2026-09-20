import type { DatabaseSync } from "node:sqlite";
import type { StockMovement, StockMovementType } from "../../../shared/types";

export function getStockMovements(db: DatabaseSync): StockMovement[] {
  const rows = db.prepare("SELECT * FROM stock_movements ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    unitId: r.unit_id ?? undefined,
    imei: r.imei ?? undefined,
    type: r.movement_type as StockMovementType,
    qty: r.quantity,
    cost: r.cost_per_unit,
    refId: r.reference_id ?? undefined,
    note: r.notes ?? undefined,
    user: r.created_by ?? undefined,
    timestamp: r.created_at,
  }));
}
