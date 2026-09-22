import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type {
  CreditNote,
  CreditNoteItem,
  NoteAllocation,
  NoteRefund,
  NoteStatus,
  NoteAdjustmentType,
} from "../../../shared/types";
import { logAudit } from "./auditService";
import { recordCustomerLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import {
  getDefaultCashAccount,
  getPaymentAccountById,
  recordAccountTransaction,
} from "./paymentAccountService";

export interface CreateCreditNoteItemInput {
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

export interface CreateCreditNoteInput {
  customerId: string;
  saleId?: string;
  date?: string;
  reason: string;
  notes?: string;
  physicalReturn?: boolean;
  invoiceType?: "GST" | "NON_GST";
  items?: CreateCreditNoteItemInput[];
  amount?: number; // fallback manual/adjustment amount if items not specified
  tax?: number;
  adjustmentType?: NoteAdjustmentType;
  refundDetails?: {
    amount?: number;
    paymentMethod: string;
    paymentAccountId?: string;
    referenceNumber?: string;
    remarks?: string;
  };
  applyToSaleId?: string;
  applyAmount?: number;
  returnId?: string;
  user?: string;
}

export interface ApplyCreditNoteInput {
  targetSaleId?: string;
  saleId?: string;
  amount?: number;
  allocations?: Array<{ saleId?: string; targetSaleId?: string; amount: number }>;
  date?: string;
  notes?: string;
  user?: string;
}

export interface RefundCreditNoteInput {
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
 * Generate sequential, unique Credit Note Number: CN-YYYY-XXXXXX
 */
export function generateCreditNoteNumber(db: DatabaseSync): string {
  const currentYear = new Date().getFullYear();
  const prefix = `CN-${currentYear}-`;

  const rows = db
    .prepare("SELECT credit_note_no FROM credit_notes WHERE credit_note_no LIKE ?")
    .all(`${prefix}%`) as { credit_note_no: string }[];

  let maxSeq = 0;
  for (const r of rows) {
    const numPart = r.credit_note_no.slice(prefix.length);
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
 * Create Credit Note with atomic transaction-based accounting, inventory & IMEI updates.
 */
export function createCreditNote(db: DatabaseSync, input: CreateCreditNoteInput): CreditNote {
  if (!input.customerId) {
    throw new Error("Customer is required for credit note");
  }

  const customer = db.prepare("SELECT id, name, phone FROM customers WHERE id = ?").get(input.customerId) as any;
  if (!customer) {
    throw new Error(`Customer '${input.customerId}' not found`);
  }

  // If sale invoice is linked, validate it
  let sale: any = null;
  let originalSaleItems: any[] = [];
  const originalInvNo = (input as any).originalInvoiceNo;
  if (!input.saleId && originalInvNo) {
    const foundSale = db.prepare("SELECT * FROM sales WHERE invoice_no = ?").get(originalInvNo) as any;
    if (foundSale) {
      input.saleId = foundSale.id;
      sale = foundSale;
    }
  }

  if (input.saleId) {
    if (!sale) {
      sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(input.saleId) as any;
    }
    if (!sale) {
      throw new Error(`Original sale invoice '${input.saleId}' not found`);
    }
    if (sale.customer_id !== input.customerId) {
      throw new Error(`Sale invoice '${sale.invoice_no}' does not belong to selected customer`);
    }
    originalSaleItems = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(input.saleId) as any[];

    // Calculate previously credited total against this sale
    const prevCreditRow = db
      .prepare(
        "SELECT COALESCE(SUM(total), 0) as credited FROM credit_notes WHERE sale_id = ? AND status != 'CANCELLED'"
      )
      .get(input.saleId) as { credited: number } | undefined;
    const previouslyCredited = prevCreditRow?.credited || 0;
    const availableCreditLimit = Math.max(0, sale.total - previouslyCredited);

    if (availableCreditLimit <= 0) {
      throw new Error(`Original invoice ${sale.invoice_no} has already been fully credited`);
    }
  }

  // Determine invoiceType (GST or NON_GST)
  const isSaleNonGst = sale ? sale.invoice_type === "NON_GST" : false;
  const invoiceType: "GST" | "NON_GST" = isSaleNonGst || input.invoiceType === "NON_GST" ? "NON_GST" : "GST";

  const isPhysicalReturn = Boolean(input.physicalReturn);
  const creditNoteId = uid("cn");
  const creditNoteNo = generateCreditNoteNumber(db);
  const date = input.date || todayISO();
  const now = new Date().toISOString();
  const adjustmentType: NoteAdjustmentType = input.adjustmentType || "CUSTOMER_CREDIT";

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
      if (input.saleId && originalSaleItems.length > 0) {
        if (it.unitId) {
          originalItem = originalSaleItems.find((o) => o.unit_id === it.unitId);
        } else {
          originalItem = originalSaleItems.find((o) => o.product_id === it.productId);
        }

        if (originalItem) {
          // Check previously returned quantity for this item
          const prevItemReturns = db
            .prepare(
              `SELECT COALESCE(SUM(cni.qty), 0) as ret_qty
               FROM credit_note_items cni
               JOIN credit_notes cn ON cni.credit_note_id = cn.id
               WHERE cn.sale_id = ? AND cni.product_id = ? AND cn.status != 'CANCELLED'
               ${it.unitId ? "AND cni.unit_id = ?" : ""}`
            )
            .get(...(it.unitId ? [input.saleId, it.productId, it.unitId] : [input.saleId, it.productId])) as any;

          const alreadyReturned = prevItemReturns?.ret_qty || 0;
          const allowedRemaining = Math.max(0, originalItem.qty - alreadyReturned);

          if (it.qty > allowedRemaining) {
            throw new Error(
              `Cannot credit ${it.qty} units of '${originalItem.name}'. Only ${allowedRemaining} remaining from original sale (${originalItem.qty} sold, ${alreadyReturned} previously credited/returned).`
            );
          }
        }
      }

      // Rates and taxes from original item or input
      const rate = it.rate !== undefined ? it.rate : originalItem ? originalItem.price : 0;
      const discount = it.discount || 0;
      const grossItem = rate * it.qty - discount;
      const itemGst = (it as any).gstRate !== undefined ? (it as any).gstRate : it.gst;
      const gstRate = invoiceType === "NON_GST" ? 0 : itemGst !== undefined ? itemGst : originalItem ? (originalItem.gst || 0) : 0;

      let itemTax = 0;
      let itemTaxable = grossItem;

      if (gstRate > 0) {
        // GST included in price standard formula: tax = gross - gross / (1 + r/100)
        itemTax = Math.round(((grossItem * gstRate) / (100 + gstRate)) * 100) / 100;
        itemTaxable = grossItem - itemTax;
      }

      const itemTotal = grossItem;
      const productName = it.name || (originalItem ? originalItem.name : "Product");
      const itemPhysicalReturn = it.physicalReturn !== undefined ? Boolean(it.physicalReturn) : isPhysicalReturn;

      processedItems.push({
        id: `${creditNoteId}_item_${idx + 1}`,
        productId: it.productId,
        unitId: it.unitId,
        imei: it.imei || (originalItem ? originalItem.imei : undefined),
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
    // Manual adjustment amount without line items
    if (!input.amount || input.amount <= 0) {
      throw new Error("Credit note must have at least one item or a positive adjustment amount");
    }
    total = input.amount;
    tax = invoiceType === "NON_GST" ? 0 : (input.tax || 0);
    subtotal = total - tax;
  }

  // Ensure total does not exceed available credit limit if sale linked
  if (input.saleId && sale) {
    const prevCreditRow = db
      .prepare(
        "SELECT COALESCE(SUM(total), 0) as credited FROM credit_notes WHERE sale_id = ? AND status != 'CANCELLED'"
      )
      .get(input.saleId) as { credited: number } | undefined;
    const previouslyCredited = prevCreditRow?.credited || 0;
    const availableCreditLimit = Math.max(0, sale.total - previouslyCredited);

    if (total > availableCreditLimit) {
      throw new Error(
        `Credit note total (₹${total}) exceeds available credit amount for invoice ${sale.invoice_no} (Maximum allowed: ₹${availableCreditLimit})`
      );
    }
  }

  const halfTax = tax / 2;
  const cgst = halfTax;
  const sgst = halfTax;
  const igst = 0;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert Credit Note
    const insertStmt = db.prepare(`
      INSERT INTO credit_notes (
        id, business_id, branch_id, credit_note_no, date, customer_id, sale_id,
        original_invoice_no, original_invoice_date, reason, notes, invoice_type,
        subtotal, tax, cgst, sgst, igst, total, refunded_amount, applied_amount,
        remaining_amount, physical_return, adjustment_type, status, return_id,
        created_by, created_at, updated_at
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, 0, 0,
        ?, ?, ?, 'ISSUED', ?,
        ?, ?, ?
      )
    `);

    insertStmt.run(
      creditNoteId,
      creditNoteNo,
      date,
      input.customerId,
      input.saleId || null,
      sale?.invoice_no || null,
      sale?.date || null,
      input.reason,
      input.notes || null,
      invoiceType,
      subtotal,
      tax,
      cgst,
      sgst,
      igst,
      total,
      total, // remaining amount initially equals total
      isPhysicalReturn ? 1 : 0,
      adjustmentType,
      input.returnId || null,
      input.user || "System",
      now,
      now
    );

    // 2. Insert line items
    const insertItemStmt = db.prepare(`
      INSERT INTO credit_note_items (
        id, credit_note_id, product_id, unit_id, imei, name, qty,
        rate, discount, taxable_amount, gst_rate, tax_amount, total, physical_return
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const it of processedItems) {
      insertItemStmt.run(
        it.id,
        creditNoteId,
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

      // 3. Physical Stock Return if requested
      if (it.physicalReturn) {
        if (it.unitId) {
          // Tracked mobile phone unit: update status to 'RETURNED'
          db.prepare(
            "UPDATE units SET status = 'RETURNED', sale_id = NULL, customer_id = NULL WHERE id = ?"
          ).run(it.unitId);
        }
        // Add quantity back to product inventory
        db.prepare(
          "UPDATE products SET qty = qty + ? WHERE id = ?"
        ).run(it.qty, it.productId);

        recordStockMovement(db, {
          productId: it.productId,
          unitId: it.unitId,
          imei: it.imei,
          movementType: "RETURN",
          quantity: it.qty,
          costPerUnit: it.rate,
          referenceId: creditNoteId,
          notes: `Stock returned via Credit Note ${creditNoteNo} (${input.reason})`,
          createdBy: input.user || "Cashier",
        });
      }
    }

    // 4. Record Customer Ledger Entry (Credit reduces customer receivable)
    recordCustomerLedger(
      db,
      input.customerId,
      "CREDIT_NOTE",
      creditNoteId,
      0,
      total,
      `Credit Note ${creditNoteNo} issued against ${sale?.invoice_no || "Account"}: ${input.reason}`,
      undefined,
      undefined,
      creditNoteNo
    );

    // 5. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Cashier",
      action: "CREDIT_NOTE_CREATE",
      module: "Credit Notes",
      recordId: creditNoteId,
      newValue: {
        creditNoteNo,
        total,
        customerName: customer.name,
        reason: input.reason,
        physicalReturn: isPhysicalReturn,
        adjustmentType,
      },
      reason: `Issued Credit Note ${creditNoteNo} for ${customer.name}`,
    });

    db.exec("COMMIT;");
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }

  // 6. Handle immediate adjustment if requested (Refund / Apply to Invoice)
  if (adjustmentType === "REFUND" && input.refundDetails) {
    refundCreditNote(db, creditNoteId, {
      amount: input.refundDetails.amount || total,
      paymentMethod: input.refundDetails.paymentMethod,
      paymentAccountId: input.refundDetails.paymentAccountId,
      referenceNumber: input.refundDetails.referenceNumber,
      remarks: input.refundDetails.remarks,
      user: input.user,
    });
  } else if (adjustmentType === "APPLY_INVOICE" && input.applyToSaleId) {
    applyCreditNote(db, creditNoteId, {
      targetSaleId: input.applyToSaleId,
      amount: input.applyAmount || total,
      notes: `Applied Credit Note ${creditNoteNo}`,
      user: input.user,
    });
  }

  return getCreditNoteById(db, creditNoteId)!;
}

/**
 * Apply Credit Note to another customer sale invoice.
 */
export function applyCreditNote(db: DatabaseSync, creditNoteId: string, input: ApplyCreditNoteInput): CreditNote {
  const note = db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNoteId) as any;
  if (!note) {
    throw new Error(`Credit Note '${creditNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Cannot apply a cancelled credit note");
  }

  const allocList: Array<{ saleId: string; amount: number }> = [];
  if (input.allocations && Array.isArray(input.allocations) && input.allocations.length > 0) {
    for (const a of input.allocations) {
      const sid = a.saleId || a.targetSaleId;
      if (sid && a.amount > 0) {
        allocList.push({ saleId: sid, amount: a.amount });
      }
    }
  } else if ((input.targetSaleId || input.saleId) && input.amount && input.amount > 0) {
    allocList.push({ saleId: (input.targetSaleId || input.saleId)!, amount: input.amount });
  }

  if (allocList.length === 0) {
    throw new Error("Application amount must be greater than zero and target sale must be specified");
  }

  const totalApply = allocList.reduce((acc, curr) => acc + curr.amount, 0);
  if (note.remaining_amount < totalApply) {
    throw new Error(
      `Cannot apply ₹${totalApply}. Available credit balance is ₹${note.remaining_amount}`
    );
  }

  const date = input.date || todayISO();
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    let currentApplied = note.applied_amount;
    let currentRemaining = note.remaining_amount;

    for (const alloc of allocList) {
      const targetSale = db.prepare("SELECT * FROM sales WHERE id = ?").get(alloc.saleId) as any;
      if (!targetSale) {
        throw new Error(`Target sale invoice '${alloc.saleId}' not found`);
      }
      if (targetSale.customer_id !== note.customer_id) {
        throw new Error("Target invoice belongs to a different customer");
      }

      const allocationId = uid("alloc");
      db.prepare(`
        INSERT INTO note_allocations (
          id, note_type, note_id, target_type, target_id, target_no, amount, allocated_amount, sale_id, date, notes, created_by, created_at
        ) VALUES (?, 'CREDIT_NOTE', ?, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        allocationId,
        creditNoteId,
        targetSale.id,
        targetSale.invoice_no,
        alloc.amount,
        alloc.amount,
        targetSale.id,
        date,
        input.notes || `Applied to invoice ${targetSale.invoice_no}`,
        input.user || "Cashier",
        now
      );

      // Update paid amount on target sale invoice
      db.prepare(`
        UPDATE sales
        SET paid = paid + ?
        WHERE id = ?
      `).run(alloc.amount, targetSale.id);

      currentApplied += alloc.amount;
      currentRemaining = Math.max(0, currentRemaining - alloc.amount);
    }

    const newStatus: NoteStatus = currentRemaining <= 0 ? "APPLIED" : "PARTIALLY_ADJUSTED";

    db.prepare(`
      UPDATE credit_notes
      SET applied_amount = ?, remaining_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(currentApplied, currentRemaining, newStatus, now, creditNoteId);

    // Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Cashier",
      action: "CREDIT_NOTE_APPLY",
      module: "Credit Notes",
      recordId: creditNoteId,
      newValue: {
        totalApplied: totalApply,
        remainingAmount: currentRemaining,
        status: newStatus,
      },
      reason: `Applied ₹${totalApply} from Credit Note ${note.credit_note_no}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getCreditNoteById(db, creditNoteId)!;
}

/**
 * Refund customer for Credit Note: decreases selected Payment Account and records customer ledger debit.
 */
export function refundCreditNote(db: DatabaseSync, creditNoteId: string, input: RefundCreditNoteInput): CreditNote {
  if (!input.amount || input.amount <= 0) {
    throw new Error("Refund amount must be greater than zero");
  }

  const note = db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNoteId) as any;
  if (!note) {
    throw new Error(`Credit Note '${creditNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Cannot refund a cancelled credit note");
  }
  if (note.remaining_amount < input.amount) {
    throw new Error(
      `Cannot refund ₹${input.amount}. Available refundable balance is ₹${note.remaining_amount}`
    );
  }

  // Resolve Payment Account
  const method = input.paymentMethod || "Cash";
  let accountId = input.paymentAccountId;
  if (!accountId) {
    if (method.toUpperCase() === "CASH") {
      accountId = getDefaultCashAccount(db).id;
    } else {
      const activeAcct = db
        .prepare("SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' LIMIT 1")
        .get(method.toUpperCase()) as any;
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
  const newRefunded = note.refunded_amount + input.amount;
  const newRemaining = Math.max(0, note.remaining_amount - input.amount);
  const newStatus: NoteStatus = newRemaining <= 0 ? "REFUNDED" : "PARTIALLY_ADJUSTED";
  const refNum = input.referenceNumber || input.referenceNo || null;
  const remarks = input.remarks || input.notes || null;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Payment Account Transaction: outflow (isCredit: false) reduces account balance
    recordAccountTransaction(db, {
      accountId,
      transactionType: "REFUND",
      referenceType: "CREDIT_NOTE",
      referenceId: creditNoteId,
      amount: input.amount,
      isCredit: false, // Outflow/Paid to customer
      paymentMethod: method,
      date,
      description: `Refund for Credit Note ${note.credit_note_no}${remarks ? ` - ${remarks}` : ""}`,
      createdBy: input.user || "Cashier",
    });

    // 2. Customer Ledger Entry (Debit balances out the credit)
    recordCustomerLedger(
      db,
      note.customer_id,
      "REFUND",
      refundId,
      input.amount,
      0,
      `Refund against Credit Note ${note.credit_note_no} via ${method}`,
      accountId,
      method,
      refNum || undefined
    );

    // 3. Record in note_refunds
    db.prepare(`
      INSERT INTO note_refunds (
        id, note_type, note_id, party_type, party_id, amount, payment_method,
        payment_account_id, reference_number, reference_no, date, remarks, created_by, created_at
      ) VALUES (?, 'CREDIT_NOTE', ?, 'CUSTOMER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      refundId,
      creditNoteId,
      note.customer_id,
      input.amount,
      method,
      accountId,
      refNum,
      refNum,
      date,
      remarks,
      input.user || "Cashier",
      now
    );

    // 4. Update Credit Note state
    db.prepare(`
      UPDATE credit_notes
      SET refunded_amount = ?, remaining_amount = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newRefunded, newRemaining, newStatus, now, creditNoteId);

    // 5. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Cashier",
      action: "CREDIT_NOTE_REFUND",
      module: "Credit Notes",
      recordId: creditNoteId,
      newValue: {
        refundAmount: input.amount,
        paymentAccount: paymentAccount.accountName,
        paymentMethod: method,
        newStatus,
      },
      reason: `Refunded ₹${input.amount} for Credit Note ${note.credit_note_no}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getCreditNoteById(db, creditNoteId)!;
}

/**
 * Cancel Credit Note: reverses customer ledger effect and reverses inventory/IMEI status if physical return occurred.
 * NEVER deletes records.
 */
export function cancelCreditNote(db: DatabaseSync, creditNoteId: string, reason: string, user?: string): CreditNote {
  const note = db.prepare("SELECT * FROM credit_notes WHERE id = ?").get(creditNoteId) as any;
  if (!note) {
    throw new Error(`Credit Note '${creditNoteId}' not found`);
  }
  if (note.status === "CANCELLED") {
    throw new Error("Credit note is already cancelled");
  }

  const items = db.prepare("SELECT * FROM credit_note_items WHERE credit_note_id = ?").all(creditNoteId) as any[];
  const allocations = db.prepare("SELECT * FROM note_allocations WHERE note_id = ?").all(creditNoteId) as any[];
  const refunds = db.prepare("SELECT * FROM note_refunds WHERE note_id = ?").all(creditNoteId) as any[];
  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Reverse Customer Ledger (Debit note total to restore original customer receivable)
    recordCustomerLedger(
      db,
      note.customer_id,
      "CANCELLED_CREDIT_NOTE",
      creditNoteId,
      note.total,
      0,
      `Cancellation of Credit Note ${note.credit_note_no}: ${reason}`
    );

    // 2. Reverse Physical Return effect if applicable
    for (const it of items) {
      if (it.physical_return) {
        if (it.unit_id) {
          // Unit status back to 'sold'
          db.prepare("UPDATE units SET status = 'sold', sale_id = ? WHERE id = ?").run(
            note.sale_id || null,
            it.unit_id
          );
        }
        // Deduct quantity back from product inventory
        db.prepare("UPDATE products SET qty = MAX(0, qty - ?) WHERE id = ?").run(
          it.qty,
          it.product_id
        );

        recordStockMovement(db, {
          productId: it.product_id,
          unitId: it.unit_id,
          imei: it.imei,
          movementType: "CREDIT_NOTE_CANCEL",
          quantity: -it.qty,
          costPerUnit: it.rate,
          referenceId: creditNoteId,
          notes: `Reversal of physical return for cancelled Credit Note ${note.credit_note_no}`,
          createdBy: user || "Cashier",
        });
      }
    }

    // 3. Reverse allocations on target sales
    for (const alloc of allocations) {
      db.prepare("UPDATE sales SET paid = MAX(0, paid - ?) WHERE id = ?").run(
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
          referenceType: "CREDIT_NOTE_CANCEL",
          referenceId: creditNoteId,
          amount: ref.amount,
          isCredit: true, // Inflow back into payment account
          paymentMethod: ref.payment_method,
          description: `Refund reversal for cancelled Credit Note ${note.credit_note_no}`,
          createdBy: user || "Cashier",
        });
      }
    }

    // 5. Update status to CANCELLED (Never delete)
    db.prepare(`
      UPDATE credit_notes
      SET status = 'CANCELLED', updated_at = ?
      WHERE id = ?
    `).run(now, creditNoteId);

    // 6. Audit Log
    logAudit(db, {
      userId: user,
      userName: user || "Cashier",
      action: "CREDIT_NOTE_CANCEL",
      module: "Credit Notes",
      recordId: creditNoteId,
      newValue: { status: "CANCELLED", reason },
      reason: `Cancelled Credit Note ${note.credit_note_no}: ${reason}`,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }

  return getCreditNoteById(db, creditNoteId)!;
}

/**
 * Get Credit Note by ID with full item details, customer info, allocations, and refunds.
 */
export function getCreditNoteById(db: DatabaseSync, id: string): CreditNote | null {
  const row = db.prepare(`
    SELECT cn.*, c.name as customer_name, c.phone as customer_phone
    FROM credit_notes cn
    JOIN customers c ON cn.customer_id = c.id
    WHERE cn.id = ? OR cn.credit_note_no = ?
  `).get(id, id) as any;

  if (!row) return null;

  const items = db
    .prepare("SELECT * FROM credit_note_items WHERE credit_note_id = ?")
    .all(row.id) as any[];

  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    creditNoteNo: row.credit_note_no,
    noteNumber: row.credit_note_no,
    date: row.date,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    saleId: row.sale_id ?? undefined,
    originalInvoiceNo: row.original_invoice_no ?? undefined,
    originalInvoiceDate: row.original_invoice_date ?? undefined,
    reason: row.reason,
    notes: row.notes ?? undefined,
    invoiceType: row.invoice_type || "GST",
    subtotal: row.subtotal || 0,
    tax: row.tax || 0,
    cgst: row.cgst || 0,
    sgst: row.sgst || 0,
    igst: row.igst || 0,
    total: row.total || 0,
    amount: row.total || 0,
    refundedAmount: row.refunded_amount || 0,
    appliedAmount: row.applied_amount || 0,
    remainingAmount: row.remaining_amount || 0,
    physicalReturn: Boolean(row.physical_return),
    adjustmentType: row.adjustment_type || "CUSTOMER_CREDIT",
    status: row.status as NoteStatus,
    returnId: row.return_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    items: items.map((i) => ({
      id: i.id,
      creditNoteId: i.credit_note_id,
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
 * List Credit Notes with optional filters.
 */
export function listCreditNotes(
  db: DatabaseSync,
  filters?: {
    customerId?: string;
    saleId?: string;
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
  }
): CreditNote[] {
  let query = `
    SELECT cn.*, c.name as customer_name, c.phone as customer_phone
    FROM credit_notes cn
    JOIN customers c ON cn.customer_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.customerId) {
    query += " AND cn.customer_id = ?";
    params.push(filters.customerId);
  }
  if (filters?.saleId) {
    query += " AND cn.sale_id = ?";
    params.push(filters.saleId);
  }
  if (filters?.status && filters.status !== "ALL") {
    query += " AND cn.status = ?";
    params.push(filters.status);
  }
  if (filters?.dateFrom) {
    query += " AND cn.date >= ?";
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    query += " AND cn.date <= ?";
    params.push(filters.dateTo);
  }
  if (filters?.search) {
    query += " AND (cn.credit_note_no LIKE ? OR c.name LIKE ? OR cn.original_invoice_no LIKE ?)";
    const term = `%${filters.search.trim()}%`;
    params.push(term, term, term);
  }

  query += " ORDER BY cn.date DESC, cn.created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((row) => ({
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    creditNoteNo: row.credit_note_no,
    noteNumber: row.credit_note_no,
    date: row.date,
    customerId: row.customer_id,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    saleId: row.sale_id ?? undefined,
    originalInvoiceNo: row.original_invoice_no ?? undefined,
    originalInvoiceDate: row.original_invoice_date ?? undefined,
    reason: row.reason,
    notes: row.notes ?? undefined,
    invoiceType: row.invoice_type || "GST",
    subtotal: row.subtotal || 0,
    tax: row.tax || 0,
    cgst: row.cgst || 0,
    sgst: row.sgst || 0,
    igst: row.igst || 0,
    total: row.total || 0,
    amount: row.total || 0,
    refundedAmount: row.refunded_amount || 0,
    appliedAmount: row.applied_amount || 0,
    remainingAmount: row.remaining_amount || 0,
    physicalReturn: Boolean(row.physical_return),
    adjustmentType: row.adjustment_type || "CUSTOMER_CREDIT",
    status: row.status as NoteStatus,
    returnId: row.return_id ?? undefined,
    createdBy: row.created_by ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
  }));
}
