import { describe, expect, it } from "bun:test";
import { DatabaseSync } from "node:sqlite";
import { initSchema, runMigrations, seedCategoriesAndHierarchy, seedIfEmpty } from "../db/schema";
import {
  createBrand,
  createCategory,
  createModel,
  createSubcategory,
  getCategoryHierarchy,
} from "../services/categoryService";
import {
  createFinanceCompany,
  createEMIReceivable,
  getEMIReceivableById,
  getEMIReceivables,
  recordEMIReceipt,
} from "../services/emiService";
import { addProduct, addUnits, getProductStock, searchImei } from "../services/stockService";
import { addCustomer, addSupplier, getCustomerDue, getSupplierDue } from "../services/duesAndPaymentsService";
import { createSale, getSaleById } from "../services/salesService";
import { recordPurchase } from "../services/purchaseService";
import {
  checkEmployeePermission,
  bulkUpdateEmployeePermissions,
  getEmployeePermissions,
} from "../services/permissionService";
import { addEmployee } from "../services/hrService";
import { verifyAdminPin } from "../services/adminAuthService";
import { getAuditLogs, getCashbook, getSales } from "../db/repository";
import { getDashboardKPIs, getDealerReport, getEMIReport } from "../services/reportService";
import { PERMISSION_MODULES } from "../../../shared/constants/permissions";

