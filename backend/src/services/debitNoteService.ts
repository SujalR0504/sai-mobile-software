import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type {
  DebitNote,
  DebitNoteItem,
  NoteAllocation,
  NoteRefund,
  NoteStatus,
  NoteAdjustmentType,
} from "../../../shared/types";
import { logAudit } from "./auditService";
import { recordSupplierLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import {
  getDefaultCashAccount,
  getPaymentAccountById,
  recordAccountTransaction,
} from "./paymentAccountService";

export interface CreateDebitNoteItemInput {
  productId: string;
  unitId?: string;
  imei?: string;
  name?: string;
  qty: number;
  rate?: number;
  discount?: number;
  gst?: number;
  taxableAmount?: number;
  physicalReturn?: boolean;
}

export interface CreateDebitNoteInput {
  dealerId?: string;
  supplierId?: string;
  purchaseId?: string;
  noteNumber?: string;
  date?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  reason: string;
  remarks?: string;
  notes?: string;
  physicalReturn?: boolean;
  invoiceType?: "GST" | "NON_GST";
  items?: CreateDebitNoteItemInput[];
  amount?: number;
  tax?: number;
  tdsApplicable?: boolean;
  tdsSection?: string;
  tdsRate?: number;
  tdsAmount?: number;
  otherCharges?: number;
  adjustmentAmount?: number;
  adjustmentType?: NoteAdjustmentType;
  refundDetails?: {
    amount?: number;
    paymentMethod: string;
    paymentAccountId?: string;
    referenceNumber?: string;
    remarks?: string;
  };
  applyToPurchaseId?: string;
  applyAmount?: number;
  returnId?: string;
  user?: string;
}

export interface ApplyDebitNoteInput {
  targetPurchaseId?: string;
  purchaseId?: string;
  amount?: number;
  allocations?: Array<{ purchaseId?: string; targetPurchaseId?: string; amount: number }>;
  date?: string;
  notes?: string;
  user?: string;
}

export interface RefundDebitNoteInput {
  amount: number;
  paymentMethod: string;
  paymentAccountId?: string;
  referenceNumber?: string;
  referenceNo?: string;
  date?: string;
  remarks?: string;
  notes?: string;
  user?: string;
}

/**
 * Generate sequential, unique Debit Note Number: DN-YYYY-XXXXXX
 */
export function generateDebitNoteNumber(db: DatabaseSync): string {
  const currentYear = new Date().getFullYear();
  const prefix = `DN-${currentYear}-`;

  const rows = db
    .prepare("SELECT debit_note_no FROM debit_notes WHERE debit_note_no LIKE ?")
    .all(`${prefix}%`) as { debit_note_no: string }[];

  let maxSeq = 0;
  for (const r of rows) {
    const numPart = r.debit_note_no.slice(prefix.length);
    const seq = parseInt(numPart, 10);
    if (!isNaN(seq) && seq > maxSeq) {
      maxSeq = seq;
    }
  }

  const nextSeq = maxSeq + 1;
  const padded = String(nextSeq).padStart(6, "0");
  return `${prefix}${padded}`;
}

/**
 * Record / Create Debit Note with atomic transaction-based accounting, inventory & IMEI updates.
 */
export function recordDebitNote(db: DatabaseSync, input: CreateDebitNoteInput): DebitNote {
  const dealerId = input.dealerId || input.supplierId;
  if (!dealerId) {
    throw new Error("Dealer is required for debit note");
  }

  const dealer = db.prepare("SELECT id, name, phone, mobile FROM suppliers WHERE id = ?").get(dealerId) as any;
  if (!dealer) {
    throw new Error(`Dealer '${dealerId}' not found`);
  }

  // If purchase is linked, validate it
  let purchase: any = null;
  let originalPurchaseItems: any[] = [];
  const originalInvNo = (input as any).originalInvoiceNo;
  if (!input.purchaseId && originalInvNo) {
    const foundPur = db.prepare("SELECT * FROM purchases WHERE invoice_no = ?").get(originalInvNo) as any;
    if (foundPur) {
      input.purchaseId = foundPur.id;
      purchase = foundPur;
    }
  }

  if (input.purchaseId) {
    if (!purchase) {
      purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(input.purchaseId) as any;
    }
    if (!purchase) {
      throw new Error(`Original purchase invoice '${input.purchaseId}' not found`);
    }
    if (purchase.supplier_id !== dealerId) {
      throw new Error(`Purchase invoice '${purchase.invoice_no}' does not belong to selected dealer`);
    }
    originalPurchaseItems = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ?").all(input.purchaseId) as any[];

    // Calculate previously adjusted total against this purchase
    const prevDebitRow = db
      .prepare(
        "SELECT COALESCE(SUM(total), 0) as adjusted FROM debit_notes WHERE purchase_id = ? AND status != 'CANCELLED'"
      )
      .get(input.purchaseId) as { adjusted: number } | undefined;
    const previouslyAdjusted = prevDebitRow?.adjusted || 0;
    const availableAdjustment = Math.max(0, purchase.total - previouslyAdjusted);

    if (availableAdjustment <= 0) {
      throw new Error(`Original purchase ${purchase.invoice_no} has already been fully adjusted`);
    }
  }

  const isPurchaseNonGst = purchase ? purchase.purchase_type === "NON_GST" : false;
  const invoiceType: "GST" | "NON_GST" = isPurchaseNonGst || input.invoiceType === "NON_GST" ? "NON_GST" : "GST";

  const isPhysicalReturn = Boolean(input.physicalReturn);
  const debitNoteId = uid("dn");
  const noteNumber = input.noteNumber?.trim() || generateDebitNoteNumber(db);
  const date = input.date || todayISO();
  const now = new Date().toISOString();
  const adjustmentType: NoteAdjustmentType = input.adjustmentType || "DEALER_CREDIT";

  // Process items or manual amount
  const processedItems: Array<{
    id: string;
    productId: string;
    unitId?: string;
    imei?: string;
    name: string;
    qty: number;
    rate: number;
    discount: number;
    taxableAmount: number;
    gstRate: number;
    taxAmount: number;
    total: number;
    physicalReturn: boolean;
  }> = [];

  let subtotal = 0;
  let tax = 0;
  let total = 0;

  if (input.items && input.items.length > 0) {
    for (let idx = 0; idx < input.items.length; idx++) {
      const it = input.items[idx];
      if (it.qty <= 0) continue;

      let originalItem: any = null;
      if (input.purchaseId && originalPurchaseItems.length > 0) {
        originalItem = originalPurchaseItems.find((o) => o.product_id === it.productId);

        if (originalItem) {
          // Check previously returned quantity for this purchase item
          const prevItemReturns = db
            .prepare(
              `SELECT COALESCE(SUM(dni.qty), 0) as ret_qty
               FROM debit_note_items dni
               JOIN debit_notes dn ON dni.debit_note_id = dn.id
               WHERE dn.purchase_id = ? AND dni.product_id = ? AND dn.status != 'CANCELLED'`
            )
            .get(input.purchaseId, it.productId) as any;

          const alreadyReturned = prevItemReturns?.ret_qty || 0;
          const allowedRemaining = Math.max(0, originalItem.qty - alreadyReturned);

          if (it.qty > allowedRemaining) {
            throw new Error(
              `Cannot adjust ${it.qty} units of '${originalItem.name}'. Only ${allowedRemaining} remaining from original purchase (${originalItem.qty} purchased, ${alreadyReturned} previously adjusted).`
            );
          }
        }
      }

      const rate = it.rate !== undefined ? it.rate : originalItem ? originalItem.price : 0;
      const discount = it.discount || 0;
      const grossItem = rate * it.qty - discount;
      const itemGst = (it as any).gstRate !== undefined ? (it as any).gstRate : it.gst;
      const gstRate = invoiceType === "NON_GST" ? 0 : itemGst !== undefined ? itemGst : originalItem ? (originalItem.gst || 0) : 0;

      let itemTax = 0;
      let itemTaxable = grossItem;

      if (gstRate > 0) {
        itemTax = Math.round(((grossItem * gstRate) / 100) * 100) / 100;
        itemTaxable = grossItem;
      }

      const itemTotal = grossItem + itemTax;
      const productName = it.name || (originalItem ? originalItem.name : "Product");
      const itemPhysicalReturn = it.physicalReturn !== undefined ? Boolean(it.physicalReturn) : isPhysicalReturn;

      processedItems.push({
        id: `${debitNoteId}_item_${idx + 1}`,
        productId: it.productId,
        unitId: it.unitId,
        imei: it.imei,
        name: productName,
        qty: it.qty,
        rate,
        discount,
        taxableAmount: itemTaxable,
        gstRate,
        taxAmount: itemTax,
        total: itemTotal,
        physicalReturn: itemPhysicalReturn,
      });

      subtotal += itemTaxable;
      tax += itemTax;
      total += itemTotal;
    }
  } else {
    if (!input.amount || input.amount <= 0) {
      throw new Error("Debit note must have at least one item or a positive amount");
    }
    total = input.amount;
    tax = invoiceType === "NON_GST" ? 0 : (input.tax || 0);
    subtotal = total - tax;
  }

  // Check against available adjustment limit if purchase is linked
  if (input.purchaseId && purchase) {
    const prevDebitRow = db
      .prepare(
        "SELECT COALESCE(SUM(total), 0) as adjusted FROM debit_notes WHERE purchase_id = ? AND status != 'CANCELLED'"
      )
      .get(input.purchaseId) as { adjusted: number } | undefined;
    const previouslyAdjusted = prevDebitRow?.adjusted || 0;
    const availableAdjustment = Math.max(0, purchase.total - previouslyAdjusted);

    if (total > availableAdjustment) {
      throw new Error(
        `Debit note total (₹${total}) exceeds available adjustment amount for purchase ${purchase.invoice_no} (Maximum allowed: ₹${availableAdjustment})`
      );
    }
  }

  const halfTax = tax / 2;
  const cgst = halfTax;
  const sgst = halfTax;
  const igst = 0;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert into debit_notes
    const stmt = db.prepare(`
      INSERT INTO debit_notes (
        id, business_id, branch_id, debit_note_no, date, dealer_id,
        purchase_id, original_invoice_no, original_invoice_date, reason,
        invoice_type, subtotal, tax, cgst, sgst, igst, total, amount,
        tds_applicable, tds_section, tds_rate, tds_amount, other_charges,
        adjustment_amount, refunded_amount, applied_amount, remaining_amount,
        physical_return, adjustment_type, status, remarks, return_id,
        created_at, created_by, updated_at
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, 0, 0, ?,
        ?, ?, 'ISSUED', ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      debitNoteId,
      noteNumber,
      date,
      dealerId,
      input.purchaseId || null,
      input.originalInvoiceNo || purchase?.invoice_no || null,
      input.originalInvoiceDate || purchase?.date || null,
      input.reason,
      invoiceType,
      subtotal,
      tax,
      cgst,
      sgst,
      igst,
      total,
      total,
      input.tdsApplicable ? 1 : 0,
      input.tdsSection || null,
      input.tdsRate || 0,
      input.tdsAmount || 0,
      input.otherCharges || 0,
      input.adjustmentAmount || 0,
      total, // remaining amount initially equals total
      isPhysicalReturn ? 1 : 0,
      adjustmentType,
      input.remarks || input.notes || null,
      input.returnId || null,
      now,
      input.user || "System",
      now
    );

    // 2. Insert line items
    const insertItemStmt = db.prepare(`
      INSERT INTO debit_note_items (
        id, debit_note_id, product_id, unit_id, imei, name, qty,
        rate, discount, taxable_amount, gst_rate, tax_amount, total, physical_return
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of processedItems) {
      insertItemStmt.run(
        it.id,
        debitNoteId,
        it.productId,
        it.unitId || null,
        it.imei || null,
        it.name,
        it.qty,
        it.rate,
        it.discount,
        it.taxableAmount,
        it.gstRate,
        it.taxAmount,
        it.total,
        it.physicalReturn ? 1 : 0
      );

      // 3. Physical Stock Return OUT to dealer if requested
      if (it.physicalReturn) {
        if (it.unitId) {
          // Tracked mobile unit: mark status RETURNED_TO_DEALER (do not delete)
          db.prepare(
            "UPDATE units SET status = 'RETURNED_TO_DEALER' WHERE id = ?"
          ).run(it.unitId);
        }
        // Deduct quantity from product stock
        db.prepare(
          "UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?"
        ).run(it.qty, it.productId);

        recordStockMovement(db, {
          productId: it.productId,
          unitId: it.unitId,
          imei: it.imei,
          movementType: "PURCHASE_RETURN",
          quantity: it.qty,
          costPerUnit: it.rate,
          referenceId: debitNoteId,
          notes: `Stock returned to dealer via Debit Note ${noteNumber} (${input.reason})`,
          createdBy: input.user || "Purchaser",
        });
      }
    }

    // 4. Record in Dealer / Supplier Ledger as DEBIT (reduces payable)
    recordSupplierLedger(
      db,
      dealerId,
      "DEBIT_NOTE",
      debitNoteId,
      total,
      0,
      `Debit Note ${noteNumber}: ${input.reason}`,
      undefined,
      undefined,
      noteNumber
    );

    // 5. Record audit log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Accountant",
      action: "DEBIT_NOTE_CREATE",
      module: "Debit Notes",
      recordId: debitNoteId,
      newValue: {
        noteNumber,
        total,
        dealerName: dealer.name,
        reason: input.reason,
        physicalReturn: isPhysicalReturn,
        adjustmentType,
      },
      reason: `Recorded debit note ${noteNumber} for ${dealer.name}`,
    });

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  // 6. Handle immediate adjustment if requested (Dealer Refund / Apply to Purchase)
  if (adjustmentType === "REFUND" && input.refundDetails) {
    refundDebitNote(db, debitNoteId, {
      amount: input.refundDetails.amount || total,
      paymentMethod: input.refundDetails.paymentMethod,
      paymentAccountId: input.refundDetails.paymentAccountId,
      referenceNumber: input.refundDetails.referenceNumber,
      remarks: input.refundDetails.remarks,
      user: input.user,
    });
  } else if (adjustmentType === "APPLY_PURCHASE" && input.applyToPurchaseId) {
    applyDebitNote(db, debitNoteId, {
      targetPurchaseId: input.applyToPurchaseId,
      amount: input.applyAmount || total,
      notes: `Applied Debit Note ${noteNumber}`,
      user: input.user,
    });
  }

  return getDebitNoteById(db, debitNoteId)!;
}

