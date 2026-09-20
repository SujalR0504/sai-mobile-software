import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { DebitNote } from "../../../shared/types";
import { getDebitNotes } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordSupplierLedger } from "./ledgerService";

export interface CreateDebitNoteInput {
  dealerId: string;
  noteNumber?: string;
  date?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  reason: string;
  amount: number;
  tax?: number;
  tdsApplicable?: boolean;
  tdsSection?: string;
  tdsRate?: number;
  tdsAmount?: number;
  otherCharges?: number;
  adjustmentAmount?: number;
  remarks?: string;
  user?: string;
}

export function generateDebitNoteNumber(db: DatabaseSync): string {
  const currentYear = new Date().getFullYear();
  const nextSeq = Math.floor(100 + Math.random() * 900);
  return `DN-${currentYear}-${nextSeq}`;
}

export function recordDebitNote(db: DatabaseSync, input: CreateDebitNoteInput): DebitNote {
  if (!input.dealerId) {
    throw new Error("Dealer is required for debit note");
  }
  if (!input.amount || input.amount <= 0) {
    throw new Error("Debit note amount must be greater than zero");
  }

  const dealer = db.prepare("SELECT id, name FROM suppliers WHERE id = ?").get(input.dealerId) as any;
  if (!dealer) {
    throw new Error(`Dealer '${input.dealerId}' not found`);
  }

  const id = uid("dn");
  const noteNumber = input.noteNumber?.trim() || generateDebitNoteNumber(db);
  const date = input.date || todayISO();
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    const stmt = db.prepare(`
      INSERT INTO debit_notes (
        id, business_id, branch_id, debit_note_no, date, dealer_id,
        original_invoice_no, original_invoice_date, reason, amount, tax,
        tds_applicable, tds_section, tds_rate, tds_amount, other_charges,
        adjustment_amount, remarks, created_at, created_by
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `);

    stmt.run(
      id,
      noteNumber,
      date,
      input.dealerId,
      input.originalInvoiceNo || null,
      input.originalInvoiceDate || null,
      input.reason,
      input.amount,
      input.tax || 0,
      input.tdsApplicable ? 1 : 0,
      input.tdsSection || null,
      input.tdsRate || 0,
      input.tdsAmount || 0,
      input.otherCharges || 0,
      input.adjustmentAmount || 0,
      input.remarks || null,
      now,
      input.user || "System"
    );

    // Record in Dealer Ledger as DEBIT (reduces payable)
    recordSupplierLedger(
      db,
      input.dealerId,
      "DEBIT_NOTE",
      id,
      input.amount,
      0,
      `Debit Note ${noteNumber}: ${input.reason}`
    );

    // Record audit log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Accountant",
      action: "DEBIT_NOTE_CREATE",
      module: "PURCHASES",
      recordId: id,
      newValue: { noteNumber, amount: input.amount, dealerName: dealer.name, reason: input.reason },
      reason: `Recorded debit note ${noteNumber} for ${dealer.name}`,
    });

    db.exec("COMMIT;");

    return {
      id,
      noteNumber,
      date,
      supplierId: input.dealerId,
      dealerId: input.dealerId,
      originalInvoiceNo: input.originalInvoiceNo,
      originalInvoiceDate: input.originalInvoiceDate,
      section: input.tdsSection,
      tdsSection: input.tdsSection,
      ratePct: input.tdsRate,
      tdsRate: input.tdsRate,
      tdsAmount: input.tdsAmount,
      taxableValue: input.amount,
      amount: input.amount,
      reason: input.reason,
      status: "ACTIVE",
      notes: input.remarks,
      createdAt: now,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function listDebitNotes(db: DatabaseSync, dealerId?: string): DebitNote[] {
  return getDebitNotes(db, dealerId);
}

export const getDebitNotesByDealer = listDebitNotes;
