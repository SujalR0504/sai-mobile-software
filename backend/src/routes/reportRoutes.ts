import {
  getCategoryStockReport,
  getCreditNotesReport,
  getCustomerCreditBalanceReport,
  getDashboardKPIs,
  getDealerCreditBalanceReport,
  getDealerReport,
  getDebitNotesReport,
  getEMIReport,
  getInventoryValuation,
  getImeiWiseReport,
  getItemWiseReport,
  getProductStockLedger,
} from "../services/reportService";
import { jsonResponse, type RouteContext } from "./types";

export async function reportRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Dashboard & Valuation
  if (pathname === "/api/dashboard" && method === "GET") {
    return jsonResponse(getDashboardKPIs(db));
  }

  if (pathname === "/api/valuation" && method === "GET") {
    return jsonResponse(getInventoryValuation(db));
  }

  // Reports
  if (pathname === "/api/reports/emi" && method === "GET") {
    return jsonResponse(getEMIReport(db));
  }

  if (pathname === "/api/reports/dealers" && method === "GET") {
    return jsonResponse(getDealerReport(db));
  }

  if (pathname === "/api/reports/categories" && method === "GET") {
    return jsonResponse(getCategoryStockReport(db));
  }

  if (pathname === "/api/reports/item-wise" && method === "GET") {
    const filters = {
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      category: url.searchParams.get("category") || undefined,
      subcategory: url.searchParams.get("subcategory") || undefined,
      brand: url.searchParams.get("brand") || undefined,
      model: url.searchParams.get("model") || undefined,
      productId: url.searchParams.get("productId") || undefined,
      sku: url.searchParams.get("sku") || undefined,
      barcode: url.searchParams.get("barcode") || undefined,
      dealerId: url.searchParams.get("dealerId") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      gstType: url.searchParams.get("gstType") || undefined,
      transactionType: url.searchParams.get("transactionType") || undefined,
    };
    return jsonResponse(getItemWiseReport(db, filters));
  }

  const itemDrilldownMatch = pathname.match(/^\/api\/reports\/item-wise\/([^/]+)\/drilldown$/);
  if (itemDrilldownMatch && method === "GET") {
    const productId = itemDrilldownMatch[1];
    return jsonResponse(getProductStockLedger(db, productId));
  }

  if (pathname === "/api/reports/imei-wise" && method === "GET") {
    const filters = {
      imei: url.searchParams.get("imei") || undefined,
      search: url.searchParams.get("search") || undefined,
      brand: url.searchParams.get("brand") || undefined,
      model: url.searchParams.get("model") || undefined,
      status: url.searchParams.get("status") || undefined,
    };
    return jsonResponse(getImeiWiseReport(db, filters));
  }

  // Credit Note Report
  if (pathname === "/api/reports/credit-notes" && method === "GET") {
    const filters = {
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      status: url.searchParams.get("status") || undefined,
    };
    return jsonResponse(getCreditNotesReport(db, filters));
  }

  // Debit Note Report
  if (pathname === "/api/reports/debit-notes" && method === "GET") {
    const filters = {
      dateFrom: url.searchParams.get("dateFrom") || undefined,
      dateTo: url.searchParams.get("dateTo") || undefined,
      dealerId: url.searchParams.get("dealerId") || undefined,
      status: url.searchParams.get("status") || undefined,
    };
    return jsonResponse(getDebitNotesReport(db, filters));
  }

  // Customer Credit Balance Report
  if (pathname === "/api/reports/customer-credit-balance" && method === "GET") {
    return jsonResponse(getCustomerCreditBalanceReport(db));
  }

  // Dealer Credit Balance Report
  if (pathname === "/api/reports/dealer-credit-balance" && method === "GET") {
    return jsonResponse(getDealerCreditBalanceReport(db));
  }

  return null;
}