export const createDebitNote = recordDebitNote;

/**
 * Apply Debit Note to another dealer purchase bill.
 */
export function applyDebitNote(db: DatabaseSync, debitNoteId: string, input: ApplyDebitNoteInput): DebitNote {
  const note = db.prepare("SELECT * FROM debit_notes WHERE id = ?").get(debitNoteId) as any;
  if (!note) {
    throw new Error(`Debit Note '${debitNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Cannot apply a cancelled debit note");
  }

  const allocList: Array<{ purchaseId: string; amount: number }> = [];
  if (input.allocations && Array.isArray(input.allocations) && input.allocations.length > 0) {
    for (const a of input.allocations) {
      const pid = a.purchaseId || a.targetPurchaseId;
      if (pid && a.amount > 0) {
        allocList.push({ purchaseId: pid, amount: a.amount });
      }
    }
  } else if ((input.targetPurchaseId || input.purchaseId) && input.amount && input.amount > 0) {
    allocList.push({ purchaseId: (input.targetPurchaseId || input.purchaseId)!, amount: input.amount });
  }

  if (allocList.length === 0) {
    throw new Error("Application amount must be greater than zero and target purchase must be specified");
  }

  const totalApply = allocList.reduce((acc, curr) => acc + curr.amount, 0);
  const remainingBal = (note.remaining_amount !== undefined ? note.remaining_amount : note.amount) || 0;
  if (remainingBal < totalApply) {
    throw new Error(
      `Cannot apply ₹${totalApply}. Available adjustment balance is ₹${remainingBal}`
    );
  }

  const date = input.date || todayISO();
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    let currentApplied = note.applied_amount || 0;
    let currentRemaining = remainingBal;

    for (const alloc of allocList) {
      const targetPurchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(alloc.purchaseId) as any;
      if (!targetPurchase) {
        throw new Error(`Target purchase '${alloc.purchaseId}' not found`);
      }
      if (targetPurchase.supplier_id !== note.dealer_id) {
        throw new Error("Target purchase belongs to a different dealer");
      }

      const allocationId = uid("alloc");
      db.prepare(`
        INSERT INTO note_allocations (
          id, note_type, note_id, target_type, target_id, target_no, amount, allocated_amount, purchase_id, date, notes, created_by, created_at
        ) VALUES (?, 'DEBIT_NOTE', ?, 'PURCHASE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        allocationId,
        debitNoteId,
        targetPurchase.id,
        targetPurchase.invoice_no,
        alloc.amount,
        alloc.amount,
        targetPurchase.id,
        date,
        input.notes || `Applied to purchase ${targetPurchase.invoice_no}`,
        input.user || "Purchaser",
        now
      );

      // Increase paid amount on target purchase bill
      db.prepare(`
        UPDATE purchases
        SET paid = paid + ?
        WHERE id = ?
      `).run(alloc.amount, targetPurchase.id);

      currentApplied += alloc.amount;
      currentRemaining = Math.max(0, currentRemaining - alloc.amount);
    }

    const newStatus: NoteStatus = currentRemaining <= 0 ? "APPLIED" : "PARTIALLY_ADJUSTED";

    db.prepare(`
      UPDATE debit_notes
      SET applied_amount = ?, remaining_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(currentApplied, currentRemaining, newStatus, now, debitNoteId);

    logAudit(db, {
      userId: input.user,
      userName: input.user || "Accountant",
      action: "DEBIT_NOTE_APPLY",
      module: "Debit Notes",
      recordId: debitNoteId,
      newValue: {
        totalApplied: totalApply,
        remainingAmount: currentRemaining,
        status: newStatus,
      },
      reason: `Applied ₹${totalApply} from Debit Note ${note.debit_note_no}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getDebitNoteById(db, debitNoteId)!;
}

/**
 * Record Dealer Refund: increases selected Payment Account balance (inflow) and updates supplier ledger.
 */
export function refundDebitNote(db: DatabaseSync, debitNoteId: string, input: RefundDebitNoteInput): DebitNote {
  if (!input.amount || input.amount <= 0) {
    throw new Error("Refund amount must be greater than zero");
  }

  const note = db.prepare("SELECT * FROM debit_notes WHERE id = ?").get(debitNoteId) as any;
  if (!note) {
    throw new Error(`Debit Note '${debitNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Cannot refund a cancelled debit note");
  }

  const remainingAvailable = note.remaining_amount !== undefined ? note.remaining_amount : note.amount;
  if (remainingAvailable < input.amount) {
    throw new Error(
      `Cannot refund ₹${input.amount}. Available refundable balance is ₹${remainingAvailable}`
    );
  }

  const method = input.paymentMethod || "Bank";
  let accountId = input.paymentAccountId;
  if (!accountId) {
    if (method.toUpperCase() === "CASH") {
      accountId = getDefaultCashAccount(db).id;
    } else {
      const activeAcct = db
        .prepare("SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' LIMIT 1")
        .get(method.toUpperCase() === "BANK" ? "BANK" : "UPI") as any;
      if (activeAcct) {
        accountId = activeAcct.id;
      } else {
        throw new Error(`Please select a payment account for ${method}`);
      }
    }
  }

  const paymentAccount = getPaymentAccountById(db, accountId);
  if (!paymentAccount) {
    throw new Error(`Payment Account '${accountId}' not found`);
  }

  const refundId = uid("ref");
  const date = input.date || todayISO();
  const now = new Date().toISOString();
  const newRefunded = (note.refunded_amount || 0) + input.amount;
  const newRemaining = Math.max(0, remainingAvailable - input.amount);
  const newStatus: NoteStatus = newRemaining <= 0 ? "REFUNDED" : "PARTIALLY_APPLIED";

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Payment Account Transaction: inflow (isCredit: true) increases account balance
    recordAccountTransaction(db, {
      accountId,
      transactionType: "REFUND",
      referenceType: "DEBIT_NOTE",
      referenceId: debitNoteId,
      amount: input.amount,
      isCredit: true, // Inflow into store account
      paymentMethod: method,
      date,
      description: `Dealer refund received for Debit Note ${note.debit_note_no}${input.remarks ? ` - ${input.remarks}` : ""}`,
      createdBy: input.user || "Cashier",
    });

    // 2. Supplier Ledger Entry: credit balances out the debit
    recordSupplierLedger(
      db,
      note.dealer_id,
      "REFUND",
      refundId,
      0,
      input.amount,
      `Dealer refund received for Debit Note ${note.debit_note_no} via ${method}`,
      accountId,
      method,
      input.referenceNumber
    );

    // 3. Record in note_refunds
    db.prepare(`
      INSERT INTO note_refunds (
        id, note_type, note_id, party_type, party_id, amount, payment_method,
        payment_account_id, reference_number, date, remarks, created_by, created_at
      ) VALUES (?, 'DEBIT_NOTE', ?, 'DEALER', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      refundId,
      debitNoteId,
      note.dealer_id,
      input.amount,
      method,
      accountId,
      input.referenceNumber || null,
      date,
      input.remarks || null,
      input.user || "Cashier",
      now
    );

    // 4. Update Debit Note
    db.prepare(`
      UPDATE debit_notes
      SET refunded_amount = ?, remaining_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newRefunded, newRemaining, newStatus, now, debitNoteId);

    // 5. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Accountant",
      action: "DEBIT_NOTE_REFUND",
      module: "Debit Notes",
      recordId: debitNoteId,
      newValue: {
        refundAmount: input.amount,
        paymentAccount: paymentAccount.accountName,
        paymentMethod: method,
        newStatus,
      },
      reason: `Recorded dealer refund of ₹${input.amount} for Debit Note ${note.debit_note_no}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getDebitNoteById(db, debitNoteId)!;
}

/**
 * Cancel Debit Note: reverses dealer ledger effect and reverses inventory/IMEI status.
 * NEVER deletes records.
 */
export function cancelDebitNote(db: DatabaseSync, debitNoteId: string, reason: string, user?: string): DebitNote {
  const note = db.prepare("SELECT * FROM debit_notes WHERE id = ?").get(debitNoteId) as any;
  if (!note) {
    throw new Error(`Debit Note '${debitNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Debit note is already cancelled");
  }

  const items = db.prepare("SELECT * FROM debit_note_items WHERE debit_note_id = ?").all(debitNoteId) as any[];
  const allocations = db.prepare("SELECT * FROM note_allocations WHERE note_id = ?").all(debitNoteId) as any[];
  const refunds = db.prepare("SELECT * FROM note_refunds WHERE note_id = ?").all(debitNoteId) as any[];
  const now = new Date().toISOString();
  const noteTotal = note.total !== undefined ? note.total : note.amount;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Reverse Dealer Ledger (Credit note total to restore original payable)
    recordSupplierLedger(
      db,
      note.dealer_id,
      "CANCELLED_DEBIT_NOTE",
      debitNoteId,
      0,
      noteTotal,
      `Cancellation of Debit Note ${note.debit_note_no}: ${reason}`
    );

    // 2. Reverse Physical Return effect if applicable
    for (const it of items) {
      if (it.physical_return) {
        if (it.unit_id) {
          // Unit status back to 'available'
          db.prepare("UPDATE units SET status = 'available' WHERE id = ?").run(it.unit_id);
        }
        // Untracked/tracked product: restore quantity in stock
        db.prepare("UPDATE products SET qty = qty + ? WHERE id = ?").run(
          it.qty,
          it.product_id
        );

        recordStockMovement(db, {
          productId: it.product_id,
          unitId: it.unit_id,
          imei: it.imei,
          movementType: "DEBIT_NOTE_CANCEL",
          quantity: it.qty,
          costPerUnit: it.rate,
          referenceId: debitNoteId,
          notes: `Reversal of physical return for cancelled Debit Note ${note.debit_note_no}`,
          createdBy: user || "Purchaser",
        });
      }
    }

    // 3. Reverse allocations on target purchases
    for (const alloc of allocations) {
      db.prepare("UPDATE purchases SET paid = MAX(0, paid - ?) WHERE id = ?").run(
        alloc.amount,
        alloc.target_id
      );
    }

    // 4. Reverse refunds on payment accounts if any
    for (const ref of refunds) {
      if (ref.payment_account_id) {
        recordAccountTransaction(db, {
          accountId: ref.payment_account_id,
          transactionType: "ADJUSTMENT",
          referenceType: "DEBIT_NOTE_CANCEL",
          referenceId: debitNoteId,
          amount: ref.amount,
          isCredit: false, // Outflow back from store account
          paymentMethod: ref.payment_method,
          description: `Dealer refund reversal for cancelled Debit Note ${note.debit_note_no}`,
          createdBy: user || "Cashier",
        });
      }
    }

    // 5. Update status to CANCELLED
    db.prepare(`
      UPDATE debit_notes
      SET status = 'CANCELLED', updated_at = ?
      WHERE id = ?
    `).run(now, debitNoteId);

    // 6. Audit Log
    logAudit(db, {
      userId: user,
      userName: user || "Accountant",
      action: "DEBIT_NOTE_CANCEL",
      module: "Debit Notes",
      recordId: debitNoteId,
      newValue: { status: "CANCELLED", reason },
      reason: `Cancelled Debit Note ${note.debit_note_no}: ${reason}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getDebitNoteById(db, debitNoteId)!;
}

/**
 * Get Debit Note by ID with items, dealer info, allocations, and refunds.
 */
export function getDebitNoteById(db: DatabaseSync, id: string): DebitNote | null {
  const row = db.prepare(`
    SELECT dn.*, s.name as dealer_name, s.phone as dealer_phone
    FROM debit_notes dn
    JOIN suppliers s ON dn.dealer_id = s.id
    WHERE dn.id = ? OR dn.debit_note_no = ?
  `).get(id, id) as any;

  if (!row) return null;

  const items = db
    .prepare("SELECT * FROM debit_note_items WHERE debit_note_id = ?")
    .all(row.id) as any[];

  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    debitNoteNo: row.debit_note_no,
    noteNumber: row.debit_note_no,
    date: row.date,
    supplierId: row.dealer_id,
    dealerId: row.dealer_id,
    dealerName: row.dealer_name,
    dealerPhone: row.dealer_phone,
    purchaseId: row.purchase_id ?? undefined,
    originalInvoiceNo: row.original_invoice_no ?? undefined,
    originalInvoiceDate: row.original_invoice_date ?? undefined,
    reason: row.reason,
    notes: row.remarks ?? undefined,
    remarks: row.remarks ?? undefined,
    invoiceType: row.invoice_type || "GST",
    subtotal: row.subtotal !== undefined ? row.subtotal : row.amount,
    tax: row.tax || 0,
    cgst: row.cgst || 0,
    sgst: row.sgst || 0,
    igst: row.igst || 0,
    total: row.total !== undefined ? row.total : row.amount,
    amount: row.amount,
    taxableValue: row.taxable_value !== undefined ? row.taxable_value : row.amount,
    refundedAmount: row.refunded_amount || 0,
    appliedAmount: row.applied_amount || 0,
    remainingAmount: row.remaining_amount !== undefined ? row.remaining_amount : row.amount,
    physicalReturn: Boolean(row.physical_return),
    adjustmentType: row.adjustment_type || "DEALER_CREDIT",
    status: row.status as NoteStatus,
    section: row.tds_section ?? undefined,
    tdsSection: row.tds_section ?? undefined,
    ratePct: row.tds_rate ?? undefined,
    tdsRate: row.tds_rate ?? undefined,
    tdsAmount: row.tds_amount ?? undefined,
    otherCharges: row.other_charges ?? undefined,
    adjustmentAmount: row.adjustment_amount ?? undefined,
    returnId: row.return_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    items: items.map((i) => ({
      id: i.id,
      debitNoteId: i.debit_note_id,
      productId: i.product_id,
      unitId: i.unit_id ?? undefined,
      imei: i.imei ?? undefined,
      name: i.name,
      qty: i.qty,
      rate: i.rate,
      discount: i.discount || 0,
      taxableAmount: i.taxable_amount,
      gstRate: i.gst_rate,
      taxAmount: i.tax_amount,
      total: i.total,
      physicalReturn: Boolean(i.physical_return),
    })),
  };
}

/**
 * List Debit Notes with optional filters.
 */
export function listDebitNotes(
  db: DatabaseSync,
  filters?: {
    dealerId?: string;
    purchaseId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  } | string
): DebitNote[] {
  // Support passing dealerId directly as string for backward compatibility
  const dealerId = typeof filters === "string" ? filters : filters?.dealerId;
  const filterObj = typeof filters === "object" ? filters : undefined;

  let query = `
    SELECT dn.*, s.name as dealer_name, s.phone as dealer_phone
    FROM debit_notes dn
    JOIN suppliers s ON dn.dealer_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (dealerId) {
    query += " AND dn.dealer_id = ?";
    params.push(dealerId);
  }
  if (filterObj?.purchaseId) {
    query += " AND dn.purchase_id = ?";
    params.push(filterObj.purchaseId);
  }
  if (filterObj?.status && filterObj.status !== "ALL") {
    query += " AND dn.status = ?";
    params.push(filterObj.status);
  }
  if (filterObj?.dateFrom) {
    query += " AND dn.date >= ?";
    params.push(filterObj.dateFrom);
  }
  if (filterObj?.dateTo) {
    query += " AND dn.date <= ?";
    params.push(filterObj.dateTo);
  }
  if (filterObj?.search) {
    query += " AND (dn.debit_note_no LIKE ? OR s.name LIKE ? OR dn.original_invoice_no LIKE ?)";
    const term = `%${filterObj.search.trim()}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY dn.date DESC, dn.created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    debitNoteNo: r.debit_note_no,
    noteNumber: r.debit_note_no,
    date: r.date,
    supplierId: r.dealer_id,
    dealerId: r.dealer_id,
    dealerName: r.dealer_name,
    dealerPhone: r.dealer_phone,
    purchaseId: r.purchase_id ?? undefined,
    originalInvoiceNo: r.original_invoice_no ?? undefined,
    originalInvoiceDate: r.original_invoice_date ?? undefined,
    reason: r.reason,
    notes: r.remarks ?? undefined,
    remarks: r.remarks ?? undefined,
    invoiceType: r.invoice_type || "GST",
    subtotal: r.subtotal !== undefined ? r.subtotal : r.amount,
    tax: r.tax || 0,
    cgst: r.cgst || 0,
    sgst: r.sgst || 0,
    igst: r.igst || 0,
    total: r.total !== undefined ? r.total : r.amount,
    amount: r.amount,
    taxableValue: r.taxable_value !== undefined ? r.taxable_value : r.amount,
    refundedAmount: r.refunded_amount || 0,
    appliedAmount: r.applied_amount || 0,
    remainingAmount: r.remaining_amount !== undefined ? r.remaining_amount : r.amount,
    physicalReturn: Boolean(r.physical_return),
    adjustmentType: r.adjustment_type || "DEALER_CREDIT",
    status: r.status as NoteStatus,
    section: r.tds_section ?? undefined,
    tdsSection: r.tds_section ?? undefined,
    ratePct: r.tds_rate ?? undefined,
    tdsRate: r.tds_rate ?? undefined,
    tdsAmount: r.tds_amount ?? undefined,
    otherCharges: r.other_charges ?? undefined,
    adjustmentAmount: r.adjustment_amount ?? undefined,
    returnId: r.return_id ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  }));
}

export const getDebitNotesByDealer = listDebitNotes;
