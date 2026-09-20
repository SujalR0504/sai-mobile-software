import { describe, expect, test } from "bun:test";
import { getDB } from "../db/client";
import { handleApiRequest } from "../api/router";
import { validateIMEI, checkDuplicate, getIMEI, markAvailable, markSold } from "../services/imeiService";
import { getCustomerOutstandingBreakdown } from "../services/duesAndPaymentsService";
import { getSupplierDue } from "../services/duesAndPaymentsService";
import { getProductStock } from "../services/stockService";

describe("Architecture Separation & Integrity Test Suite", () => {
  const db = getDB();

  test("1. Modular Route Dispatcher - Settings & Health", async () => {
    const healthReq = new Request("http://localhost:8080/api/health", { method: "GET" });
    const healthRes = await handleApiRequest(healthReq);
    expect(healthRes.status).toBe(200);
    const healthData = await healthRes.json();
    expect(healthData.status).toBe("ok");

    const settingsReq = new Request("http://localhost:8080/api/settings", { method: "GET" });
    const settingsRes = await handleApiRequest(settingsReq);
    expect(settingsRes.status).toBe(200);
    const settingsData = await settingsRes.json();
    expect(settingsData.shopName).toBeTruthy();
  });

  test("2. Centralized IMEI Service - Validation & Lifecycle", () => {
    // Empty IMEI check
    const emptyRes = validateIMEI(db, "");
    expect(emptyRes.valid).toBe(false);

    // Invalid format
    const invalidRes = validateIMEI(db, "123");
    expect(invalidRes.valid).toBe(false);

    // Non-existent valid IMEI format
    const testImei = "860000000000001";
    const nonExistent = validateIMEI(db, testImei);
    expect(nonExistent.valid).toBe(true);
    expect(nonExistent.exists).toBe(false);
  });

  test("3. Customer Due & Outstanding API - GET /api/customers/:id/outstanding", async () => {
    // Create customer via API
    const custReq = new Request("http://localhost:8080/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Customer Arch",
        phone: "9876540001",
        address: "Architecture Test City",
      }),
    });
    const custRes = await handleApiRequest(custReq);
    expect(custRes.status).toBe(201);
    const customer = await custRes.json();
    expect(customer.id).toBeTruthy();

    // Query outstanding endpoint
    const outReq = new Request(`http://localhost:8080/api/customers/${customer.id}/outstanding`, { method: "GET" });
    const outRes = await handleApiRequest(outReq);
    expect(outRes.status).toBe(200);
    const outstanding = await outRes.json();
    expect(outstanding.customerId).toBe(customer.id);
    expect(outstanding.totalDue).toBe(0);
    expect(Array.isArray(outstanding.invoiceWiseDue)).toBe(true);
  });

  test("4. Server-Verified Invoice API - GET /api/invoices/:id", async () => {
    // Fetch an existing sale or test 404 for unknown
    const invReq = new Request("http://localhost:8080/api/invoices/non_existent_id", { method: "GET" });
    const invRes = await handleApiRequest(invReq);
    expect(invRes.status).toBe(404);
  });

  test("5. Section 34 Critical Lifecycle Test Scenario", async () => {
    // ----------------------------------------------------
    // Step A: Setup Product & Dealer
    // ----------------------------------------------------
    const timestamp = Date.now();
    const dealerReq = new Request("http://localhost:8080/api/dealers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Section34 Dealer ${timestamp}`,
        company: "Mobile World Distribution Ltd",
        phone: "9988776655",
        gstin: "23AABCT1330L1Z2",
      }),
    });
    const dealerRes = await handleApiRequest(dealerReq);
    expect(dealerRes.status).toBe(201);
    const dealer = await dealerRes.json();

    const prodReq = new Request("http://localhost:8080/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Galaxy Ultra 34-${timestamp}`,
        brand: "Samsung",
        model: "S24 Ultra",
        category: "Mobile",
        tracked: true,
        purchasePrice: 10000,
        sellingPrice: 15000,
        mrp: 16000,
        gst: 0, // Non-GST for exact 100k math clarity
        qty: 0,
      }),
    });
    const prodRes = await handleApiRequest(prodReq);
    expect(prodRes.status).toBe(201);
    const product = await prodRes.json();

    // Verify product creation did not create stock
    expect(getProductStock(db, product.id)).toBe(0);

    // ----------------------------------------------------
    // Step B: Purchase 10 Units with 10 Unique IMEIs
    // Purchase Amount: ₹100,000
    // Payment: ₹40,000
    // Outstanding: ₹60,000
    // ----------------------------------------------------
    const imeis: string[] = [];
    for (let i = 1; i <= 10; i++) {
      imeis.push(`35987654321${timestamp.toString().slice(-4)}${i.toString().padStart(2, "0")}`);
    }

    const purchaseReq = new Request("http://localhost:8080/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        purchaseType: "NON_GST",
        dealerId: dealer.id,
        invoiceNo: `PUR-34-${timestamp}`,
        date: "2026-09-18",
        items: [
          {
            productId: product.id,
            name: product.name,
            qty: 10,
            price: 10000,
            costPrice: 10000,
            gst: 0,
          },
        ],
        imeis: {
          [product.id]: imeis,
        },
        discount: 0,
        paid: 40000,
        mode: "Bank Transfer",
      }),
    });

    const purchaseRes = await handleApiRequest(purchaseReq);
    expect(purchaseRes.status).toBe(201);
    const purchase = await purchaseRes.json();

    // Verify Purchase Amount and Paid
    expect(purchase.total).toBe(100000);
    expect(purchase.paid).toBe(40000);

    // Verify Dealer Due is ₹60,000
    const dealerDueAfterPur = getSupplierDue(db, dealer.id);
    expect(dealerDueAfterPur).toBe(60000);

    // Verify Stock is 10
    const stockAfterPur = getProductStock(db, product.id);
    expect(stockAfterPur).toBe(10);

    // Verify all 10 IMEIs are in stock ('available')
    for (const imei of imeis) {
      const imeiData = getIMEI(db, imei);
      expect(imeiData).toBeTruthy();
      expect(imeiData?.status).toBe("available");
    }

    // ----------------------------------------------------
    // Step C: Sell 1 Phone
    // ----------------------------------------------------
    const soldImei = imeis[0];
    const soldUnit = getIMEI(db, soldImei);
    expect(soldUnit).toBeTruthy();

    const customerReq = new Request("http://localhost:8080/api/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Section34 Buyer ${timestamp}`,
        phone: "9123456789",
      }),
    });
    const customerRes = await handleApiRequest(customerReq);
    const buyer = await customerRes.json();

    const saleReq = new Request("http://localhost:8080/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customerId: buyer.id,
        invoiceType: "NON_GST",
        items: [
          {
            productId: product.id,
            unitId: soldUnit?.id,
            name: product.name,
            qty: 1,
            price: 15000,
            costPrice: 10000,
            gst: 0,
            imei: soldImei,
          },
        ],
        discount: 0,
        payments: [{ mode: "Cash", amount: 15000 }],
      }),
    });

    const saleRes = await handleApiRequest(saleReq);
    expect(saleRes.status).toBe(201);
    const sale = await saleRes.json();

    // ----------------------------------------------------
    // Step D: Verify Balances and Stock Post-Sale
    // - Purchase remains ₹100,000
    // - Purchase paid remains ₹40,000
    // - Dealer due remains ₹60,000
    // - Stock becomes 9
    // - IMEI becomes SOLD
    // ----------------------------------------------------
    const purCheck = db.prepare("SELECT total, paid FROM purchases WHERE id = ?").get(purchase.id) as any;
    expect(purCheck.total).toBe(100000);
    expect(purCheck.paid).toBe(40000);

    const dealerDueAfterSale = getSupplierDue(db, dealer.id);
    expect(dealerDueAfterSale).toBe(60000);

    const stockAfterSale = getProductStock(db, product.id);
    expect(stockAfterSale).toBe(9);

    const soldImeiCheck = getIMEI(db, soldImei);
    expect(soldImeiCheck?.status).toBe("sold");
    expect(soldImeiCheck?.saleId).toBe(sale.id);

    // Remaining 9 IMEIs must remain 'available'
    for (let i = 1; i < 10; i++) {
      const availCheck = getIMEI(db, imeis[i]);
      expect(availCheck?.status).toBe("available");
    }

    // ----------------------------------------------------
    // Step E: Receive Dealer Payment of ₹60,000
    // ----------------------------------------------------
    const dealerPaymentReq = new Request(`http://localhost:8080/api/purchases/${purchase.id}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: 60000,
        date: "2026-09-18",
        mode: "Bank Transfer",
        remarks: "Settlement of remaining balance",
      }),
    });

    const dealerPaymentRes = await handleApiRequest(dealerPaymentReq);
    expect(dealerPaymentRes.status).toBe(201);

    // Verify Dealer outstanding is now ₹0
    const finalDealerDue = getSupplierDue(db, dealer.id);
    expect(finalDealerDue).toBe(0);

    // Verify no duplicates
    const duplicatePurCount = (db.prepare("SELECT COUNT(*) as count FROM purchases WHERE id = ?").get(purchase.id) as any).count;
    expect(duplicatePurCount).toBe(1);

    const duplicateStockCount = (db.prepare("SELECT COUNT(*) as count FROM units WHERE product_id = ?").get(product.id) as any).count;
    expect(duplicateStockCount).toBe(10);
  });
});
