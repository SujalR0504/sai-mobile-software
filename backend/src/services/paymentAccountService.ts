import type { DatabaseSync } from "node:sqlite";
import { todayISO, uid } from "../../../shared/utils/format";
import type { PaymentAccount, PaymentAccountTransaction } from "../../../shared/types";

export function getPaymentAccounts(db: DatabaseSync): PaymentAccount[] {
  const rows = db
    .prepare(
      `SELECT * FROM payment_accounts ORDER BY is_default DESC, account_name ASC`
    )
    .all() as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    accountName: r.account_name,
    accountType: r.account_type,
    bankName: r.bank_name ?? undefined,
    upiId: r.upi_id ?? undefined,
    accountNumber: r.account_number ?? undefined,
    ifsc: r.ifsc ?? undefined,
    openingBalance: r.opening_balance || 0,
    currentBalance: r.current_balance || 0,
    status: r.status || "ACTIVE",
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

export function getPaymentAccountById(db: DatabaseSync, id: string): PaymentAccount | null {
  const r = db.prepare(`SELECT * FROM payment_accounts WHERE id = ?`).get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    businessId: r.business_id,
    accountName: r.account_name,
    accountType: r.account_type,
    bankName: r.bank_name ?? undefined,
    upiId: r.upi_id ?? undefined,
    accountNumber: r.account_number ?? undefined,
    ifsc: r.ifsc ?? undefined,
    openingBalance: r.opening_balance || 0,
    currentBalance: r.current_balance || 0,
    status: r.status || "ACTIVE",
    isDefault: Boolean(r.is_default),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getDefaultCashAccount(db: DatabaseSync): PaymentAccount {
  const r = db
    .prepare(
      `SELECT * FROM payment_accounts WHERE account_type = 'CASH' AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1`
    )
    .get() as any;

  if (r) {
    return {
      id: r.id,
      businessId: r.business_id,
      accountName: r.account_name,
      accountType: r.account_type,
      bankName: r.bank_name ?? undefined,
      upiId: r.upi_id ?? undefined,
      accountNumber: r.account_number ?? undefined,
      ifsc: r.ifsc ?? undefined,
      openingBalance: r.opening_balance || 0,
      currentBalance: r.current_balance || 0,
      status: r.status || "ACTIVE",
      isDefault: Boolean(r.is_default),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  // Fallback create if missing
  const id = "acct_cash_default";
  const now = new Date().toISOString();
  db.prepare(`
    INSERT OR IGNORE INTO payment_accounts (
      id, business_id, account_name, account_type, opening_balance, current_balance, status, is_default, created_at, updated_at
    ) VALUES (?, 'biz_default', 'Store Cash Drawer', 'CASH', 0, 0, 'ACTIVE', 1, ?, ?)
  `).run(id, now, now);

  return getPaymentAccountById(db, id)!;
}

export function createPaymentAccount(
  db: DatabaseSync,
  input: {
    accountName: string;
    accountType: "CASH" | "UPI" | "BANK" | "CARD";
    bankName?: string;
    upiId?: string;
    accountNumber?: string;
    ifsc?: string;
    openingBalance?: number;
    isDefault?: boolean;
  }
): PaymentAccount {
  if (!input.accountName?.trim()) {
    throw new Error("Account Name is required");
  }
  if (!["CASH", "UPI", "BANK", "CARD"].includes(input.accountType)) {
    throw new Error("Invalid Account Type. Must be CASH, UPI, BANK, or CARD");
  }

  const id = uid("acct");
  const now = new Date().toISOString();
  const opening = Number(input.openingBalance) || 0;
  const isDef = input.isDefault ? 1 : 0;

  if (isDef) {
    db.prepare(`UPDATE payment_accounts SET is_default = 0 WHERE account_type = ?`).run(input.accountType);
  }

  db.prepare(`
    INSERT INTO payment_accounts (
      id, business_id, account_name, account_type, bank_name, upi_id, account_number, ifsc,
      opening_balance, current_balance, status, is_default, created_at, updated_at
    ) VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
  `).run(
    id,
    input.accountName.trim(),
    input.accountType,
    input.bankName?.trim() ?? null,
    input.upiId?.trim() ?? null,
    input.accountNumber?.trim() ?? null,
    input.ifsc?.trim() ?? null,
    opening,
    opening,
    isDef,
    now,
    now
  );

  return getPaymentAccountById(db, id)!;
}

export function updatePaymentAccount(
  db: DatabaseSync,
  id: string,
  patch: Partial<{
    accountName: string;
    accountType: "CASH" | "UPI" | "BANK" | "CARD";
    bankName?: string;
    upiId?: string;
    accountNumber?: string;
    ifsc?: string;
    status: "ACTIVE" | "INACTIVE";
    isDefault?: boolean;
  }>
): PaymentAccount {
  const existing = getPaymentAccountById(db, id);
  if (!existing) {
    throw new Error(`Payment Account '${id}' not found`);
  }

  const now = new Date().toISOString();
  const updates: string[] = ["updated_at = ?"];
  const params: any[] = [now];

  if (patch.accountName !== undefined) {
    updates.push("account_name = ?");
    params.push(patch.accountName.trim());
  }
  if (patch.accountType !== undefined) {
    updates.push("account_type = ?");
    params.push(patch.accountType);
  }
  if (patch.bankName !== undefined) {
    updates.push("bank_name = ?");
    params.push(patch.bankName ? patch.bankName.trim() : null);
  }
  if (patch.upiId !== undefined) {
    updates.push("upi_id = ?");
    params.push(patch.upiId ? patch.upiId.trim() : null);
  }
  if (patch.accountNumber !== undefined) {
    updates.push("account_number = ?");
    params.push(patch.accountNumber ? patch.accountNumber.trim() : null);
  }
  if (patch.ifsc !== undefined) {
    updates.push("ifsc = ?");
    params.push(patch.ifsc ? patch.ifsc.trim() : null);
  }
  if (patch.status !== undefined) {
    updates.push("status = ?");
    params.push(patch.status);
  }
  if (patch.isDefault !== undefined) {
    if (patch.isDefault) {
      db.prepare(`UPDATE payment_accounts SET is_default = 0 WHERE account_type = ?`).run(
        patch.accountType || existing.accountType
      );
    }
    updates.push("is_default = ?");
    params.push(patch.isDefault ? 1 : 0);
  }

  params.push(id);
  db.prepare(`UPDATE payment_accounts SET ${updates.join(", ")} WHERE id = ?`).run(...params);

  return getPaymentAccountById(db, id)!;
}

/**
 * Record an atomic financial transaction against a Payment Account.
 * Updates current_balance on the payment account immediately.
 * Backend single source of truth.
 */
export function recordAccountTransaction(
  db: DatabaseSync,
  params: {
    accountId: string;
    transactionType:
      | "SALE_PAYMENT"
      | "CUSTOMER_PAYMENT"
      | "DEALER_PAYMENT"
      | "PURCHASE_PAYMENT"
      | "EMI_DOWN_PAYMENT"
      | "EXPENSE_PAYMENT"
      | "ORDER_ADVANCE"
      | "ORDER_REFUND"
      | "REFUND"
      | "ADJUSTMENT";
    referenceType?: string;
    referenceId?: string;
    amount: number;
    isCredit: boolean; // true = inflow (received), false = outflow (paid)
    paymentMethod: string;
    date?: string;
    description?: string;
    createdBy?: string;
  }
): PaymentAccountTransaction {
  if (params.amount <= 0) {
    throw new Error("Transaction amount must be greater than zero");
  }

  const account = getPaymentAccountById(db, params.accountId);
  if (!account) {
    throw new Error(`Payment Account '${params.accountId}' not found`);
  }

  const txId = uid("tx");
  const now = new Date().toISOString();
  const date = params.date || todayISO();

  const debit = params.isCredit ? 0 : params.amount;
  const credit = params.isCredit ? params.amount : 0;
  const newBalance = account.currentBalance + credit - debit;

  // Insert transaction
  db.prepare(`
    INSERT INTO payment_account_transactions (
      id, business_id, account_id, transaction_type, reference_type, reference_id,
      amount, debit, credit, balance, payment_method, date, description, created_by, created_at
    ) VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    txId,
    params.accountId,
    params.transactionType,
    params.referenceType ?? null,
    params.referenceId ?? null,
    params.amount,
    debit,
    credit,
    newBalance,
    params.paymentMethod,
    date,
    params.description ?? null,
    params.createdBy ?? null,
    now
  );

  // Update account balance
  db.prepare(`
    UPDATE payment_accounts
    SET current_balance = ?, updated_at = ?
    WHERE id = ?
  `).run(newBalance, now, params.accountId);

  return {
    id: txId,
    businessId: "biz_default",
    accountId: params.accountId,
    transactionType: params.transactionType,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    amount: params.amount,
    debit,
    credit,
    balance: newBalance,
    paymentMethod: params.paymentMethod,
    date,
    description: params.description,
    createdBy: params.createdBy,
    createdAt: now,
  };
}

export function getAccountTransactions(
  db: DatabaseSync,
  accountId?: string,
  limit = 100
): PaymentAccountTransaction[] {
  let query = `SELECT * FROM payment_account_transactions`;
  const params: any[] = [];

  if (accountId) {
    query += ` WHERE account_id = ?`;
    params.push(accountId);
  }

  query += ` ORDER BY date DESC, created_at DESC LIMIT ?`;
  params.push(limit);

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    accountId: r.account_id,
    transactionType: r.transaction_type,
    referenceType: r.reference_type ?? undefined,
    referenceId: r.reference_id ?? undefined,
    amount: r.amount,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
    paymentMethod: r.payment_method,
    date: r.date,
    description: r.description ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
  }));
}
