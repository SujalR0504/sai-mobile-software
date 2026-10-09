import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { Customer, Expense, ExpenseCategory, PaymentEntry, PaymentMode, Supplier } from "../../../shared/types";
import { logAudit } from "./auditService";
import { getDefaultCashAccount, getPaymentAccountById, recordAccountTransaction } from "./paymentAccountService";
import { recordCustomerLedger, recordSupplierLedger } from "./ledgerService";

export function addCustomer(db: DatabaseSync, c: Omit<Customer, "id" | "createdAt"> & { id?: string }): Customer {
  const id = c.id || uid("c");
  const createdAt = todayISO();
  const phone = c.phone || c.mobile || "9999999999";
  const mobile = c.mobile || c.phone || "9999999999";
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO customers (id, name, phone, mobile, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, c.name, phone, mobile, c.address ?? null, createdAt);
  return { ...c, id, phone, mobile, createdAt };
}

export function updateCustomer(db: DatabaseSync, id: string, patch: Partial<Customer>): Customer {
  const current = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Customer ${id} not found`);

  const updated: Customer = {
    id,
    name: patch.name ?? current.name,
    phone: patch.phone ?? current.phone,
    address: patch.address !== undefined ? patch.address : (current.address ?? undefined),
    createdAt: current.created_at,
  };

  const stmt = db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, address = ?
    WHERE id = ?
  `);
  stmt.run(updated.name, updated.phone, updated.address ?? null, id);
  return updated;
}

