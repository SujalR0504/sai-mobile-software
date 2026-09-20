import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { CashbookEntry, CustomerLedgerEntry, SupplierLedgerEntry } from "../../../shared/types";

export function recordCustomerLedger(
  db: DatabaseSync,
  customerId: string,
  type: CustomerLedgerEntry["type"],
  referenceId: string | undefined,
  debit: number,
  credit: number,
  notes?: string,
  paymentAccountId?: string,
  paymentMethod?: string,
  referenceNo?: string
): CustomerLedgerEntry {
  const id = uid("cled");
  const date = todayISO();
  const now = new Date().toISOString();

  // Get latest balance
  const last = db.prepare(`
    SELECT balance FROM customer_ledger
    WHERE customer_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(customerId) as any;

  const prevBalance = last?.balance || 0;
  const newBalance = prevBalance + debit - credit;

  const stmt = db.prepare(`
    INSERT INTO customer_ledger (
      id, business_id, customer_id, date, type, reference_id, debit, credit, balance, notes,
      payment_account_id, payment_method, reference_no, created_at
    )
    VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    customerId,
    date,
    type,
    referenceId ?? null,
    debit,
    credit,
    newBalance,
    notes ?? null,
    paymentAccountId ?? null,
    paymentMethod ?? null,
    referenceNo ?? null,
    now
  );

  return {
    id,
    customerId,
    date,
    type,
    referenceId,
    debit,
    credit,
    balance: newBalance,
    notes,
    paymentAccountId,
    paymentMethod,
    referenceNo,
    createdAt: now,
  };
}

export function recordSupplierLedger(
  db: DatabaseSync,
  supplierId: string,
  type: SupplierLedgerEntry["type"],
  referenceId: string | undefined,
  debit: number,
  credit: number,
  notes?: string,
  paymentAccountId?: string,
  paymentMethod?: string,
  referenceNo?: string
): SupplierLedgerEntry {
  const id = uid("sled");
  const date = todayISO();
  const now = new Date().toISOString();

  const last = db.prepare(`
    SELECT balance FROM supplier_ledger
    WHERE supplier_id = ?
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get(supplierId) as any;

  const prevBalance = last?.balance || 0;
  const newBalance = prevBalance + credit - debit;

  const stmt = db.prepare(`
    INSERT INTO supplier_ledger (
      id, business_id, supplier_id, date, type, reference_id, debit, credit, balance, notes,
      payment_account_id, payment_method, reference_no, created_at
    )
    VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    supplierId,
    date,
    type,
    referenceId ?? null,
    debit,
    credit,
    newBalance,
    notes ?? null,
    paymentAccountId ?? null,
    paymentMethod ?? null,
    referenceNo ?? null,
    now
  );

  return {
    id,
    supplierId,
    date,
    type,
    referenceId,
    debit,
    credit,
    balance: newBalance,
    notes,
    paymentAccountId,
    paymentMethod,
    referenceNo,
    createdAt: now,
  };
}

export function recordCashbookEntry(
  db: DatabaseSync,
  type: string,
  referenceId: string | undefined,
  category: string,
  inflow: number,
  outflow: number,
  notes?: string
): CashbookEntry {
  const id = uid("cb");
  const date = todayISO();
  const now = new Date().toISOString();

  const last = db.prepare(`
    SELECT balance FROM cashbook
    ORDER BY created_at DESC, rowid DESC LIMIT 1
  `).get() as any;

  const prevBalance = last?.balance || 0;
  const newBalance = prevBalance + inflow - outflow;

  const stmt = db.prepare(`
    INSERT INTO cashbook (id, business_id, branch_id, date, type, reference_id, category, inflow, outflow, balance, notes, created_at)
    VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, date, type, referenceId ?? null, category, inflow, outflow, newBalance, notes ?? null, now);

  return {
    id,
    businessId: "biz_default",
    branchId: "branch_01",
    date,
    type,
    referenceId,
    category,
    inflow,
    outflow,
    balance: newBalance,
    notes,
    createdAt: now,
  };
}
