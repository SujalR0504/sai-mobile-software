import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { LineItem, PaymentMode, Purchase, PurchaseAttachment } from "../../../shared/types";
import { getPurchases } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordSupplierLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import {
  getDefaultCashAccount,
  getPaymentAccountById,
  recordAccountTransaction,
} from "./paymentAccountService";

export interface PurchaseAttachmentInput {
  fileName: string;
  fileType: string;
  fileSize?: number;
  fileData: string;
}

export interface CreatePurchaseInput {
  purchaseType?: "GST" | "NON_GST";
  supplierId?: string;
  dealerId?: string;
  invoiceNo?: string;
  date?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  referenceNo?: string;
  poNumber?: string;
  ewayBillNo?: string;
  deliveryNoteNo?: string;
  deliveryNoteDate?: string;
  dispatchDocNo?: string;
  dispatchDocDate?: string;
  dispatchedThrough?: string;
  destination?: string;
  termsOfDelivery?: string;
  paymentTerms?: string;
  dueDate?: string;
  placeOfSupply?: string;
  stateCode?: string;
  receivedBy?: string;
  debitNoteRef?: string;
  creditNoteRef?: string;
  otherReferences?: string;
  items: LineItem[];
  imeis?: Record<string, string[]>;
  discount?: number;
  otherCharges?: number;
  tdsApplicable?: boolean;
  tdsSection?: string;
  tdsRate?: number;
  tdsAmount?: number;
  roundOff?: number;
  paid?: number;
  mode?: PaymentMode;
  paymentAccountId?: string;
  purchaseMode?: string;
  allowDuplicate?: boolean;
  attachments?: PurchaseAttachmentInput[];
  user?: string;
}

export function generatePurchaseInvoiceNo(db: DatabaseSync): string {
  const currentYear = new Date().getFullYear();
  const rows = db.prepare("SELECT invoice_no FROM purchases").all() as { invoice_no: string }[];
  const nums = rows
    .map((r) => Number(r.invoice_no.replace(/\D/g, "")))
    .filter((n) => !Number.isNaN(n));
  const next = (nums.length ? Math.max(...nums) : 2040) + 1;
  return `PUR-${currentYear}-${next}`;
}

