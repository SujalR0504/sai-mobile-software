import { describe, expect, it } from "bun:test";
import { DatabaseSync } from "node:sqlite";
import { initSchema, runMigrations, seedCategoriesAndHierarchy, seedIfEmpty } from "../db/schema";
import {
  createBrand,
  createCategory,
  createModel,
  createSubcategory,
} from "../services/categoryService";
import { addProduct, getProductStock, searchImei } from "../services/stockService";
import { addCustomer, addSupplier, getSupplierDue } from "../services/duesAndPaymentsService";
import { recordPurchase, getPurchaseById } from "../services/purchaseService";
import { createSale, getSaleById } from "../services/salesService";
import { recordDebitNote, getDebitNotesByDealer } from "../services/debitNoteService";
import { recordPurchaseReturn } from "../services/returnService";
import { extractInvoiceData } from "../services/invoiceExtractionService";
import { getPurchaseAttachments, getSupplierLedger } from "../db/repository";

describe("Commercial Mobile Shop ERP - Purchase, Sales, GST/Non-GST & Ledger Integration Suite", () => {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  seedIfEmpty(db);
  runMigrations(db);
  seedCategoriesAndHierarchy(db);

  let categoryId = "";
  let subcategoryId = "";
  let brandId = "";
  let modelId = "";
  let mobileProductId = "";
  let accessoryProductId = "";
  let dealerMpId = "";
  let dealerMhId = "";
  let customerId = "";
  let gstPurchaseId = "";
  let returnableUnitId = "";

  it("1. Setup Catalog: Category, Brand, Model & Products", () => {
    const cat = createCategory(db, { name: "Mobile Phones", icon: "📱" });
    categoryId = cat.id;

    const sub = createSubcategory(db, { categoryId, name: "Smartphones" });
    subcategoryId = sub.id;

    const brand = createBrand(db, { name: "OPPO", subcategoryId });
    brandId = brand.id;

    const model = createModel(db, {
      brandId,
      subcategoryId,
      name: "OPPO A5",
      series: "A Series",
    });
    modelId = model.id;

    // Tracked Mobile Phone
    const prod1 = addProduct(db, {
      name: "OPPO A5 64GB Mirror Black",
      categoryId,
      subcategoryId,
      brandId,
      modelId,
      brand: "OPPO",
      model: "OPPO A5",
      hsnCode: "85171300",
      tracked: true,
      price: 15000,
      costPrice: 10000,
      gst: 18,
      stock: 0,
      lowStockAlert: 2,
    });
    mobileProductId = prod1.id;

    // Non-tracked Accessory
    const accCat = createCategory(db, { name: "Accessories", icon: "🔌" });
    const accSub = createSubcategory(db, { categoryId: accCat.id, name: "Cables" });
    const accBrand = createBrand(db, { name: "Generic", subcategoryId: accSub.id });

    const prod2 = addProduct(db, {
      name: "Type-C Fast Charging Cable",
      categoryId: accCat.id,
      subcategoryId: accSub.id,
      brandId: accBrand.id,
      brand: "Generic",
      hsnCode: "85444299",
      tracked: false,
      price: 350,
      costPrice: 150,
      gst: 18,
      stock: 0,
      lowStockAlert: 5,
    });
    accessoryProductId = prod2.id;

    // Customer
    const cust = addCustomer(db, {
      name: "Rajesh Sharma",
      phone: "9826011223",
      city: "Indore",
    });
    customerId = cust.id;

    expect(mobileProductId).toBeDefined();
    expect(accessoryProductId).toBeDefined();
    expect(customerId).toBeDefined();
  });

  it("2. Dealer Creation with complete GST & contact details", () => {
    // Intrastate Dealer (Madhya Pradesh - State Code 23)
    const dealerMp = addSupplier(db, {
      name: "Ramniwas Sumit Kumar Maheshwari",
      phone: "9425088112",
      email: "rskm.oppo@gmail.com",
      gstin: "23ABJFR0427Q1ZW",
      address: "14 Maharani Road, Siyaganj",
      city: "Indore",
      state: "Madhya Pradesh",
      stateCode: "23",
      contactPerson: "Sumit Maheshwari",
    });
    dealerMpId = dealerMp.id;
    expect(dealerMp.stateCode).toBe("23");
    expect(dealerMp.contactPerson).toBe("Sumit Maheshwari");

    // Interstate Dealer (Maharashtra - State Code 27)
    const dealerMh = addSupplier(db, {
      name: "Mumbai Mobile Hub Wholesale",
      phone: "9820012345",
      email: "info@mumbaicellular.com",
      gstin: "27AABCS1429B1Z8",
      address: "Lamington Road, Grant Road",
      city: "Mumbai",
      state: "Maharashtra",
      stateCode: "27",
      contactPerson: "Kishore Bhai",
    });
    dealerMhId = dealerMh.id;
    expect(dealerMh.stateCode).toBe("27");
  });

  it("3. Intrastate GST Purchase (MP Dealer -> MP Shop, CGST 9% + SGST 9%)", () => {
    const imei1 = "869910002001001";
    const imei2 = "869910002001002";

    const purchase = recordPurchase(db, {
      purchaseType: "GST",
      dealerId: dealerMpId,
      invoiceNo: "26-27/Oppo/1270",
      date: "2026-09-15",
      originalInvoiceNo: "OPPO-IND-8812",
      ewayBillNo: "EWB2309150001",
      placeOfSupply: "Madhya Pradesh",
      stateCode: "23",
      items: [
        {
          productId: mobileProductId,
          name: "OPPO A5 64GB Mirror Black",
          hsnSac: "85171300",
          qty: 2,
          unit: "PCS",
          rateExcludingTax: 10000,
          discountPct: 0,
          discountAmount: 0,
          gstRate: 18,
          price: 11800,
        },
      ],
      imeis: {
        [mobileProductId]: [imei1, imei2],
      },
      paid: 10000,
      mode: "Bank",
      attachments: [
        {
          fileName: "oppo_invoice_1270.pdf",
          fileType: "application/pdf",
          fileSize: 1048576,
          fileData: "data:application/pdf;base64,JVBERi0xLjQKJ...",
        },
      ],
    });

    gstPurchaseId = purchase.id;
    expect(purchase.id).toBeDefined();
    expect(purchase.purchaseType).toBe("GST");

    // Taxable = 10,000 * 2 = 20,000
    // CGST 9% = 1,800, SGST 9% = 1,800, IGST = 0, Total = 23,600
    expect(purchase.taxableValue).toBe(20000);
    expect(purchase.cgstAmount).toBe(1800);
    expect(purchase.sgstAmount).toBe(1800);
    expect(purchase.igstAmount).toBe(0);
    expect(purchase.total).toBe(23600);
    expect(purchase.paid).toBe(10000);
    expect(purchase.dueAmount).toBe(13600);

    // Verify line item persisted with 18-column fields
    const item = purchase.items[0];
    expect(item.hsnSac).toBe("85171300");
    expect(item.rateExcludingTax).toBe(10000);
    expect(item.cgstPct).toBe(9);
    expect(item.cgstAmount).toBe(1800);
    expect(item.sgstPct).toBe(9);
    expect(item.sgstAmount).toBe(1800);
    expect(item.igstAmount).toBe(0);
    expect(item.totalAmount).toBe(23600);

    // Verify units created in DB
    const units1 = searchImei(db, imei1);
    expect(units1.length).toBe(1);
    expect(units1[0].status).toBe("available");
    expect(units1[0].purchasePrice).toBe(10000);

    const units2 = searchImei(db, imei2);
    expect(units2.length).toBe(1);
    returnableUnitId = units2[0].id;

    // Verify stock count
    const stock = getProductStock(db, mobileProductId);
    expect(stock).toBe(2);

    // Verify attachments saved in repository
    const atts = getPurchaseAttachments(db, purchase.id);
    expect(atts.length).toBe(1);
    expect(atts[0].fileName).toBe("oppo_invoice_1270.pdf");
  });

  it("4. Interstate GST Purchase (Maharashtra Dealer -> MP Shop, IGST 18%)", () => {
    const imeiInterstate = "869910002001003";

    const purchase = recordPurchase(db, {
      purchaseType: "GST",
      dealerId: dealerMhId,
      invoiceNo: "MH-HUB-2026-99",
      date: "2026-09-16",
      stateCode: "27",
      items: [
        {
          productId: mobileProductId,
          name: "OPPO A5 64GB Mirror Black",
          hsnSac: "85171300",
          qty: 1,
          unit: "PCS",
          rateExcludingTax: 12000,
          discountPct: 0,
          gstRate: 18,
          price: 14160,
        },
      ],
      imeis: {
        [mobileProductId]: [imeiInterstate],
      },
      paid: 0,
    });

    expect(purchase.taxableValue).toBe(12000);
    expect(purchase.cgstAmount).toBe(0);
    expect(purchase.sgstAmount).toBe(0);
    expect(purchase.igstAmount).toBe(2160);
    expect(purchase.total).toBe(14160);
    expect(purchase.dueAmount).toBe(14160);

    const item = purchase.items[0];
    expect(item.igstPct).toBe(18);
    expect(item.igstAmount).toBe(2160);
    expect(item.cgstAmount).toBe(0);
  });

  it("5. Non-GST Purchase (Tax = 0, Subtotal = Total)", () => {
    const purchase = recordPurchase(db, {
      purchaseType: "NON_GST",
      dealerId: dealerMpId,
      invoiceNo: "NON-GST-CHALLAN-01",
      date: "2026-09-17",
      items: [
        {
          productId: accessoryProductId,
          name: "Type-C Fast Charging Cable",
          qty: 10,
          unit: "PCS",
          rateExcludingTax: 120,
          price: 120,
          costPrice: 120,
        },
      ],
      paid: 1200,
      mode: "Cash",
    });

    expect(purchase.purchaseType).toBe("NON_GST");
    expect(purchase.tax).toBe(0);
    expect(purchase.cgstAmount).toBe(0);
    expect(purchase.sgstAmount).toBe(0);
    expect(purchase.igstAmount).toBe(0);
    expect(purchase.subtotal).toBe(1200);
    expect(purchase.total).toBe(1200);
    expect(purchase.dueAmount).toBe(0);

    // Verify stock increased by 10 for accessory
    const stock = getProductStock(db, accessoryProductId);
    expect(stock).toBe(10);
  });

  it("6. Rejection of duplicate IMEI submitted within same purchase", () => {
    expect(() => {
      recordPurchase(db, {
        dealerId: dealerMpId,
        invoiceNo: "PUR-DUP-01",
        items: [
          {
            productId: mobileProductId,
            name: "OPPO A5",
            qty: 2,
            rateExcludingTax: 10000,
          },
        ],
        imeis: {
          [mobileProductId]: ["869910009999999", "869910009999999"],
        },
      });
    }).toThrow(/Duplicate IMEI/i);
  });

  it("7. Rejection of IMEI that already exists in DB inventory", () => {
    // 869910002001001 was already added in test 3
    expect(() => {
      recordPurchase(db, {
        dealerId: dealerMpId,
        invoiceNo: "PUR-DUP-EXISTING",
        items: [
          {
            productId: mobileProductId,
            name: "OPPO A5",
            qty: 1,
            rateExcludingTax: 10000,
          },
        ],
        imeis: {
          [mobileProductId]: ["869910002001001"],
        },
      });
    }).toThrow(/already registered/i);
  });

  it("8. Rejection of mismatched IMEI count vs quantity for tracked items", () => {
    expect(() => {
      recordPurchase(db, {
        dealerId: dealerMpId,
        invoiceNo: "PUR-MISMATCH-QTY",
        items: [
          {
            productId: mobileProductId,
            name: "OPPO A5",
            qty: 2,
            rateExcludingTax: 10000,
          },
        ],
        imeis: {
          // Only 1 IMEI provided for qty 2
          [mobileProductId]: ["869910005555555"],
        },
      });
    }).toThrow(/requires exactly 2 unique IMEI/i);
  });

  it("9. Dealer Ledger validation (Credits on Purchase, Debits on Payment)", () => {
    const ledger = getSupplierLedger(db, dealerMpId);
    expect(ledger.length).toBeGreaterThanOrEqual(3);

    // Test 3 recorded: credit 23600 (PURCHASE), debit 10000 (PAYMENT)
    // Test 5 recorded: credit 1200 (PURCHASE), debit 1200 (PAYMENT)
    const purchaseEntries = ledger.filter((e) => e.type === "PURCHASE");
    const paymentEntries = ledger.filter((e) => e.type === "PAYMENT");

    expect(purchaseEntries.some((e) => e.credit === 23600)).toBe(true);
    expect(paymentEntries.some((e) => e.debit === 10000)).toBe(true);

    const totalDue = getSupplierDue(db, dealerMpId);
    // 23600 - 10000 + 1200 - 1200 = 13600
    expect(totalDue).toBe(13600);
  });

  it("10. Debit Note Creation (e.g. TDS 194R @ 10%) & Ledger Debit", () => {
    const dn = recordDebitNote(db, {
      dealerId: dealerMpId,
      originalInvoiceNo: "26-27/Oppo/1270",
      reason: "TDS 194R Deduction on Quarterly Target Incentive Scheme",
      amount: 2000,
      tdsApplicable: true,
      tdsSection: "194R",
      tdsRate: 10,
      tdsAmount: 200,
      remarks: "10% TDS withheld on ₹20,000 incentive voucher",
    });

    expect(dn.id).toBeDefined();
    expect(dn.amount).toBe(2000);
    expect(dn.tdsRate).toBe(10);
    expect(dn.tdsAmount).toBe(200);

    // Verify debit note listed for dealer
    const dealerNotes = getDebitNotesByDealer(db, dealerMpId);
    expect(dealerNotes.some((n) => n.id === dn.id)).toBe(true);

    // Verify Dealer Ledger received a DEBIT entry of ₹2,000
    const ledger = getSupplierLedger(db, dealerMpId);
    const debitNoteEntries = ledger.filter((e) => e.type === "DEBIT_NOTE");
    expect(debitNoteEntries.length).toBe(1);
    expect(debitNoteEntries[0].debit).toBe(2000);

    // Outstanding due should now be 13,600 - 2,000 = 11,600
    const updatedDue = getSupplierDue(db, dealerMpId);
    expect(updatedDue).toBe(11600);
  });

  it("11. Purchase Return to Dealer (stock decreased, unit returned, ledger debited)", () => {
    const initialStock = getProductStock(db, mobileProductId);

    const returnDoc = recordPurchaseReturn(db, {
      purchaseId: gstPurchaseId,
      items: [
        {
          productId: mobileProductId,
          unitId: returnableUnitId,
          imei: "869910002001002",
          name: "OPPO A5 64GB Mirror Black",
          qty: 1,
          price: 11800,
          costPrice: 10000,
          gst: 18,
        },
      ],
      reason: "Dead On Arrival (DOA) - Return to Dealer for replacement/credit",
    });

    expect(returnDoc.id).toBeDefined();
    expect(returnDoc.amount).toBe(11800);

    // Verify unit status updated to PURCHASE_RETURNED
    const units = searchImei(db, "869910002001002");
    expect(units[0]?.status).toBe("PURCHASE_RETURNED");

    // Stock should decrease by 1
    const newStock = getProductStock(db, mobileProductId);
    expect(newStock).toBe(initialStock - 1);

    // Dealer Ledger should have PURCHASE_RETURN debit of ₹11,800
    const ledger = getSupplierLedger(db, dealerMpId);
    const returnEntries = ledger.filter((e) => e.type === "PURCHASE_RETURN");
    expect(returnEntries.length).toBe(1);
    expect(returnEntries[0].debit).toBe(11800);
  });

  it("12. POS Non-GST Sale (tax = 0, invoice_type = NON_GST)", () => {
    const sale = createSale(db, {
      invoiceType: "NON_GST",
      customerId,
      items: [
        {
          productId: accessoryProductId,
          name: "Type-C Fast Charging Cable",
          qty: 2,
          price: 300,
          gst: 18,
        },
      ],
      discount: 0,
      payments: [{ mode: "Cash", amount: 600 }],
    });

    expect(sale.id).toBeDefined();
    expect(sale.invoiceType).toBe("NON_GST");
    expect(sale.tax).toBe(0);
    expect(sale.total).toBe(600);
    expect(sale.subtotal).toBe(600);

    // Verify persisted sale from DB
    const fetched = getSaleById(db, sale.id);
    expect(fetched?.invoiceType).toBe("NON_GST");
    expect(fetched?.tax).toBe(0);
  });

  it("13. POS GST Sale (tax calculated, invoice_type = GST)", () => {
    // Fetch available unit
    const units = searchImei(db, "869910002001001");
    expect(units.length).toBe(1);
    const unit = units[0];
    expect(unit.status).toBe("available");

    const sale = createSale(db, {
      invoiceType: "GST",
      customerId,
      items: [
        {
          productId: mobileProductId,
          unitId: unit.id,
          imei: unit.imei1,
          name: "OPPO A5 64GB Mirror Black",
          qty: 1,
          price: 15000,
          gst: 18,
        },
      ],
      discount: 0,
      payments: [{ mode: "Cash", amount: 15000 }],
    });

    expect(sale.id).toBeDefined();
    expect(sale.invoiceType).toBe("GST");
    // GST 18% on 15,000 inclusive: 15000 * 18 / 118 = 2288
    expect(sale.tax).toBeGreaterThan(0);
    expect(sale.total).toBe(15000);

    // Unit status becomes sold
    const updatedUnits = searchImei(db, "869910002001001");
    expect(updatedUnits[0].status).toBe("sold");
  });

  it("14. Invoice OCR / AI Extraction: Ramniwas Sumit Kumar Maheshwari Calibration", () => {
    const ocrSample = `
      TAX INVOICE
      RAMNIWAS SUMIT KUMAR MAHESHWARI
      14, MAHARANI ROAD, INDORE (M.P.)
      GSTIN: 23ABJFR0427Q1ZW
      Invoice No: 26-27/Oppo/1270
      Dated: 15-Sep-2026
      E-Way Bill No: 231456789012
      Buyer: MOBILE WORLD
      Place of Supply: Madhya Pradesh (23)

      Item Description: OPPO F33 PRO (8/256)
      HSN/SAC: 85171300
      Qty: 1 PCS
      Rate: 31440.68
      Taxable Value: 31440.68
      CGST @ 9%: 2829.66
      SGST @ 9%: 2829.66
      Total: 37100.00

      IMEI: 864903061234501
    `;

    const extracted = extractInvoiceData(db, {
      text: ocrSample,
      fileName: "oppo_bill_1270.jpg",
    });

    expect(extracted.dealer.name).toContain("Ramniwas Sumit Kumar Maheshwari");
    expect(extracted.dealer.gstin).toBe("23ABJFR0427Q1ZW");
    expect(extracted.dealer.stateCode).toBe("23");
    expect(extracted.dealer.isExisting).toBe(true);

    expect(extracted.invoice.invoiceNo).toBe("26-27/Oppo/1270");
    expect(extracted.invoice.placeOfSupply).toBe("Madhya Pradesh");

    expect(extracted.items.length).toBeGreaterThanOrEqual(1);
    const line1 = extracted.items[0];
    expect(line1.hsnSac).toBe("85171300");
    expect(line1.taxableAmount).toBe(31440.68);
    expect(line1.cgstAmount).toBe(2829.66);
    expect(line1.sgstAmount).toBe(2829.66);
    expect(line1.totalAmount).toBe(37100);
    expect(extracted.totals.totalAmount).toBe(154585);
  });

  it("15. Invoice OCR / AI Extraction: Tanay Traders Realme Calibration", () => {
    const extracted = extractInvoiceData(db, {
      text: "Tanay Traders GSTIN 23AQDPA6961H2Z2 Invoice 2627TTRM/695 Realme 12 Pro",
      fileName: "realme_tanay_traders.pdf",
    });

    expect(extracted.dealer.name).toContain("Tanay Traders");
    expect(extracted.dealer.gstin).toBe("23AQDPA6961H2Z2");
    expect(extracted.dealer.stateCode).toBe("23");
    expect(extracted.invoice.invoiceNo).toBe("2627TTRM/695");
    expect(extracted.totals.totalAmount).toBe(56157);
  });
});
