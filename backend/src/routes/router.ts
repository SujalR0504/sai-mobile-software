import { getDB } from "../../../database/client";
import { auditRoutes } from "./auditRoutes";
import { authRoutes } from "./authRoutes";
import { categoryRoutes } from "./categoryRoutes";
import { customerRoutes } from "./customerRoutes";
import { dealerRoutes } from "./dealerRoutes";
import { emiRoutes } from "./emiRoutes";
import { hrRoutes } from "./hrRoutes";
import { imeiRoutes } from "./imeiRoutes";
import { invoiceRoutes } from "./invoiceRoutes";
import { permissionRoutes } from "./permissionRoutes";
import { productRoutes } from "./productRoutes";
import { purchaseRoutes } from "./purchaseRoutes";
import { repairRoutes } from "./repairRoutes";
import { reportRoutes } from "./reportRoutes";
import { returnRoutes } from "./returnRoutes";
import { salesRoutes } from "./salesRoutes";
import { settingsRoutes } from "./settingsRoutes";
import { stockRoutes } from "./stockRoutes";
import { orderRoutes } from "./orderRoutes";
import { paymentAccountRoutes } from "./paymentAccountRoutes";
import { cloudRoutes } from "./cloudRoutes";
import { creditNoteRoutes } from "./creditNoteRoutes";
import { debitNoteRoutes } from "./debitNoteRoutes";
import { dashboardRoutes } from "./dashboardRoutes";
import { errorResponse, type RouteContext, type RouteHandler } from "./types";

const routeHandlers: RouteHandler[] = [
  dashboardRoutes,
  creditNoteRoutes,
  debitNoteRoutes,
  cloudRoutes,
  orderRoutes,
  paymentAccountRoutes,
  settingsRoutes,
  authRoutes,
  productRoutes,
  categoryRoutes,
  purchaseRoutes,
  salesRoutes,
  stockRoutes,
  imeiRoutes,
  customerRoutes,
  dealerRoutes,
  emiRoutes,
  repairRoutes,
  hrRoutes,
  permissionRoutes,
  reportRoutes,
  invoiceRoutes,
  returnRoutes,
  auditRoutes,
];

/**
 * Top-level API Dispatcher.
 * Intercepts /api/* requests and delegates to modular domain route controllers.
 */
export async function handleApiRequest(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, x-employee-id",
      },
    });
  }

  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/$/, "");
  const method = request.method.toUpperCase();
  const db = getDB();

  const ctx: RouteContext = {
    request,
    url,
    pathname,
    method,
    db,
  };

  try {
    for (const handler of routeHandlers) {
      const response = await handler(ctx);
      if (response !== null) {
        return response;
      }
    }

    return errorResponse(`Endpoint '${pathname}' not found`, 404, "NOT_FOUND");
  } catch (err: any) {
    console.error(`API Error [${method} ${pathname}]:`, err);
    return errorResponse(err?.message || "Internal server error", 400, "SERVER_ERROR");
  }
}
