import { describe, expect, it, beforeAll } from "bun:test";
import { getDB } from "../db/client";
import {
  createCreditNote,
  applyCreditNote,
  refundCreditNote,
  cancelCreditNote,
} from "../services/creditNoteService";
import {
  createDebitNote,
  applyDebitNote,
  refundDebitNote,
  cancelDebitNote,
} from "../services/debitNoteService";
import { handleApiRequest } from "../api/router";
import { checkEmployeePermission } from "../services/permissionService";

describe("COMPLETE CREDIT NOTE + DEBIT NOTE MODULE ACCEPTANCE TESTS", () => {
  let db: any;
  let testProductId: string;
  let testCashAccountId: string;

  beforeAll(() => {
    db = getDB();

    // 1. Ensure test product exists
    const prod = db.prepare("SELECT id FROM products WHERE id = 'prod_acceptance_test'").get() as any;
    if (!prod) {
      testProductId = "prod_acceptance_test";
      db.prepare(`
        INSERT INTO products (
          id, name, brand, model, category, tracked, mrp, purchase_price, selling_price, gst, qty, reorder_level
        ) VALUES (?, 'Acceptance Phone Pro', 'TestBrand', 'T-Pro', 'Mobiles', 1, 25000, 15000, 20000, 18, 10, 2)
      `).run(testProductId);
    } else {
      testProductId = prod.id;
    }

    // 2. Ensure test cash payment account exists
    const acc = db.prepare("SELECT id FROM payment_accounts WHERE id = 'acc_cash_test'").get() as any;
    if (!acc) {
      testCashAccountId = "acc_cash_test";
      db.prepare(`
        INSERT INTO payment_accounts (
          id, account_name, account_type, current_balance, status, created_at, updated_at
        ) VALUES (?, 'Test Store Main Cash', 'CASH', 50000, 'ACTIVE', datetime('now'), datetime('now'))
      `).run(testCashAccountId);
    } else {
      testCashAccountId = acc.id;
      db.prepare("UPDATE payment_accounts SET current_balance = 50000 WHERE id = ?").run(testCashAccountId);
    }
  });

  // =========================================================================
  // TEST 1: Customer buys ₹20,000 phone on credit, Credit Note ₹2,000 issued (price adjustment)
  // =========================================================================
  it("TEST 1: Customer due reduces from ₹20,000 to ₹18,000, stock unaffected (physicalReturn: false)", async () => {
    const custId = `cust_test_1_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Test Customer 1', '9810011111', datetime('now'))
    `).run(custId);

    const saleId = `sale_test_1_${Date.now()}`;
    const invoiceNo = `INV-TEST-1-${Date.now()}`;
    db.prepare(`
      INSERT INTO sales (
        id, invoice_no, date, customer_id, invoice_type, subtotal, tax, total, paid, status
      ) VALUES (?, ?, '2026-09-22', ?, 'GST', 16949.15, 3050.85, 20000, 0, 'COMPLETED')
    `).run(saleId, invoiceNo, custId);

    // Initial customer ledger entry for sale
    db.prepare(`
      INSERT INTO customer_ledger (
        id, customer_id, date, type, reference_id, debit, credit, balance, notes, created_at
      ) VALUES (?, ?, '2026-09-22', 'SALE', ?, 20000, 0, 20000, 'Sale invoice', datetime('now'))
    `).run(`cl_init_1_${Date.now()}`, custId, saleId);

    // Initial stock
    const initialProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    const initialQty = initialProduct.qty;

    // Issue Credit Note of ₹2,000 for price correction (no physical return)
    const cn = createCreditNote(db, {
      customerId: custId,
      originalInvoiceNo: invoiceNo,
      originalInvoiceDate: "2026-09-22",
      reason: "PRICE_CORRECTION",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          qty: 1,
          rate: 2000,
          gstRate: 0,
          taxableAmount: 2000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 2000,
        },
      ],
    });

    expect(cn).toBeDefined();
    expect(cn.total).toBe(2000);
    expect(cn.remainingAmount).toBe(2000);
    expect(cn.status).toBe("ISSUED");

    // Verify Customer Ledger has credit entry of ₹2,000 and new balance is ₹18,000
    const latestLedger = db
      .prepare("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(custId) as any;
    expect(latestLedger).toBeDefined();
    expect(latestLedger.type).toBe("CREDIT_NOTE");
    expect(latestLedger.credit).toBe(2000);
    expect(latestLedger.balance).toBe(18000);

    // Verify stock is unchanged
    const afterProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    expect(afterProduct.qty).toBe(initialQty);
  });

  // =========================================================================
  // TEST 2: Customer returns ₹20,000 phone with physical return YES
  // =========================================================================
  it("TEST 2: Customer returns phone with physical return YES (IMEI marked RETURNED, stock +1)", async () => {
    const custId = `cust_test_2_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Test Customer 2', '9810022222', datetime('now'))
    `).run(custId);

    const testImei = `IMEI2_${Date.now()}`;
    const unitId = `unit_test_2_${Date.now()}`;
    // Unit initially sold
    db.prepare(`
      INSERT INTO units (
        id, product_id, imei1, purchase_price, selling_price, status
      ) VALUES (?, ?, ?, 15000, 20000, 'sold')
    `).run(unitId, testProductId, testImei);

    const saleId = `sale_test_2_${Date.now()}`;
    const invoiceNo = `INV-TEST-2-${Date.now()}`;
    db.prepare(`
      INSERT INTO sales (
        id, invoice_no, date, customer_id, invoice_type, subtotal, tax, total, paid, status
      ) VALUES (?, ?, '2026-09-22', ?, 'GST', 16949.15, 3050.85, 20000, 20000, 'COMPLETED')
    `).run(saleId, invoiceNo, custId);

    const initialProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    const initialStock = initialProduct.qty;

    // Issue Credit Note with physical return YES
    const cn = createCreditNote(db, {
      customerId: custId,
      originalInvoiceNo: invoiceNo,
      originalInvoiceDate: "2026-09-22",
      reason: "CUSTOMER_RETURN",
      physicalReturn: true,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          unitId: unitId,
          imei: testImei,
          qty: 1,
          rate: 20000,
          gstRate: 0,
          taxableAmount: 20000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 20000,
        },
      ],
    });

    expect(cn).toBeDefined();
    expect(cn.total).toBe(20000);

    // Verify IMEI status updated to RETURNED
    const unit = db.prepare("SELECT status FROM units WHERE id = ?").get(unitId) as any;
    expect(unit.status).toBe("RETURNED");

    // Verify stock incremented by 1
    const updatedProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    expect(updatedProduct.qty).toBe(initialStock + 1);

    // Verify stock movement logged
    const movement = db
      .prepare("SELECT * FROM stock_movements WHERE unit_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(unitId) as any;
    expect(movement).toBeDefined();
    expect(movement.movement_type).toBe("RETURN");
    expect(movement.qty ?? movement.quantity).toBe(1);

    // Verify customer ledger credited by ₹20,000
    const latestLedger = db
      .prepare("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(custId) as any;
    expect(latestLedger.credit).toBe(20000);
  });

  // =========================================================================
  // TEST 3: Customer with ₹5,000 credit note applies ₹3,000 to new invoice
  // =========================================================================
  it("TEST 3: Apply ₹3,000 from ₹5,000 credit note to new invoice (remaining = ₹2,000, status PARTIALLY_ADJUSTED)", async () => {
    const custId = `cust_test_3_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Test Customer 3', '9810033333', datetime('now'))
    `).run(custId);

    // Create Credit Note of ₹5,000
    const cn = createCreditNote(db, {
      customerId: custId,
      reason: "CUSTOMER_RETURN",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          qty: 1,
          rate: 5000,
          gstRate: 0,
          taxableAmount: 5000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 5000,
        },
      ],
    });

    expect(cn.total).toBe(5000);
    expect(cn.remainingAmount).toBe(5000);

    // Create a new unpaid invoice for ₹10,000
    const newSaleId = `sale_new_3_${Date.now()}`;
    const newInvoiceNo = `INV-NEW-3-${Date.now()}`;
    db.prepare(`
      INSERT INTO sales (
        id, invoice_no, date, customer_id, invoice_type, subtotal, tax, total, paid, status
      ) VALUES (?, ?, '2026-09-22', ?, 'GST', 8474.58, 1525.42, 10000, 0, 'COMPLETED')
    `).run(newSaleId, newInvoiceNo, custId);

    // Apply ₹3,000 of the credit note to the new invoice
    const updatedCn = applyCreditNote(db, cn.id, {
      allocations: [{ saleId: newSaleId, amount: 3000 }],
    });

    expect(updatedCn.appliedAmount).toBe(3000);
    expect(updatedCn.remainingAmount).toBe(2000);
    expect(updatedCn.status).toBe("PARTIALLY_ADJUSTED");

    // Verify note_allocations record
    const allocation = db
      .prepare("SELECT * FROM note_allocations WHERE note_id = ? AND sale_id = ?")
      .get(cn.id, newSaleId) as any;
    expect(allocation).toBeDefined();
    expect(allocation.allocated_amount).toBe(3000);

    // Verify sale paid amount updated to ₹3,000
    const sale = db.prepare("SELECT paid FROM sales WHERE id = ?").get(newSaleId) as any;
    expect(sale.paid).toBe(3000);
  });

  // =========================================================================
  // TEST 4: Customer with ₹2,000 credit note requests cash refund
  // =========================================================================
  it("TEST 4: Refund remaining ₹2,000 from cash account (account balance decreases, status REFUNDED)", async () => {
    const custId = `cust_test_4_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Test Customer 4', '9810044444', datetime('now'))
    `).run(custId);

    const initialAccount = db.prepare("SELECT current_balance FROM payment_accounts WHERE id = ?").get(testCashAccountId) as any;
    const initialCash = initialAccount.current_balance;

    // Issue Credit Note of ₹2,000
    const cn = createCreditNote(db, {
      customerId: custId,
      reason: "ORDER_CANCELLATION",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          qty: 1,
          rate: 2000,
          gstRate: 0,
          taxableAmount: 2000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 2000,
        },
      ],
    });

    // Refund the ₹2,000 from cash account
    const refundedCn = refundCreditNote(db, cn.id, {
      amount: 2000,
      paymentMethod: "Cash",
      paymentAccountId: testCashAccountId,
      referenceNo: "REF-CASH-001",
      notes: "Cash refund over counter",
    });

    expect(refundedCn.remainingAmount).toBe(0);
    expect(refundedCn.refundedAmount).toBe(2000);
    expect(refundedCn.status).toBe("REFUNDED");

    // Cash account balance decreased by ₹2,000
    const updatedAccount = db.prepare("SELECT current_balance FROM payment_accounts WHERE id = ?").get(testCashAccountId) as any;
    expect(updatedAccount.current_balance).toBe(initialCash - 2000);

    // note_refunds table has entry
    const refundRecord = db.prepare("SELECT * FROM note_refunds WHERE note_id = ?").get(cn.id) as any;
    expect(refundRecord).toBeDefined();
    expect(refundRecord.amount).toBe(2000);
    expect(refundRecord.payment_account_id).toBe(testCashAccountId);

    // Customer ledger debited by ₹2,000 (reversing credit balance)
    const latestLedger = db
      .prepare("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(custId) as any;
    expect(latestLedger.debit).toBe(2000);
  });

  // =========================================================================
  // TEST 5: Shop buys ₹50,000 stock from dealer on credit, issues ₹3,000 debit note
  // =========================================================================
  it("TEST 5: Dealer payable reduces from ₹50,000 to ₹47,000 (physicalReturn: false)", async () => {
    const supId = `sup_test_5_${Date.now()}`;
    db.prepare(`
      INSERT INTO suppliers (id, name, phone, gstin, state, state_code)
      VALUES (?, 'Test Wholesale Agency', '9810055555', '23AAACT1234A1Z1', 'Madhya Pradesh', '23')
    `).run(supId);

    const purId = `pur_test_5_${Date.now()}`;
    const invoiceNo = `PUR-BILL-5-${Date.now()}`;
    db.prepare(`
      INSERT INTO purchases (
        id, invoice_no, date, supplier_id, purchase_type, subtotal, tax, total, paid, mode, status
      ) VALUES (?, ?, '2026-09-22', ?, 'GST', 42372.88, 7627.12, 50000, 0, 'Cash', 'RECEIVED')
    `).run(purId, invoiceNo, supId);

    // Supplier ledger starts with ₹50,000 credit (payable balance = 50,000)
    db.prepare(`
      INSERT INTO supplier_ledger (
        id, supplier_id, date, type, reference_id, debit, credit, balance, notes, created_at
      ) VALUES (?, ?, '2026-09-22', 'PURCHASE', ?, 0, 50000, 50000, 'Purchase bill', datetime('now'))
    `).run(`sl_init_5_${Date.now()}`, supId, purId);

    // Initial stock
    const initialProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    const initialStock = initialProduct.qty;

    // Issue Debit Note of ₹3,000 for price difference
    const dn = createDebitNote(db, {
      dealerId: supId,
      purchaseId: purId,
      originalInvoiceNo: invoiceNo,
      originalInvoiceDate: "2026-09-22",
      reason: "PRICE_DIFFERENCE",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          qty: 1,
          rate: 3000,
          gstRate: 0,
          taxableAmount: 3000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 3000,
        },
      ],
    });

    expect(dn).toBeDefined();
    expect(dn.total).toBe(3000);
    expect(dn.remainingAmount).toBe(3000);

    // Verify supplier ledger has debit of ₹3,000 and new balance is ₹47,000
    const latestLedger = db
      .prepare("SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(supId) as any;
    expect(latestLedger).toBeDefined();
    expect(latestLedger.type).toBe("DEBIT_NOTE");
    expect(latestLedger.debit).toBe(3000);
    expect(latestLedger.balance).toBe(47000);

    // Verify stock is unchanged
    const afterProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    expect(afterProduct.qty).toBe(initialStock);
  });

  // =========================================================================
  // TEST 6: Shop returns defective ₹15,000 phone to dealer with physical return YES
  // =========================================================================
  it("TEST 6: Shop returns defective phone with physical return YES (IMEI marked RETURNED_TO_DEALER, stock -1)", async () => {
    const supId = `sup_test_6_${Date.now()}`;
    db.prepare(`
      INSERT INTO suppliers (id, name, phone, gstin)
      VALUES (?, 'Dealer Return Hub', '9810066666', '23AAACT5678B1Z2')
    `).run(supId);

    const testImei = `IMEI6_${Date.now()}`;
    const unitId = `unit_test_6_${Date.now()}`;
    // Unit initially in stock (available)
    db.prepare(`
      INSERT INTO units (
        id, product_id, imei1, purchase_price, selling_price, status
      ) VALUES (?, ?, ?, 15000, 20000, 'available')
    `).run(unitId, testProductId, testImei);

    const initialProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    const initialStock = initialProduct.qty;

    // Issue Debit Note with physical return YES
    const dn = createDebitNote(db, {
      dealerId: supId,
      reason: "DEFECTIVE_GOODS",
      physicalReturn: true,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Acceptance Phone Pro",
          unitId: unitId,
          imei: testImei,
          qty: 1,
          rate: 15000,
          gstRate: 0,
          taxableAmount: 15000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 15000,
        },
      ],
    });

    expect(dn).toBeDefined();
    expect(dn.total).toBe(15000);

    // Verify IMEI status updated to RETURNED_TO_DEALER
    const unit = db.prepare("SELECT status FROM units WHERE id = ?").get(unitId) as any;
    expect(unit.status).toBe("RETURNED_TO_DEALER");

    // Verify product stock decremented by 1
    const updatedProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    expect(updatedProduct.qty).toBe(initialStock - 1);

    // Verify stock movement logged
    const movement = db
      .prepare("SELECT * FROM stock_movements WHERE unit_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(unitId) as any;
    expect(movement).toBeDefined();
    expect(movement.movement_type).toBe("PURCHASE_RETURN");
    expect(movement.qty ?? movement.quantity).toBe(1);

    // Verify supplier ledger debited by ₹15,000
    const latestLedger = db
      .prepare("SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(supId) as any;
    expect(latestLedger.debit).toBe(15000);
  });

  // =========================================================================
  // TEST 7: Non-GST credit note must have ₹0 CGST, ₹0 SGST, ₹0 IGST
  // =========================================================================
  it("TEST 7: Non-GST Credit Note strictly has ₹0 taxes", async () => {
    const custId = `cust_test_7_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Non-GST Customer', '9810077777', datetime('now'))
    `).run(custId);

    const invoiceNo = `NG-TEST-7-${Date.now()}`;
    db.prepare(`
      INSERT INTO sales (
        id, invoice_no, date, customer_id, invoice_type, subtotal, tax, total, paid, status
      ) VALUES (?, ?, '2026-09-22', ?, 'NON_GST', 1000, 0, 1000, 1000, 'COMPLETED')
    `).run(`sale_test_7_${Date.now()}`, invoiceNo, custId);

    const cn = createCreditNote(db, {
      customerId: custId,
      originalInvoiceNo: invoiceNo,
      originalInvoiceDate: "2026-09-22",
      reason: "CUSTOMER_RETURN",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Non-GST Item",
          qty: 1,
          rate: 1000,
          gstRate: 0,
          taxableAmount: 1000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 1000,
        },
      ],
    });

    expect(cn.invoiceType).toBe("NON_GST");
    expect(cn.subtotal).toBe(1000);
    expect(cn.total).toBe(1000);
    expect(cn.cgst).toBe(0);
    expect(cn.sgst).toBe(0);
    expect(cn.igst).toBe(0);
  });

  // =========================================================================
  // TEST 8: GST credit note (18% tax)
  // =========================================================================
  it("TEST 8: GST Credit Note computes correct CGST and SGST at 18%", async () => {
    const custId = `cust_test_8_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'GST Customer', '9810088888', datetime('now'))
    `).run(custId);

    const invoiceNo = `GST-TEST-8-${Date.now()}`;
    db.prepare(`
      INSERT INTO sales (
        id, invoice_no, date, customer_id, invoice_type, subtotal, tax, total, paid, status
      ) VALUES (?, ?, '2026-09-22', ?, 'GST', 10000, 1800, 11800, 11800, 'COMPLETED')
    `).run(`sale_test_8_${Date.now()}`, invoiceNo, custId);

    const cn = createCreditNote(db, {
      customerId: custId,
      originalInvoiceNo: invoiceNo,
      originalInvoiceDate: "2026-09-22",
      reason: "CUSTOMER_RETURN",
      physicalReturn: false,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "GST Item 18%",
          qty: 1,
          rate: 11800,
          gstRate: 18,
          taxableAmount: 10000,
          cgstPct: 9,
          cgstAmount: 900,
          sgstPct: 9,
          sgstAmount: 900,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 11800,
        },
      ],
    });

    expect(cn.invoiceType).toBe("GST");
    expect(cn.subtotal).toBe(10000);
    expect(cn.cgst).toBe(900);
    expect(cn.sgst).toBe(900);
    expect(cn.igst).toBe(0);
    expect(cn.total).toBe(11800);
  });

  // =========================================================================
  // TEST 9: Cancelled Credit Note reverses ledger and stock effects
  // =========================================================================
  it("TEST 9: Cancelled Credit Note reverses customer ledger credit and physical stock", async () => {
    const custId = `cust_test_9_${Date.now()}`;
    db.prepare(`
      INSERT INTO customers (id, name, phone, created_at)
      VALUES (?, 'Cancel Test Customer', '9810099999', datetime('now'))
    `).run(custId);

    const testImei = `IMEI9_${Date.now()}`;
    const unitId = `unit_test_9_${Date.now()}`;
    db.prepare(`
      INSERT INTO units (
        id, product_id, imei1, purchase_price, selling_price, status
      ) VALUES (?, ?, ?, 4000, 5000, 'sold')
    `).run(unitId, testProductId, testImei);

    const initialProduct = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    const initialStock = initialProduct.qty;

    // Issue Credit Note with physical return YES
    const cn = createCreditNote(db, {
      customerId: custId,
      reason: "CUSTOMER_RETURN",
      physicalReturn: true,
      adjustmentType: "CREDIT_BALANCE",
      items: [
        {
          productId: testProductId,
          productName: "Cancelable Unit",
          unitId: unitId,
          imei: testImei,
          qty: 1,
          rate: 5000,
          gstRate: 0,
          taxableAmount: 5000,
          cgstPct: 0,
          cgstAmount: 0,
          sgstPct: 0,
          sgstAmount: 0,
          igstPct: 0,
          igstAmount: 0,
          totalAmount: 5000,
        },
      ],
    });

    // Device returned, stock +1
    expect(cn.status).toBe("ISSUED");
    let unitAfterReturn = db.prepare("SELECT status FROM units WHERE id = ?").get(unitId) as any;
    expect(unitAfterReturn.status).toBe("RETURNED");

    // Cancel the Credit Note
    const cancelledCn = cancelCreditNote(db, cn.id, "Customer retracted return");
    expect(cancelledCn.status).toBe("CANCELLED");

    // Stock reversed back
    const productAfterCancel = db.prepare("SELECT qty FROM products WHERE id = ?").get(testProductId) as any;
    expect(productAfterCancel.qty).toBe(initialStock);

    // Unit status restored to sold
    const unitAfterCancel = db.prepare("SELECT status FROM units WHERE id = ?").get(unitId) as any;
    expect(unitAfterCancel.status).toBe("sold");

    // Customer ledger debited by ₹5,000 (reversing credit)
    const latestLedger = db
      .prepare("SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY rowid DESC LIMIT 1")
      .get(custId) as any;
    expect(latestLedger.debit).toBe(5000);
    expect(latestLedger.notes).toContain("Cancellation");
  });

  // =========================================================================
  // TEST 10: Unauthorized employee cannot create credit note or refund
  // =========================================================================
  it("TEST 10: Unauthorized employee receives 403 Forbidden on create and refund", async () => {
    // Create an employee with role SALES and no CREDIT_NOTE permissions
    const empId = `emp_restricted_${Date.now()}`;
    db.prepare(`
      INSERT INTO employees (
        id, employee_id, full_name, mobile, joining_date, department, designation, salary_type, basic_salary, role, status, created_at
      ) VALUES (?, ?, 'Restricted Staff', '9810000000', '2026-01-01', 'Sales', 'Associate', 'FIXED', 15000, 'SALES', 'ACTIVE', datetime('now'))
    `).run(empId, `EMP-${Date.now()}`);

    // Explicitly check permissionService
    const canCreate = checkEmployeePermission(db, empId, "CREDIT_NOTE_CREATE");
    expect(canCreate).toBe(false);

    const canRefund = checkEmployeePermission(db, empId, "CREDIT_NOTE_REFUND");
    expect(canRefund).toBe(false);

    // Call HTTP API route with x-employee-id header
    const postReq = new Request("http://localhost:5173/api/credit-notes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-employee-id": empId,
      },
      body: JSON.stringify({
        customerId: "c1",
        reason: "HACK",
        items: [],
      }),
    });

    const postRes = await handleApiRequest(postReq);
    expect(postRes.status).toBe(403);
    const postData = await postRes.json();
    expect(postData.error).toContain("Permission denied");

    // Attempt refund with unauthorized employee
    const refundReq = new Request("http://localhost:5173/api/credit-notes/cn_any_id/refund", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-employee-id": empId,
      },
      body: JSON.stringify({
        amount: 500,
        paymentMethod: "Cash",
      }),
    });

    const refundRes = await handleApiRequest(refundReq);
    expect(refundRes.status).toBe(403);
  });
});
