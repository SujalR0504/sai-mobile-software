import type { DatabaseSync } from "node:sqlite";
import { todayISO } from "../../../shared/utils/format";
import { getCustomers, getFullDB, getProducts, getSales, getSettings, getUnits } from "../repositories/repository";
import { getCustomerDue } from "./duesAndPaymentsService";
import { getLowStockProducts } from "./stockService";

export interface DashboardKPIs {
  today: string;
  salesTotal: number;
  salesCount: number;
  purchaseTotal: number;
  purchaseCount: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  operatingExpenses: number;
  netProfit: number;
  margin: string;
  cashInHand: number;
  totalDue: number;
  dueCustomersCount: number;
  lowStockCount: number;
  pendingRepairsCount: number;
  readyRepairsCount: number;
  presentEmployeesCount: number;
  absentEmployeesCount: number;
  avgBill: number;
  emiPendingReceivable: number;
  emiPendingCount: number;
}

export function getDashboardKPIs(db: DatabaseSync): DashboardKPIs {
  const today = todayISO();
  const dbData = getFullDB(db);

  const salesToday = dbData.sales.filter((s) => s.date === today && !s.quotation && s.status !== "VOID");
  const purchasesToday = dbData.purchases.filter((p) => p.date === today && p.status !== "VOID");
  const expensesToday = dbData.expenses.filter((e) => e.date === today);
  const returnsToday = dbData.returns.filter((r) => r.date === today && r.type === "sale");

  const salesTotal = salesToday.reduce((a, s) => a + s.total, 0);
  const returnsTotal = returnsToday.reduce((a, r) => a + r.amount, 0);
  const purchaseTotal = purchasesToday.reduce((a, p) => a + p.total, 0);

  // Specification: Net Sales = Sales - Sale Returns
  const netSales = salesTotal - returnsTotal;

  // Specification: COGS = Actual Cost of Sold Inventory
  const cogs = salesToday.reduce((sum, s) => {
    return sum + s.items.reduce((itemSum, item) => itemSum + item.costPrice * item.qty, 0);
  }, 0);

  // Specification: Gross Profit = Net Sales - COGS
  const grossProfit = Math.max(0, netSales - cogs);

  // Operating Expenses
  const operatingExpenses = expensesToday.reduce((a, e) => a + e.amount, 0);

  // Specification: Net Profit = Gross Profit - Operating Expenses
  const netProfit = grossProfit - operatingExpenses;

  // Cash In Hand calculation
  const cashIn = dbData.payments
    .filter((p) => p.party === "customer" && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);

  const cashOut = dbData.payments
    .filter((p) => (p.party === "supplier" || p.party === "dealer") && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);

  const allExpenses = dbData.expenses.reduce((a, e) => a + e.amount, 0);
  const cashInHand = dbData.settings.openingCash + cashIn - cashOut - allExpenses;

  // Customer Dues
  const customers = getCustomers(db);
  let totalDue = 0;
  let dueCustomersCount = 0;
  for (const c of customers) {
    const due = getCustomerDue(db, c.id);
    if (due > 0) {
      totalDue += due;
      dueCustomersCount += 1;
    }
  }

  // EMI Pending metrics
  const emiRows = db.prepare(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(net_receivable - received_amount), 0) as pending_total
    FROM emi_receivables
    WHERE status != 'RECEIVED' AND status != 'CANCELLED'
  `).get() as { count: number; pending_total: number } | undefined;

  const emiPendingReceivable = emiRows?.pending_total || 0;
  const emiPendingCount = emiRows?.count || 0;

  const lowStock = getLowStockProducts(db);
  const pendingRepairs = dbData.repairs.filter((r) => r.status !== "DELIVERED" && r.status !== "Delivered");
  const readyRepairs = pendingRepairs.filter((r) => r.status === "READY" || r.status === "Ready").length;

  const attendanceToday = dbData.attendance.filter((a) => a.date === today);
  const presentEmployeesCount = attendanceToday.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const absentEmployeesCount = Math.max(0, dbData.employees.length - presentEmployeesCount);

  const margin = netSales > 0 ? ((grossProfit / netSales) * 100).toFixed(1) : "0.0";
  const avgBill = salesToday.length ? Math.round(salesTotal / salesToday.length) : 0;

  return {
    today,
    salesTotal,
    salesCount: salesToday.length,
    purchaseTotal,
    purchaseCount: purchasesToday.length,
    netSales,
    cogs,
    grossProfit,
    operatingExpenses,
    netProfit,
    margin,
    cashInHand,
    totalDue,
    dueCustomersCount,
    lowStockCount: lowStock.length,
    pendingRepairsCount: pendingRepairs.length,
    readyRepairsCount: readyRepairs,
    presentEmployeesCount,
    absentEmployeesCount,
    avgBill,
    emiPendingReceivable,
    emiPendingCount,
  };
}

export interface InventoryValuation {
  totalTrackedUnits: number;
  totalTrackedCost: number;
  totalNonTrackedQty: number;
  totalNonTrackedCost: number;
  totalInventoryCost: number;
  estimatedRetailValue: number;
  damagedUnitsCount: number;
}

export function getInventoryValuation(db: DatabaseSync): InventoryValuation {
  const allUnits = getUnits(db);
  const availableUnits = allUnits.filter((u) => u.status === "available" || u.status === "IN_STOCK");
  const damagedUnits = allUnits.filter((u) => u.status === "damaged" || u.status === "DAMAGED");
  const products = getProducts(db);

  let totalTrackedUnits = availableUnits.length;
  let totalTrackedCost = availableUnits.reduce((acc, u) => acc + u.purchasePrice, 0);

  let totalNonTrackedQty = 0;
  let totalNonTrackedCost = 0;
  let estimatedRetailValue = 0;

  for (const p of products) {
    if (p.tracked) {
      const activeUnits = availableUnits.filter((u) => u.productId === p.id);
      estimatedRetailValue += activeUnits.length * p.sellingPrice;
    } else {
      totalNonTrackedQty += p.qty;
      totalNonTrackedCost += p.qty * p.purchasePrice;
      estimatedRetailValue += p.qty * p.sellingPrice;
    }
  }

  return {
    totalTrackedUnits,
    totalTrackedCost,
    totalNonTrackedQty,
    totalNonTrackedCost,
    totalInventoryCost: totalTrackedCost + totalNonTrackedCost,
    estimatedRetailValue,
    damagedUnitsCount: damagedUnits.length,
  };
}

export function getEMIReport(db: DatabaseSync) {
  const receivables = db.prepare(`
    SELECT r.*, c.company_name
    FROM emi_receivables r
    LEFT JOIN finance_companies c ON r.emi_company_id = c.id
    ORDER BY r.created_at DESC
  `).all() as any[];

  const summary = {
    totalReceivables: receivables.reduce((sum, r) => sum + (r.net_receivable || 0), 0),
    totalReceived: receivables.reduce((sum, r) => sum + (r.received_amount || 0), 0),
    totalPending: receivables.reduce((sum, r) => sum + (r.status !== "RECEIVED" ? (r.net_receivable - r.received_amount) : 0), 0),
    count: receivables.length,
    pendingCount: receivables.filter((r) => r.status !== "RECEIVED" && r.status !== "CANCELLED").length,
  };

  const byCompanyMap = new Map<string, { companyName: string; totalFinanced: number; totalReceived: number; totalPending: number; count: number }>();
  for (const r of receivables) {
    const key = r.emi_company_name || r.company_name || "Unknown";
    const existing = byCompanyMap.get(key) || { companyName: key, totalFinanced: 0, totalReceived: 0, totalPending: 0, count: 0 };
    existing.totalFinanced += r.emi_financed_amount || 0;
    existing.totalReceived += r.received_amount || 0;
    existing.totalPending += (r.status !== "RECEIVED" && r.status !== "CANCELLED") ? (r.net_receivable - r.received_amount) : 0;
    existing.count += 1;
    byCompanyMap.set(key, existing);
  }

  return {
    summary,
    byCompany: Array.from(byCompanyMap.values()),
    receivables,
  };
}

export function getDealerReport(db: DatabaseSync) {
  const dealers = db.prepare("SELECT * FROM suppliers ORDER BY name ASC").all() as any[];
  const purchases = db.prepare("SELECT * FROM purchases WHERE status != 'VOID'").all() as any[];
  const payments = db.prepare("SELECT * FROM payments WHERE party = 'supplier' OR party = 'dealer'").all() as any[];

  const dealerRows = dealers.map((d) => {
    const dPurchases = purchases.filter((p) => p.supplier_id === d.id);
    const dPayments = payments.filter((p) => p.party_id === d.id);
    const totalPurchased = dPurchases.reduce((s, p) => s + (p.total || 0), 0);
    const totalPaid = dPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const outstanding = Math.max(0, totalPurchased - totalPaid);

    return {
      dealerId: d.id,
      dealerName: d.name,
      company: d.company || d.name,
      phone: d.phone,
      totalPurchased,
      totalPaid,
      outstanding,
      purchasesCount: dPurchases.length,
    };
  });

  return {
    totalDealers: dealers.length,
    totalPurchased: dealerRows.reduce((s, r) => s + r.totalPurchased, 0),
    totalPaid: dealerRows.reduce((s, r) => s + r.totalPaid, 0),
    totalOutstanding: dealerRows.reduce((s, r) => s + r.outstanding, 0),
    dealers: dealerRows,
  };
}

export function getCategoryStockReport(db: DatabaseSync) {
  const products = getProducts(db);
  const units = getUnits(db);

  const categoryMap = new Map<string, { category: string; productCount: number; stockQty: number; inventoryCost: number; retailValue: number }>();

  for (const p of products) {
    const cat = p.category || "Uncategorized";
    const existing = categoryMap.get(cat) || { category: cat, productCount: 0, stockQty: 0, inventoryCost: 0, retailValue: 0 };
    existing.productCount += 1;

    if (p.tracked) {
      const activeUnits = units.filter((u) => u.productId === p.id && (u.status === "available" || u.status === "IN_STOCK"));
      existing.stockQty += activeUnits.length;
      existing.inventoryCost += activeUnits.reduce((s, u) => s + u.purchasePrice, 0);
      existing.retailValue += activeUnits.length * p.sellingPrice;
    } else {
      existing.stockQty += p.qty;
      existing.inventoryCost += p.qty * p.purchasePrice;
      existing.retailValue += p.qty * p.sellingPrice;
    }

    categoryMap.set(cat, existing);
  }

  return Array.from(categoryMap.values());
}

export function getItemWiseReport(
  db: DatabaseSync,
  filters: {
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    subcategory?: string;
    brand?: string;
    model?: string;
    productId?: string;
    sku?: string;
    barcode?: string;
    dealerId?: string;
    customerId?: string;
    gstType?: "GST" | "NON_GST" | string;
    transactionType?: string;
  } = {}
) {
  const products = getProducts(db);
  const units = getUnits(db);

  // Filter products by master catalog filters
  const filteredProducts = products.filter((p) => {
    if (filters.productId && p.id !== filters.productId) return false;
    if (filters.category && filters.category !== "All" && p.category !== filters.category) return false;
    if (filters.brand && filters.brand !== "All" && p.brand !== filters.brand) return false;
    if (filters.model && !p.model.toLowerCase().includes(filters.model.toLowerCase())) return false;
    if (filters.barcode && !p.barcode?.toLowerCase().includes(filters.barcode.toLowerCase())) return false;
    if (filters.sku && !p.sku?.toLowerCase().includes(filters.sku.toLowerCase())) return false;
    return true;
  });

  // Pull all movements/transactions with optional date filtering
  let purchaseItemsQuery = `
    SELECT pi.product_id, pi.qty, pi.cost_price, pi.price, p.date, p.supplier_id, p.purchase_type
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.status != 'VOID'
  `;
  if (filters.dateFrom) purchaseItemsQuery += ` AND p.date >= '${filters.dateFrom}'`;
  if (filters.dateTo) purchaseItemsQuery += ` AND p.date <= '${filters.dateTo}'`;
  if (filters.dealerId) purchaseItemsQuery += ` AND p.supplier_id = '${filters.dealerId}'`;
  if (filters.gstType === "GST") purchaseItemsQuery += ` AND p.purchase_type = 'GST'`;
  if (filters.gstType === "NON_GST") purchaseItemsQuery += ` AND p.purchase_type = 'NON_GST'`;

  const purchaseItemRows = db.prepare(purchaseItemsQuery).all() as any[];

  let saleItemsQuery = `
    SELECT si.product_id, si.qty, si.price, si.cost_price, s.date, s.customer_id, s.invoice_type
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.status != 'VOID' AND s.quotation = 0
  `;
  if (filters.dateFrom) saleItemsQuery += ` AND s.date >= '${filters.dateFrom}'`;
  if (filters.dateTo) saleItemsQuery += ` AND s.date <= '${filters.dateTo}'`;
  if (filters.customerId) saleItemsQuery += ` AND s.customer_id = '${filters.customerId}'`;
  if (filters.gstType === "GST") saleItemsQuery += ` AND s.invoice_type = 'GST'`;
  if (filters.gstType === "NON_GST") saleItemsQuery += ` AND s.invoice_type = 'NON_GST'`;

  const saleItemRows = db.prepare(saleItemsQuery).all() as any[];

  let returnsQuery = `
    SELECT ri.product_id, ri.qty, r.type, r.date, r.party_id
    FROM return_items ri
    JOIN returns r ON ri.return_id = r.id
  `;
  if (filters.dateFrom) returnsQuery += ` WHERE r.date >= '${filters.dateFrom}'`;
  if (filters.dateTo) returnsQuery += ` ${filters.dateFrom ? "AND" : "WHERE"} r.date <= '${filters.dateTo}'`;

  const returnRows = db.prepare(returnsQuery).all() as any[];

  let adjustmentsQuery = `
    SELECT product_id, movement_type, quantity, cost_per_unit, created_at
    FROM stock_movements
    WHERE movement_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS')
  `;
  const adjustmentRows = db.prepare(adjustmentsQuery).all() as any[];

  const items = filteredProducts.map((p) => {
    const pPurchases = purchaseItemRows.filter((row) => row.product_id === p.id);
    const pSales = saleItemRows.filter((row) => row.product_id === p.id);
    const pPurchaseReturns = returnRows.filter((row) => row.product_id === p.id && row.type === "purchase");
    const pSaleReturns = returnRows.filter((row) => row.product_id === p.id && row.type === "sale");
    const pAdjustments = adjustmentRows.filter((row) => row.product_id === p.id);

    const purchaseQty = pPurchases.reduce((s, row) => s + (row.qty || 0), 0);
    const saleQty = pSales.reduce((s, row) => s + (row.qty || 0), 0);
    const purchaseReturnQty = pPurchaseReturns.reduce((s, row) => s + (row.qty || 0), 0);
    const saleReturnQty = pSaleReturns.reduce((s, row) => s + (row.qty || 0), 0);

    const adjIn = pAdjustments
      .filter((row) => row.movement_type === "ADJUSTMENT_IN")
      .reduce((s, row) => s + row.quantity, 0);
    const adjOut = pAdjustments
      .filter((row) => row.movement_type === "ADJUSTMENT_OUT" || row.movement_type === "DAMAGE" || row.movement_type === "LOSS")
      .reduce((s, row) => s + row.quantity, 0);
    const adjustmentQty = adjIn - adjOut;

    // Current stock calculation
    let currentStock: number;
    let openingStock = 0;

    if (p.tracked) {
      const activeUnits = units.filter(
        (u) => u.productId === p.id && (u.status === "available" || u.status === "IN_STOCK")
      );
      currentStock = activeUnits.length;
      // Formula backward: Closing = Opening + Purchase - PurchaseReturn - Sale + SaleReturn + Adjustments
      // Opening = Closing - Purchase + PurchaseReturn + Sale - SaleReturn - Adjustments
      openingStock = Math.max(0, currentStock - purchaseQty + purchaseReturnQty + saleQty - saleReturnQty - adjustmentQty);
    } else {
      currentStock = p.qty;
      openingStock = Math.max(0, currentStock - purchaseQty + purchaseReturnQty + saleQty - saleReturnQty - adjustmentQty);
    }

    const calculatedClosing = openingStock + purchaseQty - purchaseReturnQty - saleQty + saleReturnQty + adjustmentQty;
    currentStock = calculatedClosing;

    const purchasePrice = p.purchasePrice;
    const sellingPrice = p.sellingPrice;
    const purchaseValue = currentStock * purchasePrice;
    const salesValue = saleQty * sellingPrice;
    const estimatedProfit = saleQty * Math.max(0, sellingPrice - purchasePrice);

    return {
      productId: p.id,
      productName: p.name,
      category: p.category || "General",
      subcategory: p.subcategory || undefined,
      brand: p.brand,
      model: p.model,
      sku: p.sku || undefined,
      barcode: p.barcode || undefined,
      hsn: "85171300",
      openingStock,
      purchaseQty,
      purchaseReturnQty,
      saleQty,
      saleReturnQty,
      adjustmentQty,
      currentStock,
      closingStock: currentStock,
      purchasePrice,
      sellingPrice,
      purchaseValue,
      stockValuation: purchaseValue,
      salesValue,
      estimatedProfit,
      tracked: p.tracked,
      purchasesIn: purchaseQty,
      purchaseReturnsOut: purchaseReturnQty,
      salesOut: saleQty,
      saleReturnsIn: saleReturnQty,
      adjustments: adjustmentQty,
    };
  });

  // Filter out zero-activity items if transactionType is specified
  const filteredItems = items.filter((item) => {
    if (filters.transactionType === "Purchase" && item.purchaseQty === 0) return false;
    if (filters.transactionType === "Sale" && item.saleQty === 0) return false;
    if (filters.transactionType === "Purchase Return" && item.purchaseReturnQty === 0) return false;
    if (filters.transactionType === "Sale Return" && item.saleReturnQty === 0) return false;
    return true;
  });

  const summary = {
    totalItems: filteredItems.length,
    totalPurchasedQty: filteredItems.reduce((s, i) => s + i.purchaseQty, 0),
    totalSoldQty: filteredItems.reduce((s, i) => s + i.saleQty, 0),
    totalPurchaseReturnQty: filteredItems.reduce((s, i) => s + i.purchaseReturnQty, 0),
    totalSaleReturnQty: filteredItems.reduce((s, i) => s + i.saleReturnQty, 0),
    currentStockQty: filteredItems.reduce((s, i) => s + i.currentStock, 0),
    totalClosing: filteredItems.reduce((s, i) => s + i.currentStock, 0),
    totalPurchaseValue: filteredItems.reduce((s, i) => s + i.purchaseValue, 0),
    totalSalesValue: filteredItems.reduce((s, i) => s + i.salesValue, 0),
    estimatedProfit: filteredItems.reduce((s, i) => s + i.estimatedProfit, 0),
  };

  return { summary, items: filteredItems, rows: filteredItems };
}

export function getProductStockLedger(db: DatabaseSync, productId: string) {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId) as any;
  if (!product) {
    throw new Error(`Product ${productId} not found`);
  }

  // Purchases
  const purchases = db.prepare(`
    SELECT pi.id, p.date, 'Purchase' as type, p.invoice_no as ref_no, s.name as party_name,
           pi.qty as qty_in, 0 as qty_out, pi.cost_price as rate, (pi.qty * pi.cost_price) as total_amount,
           p.date as created_at
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE pi.product_id = ? AND p.status != 'VOID'
  `).all(productId) as any[];

  // Sales
  const sales = db.prepare(`
    SELECT si.id, s.date, 'Sale' as type, s.invoice_no as ref_no, c.name as party_name,
           0 as qty_in, si.qty as qty_out, si.price as rate, (si.qty * si.price) as total_amount,
           s.date as created_at
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE si.product_id = ? AND s.status != 'VOID' AND s.quotation = 0
  `).all(productId) as any[];

  // Returns
  const returns = db.prepare(`
    SELECT ri.id, r.date,
           CASE WHEN r.type = 'sale' THEN 'Sale Return' ELSE 'Purchase Return' END as type,
           r.ref_no,
           CASE WHEN r.type = 'sale' THEN c.name ELSE s.name END as party_name,
           CASE WHEN r.type = 'sale' THEN ri.qty ELSE 0 END as qty_in,
           CASE WHEN r.type = 'purchase' THEN ri.qty ELSE 0 END as qty_out,
           ri.price as rate, (ri.qty * ri.price) as total_amount,
           r.date as created_at
    FROM return_items ri
    JOIN returns r ON ri.return_id = r.id
    LEFT JOIN customers c ON r.type = 'sale' AND r.party_id = c.id
    LEFT JOIN suppliers s ON r.type = 'purchase' AND r.party_id = s.id
    WHERE ri.product_id = ?
  `).all(productId) as any[];

  // Adjustments
  const adjustments = db.prepare(`
    SELECT id, substr(created_at, 1, 10) as date,
           'Stock Adjustment (' || movement_type || ')' as type,
           COALESCE(reference_id, 'ADJ') as ref_no,
           'Inventory Manager' as party_name,
           CASE WHEN movement_type = 'ADJUSTMENT_IN' THEN quantity ELSE 0 END as qty_in,
           CASE WHEN movement_type != 'ADJUSTMENT_IN' THEN quantity ELSE 0 END as qty_out,
           cost_per_unit as rate, (quantity * cost_per_unit) as total_amount,
           created_at
    FROM stock_movements
    WHERE product_id = ? AND movement_type IN ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'DAMAGE', 'LOSS')
  `).all(productId) as any[];

  // Combine and sort chronologically
  const allEvents = [...purchases, ...sales, ...returns, ...adjustments].sort((a, b) => {
    const dComp = (a.date || "").localeCompare(b.date || "");
    if (dComp !== 0) return dComp;
    return (a.created_at || "").localeCompare(b.created_at || "");
  });

  let runningBalance = 0;
  const entries = allEvents.map((evt) => {
    runningBalance += (evt.qty_in || 0) - (evt.qty_out || 0);
    return {
      id: evt.id,
      date: evt.date,
      type: evt.type,
      refNo: evt.ref_no,
      partyName: evt.party_name || "—",
      qtyIn: evt.qty_in || 0,
      qtyOut: evt.qty_out || 0,
      rate: evt.rate || 0,
      totalAmount: evt.total_amount || 0,
      balanceQty: runningBalance,
      balance: runningBalance,
      notes: evt.notes,
    };
  });

  const result: any = [...entries];
  result.product = {
    id: product.id,
    name: product.name,
    brand: product.brand,
    model: product.model,
    sellingPrice: product.selling_price,
    purchasePrice: product.purchase_price,
    tracked: product.tracked,
  };
  result.entries = entries;
  return result;
}

export function getImeiWiseReport(
  db: DatabaseSync,
  filters: { imei?: string; brand?: string; model?: string; status?: string; search?: string } = {}
) {
  let query = `
    SELECT u.id, u.imei1 as imei, u.product_id, u.status, u.purchase_price, u.selling_price,
           p.name as product_name, p.brand, p.model,
           pur.date as purchase_date, pur.invoice_no as purchase_invoice,
           s.name as purchase_dealer,
           sal.date as sale_date, sal.invoice_no as sale_invoice,
           c.name as customer_name
    FROM units u
    JOIN products p ON u.product_id = p.id
    LEFT JOIN purchases pur ON u.purchase_id = pur.id
    LEFT JOIN suppliers s ON pur.supplier_id = s.id
    LEFT JOIN sales sal ON u.sale_id = sal.id
    LEFT JOIN customers c ON sal.customer_id = c.id
    WHERE 1=1
  `;

  if (filters.imei) {
    query += ` AND (u.imei1 LIKE '%${filters.imei}%' OR u.imei2 LIKE '%${filters.imei}%')`;
  }
  if (filters.search) {
    query += ` AND (u.imei1 LIKE '%${filters.search}%' OR p.name LIKE '%${filters.search}%' OR p.model LIKE '%${filters.search}%')`;
  }
  if (filters.brand && filters.brand !== "All") {
    query += ` AND p.brand = '${filters.brand}'`;
  }
  if (filters.model) {
    query += ` AND p.model LIKE '%${filters.model}%'`;
  }
  if (filters.status && filters.status !== "All") {
    query += ` AND UPPER(u.status) = '${filters.status.toUpperCase()}'`;
  }

  query += ` ORDER BY pur.date DESC, u.rowid DESC`;

  const rows = db.prepare(query).all() as any[];

  return rows.map((r) => {
    let normalizedStatus = "AVAILABLE";
    const rawStatus = (r.status || "").toUpperCase();
    if (rawStatus === "AVAILABLE" || rawStatus === "IN_STOCK") normalizedStatus = "AVAILABLE";
    else if (rawStatus === "SOLD") normalizedStatus = "SOLD";
    else if (rawStatus === "RETURNED" || rawStatus === "PURCHASE_RETURNED") normalizedStatus = "RETURNED";
    else if (rawStatus === "DAMAGED") normalizedStatus = "DAMAGED";
    else if (rawStatus === "REPAIR") normalizedStatus = "REPAIR";
    else normalizedStatus = rawStatus;

    return {
      id: r.id,
      imei: r.imei,
      productId: r.product_id,
      productName: r.product_name,
      brand: r.brand,
      model: r.model,
      purchaseDate: r.purchase_date,
      purchaseDealer: r.purchase_dealer,
      purchaseInvoice: r.purchase_invoice,
      purchasePrice: r.purchase_price,
      saleDate: r.sale_date,
      customer: r.customer_name,
      saleInvoice: r.sale_invoice,
      salePrice: r.selling_price,
      status: normalizedStatus,
    };
  });
}

/**
 * Section 44: Credit Note Report
 */
export function getCreditNotesReport(
  db: DatabaseSync,
  filters?: { dateFrom?: string; dateTo?: string; customerId?: string; status?: string }
) {
  let query = `
    SELECT
      cn.id,
      cn.date,
      cn.credit_note_no,
      c.id as customer_id,
      c.name as customer_name,
      COALESCE(cn.original_invoice_no, '—') as original_invoice_no,
      cn.reason,
      cn.subtotal as amount,
      cn.tax as gst,
      cn.total,
      cn.refunded_amount as refunded,
      cn.applied_amount as adjusted,
      cn.remaining_amount as remaining,
      cn.status,
      cn.adjustment_type
    FROM credit_notes cn
    JOIN customers c ON cn.customer_id = c.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.dateFrom) {
    query += " AND cn.date >= ?";
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    query += " AND cn.date <= ?";
    params.push(filters.dateTo);
  }
  if (filters?.customerId) {
    query += " AND cn.customer_id = ?";
    params.push(filters.customerId);
  }
  if (filters?.status && filters.status !== "ALL") {
    query += " AND cn.status = ?";
    params.push(filters.status);
  }

  query += " ORDER BY cn.date DESC, cn.created_at DESC";

  return db.prepare(query).all(...params);
}

