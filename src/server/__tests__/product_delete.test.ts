import { describe, expect, test } from "bun:test";
import { getDB } from "../db/client";
import { addProduct, deleteProduct } from "../services/stockService";

describe("Product Deletion Feature", () => {
  const db = getDB();

  test("successfully deletes a product without transaction history", () => {
    const prod = addProduct(db, {
      name: "Test Delete Mobile",
      brand: "Vivo",
      model: "V29",
      category: "Mobile Phones",
      tracked: false,
      mrp: 18000,
      purchasePrice: 14000,
      sellingPrice: 17000,
      gst: 18,
      warrantyMonths: 12,
      qty: 0,
      reorderLevel: 2,
    });

    // Verify it exists
    const checkBefore = db.prepare("SELECT * FROM products WHERE id = ?").get(prod.id);
    expect(checkBefore).toBeDefined();

    // Delete product
    const res = deleteProduct(db, prod.id);
    expect(res.success).toBe(true);
    expect(res.id).toBe(prod.id);

    // Verify it was deleted
    const checkAfter = db.prepare("SELECT * FROM products WHERE id = ?").get(prod.id);
    expect(checkAfter).toBeUndefined();
  });

  test("blocks deletion if product is referenced in sale_items unless force is true", () => {
    const prod = addProduct(db, {
      name: "Test Protected Mobile",
      brand: "Samsung",
      model: "Galaxy S24",
      category: "Mobile Phones",
      tracked: false,
      mrp: 75000,
      purchasePrice: 60000,
      sellingPrice: 72000,
      gst: 18,
      warrantyMonths: 12,
      qty: 0,
      reorderLevel: 2,
    });

    // Insert customer and sale to satisfy foreign keys
    const custId = "cust_test_del_" + Date.now();
    const saleId = "sale_test_del_" + Date.now();
    db.prepare(`
      INSERT INTO customers (id, business_id, name, mobile, phone, address, created_at)
      VALUES (?, 'biz_default', 'Test Customer', '9898989898', '9898989898', 'Address', datetime('now'))
    `).run(custId);
    db.prepare(`
      INSERT INTO sales (id, business_id, invoice_no, date, customer_id, discount, subtotal, tax, total, paid)
      VALUES (?, 'biz_default', ?, '2026-09-28', ?, 0, 72000, 0, 72000, 72000)
    `).run(saleId, "INV-DEL-" + Date.now(), custId);

    // Insert dummy sale item
    db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_id, name, qty, price, gst, cost_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run("item_dummy_" + Date.now(), saleId, prod.id, prod.name, 1, 72000, 18, 60000);

    // Attempt regular deletion -> should fail
    expect(() => deleteProduct(db, prod.id, false)).toThrow(/transaction history/);

    // Force deletion -> should succeed
    const res = deleteProduct(db, prod.id, true);
    expect(res.success).toBe(true);

    const checkAfter = db.prepare("SELECT * FROM products WHERE id = ?").get(prod.id);
    expect(checkAfter).toBeUndefined();
  });
});