export function recordPurchase(db: DatabaseSync, input: CreatePurchaseInput): Purchase {
  if (!input.items || input.items.length === 0) {
    throw new Error("Purchase must contain at least one item");
  }

  const dealerId = input.dealerId || input.supplierId;
  if (!dealerId) {
    throw new Error("Dealer/Supplier ID is required");
  }

  // Validate Supplier / Dealer
  const dealer = db.prepare("SELECT id, name, gstin, state, state_code FROM suppliers WHERE id = ?").get(dealerId) as any;
  if (!dealer) {
    throw new Error(`Dealer '${dealerId}' not found`);
  }

  const purchaseType = input.purchaseType || "GST";
  const stateCode = input.stateCode || dealer.state_code || (dealer.gstin ? dealer.gstin.substring(0, 2) : "23");
  const isIntrastate = stateCode === "23";

  // Consolidate IMEIs per product
  const imeisByProduct: Record<string, string[]> = {};
  if (input.imeis) {
    for (const [prodId, list] of Object.entries(input.imeis)) {
      imeisByProduct[prodId] = list.map((s) => s.trim()).filter(Boolean);
    }
  }

  input.items.forEach((item) => {
    if (item.imeis && item.imeis.length > 0) {
      const existing = imeisByProduct[item.productId] || [];
      const combined = Array.from(new Set([...existing, ...item.imeis.map((s) => s.trim()).filter(Boolean)]));
      imeisByProduct[item.productId] = combined;
    } else if (item.imei && item.imei.trim()) {
      const existing = imeisByProduct[item.productId] || [];
      if (!existing.includes(item.imei.trim())) {
        existing.push(item.imei.trim());
      }
      imeisByProduct[item.productId] = existing;
    }
  });

  // Check for duplicates inside the current submission
  const allSubmissionImeis: string[] = [];
  for (const [prodId, list] of Object.entries(imeisByProduct)) {
    for (const imei of list) {
      if (allSubmissionImeis.includes(imei)) {
        throw new Error(`Duplicate IMEI in bill: '${imei}' appears more than once.`);
      }
      allSubmissionImeis.push(imei);
    }
  }

  // Check for duplicate IMEIs across existing units in the database
  for (const imei of allSubmissionImeis) {
    const existing = db.prepare("SELECT id, imei1, status FROM units WHERE imei1 = ? OR imei2 = ?").get(imei, imei) as any;
    if (existing) {
      throw new Error(`Duplicate IMEI detected! IMEI '${imei}' is already registered with status '${existing.status}'`);
    }
  }

  // Process 18-column line items
  const processedItems: LineItem[] = input.items.map((rawItem) => {
    const prod = db.prepare("SELECT id, name, tracked, purchase_price, selling_price, gst, hsn FROM products WHERE id = ?").get(rawItem.productId) as any;
    if (!prod) {
      throw new Error(`Product '${rawItem.productId}' not found`);
    }

    const qty = Math.max(1, rawItem.qty || 1);
    const itemImeis = imeisByProduct[rawItem.productId] || [];

    if (prod.tracked && itemImeis.length !== qty) {
      throw new Error(
        `Serialized product '${prod.name}' requires exactly ${qty} unique IMEI(s), but received ${itemImeis.length}.`
      );
    }

    const hsnSac = rawItem.hsnSac || prod.hsn || "85171300";
    const unit = rawItem.unit || "pcs";
    const gstRate = purchaseType === "NON_GST" ? 0 : (rawItem.gstRate !== undefined ? rawItem.gstRate : prod.gst || 18);

    const hasExplicitRateExcl = rawItem.rateExcludingTax !== undefined;
    let rateExcludingTax = rawItem.rateExcludingTax;
    let rateIncludingTax = rawItem.rateIncludingTax;

    let taxableAmount = 0;
    let discountAmount = 0;
    let cgstPct = 0;
    let cgstAmount = 0;
    let sgstPct = 0;
    let sgstAmount = 0;
    let igstPct = 0;
    let igstAmount = 0;
    let totalAmount = 0;
    const discountPct = Math.max(0, rawItem.discountPct || 0);

    if (hasExplicitRateExcl) {
      rateExcludingTax = Math.round(rateExcludingTax! * 100) / 100;
      rateIncludingTax = rateIncludingTax !== undefined
        ? Math.round(rateIncludingTax * 100) / 100
        : Math.round((gstRate > 0 ? rateExcludingTax * (1 + gstRate / 100) : rateExcludingTax) * 100) / 100;

      const grossAmount = rateExcludingTax * qty;
      discountAmount = rawItem.discountAmount !== undefined && rawItem.discountAmount > 0
        ? rawItem.discountAmount
        : Math.round((grossAmount * discountPct) / 100 * 100) / 100;

      taxableAmount = Math.max(0, Math.round((grossAmount - discountAmount) * 100) / 100);

      if (purchaseType === "GST" && gstRate > 0) {
        if (isIntrastate) {
          cgstPct = gstRate / 2;
          sgstPct = gstRate / 2;
          cgstAmount = Math.round(taxableAmount * (cgstPct / 100) * 100) / 100;
          sgstAmount = Math.round(taxableAmount * (sgstPct / 100) * 100) / 100;
        } else {
          igstPct = gstRate;
          igstAmount = Math.round(taxableAmount * (igstPct / 100) * 100) / 100;
        }
      }
      totalAmount = Math.round((taxableAmount + cgstAmount + sgstAmount + igstAmount) * 100) / 100;
    } else {
      // Legacy input or rate inclusive input
      const unitCost = rawItem.rateIncludingTax !== undefined
        ? rawItem.rateIncludingTax
        : (rawItem.costPrice || rawItem.price || prod.purchase_price || 0);

      rateIncludingTax = Math.round(unitCost * 100) / 100;
      rateExcludingTax = gstRate > 0
        ? Math.round((rateIncludingTax / (1 + gstRate / 100)) * 100) / 100
        : rateIncludingTax;

      const grossTotal = rateIncludingTax * qty;
      discountAmount = rawItem.discountAmount !== undefined && rawItem.discountAmount > 0
        ? rawItem.discountAmount
        : Math.round((grossTotal * discountPct) / 100 * 100) / 100;

      totalAmount = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);

      if (purchaseType === "GST" && gstRate > 0) {
        taxableAmount = Math.round((totalAmount / (1 + gstRate / 100)) * 100) / 100;
        const totalTaxOnLine = totalAmount - taxableAmount;
        if (isIntrastate) {
          cgstPct = gstRate / 2;
          sgstPct = gstRate / 2;
          cgstAmount = Math.round((totalTaxOnLine / 2) * 100) / 100;
          sgstAmount = Math.round((totalTaxOnLine - cgstAmount) * 100) / 100;
        } else {
          igstPct = gstRate;
          igstAmount = Math.round(totalTaxOnLine * 100) / 100;
        }
      } else {
        taxableAmount = totalAmount;
      }
    }

    return {
      productId: rawItem.productId,
      name: prod.name,
      qty,
      price: rateExcludingTax,
      costPrice: rateExcludingTax,
      gst: gstRate,
      hsnSac,
      unit,
      rateIncludingTax,
      rateExcludingTax,
      discountPct,
      discountAmount,
      taxableAmount,
      gstRate,
      cgstPct,
      cgstAmount,
      sgstPct,
      sgstAmount,
      igstPct,
      igstAmount,
      totalAmount,
      imeis: itemImeis,
      imei: itemImeis[0],
    };
  });

  const taxableValue = Math.round(processedItems.reduce((sum, i) => sum + (i.taxableAmount || 0), 0) * 100) / 100;
  const cgstAmount = Math.round(processedItems.reduce((sum, i) => sum + (i.cgstAmount || 0), 0) * 100) / 100;
  const sgstAmount = Math.round(processedItems.reduce((sum, i) => sum + (i.sgstAmount || 0), 0) * 100) / 100;
  const igstAmount = Math.round(processedItems.reduce((sum, i) => sum + (i.igstAmount || 0), 0) * 100) / 100;
  const totalTax = Math.round((cgstAmount + sgstAmount + igstAmount) * 100) / 100;

  const discount = Math.max(0, input.discount || 0);
  const otherCharges = Math.max(0, input.otherCharges || 0);
  const tdsApplicable = Boolean(input.tdsApplicable);
  const tdsSection = input.tdsSection || (tdsApplicable ? "TDS 194R" : undefined);
  const tdsRate = tdsApplicable ? (input.tdsRate || 10) : 0;
  const tdsAmount = tdsApplicable ? Math.round(((taxableValue * tdsRate) / 100) * 100) / 100 : 0;
  const roundOff = input.roundOff || 0;

  const rawTotal = taxableValue + totalTax + otherCharges - tdsAmount + roundOff;
  const total = Math.max(0, Math.round(rawTotal * 100) / 100);
  const paid = Math.max(0, Math.min(total, input.paid || 0));
  const dueAmount = Math.max(0, Math.round((total - paid) * 100) / 100);
  const mode = input.mode || "Credit";
  const initialStatus = dueAmount <= 0.01 ? "PAID" : paid > 0 ? "PARTIALLY PAID" : "UNPAID";

  const invoiceNo = input.invoiceNo?.trim() || generatePurchaseInvoiceNo(db);
  // Check duplicate invoice for this dealer
  const existingInv = db.prepare(
    "SELECT id, invoice_no FROM purchases WHERE supplier_id = ? AND LOWER(TRIM(invoice_no)) = LOWER(TRIM(?))"
  ).get(dealerId, invoiceNo) as any;
  if (existingInv && !input.allowDuplicate) {
    throw new Error(`Purchase invoice already exists for this dealer.`);
  }

  const purchaseId = uid("pur");
  const date = input.date || todayISO();

  db.exec("BEGIN TRANSACTION;");
  try {
    const insertPurchaseStmt = db.prepare(`
      INSERT INTO purchases (
        id, business_id, branch_id, invoice_no, purchase_type, date, supplier_id,
        original_invoice_no, original_invoice_date, reference_no, po_number, eway_bill_no,
        delivery_note_no, delivery_note_date, dispatch_doc_no, dispatch_doc_date,
        dispatched_through, destination, terms_of_delivery, payment_terms, due_date,
        place_of_supply, state_code, received_by, debit_note_ref, credit_note_ref,
        other_references, taxable_value, cgst_amount, sgst_amount, igst_amount,
        other_charges, tds_applicable, tds_section, tds_rate, tds_amount,
        round_off, discount, subtotal, tax, total, paid, due_amount, mode, status
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `);

    insertPurchaseStmt.run(
      purchaseId,
      invoiceNo,
      purchaseType,
      date,
      dealerId,
      input.originalInvoiceNo || null,
      input.originalInvoiceDate || null,
      input.referenceNo || null,
      input.poNumber || null,
      input.ewayBillNo || null,
      input.deliveryNoteNo || null,
      input.deliveryNoteDate || null,
      input.dispatchDocNo || null,
      input.dispatchDocDate || null,
      input.dispatchedThrough || null,
      input.destination || null,
      input.termsOfDelivery || null,
      input.paymentTerms || null,
      input.dueDate || null,
      input.placeOfSupply || (isIntrastate ? "Madhya Pradesh" : "Other"),
      stateCode,
      input.receivedBy || null,
      input.debitNoteRef || null,
      input.creditNoteRef || null,
      input.otherReferences || null,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      otherCharges,
      tdsApplicable ? 1 : 0,
      tdsSection || null,
      tdsRate,
      tdsAmount,
      roundOff,
      discount,
      taxableValue,
      totalTax,
      total,
      paid,
      dueAmount,
      mode,
      initialStatus
    );

    const insertPurchaseItemStmt = db.prepare(`
      INSERT INTO purchase_items (
        id, purchase_id, product_id, name, qty, price, gst, cost_price,
        hsn_sac, unit, rate_including_tax, rate_excluding_tax, discount_pct,
        discount_amount, taxable_amount, gst_rate, cgst_pct, cgst_amount,
        sgst_pct, sgst_amount, igst_pct, igst_amount, total_amount
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    const insertUnitStmt = db.prepare(`
      INSERT INTO units (id, business_id, branch_id, product_id, imei1, purchase_price, selling_price, status, purchase_id)
      VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, 'available', ?)
    `);

    const updateProductStmt = db.prepare(`
      UPDATE products
      SET qty = qty + ?, purchase_price = ?
      WHERE id = ? AND tracked = 0
    `);

    const updateTrackedPriceStmt = db.prepare(`
      UPDATE products
      SET purchase_price = ?
      WHERE id = ?
    `);

    processedItems.forEach((item, idx) => {
      insertPurchaseItemStmt.run(
        `${purchaseId}_i_${idx}`,
        purchaseId,
        item.productId,
        item.name,
        item.qty,
        item.price,
        item.gst,
        item.costPrice,
        item.hsnSac || "85171300",
        item.unit || "pcs",
        item.rateIncludingTax || item.price,
        item.rateExcludingTax || item.price,
        item.discountPct || 0,
        item.discountAmount || 0,
        item.taxableAmount || 0,
        item.gstRate || item.gst,
        item.cgstPct || 0,
        item.cgstAmount || 0,
        item.sgstPct || 0,
        item.sgstAmount || 0,
        item.igstPct || 0,
        item.igstAmount || 0,
        item.totalAmount || 0
      );

      const prod = db.prepare("SELECT tracked, selling_price FROM products WHERE id = ?").get(item.productId) as any;
      if (prod?.tracked) {
        updateTrackedPriceStmt.run(item.rateExcludingTax || item.price, item.productId);

        const itemImeis = item.imeis || [];
        itemImeis.forEach((imei) => {
          const unitId = uid("u");
          insertUnitStmt.run(unitId, item.productId, imei, item.rateExcludingTax || item.price, prod.selling_price, purchaseId);

          recordStockMovement(db, {
            productId: item.productId,
            unitId,
            imei,
            movementType: "PURCHASE",
            quantity: 1,
            costPerUnit: item.rateExcludingTax || item.price,
            referenceId: purchaseId,
            notes: `Inward Purchase Bill ${invoiceNo} (${purchaseType})`,
            createdBy: input.user || "Purchaser",
          });
        });
      } else {
        updateProductStmt.run(item.qty, item.rateExcludingTax || item.price, item.productId);

        recordStockMovement(db, {
          productId: item.productId,
          movementType: "PURCHASE",
          quantity: item.qty,
          costPerUnit: item.rateExcludingTax || item.price,
          referenceId: purchaseId,
          notes: `Inward Purchase Bill ${invoiceNo} (${purchaseType})`,
          createdBy: input.user || "Purchaser",
        });
      }
    });

    // Handle Attachments
    const attachments: PurchaseAttachment[] = [];
    if (input.attachments && input.attachments.length > 0) {
      const insertAttachStmt = db.prepare(`
        INSERT INTO purchase_attachments (id, purchase_id, file_name, file_type, file_size, file_data, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      input.attachments.forEach((att) => {
        const attId = uid("att");
        insertAttachStmt.run(attId, purchaseId, att.fileName, att.fileType, att.fileSize || 0, att.fileData, now);
        attachments.push({
          id: attId,
          purchaseId,
          fileName: att.fileName,
          fileType: att.fileType,
          fileSize: att.fileSize,
          fileData: att.fileData,
          createdAt: now,
        });
      });
    }

    // Handle Payment if paid > 0
    let resolvedAccountId = input.paymentAccountId;
    if (paid > 0) {
      if (!resolvedAccountId) {
        if (mode === "Cash") {
          resolvedAccountId = getDefaultCashAccount(db).id;
        } else if (mode === "UPI") {
          const upiAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = 'UPI' AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1").get() as any;
          if (upiAcct) resolvedAccountId = upiAcct.id;
        } else if (mode === "Bank") {
          const bankAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = 'BANK' AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1").get() as any;
          if (bankAcct) resolvedAccountId = bankAcct.id;
        }
      }

      const insertPaymentStmt = db.prepare(`
        INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, note, payment_account_id)
        VALUES (?, 'biz_default', 'branch_01', ?, 'supplier', ?, ?, ?, ?, ?, ?)
      `);
      insertPaymentStmt.run(
        uid("pay"),
        date,
        dealerId,
        purchaseId,
        paid,
        mode,
        `Payment for purchase invoice ${invoiceNo}`,
        resolvedAccountId || null
      );

      if (resolvedAccountId) {
        recordAccountTransaction(db, {
          accountId: resolvedAccountId,
          transactionType: "PURCHASE_PAYMENT",
          referenceType: "PURCHASE",
          referenceId: purchaseId,
          amount: paid,
          isCredit: false,
          paymentMethod: mode,
          date,
          description: `Purchase payment for invoice ${invoiceNo} to ${dealer.name}`,
          createdBy: input.user || "Purchaser",
        });
      }

      if (mode === "Cash") {
        recordCashbookEntry(db, "PURCHASE_PAYMENT_CASH", purchaseId, "Purchases", 0, paid, `Cash payment to dealer for ${invoiceNo}`);
      }
    }

    // Dealer Ledger Updates:
    // 1. Credit entry: Bill amount increases payable to Dealer
    recordSupplierLedger(db, dealerId, "PURCHASE", purchaseId, 0, total, `Purchase Invoice ${invoiceNo} (${purchaseType})`);
    // 2. Debit entry: Paid amount reduces payable
    if (paid > 0) {
      recordSupplierLedger(db, dealerId, "PAYMENT", purchaseId, paid, 0, `Payment for invoice ${invoiceNo}`, resolvedAccountId, mode);
    }

    // Log Audit
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Purchasing Team",
      action: "PURCHASE_CREATE",
      module: "PURCHASES",
      recordId: purchaseId,
      newValue: { invoiceNo, total, dealerName: dealer.name, purchaseType, dueAmount },
      reason: `Recorded ${purchaseType} dealer bill ${invoiceNo} for ${dealer.name}`,
    });

    db.exec("COMMIT;");

    return {
      id: purchaseId,
      invoiceNo,
      purchaseType,
      date,
      supplierId: dealerId,
      dealerId,
      items: processedItems,
      discount,
      subtotal: taxableValue,
      tax: totalTax,
      total,
      paid,
      dueAmount,
      mode,
      status: initialStatus,
      originalInvoiceNo: input.originalInvoiceNo,
      originalInvoiceDate: input.originalInvoiceDate,
      referenceNo: input.referenceNo,
      poNumber: input.poNumber,
      ewayBillNo: input.ewayBillNo,
      deliveryNoteNo: input.deliveryNoteNo,
      deliveryNoteDate: input.deliveryNoteDate,
      dispatchDocNo: input.dispatchDocNo,
      dispatchDocDate: input.dispatchDocDate,
      dispatchedThrough: input.dispatchedThrough,
      destination: input.destination,
      termsOfDelivery: input.termsOfDelivery,
      paymentTerms: input.paymentTerms,
      dueDate: input.dueDate,
      placeOfSupply: input.placeOfSupply || (isIntrastate ? "Madhya Pradesh" : "Other"),
      stateCode,
      receivedBy: input.receivedBy,
      debitNoteRef: input.debitNoteRef,
      creditNoteRef: input.creditNoteRef,
      otherReferences: input.otherReferences,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      otherCharges,
      tdsApplicable,
      tdsSection,
      tdsRate,
      tdsAmount,
      roundOff,
      paymentAccountId: resolvedAccountId,
      purchaseMode: input.purchaseMode,
      attachments,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function getPurchaseById(db: DatabaseSync, purchaseId: string): Purchase | null {
  const list = getPurchases(db);
  return list.find((p) => p.id === purchaseId) ?? null;
}

export function recordPurchasePayment(
  db: DatabaseSync,
  purchaseIdOrInput:
    | string
    | {
        purchaseId: string;
        amount: number;
        mode: string;
        paymentAccountId?: string;
        date?: string;
        referenceNo?: string;
        chequeNo?: string;
        bankName?: string;
        remarks?: string;
        user?: string;
        userName?: string;
      },
  maybeInput?: {
    amount: number;
    mode: string;
    paymentAccountId?: string;
    date?: string;
    referenceNo?: string;
    chequeNo?: string;
    bankName?: string;
    remarks?: string;
    user?: string;
    userName?: string;
  }
): { payment: PaymentEntry; purchase: Purchase } {
  let input: {
    purchaseId: string;
    amount: number;
    mode: string;
    paymentAccountId?: string;
    date?: string;
    referenceNo?: string;
    chequeNo?: string;
    bankName?: string;
    remarks?: string;
    user?: string;
    userName?: string;
  };

  if (typeof purchaseIdOrInput === "string") {
    input = {
      purchaseId: purchaseIdOrInput,
      amount: maybeInput?.amount || 0,
      mode: maybeInput?.mode || "Cash",
      paymentAccountId: maybeInput?.paymentAccountId,
      date: maybeInput?.date,
      referenceNo: maybeInput?.referenceNo,
      chequeNo: maybeInput?.chequeNo,
      bankName: maybeInput?.bankName,
      remarks: maybeInput?.remarks,
      user: maybeInput?.user || maybeInput?.userName,
      userName: maybeInput?.userName || maybeInput?.user,
    };
  } else {
    input = {
      ...purchaseIdOrInput,
      user: purchaseIdOrInput.user || purchaseIdOrInput.userName,
      userName: purchaseIdOrInput.userName || purchaseIdOrInput.user,
    };
  }

  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(input.purchaseId) as any;
  if (!purchase) {
    throw new Error(`Purchase with ID ${input.purchaseId} not found`);
  }

  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  // Calculate current payments made against this purchase
  const paymentsRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_paid
    FROM payments
    WHERE ref_id = ? AND party = 'supplier'
  `).get(input.purchaseId) as { total_paid: number };

  const currentPaid = paymentsRow?.total_paid || 0;
  const currentOutstanding = Math.max(0, purchase.total - currentPaid);

  if (input.amount > currentOutstanding + 0.01) {
    throw new Error(`Payment amount (₹${input.amount}) cannot exceed outstanding balance of ₹${currentOutstanding.toFixed(2)}`);
  }

  const paymentId = uid("pay");
  const date = input.date || todayISO();
  const now = new Date().toISOString();

  let resolvedAccountId = input.paymentAccountId;
  if (!resolvedAccountId) {
    if (input.mode === "Cash") {
      resolvedAccountId = getDefaultCashAccount(db).id;
    } else if (input.mode === "UPI") {
      const upiAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = 'UPI' AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1").get() as any;
      if (upiAcct) resolvedAccountId = upiAcct.id;
    } else if (input.mode === "Bank") {
      const bankAcct = db.prepare("SELECT id FROM payment_accounts WHERE account_type = 'BANK' AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1").get() as any;
      if (bankAcct) resolvedAccountId = bankAcct.id;
    }
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert into payments table
    const insertPaymentStmt = db.prepare(`
      INSERT INTO payments (
        id, business_id, branch_id, date, party, party_id, ref_id,
        amount, mode, note, reference_no, cheque_no, bank_name, user_id, user_name, created_at, payment_account_id
      )
      VALUES (?, 'biz_default', 'branch_01', ?, 'supplier', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertPaymentStmt.run(
      paymentId,
      date,
      purchase.supplier_id,
      input.purchaseId,
      input.amount,
      input.mode,
      input.remarks || `Payment for invoice ${purchase.invoice_no}`,
      input.referenceNo ?? null,
      input.chequeNo ?? null,
      input.bankName ?? null,
      input.user ?? "system",
      input.userName ?? input.user ?? "System",
      now,
      resolvedAccountId ?? null
    );

    // 2. Recalculate total paid & due
    const newTotalPaid = currentPaid + input.amount;
    const newDueAmount = Math.max(0, purchase.total - newTotalPaid);
    const newStatus = newDueAmount <= 0.01 ? "PAID" : newTotalPaid > 0 ? "PARTIALLY PAID" : "UNPAID";

    db.prepare(`
      UPDATE purchases
      SET paid = ?, due_amount = ?, status = ?
      WHERE id = ?
    `).run(newTotalPaid, newDueAmount, newStatus, input.purchaseId);

    // 3. Record in Account Transaction if account linked
    if (resolvedAccountId) {
      recordAccountTransaction(db, {
        accountId: resolvedAccountId,
        transactionType: "PURCHASE_PAYMENT",
        referenceType: "PURCHASE",
        referenceId: input.purchaseId,
        amount: input.amount,
        isCredit: false,
        paymentMethod: input.mode,
        date,
        description: `Payment for purchase invoice ${purchase.invoice_no} to dealer`,
        createdBy: input.user || "User",
      });
    }

    // 4. Record in Dealer Ledger
    recordSupplierLedger(
      db,
      purchase.supplier_id,
      "PAYMENT",
      input.purchaseId,
      input.amount,
      0,
      `Payment for invoice ${purchase.invoice_no} (${input.mode}${input.referenceNo ? ` - Ref: ${input.referenceNo}` : ""})`,
      resolvedAccountId,
      input.mode,
      input.referenceNo
    );

    // 4. Record Cashbook if Cash
    if (input.mode === "Cash") {
      recordCashbookEntry(
        db,
        "PURCHASE_PAYMENT_CASH",
        input.purchaseId,
        "Purchases",
        0,
        input.amount,
        `Cash payment to dealer for ${purchase.invoice_no}`
      );
    }

    // 5. Audit log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "User",
      action: "PURCHASE_PAYMENT_CREATE",
      module: "PURCHASES",
      recordId: paymentId,
      newValue: {
        purchaseId: input.purchaseId,
        invoiceNo: purchase.invoice_no,
        amount: input.amount,
        mode: input.mode,
        referenceNo: input.referenceNo,
        newTotalPaid,
        newDueAmount,
        status: newStatus,
      },
      reason: `Recorded payment ₹${input.amount} for purchase ${purchase.invoice_no}`,
    });

    db.exec("COMMIT;");

    const updatedPurchase = getPurchaseById(db, input.purchaseId)!;
    const createdPayment: PaymentEntry = {
      id: paymentId,
      businessId: "biz_default",
      branchId: "branch_01",
      date,
      party: "supplier",
      partyId: purchase.supplier_id,
      refId: input.purchaseId,
      amount: input.amount,
      mode: input.mode,
      note: input.remarks,
      referenceNo: input.referenceNo,
      chequeNo: input.chequeNo,
      bankName: input.bankName,
      userId: input.user,
      userName: input.user,
      createdAt: now,
    };

    return { payment: createdPayment, purchase: updatedPurchase };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getPurchasePayments(db: DatabaseSync, purchaseId: string): PaymentEntry[] {
  const rows = db.prepare(`
    SELECT id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, note,
           reference_no, cheque_no, bank_name, user_id, user_name, created_at
    FROM payments
    WHERE ref_id = ? AND party = 'supplier'
    ORDER BY date DESC, created_at DESC, rowid DESC
  `).all(purchaseId) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    date: r.date,
    party: r.party,
    partyId: r.party_id,
    refId: r.ref_id,
    amount: r.amount,
    mode: r.mode,
    note: r.note,
    referenceNo: r.reference_no,
    chequeNo: r.cheque_no,
    bankName: r.bank_name,
    userId: r.user_id,
    userName: r.user_name,
    createdAt: r.created_at,
  }));
}

