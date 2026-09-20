import type { DatabaseSync } from "node:sqlite";
import type { DebitNote, Supplier, SupplierLedgerEntry } from "../../../shared/types";

export function getSuppliers(db: DatabaseSync): Supplier[] {
  const rows = db.prepare("SELECT * FROM suppliers ORDER BY name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    company: r.company ?? undefined,
    phone: r.phone,
    mobile: r.mobile ?? undefined,
    whatsapp: r.whatsapp ?? undefined,
    email: r.email ?? undefined,
    gstin: r.gstin ?? undefined,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    state: r.state ?? undefined,
    stateCode: r.state_code ?? undefined,
    contactPerson: r.contact_person ?? undefined,
    notes: r.notes ?? undefined,
    creditLimit: r.credit_limit ?? undefined,
    paymentTerms: r.payment_terms ?? undefined,
  }));
}

export function getDebitNotes(db: DatabaseSync, dealerId?: string): DebitNote[] {
  try {
    const query = dealerId
      ? "SELECT * FROM debit_notes WHERE dealer_id = ? ORDER BY date DESC"
      : "SELECT * FROM debit_notes ORDER BY date DESC";
    const rows = dealerId ? (db.prepare(query).all(dealerId) as any[]) : (db.prepare(query).all() as any[]);
    return rows.map((r) => ({
      id: r.id,
      noteNo: r.note_no,
      date: r.date,
      dealerId: r.dealer_id,
      dealerName: r.dealer_name,
      dealerGstin: r.dealer_gstin ?? undefined,
      purchaseId: r.purchase_id ?? undefined,
      purchaseInvoiceNo: r.purchase_invoice_no ?? undefined,
      reason: r.reason,
      taxableAmount: r.taxable_amount,
      tdsRate: r.tds_rate,
      tdsSection: r.tds_section,
      tdsAmount: r.tds_amount,
      cgst: r.cgst || 0,
      sgst: r.sgst || 0,
      igst: r.igst || 0,
      totalAmount: r.total_amount,
      remarks: r.remarks ?? undefined,
      status: r.status,
      createdAt: r.created_at,
      createdBy: r.created_by ?? undefined,
    }));
  } catch {
    return [];
  }
}

export function getSupplierLedger(db: DatabaseSync, supplierId: string): SupplierLedgerEntry[] {
  try {
    const directEntries = db.prepare(`
      SELECT id, date, description, debit, credit, balance, reference_no, reference_type
      FROM supplier_ledger
      WHERE supplier_id = ?
      ORDER BY date ASC, created_at ASC
    `).all(supplierId) as any[];

    if (directEntries.length > 0) {
      return directEntries.map((e) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        debit: Number(e.debit) || 0,
        credit: Number(e.credit) || 0,
        balance: Number(e.balance) || 0,
        referenceNo: e.reference_no ?? undefined,
        referenceType: e.reference_type ?? undefined,
      }));
    }
  } catch {}

  const purchases = db.prepare(`
    SELECT id, invoice_no, date, total FROM purchases
    WHERE supplier_id = ?
    ORDER BY date ASC
  `).all(supplierId) as Array<{ id: string; invoice_no: string; date: string; total: number }>;

  const payments = db.prepare(`
    SELECT id, date, amount, mode, note, ref_id FROM payments
    WHERE (party = 'supplier' OR party = 'dealer') AND party_id = ?
    ORDER BY date ASC
  `).all(supplierId) as Array<{
    id: string;
    date: string;
    amount: number;
    mode: string;
    note: string | null;
    ref_id: string | null;
  }>;

  const debitNotes = getDebitNotes(db, supplierId);

  const entries: SupplierLedgerEntry[] = [];
  let running = 0;

  const events: Array<{
    id: string;
    date: string;
    type: "purchase" | "payment" | "debit_note";
    amount: number;
    desc: string;
  }> = [];

  for (const p of purchases) {
    events.push({
      id: p.id,
      date: p.date,
      type: "purchase",
      amount: p.total,
      desc: `Purchase Invoice #${p.invoice_no}`,
    });
  }

  for (const pay of payments) {
    events.push({
      id: pay.id,
      date: pay.date,
      type: "payment",
      amount: pay.amount,
      desc: `Payment (${pay.mode})${pay.note ? " - " + pay.note : ""}`,
    });
  }

  for (const dn of debitNotes) {
    events.push({
      id: dn.id,
      date: dn.date,
      type: "debit_note",
      amount: dn.totalAmount,
      desc: `Debit Note #${dn.noteNo} (${dn.reason})`,
    });
  }

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  for (const ev of events) {
    if (ev.type === "purchase") {
      running += ev.amount;
      entries.push({
        id: ev.id,
        date: ev.date,
        description: ev.desc,
        debit: 0,
        credit: ev.amount,
        balance: running,
      });
    } else {
      running -= ev.amount;
      entries.push({
        id: ev.id,
        date: ev.date,
        description: ev.desc,
        debit: ev.amount,
        credit: 0,
        balance: running,
      });
    }
  }

  return entries;
}
