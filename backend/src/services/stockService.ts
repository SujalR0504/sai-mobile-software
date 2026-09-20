import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";
import type { Product, Unit, UnitStatus } from "../../../shared/types";
import { getProducts, getUnits } from "../repositories/repository";
import { validateHierarchyRelationships } from "./categoryService";

export function getProductStock(db: DatabaseSync, productId: string): number {
  const prod = db.prepare("SELECT tracked, qty FROM products WHERE id = ?").get(productId) as any;
  if (!prod) return 0;
  if (!prod.tracked) return prod.qty;
  const count = db.prepare("SELECT COUNT(*) as count FROM units WHERE product_id = ? AND status = 'available'").get(productId) as any;
  return count ? count.count : 0;
}

export function addProduct(db: DatabaseSync, p: Omit<Product, "id"> & { id?: string }): Product {
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

  // Duplicate SKU validation
  if (p.sku && p.sku.trim()) {
    const existingSku = db.prepare("SELECT id, name FROM products WHERE sku = ?").get(p.sku.trim()) as any;
    if (existingSku) {
      throw new Error(`SKU '${p.sku.trim()}' is already used by product '${existingSku.name}'`);
    }
  }

  // Duplicate Barcode validation
  if (p.barcode && p.barcode.trim()) {
    const existingBarcode = db.prepare("SELECT id, name FROM products WHERE barcode = ?").get(p.barcode.trim()) as any;
    if (existingBarcode) {
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
    p.qty ?? 0,
    p.reorderLevel ?? p.minimumStock ?? 2,
    p.subcategoryId ?? null,
    p.brandId ?? null,
    p.modelId ?? null,
    p.sku?.trim() ?? null,
    p.barcode?.trim() ?? null,
    p.hsn?.trim() ?? null,
    p.minimumStock ?? p.reorderLevel ?? 2
  );

  return { ...p, id };
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
        subcategory_id = ?, brand_id = ?, model_id = ?
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
    id
  );

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