export function deletePurchasePayment(
  db: DatabaseSync,
  arg1: string,
  arg2?: string,
  arg3?: string
): { success: boolean; purchaseId: string; purchase: Purchase } {
  let paymentId = arg1;
  let user = arg2;
  if (arg2 && (arg2.startsWith("pay") || arg1.startsWith("pur"))) {
    paymentId = arg2;
    user = arg3;
  }

  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(paymentId) as any;
  if (!payment) {
    throw new Error(`Payment with ID ${paymentId} not found`);
  }

  const purchaseId = payment.ref_id;
  const purchase = db.prepare("SELECT * FROM purchases WHERE id = ?").get(purchaseId) as any;
  if (!purchase) {
    throw new Error(`Associated purchase ${purchaseId} not found`);
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    // Delete payment
    db.prepare("DELETE FROM payments WHERE id = ?").run(paymentId);

    // Recalculate remaining payments for this purchase
    const paymentsRow = db.prepare(`
      SELECT COALESCE(SUM(amount), 0) as total_paid
      FROM payments
      WHERE ref_id = ? AND party = 'supplier'
    `).get(purchaseId) as { total_paid: number };

    const newTotalPaid = paymentsRow?.total_paid || 0;
    const newDueAmount = Math.max(0, purchase.total - newTotalPaid);
    const newStatus = newDueAmount <= 0.01 ? "PAID" : newTotalPaid > 0 ? "PARTIALLY PAID" : "UNPAID";

    db.prepare(`
      UPDATE purchases
      SET paid = ?, due_amount = ?, status = ?
      WHERE id = ?
    `).run(newTotalPaid, newDueAmount, newStatus, purchaseId);

    // Reverse in Dealer Ledger
    recordSupplierLedger(
      db,
      payment.party_id,
      "PAYMENT",
      purchaseId,
      0,
      payment.amount,
      `Reversal of payment for invoice ${purchase.invoice_no}`
    );

    // Reverse Payment Account if account was linked
    if (payment.payment_account_id) {
      recordAccountTransaction(db, {
        accountId: payment.payment_account_id,
        transactionType: "ADJUSTMENT",
        referenceType: "PURCHASE_PAYMENT_REVERSAL",
        referenceId: paymentId,
        amount: payment.amount,
        isCredit: true,
        paymentMethod: payment.mode,
        description: `Reversal of payment for invoice ${purchase.invoice_no}`,
        createdBy: user || "System",
      });
    }

    // Audit log
    logAudit(db, {
      userId: user,
      userName: user || "User",
      action: "PURCHASE_PAYMENT_DELETE",
      module: "PURCHASES",
      recordId: paymentId,
      oldValue: payment,
      reason: `Deleted payment of ₹${payment.amount} for purchase ${purchase.invoice_no}`,
    });

    db.exec("COMMIT;");
    const updatedPurchase = getPurchaseById(db, purchaseId)!;
    return { success: true, purchaseId, purchase: updatedPurchase };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