export function deleteCustomer(
  db: DatabaseSync,
  id: string,
  force = false,
  user = "Admin"
): { success: boolean; id: string; name: string } {
  const cust = db.prepare("SELECT * FROM customers WHERE id = ?").get(id) as any;
  if (!cust) {
    throw new Error(`Customer with ID '${id}' not found`);
  }

  // Check linked transactions
  const salesCount = (db.prepare("SELECT COUNT(*) as cnt FROM sales WHERE customer_id = ?").get(id) as any)?.cnt || 0;
  const ledgerCount = (db.prepare("SELECT COUNT(*) as cnt FROM customer_ledger WHERE customer_id = ?").get(id) as any)?.cnt || 0;
  const paymentsCount = (db.prepare("SELECT COUNT(*) as cnt FROM payments WHERE party = 'customer' AND party_id = ?").get(id) as any)?.cnt || 0;
  const creditNotesCount = (db.prepare("SELECT COUNT(*) as cnt FROM credit_notes WHERE customer_id = ?").get(id) as any)?.cnt || 0;
  const repairsCount = (db.prepare("SELECT COUNT(*) as cnt FROM repairs WHERE customer_id = ?").get(id) as any)?.cnt || 0;
  const emiAccountsCount = (db.prepare("SELECT COUNT(*) as cnt FROM emi_accounts WHERE customer_id = ?").get(id) as any)?.cnt || 0;
  const due = getCustomerDue(db, id);

  const totalBlockers = salesCount + ledgerCount + paymentsCount + creditNotesCount + repairsCount + emiAccountsCount;

  if ((totalBlockers > 0 || due > 0) && !force) {
    const reasons: string[] = [];
    if (salesCount > 0) reasons.push(`${salesCount} sales bill(s)`);
    if (due > 0) reasons.push(`outstanding balance of ₹${due}`);
    if (ledgerCount > 0) reasons.push(`${ledgerCount} ledger record(s)`);
    if (paymentsCount > 0) reasons.push(`${paymentsCount} payment transaction(s)`);
    if (creditNotesCount > 0) reasons.push(`${creditNotesCount} credit note(s)`);
    if (repairsCount > 0) reasons.push(`${repairsCount} repair job(s)`);
    if (emiAccountsCount > 0) reasons.push(`${emiAccountsCount} EMI account(s)`);

    throw new Error(
      `Cannot delete customer '${cust.name}' because they have active transaction history: ${reasons.join(", ")}. Please clear balance or confirm force delete.`
    );
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    if (force) {
      // 1. Delete payment records for this customer
      db.prepare("DELETE FROM payments WHERE (party = 'customer' AND party_id = ?) OR ref_id IN (SELECT id FROM sales WHERE customer_id = ?)").run(id, id);
      // 2. Delete credit notes
      db.prepare("DELETE FROM credit_notes WHERE customer_id = ?").run(id);
      // 3. Delete customer ledger
      db.prepare("DELETE FROM customer_ledger WHERE customer_id = ?").run(id);
      // 4. Delete repair jobs and parts
      const repairs = db.prepare("SELECT id FROM repairs WHERE customer_id = ?").all(id) as any[];
      for (const r of repairs) {
        db.prepare("DELETE FROM repair_parts WHERE repair_id = ?").run(r.id);
      }
      db.prepare("DELETE FROM repairs WHERE customer_id = ?").run(id);
      // 5. Delete EMI schedules, accounts and receivables
      const emiAccs = db.prepare("SELECT id FROM emi_accounts WHERE customer_id = ?").all(id) as any[];
      for (const ea of emiAccs) {
        db.prepare("DELETE FROM emi_schedules WHERE emi_account_id = ?").run(ea.id);
        db.prepare("DELETE FROM emi_payments WHERE emi_account_id = ?").run(ea.id);
      }
      db.prepare("DELETE FROM emi_accounts WHERE customer_id = ?").run(id);

      const emiRecs = db.prepare("SELECT id FROM emi_receivables WHERE customer_id = ?").all(id) as any[];
      for (const er of emiRecs) {
        db.prepare("DELETE FROM emi_receipts WHERE receivable_id = ?").run(er.id);
      }
      db.prepare("DELETE FROM emi_receivables WHERE customer_id = ?").run(id);

      // 6. Delete sales, sale_items, and sale_payments
      const sales = db.prepare("SELECT id FROM sales WHERE customer_id = ?").all(id) as any[];
      for (const s of sales) {
        db.prepare("DELETE FROM sale_items WHERE sale_id = ?").run(s.id);
        db.prepare("DELETE FROM sale_payments WHERE sale_id = ?").run(s.id);
      }
      db.prepare("DELETE FROM sales WHERE customer_id = ?").run(id);
      // 7. Unlink any sold units from this customer and restore stock status
      db.prepare("UPDATE units SET status = 'IN_STOCK', sale_id = NULL, customer_id = NULL WHERE customer_id = ?").run(id);
    }

    // 8. Delete customer
    db.prepare("DELETE FROM customers WHERE id = ?").run(id);

    // 9. Audit Log
    logAudit(db, {
      userId: user,
      userName: user,
      action: "CUSTOMER_DELETE",
      module: "Customers",
      recordId: id,
      oldValue: { name: cust.name, phone: cust.phone, address: cust.address },
      newValue: { deleted: true, force },
      reason: `Customer ${cust.name} deleted${force ? " (force delete)" : ""}`,
    });

    db.exec("COMMIT;");
    return { success: true, id, name: cust.name };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function addSupplier(db: DatabaseSync, s: Omit<Supplier, "id"> & { id?: string }): Supplier {
  const id = s.id || uid("sup");
  const stmt = db.prepare(`
    INSERT INTO suppliers (id, name, company, phone, mobile, email, gstin, address, city, state, state_code, contact_person)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    s.name,
    s.company ?? s.name,
    s.phone || s.mobile || "",
    s.mobile || s.phone || "",
    s.email ?? null,
    s.gstin ?? null,
    s.address ?? null,
    s.city ?? null,
    s.state ?? null,
    s.stateCode ?? null,
    s.contactPerson ?? null
  );
  return { ...s, id };
}

export function updateSupplier(db: DatabaseSync, id: string, patch: Partial<Supplier>): Supplier {
  const current = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Supplier/Dealer ${id} not found`);

  const updated: Supplier = {
    id,
    name: patch.name ?? current.name,
    company: patch.company !== undefined ? patch.company : current.company,
    phone: patch.phone ?? current.phone,
    mobile: patch.mobile ?? current.mobile,
    email: patch.email !== undefined ? patch.email : current.email,
    gstin: patch.gstin !== undefined ? patch.gstin : current.gstin,
    address: patch.address !== undefined ? patch.address : current.address,
    city: patch.city !== undefined ? patch.city : current.city,
    state: patch.state !== undefined ? patch.state : current.state,
    stateCode: patch.stateCode !== undefined ? patch.stateCode : current.state_code,
    contactPerson: patch.contactPerson !== undefined ? patch.contactPerson : current.contact_person,
  };

  const stmt = db.prepare(`
    UPDATE suppliers
    SET name = ?, company = ?, phone = ?, mobile = ?, email = ?, gstin = ?, address = ?, city = ?, state = ?, state_code = ?, contact_person = ?
    WHERE id = ?
  `);
  stmt.run(
    updated.name,
    updated.company ?? updated.name,
    updated.phone,
    updated.mobile ?? updated.phone,
    updated.email ?? null,
    updated.gstin ?? null,
    updated.address ?? null,
    updated.city ?? null,
    updated.state ?? null,
    updated.stateCode ?? null,
    updated.contactPerson ?? null,
    id
  );
  return updated;
}

export interface CustomerPaymentInput {
  customerId: string;
  amount: number;
  paymentMethod?: string;
  paymentAccountId?: string;
  date?: string;
  referenceNumber?: string;
  referenceNo?: string;
  remarks?: string;
  notes?: string;
  user?: string;
}

export interface DealerPaymentInput {
  dealerId: string;
  amount: number;
  paymentMethod?: string;
  paymentAccountId?: string;
  date?: string;
  referenceNumber?: string;
  referenceNo?: string;
  remarks?: string;
  notes?: string;
  user?: string;
}

export function recordCustomerPayment(db: DatabaseSync, input: CustomerPaymentInput) {
  if (!input.customerId) throw new Error("Customer ID is required");
  if (!input.amount || input.amount <= 0) throw new Error("Payment amount must be greater than zero");

  const customer = db.prepare("SELECT id, name, phone FROM customers WHERE id = ?").get(input.customerId) as any;
  if (!customer) throw new Error(`Customer '${input.customerId}' not found`);

  const method = input.paymentMethod || "UPI";
  let accountId = input.paymentAccountId;
  if (!accountId) {
    if (method.toUpperCase() === "CASH") {
      accountId = getDefaultCashAccount(db).id;
    } else {
      const activeAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' LIMIT 1").get(method.toUpperCase()) as any;
      if (activeAcct) {
        accountId = activeAcct.id;
      } else {
        throw new Error(`Please select a payment account for ${method}`);
      }
    }
  }

  const account = getPaymentAccountById(db, accountId);
  if (!account) throw new Error(`Payment Account '${accountId}' not found`);

  const id = uid("pay");
  const date = input.date || todayISO();
  const now = new Date().toISOString();
  const refNumber = input.referenceNumber ?? input.referenceNo ?? null;
  const note = input.remarks || input.notes || `Customer payment from ${customer.name}`;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert into payments
    db.prepare(`
      INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, payment_account_id, reference_number, note, created_by, created_at)
      VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, date, input.customerId, input.amount, method, accountId, refNumber, note, input.user ?? "Cashier", now);

    // 2. Customer Ledger (Credit reduces outstanding balance)
    recordCustomerLedger(
      db,
      input.customerId,
      "PAYMENT",
      id,
      0,
      input.amount,
      note,
      accountId,
      method,
      refNumber ?? undefined
    );

    // 3. Payment Account Transaction (Inflow to account)
    const tx = recordAccountTransaction(db, {
      accountId,
      transactionType: "CUSTOMER_PAYMENT",
      referenceType: "CUSTOMER",
      referenceId: input.customerId,
      amount: input.amount,
      isCredit: true,
      paymentMethod: method,
      date,
      description: note,
      createdBy: input.user || "Cashier",
    });

    // 4. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Cashier",
      action: "CUSTOMER_PAYMENT_RECEIVE",
      module: "PAYMENTS",
      recordId: id,
      newValue: { customerId: input.customerId, amount: input.amount, method, accountId, balance: tx.balance },
      reason: note,
    });

    db.exec("COMMIT;");

    const newDue = getCustomerDue(db, input.customerId);
    return {
      success: true,
      id,
      customerId: input.customerId,
      amount: input.amount,
      paymentMethod: method,
      paymentAccountId: accountId,
      accountBalance: tx.balance,
      newDue,
      date,
    };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function recordDealerPayment(db: DatabaseSync, input: DealerPaymentInput) {
  if (!input.dealerId) throw new Error("Dealer ID is required");
  if (!input.amount || input.amount <= 0) throw new Error("Payment amount must be greater than zero");

  const dealer = db.prepare("SELECT id, name, company FROM suppliers WHERE id = ?").get(input.dealerId) as any;
  if (!dealer) throw new Error(`Dealer '${input.dealerId}' not found`);

  const method = input.paymentMethod || "Bank Transfer";
  let accountId = input.paymentAccountId;
  if (!accountId) {
    if (method.toUpperCase() === "CASH") {
      accountId = getDefaultCashAccount(db).id;
    } else {
      const activeAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = 'BANK' AND status = 'ACTIVE' LIMIT 1").get() as any;
      if (activeAcct) {
        accountId = activeAcct.id;
      } else {
        throw new Error(`Please select a payment account for ${method}`);
      }
    }
  }

  const account = getPaymentAccountById(db, accountId);
  if (!account) throw new Error(`Payment Account '${accountId}' not found`);

  const id = uid("pay");
  const date = input.date || todayISO();
  const now = new Date().toISOString();
  const refNumber = input.referenceNumber ?? input.referenceNo ?? null;
  const note = input.remarks || input.notes || `Payment to dealer ${dealer.name}`;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert into payments
    db.prepare(`
      INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, payment_account_id, reference_number, note, created_by, created_at)
      VALUES (?, 'biz_default', 'branch_01', ?, 'supplier', ?, NULL, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, date, input.dealerId, input.amount, method, accountId, refNumber, note, input.user ?? "Cashier", now);

    // 2. Supplier Ledger (Debit reduces credit/payable balance)
    recordSupplierLedger(
      db,
      input.dealerId,
      "PAYMENT",
      id,
      input.amount,
      0,
      note,
      accountId,
      method,
      refNumber ?? undefined
    );

    // 3. Payment Account Transaction (Outflow from account)
    const tx = recordAccountTransaction(db, {
      accountId,
      transactionType: "DEALER_PAYMENT",
      referenceType: "SUPPLIER",
      referenceId: input.dealerId,
      amount: input.amount,
      isCredit: false,
      paymentMethod: method,
      date,
      description: note,
      createdBy: input.user || "Cashier",
    });

    // 4. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Cashier",
      action: "DEALER_PAYMENT_SEND",
      module: "PAYMENTS",
      recordId: id,
      newValue: { dealerId: input.dealerId, amount: input.amount, method, accountId, balance: tx.balance },
      reason: note,
    });

    db.exec("COMMIT;");

    const newDue = getSupplierDue(db, input.dealerId);
    return {
      success: true,
      id,
      dealerId: input.dealerId,
      amount: input.amount,
      paymentMethod: method,
      paymentAccountId: accountId,
      accountBalance: tx.balance,
      newDue,
      date,
    };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function addPayment(db: DatabaseSync, p: Omit<PaymentEntry, "id"> & { paymentAccountId?: string; referenceNumber?: string; user?: string }): PaymentEntry {
  const id = uid("pay");
  const date = p.date || todayISO();
  const now = new Date().toISOString();
  let accountId = p.paymentAccountId;
  if (!accountId && p.mode?.toUpperCase() === "CASH") {
    accountId = getDefaultCashAccount(db).id;
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(`
      INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, payment_account_id, reference_number, note, created_by, created_at)
      VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      id,
      date,
      p.party,
      p.partyId,
      p.refId ?? null,
      p.amount,
      p.mode,
      accountId ?? null,
      p.referenceNumber ?? null,
      p.note ?? null,
      p.user ?? "Cashier",
      now
    );

    // If party is customer and this is not already an invoice payment, record in ledger
    if (p.party === "customer" && !p.refId && p.amount > 0) {
      recordCustomerLedger(db, p.partyId, "PAYMENT", id, 0, p.amount, p.note || "Payment", accountId, p.mode, p.referenceNumber);
    } else if ((p.party === "supplier" || (p.party as any) === "dealer") && !p.refId && p.amount > 0) {
      recordSupplierLedger(db, p.partyId, "PAYMENT", id, p.amount, 0, p.note || "Payment to dealer", accountId, p.mode, p.referenceNumber);
    }

    if (accountId && p.amount > 0) {
      const isCredit = p.party === "customer";
      recordAccountTransaction(db, {
        accountId,
        transactionType: isCredit ? "CUSTOMER_PAYMENT" : "DEALER_PAYMENT",
        referenceType: isCredit ? "CUSTOMER" : "SUPPLIER",
        referenceId: p.partyId,
        amount: p.amount,
        isCredit,
        paymentMethod: p.mode,
        date,
        description: p.note || `Payment ${isCredit ? "from customer" : "to dealer"}`,
        createdBy: p.user || "Cashier",
      });
    }

    db.exec("COMMIT;");
    return { ...p, id };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function addExpense(db: DatabaseSync, e: Omit<Expense, "id"> & { paymentAccountId?: string; user?: string }): Expense {
  const id = uid("e");
  const date = e.date || todayISO();
  const method = e.paymentMethod || "Cash";
  let accountId = e.paymentAccountId;
  if (!accountId && method.toUpperCase() === "CASH") {
    accountId = getDefaultCashAccount(db).id;
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(`
      INSERT INTO expenses (id, date, category, amount, payment_method, payment_account_id, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(id, date, e.category, e.amount, method, accountId ?? null, e.note ?? null);

    if (accountId && e.amount > 0) {
      recordAccountTransaction(db, {
        accountId,
        transactionType: "EXPENSE_PAYMENT",
        referenceType: "EXPENSE",
        referenceId: id,
        amount: e.amount,
        isCredit: false,
        paymentMethod: method,
        date,
        description: `Expense: ${e.category}${e.note ? ` - ${e.note}` : ""}`,
        createdBy: e.user || "Cashier",
      });
    }

    db.exec("COMMIT;");
    return { ...e, id };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getCustomerDue(db: DatabaseSync, customerId: string): number {
  const ledgerLast = db.prepare(`
    SELECT balance FROM customer_ledger
    WHERE customer_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(customerId) as any;

  if (ledgerLast && typeof ledgerLast.balance === "number") {
    return Math.max(0, ledgerLast.balance);
  }

  return getCustomerOutstandingBreakdown(db, customerId).totalDue;
}

export function getCustomerOutstandingBreakdown(db: DatabaseSync, customerId: string) {
  const sales = db.prepare(`
    SELECT id, invoice_no, date, total, paid, is_emi, emi_financed_amount FROM sales
    WHERE customer_id = ? AND quotation = 0
    ORDER BY date DESC
  `).all(customerId) as Array<{
    id: string;
    invoice_no: string;
    date: string;
    total: number;
    paid: number;
    is_emi?: number;
    emi_financed_amount?: number;
  }>;

  const payments = db.prepare(`
    SELECT id, ref_id, amount FROM payments
    WHERE party = 'customer' AND party_id = ?
  `).all(customerId) as Array<{ id: string; ref_id: string | null; amount: number }>;

  let totalSales = 0;
  const invoiceWiseDue: Array<{
    saleId: string;
    invoiceNo: string;
    date: string;
    total: number;
    paid: number;
    due: number;
  }> = [];

  for (const s of sales) {
    const customerBillAmount = s.is_emi ? Math.max(0, s.total - (s.emi_financed_amount || 0)) : s.total;
    totalSales += customerBillAmount;

    const extra = payments
      .filter((p) => p.ref_id === s.id)
      .reduce((a, p) => a + p.amount, 0);
    const paid = Math.max(s.paid, extra);

    const due = Math.max(0, customerBillAmount - paid);

    if (due > 0) {
      invoiceWiseDue.push({
        saleId: s.id,
        invoiceNo: s.invoice_no,
        date: s.date,
        total: customerBillAmount,
        paid,
        due,
      });
    }
  }

  // Total customer payments (both invoice-linked and direct customer settlements)
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalDue = Math.max(0, totalSales - totalPaid);

  return {
    customerId,
    totalSales,
    totalPaid,
    totalDue,
    invoiceWiseDue,
  };
}

export function getSupplierDue(db: DatabaseSync, supplierId: string): number {
  const ledgerLast = db.prepare(`
    SELECT balance FROM supplier_ledger
    WHERE supplier_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(supplierId) as any;

  if (ledgerLast && typeof ledgerLast.balance === "number") {
    return Math.max(0, ledgerLast.balance);
  }

  const purchases = db.prepare(`
    SELECT id, total, paid FROM purchases
    WHERE supplier_id = ?
  `).all(supplierId) as Array<{ id: string; total: number; paid: number }>;

  const payments = db.prepare(`
    SELECT ref_id, amount FROM payments
    WHERE (party = 'supplier' OR party = 'dealer') AND party_id = ?
  `).all(supplierId) as Array<{ ref_id: string | null; amount: number }>;

  const totalPurchases = purchases.reduce((sum, p) => sum + p.total, 0);
  const totalPayments = payments.reduce((sum, p) => sum + p.amount, 0);

  return Math.max(0, totalPurchases - totalPayments);
}
