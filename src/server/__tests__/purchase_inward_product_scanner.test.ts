import { describe, expect, it, beforeAll } from "bun:test";
import { getDB } from "../db/client";
import { addProduct, getProductStock, searchImei } from "../services/stockService";
import {
  createCategory,
  createSubcategory,
  createBrand,
  createModel,
  getCategoryHierarchy,
} from "../services/categoryService";
import { recordPurchase as createPurchase } from "../services/purchaseService";
import { checkEmployeePermission, setEmployeePermission } from "../services/permissionService";
import type { DatabaseSync } from "node:sqlite";

describe("Purchase Inward Items - Quick Product Creation & IMEI Scanner Suite", () => {
  let db: DatabaseSync;
  let testDealerId: string;
  let mobileCatId: string;
  let smartphoneSubcatId: string;
  let oppoBrandId: string;
  let oppoModelId: string;
  let createdProductId: string;

  beforeAll(() => {
    db = getDB();

    // Ensure test supplier exists
    const dealer = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as any;
    if (dealer) {
      testDealerId = dealer.id;
    } else {
      testDealerId = `sup_inward_${Date.now()}`;
      db.prepare(`
        INSERT INTO suppliers (id, name, company, phone, email, gstin, address, city, state, state_code)
        VALUES (?, 'Test Distributor Harda', 'Test Mobile Dist', '9826012345', 'dist@test.com', '23AAACT0000A1Z5', 'Main Road', 'Harda', 'Madhya Pradesh', '23')
      `).run(testDealerId);
    }
  });

  // =========================================================================
  // 1. PRODUCT HIERARCHY: Category -> Subcategory -> Brand -> Model -> Product
  // =========================================================================
  describe("1. Hierarchy Creation & Validation", () => {
    it("creates a Category (Mobile)", () => {
      const cat = createCategory(db, { name: "Mobile", icon: "smartphone" });
      expect(cat).toBeDefined();
      expect(cat.id).toBeDefined();
      expect(cat.name).toBe("Mobile");
      mobileCatId = cat.id;
    });

    it("creates a Subcategory (Smart Phone) strictly linked to Mobile Category", () => {
      const sub = createSubcategory(db, {
        categoryId: mobileCatId,
        name: "Smart Phone",
      });
      expect(sub).toBeDefined();
      expect(sub.categoryId).toBe(mobileCatId);
      expect(sub.name).toBe("Smart Phone");
      smartphoneSubcatId = sub.id;
    });

    it("creates a Brand (OPPO) linked to Smart Phone Subcategory", () => {
      const brand = createBrand(db, {
        subcategoryId: smartphoneSubcatId,
        name: "OPPO",
      });
      expect(brand).toBeDefined();
      expect(brand.id).toBeDefined();
      expect(brand.name).toBe("OPPO");
      oppoBrandId = brand.id;
    });

    it("creates a Model (OPPO F33 Pro) linked to OPPO Brand", () => {
      const model = createModel(db, {
        brandId: oppoBrandId,
        name: "OPPO F33 Pro",
      });
      expect(model).toBeDefined();
      expect(model.id).toBeDefined();
      expect(model.brandId).toBe(oppoBrandId);
      expect(model.name).toBe("OPPO F33 Pro");
      oppoModelId = model.id;
    });

    it("verifies the hierarchical tree contains Category -> Subcategory -> Brand -> Model", () => {
      const tree = getCategoryHierarchy(db);
      const cat = tree.find((c) => c.id === mobileCatId);
      expect(cat).toBeDefined();

      const sub = cat!.subcategories.find((s) => s.id === smartphoneSubcatId);
      expect(sub).toBeDefined();

      const brand = sub!.brands.find((b) => b.id === oppoBrandId);
      expect(brand).toBeDefined();

      const model = brand!.models.find((m) => m.id === oppoModelId);
      expect(model).toBeDefined();
    });

    it("saves a new Product with full specs, IMEI tracking, and parent IDs", () => {
      const uniqueSku = `SKU-OPPO-${Date.now()}`;
      const uniqueBarcode = `890${Date.now().toString().slice(-9)}`;

      const prod = addProduct(db, {
        name: "OPPO F33 Pro 8GB/256GB",
        brand: "OPPO",
        model: "OPPO F33 Pro",
        category: "Mobile",
        categoryId: mobileCatId,
        subcategoryId: smartphoneSubcatId,
        brandId: oppoBrandId,
        modelId: oppoModelId,
        variant: "8GB/256GB",
        ram: "8GB",
        storage: "256GB",
        color: "Ocean Blue",
        tracked: true,
        sku: uniqueSku,
        barcode: uniqueBarcode,
        hsn: "85171300",
        purchasePrice: 15000,
        sellingPrice: 18000,
        mrp: 19999,
        gst: 18,
        warrantyMonths: 12,
        minimumStock: 2,
        reorderLevel: 2,
        qty: 0,
      });

      expect(prod).toBeDefined();
      expect(prod.id).toBeDefined();
      expect(prod.name).toBe("OPPO F33 Pro 8GB/256GB");
      expect(prod.tracked).toBe(true);
      expect(prod.sku).toBe(uniqueSku);
      expect(prod.barcode).toBe(uniqueBarcode);
      expect(prod.hsn).toBe("85171300");
      expect(prod.purchasePrice).toBe(15000);
      createdProductId = prod.id;
    });

    it("rejects product creation when product name is empty", () => {
      expect(() => {
        addProduct(db, {
          name: "   ",
          brand: "Generic",
          model: "Model",
          category: "General",
          tracked: false,
          mrp: 100,
          purchasePrice: 80,
          sellingPrice: 100,
          gst: 18,
          warrantyMonths: 12,
          qty: 0,
          reorderLevel: 2,
        });
      }).toThrow(/Product name is required/);
    });

    it("rejects duplicate SKU assignment", () => {
      const existing = db.prepare("SELECT sku FROM products WHERE sku IS NOT NULL LIMIT 1").get() as any;
      if (existing?.sku) {
        expect(() => {
          addProduct(db, {
            name: "Duplicate SKU Product",
            brand: "Generic",
            model: "Model",
            category: "General",
            sku: existing.sku,
            tracked: false,
            mrp: 100,
            purchasePrice: 80,
            sellingPrice: 100,
            gst: 18,
            warrantyMonths: 12,
            qty: 0,
            reorderLevel: 2,
          });
        }).toThrow(/SKU '.*' is already used/);
      }
    });

    it("rejects duplicate Barcode assignment", () => {
      const existing = db.prepare("SELECT barcode FROM products WHERE barcode IS NOT NULL LIMIT 1").get() as any;
      if (existing?.barcode) {
        expect(() => {
          addProduct(db, {
            name: "Duplicate Barcode Product",
            brand: "Generic",
            model: "Model",
            category: "General",
            barcode: existing.barcode,
            tracked: false,
            mrp: 100,
            purchasePrice: 80,
            sellingPrice: 100,
            gst: 18,
            warrantyMonths: 12,
            qty: 0,
            reorderLevel: 2,
          });
        }).toThrow(/Barcode '.*' is already used/);
      }
    });
  });

  // =========================================================================
  // 2. CRITICAL INWARD LOGIC: ZERO STOCK ON PRODUCT CREATION
  // =========================================================================
  describe("2. Product Creation Stock Independence", () => {
    it("guarantees product creation does NOT create stock or unit records", () => {
      const stock = getProductStock(db, createdProductId);
      expect(stock).toBe(0);

      const units = db.prepare("SELECT * FROM units WHERE product_id = ?").all(createdProductId);
      expect(units.length).toBe(0);

      const movements = db.prepare("SELECT * FROM stock_movements WHERE product_id = ?").all(createdProductId);
      expect(movements.length).toBe(0);
    });
  });

  // =========================================================================
  // 3. INWARD PURCHASE SAVE & IMEI SERIAL TRACKING INTEGRATION
  // =========================================================================
  describe("3. Inward Items Purchase & Camera IMEI Integration", () => {
    const timestamp = Date.now().toString().slice(-8);
    const testImei1 = `865778085${timestamp}1`;
    const testImei2 = `865778085${timestamp}2`;
    const testImei3 = `865778085${timestamp}3`;

    it("rejects purchase save if inward quantity (3) does not match scanned IMEIs count (2)", () => {
      expect(() => {
        createPurchase(db, {
          purchaseType: "GST",
          dealerId: testDealerId,
          invoiceNo: `INV-TEST-FAIL-${Date.now()}`,
          date: "2026-09-18",
          items: [
            {
              productId: createdProductId,
              name: "OPPO F33 Pro 8GB/256GB",
              qty: 3,
              rateExcludingTax: 15000,
              gstRate: 18,
            },
          ],
          imeis: {
            [createdProductId]: [testImei1, testImei2], // Only 2 IMEIs for qty 3
          },
        });
      }).toThrow(/requires exactly 3 unique IMEI/);
    });

    it("rejects purchase save if duplicate IMEIs are submitted in the same bill", () => {
      expect(() => {
        createPurchase(db, {
          purchaseType: "GST",
          dealerId: testDealerId,
          invoiceNo: `INV-TEST-DUP-${Date.now()}`,
          date: "2026-09-18",
          items: [
            {
              productId: createdProductId,
              name: "OPPO F33 Pro 8GB/256GB",
              qty: 2,
              rateExcludingTax: 15000,
              gstRate: 18,
            },
          ],
          imeis: {
            [createdProductId]: [testImei1, testImei1], // Duplicate in bill
          },
        });
      }).toThrow(/Duplicate IMEI in bill/);
    });

    it("inwards purchase with quantity 3 and 3 unique IMEIs: stock increases by 3 and 3 units become available", () => {
      const invNo = `INV-INWARD-${Date.now()}`;
      const purchase = createPurchase(db, {
        purchaseType: "GST",
        dealerId: testDealerId,
        invoiceNo: invNo,
        date: "2026-09-18",
        items: [
          {
            productId: createdProductId,
            name: "OPPO F33 Pro 8GB/256GB",
            qty: 3,
            rateExcludingTax: 15000,
            gstRate: 18,
          },
        ],
        imeis: {
          [createdProductId]: [testImei1, testImei2, testImei3],
        },
        paid: 53100, // 3 * 15000 * 1.18 = 53100
        mode: "Bank",
      });

      expect(purchase).toBeDefined();
      expect(purchase.total).toBe(53100);
      expect(purchase.status).toBe("PAID");

      // Verify stock increased by exactly 3
      const stockAfter = getProductStock(db, createdProductId);
      expect(stockAfter).toBe(3);

      // Verify exactly 3 units created in units table
      const units = db
        .prepare("SELECT * FROM units WHERE product_id = ? AND status = 'available'")
        .all(createdProductId) as any[];
      expect(units.length).toBe(3);

      const capturedImeis = units.map((u) => u.imei1);
      expect(capturedImeis).toContain(testImei1);
      expect(capturedImeis).toContain(testImei2);
      expect(capturedImeis).toContain(testImei3);

      // Verify stock movements recorded
      const movements = db
        .prepare("SELECT * FROM stock_movements WHERE reference_id = ?")
        .all(purchase.id) as any[];
      expect(movements.length).toBe(3);
      expect(movements.every((m) => m.movement_type === "PURCHASE")).toBe(true);
    });

    it("rejects inwarding an IMEI that already exists in inventory (duplicate protection)", () => {
      expect(() => {
        createPurchase(db, {
          purchaseType: "GST",
          dealerId: testDealerId,
          invoiceNo: `INV-DUP-INV-${Date.now()}`,
          date: "2026-09-18",
          items: [
            {
              productId: createdProductId,
              name: "OPPO F33 Pro 8GB/256GB",
              qty: 1,
              rateExcludingTax: 15000,
              gstRate: 18,
            },
          ],
          imeis: {
            [createdProductId]: [testImei1], // Already in stock!
          },
        });
      }).toThrow(/Duplicate IMEI detected/);
    });
  });

  // =========================================================================
  // 4. PERMISSIONS ENFORCEMENT
  // =========================================================================
  describe("4. Permission Enforcement for Product & Master Creation", () => {
    let testEmpId: string;

    beforeAll(() => {
      // Find or create a sales staff employee
      const emp = db.prepare("SELECT id FROM employees WHERE role = 'sales' LIMIT 1").get() as any;
      if (emp) {
        testEmpId = emp.id;
      } else {
        testEmpId = `emp_perm_${Date.now()}`;
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO employees (
            id, employee_id, full_name, mobile, role, basic_salary,
            joining_date, department, designation, salary_type, status, created_at
          )
          VALUES (?, ?, 'Rohan Sales', '9826011111', 'sales', 18000, '2026-01-01', 'Sales', 'Executive', 'MONTHLY', 'ACTIVE', ?)
        `).run(testEmpId, `EMP-${Date.now().toString().slice(-4)}`, now);
      }
    });

    it("allows product creation if Products:CREATE permission is granted", () => {
      setEmployeePermission(db, testEmpId, "Products", "CREATE", true);
      const allowed = checkEmployeePermission(db, testEmpId, "Products", "CREATE");
      expect(allowed).toBe(true);
    });

    it("denies product creation if Products:CREATE permission is revoked", () => {
      setEmployeePermission(db, testEmpId, "Products", "CREATE", false);
      const allowed = checkEmployeePermission(db, testEmpId, "Products", "CREATE");
      expect(allowed).toBe(false);
    });
  });
});
