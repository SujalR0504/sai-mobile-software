import { describe, expect, it } from "bun:test";
import { DatabaseSync } from "node:sqlite";
import { initSchema, runMigrations, seedCategoriesAndHierarchy, seedIfEmpty } from "../db/schema";
import {
  createCategory,
  createSubcategory,
  createBrand,
  createModel,
} from "../services/categoryService";
import { addProduct, getProductStock, searchImei } from "../services/stockService";
import { addSupplier, getSupplierDue } from "../services/duesAndPaymentsService";
import { recordPurchase, getPurchaseById } from "../services/purchaseService";
import { getSupplierLedger, getPurchaseAttachments } from "../db/repository";
import {
  getPaymentAccounts,
  getAccountTransactions,
  createPaymentAccount,
} from "../services/paymentAccountService";

describe("Redesigned E-Purchase / Dealer Purchase Flow - Acceptance Tests Suite", () => {
  const db = new DatabaseSync(":memory:");
  initSchema(db);
  seedIfEmpty(db);
  runMigrations(db);
  seedCategoriesAndHierarchy(db);

  // Ensure payment_accounts and payment_account_transactions tables exist for testing
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_accounts (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      bank_name TEXT,
      upi_id TEXT,
      account_number TEXT,
      ifsc TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_account_transactions (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      account_id TEXT NOT NULL REFERENCES payment_accounts(id),
      transaction_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      amount REAL NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL,
      payment_method TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );
  `);

  // Seed default payment accounts
  createPaymentAccount(db, {
    accountName: "Shop Cash Drawer",
    accountType: "CASH",
    openingBalance: 50000,
    isDefault: true,
  });

  createPaymentAccount(db, {
    accountName: "Shop PhonePe UPI",
    accountType: "UPI",
    upiId: "shop@ybl",
    openingBalance: 100000,
    isDefault: true,
  });

  createPaymentAccount(db, {
    accountName: "SBI Current Account",
    accountType: "BANK",
    bankName: "State Bank of India",
    accountNumber: "30012345678",
    ifsc: "SBIN0000382",
    openingBalance: 250000,
    isDefault: true,
  });

  let abcDealerId: string;
  let oppoProductId: string;
  let nonGstDealerId: string;
  let accessoryProductId: string;

  it("TEST 1: Create GST purchase (Dealer: ABC Mobile, Invoice: 12345, OPPO Mobile Qty 2, Rate 20k, 2 IMEIs, Paid 20k)", () => {
    // 1. Create Dealer ABC Mobile
    const dealer = addSupplier(db, {
      name: "ABC Mobile",
      company: "ABC Mobile Distribution",
      phone: "9876543210",
      mobile: "9876543210",
      gstin: "23AABCU9603R1ZM",
      address: "MG Road, Harda",
      city: "Harda",
      state: "Madhya Pradesh",
      stateCode: "23",
    });
    abcDealerId = dealer.id;
    expect(abcDealerId).toBeDefined();

    // 2. Create OPPO Product
    const prod = addProduct(db, {
      name: "OPPO Reno 11 5G 128GB",
      brand: "OPPO",
      model: "Reno 11 5G",
      category: "Mobile",
      hsn: "85171300",
      costPrice: 20000,
      price: 24999,
      mrp: 26999,
      gst: 18,
      tracked: true,
      warrantyMonths: 12,
    });
    oppoProductId = prod.id;
    expect(oppoProductId).toBeDefined();

    const imei1 = "865778085253610";
    const imei2 = "865778085253611";

    // 3. Record Purchase with explicit rateExcludingTax = 20,000
    const purchase = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "12345",
      date: "2026-09-27",
      purchaseType: "GST",
      purchaseMode: "Regular Purchase",
      mode: "Cash",
      paid: 20000,
      items: [
        {
          productId: oppoProductId,
          name: "OPPO Reno 11 5G 128GB",
          qty: 2,
          rateExcludingTax: 20000,
          costPrice: 20000,
          price: 24999,
          gst: 18,
          imeis: [imei1, imei2],
        },
      ],
    });

    expect(purchase).toBeDefined();
    expect(purchase.invoiceNo).toBe("12345");
    // Qty 2 * 20,000 = 40,000 base + 18% GST (7,200) = 47,200 total
    expect(purchase.subtotal).toBe(40000);
    expect(purchase.tax).toBe(7200);
    expect(purchase.total).toBe(47200);
    expect(purchase.paid).toBe(20000);
    expect(purchase.dueAmount).toBe(27200);

    // Verify Stock +2
    const currentStock = getProductStock(db, oppoProductId);
    expect(currentStock).toBe(2);

    // Verify Both IMEIs added to units table
    const units1 = searchImei(db, imei1);
    expect(units1.length).toBe(1);
    expect(units1[0].productId).toBe(oppoProductId);
    expect(units1[0].status).toBe("available");

    const units2 = searchImei(db, imei2);
    expect(units2.length).toBe(1);
    expect(units2[0].productId).toBe(oppoProductId);
    expect(units2[0].status).toBe("available");

    // Verify Dealer Ledger updated (Purchase debit 47,200, Payment credit 20,000 -> Net Due 27,200)
    const ledger = getSupplierLedger(db, abcDealerId);
    expect(ledger.length).toBeGreaterThanOrEqual(2);
    const due = getSupplierDue(db, abcDealerId);
    expect(due).toBe(27200);
  });

  it("TEST 2: Create Non-GST purchase (GST fields do not appear, GST is 0%)", () => {
    const dealer = addSupplier(db, {
      name: "Local Grey Wholesale",
      phone: "9123456780",
      address: "Station Road",
      city: "Harda",
      state: "Madhya Pradesh",
      stateCode: "23",
    });
    nonGstDealerId = dealer.id;

    const nonGstPurchase = recordPurchase(db, {
      supplierId: nonGstDealerId,
      invoiceNo: "NON-GST-001",
      date: "2026-09-27",
      purchaseType: "NON_GST",
      purchaseMode: "Regular Purchase",
      mode: "Cash",
      paid: 10000,
      items: [
        {
          productId: oppoProductId,
          name: "OPPO Reno 11 5G 128GB",
          qty: 1,
          costPrice: 19000,
          rateExcludingTax: 19000,
          price: 23000,
          gst: 0,
          imeis: ["865778085253699"],
        },
      ],
    });

    expect(nonGstPurchase).toBeDefined();
    expect(nonGstPurchase.purchaseType).toBe("NON_GST");
    expect(nonGstPurchase.tax).toBe(0);
    expect(nonGstPurchase.subtotal).toBe(19000);
    expect(nonGstPurchase.total).toBe(19000);
    expect(nonGstPurchase.paid).toBe(10000);
    expect(nonGstPurchase.dueAmount).toBe(9000);
  });

  it("TEST 3: Upload PDF purchase bill (File attaches to purchase)", () => {
    const purchaseWithAttachment = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "INV-ATTACH-001",
      date: "2026-09-27",
      purchaseType: "GST",
      mode: "Cash",
      paid: 0,
      items: [
        {
          productId: oppoProductId,
          name: "OPPO Reno 11 5G 128GB",
          qty: 1,
          costPrice: 20000,
          price: 24999,
          gst: 18,
          imeis: ["865778085253777"],
        },
      ],
      attachments: [
        {
          fileName: "dealer_invoice_12345.pdf",
          fileType: "application/pdf",
          fileSize: 102400,
          fileData: "data:application/pdf;base64,JVBERi0xLjQKJ...",
        },
      ],
    });

    expect(purchaseWithAttachment).toBeDefined();
    const savedAttachments = getPurchaseAttachments(db, purchaseWithAttachment.id);
    expect(savedAttachments.length).toBe(1);
    expect(savedAttachments[0].fileName).toBe("dealer_invoice_12345.pdf");
    expect(savedAttachments[0].fileType).toBe("application/pdf");
  });

  it("TEST 4: Quick product creation directly from purchase (Category -> Subcategory -> Brand -> Model)", () => {
    const cat = createCategory(db, { name: "Earbuds", icon: "headphones" });
    expect(cat.id).toBeDefined();

    const sub = createSubcategory(db, { categoryId: cat.id, name: "Wireless TWS" });
    expect(sub.id).toBeDefined();

    const brand = createBrand(db, { name: "Realme", subcategoryId: sub.id });
    expect(brand.id).toBeDefined();

    const model = createModel(db, { brandId: brand.id, subcategoryId: sub.id, name: "Buds Air 5" });
    expect(model.id).toBeDefined();

    const newProd = addProduct(db, {
      categoryId: cat.id,
      subcategoryId: sub.id,
      brandId: brand.id,
      modelId: model.id,
      name: "Realme Buds Air 5 Deep Blue",
      brand: "Realme",
      model: "Buds Air 5",
      category: "Earbuds",
      hsn: "85183000",
      costPrice: 2200,
      price: 2999,
      gst: 18,
      tracked: false,
    });
    accessoryProductId = newProd.id;
    expect(accessoryProductId).toBeDefined();

    // Immediately record purchase with this new product
    const p = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "QUICK-PROD-001",
      date: "2026-09-27",
      purchaseType: "GST",
      mode: "Cash",
      paid: 10000,
      items: [
        {
          productId: accessoryProductId,
          name: "Realme Buds Air 5 Deep Blue",
          qty: 5,
          costPrice: 2000,
          rateExcludingTax: 2000,
          price: 2999,
          gst: 18,
        },
      ],
    });
    expect(p).toBeDefined();
    const stock = getProductStock(db, accessoryProductId);
    expect(stock).toBe(5);
  });

  it("TEST 5: IMEI duplicate validation across stock", () => {
    // Attempting to reuse already inwarded IMEI 865778085253610 must fail
    expect(() => {
      recordPurchase(db, {
        supplierId: abcDealerId,
        invoiceNo: "INV-DUP-IMEI",
        date: "2026-09-27",
        purchaseType: "GST",
        mode: "Cash",
        paid: 0,
        items: [
          {
            productId: oppoProductId,
            name: "OPPO Reno 11 5G 128GB",
            qty: 1,
            costPrice: 20000,
            price: 24999,
            gst: 18,
            imeis: ["865778085253610"], // Already in stock!
          },
        ],
      });
    }).toThrow(/Duplicate IMEI detected/i);
  });

  it("TEST 6: Partial payment (Purchase: ₹50,000, Paid: ₹10,000, Due: ₹40,000)", () => {
    // 50,000 non-gst total for clean whole number test
    const p = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "PARTIAL-50K",
      date: "2026-09-27",
      purchaseType: "NON_GST",
      mode: "Cash",
      paid: 10000,
      items: [
        {
          productId: accessoryProductId,
          name: "Realme Buds Air 5 Deep Blue",
          qty: 25,
          costPrice: 2000,
          rateExcludingTax: 2000,
          price: 2999,
          gst: 0,
        },
      ],
    });

    expect(p.total).toBe(50000);
    expect(p.paid).toBe(10000);
    expect(p.dueAmount).toBe(40000);
  });

  it("TEST 7: UPI payment with account selection creates payment account transaction", () => {
    const upiAccounts = getPaymentAccounts(db).filter((a) => a.accountType === "UPI" || a.type === "UPI");
    const testUpiAccount = upiAccounts[0];
    expect(testUpiAccount).toBeDefined();

    const initialBalance = testUpiAccount.currentBalance;

    const p = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "UPI-PURCHASE-001",
      date: "2026-09-27",
      purchaseType: "NON_GST",
      mode: "UPI",
      paymentAccountId: testUpiAccount.id,
      paid: 5000,
      items: [
        {
          productId: accessoryProductId,
          name: "Realme Buds Air 5 Deep Blue",
          qty: 2,
          costPrice: 2500,
          rateExcludingTax: 2500,
          price: 3200,
          gst: 0,
        },
      ],
    });

    expect(p.paid).toBe(5000);
    expect(p.paymentAccountId).toBe(testUpiAccount.id);

    // Verify account balance decreased by 5,000
    const updatedAccounts = getPaymentAccounts(db);
    const updatedUpi = updatedAccounts.find((a) => a.id === testUpiAccount.id);
    expect(updatedUpi?.currentBalance).toBe(initialBalance - 5000);

    // Verify transaction recorded
    const txs = getAccountTransactions(db, testUpiAccount.id);
    const purchaseTx = txs.find((t) => t.referenceId === p.id);
    expect(purchaseTx).toBeDefined();
    expect(purchaseTx?.transactionType).toBe("PURCHASE_PAYMENT");
    expect(purchaseTx?.amount).toBe(5000);
  });

  it("TEST 8: Bank payment with account selection updates bank balance", () => {
    const bankAccounts = getPaymentAccounts(db).filter((a) => a.accountType === "BANK" || a.type === "BANK");
    const testBankAccount = bankAccounts[0];
    expect(testBankAccount).toBeDefined();

    const initialBalance = testBankAccount.currentBalance;

    const p = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "BANK-PURCHASE-001",
      date: "2026-09-27",
      purchaseType: "NON_GST",
      mode: "Bank",
      paymentAccountId: testBankAccount.id,
      paid: 8000,
      items: [
        {
          productId: accessoryProductId,
          name: "Realme Buds Air 5 Deep Blue",
          qty: 4,
          costPrice: 2000,
          rateExcludingTax: 2000,
          price: 3000,
          gst: 0,
        },
      ],
    });

    expect(p.paid).toBe(8000);
    const updatedAccounts = getPaymentAccounts(db);
    const updatedBank = updatedAccounts.find((a) => a.id === testBankAccount.id);
    expect(updatedBank?.currentBalance).toBe(initialBalance - 8000);
  });

  it("TEST 9: Duplicate dealer invoice validation", () => {
    // Invoice 12345 for ABC Mobile was created in Test 1
    // Attempting to create duplicate invoice without allowDuplicate flag must throw error
    expect(() => {
      recordPurchase(db, {
        supplierId: abcDealerId,
        invoiceNo: "12345",
        date: "2026-09-27",
        purchaseType: "GST",
        mode: "Cash",
        paid: 0,
        items: [
          {
            productId: oppoProductId,
            name: "OPPO Reno 11 5G 128GB",
            qty: 1,
            costPrice: 20000,
            price: 24999,
            gst: 18,
            imeis: ["865778085253888"],
          },
        ],
      });
    }).toThrow(/Purchase invoice already exists for this dealer/i);
  });

  it("TEST 10: Complete purchase requires only minimal fields (Dealer, Invoice No, Invoice Date, Product, Qty, Rate, Payment)", () => {
    const minimalPurchase = recordPurchase(db, {
      supplierId: abcDealerId,
      invoiceNo: "FAST-ENTRY-001",
      date: "2026-09-27",
      mode: "Cash",
      paid: 0,
      items: [
        {
          productId: accessoryProductId,
          name: "Realme Buds Air 5 Deep Blue",
          qty: 2,
          costPrice: 2000,
          rateExcludingTax: 2000,
          price: 2500,
          gst: 18,
        },
      ],
    });

    expect(minimalPurchase).toBeDefined();
    expect(minimalPurchase.id).toBeDefined();
    expect(minimalPurchase.invoiceNo).toBe("FAST-ENTRY-001");
    expect(minimalPurchase.total).toBe(4720); // 4000 + 18% GST (720)
    expect(minimalPurchase.dueAmount).toBe(4720);
  });
});
