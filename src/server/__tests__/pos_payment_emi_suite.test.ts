import { describe, expect, it, beforeAll } from "bun:test";
import { getDB } from "../db/client";
import { createSale } from "../services/salesService";
import { recordCustomerPayment, recordDealerPayment, getCustomerDue, getSupplierDue } from "../services/duesAndPaymentsService";
import { getPaymentAccounts, getPaymentAccountById } from "../services/paymentAccountService";
import { createFinanceCompany } from "../services/emiService";
import { saleToInvoiceProps } from "../../components/invoice/invoiceAdapters";
import { recordPurchase } from "../services/purchaseService";

describe("Commercial Mobile Shop ERP - POS EMI, Payment Accounts, GST/Non-GST & Ledger Suite", () => {
  let db: any;
  let cashAcc: any;
  let upiAcc: any;
  let bankAcc: any;
  let cardAcc: any;
  let financeCompany: any;
  let testCustomer: any;
  let testDealer: any;
  let testProductTracked: any;
  let testUnit: any;
  let testProductUntracked: any;

  beforeAll(() => {
    db = getDB();

    // 1. Setup Payment Accounts
    const accounts = getPaymentAccounts(db);
    cashAcc = accounts.find((a) => a.accountType === "CASH")!;
    upiAcc = accounts.find((a) => a.accountType === "UPI")!;
    bankAcc = accounts.find((a) => a.accountType === "BANK")!;
    cardAcc = accounts.find((a) => a.accountType === "CARD") || bankAcc;

    expect(cashAcc).toBeDefined();
    expect(upiAcc).toBeDefined();
    expect(bankAcc).toBeDefined();

    // 2. Setup Finance Company
    financeCompany = createFinanceCompany(db, {
      companyName: "Bajaj Finserv Consumer Finance",
      contactPerson: "Branch Manager",
      contactPhone: "9826012345",
      interestRateDefault: 12,
      interestTypeDefault: "ANNUAL_REDUCING",
    });

    // 3. Setup Customer
    const custId = "cust_pos_suite_" + Date.now();
    db.prepare(`
      INSERT INTO customers (id, business_id, name, mobile, phone, address, created_at)
      VALUES (?, 'biz_default', 'Arjun Verma', '9893012345', '9893012345', 'Harda MP', datetime('now'))
    `).run(custId);
    testCustomer = db.prepare("SELECT * FROM customers WHERE id = ?").get(custId);

    // 4. Setup Dealer
    const dealerId = "dealer_pos_suite_" + Date.now();
    db.prepare(`
      INSERT INTO suppliers (id, business_id, name, company, phone, mobile, gstin, address, city, state, state_code)
      VALUES (?, 'biz_default', 'Shree Balaji Distributors', 'Shree Balaji Distributors', '9425012345', '9425012345', '23AAACB1234D1Z5', 'Indore MP', 'Indore', 'Madhya Pradesh', '23')
    `).run(dealerId);
    testDealer = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(dealerId);

    // 5. Setup Tracked Product and available Unit
    const prodTrackedId = "prod_tracked_" + Date.now();
    db.prepare(`
      INSERT INTO products (id, name, category, brand, model, mrp, purchase_price, selling_price, qty, tracked, gst)
      VALUES (?, 'Vivo V30 Pro 5G', 'Mobiles', 'Vivo', 'V30 Pro', 17999, 12000, 15000, 1, 1, 18)
    `).run(prodTrackedId);
    testProductTracked = db.prepare("SELECT * FROM products WHERE id = ?").get(prodTrackedId);

    const unitId = "unit_tracked_" + Date.now();
    const testImei = "8601234567" + Math.floor(10000 + Math.random() * 90000);
    db.prepare(`
      INSERT INTO units (id, product_id, imei1, imei2, purchase_price, status)
      VALUES (?, ?, ?, '860123456799999', 12000, 'available')
    `).run(unitId, prodTrackedId, testImei);
    testUnit = db.prepare("SELECT * FROM units WHERE id = ?").get(unitId);

    // 6. Setup Untracked Product
    const prodUntrackedId = "prod_untracked_" + Date.now();
    db.prepare(`
      INSERT INTO products (id, name, category, brand, model, mrp, purchase_price, selling_price, qty, tracked, gst)
      VALUES (?, '67W Flash Charger', 'Accessories', 'Vivo', '67W', 1499, 800, 1200, 50, 0, 18)
    `).run(prodUntrackedId);
    testProductUntracked = db.prepare("SELECT * FROM products WHERE id = ?").get(prodUntrackedId);
  });

  // =========================================================================
  // TEST 1: Mixed Payment with strict sum-to-total validation & account credits
  // =========================================================================
  it("TEST 1: Mixed payment total ₹15,000 (Cash ₹2,000, UPI ₹3,000, Bank ₹5,000, EMI ₹5,000) updates balances and finance receivable", () => {
    // Initial balances
    const cashBefore = getPaymentAccountById(db, cashAcc.id)!.currentBalance;
    const upiBefore = getPaymentAccountById(db, upiAcc.id)!.currentBalance;
    const bankBefore = getPaymentAccountById(db, bankAcc.id)!.currentBalance;

    // 1. Validation failure test: sum mismatch
    expect(() => {
      createSale(db, {
        customerId: testCustomer.id,
        items: [
          {
            productId: testProductUntracked.id,
            name: testProductUntracked.name,
            qty: 1,
            price: 15000,
            gst: 18,
            costPrice: 800,
          },
        ],
        discount: 0,
        payments: [
          { mode: "Cash", amount: 2000, paymentAccountId: cashAcc.id },
          { mode: "UPI", amount: 3000, paymentAccountId: upiAcc.id },
          { mode: "Bank", amount: 5000, paymentAccountId: bankAcc.id },
          // Missing ₹5,000
        ],
      });
    }).toThrow(/must equal invoice total/i);

    // 2. Successful mixed payment execution
    const sale = createSale(db, {
      customerId: testCustomer.id,
      items: [
        {
          productId: testProductUntracked.id,
          name: testProductUntracked.name,
          qty: 1,
          price: 15000,
          gst: 18,
          costPrice: 800,
        },
      ],
      discount: 0,
      payments: [
        { mode: "Cash", amount: 2000, paymentAccountId: cashAcc.id, referenceNumber: "CASH-SPLIT" },
        { mode: "UPI", amount: 3000, paymentAccountId: upiAcc.id, referenceNumber: "UPI-SPLIT-987" },
        { mode: "Bank", amount: 5000, paymentAccountId: bankAcc.id, referenceNumber: "NEFT-SPLIT-555" },
        { mode: "EMI", amount: 5000, referenceNumber: "BAJ-MIXED-001" },
      ],
      isEmi: true,
      emiCompanyId: financeCompany.id,
      emiDownPayment: 10000, // Cash 2000 + UPI 3000 + Bank 5000
      emiFinancedAmount: 5000,
      financeReferenceNumber: "BAJ-MIXED-001",
    });

    expect(sale.total).toBe(15000);
    expect(sale.paid).toBe(10000); // Customer paid down payment
    expect(sale.payments.length).toBe(4);

    // Verify account credits
    const cashAfter = getPaymentAccountById(db, cashAcc.id)!.currentBalance;
    const upiAfter = getPaymentAccountById(db, upiAcc.id)!.currentBalance;
    const bankAfter = getPaymentAccountById(db, bankAcc.id)!.currentBalance;

    expect(cashAfter).toBe(cashBefore + 2000);
    expect(upiAfter).toBe(upiBefore + 3000);
    expect(bankAfter).toBe(bankBefore + 5000);

    // Verify finance receivable for ₹5,000
    const receivable = db.prepare("SELECT * FROM emi_receivables WHERE sale_id = ?").get(sale.id) as any;
    expect(receivable).toBeDefined();
    expect(receivable.emi_financed_amount).toBe(5000);
    expect(receivable.emi_company_id).toBe(financeCompany.id);
  });

  // =========================================================================
  // TEST 2: Customer Due Settlement
  // =========================================================================
  it("TEST 2: Customer due ₹10,000, receive ₹4,000 via Google Pay -> Due ₹6,000, Google Pay +₹4,000, ledger updated", () => {
    // 1. Create a credit sale of ₹10,000 for customer
    const creditSale = createSale(db, {
      customerId: testCustomer.id,
      items: [
        {
          productId: testProductUntracked.id,
          name: testProductUntracked.name,
          qty: 1,
          price: 10000,
          gst: 18,
          costPrice: 800,
        },
      ],
      discount: 0,
      payments: [{ mode: "Credit", amount: 10000 }],
    });

    const dueBefore = getCustomerDue(db, testCustomer.id);
    expect(dueBefore).toBeGreaterThanOrEqual(10000);

    const upiBefore = getPaymentAccountById(db, upiAcc.id)!.currentBalance;

    // 2. Receive ₹4,000 payment via UPI account
    const result = recordCustomerPayment(db, {
      customerId: testCustomer.id,
      amount: 4000,
      paymentMethod: "UPI",
      paymentAccountId: upiAcc.id,
      referenceNo: "GPAY-TEST-4000",
      notes: "Partial due clearance",
    });

    expect(result.newDue).toBe(dueBefore - 4000);

    // 3. Verify UPI account credited
    const upiAfter = getPaymentAccountById(db, upiAcc.id)!.currentBalance;
    expect(upiAfter).toBe(upiBefore + 4000);

    // 4. Verify Customer Ledger entry
    const ledger = db.prepare(`
      SELECT * FROM customer_ledger 
      WHERE customer_id = ? AND reference_no = 'GPAY-TEST-4000'
      ORDER BY id DESC LIMIT 1
    `).get(testCustomer.id) as any;

    expect(ledger).toBeDefined();
    expect(ledger.type).toBe("PAYMENT");
    expect(ledger.credit).toBe(4000);
    expect(ledger.debit).toBe(0);
    expect(ledger.payment_account_id).toBe(upiAcc.id);
    expect(ledger.balance).toBe(result.newDue);
  });

  // =========================================================================
  // TEST 3: Dealer Due Settlement
  // =========================================================================
  it("TEST 3: Dealer due ₹50,000, pay ₹20,000 via Bank (HDFC) -> Due ₹30,000, Bank -₹20,000, ledger updated", () => {
    // 1. Create a credit purchase of ₹50,000 from dealer
    const purchase = recordPurchase(db, {
      supplierId: testDealer.id,
      invoiceNo: "PUR-DEALER-50K-" + Date.now(),
      date: new Date().toISOString().slice(0, 10),
      items: [
        {
          productId: testProductUntracked.id,
          name: testProductUntracked.name,
          qty: 50,
          price: 1000,
          gst: 0,
          costPrice: 1000,
        },
      ],
      paid: 0,
      mode: "Credit",
    });

    const dueBefore = getSupplierDue(db, testDealer.id);
    expect(dueBefore).toBeGreaterThanOrEqual(50000);

    const bankBefore = getPaymentAccountById(db, bankAcc.id)!.currentBalance;

    // 2. Pay ₹20,000 via Bank account
    const result = recordDealerPayment(db, {
      dealerId: testDealer.id,
      amount: 20000,
      paymentMethod: "Bank",
      paymentAccountId: bankAcc.id,
      referenceNo: "HDFC-NEFT-20000",
      notes: "Part payment against purchase bill",
    });

    expect(result.newDue).toBe(dueBefore - 20000);

    // 3. Verify Bank account debited
    const bankAfter = getPaymentAccountById(db, bankAcc.id)!.currentBalance;
    expect(bankAfter).toBe(bankBefore - 20000);

    // 4. Verify Dealer Ledger entry
    const ledger = db.prepare(`
      SELECT * FROM supplier_ledger 
      WHERE supplier_id = ? AND reference_no = 'HDFC-NEFT-20000'
      ORDER BY id DESC LIMIT 1
    `).get(testDealer.id) as any;

    expect(ledger).toBeDefined();
    expect(ledger.type).toBe("PAYMENT");
    expect(ledger.debit).toBe(20000);
    expect(ledger.credit).toBe(0);
    expect(ledger.payment_account_id).toBe(bankAcc.id);
    expect(ledger.balance).toBe(result.newDue);
  });

  // =========================================================================
  // TEST 4: GST Sale Verification
  // =========================================================================
  it("TEST 4: GST Sale has CGST, SGST, taxable value and GSTIN", () => {
    const sale = createSale(db, {
      customerId: testCustomer.id,
      invoiceType: "GST",
      selectedTemplateId: "template_modern",
      items: [
        {
          productId: testProductUntracked.id,
          name: testProductUntracked.name,
          qty: 1,
          price: 1180, // 1000 taxable + 180 GST (18%)
          gst: 18,
          costPrice: 800,
        },
      ],
      discount: 0,
      payments: [{ mode: "Cash", amount: 1180, paymentAccountId: cashAcc.id }],
    });

    expect(sale.invoiceType).toBe("GST");
    expect(sale.tax).toBe(180);
    expect(sale.subtotal).toBe(1000);
    expect(sale.total).toBe(1180);

    // Test invoice props adapter
    const fullDb = {
      customers: [testCustomer],
      sales: [sale],
      settings: db.prepare("SELECT * FROM settings WHERE id = 'shop'").get() as any,
    } as any;

    const props = saleToInvoiceProps(sale, fullDb);
    expect(props.type).toBe("GST_SALE");
    expect(props.totals.taxableValue).toBe(1000);
    expect(props.totals.cgstAmount).toBe(90);
    expect(props.totals.sgstAmount).toBe(90);
    expect(props.totals.grandTotal).toBe(1180);
    expect(props.items[0].gstRate).toBe(18);
  });

  // =========================================================================
  // TEST 5: Non-GST Sale with Template (No fake tax, same professional layout)
  // =========================================================================
  it("TEST 5: Non-GST sale hides tax fields, displays NON-GST title, uses selected template", () => {
    const sale = createSale(db, {
      customerId: testCustomer.id,
      invoiceType: "NON_GST",
      selectedTemplateId: "template_classic",
      items: [
        {
          productId: testProductUntracked.id,
          name: testProductUntracked.name,
          qty: 2,
          price: 500,
          gst: 18, // GST is on product master, but NON_GST invoice overrides tax to 0
          costPrice: 300,
        },
      ],
      discount: 0,
      payments: [{ mode: "Cash", amount: 1000, paymentAccountId: cashAcc.id }],
    });

    expect(sale.invoiceType).toBe("NON_GST");
    expect(sale.tax).toBe(0);
    expect(sale.subtotal).toBe(1000);
    expect(sale.total).toBe(1000);

    // Test invoice props adapter
    const fullDb = {
      customers: [testCustomer],
      sales: [sale],
      settings: db.prepare("SELECT * FROM settings WHERE id = 'shop'").get() as any,
    } as any;

    const props = saleToInvoiceProps(sale, fullDb);
    expect(props.type).toBe("NON_GST_SALE");
    expect(props.templateId).toBe("template_classic");
    expect(props.totals.taxableValue).toBe(1000);
    expect(props.totals.cgstAmount).toBe(0);
    expect(props.totals.sgstAmount).toBe(0);
    expect(props.totals.igstAmount).toBe(0);
    expect(props.totals.grandTotal).toBe(1000);
    expect(props.items[0].gstRate).toBe(0);
  });

  // =========================================================================
  // TEST 6: Complete POS EMI Sale Flow
  // =========================================================================
  it("TEST 6: Full EMI flow: Phone ₹15,000, Down ₹5,000 (Cash), Financed ₹10,000 (Bajaj) -> Customer paid ₹5,000, Cash drawer +₹5,000 only, IMEI SOLD, EMI account & schedule created", () => {
    // Check initial state of unit
    const unitBefore = db.prepare("SELECT * FROM units WHERE id = ?").get(testUnit.id) as any;
    expect(unitBefore.status).toBe("available");

    const cashBefore = getPaymentAccountById(db, cashAcc.id)!.currentBalance;

    // Create POS EMI Sale
    const emiSale = createSale(db, {
      customerId: testCustomer.id,
      invoiceType: "GST",
      selectedTemplateId: "template_modern",
      items: [
        {
          productId: testProductTracked.id,
          unitId: testUnit.id,
          imei: testUnit.imei1,
          name: testProductTracked.name,
          qty: 1,
          price: 15000,
          gst: 18,
          costPrice: 12000,
        },
      ],
      discount: 0,
      payments: [
        { mode: "Cash", amount: 5000, paymentAccountId: cashAcc.id, referenceNumber: "DOWNPAY-CASH-5000" },
        { mode: "EMI", amount: 10000, referenceNumber: "BAJ-LOAN-998877" },
      ],
      isEmi: true,
      emiCompanyId: financeCompany.id,
      emiDownPayment: 5000,
      emiFinancedAmount: 10000,
      financeReferenceNumber: "BAJ-LOAN-998877",
      expectedPaymentDate: "2026-10-15",
      interestRate: 12,
      interestType: "ANNUAL_REDUCING",
      tenureMonths: 12,
    });

    // 1. Sale amounts
    expect(emiSale.total).toBe(15000);
    expect(emiSale.paid).toBe(5000); // Customer paid down payment
    expect(emiSale.isEmi).toBe(true);
    expect(emiSale.emiDownPayment).toBe(5000);
    expect(emiSale.emiFinancedAmount).toBe(10000);

    // 2. Cash account credited ONLY ₹5,000 (NOT ₹15,000!)
    const cashAfter = getPaymentAccountById(db, cashAcc.id)!.currentBalance;
    expect(cashAfter).toBe(cashBefore + 5000);

    // 3. Unit IMEI status is SOLD
    const unitAfter = db.prepare("SELECT * FROM units WHERE id = ?").get(testUnit.id) as any;
    expect(unitAfter.status).toBe("sold");
    expect(unitAfter.sale_id).toBe(emiSale.id);
    expect(unitAfter.customer_id).toBe(testCustomer.id);

    // 4. Finance company receivable created for ₹10,000
    const receivable = db.prepare("SELECT * FROM emi_receivables WHERE sale_id = ?").get(emiSale.id) as any;
    expect(receivable).toBeDefined();
    expect(receivable.emi_financed_amount).toBe(10000);
    expect(receivable.emi_company_id).toBe(financeCompany.id);
    expect(receivable.status).toBe("EMI_PENDING");

    // 5. Customer EMI Account created
    const emiAccount = db.prepare("SELECT * FROM emi_accounts WHERE sale_id = ?").get(emiSale.id) as any;
    expect(emiAccount).toBeDefined();
    expect(emiAccount.customer_id).toBe(testCustomer.id);
    expect(emiAccount.finance_amount).toBe(10000);
    expect(emiAccount.tenure_months).toBe(12);

    // 6. Installment schedule generated
    const schedules = db.prepare("SELECT * FROM emi_schedules WHERE emi_account_id = ? ORDER BY installment_number ASC").all(emiAccount.id) as any[];
    expect(schedules.length).toBe(12);
    expect(schedules[0].installment_number).toBe(1);
    expect(schedules[0].status).toBe("PENDING");
    expect(schedules[0].emi_amount).toBeGreaterThan(800);
  });
});