/**
 * Section 44: Debit Note Report
 */
export function getDebitNotesReport(
  db: DatabaseSync,
  filters?: { dateFrom?: string; dateTo?: string; dealerId?: string; status?: string }
) {
  let query = `
    SELECT
      dn.id,
      dn.date,
      dn.debit_note_no,
      s.id as dealer_id,
      s.name as dealer_name,
      COALESCE(dn.original_invoice_no, '—') as original_purchase_no,
      dn.reason,
      COALESCE(dn.subtotal, dn.amount) as amount,
      COALESCE(dn.tax, 0) as gst,
      COALESCE(dn.total, dn.amount) as total,
      COALESCE(dn.refunded_amount, 0) as refunded,
      COALESCE(dn.applied_amount, 0) as adjusted,
      COALESCE(dn.remaining_amount, dn.amount) as remaining,
      dn.status,
      dn.adjustment_type
    FROM debit_notes dn
    JOIN suppliers s ON dn.dealer_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.dateFrom) {
    query += " AND dn.date >= ?";
    params.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    query += " AND dn.date <= ?";
    params.push(filters.dateTo);
  }
  if (filters?.dealerId) {
    query += " AND dn.dealer_id = ?";
    params.push(filters.dealerId);
  }
  if (filters?.status && filters.status !== "ALL") {
    query += " AND dn.status = ?";
    params.push(filters.status);
  }

  query += " ORDER BY dn.date DESC, dn.created_at DESC";

  return db.prepare(query).all(...params);
}

/**
 * Section 45: Customer Credit Balance Report
 */
export function getCustomerCreditBalanceReport(db: DatabaseSync) {
  const query = `
    SELECT
      c.id as customer_id,
      c.name as customer_name,
      c.phone,
      COALESCE(SUM(CASE WHEN cn.status != 'CANCELLED' THEN cn.total ELSE 0 END), 0) as total_credit,
      COALESCE(SUM(CASE WHEN cn.status != 'CANCELLED' THEN cn.applied_amount ELSE 0 END), 0) as applied_credit,
      COALESCE(SUM(CASE WHEN cn.status != 'CANCELLED' THEN cn.refunded_amount ELSE 0 END), 0) as refunded,
      COALESCE(SUM(CASE WHEN cn.status != 'CANCELLED' THEN cn.remaining_amount ELSE 0 END), 0) as remaining_credit
    FROM customers c
    LEFT JOIN credit_notes cn ON c.id = cn.customer_id
    GROUP BY c.id, c.name, c.phone
    HAVING total_credit > 0 OR remaining_credit > 0
    ORDER BY remaining_credit DESC, total_credit DESC
  `;

  return db.prepare(query).all();
}

/**
 * Section 46: Dealer Credit Balance Report
 */
export function getDealerCreditBalanceReport(db: DatabaseSync) {
  const query = `
    SELECT
      s.id as dealer_id,
      s.name as dealer_name,
      s.phone,
      COALESCE(SUM(CASE WHEN dn.status != 'CANCELLED' THEN COALESCE(dn.total, dn.amount) ELSE 0 END), 0) as total_credit,
      COALESCE(SUM(CASE WHEN dn.status != 'CANCELLED' THEN dn.applied_amount ELSE 0 END), 0) as applied,
      COALESCE(SUM(CASE WHEN dn.status != 'CANCELLED' THEN dn.refunded_amount ELSE 0 END), 0) as refunded,
      COALESCE(SUM(CASE WHEN dn.status != 'CANCELLED' THEN COALESCE(dn.remaining_amount, dn.amount) ELSE 0 END), 0) as remaining
    FROM suppliers s
    LEFT JOIN debit_notes dn ON s.id = dn.dealer_id
    GROUP BY s.id, s.name, s.phone
    HAVING total_credit > 0 OR remaining > 0
    ORDER BY remaining DESC, total_credit DESC
  `;

  return db.prepare(query).all();
}

