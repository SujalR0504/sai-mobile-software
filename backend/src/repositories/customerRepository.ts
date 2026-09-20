import type { DatabaseSync } from "node:sqlite";
import type { Customer, CustomerLedgerEntry } from "../../../shared/types";

export function getCustomers(db: DatabaseSync): Customer[] {
  const rows = db.prepare("SELECT * FROM customers ORDER BY name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    mobile: r.mobile ?? undefined,
    phone: r.phone,
    whatsapp: r.whatsapp ?? undefined,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    gstin: r.gstin ?? undefined,
    customerType: r.customer_type ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getCustomerLedger(db: DatabaseSync, customerId: string): CustomerLedgerEntry[] {
  const sales = db.prepare(`
    SELECT id, invoice_no, date, total, quotation FROM sales
    WHERE customer_id = ? AND quotation = 0
    ORDER BY date ASC
  `).all(customerId) as Array<{ id: string; invoice_no: string; date: string; total: number }>;

  const payments = db.prepare(`
    SELECT id, date, amount, mode, note, ref_id FROM payments
    WHERE party = 'customer' AND party_id = ?
    ORDER BY date ASC
  `).all(customerId) as Array<{
    id: string;
    date: string;
    amount: number;
    mode: string;
    note: string | null;
    ref_id: string | null;
  }>;

  const entries: CustomerLedgerEntry[] = [];
  let running = 0;

  const events: Array<{
    id: string;
    date: string;
    type: "sale" | "payment";
    amount: number;
    desc: string;
  }> = [];

  for (const s of sales) {
    events.push({
      id: s.id,
      date: s.date,
      type: "sale",
      amount: s.total,
      desc: `Sale Invoice #${s.invoice_no}`,
    });
  }

  for (const p of payments) {
    events.push({
      id: p.id,
      date: p.date,
      type: "payment",
      amount: p.amount,
      desc: `Payment (${p.mode})${p.note ? " - " + p.note : ""}`,
    });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const ev of events) {
    if (ev.type === "sale") {
      running += ev.amount;
      entries.push({
        id: ev.id,
        date: ev.date,
        description: ev.desc,
        debit: ev.amount,
        credit: 0,
        balance: running,
      });
    } else {
      running -= ev.amount;
      entries.push({
        id: ev.id,
        date: ev.date,
        description: ev.desc,
        debit: 0,
        credit: ev.amount,
        balance: running,
      });
    }
  }

  return entries;
}
