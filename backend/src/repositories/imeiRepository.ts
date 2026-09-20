import type { DatabaseSync } from "node:sqlite";
import type { Unit, UnitStatus } from "../../../shared/types";

export function getUnits(db: DatabaseSync): Unit[] {
  const rows = db.prepare("SELECT * FROM units").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    imei1: r.imei1,
    imei2: r.imei2 ?? undefined,
    serial: r.serial ?? undefined,
    purchasePrice: r.purchase_price,
    sellingPrice: r.selling_price ?? undefined,
    status: r.status as UnitStatus,
    purchaseId: r.purchase_id ?? undefined,
    saleId: r.sale_id ?? undefined,
    customerId: r.customer_id ?? undefined,
  }));
}
