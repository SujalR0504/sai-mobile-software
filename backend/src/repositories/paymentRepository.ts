import type { DatabaseSync } from "node:sqlite";
import type { CashbookEntry, Expense, ExpenseCategory, PaymentEntry, PaymentMode } from "../../../shared/types";

export function getExpenses(db: DatabaseSync): Expense[] {
  const rows = db.prepare("SELECT * FROM expenses ORDER BY date DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    category: r.category as ExpenseCategory,
    amount: r.amount,
    note: r.note ?? undefined,
  }));
}

export function getPayments(db: DatabaseSync): PaymentEntry[] {
  const rows = db.prepare("SELECT * FROM payments ORDER BY date DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    party: r.party as "customer" | "supplier",
    partyId: r.party_id,
    refId: r.ref_id ?? undefined,
    amount: r.amount,
    mode: r.mode as PaymentMode,
    note: r.note ?? undefined,
  }));
}

export function getCashbook(db: DatabaseSync): CashbookEntry[] {
  const payments = db.prepare(`
    SELECT id, date, amount, mode, note, party, party_id, ref_id FROM payments
    ORDER BY date ASC
  `).all() as Array<{
    id: string;
    date: string;
    amount: number;
    mode: string;
    note: string | null;
    party: string;
    partyId: string;
    refId: string | null;
  }>;

  const expenses = db.prepare(`
    SELECT id, date, amount, category, note FROM expenses
    ORDER BY date ASC
  `).all() as Array<{
    id: string;
    date: string;
    amount: number;
    category: string;
    note: string | null;
  }>;

  const entries: CashbookEntry[] = [];
  let balance = 0;

  const rawEvents: Array<{
    id: string;
    date: string;
    description: string;
    type: "IN" | "OUT";
    amount: number;
    mode: string;
    category?: string;
  }> = [];

  for (const p of payments) {
    if (p.party === "customer") {
      rawEvents.push({
        id: p.id,
        date: p.date,
        description: `Receipt: ${p.note || "Customer payment"}`,
        type: "IN",
        amount: p.amount,
        mode: p.mode,
        category: "Sale Payment",
      });
    } else {
      rawEvents.push({
        id: p.id,
        date: p.date,
        description: `Payment: ${p.note || "Supplier payment"}`,
        type: "OUT",
        amount: p.amount,
        mode: p.mode,
        category: "Purchase Payment",
      });
    }
  }

  for (const e of expenses) {
    rawEvents.push({
      id: e.id,
      date: e.date,
      description: `Expense: ${e.category} ${e.note ? "- " + e.note : ""}`,
      type: "OUT",
      amount: e.amount,
      mode: "Cash",
      category: e.category,
    });
  }

  rawEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const ev of rawEvents) {
    const cashIn = ev.type === "IN" ? ev.amount : 0;
    const cashOut = ev.type === "OUT" ? ev.amount : 0;
    balance += cashIn - cashOut;

    entries.push({
      id: ev.id,
      date: ev.date,
      description: ev.description,
      type: ev.type,
      amount: ev.amount,
      mode: ev.mode as PaymentMode,
      category: ev.category,
      cashIn,
      cashOut,
      balance,
    });
  }

  return entries.reverse();
}
