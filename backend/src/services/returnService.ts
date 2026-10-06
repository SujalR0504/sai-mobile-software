import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { LineItem, ReturnDoc } from "../../../shared/types";
import { getReturns } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordCustomerLedger, recordSupplierLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import { generateCreditNoteNumber } from "./creditNoteService";
import { generateDebitNoteNumber } from "./debitNoteService";

export interface RecordSaleReturnInput {
  saleId: string;
  items: LineItem[];
  reason: string;
  condition?: "GOOD" | "DAMAGED" | "UNDER_INSPECTION";
  mode: "Refund" | "Credit Note";
  generateCreditNote?: boolean;
  destination?: "INVENTORY" | "DEALER";
  dealerId?: string;
  user?: string;
}

export interface RecordPurchaseReturnInput {
  purchaseId: string;
  items: LineItem[];
  reason: string;
  generateDebitNote?: boolean;
  user?: string;
}

export function recordSaleReturn(db: DatabaseSync, input: RecordSaleReturnInput): ReturnDoc {
  let sale = db.prepare("SELECT * FROM sales WHERE id = ? OR invoice_no = ?").get(input.saleId, input.saleId) as any;
  if (!sale) throw new Error(`Sale invoice ${input.saleId} not found`);
  input.saleId = sale.id;

  const originalItems = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(sale.id) as any[];

  // Validate items were part of original sale
  for (const retItem of input.items) {
    const orig = originalItems.find(
      (o) => o.product_id === retItem.productId || o.name === retItem.name || (retItem.unitId && o.unit_id === retItem.unitId)
    );
    if (orig && retItem.qty > orig.qty) {
      throw new Error(`Cannot return ${retItem.qty} of ${retItem.name}. Original sale had only ${orig.qty}`);
    }
  }

  let customerId = sale.customer_id;
  if (!customerId || !db.prepare("SELECT id FROM customers WHERE id = ?").get(customerId)) {
    const c0 = db.prepare("SELECT id FROM customers WHERE id = 'c0'").get();
    if (!c0) {
      db.prepare(
        "INSERT OR IGNORE INTO customers (id, name, phone, mobile, created_at, updated_at) VALUES ('c0', 'Cash / Walk-in Customer', '9999999999', '9999999999', ?, ?)"
      ).run(todayISO(), todayISO());
    }
    customerId = "c0";
  }

  const amount = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const returnId = uid("ret");
  const date = todayISO();
  const isDealerReturn = input.destination === "DEALER";
  const condition = input.condition || (isDealerReturn ? "DAMAGED" : "GOOD");
  // Sales Return -> status = available (if restocking to inventory) or PURCHASE_RETURNED (if returning to dealer)
  const unitStatus = isDealerReturn
    ? "PURCHASE_RETURNED"
    : condition === "GOOD"
    ? "available"
    : condition === "DAMAGED"
    ? "damaged"
    : "UNDER_INSPECTION";

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertReturnStmt = db.prepare(`
      INSERT INTO returns (id, business_id, type, ref_id, ref_no, date, party_id, amount, reason, condition, mode, destination, dealer_id)
      VALUES (?, 'biz_default', 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertReturnStmt.run(
      returnId,
      input.saleId,
      sale.invoice_no,
      date,
      customerId,
      amount,
      input.reason,
      condition,
      input.mode,
      input.destination || "INVENTORY",
      input.dealerId || null
    );

    const insertReturnItemStmt = db.prepare(`
      INSERT INTO return_items (id, return_id, product_id, unit_id, name, qty, price, gst, cost_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateUnitStmt = db.prepare(`
      UPDATE units
      SET status = ?, sale_id = NULL, customer_id = NULL
      WHERE id = ?
    `);

    input.items.forEach((item, idx) => {
      let pId = item.productId;
      const pExists = db.prepare("SELECT id FROM products WHERE id = ?").get(pId);
      if (!pExists) {
        const pByName = db.prepare("SELECT id FROM products WHERE name = ? COLLATE NOCASE").get(item.name) as any;
        if (pByName) pId = pByName.id;
      }

      let uId = item.unitId ?? null;
      if (uId && !db.prepare("SELECT id FROM units WHERE id = ?").get(uId)) {
        uId = null;
      }
      if (!uId && item.imei) {
        const uByImei = db.prepare("SELECT id FROM units WHERE imei1 = ? OR imei2 = ?").get(item.imei, item.imei) as any;
        if (uByImei) uId = uByImei.id;
      }

      insertReturnItemStmt.run(
        `${returnId}_i_${idx}`,
        returnId,
        pId,
        uId,
        item.name,
        item.qty,
        item.price,
        item.gst || 0,
        item.costPrice || 0
      );

      if (uId) {
        updateUnitStmt.run(unitStatus, uId);
      } else if (item.imei) {
        db.prepare("UPDATE units SET status = ?, sale_id = NULL, customer_id = NULL WHERE imei1 = ? OR imei2 = ?").run(unitStatus, item.imei, item.imei);
      }

      // Universal stock increment for restocking
      if (!isDealerReturn && condition === "GOOD") {
        db.prepare("UPDATE products SET qty = qty + ? WHERE id = ?").run(item.qty, pId);
      }

      recordStockMovement(db, {
        productId: pId,
        unitId: uId,
        imei: item.imei,
        movementType: "SALE_RETURN",
        quantity: item.qty,
        costPerUnit: item.costPrice,
        referenceId: returnId,
        notes: `Customer return from invoice ${sale.invoice_no} (${condition})`,
        createdBy: input.user || "Cashier",
      });
    });

    // Update Customer Ledger & Generate Credit Note if applicable
    if (input.mode === "Credit Note" || input.generateCreditNote) {
      const creditNoteId = uid("cn");
      const creditNoteNo = generateCreditNoteNumber(db);
      const isNonGst = sale.invoice_type === "NON_GST";
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO credit_notes (
          id, business_id, branch_id, credit_note_no, date, customer_id, sale_id,
          original_invoice_no, original_invoice_date, reason, notes, invoice_type,
          subtotal, tax, cgst, sgst, igst, total, refunded_amount, applied_amount,
          remaining_amount, physical_return, adjustment_type, status, return_id,
          created_by, created_at, updated_at
        ) VALUES (
          ?, 'biz_default', 'branch_01', ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, 0, 0, 0, 0, ?, 0, 0,
          ?, 1, 'CUSTOMER_CREDIT', 'ISSUED', ?,
          ?, ?, ?
        )
      `).run(
        creditNoteId,
        creditNoteNo,
        date,
        customerId,
        input.saleId,
        sale.invoice_no,
        sale.date,
        input.reason,
        `Generated from Sale Return ${returnId}`,
        isNonGst ? "NON_GST" : "GST",
        amount,
        amount,
        amount,
        returnId,
        input.user || "Staff",
        now,
        now
      );

      // Insert credit note items safely with valid FKs
      const insertItemStmt = db.prepare(`
        INSERT INTO credit_note_items (
          id, credit_note_id, product_id, unit_id, imei, name, qty,
          rate, discount, taxable_amount, gst_rate, tax_amount, total, physical_return
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, 1)
      `);

      input.items.forEach((it, idx) => {
        let pId = it.productId;
        const pExists = db.prepare("SELECT id FROM products WHERE id = ?").get(pId);
        if (!pExists) {
          const pByName = db.prepare("SELECT id FROM products WHERE name = ? COLLATE NOCASE").get(it.name) as any;
          if (pByName) pId = pByName.id;
        }

        let uId = it.unitId || null;
        if (uId && !db.prepare("SELECT id FROM units WHERE id = ?").get(uId)) {
          uId = null;
        }
        if (!uId && it.imei) {
          const uByImei = db.prepare("SELECT id FROM units WHERE imei1 = ? OR imei2 = ?").get(it.imei, it.imei) as any;
          if (uByImei) uId = uByImei.id;
        }

        insertItemStmt.run(
          `${creditNoteId}_i_${idx}`,
          creditNoteId,
          pId,
          uId,
          it.imei || null,
          it.name,
          it.qty,
          it.price,
          it.price * it.qty,
          it.price * it.qty
        );
      });

      recordCustomerLedger(
        db,
        customerId,
        "CREDIT_NOTE",
        creditNoteId,
        0,
        amount,
        `Credit Note ${creditNoteNo} for return against ${sale.invoice_no}`,
        undefined,
        undefined,
        creditNoteNo
      );
    } else {
      recordCustomerLedger(db, customerId, "REFUND", returnId, amount, 0, `Refund for return against ${sale.invoice_no}`);
      recordCashbookEntry(db, "SALE_RETURN_REFUND", returnId, "Refunds", 0, amount, `Refund to customer for return of bill ${sale.invoice_no}`);
    }

    logAudit(db, {
      userId: input.user,
      userName: input.user || "Staff",
      action: "SALE_RETURN",
      module: "RETURNS",
      recordId: returnId,
      newValue: { amount, mode: input.mode, condition },
      reason: input.reason,
    });

    if (isDealerReturn && input.dealerId) {
      const supExists = db.prepare("SELECT id FROM suppliers WHERE id = ?").get(input.dealerId);
      if (supExists) {
        recordSupplierLedger(
          db,
          input.dealerId,
          "PURCHASE_RETURN",
          returnId,
          amount,
          0,
          `Sales Return #${sale.invoice_no} forwarded to Dealer: ${input.reason}`,
          undefined,
          "DEALER_RETURN",
          `DR-${sale.invoice_no}`
        );
      }
    }

    db.exec("COMMIT;");

    return {
      id: returnId,
      type: "sale",
      refId: input.saleId,
      refNo: sale.invoice_no,
      date,
      partyId: customerId,
      items: input.items,
      amount,
      reason: input.reason,
      condition,
      mode: input.mode,
      destination: input.destination || "INVENTORY",
      dealerId: input.dealerId,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function recordPurchaseReturn(db: DatabaseSync, input: RecordPurchaseReturnInput): ReturnDoc {
  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ? OR invoice_no = ?").get(input.purchaseId, input.purchaseId) as any;
  if (!purchase) throw new Error(`Purchase invoice ${input.purchaseId} not found`);
  input.purchaseId = purchase.id;

  let supplierId = purchase.supplier_id;
  if (!supplierId || !db.prepare("SELECT id FROM suppliers WHERE id = ?").get(supplierId)) {
    const s0 = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as any;
    if (s0) {
      supplierId = s0.id;
    } else {
      supplierId = "s_default";
      db.prepare("INSERT OR IGNORE INTO suppliers (id, name, phone, created_at, updated_at) VALUES ('s_default', 'Default Supplier', '9999999999', ?, ?)").run(todayISO(), todayISO());
    }
  }

  const returnId = uid("ret");
  const date = todayISO();
  const amount = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertReturnStmt = db.prepare(`
      INSERT INTO returns (id, business_id, type, ref_id, ref_no, date, party_id, amount, reason, condition, mode, destination, dealer_id)
      VALUES (?, 'biz_default', 'purchase', ?, ?, ?, ?, ?, ?, 'DAMAGED', 'Credit Note', 'DEALER', ?)
    `);
    insertReturnStmt.run(
      returnId,
      input.purchaseId,
      purchase.invoice_no,
      date,
      supplierId,
      amount,
      input.reason,
      supplierId
    );

    const insertReturnItemStmt = db.prepare(`
      INSERT INTO return_items (id, return_id, product_id, unit_id, name, qty, price, gst, cost_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updateUnitStmt = db.prepare(`
      UPDATE units
      SET status = 'PURCHASE_RETURNED'
      WHERE id = ?
    `);

    const deductStockStmt = db.prepare(`
      UPDATE products
      SET qty = MAX(0, qty - ?)
      WHERE id = ?
    `);

    input.items.forEach((item, idx) => {
      let pId = item.productId;
      const pExists = db.prepare("SELECT id FROM products WHERE id = ?").get(pId);
      if (!pExists) {
        const pByName = db.prepare("SELECT id FROM products WHERE name = ? COLLATE NOCASE").get(item.name) as any;
        if (pByName) pId = pByName.id;
      }

      let uId = item.unitId ?? null;
      if (uId && !db.prepare("SELECT id FROM units WHERE id = ?").get(uId)) {
        uId = null;
      }
      if (!uId && item.imei) {
        const uByImei = db.prepare("SELECT id FROM units WHERE imei1 = ? OR imei2 = ?").get(item.imei, item.imei) as any;
        if (uByImei) uId = uByImei.id;
      }

      insertReturnItemStmt.run(
        `${returnId}_i_${idx}`,
        returnId,
        pId,
        uId,
        item.name,
        item.qty,
        item.price,
        item.gst || 0,
        item.costPrice || 0
      );

      if (uId) {
        updateUnitStmt.run(uId);
      } else if (item.imei) {
        db.prepare("UPDATE units SET status = 'PURCHASE_RETURNED' WHERE imei1 = ? OR imei2 = ?").run(item.imei, item.imei);
      }

      // Universal stock deduction
      deductStockStmt.run(item.qty, pId);

      recordStockMovement(db, {
        productId: pId,
        unitId: uId,
        imei: item.imei,
        movementType: "PURCHASE_RETURN",
        quantity: -item.qty,
        costPerUnit: item.costPrice,
        referenceId: returnId,
        notes: `Returned to supplier for bill ${purchase.invoice_no}`,
        createdBy: input.user || "Purchaser",
      });
    });

    // Update Supplier Ledger & Generate Debit Note if applicable
    if (input.generateDebitNote) {
      const debitNoteId = uid("dn");
      const debitNoteNo = generateDebitNoteNumber(db);
      const isNonGst = purchase.purchase_type === "NON_GST";
      const now = new Date().toISOString();

      db.prepare(`
        INSERT INTO debit_notes (
          id, business_id, branch_id, debit_note_no, date, dealer_id,
          purchase_id, original_invoice_no, original_invoice_date, reason,
          invoice_type, subtotal, tax, cgst, sgst, igst, total, amount,
          refunded_amount, applied_amount, remaining_amount,
          physical_return, adjustment_type, status, remarks, return_id,
          created_at, created_by, updated_at
        ) VALUES (
          ?, 'biz_default', 'branch_01', ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, 0, 0, 0, 0, ?, ?,
          0, 0, ?,
          1, 'DEALER_CREDIT', 'ISSUED', ?, ?,
          ?, ?, ?
        )
      `).run(
        debitNoteId,
        debitNoteNo,
        date,
        supplierId,
        purchase.id,
        purchase.invoice_no,
        purchase.date,
        input.reason,
        isNonGst ? "NON_GST" : "GST",
        amount,
        amount,
        amount,
        amount,
        `Generated from Purchase Return ${returnId}`,
        returnId,
        now,
        input.user || "Purchaser",
        now
      );

      const insertItemStmt = db.prepare(`
        INSERT INTO debit_note_items (
          id, debit_note_id, product_id, unit_id, imei, name, qty,
          rate, discount, taxable_amount, gst_rate, tax_amount, total, physical_return
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, 0, ?, 1)
      `);

      input.items.forEach((it, idx) => {
        let pId = it.productId;
        const pExists = db.prepare("SELECT id FROM products WHERE id = ?").get(pId);
        if (!pExists) {
          const pByName = db.prepare("SELECT id FROM products WHERE name = ? COLLATE NOCASE").get(it.name) as any;
          if (pByName) pId = pByName.id;
        }

        let uId = it.unitId || null;
        if (uId && !db.prepare("SELECT id FROM units WHERE id = ?").get(uId)) {
          uId = null;
        }
        if (!uId && it.imei) {
          const uByImei = db.prepare("SELECT id FROM units WHERE imei1 = ? OR imei2 = ?").get(it.imei, it.imei) as any;
          if (uByImei) uId = uByImei.id;
        }

        insertItemStmt.run(
          `${debitNoteId}_i_${idx}`,
          debitNoteId,
          pId,
          uId,
          it.imei || null,
          it.name,
          it.qty,
          it.price,
          it.price * it.qty,
          it.price * it.qty
        );
      });

      recordSupplierLedger(
        db,
        supplierId,
        "DEBIT_NOTE",
        debitNoteId,
        amount,
        0,
        `Debit Note ${debitNoteNo} for purchase return of ${purchase.invoice_no}`,
        undefined,
        undefined,
        debitNoteNo
      );
    } else {
      recordSupplierLedger(db, supplierId, "PURCHASE_RETURN", returnId, amount, 0, `Purchase return for ${purchase.invoice_no}`);
    }

    logAudit(db, {
      userId: input.user,
      userName: input.user || "Staff",
      action: "PURCHASE_RETURN",
      module: "RETURNS",
      recordId: returnId,
      newValue: { amount, invoiceNo: purchase.invoice_no },
      reason: input.reason,
    });

    db.exec("COMMIT;");

    return {
      id: returnId,
      type: "purchase",
      refId: input.purchaseId,
      refNo: purchase.invoice_no,
      date,
      partyId: supplierId,
      items: input.items,
      amount,
      reason: input.reason,
      condition: "DAMAGED",
      mode: "Credit Note",
      destination: "DEALER",
      dealerId: supplierId,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
