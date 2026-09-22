import { checkEmployeePermission } from "../services/permissionService";
import {
  applyCreditNote,
  cancelCreditNote,
  createCreditNote,
  getCreditNoteById,
  listCreditNotes,
  refundCreditNote,
} from "../services/creditNoteService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function creditNoteRoutes({
  request,
  url,
  pathname,
  method,
  db,
}: RouteContext): Promise<Response | null> {
  // Collection: /api/credit-notes
  if (pathname === "/api/credit-notes") {
    if (method === "GET") {
      const empId = request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Credit Notes", "VIEW");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing CREDIT_NOTE_VIEW permission", success: false }, 403);
        }
      }

      const customerId = url.searchParams.get("customerId") || undefined;
      const saleId = url.searchParams.get("saleId") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const search = url.searchParams.get("search") || undefined;
      const dateFrom = url.searchParams.get("dateFrom") || undefined;
      const dateTo = url.searchParams.get("dateTo") || undefined;

      return jsonResponse(
        listCreditNotes(db, {
          customerId,
          saleId,
          status,
          search,
          dateFrom,
          dateTo,
        })
      );
    }

    if (method === "POST") {
      const body = await request.json();
      const empId = body.employeeId || request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Credit Notes", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Permission denied: Missing CREDIT_NOTE_CREATE permission", success: false }, 403);
        }
      }

      try {
        const note = createCreditNote(db, body);
        return jsonResponse(note, 201);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to create credit note", 400, "BAD_REQUEST");
      }
    }
  }

  // Apply Credit Note to invoice: /api/credit-notes/:id/apply
  const applyMatch = pathname.match(/^\/api\/credit-notes\/([^/]+)\/apply$/);
  if (applyMatch && method === "POST") {
    const id = applyMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Credit Notes", "ADJUST");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing CREDIT_NOTE_APPLY permission", success: false }, 403);
      }
    }

    try {
      const updated = applyCreditNote(db, id, body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to apply credit note", 400, "BAD_REQUEST");
    }
  }

  // Refund Credit Note: /api/credit-notes/:id/refund
  const refundMatch = pathname.match(/^\/api\/credit-notes\/([^/]+)\/refund$/);
  if (refundMatch && method === "POST") {
    const id = refundMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Credit Notes", "REFUND");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing CREDIT_NOTE_REFUND permission", success: false }, 403);
      }
    }

    try {
      const updated = refundCreditNote(db, id, body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to refund credit note", 400, "BAD_REQUEST");
    }
  }

  // Cancel Credit Note: /api/credit-notes/:id/cancel
  const cancelMatch = pathname.match(/^\/api\/credit-notes\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const id = cancelMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Credit Notes", "CANCEL");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing CREDIT_NOTE_CANCEL permission", success: false }, 403);
      }
    }

    try {
      const updated = cancelCreditNote(db, id, body.reason || "Cancelled by user", body.user);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to cancel credit note", 400, "BAD_REQUEST");
    }
  }

  // Single Credit Note: /api/credit-notes/:id
  const singleMatch = pathname.match(/^\/api\/credit-notes\/([^/]+)$/);
  if (singleMatch && method === "GET") {
    const id = singleMatch[1];
    const note = getCreditNoteById(db, id);
    if (!note) {
      return errorResponse("Credit Note not found", 404, "NOT_FOUND");
    }
    return jsonResponse(note);
  }

  return null;
}
