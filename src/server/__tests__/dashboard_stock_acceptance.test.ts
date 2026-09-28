import { describe, expect, it } from "bun:test";
import { DatabaseSync } from "node:sqlite";
import { initSchema, runMigrations, seedCategoriesAndHierarchy, seedIfEmpty } from "../db/schema";
import { createCategory, createSubcategory, createBrand, createModel } from "../services/categoryService";
import { addProduct, getProductStock } from "../services/stockService";
import { addCustomer, addSupplier } from "../services/duesAndPaymentsService";
import { recordPurchase } from "../services/purchaseService";
import { createSale } from "../services/salesService";
import { recordPurchaseReturn, recordSaleReturn } from "../services/returnService";
import {
  getDashboardSummary,
  getDailyStockMovement,
  getItemWiseDailyMovement,
  getCategoryStock,
  getBrandStock,
  getLowStockProducts,
  getOutOfStockProducts,
  getTopSellingProducts,
  getRecentTransactions,
  getRecentBills,
  getCustomerDueSummary,
  getEMISummary,
  getRepairSummary,
} from "../services/dashboardService";
import { todayISO } from "@/lib/format";
import { getDefaultPermission } from "../services/permissionService";

describe("DASHBOARD REAL-TIME STOCK MOVEMENT & BUSINESS ACCEPTANCE SUITE", () => {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  seedIfEmpty(db);
  runMigrations(db);
  seedCategoriesAndHierarchy(db);

  const today = todayISO();

  // Setup Catalog
  const cat = createCategory(db, { name: "Mobile Phones", icon: "📱" });
  const sub = createSubcategory(db, { categoryId: cat.id, name: "Smartphones" });
  const brand = createBrand(db, { name: "OPPO", subcategoryId: sub.id });
  const model = createModel(db, { brandId: brand.id, name: "OPPO F33 Pro" });

  const oppoPhone = addProduct(db, {
    name: "OPPO F33 Pro 5G",
    model: "OPPO F33 Pro",
    brand: "OPPO",
    category: "Mobile Phones",
    tracked: true,
    purchasePrice: 15000,
    price: 18000,
    minStock: 2,
    taxRate: 18,
  });

  const supplier = addSupplier(db, {
    name: "OPPO Regional Distributor",
    state: "Madhya Pradesh",
    stateCode: "23",
    gstin: "23AABCU9603R1ZM",
    mobile: "9876543210",
  });

  const customer = addCustomer(db, {
    name: "Rahul Verma",
    phone: "9826012345",
    address: "Main Road, Harda",
  });

  let initialSummary = getDashboardSummary(db, { dateFrom: today, dateTo: today });
  let initialStock = initialSummary.currentStock;
  let initialImeiStock = initialSummary.imeiStock;

  let purchaseId = "";
  let saleId = "";

  // TEST 1: Purchase Inward
  it("TEST 1: Create purchase of OPPO F33 Pro (Qty = 5) -> Dashboard shows Purchased Today = 5 and Stock increases by 5", () => {
    const prevPurchased = initialSummary.purchasedQty;
    const purchase = recordPurchase(db, {
      supplierId: supplier.id,
      dealerId: supplier.id,
      invoiceNo: "PUR-DASH-001",
      date: today,
      purchaseType: "GST",
      items: [
        {
          productId: oppoPhone.id,
          name: "OPPO F33 Pro 5G",
          qty: 5,
          rateExcludingTax: 15000,
          purchasePrice: 15000,
          price: 17700,
          taxRate: 18,
        },
      ],
      imeis: {
        [oppoPhone.id]: ["IMEI-F33-001", "IMEI-F33-002", "IMEI-F33-003", "IMEI-F33-004", "IMEI-F33-005"],
      },
      paymentMethod: "Cash",
      paid: 88500,
    });

    expect(purchase).toBeDefined();
    purchaseId = purchase.id;

    const d1 = getDashboardSummary(db, { dateFrom: today, dateTo: today });
    expect(d1.purchasedQty).toBe(prevPurchased + 5);
    expect(d1.currentStock).toBe(initialStock + 5);
    expect(d1.imeiStock).toBe(initialImeiStock + 5);

    // Verify Item-Wise Daily Movement table
    const itemMovement = getItemWiseDailyMovement(db, { dateFrom: today, dateTo: today });
    const oppoRow = itemMovement.find((r) => r.id === oppoPhone.id);
    expect(oppoRow).toBeDefined();
    expect(oppoRow!.purchased).toBe(5);
    expect(oppoRow!.closing).toBe(5);
  });

  // TEST 2: Sell 1 OPPO F33 Pro
  it("TEST 2: Sell 1 OPPO F33 Pro -> Dashboard updates Sold Today = 1, Current Stock decreases by 1", () => {
    const u1 = db.prepare("SELECT id FROM units WHERE imei1 = ?").get("IMEI-F33-001") as { id: string };

    const prevSold = initialSummary.soldQty;
    const sale = createSale(db, {
      customerId: customer.id,
      invoiceType: "GST",
      date: today,
      paymentMethod: "Cash",
      items: [
        {
          productId: oppoPhone.id,
          unitId: u1.id,
          name: "OPPO F33 Pro 5G",
          qty: 1,
          price: 21240,
          costPrice: 15000,
          gst: 18,
          imei: "IMEI-F33-001",
        },
      ],
      payments: [
        { mode: "Cash", amount: 21240 },
      ],
    });

    expect(sale).toBeDefined();
    saleId = sale.id;

    const d2 = getDashboardSummary(db, { dateFrom: today, dateTo: today });
    expect(d2.soldQty).toBe(prevSold + 1);
    expect(d2.salesBills).toBe(initialSummary.salesBills + 1);
    expect(d2.currentStock).toBe(initialStock + 4);
    expect(d2.imeiStock).toBe(initialImeiStock + 4);

    // Verify stock formula: Closing = Opening + Purchased - PurchaseRet - Sold + SalesRet ± Adjustments
    expect(d2.closingStock).toBe(d2.openingStock + d2.purchasedQty - d2.purchaseReturnQty - d2.soldQty + d2.salesReturnQty + d2.adjustments);
  });

  // TEST 3: Purchase Return of 1
  it("TEST 3: Create Purchase Return of 1 -> Purchase Return = 1, Stock decreases by 1", () => {
    const u2 = db.prepare("SELECT id FROM units WHERE imei1 = ?").get("IMEI-F33-002") as { id: string };

    const pret = recordPurchaseReturn(db, {
      purchaseId,
      items: [
        {
          productId: oppoPhone.id,
          unitId: u2.id,
          imei: "IMEI-F33-002",
          name: "OPPO F33 Pro 5G",
          qty: 1,
          price: 17700,
          costPrice: 15000,
          gst: 18,
        },
      ],
      reason: "Defective box returned to distributor",
    });

    expect(pret).toBeDefined();

    const d3 = getDashboardSummary(db, { dateFrom: today, dateTo: today });
    expect(d3.purchaseReturnQty).toBe(1);
    expect(d3.currentStock).toBe(initialStock + 3);
    expect(d3.imeiStock).toBe(initialImeiStock + 3);
  });

  // TEST 4: Sales Return of 1
  it("TEST 4: Create Sales Return of 1 -> Sales Return = 1, Stock increases by 1", () => {
    const u1 = db.prepare("SELECT id FROM units WHERE imei1 = ?").get("IMEI-F33-001") as { id: string };

    const sret = recordSaleReturn(db, {
      saleId,
      mode: "Refund",
      items: [
        {
          productId: oppoPhone.id,
          unitId: u1.id,
          name: "OPPO F33 Pro 5G",
          qty: 1,
          price: 21240,
          costPrice: 15000,
          gst: 18,
          imei: "IMEI-F33-001",
        },
      ],
      reason: "Customer exchanged device",
    });

    expect(sret).toBeDefined();

    const d4 = getDashboardSummary(db, { dateFrom: today, dateTo: today });
    expect(d4.salesReturnQty).toBe(1);
    expect(d4.currentStock).toBe(initialStock + 4);
    expect(d4.imeiStock).toBe(initialImeiStock + 4);
  });

  // TEST 5: IMEI Stock Tracking Status
  it("TEST 5: IMEI devices properly tracked as IN_STOCK when purchased or returned, SOLD when sold", () => {
    // Check IMEI unit statuses in DB via units table (imei1 column)
    const u1 = db.prepare("SELECT status FROM units WHERE imei1 = ?").get("IMEI-F33-001") as { status: string };
    // Returned by customer -> IN_STOCK / available
    expect(["available", "IN_STOCK", "in_stock"]).toContain(u1.status);

    const u2 = db.prepare("SELECT status FROM units WHERE imei1 = ?").get("IMEI-F33-002") as { status: string };
    // Returned to dealer -> PURCHASE_RETURNED / returned
    expect(["returned", "RETURNED_TO_DEALER", "PURCHASE_RETURNED"]).toContain(u2.status);

    const u3 = db.prepare("SELECT status FROM units WHERE imei1 = ?").get("IMEI-F33-003") as { status: string };
    expect(["available", "IN_STOCK"]).toContain(u3.status);
  });

  // TEST 6: Permissions Logic
  it("TEST 6: Permissions Matrix accurately controls module visibility", () => {
    // Admin sees everything
    expect(getDefaultPermission("admin", "Purchases", "VIEW")).toBe(true);
    expect(getDefaultPermission("admin", "Sales", "VIEW")).toBe(true);
    expect(getDefaultPermission("admin", "Stock", "VIEW")).toBe(true);

    // Sales employee: sees Sales & Stock, cannot see Purchases
    expect(getDefaultPermission("sales", "Purchases", "VIEW")).toBe(false);
    expect(getDefaultPermission("sales", "Sales", "VIEW")).toBe(true);
    expect(getDefaultPermission("sales", "Stock", "VIEW")).toBe(true);

    // Cashier: sees Sales & Stock, cannot see Purchases
    expect(getDefaultPermission("cashier", "Purchases", "VIEW")).toBe(false);
    expect(getDefaultPermission("cashier", "Sales", "VIEW")).toBe(true);
  });

  // Additional aggregations
  it("TEST 7: Category & Brand stock aggregations return real values", () => {
    const cats = getCategoryStock(db);
    const mobileCat = cats.find((c) => c.category === "Mobile Phones");
    expect(mobileCat).toBeDefined();
    expect(mobileCat!.quantity).toBeGreaterThanOrEqual(4);

    const brands = getBrandStock(db);
    const oppoBrand = brands.find((b) => b.brand === "OPPO");
    expect(oppoBrand).toBeDefined();
    expect(oppoBrand!.units).toBeGreaterThanOrEqual(4);
  });
});
