import { describe, it, expect } from "bun:test";
import { numberToIndianWords } from "../../lib/format";
import { getSettings, updateSettings } from "../services/settingsService";
import { getDB } from "../db/client";
import {
  saleToInvoiceProps,
  purchaseToInvoiceProps,
  debitNoteToInvoiceProps,
  returnDocToInvoiceProps,
} from "../../components/invoice/invoiceAdapters";
import type { AppDatabase, Sale, Purchase, DebitNote, ReturnDoc } from "../../lib/types";

describe("Invoice Template System & Data Integration", () => {
  const db = getDB();

  describe("numberToIndianWords", () => {
    it("converts zero correctly", () => {
      expect(numberToIndianWords(0)).toBe("INR Zero Only");
    });

    it("converts standard mobile shop amounts accurately into Indian words", () => {
      // 56157 is a common phone price (e.g. iPhone or Vivo V-series)
      const words56157 = numberToIndianWords(56157);
      expect(words56157).toContain("Fifty Six Thousand");
      expect(words56157).toContain("One Hundred Fifty Seven");
      expect(words56157).toMatch(/^INR /);
      expect(words56157).toMatch(/ Only$/);
    });

    it("converts Lakhs and Crores accurately", () => {
      const wordsLakh = numberToIndianWords(150000);
      expect(wordsLakh).toContain("One Lakh Fifty Thousand");

      const wordsCrore = numberToIndianWords(10000000);
      expect(wordsCrore).toContain("One Crore");
    });

    it("handles decimal paise values accurately", () => {
      const wordsDecimal = numberToIndianWords(1250.5);
      expect(wordsDecimal).toContain("One Thousand Two Hundred Fifty");
      expect(wordsDecimal).toContain("Fifty Paise");
    });
  });

  describe("Settings & Shop Profile Persistence", () => {
    it("loads default SHRI SAI MOBILE configuration", () => {
      const settings = getSettings(db);
      expect(settings.shopName).toContain("SHRI SAI MOBILE");
      expect(settings.tagline).toBe("NO NEED TO WORRY");
      expect(settings.dealsIn).toContain("Mobile Phones");
      expect(settings.bankName).toBeTruthy();
      expect(settings.bankAccountNo).toBeTruthy();
      expect(settings.bankIfsc).toBeTruthy();
      expect(settings.termsAndConditions).toBeInstanceOf(Array);
      expect(settings.termsAndConditions.length).toBeGreaterThan(0);
    });

    it("persists updates to shop profile and invoice configurations", () => {
      const original = getSettings(db);
      const testPrefix = `TEST-${Date.now()}`;

      const updated = updateSettings(db, {
        gstInvoicePrefix: testPrefix,
        city: "Harda",
        state: "Madhya Pradesh",
        stateCode: "23",
      });

      expect(updated.gstInvoicePrefix).toBe(testPrefix);

      const refreshed = getSettings(db);
      expect(refreshed.gstInvoicePrefix).toBe(testPrefix);

      // Restore original prefix
      updateSettings(db, { gstInvoicePrefix: original.gstInvoicePrefix });
    });
  });

  describe("Universal Invoice Adapters", () => {
    const mockDb: AppDatabase = {
      products: [],
      units: [],
      customers: [
        {
          id: "cust-1",
          name: "Rohan Verma",
          phone: "9826012345",
          address: "Railway Station Road, Harda",
          gstin: "23AABCR1234F1Z5",
          city: "Harda",
          state: "Madhya Pradesh",
          stateCode: "23",
          createdAt: "2026-01-01",
        },
      ],
      suppliers: [
        {
          id: "supp-1",
          name: "Tanay Traders",
          phone: "9425011223",
          email: "tanay@traders.com",
          address: "New Market, Indore",
          gstin: "23AABCT9988H1Z2",
          city: "Indore",
          state: "Madhya Pradesh",
          stateCode: "23",
          contactPerson: "Tanay Sharma",
        },
      ],
      sales: [],
      purchases: [],
      returns: [],
      repairs: [],
      expenses: [],
      payments: [],
      emiCompanies: [
        {
          id: "emi-1",
          companyName: "Bajaj Finserv",
          contactPerson: "Branch Rep",
          contactPhone: "9876543210",
          settlementPeriodDays: 3,
          processingFeePercentage: 1.5,
          active: true,
        },
      ],
      debitNotes: [],
      settings: getSettings(db),
    };

    it("correctly maps a real GST Sale to InvoiceDocumentProps", () => {
      const sale: Sale = {
        id: "sale-101",
        invoiceNo: "SSM/2026-27/0042",
        invoiceType: "GST",
        date: "2026-09-17",
        customerId: "cust-1",
        items: [
          {
            productId: "p1",
            name: "Vivo V40 5G (8GB/256GB)",
            qty: 1,
            price: 34999,
            gst: 18,
            costPrice: 31000,
            imei: "867890054321098",
            imeis: ["867890054321098"],
          },
        ],
        discount: 500,
        subtotal: 34999,
        tax: 5338.83,
        total: 34499,
        paid: 34499,
        payments: [{ mode: "UPI", amount: 34499 }],
      };

      const props = saleToInvoiceProps(sale, mockDb);

      expect(props.type).toBe("GST_SALE");
      expect(props.invoiceNo).toBe("SSM/2026-27/0042");
      expect(props.party.name).toBe("Rohan Verma");
      expect(props.party.gstin).toBe("23AABCR1234F1Z5");
      expect(props.items.length).toBe(1);
      expect(props.items[0].imei).toBe("867890054321098");
      expect(props.items[0].hsnSac).toBe("8517");
      expect(props.items[0].gstRate).toBe(18);
      expect(props.items[0].cgstPct).toBe(9);
      expect(props.items[0].sgstPct).toBe(9);
      expect(props.totals.grandTotal).toBe(34499);
      expect(props.totals.amountInWords).toContain("Thirty Four Thousand Four Hundred Ninety Nine");
    });

    it("correctly maps a NON_GST Sale with 0 tax and proper Bill of Supply title", () => {
      const sale: Sale = {
        id: "sale-102",
        invoiceNo: "SSM-RETAIL-0105",
        invoiceType: "NON_GST",
        date: "2026-09-17",
        customerId: "cust-1",
        items: [
          {
            productId: "p2",
            name: "Boat Airdopes 141",
            qty: 1,
            price: 1299,
            gst: 18,
            costPrice: 850,
          },
        ],
        discount: 0,
        subtotal: 1299,
        tax: 0,
        total: 1299,
        paid: 1299,
        payments: [{ mode: "Cash", amount: 1299 }],
      };

      const props = saleToInvoiceProps(sale, mockDb);

      expect(props.type).toBe("NON_GST_SALE");
      expect(props.totals.taxableValue).toBe(1299);
      expect(props.totals.cgstAmount).toBe(0);
      expect(props.totals.sgstAmount).toBe(0);
      expect(props.items[0].gstRate).toBe(0);
      expect(props.totals.grandTotal).toBe(1299);
    });

    it("correctly maps an EMI Sale with finance partner and down payment breakdown", () => {
      const sale: Sale = {
        id: "sale-103",
        invoiceNo: "SSM/EMI/0012",
        invoiceType: "GST",
        date: "2026-09-17",
        customerId: "cust-1",
        items: [
          {
            productId: "p3",
            name: "Samsung Galaxy S24 Ultra",
            qty: 1,
            price: 129999,
            gst: 18,
            costPrice: 118000,
            imei: "354678091234567",
          },
        ],
        discount: 0,
        subtotal: 129999,
        tax: 19830.36,
        total: 129999,
        paid: 29999,
        payments: [
          { mode: "Cash", amount: 29999 },
          { mode: "EMI", amount: 100000 },
        ],
        isEmi: true,
        emiCompanyId: "emi-1",
        emiDownPayment: 29999,
        emiFinancedAmount: 100000,
      };

      const props = saleToInvoiceProps(sale, mockDb);

      expect(props.payment?.isEmi).toBe(true);
      expect(props.payment?.emiCompanyName).toBe("Bajaj Finserv");
      expect(props.payment?.emiDownPayment).toBe(29999);
      expect(props.payment?.emiFinancedAmount).toBe(100000);
      expect(props.payment?.due).toBe(100000);
    });

    it("correctly maps a real Dealer Purchase Bill", () => {
      const purchase: Purchase = {
        id: "pur-1",
        invoiceNo: "2627TTRM/695",
        purchaseType: "GST",
        date: "2026-09-15",
        supplierId: "supp-1",
        items: [
          {
            productId: "p1",
            name: "Vivo V40 (8/128) Lotus Purple",
            qty: 2,
            price: 33000,
            gst: 18,
            costPrice: 30000,
            hsnSac: "8517",
            taxableAmount: 60000,
            cgstAmount: 5400,
            sgstAmount: 5400,
            totalAmount: 70800,
            imeis: ["867890054321098", "867890054321099"],
          },
        ],
        discount: 0,
        subtotal: 60000,
        tax: 10800,
        total: 70800,
        paid: 50000,
        mode: "Bank",
        placeOfSupply: "Madhya Pradesh",
        stateCode: "23",
        originalInvoiceNo: "2627TTRM/695",
      };

      const props = purchaseToInvoiceProps(purchase, mockDb);

      expect(props.type).toBe("GST_PURCHASE");
      expect(props.party.name).toBe("Tanay Traders");
      expect(props.party.gstin).toBe("23AABCT9988H1Z2");
      expect(props.totals.taxableValue).toBe(60000);
      expect(props.totals.cgstAmount).toBe(5400);
      expect(props.totals.sgstAmount).toBe(5400);
      expect(props.totals.grandTotal).toBe(70800);
      expect(props.payment?.due).toBe(20800);
    });

    it("correctly maps Debit Notes (TDS 194R)", () => {
      const debitNote: DebitNote = {
        id: "dn-1",
        noteNumber: "2627DNTDS/65",
        date: "2026-09-16",
        supplierId: "supp-1",
        originalInvoiceNo: "2627TTRM/695",
        amount: 228.81,
        reason: "TDS 194R Deduction @ 10%",
        section: "TDS 194R",
        tdsAmount: 228.81,
        status: "ACTIVE",
        createdAt: "2026-09-16",
      };

      const props = debitNoteToInvoiceProps(debitNote, mockDb);

      expect(props.type).toBe("PURCHASE_RETURN");
      expect(props.invoiceNo).toBe("2627DNTDS/65");
      expect(props.party.name).toBe("Tanay Traders");
      expect(props.totals.grandTotal).toBe(228.81);
      expect(props.totals.tdsAmount).toBe(228.81);
      expect(props.totals.amountInWords).toContain("Two Hundred Twenty Eight");
    });

    it("correctly maps Customer Sale Return and Dealer Purchase Return", () => {
      const saleReturn: ReturnDoc = {
        id: "ret-1",
        type: "sale",
        refId: "sale-101",
        refNo: "SSM/2026-27/0042",
        date: "2026-09-17",
        partyId: "cust-1",
        items: [
          {
            productId: "p1",
            name: "Vivo V40 5G",
            qty: 1,
            price: 34499,
            gst: 18,
            costPrice: 31000,
          },
        ],
        amount: 34499,
        reason: "Customer exchanged for another color",
        mode: "Credit Note",
      };

      const saleProps = returnDocToInvoiceProps(saleReturn, mockDb);
      expect(saleProps.type).toBe("SALE_RETURN");
      expect(saleProps.party.name).toBe("Rohan Verma");
      expect(saleProps.payment?.mode).toBe("Credit Note");

      const purchaseReturn: ReturnDoc = {
        id: "ret-2",
        type: "purchase",
        refId: "pur-1",
        refNo: "2627TTRM/695",
        date: "2026-09-17",
        partyId: "supp-1",
        items: [
          {
            productId: "p1",
            name: "Vivo V40 (Defective Mic)",
            qty: 1,
            price: 30000,
            gst: 18,
            costPrice: 30000,
          },
        ],
        amount: 35400,
        reason: "Defective mic sent back to dealer for warranty replacement",
        mode: "Credit Note",
      };

      const purProps = returnDocToInvoiceProps(purchaseReturn, mockDb);
      expect(purProps.type).toBe("PURCHASE_RETURN");
      expect(purProps.party.name).toBe("Tanay Traders");
      expect(purProps.totals.grandTotal).toBe(35400);
    });
  });
});
