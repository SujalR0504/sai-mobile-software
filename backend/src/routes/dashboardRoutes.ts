import {
  getDashboardSummary,
  getDailyStockMovement,
  getItemWiseDailyMovement,
  getCategoryStock,
  getBrandStock,
  getLowStockProducts,
  getOutOfStockProducts,
  getTopSellingProducts,
  getRecentTransactions,
  getRecentBills,
  getCustomerDueSummary,
  getEMISummary,
  getRepairSummary,
  getDailySales,
  getOldStock,
  getNewStock,
} from "../services/dashboardService";
import { jsonResponse, type RouteContext } from "./types";

export async function dashboardRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  if (!pathname.startsWith("/api/dashboard")) {
    return null;
  }

  // 1. Consolidated Dashboard Data (Ultra-fast single roundtrip)
  if (pathname === "/api/dashboard/all" && method === "GET") {
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    const topRange = (url.searchParams.get("topRange") as "today" | "7d" | "30d") || "7d";

    const summary = getDashboardSummary(db, { dateFrom, dateTo });
    const stockMovement = getDailyStockMovement(db, { dateFrom, dateTo });
    const itemWiseMovement = getItemWiseDailyMovement(db, { dateFrom, dateTo });
    const categoryStock = getCategoryStock(db);
    const brandStock = getBrandStock(db);
    const lowStock = getLowStockProducts(db);
    const outOfStock = getOutOfStockProducts(db);
    const topSelling = getTopSellingProducts(db, topRange);
    const recentTransactions = getRecentTransactions(db, 10);
    const recentBills = getRecentBills(db, 10);
    const customerDue = getCustomerDueSummary(db);
    const emi = getEMISummary(db);
    const repairs = getRepairSummary(db);

    return jsonResponse({
      summary,
      stockMovement,
      itemWiseMovement,
      categoryStock,
      brandStock,
      lowStock,
      outOfStock,
      topSelling,
      recentTransactions,
      recentBills,
      customerDue,
      emi,
      repairs,
    });
  }

  // 2. Summary
  if (pathname === "/api/dashboard/summary" && method === "GET") {
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    return jsonResponse(getDashboardSummary(db, { dateFrom, dateTo }));
  }

  // 3. Stock Movement Chart Data
  if (pathname === "/api/dashboard/stock-movement" && method === "GET") {
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    return jsonResponse(getDailyStockMovement(db, { dateFrom, dateTo }));
  }

  // 4. Item-Wise Daily Movement Table
  if (pathname === "/api/dashboard/item-wise-movement" && method === "GET") {
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    return jsonResponse(getItemWiseDailyMovement(db, { dateFrom, dateTo }));
  }

  // 5. Category Stock
  if (pathname === "/api/dashboard/category-stock" && method === "GET") {
    return jsonResponse(getCategoryStock(db));
  }

  // 6. Brand Stock
  if (pathname === "/api/dashboard/brand-stock" && method === "GET") {
    return jsonResponse(getBrandStock(db));
  }

  // 7. Low Stock
  if (pathname === "/api/dashboard/low-stock" && method === "GET") {
    return jsonResponse(getLowStockProducts(db));
  }

  // 8. Out of Stock
  if (pathname === "/api/dashboard/out-of-stock" && method === "GET") {
    return jsonResponse(getOutOfStockProducts(db));
  }

  // 9. Top Selling Products
  if (pathname === "/api/dashboard/top-selling" && method === "GET") {
    const range = (url.searchParams.get("range") as "today" | "7d" | "30d") || "7d";
    return jsonResponse(getTopSellingProducts(db, range));
  }

  // 10. Recent Transactions
  if (pathname === "/api/dashboard/recent-transactions" && method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 10;
    return jsonResponse(getRecentTransactions(db, limit));
  }

  // 11. Recent Bills
  if (pathname === "/api/dashboard/recent-bills" && method === "GET") {
    const limit = Number(url.searchParams.get("limit")) || 10;
    return jsonResponse(getRecentBills(db, limit));
  }

  // 12. Customer Due Summary
  if (pathname === "/api/dashboard/customer-due" && method === "GET") {
    return jsonResponse(getCustomerDueSummary(db));
  }

  // 13. EMI Summary
  if (pathname === "/api/dashboard/emi" && method === "GET") {
    return jsonResponse(getEMISummary(db));
  }

  // 14. Repairs Summary
  if (pathname === "/api/dashboard/repairs" && method === "GET") {
    return jsonResponse(getRepairSummary(db));
  }

  // 15. Daily Sales
  if (pathname === "/api/dashboard/daily-sales" && method === "GET") {
    const dateFrom = url.searchParams.get("dateFrom") || undefined;
    const dateTo = url.searchParams.get("dateTo") || undefined;
    return jsonResponse(getDailySales(db, { dateFrom, dateTo }));
  }

  // 16. Old Stock
  if (pathname === "/api/dashboard/old-stock" && method === "GET") {
    return jsonResponse(getOldStock(db));
  }

  // 17. New Stock
  if (pathname === "/api/dashboard/new-stock" && method === "GET") {
    return jsonResponse(getNewStock(db));
  }

  return null;
}
