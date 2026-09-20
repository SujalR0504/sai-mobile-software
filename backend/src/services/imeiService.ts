import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";
import type { Unit, UnitStatus } from "../../../shared/types";

export interface IMEIValidationResult {
  valid: boolean;
  imei: string;
  exists: boolean;
  status?: UnitStatus;
  productName?: string;
  productId?: string;
  unitId?: string;
  error?: string;
}

/**
 * Validates format and checks if an IMEI already exists in database inventory.
 */
export function validateIMEI(db: DatabaseSync, imei: string): IMEIValidationResult {
  const clean = (imei || "").trim();
  if (!clean) {
    return { valid: false, imei: clean, exists: false, error: "IMEI cannot be empty" };
  }

  // Mobile IMEI standard check (typically 14-16 numeric digits, but allow valid alphanumeric serials if used)
  const isDigits = /^\d{14,16}$/.test(clean);
  if (!isDigits && clean.length < 8) {
    return { valid: false, imei: clean, exists: false, error: "Invalid IMEI/Serial format: minimum 8 characters required" };
  }

  const existing = db.prepare(`
    SELECT u.id, u.product_id, u.status, p.name as product_name
    FROM units u
    LEFT JOIN products p ON u.product_id = p.id
    WHERE u.imei1 = ? OR u.imei2 = ? OR u.serial = ?
  `).get(clean, clean, clean) as any;

  if (existing) {
    return {
      valid: true,
      imei: clean,
      exists: true,
      status: existing.status as UnitStatus,
      productName: existing.product_name,
      productId: existing.product_id,
      unitId: existing.id,
    };
  }

  return {
    valid: true,
    imei: clean,
    exists: false,
  };
}

/**
 * Checks whether an IMEI or serial is a duplicate in DB.
 */
export function checkDuplicate(db: DatabaseSync, imei: string, excludeUnitId?: string): boolean {
  const clean = (imei || "").trim();
  if (!clean) return false;

  const query = excludeUnitId
    ? "SELECT id FROM units WHERE (imei1 = ? OR imei2 = ? OR serial = ?) AND id != ? LIMIT 1"
    : "SELECT id FROM units WHERE imei1 = ? OR imei2 = ? OR serial = ? LIMIT 1";

  const row = excludeUnitId
    ? db.prepare(query).get(clean, clean, clean, excludeUnitId)
    : db.prepare(query).get(clean, clean, clean);

  return Boolean(row);
}

/**
 * Retrieves unit and linked product details by IMEI or serial.
 */
export function getIMEI(db: DatabaseSync, imei: string) {
  const clean = (imei || "").trim();
  if (!clean) return null;

  const unit = db.prepare(`
    SELECT u.*, p.name as product_name, p.brand, p.model, p.selling_price as product_price
    FROM units u
    LEFT JOIN products p ON u.product_id = p.id
    WHERE u.imei1 = ? OR u.imei2 = ? OR u.serial = ?
  `).get(clean, clean, clean) as any;

  if (!unit) return null;

  return {
    id: unit.id,
    productId: unit.product_id,
    productName: unit.product_name,
    brand: unit.brand,
    model: unit.model,
    imei1: unit.imei1,
    imei2: unit.imei2 || undefined,
    serial: unit.serial || undefined,
    purchasePrice: unit.purchase_price,
    sellingPrice: unit.selling_price || unit.product_price,
    status: unit.status as UnitStatus,
    purchaseId: unit.purchase_id || undefined,
    saleId: unit.sale_id || undefined,
    customerId: unit.customer_id || undefined,
  };
}

/**
 * Creates an IMEI unit record in inventory.
 */
export function createIMEI(
  db: DatabaseSync,
  data: {
    productId: string;
    imei1: string;
    imei2?: string;
    serial?: string;
    purchasePrice: number;
    purchaseId?: string;
    status?: UnitStatus;
  }
): Unit {
  const cleanImei = data.imei1.trim();
  if (!cleanImei) throw new Error("IMEI1 is required");

  if (checkDuplicate(db, cleanImei)) {
    throw new Error(`IMEI '${cleanImei}' already exists in inventory`);
  }

  const id = uid("u");
  const status = data.status || "available";

  db.prepare(`
    INSERT INTO units (id, product_id, imei1, imei2, serial, purchase_price, status, purchase_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.productId,
    cleanImei,
    data.imei2?.trim() || null,
    data.serial?.trim() || null,
    data.purchasePrice,
    status,
    data.purchaseId || null
  );

  return {
    id,
    productId: data.productId,
    imei1: cleanImei,
    imei2: data.imei2?.trim(),
    serial: data.serial?.trim(),
    purchasePrice: data.purchasePrice,
    status,
    purchaseId: data.purchaseId,
  };
}

/**
 * Transitions unit status to available.
 */
export function markAvailable(db: DatabaseSync, unitId: string): void {
  db.prepare("UPDATE units SET status = 'available', sale_id = NULL, customer_id = NULL WHERE id = ?").run(unitId);
}

/**
 * Transitions unit status to sold.
 */
export function markSold(db: DatabaseSync, unitId: string, saleId: string, customerId?: string): void {
  db.prepare("UPDATE units SET status = 'sold', sale_id = ?, customer_id = ? WHERE id = ?").run(saleId, customerId || null, unitId);
}

/**
 * Transitions unit status to returned.
 */
export function markReturned(db: DatabaseSync, unitId: string): void {
  db.prepare("UPDATE units SET status = 'returned' WHERE id = ?").run(unitId);
}

/**
 * Transitions unit status to repair.
 */
export function markRepair(db: DatabaseSync, unitId: string): void {
  db.prepare("UPDATE units SET status = 'in_repair' WHERE id = ?").run(unitId);
}
