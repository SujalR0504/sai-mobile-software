import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";
import type { Product, Unit, UnitStatus } from "../../../shared/types";
import { getProducts, getUnits } from "../repositories/repository";
import { validateHierarchyRelationships } from "./categoryService";
import { recordStockMovement } from "./stockMovementService";

export function getProductStock(db: DatabaseSync, productId: string): number {
  const prod = db.prepare("SELECT tracked, qty FROM products WHERE id = ?").get(productId) as any;
  if (!prod) return 0;
  const count = db.prepare("SELECT COUNT(*) as count FROM units WHERE product_id = ? AND (status = 'available' OR status = 'IN_STOCK')").get(productId) as any;
  const unitCount = count ? count.count : 0;
  if (unitCount > 0) return unitCount;
  return prod.qty ?? 0;
}

export function addProduct(db: DatabaseSync, p: Omit<Product, "id"> & { id?: string; openingStock?: number }): Product {
  if (!p.name || !p.name.trim()) {
    throw new Error("Product name is required");
  }

  // Validate parent-child relationship integrity
  validateHierarchyRelationships(db, {
    categoryId: p.categoryId,
    subcategoryId: p.subcategoryId,
    brandId: p.brandId,
    modelId: p.modelId,
  });

  // Duplicate Variant Check:
  // Variant should not duplicate the same Model + RAM + Storage + Color combination
  if (p.modelId) {
    const existingVar = db.prepare(`
      SELECT id, name FROM products
      WHERE model_id = ?
        AND LOWER(TRIM(COALESCE(ram, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(storage, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(color, ''))) = LOWER(TRIM(?))
    `).get(p.modelId, p.ram || "", p.storage || "", p.color || "") as any;
    if (existingVar && (!p.id || existingVar.id !== p.id)) {
      throw new Error(`Variant for this model with RAM '${p.ram || "-"}', Storage '${p.storage || "-"}', and Color '${p.color || "-"}' already exists as '${existingVar.name}'.`);
    }
  } else if (p.brand && p.model && (p.ram || p.storage || p.color)) {
    const existingVar = db.prepare(`
      SELECT id, name FROM products
      WHERE LOWER(TRIM(brand)) = LOWER(TRIM(?))
        AND LOWER(TRIM(model)) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(ram, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(storage, ''))) = LOWER(TRIM(?))
        AND LOWER(TRIM(COALESCE(color, ''))) = LOWER(TRIM(?))
    `).get(p.brand, p.model, p.ram || "", p.storage || "", p.color || "") as any;
    if (existingVar && (!p.id || existingVar.id !== p.id)) {
      throw new Error(`Variant for '${p.brand} ${p.model}' with RAM '${p.ram || "-"}', Storage '${p.storage || "-"}', and Color '${p.color || "-"}' already exists as '${existingVar.name}'.`);
    }
  }

  // Duplicate SKU validation
  let sku = p.sku?.trim() || null;
  if (sku) {
    const existingSku = db.prepare("SELECT id, name FROM products WHERE sku = ?").get(sku) as any;
    if (existingSku && (!p.id || existingSku.id !== p.id)) {
      throw new Error(`SKU '${sku}' is already used by product '${existingSku.name}'`);
    }
  } else {
    // Generate SKU automatically if not entered
    const bPart = (p.brand || "GEN").replace(/[^a-zA-Z0-9]/g, "").slice(0, 3).toUpperCase();
    const mPart = (p.model || p.name || "MOD").replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
    const specPart = `${(p.ram || "").replace(/[^a-zA-Z0-9]/g, "")}${(p.storage || "").replace(/[^a-zA-Z0-9]/g, "")}`;
    const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    sku = `${bPart}-${mPart}${specPart ? "-" + specPart : ""}-${randPart}`;
  }

  // Duplicate Barcode validation
  if (p.barcode && p.barcode.trim()) {
    const existingBarcode = db.prepare("SELECT id, name FROM products WHERE barcode = ?").get(p.barcode.trim()) as any;
    if (existingBarcode && (!p.id || existingBarcode.id !== p.id)) {
      throw new Error(`Barcode '${p.barcode.trim()}' is already used by product '${existingBarcode.name}'`);
    }
  }

  const id = p.id || uid("p");
  const insertStmt = db.prepare(`
    INSERT INTO products (
      id, name, brand, model, variant, ram, storage, color,
      category, category_id, tracked, mrp, purchase_price, selling_price,
      gst, supplier_id, warranty_months, qty, reorder_level,
      subcategoryId_or_null, brand_id, model_id, sku, barcode, hsn, minimum_stock
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `.replace("subcategoryId_or_null", "subcategory_id"));

  let categoryName = p.category;
  if (!categoryName && p.categoryId) {
    const cat = db.prepare("SELECT name FROM categories WHERE id = ?").get(p.categoryId) as any;
    if (cat) categoryName = cat.name;
  }
  if (!categoryName) categoryName = "General";

  const brandName = p.brand || "Generic";
  const modelName = p.model || p.name || "Standard";

  const initialQty = (p.openingStock !== undefined && p.openingStock !== null && p.openingStock >= 0)
    ? p.openingStock
    : (p.qty || 0);

  insertStmt.run(
    id,
    p.name.trim(),
    brandName,
    modelName,
    p.variant ?? null,
    p.ram ?? null,
    p.storage ?? null,
    p.color ?? null,
    categoryName,
    p.categoryId ?? null,
    p.tracked ? 1 : 0,
    p.mrp ?? p.sellingPrice ?? 0,
    p.purchasePrice ?? 0,
    p.sellingPrice ?? 0,
    p.gst ?? 18,
    p.supplierId ?? p.dealerId ?? null,
    p.warrantyMonths ?? 12,
    initialQty,
    p.reorderLevel ?? p.minimumStock ?? 2,
    p.subcategoryId ?? null,
    p.brandId ?? null,
    p.modelId ?? null,
    sku,
    p.barcode?.trim() ?? null,
    p.hsn?.trim() ?? null,
    p.minimumStock ?? p.reorderLevel ?? 2
  );

  // Initialize stock movement if opening stock is entered
  if (initialQty > 0 && !p.tracked) {
    try {
      recordStockMovement(db, {
        productId: id,
        movementType: "ADJUSTMENT_IN",
        quantity: initialQty,
        costPerUnit: p.purchasePrice ?? 0,
        notes: "Opening Stock Initialization",
      });
    } catch (err) {
      console.error("Failed to record opening stock movement:", err);
    }
  }

  // Keep product_variants table in sync
  try {
    db.prepare(`
      INSERT OR REPLACE INTO product_variants (
        id, business_id, product_id, model_id, sku, barcode, ram, storage, color,
        mrp, purchase_price, selling_price, gst, hsn, qty, tracked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `var_${id}`,
      "biz_default",
      id,
      p.modelId ?? null,
      sku,
      p.barcode?.trim() ?? null,
      p.ram ?? null,
      p.storage ?? null,
      p.color ?? null,
      p.mrp ?? p.sellingPrice ?? 0,
      p.purchasePrice ?? 0,
      p.sellingPrice ?? 0,
      p.gst ?? 18,
      p.hsn?.trim() ?? null,
      initialQty,
      p.tracked ? 1 : 0,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("Failed to sync product_variants:", err);
  }

  return { ...p, id, sku: sku ?? undefined, qty: initialQty };
}

export function updateProduct(db: DatabaseSync, id: string, patch: Partial<Product>): Product {
  const current = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Product ${id} not found`);

  const updated: Product = {
    id,
    name: patch.name ?? current.name,
    brand: patch.brand ?? current.brand,
    model: patch.model ?? current.model,
    categoryId: patch.categoryId !== undefined ? patch.categoryId : (current.category_id ?? undefined),
    subcategoryId: patch.subcategoryId !== undefined ? patch.subcategoryId : (current.subcategory_id ?? undefined),
    brandId: patch.brandId !== undefined ? patch.brandId : (current.brand_id ?? undefined),
    modelId: patch.modelId !== undefined ? patch.modelId : (current.model_id ?? undefined),
    variant: patch.variant !== undefined ? patch.variant : (current.variant ?? undefined),
    ram: patch.ram !== undefined ? patch.ram : (current.ram ?? undefined),
    storage: patch.storage !== undefined ? patch.storage : (current.storage ?? undefined),
    color: patch.color !== undefined ? patch.color : (current.color ?? undefined),
    category: patch.category ?? current.category,
    tracked: patch.tracked !== undefined ? patch.tracked : Boolean(current.tracked),
    sku: patch.sku !== undefined ? patch.sku : (current.sku ?? undefined),
    barcode: patch.barcode !== undefined ? patch.barcode : (current.barcode ?? undefined),
    hsn: patch.hsn !== undefined ? patch.hsn : (current.hsn ?? undefined),
    mrp: patch.mrp !== undefined ? patch.mrp : current.mrp,
    purchasePrice: patch.purchasePrice !== undefined ? patch.purchasePrice : current.purchase_price,
    sellingPrice: patch.sellingPrice !== undefined ? patch.sellingPrice : current.selling_price,
    gst: patch.gst !== undefined ? patch.gst : current.gst,
    supplierId: patch.supplierId !== undefined ? patch.supplierId : (patch.dealerId !== undefined ? patch.dealerId : (current.supplier_id ?? undefined)),
    dealerId: patch.dealerId !== undefined ? patch.dealerId : (patch.supplierId !== undefined ? patch.supplierId : (current.supplier_id ?? undefined)),
    warrantyMonths: patch.warrantyMonths !== undefined ? patch.warrantyMonths : current.warranty_months,
    qty: patch.qty !== undefined ? patch.qty : current.qty,
    reorderLevel: patch.reorderLevel !== undefined ? patch.reorderLevel : current.reorder_level,
  };

  validateHierarchyRelationships(db, {
    categoryId: updated.categoryId,
    subcategoryId: updated.subcategoryId,
    brandId: updated.brandId,
    modelId: updated.modelId,
  });

  const updateStmt = db.prepare(`
    UPDATE products
    SET name = ?, brand = ?, model = ?, variant = ?, ram = ?, storage = ?, color = ?,
        category = ?, category_id = ?, tracked = ?, mrp = ?, purchase_price = ?, selling_price = ?,
        gst = ?, supplier_id = ?, warranty_months = ?, qty = ?, reorder_level = ?,
        subcategory_id = ?, brand_id = ?, model_id = ?, sku = ?, barcode = ?, hsn = ?
    WHERE id = ?
  `);

  updateStmt.run(
    updated.name,
    updated.brand,
    updated.model,
    updated.variant ?? null,
    updated.ram ?? null,
    updated.storage ?? null,
    updated.color ?? null,
    updated.category,
    updated.categoryId ?? null,
    updated.tracked ? 1 : 0,
    updated.mrp,
    updated.purchasePrice,
    updated.sellingPrice,
    updated.gst,
    updated.supplierId ?? null,
    updated.warrantyMonths,
    updated.qty,
    updated.reorderLevel,
    updated.subcategoryId ?? null,
    updated.brandId ?? null,
    updated.modelId ?? null,
    updated.sku ?? null,
    updated.barcode ?? null,
    updated.hsn ?? null,
    id
  );

  // Keep product_variants table in sync
  try {
    db.prepare(`
      INSERT OR REPLACE INTO product_variants (
        id, business_id, product_id, model_id, sku, barcode, ram, storage, color,
        mrp, purchase_price, selling_price, gst, hsn, qty, tracked, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `var_${id}`,
      "biz_default",
      id,
      updated.modelId ?? null,
      updated.sku ?? null,
      updated.barcode ?? null,
      updated.ram ?? null,
      updated.storage ?? null,
      updated.color ?? null,
      updated.mrp,
      updated.purchasePrice,
      updated.sellingPrice,
      updated.gst,
      updated.hsn ?? null,
      updated.qty,
      updated.tracked ? 1 : 0,
      new Date().toISOString()
    );
  } catch (err) {
    console.error("Failed to sync product_variants:", err);
  }

  return updated;
}

export function addUnits(
  db: DatabaseSync,
  productId: string,
  rows: Array<Omit<Unit, "id" | "productId" | "status">>
): Unit[] {
  const insertUnitStmt = db.prepare(`
    INSERT INTO units (id, product_id, imei1, imei2, serial, purchase_price, status)
    VALUES (?, ?, ?, ?, ?, ?, 'available')
  `);

  const createdUnits: Unit[] = [];
  db.exec("BEGIN TRANSACTION;");
  try {
    for (const r of rows) {
      const unitId = uid("u");
      insertUnitStmt.run(
        unitId,
        productId,
        r.imei1.trim(),
        r.imei2?.trim() ?? null,
        r.serial?.trim() ?? null,
        r.purchasePrice
      );
      createdUnits.push({
        id: unitId,
        productId,
        imei1: r.imei1.trim(),
        imei2: r.imei2?.trim(),
        serial: r.serial?.trim(),
        purchasePrice: r.purchasePrice,
        status: "available",
      });
    }
    db.exec("COMMIT;");
    return createdUnits;
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function setUnitStatus(db: DatabaseSync, unitId: string, status: UnitStatus): void {
  const stmt = db.prepare("UPDATE units SET status = ? WHERE id = ?");
  stmt.run(status, unitId);
}

export function getLowStockProducts(db: DatabaseSync): Array<{ product: Product; stock: number }> {
  const products = getProducts(db);
  const result: Array<{ product: Product; stock: number }> = [];

  for (const p of products) {
    const stock = getProductStock(db, p.id);
    if (stock <= p.reorderLevel) {
      result.push({ product: p, stock });
    }
  }

  return result.sort((a, b) => a.stock - b.stock);
}

export function searchImei(db: DatabaseSync, imeiQuery: string): Unit[] {
  const q = `%${imeiQuery.trim()}%`;
  const rows = db.prepare(`
    SELECT * FROM units
    WHERE imei1 LIKE ? OR imei2 LIKE ? OR serial LIKE ?
  `).all(q, q, q) as any[];

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    imei1: r.imei1,
    imei2: r.imei2 ?? undefined,
    serial: r.serial ?? undefined,
    purchasePrice: r.purchase_price,
    status: r.status as UnitStatus,
    purchaseId: r.purchase_id ?? undefined,
    saleId: r.sale_id ?? undefined,
    customerId: r.customer_id ?? undefined,
  }));
}

export function deleteProduct(
  db: DatabaseSync,
  id: string,
  force = false
): { success: boolean; id: string; name: string } {
  const prod = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
  if (!prod) {
    throw new Error(`Product with ID '${id}' not found`);
  }

  // Check if linked to sales
  const saleItemCount = (db.prepare("SELECT COUNT(*) as cnt FROM sale_items WHERE product_id = ?").get(id) as any)?.cnt || 0;
  
  // Check if linked to purchases
  const purchaseItemCount = (db.prepare("SELECT COUNT(*) as cnt FROM purchase_items WHERE product_id = ?").get(id) as any)?.cnt || 0;
  
  // Check if linked to repair parts
  const repairPartsCount = (db.prepare("SELECT COUNT(*) as cnt FROM repair_parts WHERE product_id = ?").get(id) as any)?.cnt || 0;
  
  // Check if linked to returns
  const returnItemsCount = (db.prepare("SELECT COUNT(*) as cnt FROM return_items WHERE product_id = ?").get(id) as any)?.cnt || 0;

  // Check if any units are sold or attached to transactions
  const soldUnitsCount = (db.prepare("SELECT COUNT(*) as cnt FROM units WHERE product_id = ? AND (sale_id IS NOT NULL OR status = 'sold' OR status = 'scrapped' OR status = 'returned')").get(id) as any)?.cnt || 0;

  const totalBlockers = saleItemCount + purchaseItemCount + repairPartsCount + returnItemsCount + soldUnitsCount;

  if (totalBlockers > 0 && !force) {
    const reasons: string[] = [];
    if (saleItemCount > 0) reasons.push(`${saleItemCount} sale item(s)`);
    if (purchaseItemCount > 0) reasons.push(`${purchaseItemCount} purchase item(s)`);
    if (repairPartsCount > 0) reasons.push(`${repairPartsCount} repair job(s)`);
    if (returnItemsCount > 0) reasons.push(`${returnItemsCount} return(s)`);
    if (soldUnitsCount > 0) reasons.push(`${soldUnitsCount} sold/allocated IMEI unit(s)`);
    
    throw new Error(
      `Cannot delete '${prod.name}' because it has transaction history: ${reasons.join(", ")}. If you really need to wipe it, use force delete.`
    );
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    if (force) {
      db.prepare("DELETE FROM return_items WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM repair_parts WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM purchase_items WHERE product_id = ?").run(id);
      db.prepare("DELETE FROM sale_items WHERE product_id = ?").run(id);
    }

    db.prepare("DELETE FROM stock_movements WHERE product_id = ?").run(id);
    db.prepare("DELETE FROM units WHERE product_id = ?").run(id);
    db.prepare("DELETE FROM product_variants WHERE product_id = ?").run(id);
    db.prepare("DELETE FROM products WHERE id = ?").run(id);

    db.exec("COMMIT;");
    return { success: true, id, name: prod.name };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

