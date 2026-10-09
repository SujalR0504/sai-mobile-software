import type { DatabaseSync } from "node:sqlite";
import type { Product } from "../../../shared/types";

export function getProducts(db: DatabaseSync): Product[] {
  const rows = db.prepare("SELECT * FROM products ORDER BY name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    variant: r.variant ?? undefined,
    ram: r.ram ?? undefined,
    storage: r.storage ?? undefined,
    color: r.color ?? undefined,
    category: r.category,
    categoryId: r.category_id ?? undefined,
    subcategoryId: r.subcategory_id ?? undefined,
    brandId: r.brand_id ?? undefined,
    modelId: r.model_id ?? undefined,
    sku: r.sku ?? undefined,
    barcode: r.barcode ?? undefined,
    hsn: r.hsn ?? undefined,
    tracked: Boolean(r.tracked),
    mrp: r.mrp,
    purchasePrice: r.purchase_price,
    sellingPrice: r.selling_price,
    gst: r.gst,
    supplierId: r.supplier_id ?? undefined,
    dealerId: r.supplier_id ?? undefined,
    warrantyMonths: r.warranty_months,
    qty: r.qty,
    reorderLevel: r.reorder_level,
    minimumStock: r.minimum_stock ?? r.reorder_level ?? 2,
    stockSource: r.stock_source || (r.tracked ? "NEW_STOCK" : "OLD_STOCK"),
    stockType: r.stock_type || r.stock_source || (r.tracked ? "NEW_STOCK" : "OLD_STOCK"),
  }));
}
