import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { LineItem, ReturnDoc } from "../../../shared/types";
import { getReturns } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordCustomerLedger, recordSupplierLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";

export interface RecordSaleReturnInput {
  saleId: string;
  items: LineItem[];
  reason: string;
  condition?: "GOOD" | "DAMAGED" | "UNDER_INSPECTION";
  mode: "Refund" | "Credit Note";
  user?: string;
}

export interface RecordPurchaseReturnInput {
  purchaseId: string;
  items: LineItem[];
  reason: string;
  user?: string;
}

export function recordSaleReturn(db: DatabaseSync, input: RecordSaleReturnInput): ReturnDoc {
  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(input.saleId) as any;
  if (!sale) throw new Error(`Sale invoice ${input.saleId} not found`);

  const originalItems = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(input.saleId) as any[];

  // Validate items were part of original sale
  for (const retItem of input.items) {
    const orig = originalItems.find((o) => o.product_id === retItem.productId);
    if (!orig) {
      throw new Error(`Product ${retItem.name} was not part of original invoice ${sale.invoice_no}`);
    }
    if (retItem.qty > orig.qty) {
      throw new Error(`Cannot return ${retItem.qty} of ${retItem.name}. Original sale had only ${orig.qty}`);
    }
  }

  const returnId = uid("ret");
  const date = todayISO();
  const amount = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const condition = input.condition || "GOOD";
  // Per spec: Returned mobile must not automatically become saleable!
  const unitStatus = condition === "GOOD" ? "RETURNED" : condition === "DAMAGED" ? "DAMAGED" : "UNDER_INSPECTION";

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertReturnStmt = db.prepare(`
      INSERT INTO returns (id, business_id, type, ref_id, ref_no, date, party_id, amount, reason, condition, mode)
      VALUES (?, 'biz_default', 'sale', ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertReturnStmt.run(
      returnId,
      input.saleId,
      sale.invoice_no,
      date,
      sale.customer_id,
      amount,
      input.reason,
      condition,
      input.mode
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
      insertReturnItemStmt.run(
        `${returnId}_i_${idx}`,
        returnId,
        item.productId,
        item.unitId ?? null,
        item.name,
        item.qty,
        item.price,
        item.gst || 0,
        item.costPrice || 0
      );

      if (item.unitId) {
        updateUnitStmt.run(unitStatus, item.unitId);
      } else if (condition === "GOOD") {
        db.prepare("UPDATE products SET qty = qty + ? WHERE id = ? AND tracked = 0").run(item.qty, item.productId);
      }

      recordStockMovement(db, {
        productId: item.productId,
        unitId: item.unitId,
        imei: item.imei,
        movementType: "SALE_RETURN",
        quantity: item.qty,
        costPerUnit: item.costPrice,
        referenceId: returnId,
        notes: `Customer return from invoice ${sale.invoice_no} (${condition})`,
        createdBy: input.user || "Cashier",
      });
    });

    // Update Customer Ledger
    if (input.mode === "Credit Note") {
      recordCustomerLedger(db, sale.customer_id, "CREDIT_ADJUSTMENT", returnId, 0, amount, `Credit Note for return against ${sale.invoice_no}`);
    } else {
      recordCustomerLedger(db, sale.customer_id, "REFUND", returnId, amount, 0, `Refund for return against ${sale.invoice_no}`);
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

    db.exec("COMMIT;");

    return {
      id: returnId,
      type: "sale",
      refId: input.saleId,
      refNo: sale.invoice_no,
      date,
      partyId: sale.customer_id,
      items: input.items,
      amount,
      reason: input.reason,
      condition,
      mode: input.mode,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function recordPurchaseReturn(db: DatabaseSync, input: RecordPurchaseReturnInput): ReturnDoc {
  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(input.purchaseId) as any;
  if (!purchase) throw new Error(`Purchase invoice ${input.purchaseId} not found`);

  const returnId = uid("ret");
  const date = todayISO();
  const amount = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertReturnStmt = db.prepare(`
      INSERT INTO returns (id, business_id, type, ref_id, ref_no, date, party_id, amount, reason, condition, mode)
      VALUES (?, 'biz_default', 'purchase', ?, ?, ?, ?, ?, ?, 'DAMAGED', 'Credit Note')
    `);
    insertReturnStmt.run(
      returnId,
      input.purchaseId,
      purchase.invoice_no,
      date,
      purchase.supplier_id,
      amount,
      input.reason
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
      WHERE id = ? AND tracked = 0
    `);

    input.items.forEach((item, idx) => {
      insertReturnItemStmt.run(
        `${returnId}_i_${idx}`,
        returnId,
        item.productId,
        item.unitId ?? null,
        item.name,
        item.qty,
        item.price,
        item.gst || 0,
        item.costPrice || 0
      );

      if (item.unitId) {
        updateUnitStmt.run(item.unitId);
      } else {
        deductStockStmt.run(item.qty, item.productId);
      }

      recordStockMovement(db, {
        productId: item.productId,
        unitId: item.unitId,
        imei: item.imei,
        movementType: "PURCHASE_RETURN",
        quantity: -item.qty,
        costPerUnit: item.costPrice,
        referenceId: returnId,
        notes: `Returned to supplier for bill ${purchase.invoice_no}`,
        createdBy: input.user || "Purchaser",
      });
    });

    // Update Supplier Ledger: Store gets credit/reduces payable
    recordSupplierLedger(db, purchase.supplier_id, "PURCHASE_RETURN", returnId, amount, 0, `Purchase return for ${purchase.invoice_no}`);

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
      partyId: purchase.supplier_id,
      items: input.items,
      amount,
      reason: input.reason,
      condition: "DAMAGED",
      mode: "Credit Note",
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}
