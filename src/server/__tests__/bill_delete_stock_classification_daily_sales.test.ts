import { describe, expect, it } from "bun:test";
import { DatabaseSync } from "node:sqlite";
import { initSchema, runMigrations, seedCategoriesAndHierarchy, seedIfEmpty } from "../db/schema";
import { addProduct, addUnits, getProductStock } from "../services/stockService";
import { addCustomer, getCustomerDue } from "../services/duesAndPaymentsService";
import { createSale, cancelSaleInvoice, getSaleById, getCancelledBills } from "../services/salesService";
import { recordPurchase } from "../services/purchaseService";
import { getDashboardSummary, getDailySales, getOldStock, getNewStock } from "../services/dashboardService";
import { checkEmployeePermission, setEmployeePermission } from "../services/permissionService";
import { addEmployee } from "../services/hrService";
import { getPaymentAccounts, getAccountTransactions } from "../services/paymentAccountService";
import { saleToInvoiceProps } from "../../../src/components/invoice/invoiceAdapters";
import type { AppDatabase } from "../../../src/lib/types";
import { salesRoutes } from "../../../backend/src/routes/salesRoutes";

describe("PROJECT UPDATE: Bill Delete + Stock Classification + Daily Sales + Billing Notes", () => {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  seedIfEmpty(db);
  runMigrations(db);
  seedCategoriesAndHierarchy(db);

  // Setup payment account
  const accounts = getPaymentAccounts(db);
  const cashAccount = accounts.find((a) => a.accountType === "CASH") || accounts[0]!;

  // TEST 1: SALE CREATION & CANCELLATION TRANSACTIONAL REVERSAL
  it("TEST 1: Creates mobile sale of ₹20,000, cancels bill and verifies complete reversal", () => {
    // 1. Create tracked mobile product
    const mobileProd = addProduct(db, {
      name: "Galaxy Ultra 5G",
      brand: "Samsung",
      model: "Galaxy Ultra",
      category: "Mobile Phones",
      tracked: true,
      purchasePrice: 15000,
      sellingPrice: 20000,
      mrp: 22000,
      qty: 1,
      stockType: "NEW_STOCK",
      stockSource: "PURCHASE",
    });

    const testImei = "990011223344556";
    addUnits(db, mobileProd.id, [{ imei1: testImei, purchasePrice: 15000 }]);

    // Initial stock check
    expect(getProductStock(db, mobileProd.id)).toBe(1);

    // 2. Create customer
    const customer = addCustomer(db, {
      name: "Rahul Sharma",
      phone: "9876543210",
      address: "Main Market Harda",
    });

    const initialAccountBal = db.prepare("SELECT current_balance FROM payment_accounts WHERE id = ?").get(cashAccount.id) as { current_balance: number };

    // 3. Create sale
    const sale = createSale(db, {
      customerId: customer.id,
      items: [
        {
          productId: mobileProd.id,
          name: mobileProd.name,
          price: 20000,
          qty: 1,
          imei: testImei,
        },
      ],
      discount: 0,
      payments: [
        {
          mode: "Cash",
          amount: 20000,
          accountId: cashAccount.id,
        },
      ],
      customerNote: "Screen guard installed free of cost.",
    });

    expect(sale.id).toBeDefined();
    expect(sale.total).toBe(20000);
    expect(sale.paid).toBe(20000);
    expect(sale.customerNote).toBe("Screen guard installed free of cost.");

    // Verify stock decremented and IMEI marked sold
    expect(getProductStock(db, mobileProd.id)).toBe(0);
    const unitAfterSale = db.prepare("SELECT status FROM units WHERE imei1 = ?").get(testImei) as { status: string };
    expect(unitAfterSale.status.toLowerCase()).toBe("sold");

    // 4. Cancel the sale bill
    const cancelRes = cancelSaleInvoice(db, {
      saleId: sale.id,
      reason: "Customer changed mind before leaving counter",
      cancelledBy: "Admin",
      role: "ADMIN",
    });

    expect(cancelRes.success).toBe(true);

    // 5. Verify: Bill status is CANCELLED (Soft delete)
    const cancelledSale = getSaleById(db, sale.id);
    expect(cancelledSale).not.toBeNull();
    expect(cancelledSale?.status).toBe("CANCELLED");
    expect(cancelledSale?.cancellationReason).toBe("Customer changed mind before leaving counter");
    expect(cancelledSale?.cancelledBy).toBe("Admin");
    expect(cancelledSale?.cancelledAt).toBeDefined();

    // 6. Verify: Stock restored to +1
    expect(getProductStock(db, mobileProd.id)).toBe(1);

    // 7. Verify: IMEI restored to IN_STOCK (or available)
    const unitAfterCancel = db.prepare("SELECT status FROM units WHERE imei1 = ?").get(testImei) as { status: string };
    expect(unitAfterCancel.status.toUpperCase()).toBe("IN_STOCK");

    // 8. Verify: Customer ledger reversed and due is 0
    const custDue = getCustomerDue(db, customer.id);
    expect(custDue).toBe(0);

    // 9. Verify: Payment account balance reversed
    const finalAccountBal = db.prepare("SELECT current_balance FROM payment_accounts WHERE id = ?").get(cashAccount.id) as { current_balance: number };
    expect(finalAccountBal.current_balance).toBe(initialAccountBal.current_balance);

    // 10. Verify: Audit log created
    const auditLogs = db.prepare("SELECT * FROM audit_logs WHERE record_id = ? AND action = 'SALE_BILL_CANCEL' ORDER BY created_at DESC LIMIT 1").all(sale.id) as any[];
    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].record_id).toBe(sale.id);

    // 11. Verify in Cancelled Bills register
    const cancelledBills = getCancelledBills(db);
    expect(cancelledBills.some((b) => b.id === sale.id)).toBe(true);
  });

  // TEST 2: CUSTOMER NOTE INVOICE APPEARANCE
  it("TEST 2: Verifies customer note appears on sale invoice and adapter", () => {
    const customer = addCustomer(db, { name: "Priya Patel", phone: "9826011111" });
    const noteText = "Screen guard installed free of cost.\nWarranty applicable as per company terms.";

    const sale = createSale(db, {
      customerId: customer.id,
      items: [{ name: "Cover", price: 250, qty: 1 }],
      discount: 0,
      payments: [{ mode: "Cash", amount: 250 }],
      customerNote: noteText,
    });

    expect(sale.customerNote).toBe(noteText);

    // Check adapter for invoice templates (A4, print, PDF, thermal, WhatsApp)
    const mockDb: Partial<AppDatabase> = {
      customers: [customer as any],
      settings: { shopName: "SHRI SAI MOBILE", city: "Harda", state: "Madhya Pradesh", stateCode: "23" } as any,
    };

    const invoiceProps = saleToInvoiceProps(sale as any, mockDb as AppDatabase);
    expect(invoiceProps.customerNote).toBe(noteText);
  });

  // TEST 3: OPENING / OLD STOCK vs TODAY'S INWARD vs TODAY'S OUTWARD vs CLOSING
  it("TEST 3: Calculates Closing Stock = Opening (10) + Today's Purchase (5) - Today's Sale (3) = 12", () => {
    // 1. Create accessory product with 10 opening stock
    const accProd = addProduct(db, {
      name: "Fast Type-C Cable 65W",
      brand: "Boat",
      category: "Accessories",
      tracked: false,
      purchasePrice: 100,
      sellingPrice: 200,
      openingStock: 10,
      stockType: "OLD_STOCK",
      stockSource: "OPENING_STOCK",
    });

    expect(getProductStock(db, accProd.id)).toBe(10);

    // 2. Purchase 5 today
    const supplier = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as { id: string };
    recordPurchase(db, {
      supplierId: supplier.id,
      items: [{ productId: accProd.id, name: accProd.name, qty: 5, purchasePrice: 100 }],
      paid: 500,
      paymentMode: "Cash",
      paymentAccountId: cashAccount.id,
    });

    expect(getProductStock(db, accProd.id)).toBe(15);

    // 3. Sell 3 today
    const customer = addCustomer(db, { name: "Amit Kumar", phone: "9900000001" });
    createSale(db, {
      customerId: customer.id,
      items: [{ productId: accProd.id, name: accProd.name, price: 200, qty: 3 }],
      discount: 0,
      payments: [{ mode: "Cash", amount: 600, accountId: cashAccount.id }],
    });

    // 4. Verify physical stock is 12
    expect(getProductStock(db, accProd.id)).toBe(12);

    // 5. Verify Dashboard Movement Summary
    const summary = getDashboardSummary(db);
    expect(summary.closingStock).toBeGreaterThanOrEqual(12);
    expect(summary.oldStockQty).toBeGreaterThanOrEqual(10);
  });

  // TEST 4: DAILY SALES BREAKDOWN (2 mobiles, 3 accessories => 5 total items)
  it("TEST 4: Shows correct breakdown of Mobile Phones Sold (2) and Accessories Sold (3)", () => {
    const phone = addProduct(db, {
      name: "OnePlus 12R",
      brand: "OnePlus",
      category: "Mobile Phones",
      tracked: false,
      sellingPrice: 40000,
      qty: 10,
    });

    const charger = addProduct(db, {
      name: "SuperVOOC Charger 80W",
      brand: "OnePlus",
      category: "Accessories",
      tracked: false,
      sellingPrice: 1500,
      qty: 20,
    });

    const cust = addCustomer(db, { name: "Vijay Verma", phone: "9826099999" });

    createSale(db, {
      customerId: cust.id,
      items: [
        { productId: phone.id, name: phone.name, price: 40000, qty: 2 },
        { productId: charger.id, name: charger.name, price: 1500, qty: 3 },
      ],
      discount: 0,
      payments: [{ mode: "Cash", amount: 84500, accountId: cashAccount.id }],
    });

    const dailySales = getDailySales(db);
    expect(dailySales.todayMobileSold).toBeGreaterThanOrEqual(2);
    expect(dailySales.todayAccessoriesSold).toBeGreaterThanOrEqual(3);
    expect(dailySales.todayItemsSold).toBeGreaterThanOrEqual(5);
  });

  // TEST 5: EMPLOYEE PERMISSION FOR SALE_BILL_DELETE
  it("TEST 5: Blocks employee without SALE_BILL_DELETE permission and allows Admin", async () => {
    // 1. Create a cashier employee without SALE_BILL_DELETE
    const cashier = addEmployee(db, {
      fullName: "Pooja Cashier",
      role: "CASHIER",
      department: "Sales",
    });

    // Revoke Sales DELETE permission
    setEmployeePermission(db, cashier.id, "Sales", "DELETE", false);

    // Verify checkEmployeePermission returns false
    const allowed = checkEmployeePermission(db, cashier.id, "Sales", "DELETE");
    expect(allowed).toBe(false);

    // 2. Direct backend API route test for unauthorized user
    const sale = createSale(db, {
      customerId: "c0",
      items: [{ name: "Sample Item", price: 100, qty: 1 }],
      discount: 0,
      payments: [{ mode: "Cash", amount: 100 }],
    });

    // Make request simulating Cashier role
    const req = new Request(`http://localhost/api/sales/${sale.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason: "Unauthorized cancel attempt",
        employeeId: cashier.id,
        role: "CASHIER",
      }),
    });

    const url = new URL(req.url);
    const res = await salesRoutes({
      request: req,
      url,
      pathname: url.pathname,
      method: req.method,
      db,
    });

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toContain("SALE_BILL_DELETE");

    // 3. Admin is allowed by default
    const adminAllowed = checkEmployeePermission(db, "emp_admin", "Sales", "DELETE");
    expect(adminAllowed).toBe(true);
  });

  // TEST 6: EMI SETTLEMENT GUARD TEST
  it("TEST 6: Blocks bill cancellation if EMI finance settlement was already received", () => {
    let finCompany = db.prepare("SELECT id FROM finance_companies LIMIT 1").get() as { id: string } | undefined;
    if (!finCompany) {
      db.prepare("INSERT INTO finance_companies (id, company_name) VALUES ('fc_test', 'Bajaj Finance')").run();
      finCompany = { id: 'fc_test' };
    }

    const emiSale = createSale(db, {
      customerId: "c0",
      items: [{ name: "Oppo Reno 11", price: 30000, qty: 1 }],
      discount: 0,
      payments: [{ mode: "Cash", amount: 5000 }],
      isEmi: true,
      emiCompanyId: finCompany.id,
      emiDownPayment: 5000,
      emiFinancedAmount: 25000,
    });

    // Mark EMI receivable as settled/received
    db.prepare("UPDATE emi_receivables SET status = 'RECEIVED', received_amount = 25000 WHERE sale_id = ?").run(emiSale.id);

    // Cancellation must fail with explicit error message
    expect(() => {
      cancelSaleInvoice(db, {
        saleId: emiSale.id,
        reason: "Try to cancel settled EMI",
        cancelledBy: "Admin",
      });
    }).toThrow("EMI settlement already received. Admin action required.");
  });
});
