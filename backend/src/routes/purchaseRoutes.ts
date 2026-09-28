import {
  deletePurchaseAttachment,
  getPurchaseAttachments,
  getPurchases,
  savePurchaseAttachment,
} from "../repositories/repository";
import { uid } from "../../../shared/utils/format";
import { extractInvoiceData } from "../services/invoiceExtractionService";
import {
  deletePurchasePayment,
  getPurchaseById,
  getPurchasePayments,
  recordPurchase,
  recordPurchasePayment,
} from "../services/purchaseService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function purchaseRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Check Duplicate Invoice
  if (pathname === "/api/purchases/check-duplicate" && method === "GET") {
    const dealerId = url.searchParams.get("dealerId") || url.searchParams.get("supplierId");
    const invoiceNo = url.searchParams.get("invoiceNo");
    if (!dealerId || !invoiceNo) {
      return jsonResponse({ exists: false });
    }
    const existing = db.prepare(
      "SELECT id, invoice_no, date, total, status FROM purchases WHERE supplier_id = ? AND LOWER(TRIM(invoice_no)) = LOWER(TRIM(?))"
    ).get(dealerId, invoiceNo.trim()) as any;
    return jsonResponse({ exists: Boolean(existing), purchase: existing || null });
  }

  // Invoice Extraction
  if (pathname === "/api/purchases/extract-invoice" && method === "POST") {
    const body = await request.json();
    return jsonResponse(extractInvoiceData(db, body));
  }

  // Purchases list and record purchase
  if (pathname === "/api/purchases") {
    if (method === "GET") return jsonResponse(getPurchases(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(recordPurchase(db, body), 201);
    }
  }

  // Purchase Attachments
  const purchaseAttachmentsMatch = pathname.match(/^\/api\/purchases\/([^/]+)\/attachments$/);
  if (purchaseAttachmentsMatch) {
    const purchaseId = purchaseAttachmentsMatch[1];
    if (method === "GET") {
      return jsonResponse(getPurchaseAttachments(db, purchaseId));
    }
    if (method === "POST") {
      const body = await request.json();
      const attId = uid("att");
      savePurchaseAttachment(db, {
        id: attId,
        purchaseId,
        fileName: body.fileName || "attachment",
        fileType: body.fileType || "application/octet-stream",
        fileSize: body.fileSize || 0,
        fileData: body.fileData || "",
        createdAt: new Date().toISOString(),
      });
      return jsonResponse({ success: true, id: attId }, 201);
    }
  }

  const attachmentDeleteMatch = pathname.match(/^\/api\/purchases\/attachments\/([^/]+)$/);
  if (attachmentDeleteMatch && method === "DELETE") {
    const id = attachmentDeleteMatch[1];
    deletePurchaseAttachment(db, id);
    return jsonResponse({ success: true, id });
  }

  // Purchase Payments
  const purchasePaymentsMatch = pathname.match(/^\/api\/purchases\/([^/]+)\/payments$/);
  if (purchasePaymentsMatch) {
    const purchaseId = purchasePaymentsMatch[1];
    if (method === "GET") {
      return jsonResponse(getPurchasePayments(db, purchaseId));
    }
    if (method === "POST") {
      const body = await request.json();
      const result = recordPurchasePayment(db, {
        purchaseId,
        amount: Number(body.amount),
        date: body.date,
        mode: body.mode,
        paymentAccountId: body.paymentAccountId || body.accountId,
        referenceNo: body.referenceNo,
        chequeNo: body.chequeNo,
        bankName: body.bankName,
        remarks: body.remarks || body.note,
        user: body.user,
      });
      return jsonResponse(result, 201);
    }
  }

  const purchasePaymentDeleteMatch = pathname.match(/^\/api\/purchases\/([^/]+)\/payments\/([^/]+)$/);
  if (purchasePaymentDeleteMatch && method === "DELETE") {
    const paymentId = purchasePaymentDeleteMatch[2];
    const result = deletePurchasePayment(db, paymentId);
    return jsonResponse(result);
  }

  // Single Purchase
  const purchaseMatch = pathname.match(/^\/api\/purchases\/([^/]+)$/);
  if (purchaseMatch && method === "GET") {
    const id = purchaseMatch[1];
    const purchase = getPurchaseById(db, id);
    if (!purchase) return errorResponse("Purchase not found", 404, "NOT_FOUND");
    return jsonResponse(purchase);
  }

  return null;
}
