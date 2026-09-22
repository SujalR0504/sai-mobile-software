import { checkEmployeePermission } from "../services/permissionService";
import {
  applyDebitNote,
  cancelDebitNote,
  createDebitNote,
  getDebitNoteById,
  listDebitNotes,
  refundDebitNote,
} from "../services/debitNoteService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function debitNoteRoutes({
  request,
  url,
  pathname,
  method,
  db,
}: RouteContext): Promise<Response | null> {
  // Collection: /api/debit-notes
  if (pathname === "/api/debit-notes") {
    if (method === "GET") {
      const empId = request.headers.get("x-employee-id");
      if (empId) {
        const allowed = checkEmployeePermission(db, empId, "Debit Notes", "VIEW");
        if (!allowed) {
          return jsonResponse({ error: "Unauthorized: Missing DEBIT_NOTE_VIEW permission", success: false }, 403);
        }
      }

      const dealerId = url.searchParams.get("dealerId") || undefined;
      const purchaseId = url.searchParams.get("purchaseId") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const search = url.searchParams.get("search") || undefined;
      const dateFrom = url.searchParams.get("dateFrom") || undefined;
      const dateTo = url.searchParams.get("dateTo") || undefined;

      return jsonResponse(
        listDebitNotes(db, {
          dealerId,
          purchaseId,
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
        const allowed = checkEmployeePermission(db, empId, "Debit Notes", "CREATE");
        if (!allowed) {
          return jsonResponse({ error: "Permission denied: Missing DEBIT_NOTE_CREATE permission", success: false }, 403);
        }
      }

      try {
        const note = createDebitNote(db, body);
        return jsonResponse(note, 201);
      } catch (err: any) {
        return errorResponse(err.message || "Failed to create debit note", 400, "BAD_REQUEST");
      }
    }
  }

  // Apply Debit Note to purchase: /api/debit-notes/:id/apply
  const applyMatch = pathname.match(/^\/api\/debit-notes\/([^/]+)\/apply$/);
  if (applyMatch && method === "POST") {
    const id = applyMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Debit Notes", "ADJUST");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing DEBIT_NOTE_APPLY permission", success: false }, 403);
      }
    }

    try {
      const updated = applyDebitNote(db, id, body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to apply debit note", 400, "BAD_REQUEST");
    }
  }

  // Receive refund for Debit Note: /api/debit-notes/:id/refund
  const refundMatch = pathname.match(/^\/api\/debit-notes\/([^/]+)\/refund$/);
  if (refundMatch && method === "POST") {
    const id = refundMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Debit Notes", "REFUND");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing DEBIT_NOTE_REFUND permission", success: false }, 403);
      }
    }

    try {
      const updated = refundDebitNote(db, id, body);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to record dealer refund", 400, "BAD_REQUEST");
    }
  }

  // Cancel Debit Note: /api/debit-notes/:id/cancel
  const cancelMatch = pathname.match(/^\/api\/debit-notes\/([^/]+)\/cancel$/);
  if (cancelMatch && method === "POST") {
    const id = cancelMatch[1];
    const body = await request.json();
    const empId = body.employeeId || request.headers.get("x-employee-id");
    if (empId) {
      const allowed = checkEmployeePermission(db, empId, "Debit Notes", "CANCEL");
      if (!allowed) {
        return jsonResponse({ error: "Permission denied: Missing DEBIT_NOTE_CANCEL permission", success: false }, 403);
      }
    }

    try {
      const updated = cancelDebitNote(db, id, body.reason || "Cancelled by user", body.user);
      return jsonResponse(updated);
    } catch (err: any) {
      return errorResponse(err.message || "Failed to cancel debit note", 400, "BAD_REQUEST");
    }
  }

  // Single Debit Note: /api/debit-notes/:id
  const singleMatch = pathname.match(/^\/api\/debit-notes\/([^/]+)$/);
  if (singleMatch && method === "GET") {
    const id = singleMatch[1];
    const note = getDebitNoteById(db, id);
    if (!note) {
      return errorResponse("Debit Note not found", 404, "NOT_FOUND");
    }
    return jsonResponse(note);
  }

  return null;
}
