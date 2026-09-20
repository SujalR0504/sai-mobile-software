import { describe, expect, it, beforeAll } from "bun:test";
import { getDB } from "../db/client";
import {
  recordPurchasePayment,
  getPurchasePayments,
  deletePurchasePayment,
  recordPurchase,
} from "../services/purchaseService";
import {
  getItemWiseReport,
  getProductStockLedger,
  getImeiWiseReport,
} from "../services/reportService";
import {
  normalizeIndianPhone,
  generateDueWhatsAppMessage,
  generateConsolidatedDueWhatsAppMessage,
  generateRepairWhatsAppMessage,
} from "../../lib/whatsapp";

describe("Payment Lifecycle, IMEI Scanner, WhatsApp & Reports Test Suite", () => {
  let db: any;
  let testDealerId: string;
  let testProductId: string;
  let createdPurchaseId: string;

  beforeAll(() => {
    db = getDB();

    // Ensure dealer exists
    const dealer = db
      .prepare("SELECT id FROM suppliers WHERE phone = '9826012345'")
      .get() as any;
    if (dealer) {
      testDealerId = dealer.id;
    } else {
      testDealerId = `sup_test_${Date.now()}`;
      db.prepare(`
        INSERT INTO suppliers (id, name, company, phone, email, gstin, address, city, state, state_code)
        VALUES (?, 'Test Distributor Harda', 'Test Mobile Dist', '9826012345', 'dist@test.com', '23AAACT0000A1Z5', 'Main Road', 'Harda', 'Madhya Pradesh', '23')
      `).run(testDealerId);
    }

    // Ensure product exists
    const prod = db.prepare("SELECT id FROM products LIMIT 1").get() as any;
    if (prod) {
      testProductId = prod.id;
    } else {
      testProductId = `prod_test_${Date.now()}`;
      db.prepare(`
        INSERT INTO products (id, name, category, brand, model, purchase_price, selling_price, tracked)
        VALUES (?, 'Test Phone 5G', 'Mobiles', 'TestBrand', 'T-100', 10000, 12000, 1)
      `).run(testProductId);
    }
  });

  // ==========================================
  // 1. PURCHASE PAYMENT LIFECYCLE
  // ==========================================
  describe("1. Purchase Payment Lifecycle & Dealer Ledger Updates", () => {
    it("creates a purchase bill with partial initial payment and correct initial status", () => {
      const invNo = `TEST-PUR-${Date.now()}`;
      const imei1 = `998877${Date.now().toString().slice(-9)}`;
      const imei2 = `998878${Date.now().toString().slice(-9)}`;

      const purchase = recordPurchase(db, {
        purchaseType: "GST",
        dealerId: testDealerId,
        supplierId: testDealerId,
        invoiceNo: invNo,
        date: "2026-09-17",
        items: [
          {
            productId: testProductId,
            name: "Test Phone 5G",
            qty: 2,
            unit: "pcs",
            rateExcludingTax: 10000,
            rateIncludingTax: 11800,
            taxableAmount: 20000,
            gstRate: 18,
            cgstPct: 9,
            cgstAmount: 1800,
            sgstPct: 9,
            sgstAmount: 1800,
            igstPct: 0,
            igstAmount: 0,
            totalAmount: 23600,
          },
        ],
        imeis: {
          [testProductId]: [imei1, imei2],
        },
        otherCharges: 0,
        tdsApplicable: false,
        roundOff: 0,
        paid: 10000, // Partial initial payment
        mode: "Bank",
      });

      expect(purchase).toBeDefined();
      expect(purchase.total).toBe(23600);
      expect(purchase.paid).toBe(10000);
      expect(purchase.dueAmount).toBe(13600);
      expect(purchase.status).toBe("PARTIALLY PAID");
      createdPurchaseId = purchase.id;
    });

    it("records a subsequent partial payment, recalculates outstanding, and updates status", () => {
      const result = recordPurchasePayment(db, createdPurchaseId, {
        amount: 5000,
        date: "2026-09-18",
        mode: "UPI",
        referenceNo: "UPI/2026/987654321",
        remarks: "Second installment",
        userName: "Admin",
      });

      expect(result.payment).toBeDefined();
      expect(result.payment.amount).toBe(5000);
      expect(result.purchase.paid).toBe(15000);
      expect(result.purchase.dueAmount).toBe(8600);
      expect(result.purchase.status).toBe("PARTIALLY PAID");

      // Verify supplier ledger has debit entry
      const ledgerEntry = db
        .prepare("SELECT * FROM supplier_ledger WHERE reference_id = ? AND debit = 5000")
        .get(createdPurchaseId) as any;
      expect(ledgerEntry).toBeDefined();
      expect(ledgerEntry.debit).toBe(5000);
    });

    it("rejects payments greater than the outstanding balance (overpayment protection)", () => {
      expect(() => {
        recordPurchasePayment(db, createdPurchaseId, {
          amount: 20000, // Outstanding is only 8600
          date: "2026-09-18",
          mode: "Bank",
        });
      }).toThrow(/cannot exceed outstanding balance/);
    });

    it("records the final payment, settling the bill to PAID and dueAmount to 0", () => {
      const result = recordPurchasePayment(db, createdPurchaseId, {
        amount: 8600,
        date: "2026-09-19",
        mode: "Bank",
        referenceNo: "NEFT/881230",
        remarks: "Final settlement",
        userName: "Admin",
      });

      expect(result.purchase.paid).toBe(23600);
      expect(result.purchase.dueAmount).toBe(0);
      expect(result.purchase.status).toBe("PAID");
    });

    it("fetches payment history for the purchase bill", () => {
      const payments = getPurchasePayments(db, createdPurchaseId);
      expect(payments.length).toBe(3); // Initial 10000 + 2 subsequent payments
      expect(payments.some((p) => p.amount === 8600)).toBe(true);
      expect(payments.some((p) => p.amount === 5000)).toBe(true);
      expect(payments.some((p) => p.amount === 10000)).toBe(true);
    });

    it("deletes a payment record, reversing ledger and recalculating outstanding balance", () => {
      const payments = getPurchasePayments(db, createdPurchaseId);
      const toDelete = payments.find((p) => p.amount === 8600)!;

      const result = deletePurchasePayment(db, createdPurchaseId, toDelete.id);
      expect(result.purchase.paid).toBe(15000);
      expect(result.purchase.dueAmount).toBe(8600);
      expect(result.purchase.status).toBe("PARTIALLY PAID");

      // Verify payment was removed
      const remaining = getPurchasePayments(db, createdPurchaseId);
      expect(remaining.length).toBe(2);
    });
  });

  // ==========================================
  // 2. WHATSAPP ENGINE & PHONE NORMALIZATION
  // ==========================================
  describe("2. WhatsApp Engine & Phone Formatting", () => {
    it("normalizes Indian phone numbers correctly with 91 prefix", () => {
      expect(normalizeIndianPhone("9826012345")).toBe("919826012345");
      expect(normalizeIndianPhone("+91 98260-12345")).toBe("919826012345");
      expect(normalizeIndianPhone("09826012345")).toBe("919826012345");
      expect(normalizeIndianPhone("919826012345")).toBe("919826012345");
    });

    it("generates a professional single invoice due WhatsApp message with store branding", () => {
      const msg = generateDueWhatsAppMessage({
        customerName: "Rakesh Verma",
        customerPhone: "9826012345",
        invoiceNo: "GST/2026/1042",
        invoiceDate: "2026-09-15",
        totalAmount: 25000,
        paidAmount: 15000,
        dueAmount: 10000,
      });

      expect(msg).toContain("SHRI SAI MOBILE");
      expect(msg).toContain("Rakesh Verma");
      expect(msg).toContain("GST/2026/1042");
      expect(msg).toContain("10,000");
      expect(msg).toContain("8817740040@paytm");
      expect(msg).toContain("NO NEED TO WORRY");
    });

    it("generates a consolidated due WhatsApp message for customers with multiple unpaid invoices", () => {
      const msg = generateConsolidatedDueWhatsAppMessage({
        customerName: "Suresh Gupta",
        customerPhone: "9826054321",
        totalDue: 35000,
        invoices: [
          { invoiceNo: "INV-001", date: "2026-09-01", total: 20000, due: 15000 },
          { invoiceNo: "INV-002", date: "2026-09-10", total: 25000, due: 20000 },
        ],
      });

      expect(msg).toContain("Suresh Gupta");
      expect(msg).toContain("INV-001");
      expect(msg).toContain("INV-002");
      expect(msg).toContain("35,000");
      expect(msg).toContain("SHRI SAI MOBILE");
    });

    it("generates contextual repair WhatsApp messages for all repair lifecycle stages", () => {
      const receivedMsg = generateRepairWhatsAppMessage({
        customerName: "Amit Sharma",
        customerPhone: "9826099999",
        jobId: "REP-2026-108",
        device: "iPhone 13",
        problem: "Display screen broken",
        status: "Received",
        estimate: 6500,
        advance: 1000,
        balanceDue: 5500,
      });
      expect(receivedMsg).toContain("Job Card Created");
      expect(receivedMsg).toContain("iPhone 13");
      expect(receivedMsg).toContain("REP-2026-108");

      const readyMsg = generateRepairWhatsAppMessage({
        customerName: "Amit Sharma",
        customerPhone: "9826099999",
        jobId: "REP-2026-108",
        device: "iPhone 13",
        problem: "Display screen broken",
        status: "Ready",
        estimate: 6500,
        advance: 1000,
        balanceDue: 5500,
      });
      expect(readyMsg).toContain("Ready for Pickup");
      expect(readyMsg).toContain("5,500");
    });
  });

  // ==========================================
  // 3. ITEM-WISE & IMEI-WISE REPORTS
  // ==========================================
  describe("3. Item-Wise & IMEI-Wise Reports", () => {
    it("calculates accurate item-wise stock movement according to the ERP accounting formula", () => {
      const report = getItemWiseReport(db, {});
      expect(report.rows).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.rows.length).toBeGreaterThan(0);

      // Verify the formula: Closing = Opening + PurchasesIn - PurchaseReturnsOut - SalesOut + SaleReturnsIn + Adjustments
      for (const row of report.rows) {
        const expectedClosing =
          row.openingStock +
          row.purchasesIn -
          row.purchaseReturnsOut -
          row.salesOut +
          row.saleReturnsIn +
          row.adjustments;
        expect(row.closingStock).toBe(expectedClosing);
        expect(row.stockValuation).toBe(Math.round(row.closingStock * row.purchasePrice * 100) / 100);
      }

      // Verify summary totals match sum of rows
      const sumClosing = report.rows.reduce((sum, r) => sum + r.closingStock, 0);
      expect(report.summary.totalClosing).toBe(sumClosing);
    });

    it("filters item-wise report by category and brand", () => {
      const report = getItemWiseReport(db, { category: "Mobiles" });
      expect(report.rows.every((r) => r.category.toLowerCase() === "mobiles")).toBe(true);
    });

    it("retrieves the chronological product stock movement drilldown ledger", () => {
      const ledger = getProductStockLedger(db, testProductId);
      expect(Array.isArray(ledger)).toBe(true);
      if (ledger.length > 0) {
        expect(ledger[0]).toHaveProperty("date");
        expect(ledger[0]).toHaveProperty("type");
        expect(ledger[0]).toHaveProperty("balance");
      }
    });

    it("retrieves the serialized IMEI-wise unit register with aging and dealer/sale info", () => {
      const imeiReport = getImeiWiseReport(db, {});
      expect(Array.isArray(imeiReport)).toBe(true);
      expect(imeiReport.length).toBeGreaterThan(0);

      const firstUnit = imeiReport[0];
      expect(firstUnit).toHaveProperty("imei");
      expect(firstUnit).toHaveProperty("status");
      expect(firstUnit).toHaveProperty("productName");
      expect(["AVAILABLE", "SOLD", "RETURNED", "DAMAGED", "REPAIR", "RESERVED"]).toContain(firstUnit.status);
    });
  });
});
