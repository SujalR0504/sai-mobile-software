import type { DatabaseSync } from "node:sqlite";
import type { Purchase, PurchaseAttachment } from "../../../shared/types";

export function getPurchases(db: DatabaseSync): Purchase[] {
  const purchases = db.prepare("SELECT * FROM purchases ORDER BY date DESC").all() as any[];
  return purchases.map((p) => {
    const items = db.prepare("SELECT * FROM purchase_items WHERE purchase_id = ?").all(p.id) as any[];

    return {
      id: p.id,
      purchaseType: (p.purchase_type as "GST" | "NON_GST") || "GST",
      supplierId: p.supplier_id,
      dealerId: p.supplier_id,
      invoiceNo: p.invoice_no,
      date: p.date,
      items: items.map((i) => ({
        productId: i.product_id,
        name: i.name,
        price: i.price,
        costPrice: i.cost_price,
        qty: i.qty,
        gst: i.gst,
        hsn: i.hsn ?? undefined,
        cgst: i.cgst ?? undefined,
        sgst: i.sgst ?? undefined,
        igst: i.igst ?? undefined,
        taxableAmount: i.taxable_amount ?? undefined,
      })),
      discount: p.discount,
      subtotal: p.subtotal,
      tax: p.tax,
      total: p.total,
      paid: p.paid,
      mode: p.mode,
      status: p.status || "RECEIVED",
      originalInvoiceNo: p.original_invoice_no ?? undefined,
      originalInvoiceDate: p.original_invoice_date ?? undefined,
      referenceNo: p.reference_no ?? undefined,
      poNumber: p.po_number ?? undefined,
      ewayBillNo: p.eway_bill_no ?? undefined,
      deliveryNoteNo: p.delivery_note_no ?? undefined,
      deliveryNoteDate: p.delivery_note_date ?? undefined,
      dispatchDocNo: p.dispatch_doc_no ?? undefined,
      dispatchDocDate: p.dispatch_doc_date ?? undefined,
      dispatchedThrough: p.dispatched_through ?? undefined,
      destination: p.destination ?? undefined,
      termsOfDelivery: p.terms_of_delivery ?? undefined,
      paymentTerms: p.payment_terms ?? undefined,
      dueDate: p.due_date ?? undefined,
      placeOfSupply: p.place_of_supply ?? undefined,
      stateCode: p.state_code ?? undefined,
      cgstTotal: p.cgst_total ?? 0,
      sgstTotal: p.sgst_total ?? 0,
      igstTotal: p.igst_total ?? 0,
      totalTaxable: p.total_taxable ?? p.subtotal,
      otherCharges: p.other_charges ?? 0,
      tdsApplicable: Boolean(p.tds_applicable),
      tdsSection: p.tds_section ?? undefined,
      tdsRate: p.tds_rate ?? 0,
      tdsAmount: p.tds_amount ?? 0,
      roundOff: p.round_off ?? 0,
      receivedBy: p.received_by ?? undefined,
      debitNoteRef: p.debit_note_ref ?? undefined,
      creditNoteRef: p.credit_note_ref ?? undefined,
      otherReferences: p.other_references ?? undefined,
    };
  });
}

export function getPurchaseAttachments(db: DatabaseSync, purchaseId: string): PurchaseAttachment[] {
  try {
    const rows = db.prepare("SELECT * FROM purchase_attachments WHERE purchase_id = ? ORDER BY created_at DESC").all(purchaseId) as any[];
    return rows.map((r) => ({
      id: r.id,
      purchaseId: r.purchase_id,
      fileName: r.file_name,
      fileType: r.file_type,
      fileSize: r.file_size,
      fileData: r.file_data,
      createdAt: r.created_at,
    }));
  } catch {
    return [];
  }
}

export function savePurchaseAttachment(db: DatabaseSync, att: PurchaseAttachment): void {
  try {
    db.prepare(`
      INSERT INTO purchase_attachments (id, purchase_id, file_name, file_type, file_size, file_data, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      att.id,
      att.purchaseId,
      att.fileName,
      att.fileType,
      att.fileSize || 0,
      att.fileData,
      att.createdAt
    );
  } catch (err) {
    console.error("Failed to save attachment:", err);
  }
}

export function deletePurchaseAttachment(db: DatabaseSync, id: string): void {
  try {
    db.prepare("DELETE FROM purchase_attachments WHERE id = ?").run(id);
  } catch (err) {
    console.error("Failed to delete attachment:", err);
  }
}