describe("Commercial Mobile Shop ERP Acceptance Test Suite (All 34 Criteria)", () => {
  // Use in-memory or dedicated test database
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  seedIfEmpty(db);
  runMigrations(db);
  seedCategoriesAndHierarchy(db);

  let categoryId = "";
  let subcategoryId = "";
  let brandId = "";
  let modelId = "";
  let productId = "";
  let customerId = "";
  let dealerId = "";
  let financeCompanyId = "";
  let saleId = "";
  let invoiceNo = "";
  let emiReceivableId = "";
  let employeeId = "";
  const testImei1 = "860123456789001";
  const testImei2 = "860123456789002";

  it("1. Category creation ('Mobile')", () => {
    const cat = createCategory(db, { name: "Mobile", icon: "📱" });
    expect(cat.id).toBeDefined();
    expect(cat.name).toBe("Mobile");
    categoryId = cat.id;
  });

  it("2. Subcategory creation ('Smart Phone')", () => {
    const subcat = createSubcategory(db, {
      categoryId,
      name: "Smart Phone",
    });
    expect(subcat.id).toBeDefined();
    expect(subcat.categoryId).toBe(categoryId);
    expect(subcat.name).toBe("Smart Phone");
    subcategoryId = subcat.id;
  });

  it("3. Brand creation ('OPPO')", () => {
    const brand = createBrand(db, {
      subcategoryId,
      name: "OPPO",
    });
    expect(brand.id).toBeDefined();
    expect(brand.name).toBe("OPPO");
    brandId = brand.id;
  });

  it("4. Model creation ('OPPO A5')", () => {
    const model = createModel(db, {
      brandId,
      name: "OPPO A5",
      modelNumber: "CPH1931",
      releaseYear: 2024,
    });
    expect(model.id).toBeDefined();
    expect(model.name).toBe("OPPO A5");
    modelId = model.id;

    // Verify hierarchy query includes this branch
    const hierarchy = getCategoryHierarchy(db);
    const foundCat = hierarchy.find((c) => c.id === categoryId);
    expect(foundCat).toBeDefined();

    // Verify backend rejects invalid hierarchy combination
    const vivoBrand = createBrand(db, { subcategoryId, name: "VIVO" });
    expect(() => {
      addProduct(db, {
        name: "Invalid Combination Phone",
        brand: "VIVO",
        model: "OPPO A5",
        subcategoryId,
        brandId: vivoBrand.id,
        modelId: model.id,
        category: "Mobile Phones",
        tracked: true,
        mrp: 15000,
        purchasePrice: 10000,
        sellingPrice: 14000,
        gst: 18,
        warrantyMonths: 12,
        qty: 0,
        reorderLevel: 2,
      });
    }).toThrow(/Hierarchy validation failed/);
  });

  it("5. Product creation under 'OPPO A5'", () => {
    const prod = addProduct(db, {
      name: "OPPO A5 64GB Mirror Black",
      brand: "OPPO",
      model: "OPPO A5",
      subcategoryId,
      brandId,
      modelId,
      variant: "4GB/64GB",
      color: "Mirror Black",
      category: "Mobile Phones",
      tracked: true,
      mrp: 16990,
      purchasePrice: 11000,
      sellingPrice: 15000,
      gst: 18,
      warrantyMonths: 12,
      qty: 0,
      reorderLevel: 2,
    });
    expect(prod.id).toBeDefined();
    expect(prod.subcategoryId).toBe(subcategoryId);
    expect(prod.brandId).toBe(brandId);
    expect(prod.modelId).toBe(modelId);
    productId = prod.id;
  });

  it("6. Purchase 2 units with unique IMEIs", () => {
    const units = addUnits(db, productId, [
      { imei1: testImei1, purchasePrice: 11000 },
      { imei1: testImei2, purchasePrice: 11000 },
    ]);
    expect(units.length).toBe(2);
    expect(units[0].imei1).toBe(testImei1);
    expect(units[1].imei1).toBe(testImei2);
  });

  it("7. Verify both units in stock", () => {
    const stock = getProductStock(db, productId);
    expect(stock).toBe(2);

    const found1 = searchImei(db, testImei1);
    const found2 = searchImei(db, testImei2);
    expect(found1.length).toBe(1);
    expect(found1[0].status).toBe("available");
    expect(found2.length).toBe(1);
    expect(found2[0].status).toBe("available");
  });

  it("8. Customer creation", () => {
    const cust = addCustomer(db, {
      name: "Rahul Sharma",
      phone: "9876543210",
      email: "rahul.sharma@example.com",
      address: "MG Road, Bengaluru",
    });
    expect(cust.id).toBeDefined();
    expect(cust.name).toBe("Rahul Sharma");
    customerId = cust.id;
  });

  it("9. Sell phone for ₹15,000 with EMI", () => {
    // Look up or create Finance Company
    const comp = createFinanceCompany(db, {
      companyName: "Bajaj Finserv",
      contactPerson: "Rajesh Joshi",
      mobile: "9820011223",
      settlementDays: 5,
      processingFee: 0,
      active: true,
    });
    financeCompanyId = comp.id;

    // First unit to sell
    const unit = searchImei(db, testImei1)[0];

    // Validate negative down payment rejection
    expect(() => {
      createSale(db, {
        customerId,
        items: [
          {
            productId,
            name: "OPPO A5 64GB Mirror Black",
            unitId: unit.id,
            imei: testImei1,
            qty: 1,
            price: 15000,
            gst: 18,
            costPrice: 11000,
            warrantyMonths: 12,
          },
        ],
        discount: 0,
        payments: [],
        isEmi: true,
        emiCompanyId: financeCompanyId,
        emiDownPayment: -1000,
      });
    }).toThrow(/Down payment cannot be negative/);

    // Validate down payment exceeding total sale rejection
    expect(() => {
      createSale(db, {
        customerId,
        items: [
          {
            productId,
            name: "OPPO A5 64GB Mirror Black",
            unitId: unit.id,
            imei: testImei1,
            qty: 1,
            price: 15000,
            gst: 18,
            costPrice: 11000,
            warrantyMonths: 12,
          },
        ],
        discount: 0,
        payments: [],
        isEmi: true,
        emiCompanyId: financeCompanyId,
        emiDownPayment: 25000,
      });
    }).toThrow(/Down payment cannot be greater than total sale amount/);

    // Acceptance Step 9, 10, 11, 12, 13:
    // Phone selling price = 15,000
    // Customer down payment = 5,000 (Cash)
    // EMI company receivable = 10,000
    const sale = createSale(db, {
      customerId,
      items: [
        {
          productId,
          name: "OPPO A5 64GB Mirror Black",
          unitId: unit.id,
          imei: testImei1,
          qty: 1,
          price: 15000,
          gst: 18,
          costPrice: 11000,
          warrantyMonths: 12,
        },
      ],
      discount: 0,
      payments: [
        { mode: "Cash", amount: 5000 },
      ],
      isEmi: true,
      emiCompanyId: financeCompanyId,
      emiDownPayment: 5000,
      emiFinancedAmount: 10000,
      financeReferenceNumber: "BAJ-OPPO-99128",
    });

    expect(sale.id).toBeDefined();
    expect(sale.total).toBe(15000);
    saleId = sale.id;
    invoiceNo = sale.invoiceNo;
    expect(sale.isEmi).toBe(true);
    expect(sale.emiReceivableId).toBeDefined();
    emiReceivableId = sale.emiReceivableId!;
  });

  it("10. Customer down payment of ₹5,000 recorded", () => {
    const sale = getSaleById(db, saleId);
    expect(sale?.paid).toBe(5000);
    expect(sale?.emiDownPayment).toBe(5000);
  });

  it("11. Select finance company verified", () => {
    const rec = getEMIReceivableById(db, emiReceivableId);
    expect(rec).not.toBeNull();
    expect(rec?.emiCompanyId).toBe(financeCompanyId);
    expect(rec?.emiCompanyName).toBe("Bajaj Finserv");
  });

  it("12. Create ₹10,000 finance receivable", () => {
    const rec = getEMIReceivableById(db, emiReceivableId);
    expect(rec?.emiFinancedAmount).toBe(10000);
    expect(rec?.netReceivable).toBe(10000);
    expect(rec?.receivedAmount).toBe(0);
    expect(rec?.status).toBe("EMI_PENDING");
  });

  it("13. Verify sale is completed", () => {
    const sale = getSaleById(db, saleId);
    expect(sale?.status).toBe("COMPLETED");
  });

  it("14. Verify stock decreases immediately", () => {
    const stockAfter = getProductStock(db, productId);
    expect(stockAfter).toBe(1); // 2 units purchased - 1 unit sold = 1 unit
  });

  it("15. Verify IMEI becomes 'sold'", () => {
    const soldUnit = searchImei(db, testImei1)[0];
    expect(soldUnit.status).toBe("sold");
    expect(soldUnit.saleId).toBe(saleId);
    expect(soldUnit.customerId).toBe(customerId);

    // Second unit remains available
    const unsoldUnit = searchImei(db, testImei2)[0];
    expect(unsoldUnit.status).toBe("available");
  });

  it("16. Verify customer payment records ₹5,000 & customer due is zero", () => {
    const due = getCustomerDue(db, customerId);
    expect(due).toBe(0); // Down payment ₹5,000 + EMI finance ₹10,000 covers full ₹15,000
  });

  it("17. Verify EMI pending records ₹10,000", () => {
    const pending = getEMIReceivables(db, { status: "EMI_PENDING" });
    const match = pending.find((r) => r.id === emiReceivableId);
    expect(match).toBeDefined();
    expect(match?.netReceivable - (match?.receivedAmount || 0)).toBe(10000);
  });

  it("18. Receive partial ₹7,000 from finance company", () => {
    const { receipt, receivable } = recordEMIReceipt(db, {
      emiReceivableId,
      amountReceived: 7000,
      paymentMethod: "BANK_TRANSFER",
      bankReference: "UTR-BAJ-7000",
      notes: "First installment payout from Bajaj batch",
    });
    expect(receipt.amountReceived).toBe(7000);
    expect(receivable.receivedAmount).toBe(7000);
  });

  it("19. Verify status becomes 'PARTIALLY_RECEIVED'", () => {
    const rec = getEMIReceivableById(db, emiReceivableId);
    expect(rec?.status).toBe("PARTIALLY_RECEIVED");
  });

  it("20. Verify remaining EMI is ₹3,000", () => {
    const rec = getEMIReceivableById(db, emiReceivableId);
    const remaining = (rec?.netReceivable || 0) - (rec?.receivedAmount || 0);
    expect(remaining).toBe(3000);
  });

  it("21. Receive remaining ₹3,000", () => {
    const { receipt, receivable } = recordEMIReceipt(db, {
      emiReceivableId,
      amountReceived: 3000,
      paymentMethod: "BANK_TRANSFER",
      bankReference: "UTR-BAJ-3000",
      notes: "Final settlement payout from Bajaj",
    });
    expect(receipt.amountReceived).toBe(3000);
    expect(receivable.receivedAmount).toBe(10000);
  });

  it("22. Verify status becomes 'RECEIVED'", () => {
    const rec = getEMIReceivableById(db, emiReceivableId);
    expect(rec?.status).toBe("RECEIVED");
  });

  it("23. Verify NO second sale created", () => {
    const allSales = getSales(db);
    const salesForCustomer = allSales.filter((s) => s.customerId === customerId);
    expect(salesForCustomer.length).toBe(1); // Exact 1 sale preserved
  });

  it("24. Verify cash/bank ledger updated correctly", () => {
    const cashbook = getCashbook(db);
    const emiReceiptEntries = cashbook.filter((c) => c.category === "EMI_FINANCE_RECEIPT" || c.type === "EMI_RECEIPT");
    expect(emiReceiptEntries.length).toBe(2); // ₹7000 and ₹3000 receipts recorded
    const totalReceiptCash = emiReceiptEntries.reduce((sum, e) => sum + e.inflow, 0);
    expect(totalReceiptCash).toBe(10000);
  });

  it("25. Create Dealer", () => {
    const dealer = addSupplier(db, {
      name: "Sunrise Mobile Wholesale Distributors",
      phone: "9845012345",
      gstin: "29AABCS1429B1Z8",
      address: "SP Road, Bengaluru",
    });
    expect(dealer.id).toBeDefined();
    expect(dealer.name).toContain("Sunrise");
    dealerId = dealer.id;
  });

  it("26. Create purchase bill with multiple items", () => {
    const purchase = recordPurchase(db, {
      supplierId: dealerId,
      invoiceNo: "PUR-DEALER-2026-001",
      items: [
        {
          productId,
          name: "OPPO A5 64GB Mirror Black",
          qty: 2,
          price: 10500,
          costPrice: 10500,
          gst: 18,
        },
      ],
      imeis: {
        [productId]: ["860123456789003", "860123456789004"],
      },
      discount: 0,
      paid: 10000,
      mode: "Bank",
    });
    expect(purchase.id).toBeDefined();
    expect(purchase.total).toBe(21000);
    expect(purchase.paid).toBe(10000);
  });

  it("27. Verify stock intake", () => {
    // Previous stock was 1 unit + 2 newly purchased = 3 units
    const stock = getProductStock(db, productId);
    expect(stock).toBe(3);

    const u3 = searchImei(db, "860123456789003");
    const u4 = searchImei(db, "860123456789004");
    expect(u3.length).toBe(1);
    expect(u3[0].status).toBe("available");
    expect(u4.length).toBe(1);
    expect(u4[0].status).toBe("available");
  });

  it("28. Verify dealer ledger", () => {
    // Dealer bill was ₹21,000, paid was ₹10,000 => Due is ₹11,000
    const due = getSupplierDue(db, dealerId);
    expect(due).toBe(11000);
  });

  it("29. Create employee", () => {
    const emp = addEmployee(db, {
      name: "Amit Patel",
      phone: "9876501234",
      role: "sales",
      designation: "Sales Executive",
      salaryType: "monthly",
      basicSalary: 22000,
    });
    expect(emp.id).toBeDefined();
    expect(emp.role).toBe("sales");
    employeeId = emp.id;
  });

  it("30. Grant only POS and Customer permissions", () => {
    const matrix = getEmployeePermissions(db, employeeId);
    expect(matrix.length).toBe(PERMISSION_MODULES.length * 14);

    // Explicitly configure permissions: Grant POS_BILLING VIEW/CREATE, CUSTOMERS VIEW/CREATE
    // and restrict INVENTORY_STOCK EDIT/DELETE
    bulkUpdateEmployeePermissions(db, employeeId, [
      { module: "POS_BILLING", action: "VIEW", allowed: true },
      { module: "POS_BILLING", action: "CREATE", allowed: true },
      { module: "CUSTOMERS", action: "VIEW", allowed: true },
      { module: "CUSTOMERS", action: "CREATE", allowed: true },
      { module: "INVENTORY_STOCK", action: "EDIT", allowed: false },
      { module: "INVENTORY_STOCK", action: "DELETE", allowed: false },
    ]);

    expect(checkEmployeePermission(db, employeeId, "POS_BILLING", "VIEW")).toBe(true);
    expect(checkEmployeePermission(db, employeeId, "POS_BILLING", "CREATE")).toBe(true);
    expect(checkEmployeePermission(db, employeeId, "CUSTOMERS", "VIEW")).toBe(true);
  });

  it("31. Verify employee cannot adjust stock and permission changes take effect", () => {
    expect(checkEmployeePermission(db, employeeId, "INVENTORY_STOCK", "EDIT")).toBe(false);
    expect(checkEmployeePermission(db, employeeId, "INVENTORY_STOCK", "DELETE")).toBe(false);
    expect(checkEmployeePermission(db, employeeId, "Stock", "ADJUST")).toBe(false);

    // Dynamic update: Grant ADJUST and verify it takes effect
    bulkUpdateEmployeePermissions(db, employeeId, [
      { module: "Stock", action: "ADJUST", allowed: true },
    ]);
    expect(checkEmployeePermission(db, employeeId, "Stock", "ADJUST")).toBe(true);
  });

  it("32. Verify restricted action triggers Admin authorization", () => {
    // Default admin PIN is 1234
    const validPin = verifyAdminPin(db, "1234", "STOCK_ADJUSTMENT", "Restricted stock adjustment attempt", undefined, employeeId, "Amit Patel");
    expect(validPin).toBe(true);

    const invalidPin = verifyAdminPin(db, "9999", "STOCK_ADJUSTMENT", "Invalid pin test");
    expect(invalidPin).toBe(false);
  });

  it("33. Verify audit log", () => {
    const logs = getAuditLogs(db);
    expect(logs.length).toBeGreaterThan(0);
    const saleCreateLog = logs.find((l) => l.action === "SALE_CREATE");
    const emiReceivableLog = logs.find((l) => l.action === "CREATE_EMI_RECEIVABLE");
    expect(saleCreateLog).toBeDefined();
    expect(emiReceivableLog).toBeDefined();
  });

  it("34. Verify reports and dashboard", () => {
    const kpis = getDashboardKPIs(db);
    expect(kpis.salesTotal).toBeGreaterThanOrEqual(15000);
    expect(kpis.purchaseTotal).toBeGreaterThanOrEqual(21000);

    const emiReport = getEMIReport(db);
    expect(emiReport.summary.totalReceivables).toBe(10000);
    expect(emiReport.summary.totalReceived).toBe(10000);
    expect(emiReport.summary.totalPending).toBe(0); // fully received

    const dealerReport = getDealerReport(db);
    const dealerEntry = dealerReport.dealers.find((d) => d.dealerId === dealerId);
    expect(dealerEntry).toBeDefined();
    expect(dealerEntry?.totalPurchased).toBe(21000);
    expect(dealerEntry?.outstanding).toBe(11000);
  });
});
