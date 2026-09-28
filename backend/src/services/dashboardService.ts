import type { DatabaseSync } from "node:sqlite";
import { todayISO, uid } from "../../../shared/utils/format";

export interface DashboardDateRange {
  dateFrom?: string;
  dateTo?: string;
}

export interface DashboardSummary {
  dateFrom: string;
  dateTo: string;
  // Today's / Filtered Business
  salesTotal: number;
  salesBills: number;
  salesQty: number;
  purchaseTotal: number;
  purchaseBills: number;
  purchaseQty: number;
  salesReturnCount: number;
  salesReturnQty: number;
  salesReturnTotal: number;
  purchaseReturnCount: number;
  purchaseReturnQty: number;
  purchaseReturnTotal: number;
  // Stock Overview
  currentStock: number;
  imeiStock: number;
  accessoryStock: number;
  stockValue: number;
  // Daily Stock Movement Breakdown
  openingStock: number;
  purchasedQty: number;
  purchaseReturnQty: number;
  soldQty: number;
  salesReturnQty: number;
  adjustmentsIn: number;
  adjustmentsOut: number;
  adjustments: number;
  netMovement: number;
  closingStock: number;
}

export function getDashboardSummary(db: DatabaseSync, range?: DashboardDateRange): DashboardSummary {
  const today = todayISO();
  const dateFrom = range?.dateFrom || today;
  const dateTo = range?.dateTo || dateFrom;

  // 1. Sales in date range
  const salesAgg = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total,
      COUNT(*) as count
    FROM sales
    WHERE date >= ? AND date <= ? AND quotation = 0 AND (status IS NULL OR status != 'VOID')
  `).get(dateFrom, dateTo) as { total: number; count: number };

  const salesQtyAgg = db.prepare(`
    SELECT COALESCE(SUM(si.qty), 0) as qty
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    WHERE s.date >= ? AND s.date <= ? AND s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
  `).get(dateFrom, dateTo) as { qty: number };

  // 2. Purchases in date range
  const purchaseAgg = db.prepare(`
    SELECT
      COALESCE(SUM(total), 0) as total,
      COUNT(*) as count
    FROM purchases
    WHERE date >= ? AND date <= ? AND (status IS NULL OR status != 'VOID')
  `).get(dateFrom, dateTo) as { total: number; count: number };

  const purchaseQtyAgg = db.prepare(`
    SELECT COALESCE(SUM(pi.qty), 0) as qty
    FROM purchase_items pi
    JOIN purchases p ON pi.purchase_id = p.id
    WHERE p.date >= ? AND p.date <= ? AND (p.status IS NULL OR p.status != 'VOID')
  `).get(dateFrom, dateTo) as { qty: number };

  // 3. Sales Returns
  const salesReturnAgg = db.prepare(`
    SELECT
      COALESCE(SUM(ri.qty), 0) as qty,
      COALESCE(SUM(r.amount), 0) as total,
      COUNT(DISTINCT r.id) as count
    FROM returns r
    LEFT JOIN return_items ri ON ri.return_id = r.id
    WHERE r.type = 'sale' AND r.date >= ? AND r.date <= ?
  `).get(dateFrom, dateTo) as { qty: number; total: number; count: number };

  // 4. Purchase Returns
  const purchaseReturnAgg = db.prepare(`
    SELECT
      COALESCE(SUM(ri.qty), 0) as qty,
      COALESCE(SUM(r.amount), 0) as total,
      COUNT(DISTINCT r.id) as count
    FROM returns r
    LEFT JOIN return_items ri ON ri.return_id = r.id
    WHERE r.type = 'purchase' AND r.date >= ? AND r.date <= ?
  `).get(dateFrom, dateTo) as { qty: number; total: number; count: number };

  // 5. Adjustments
  const adjInAgg = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as qty
    FROM stock_movements
    WHERE movement_type = 'ADJUSTMENT_IN' AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(dateFrom, dateTo) as { qty: number };

  const adjOutAgg = db.prepare(`
    SELECT COALESCE(SUM(ABS(quantity)), 0) as qty
    FROM stock_movements
    WHERE movement_type IN ('ADJUSTMENT_OUT', 'DAMAGE', 'LOSS') AND date(created_at) >= ? AND date(created_at) <= ?
  `).get(dateFrom, dateTo) as { qty: number };

  // 6. Current Stock Overview
  const imeiRow = db.prepare(`
    SELECT
      COUNT(*) as count,
      COALESCE(SUM(purchase_price), 0) as val
    FROM units
    WHERE status IN ('available', 'IN_STOCK')
  `).get() as { count: number; val: number };

  const nonTrackedRow = db.prepare(`
    SELECT
      COALESCE(SUM(qty), 0) as count,
      COALESCE(SUM(qty * purchase_price), 0) as val
    FROM products
    WHERE tracked = 0
  `).get() as { count: number; val: number };

  const currentStock = imeiRow.count + nonTrackedRow.count;
  const imeiStock = imeiRow.count;
  const accessoryStock = nonTrackedRow.count;
  const stockValue = Math.round(imeiRow.val + nonTrackedRow.val);

  // 7. Stock Movement Calculation (Requirement 18: Closing = Opening + Inward - Outward)
  const purchasedQty = purchaseQtyAgg.qty;
  const purchaseReturnQty = purchaseReturnAgg.qty;
  const soldQty = salesQtyAgg.qty;
  const salesReturnQty = salesReturnAgg.qty;
  const adjustmentsIn = adjInAgg.qty;
  const adjustmentsOut = adjOutAgg.qty;
  const adjustments = adjustmentsIn - adjustmentsOut;

  const netMovement = purchasedQty - purchaseReturnQty - soldQty + salesReturnQty + adjustments;
  const closingStock = currentStock;
  const openingStock = Math.max(0, closingStock - netMovement);

  return {
    dateFrom,
    dateTo,
    salesTotal: Math.round(salesAgg.total),
    salesBills: salesAgg.count,
    salesQty: salesQtyAgg.qty,
    purchaseTotal: Math.round(purchaseAgg.total),
    purchaseBills: purchaseAgg.count,
    purchaseQty: purchaseQtyAgg.qty,
    salesReturnCount: salesReturnAgg.count,
    salesReturnQty: salesReturnAgg.qty,
    salesReturnTotal: Math.round(salesReturnAgg.total),
    purchaseReturnCount: purchaseReturnAgg.count,
    purchaseReturnQty: purchaseReturnAgg.qty,
    purchaseReturnTotal: Math.round(purchaseReturnAgg.total),
    currentStock,
    imeiStock,
    accessoryStock,
    stockValue,
    openingStock,
    purchasedQty,
    purchaseReturnQty,
    soldQty,
    salesReturnQty,
    adjustmentsIn,
    adjustmentsOut,
    adjustments,
    netMovement,
    closingStock,
  };
}

export interface DailyMovementPoint {
  date: string;
  displayDate: string;
  purchases: number;
  sales: number;
  purchaseReturns: number;
  salesReturns: number;
}

export function getDailyStockMovement(db: DatabaseSync, range?: DashboardDateRange): DailyMovementPoint[] {
  let dateFrom = range?.dateFrom;
  let dateTo = range?.dateTo;

  if (!dateFrom || !dateTo) {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6);
    dateFrom = start.toISOString().split("T")[0]!;
    dateTo = end.toISOString().split("T")[0]!;
  }

  // Generate list of dates
  const points: DailyMovementPoint[] = [];
  const current = new Date(dateFrom);
  const endD = new Date(dateTo);

  // Month names for clean display
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  while (current <= endD) {
    const dStr = current.toISOString().split("T")[0]!;
    const displayDate = `${current.getDate()} ${months[current.getMonth()]}`;

    const pRow = db.prepare(`
      SELECT COALESCE(SUM(pi.qty), 0) as qty
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.date = ? AND (p.status IS NULL OR p.status != 'VOID')
    `).get(dStr) as { qty: number };

    const sRow = db.prepare(`
      SELECT COALESCE(SUM(si.qty), 0) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date = ? AND s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    `).get(dStr) as { qty: number };

    const prRow = db.prepare(`
      SELECT COALESCE(SUM(ri.qty), 0) as qty
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE r.type = 'purchase' AND r.date = ?
    `).get(dStr) as { qty: number };

    const srRow = db.prepare(`
      SELECT COALESCE(SUM(ri.qty), 0) as qty
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE r.type = 'sale' AND r.date = ?
    `).get(dStr) as { qty: number };

    points.push({
      date: dStr,
      displayDate,
      purchases: pRow.qty,
      sales: sRow.qty,
      purchaseReturns: prRow.qty,
      salesReturns: srRow.qty,
    });

    current.setDate(current.getDate() + 1);
  }

  return points;
}

export interface ItemWiseDailyMovementRow {
  id: string;
  name: string;
  model: string;
  category: string;
  brand: string;
  opening: number;
  purchased: number;
  purchaseReturn: number;
  sold: number;
  salesReturn: number;
  adjustments: number;
  closing: number;
  isImei: boolean;
}

export function getItemWiseDailyMovement(db: DatabaseSync, range?: DashboardDateRange): ItemWiseDailyMovementRow[] {
  const today = todayISO();
  const dateFrom = range?.dateFrom || today;
  const dateTo = range?.dateTo || dateFrom;

  // 1. Gather all product IDs that had any transactions in the period
  const movementProducts = db.prepare(`
    SELECT DISTINCT product_id FROM (
      SELECT si.product_id
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE s.date >= ? AND s.date <= ? AND s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')

      UNION

      SELECT pi.product_id
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE p.date >= ? AND p.date <= ? AND (p.status IS NULL OR p.status != 'VOID')

      UNION

      SELECT ri.product_id
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE r.date >= ? AND r.date <= ?

      UNION

      SELECT product_id
      FROM stock_movements
      WHERE date(created_at) >= ? AND date(created_at) <= ?
    )
  `).all(dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo, dateFrom, dateTo) as { product_id: string }[];

  if (!movementProducts.length) {
    return [];
  }

  const rows: ItemWiseDailyMovementRow[] = [];

  for (const { product_id } of movementProducts) {
    const prod = db.prepare(`
      SELECT id, name, model, brand, category, tracked, qty
      FROM products
      WHERE id = ?
    `).get(product_id) as any;

    if (!prod) continue;

    // Purchased qty
    const pRow = db.prepare(`
      SELECT COALESCE(SUM(pi.qty), 0) as qty
      FROM purchase_items pi
      JOIN purchases p ON pi.purchase_id = p.id
      WHERE pi.product_id = ? AND p.date >= ? AND p.date <= ? AND (p.status IS NULL OR p.status != 'VOID')
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    // Sold qty
    const sRow = db.prepare(`
      SELECT COALESCE(SUM(si.qty), 0) as qty
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      WHERE si.product_id = ? AND s.date >= ? AND s.date <= ? AND s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    // Purchase return qty
    const prRow = db.prepare(`
      SELECT COALESCE(SUM(ri.qty), 0) as qty
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE ri.product_id = ? AND r.type = 'purchase' AND r.date >= ? AND r.date <= ?
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    // Sale return qty
    const srRow = db.prepare(`
      SELECT COALESCE(SUM(ri.qty), 0) as qty
      FROM return_items ri
      JOIN returns r ON ri.return_id = r.id
      WHERE ri.product_id = ? AND r.type = 'sale' AND r.date >= ? AND r.date <= ?
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    // Adjustments
    const adjIn = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) as qty
      FROM stock_movements
      WHERE product_id = ? AND movement_type = 'ADJUSTMENT_IN' AND date(created_at) >= ? AND date(created_at) <= ?
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    const adjOut = db.prepare(`
      SELECT COALESCE(SUM(ABS(quantity)), 0) as qty
      FROM stock_movements
      WHERE product_id = ? AND movement_type IN ('ADJUSTMENT_OUT', 'DAMAGE', 'LOSS') AND date(created_at) >= ? AND date(created_at) <= ?
    `).get(product_id, dateFrom, dateTo) as { qty: number };

    const adjustments = adjIn.qty - adjOut.qty;
    const purchased = pRow.qty;
    const purchaseReturn = prRow.qty;
    const sold = sRow.qty;
    const salesReturn = srRow.qty;

    // Current closing stock for this product
    let closing = 0;
    if (prod.tracked) {
      const uCount = db.prepare(`
        SELECT COUNT(*) as count FROM units WHERE product_id = ? AND status IN ('available', 'IN_STOCK')
      `).get(product_id) as { count: number };
      closing = uCount.count;
    } else {
      closing = prod.qty || 0;
    }

    const net = purchased - purchaseReturn - sold + salesReturn + adjustments;
    const opening = Math.max(0, closing - net);

    if (purchased > 0 || purchaseReturn > 0 || sold > 0 || salesReturn > 0 || adjustments !== 0) {
      rows.push({
        id: prod.id,
        name: prod.name,
        model: prod.model || "—",
        category: prod.category,
        brand: prod.brand || "Generic",
        opening,
        purchased,
        purchaseReturn,
        sold,
        salesReturn,
        adjustments,
        closing,
        isImei: Boolean(prod.tracked),
      });
    }
  }

  return rows;
}

export interface CategoryStockRow {
  category: string;
  quantity: number;
  stockValue: number;
}

export function getCategoryStock(db: DatabaseSync): CategoryStockRow[] {
  const DISPLAY_CATEGORIES = [
    "Mobile Phones",
    "Accessories",
    "Earphones",
    "Chargers",
    "Cables",
    "Tablets",
    "Laptops",
    "Smart Watches",
    "Other",
  ];

  const catMap = new Map<string, { quantity: number; stockValue: number }>();
  for (const cat of DISPLAY_CATEGORIES) {
    catMap.set(cat, { quantity: 0, stockValue: 0 });
  }

  const classify = (rawCat: string = "", name: string = ""): string => {
    const c = (rawCat + " " + name).toLowerCase();
    if (c.includes("phone") || c.includes("mobile") || c.includes("handset") || c.includes("smartphone")) {
      if (c.includes("cover") || c.includes("case") || c.includes("glass") || c.includes("screen") || c.includes("guard") || c.includes("power bank")) {
        return "Accessories";
      }
      if (c.includes("charger") || c.includes("adapter")) return "Chargers";
      if (c.includes("cable") || c.includes("wire") || c.includes("usb")) return "Cables";
      if (c.includes("earphone") || c.includes("earbud") || c.includes("airpod") || c.includes("tws") || c.includes("headphone") || c.includes("neckband")) return "Earphones";
      return "Mobile Phones";
    }
    if (c.includes("tablet") || c.includes("ipad")) return "Tablets";
    if (c.includes("laptop") || c.includes("notebook") || c.includes("macbook")) return "Laptops";
    if (c.includes("watch") || c.includes("band")) return "Smart Watches";
    if (c.includes("earphone") || c.includes("earbud") || c.includes("airpod") || c.includes("tws") || c.includes("headphone") || c.includes("neckband") || c.includes("speaker")) return "Earphones";
    if (c.includes("charger") || c.includes("adapter")) return "Chargers";
    if (c.includes("cable") || c.includes("wire") || c.includes("usb")) return "Cables";
    if (c.includes("accessory") || c.includes("accessories") || c.includes("cover") || c.includes("case") || c.includes("glass") || c.includes("screen") || c.includes("guard") || c.includes("power bank")) return "Accessories";
    return "Other";
  };

  const products = db.prepare(`SELECT id, name, category, tracked, qty, purchase_price FROM products`).all() as any[];
  for (const p of products) {
    let units = 0;
    let val = 0;
    if (p.tracked) {
      const u = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(purchase_price), 0) as val
        FROM units
        WHERE product_id = ? AND status IN ('available', 'IN_STOCK')
      `).get(p.id) as { count: number; val: number };
      units = u.count;
      val = u.val || (units * (p.purchase_price || 0));
    } else {
      units = p.qty || 0;
      val = units * (p.purchase_price || 0);
    }

    const targetCategory = classify(p.category, p.name);
    const curr = catMap.get(targetCategory) || { quantity: 0, stockValue: 0 };
    curr.quantity += units;
    curr.stockValue += Math.round(val);
    catMap.set(targetCategory, curr);
  }

  return DISPLAY_CATEGORIES.map((category) => ({
    category,
    quantity: catMap.get(category)?.quantity || 0,
    stockValue: catMap.get(category)?.stockValue || 0,
  }));
}

export interface BrandStockRow {
  brand: string;
  units: number;
  stockValue: number;
}

export function getBrandStock(db: DatabaseSync): BrandStockRow[] {
  // Query distinct brands
  const brands = db.prepare(`
    SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL AND brand != ''
  `).all() as { brand: string }[];

  const rows: BrandStockRow[] = [];

  for (const { brand } of brands) {
    const unitRow = db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(u.purchase_price), 0) as val
      FROM units u
      JOIN products p ON u.product_id = p.id
      WHERE p.brand = ? AND u.status IN ('available', 'IN_STOCK')
    `).get(brand) as { count: number; val: number };

    const prodRow = db.prepare(`
      SELECT
        COALESCE(SUM(qty), 0) as count,
        COALESCE(SUM(qty * purchase_price), 0) as val
      FROM products
      WHERE brand = ? AND tracked = 0
    `).get(brand) as { count: number; val: number };

    const units = unitRow.count + prodRow.count;
    const stockValue = Math.round(unitRow.val + prodRow.val);

    if (units > 0) {
      rows.push({
        brand,
        units,
        stockValue,
      });
    }
  }

  // Sort by units descending
  return rows.sort((a, b) => b.units - a.units);
}

export interface LowStockProductRow {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: string;
  currentStock: number;
  minStock: number;
}

export function getLowStockProducts(db: DatabaseSync): LowStockProductRow[] {
  const allProds = db.prepare(`
    SELECT id, name, model, brand, category, tracked, qty, COALESCE(minimum_stock, reorder_level, 2) as minStock
    FROM products
  `).all() as any[];

  const lowStock: LowStockProductRow[] = [];

  for (const p of allProds) {
    let stock = 0;
    if (p.tracked) {
      const u = db.prepare(`
        SELECT COUNT(*) as count FROM units WHERE product_id = ? AND status IN ('available', 'IN_STOCK')
      `).get(p.id) as { count: number };
      stock = u.count;
    } else {
      stock = p.qty || 0;
    }

    if (stock > 0 && stock <= p.minStock) {
      lowStock.push({
        id: p.id,
        name: p.name,
        model: p.model || "—",
        brand: p.brand || "Generic",
        category: p.category,
        currentStock: stock,
        minStock: p.minStock,
      });
    }
  }

  return lowStock;
}

export interface OutOfStockProductRow {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: string;
}

export function getOutOfStockProducts(db: DatabaseSync): OutOfStockProductRow[] {
  const allProds = db.prepare(`
    SELECT id, name, model, brand, category, tracked, qty
    FROM products
  `).all() as any[];

  const outOfStock: OutOfStockProductRow[] = [];

  for (const p of allProds) {
    let stock = 0;
    if (p.tracked) {
      const u = db.prepare(`
        SELECT COUNT(*) as count FROM units WHERE product_id = ? AND status IN ('available', 'IN_STOCK')
      `).get(p.id) as { count: number };
      stock = u.count;
    } else {
      stock = p.qty || 0;
    }

    if (stock <= 0) {
      outOfStock.push({
        id: p.id,
        name: p.name,
        model: p.model || "—",
        brand: p.brand || "Generic",
        category: p.category,
      });
    }
  }

  return outOfStock;
}

export interface TopSellingProductRow {
  id: string;
  name: string;
  model: string;
  brand: string;
  category: string;
  qtySold: number;
  salesValue: number;
}

export function getTopSellingProducts(db: DatabaseSync, range: "today" | "7d" | "30d" = "7d"): TopSellingProductRow[] {
  const today = todayISO();
  let startDate = today;

  if (range === "7d") {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    startDate = d.toISOString().split("T")[0]!;
  } else if (range === "30d") {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    startDate = d.toISOString().split("T")[0]!;
  }

  const rows = db.prepare(`
    SELECT
      p.id,
      p.name,
      p.model,
      p.brand,
      p.category,
      SUM(si.qty) as qtySold,
      SUM(si.qty * si.price) as salesValue
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE s.date >= ? AND s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    GROUP BY p.id
    ORDER BY qtySold DESC
    LIMIT 10
  `).all(startDate) as any[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    model: r.model || "—",
    brand: r.brand || "Generic",
    category: r.category,
    qtySold: r.qtySold || 0,
    salesValue: Math.round(r.salesValue || 0),
  }));
}

export interface RecentTransactionRow {
  id: string;
  time: string;
  type: "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN" | "PAYMENT" | "EXPENSE" | "REPAIR";
  reference: string;
  partyName: string;
  amount: number;
  user: string;
}

export function getRecentTransactions(db: DatabaseSync, limit = 10): RecentTransactionRow[] {
  const list: RecentTransactionRow[] = [];

  // Recent Sales
  const sales = db.prepare(`
    SELECT s.id, s.invoice_no, s.date, s.total, c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    ORDER BY s.date DESC, s.rowid DESC
    LIMIT ?
  `).all(limit) as any[];

  for (const s of sales) {
    list.push({
      id: s.id,
      time: s.date,
      type: "SALE",
      reference: s.invoice_no,
      partyName: s.customer_name || "Walk-in Customer",
      amount: s.total,
      user: "Staff",
    });
  }

  // Recent Purchases
  const purchases = db.prepare(`
    SELECT p.id, p.invoice_no, p.date, p.total, s.name as supplier_name
    FROM purchases p
    LEFT JOIN suppliers s ON p.supplier_id = s.id
    WHERE (p.status IS NULL OR p.status != 'VOID')
    ORDER BY p.date DESC, p.rowid DESC
    LIMIT ?
  `).all(limit) as any[];

  for (const p of purchases) {
    list.push({
      id: p.id,
      time: p.date,
      type: "PURCHASE",
      reference: p.invoice_no,
      partyName: p.supplier_name || "Supplier",
      amount: p.total,
      user: "Staff",
    });
  }

  // Recent Returns
  const returns = db.prepare(`
    SELECT r.id, r.type, r.ref_no, r.date, r.amount,
      CASE WHEN r.type = 'sale' THEN c.name ELSE sup.name END as party_name
    FROM returns r
    LEFT JOIN customers c ON r.type = 'sale' AND r.party_id = c.id
    LEFT JOIN suppliers sup ON r.type = 'purchase' AND r.party_id = sup.id
    ORDER BY r.date DESC, r.rowid DESC
    LIMIT ?
  `).all(limit) as any[];

  for (const r of returns) {
    list.push({
      id: r.id,
      time: r.date,
      type: r.type === "sale" ? "SALE_RETURN" : "PURCHASE_RETURN",
      reference: r.ref_no,
      partyName: r.party_name || (r.type === "sale" ? "Customer" : "Dealer"),
      amount: r.amount,
      user: "Staff",
    });
  }

  // Recent Expenses
  try {
    const expenses = db.prepare(`
      SELECT id, category, amount, date, COALESCE(note, '') as note
      FROM expenses
      ORDER BY date DESC, rowid DESC
      LIMIT ?
    `).all(limit) as any[];

    for (const e of expenses) {
      list.push({
        id: e.id,
        time: e.date,
        type: "EXPENSE",
        reference: e.category,
        partyName: e.note || e.category,
        amount: e.amount,
        user: "Staff",
      });
    }
  } catch {}

  // Sort by time/date descending
  list.sort((a, b) => b.time.localeCompare(a.time));
  return list.slice(0, limit);
}

export interface RecentBillRow {
  id: string;
  invoiceNo: string;
  customer: string;
  amount: number;
  paymentStatus: "Paid" | "Due" | "Partial";
  time: string;
}

export function getRecentBills(db: DatabaseSync, limit = 10): RecentBillRow[] {
  const sales = db.prepare(`
    SELECT s.id, s.invoice_no, s.date, s.total, s.paid, c.name as customer_name
    FROM sales s
    LEFT JOIN customers c ON s.customer_id = c.id
    WHERE s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    ORDER BY s.date DESC, s.rowid DESC
    LIMIT ?
  `).all(limit) as any[];

  return sales.map((s) => {
    const due = s.total - s.paid;
    let paymentStatus: "Paid" | "Due" | "Partial" = "Paid";
    if (due > 0.01) {
      paymentStatus = s.paid > 0 ? "Partial" : "Due";
    }

    return {
      id: s.id,
      invoiceNo: s.invoice_no,
      customer: s.customer_name || "Walk-in Customer",
      amount: s.total,
      paymentStatus,
      time: s.date,
    };
  });
}

export interface CustomerDueSummary {
  totalDue: number;
  dueCustomersCount: number;
}

export function getCustomerDueSummary(db: DatabaseSync): CustomerDueSummary {
  const rows = db.prepare(`
    SELECT
      c.id,
      SUM(s.total - s.paid) as due
    FROM customers c
    JOIN sales s ON s.customer_id = c.id
    WHERE s.quotation = 0 AND (s.status IS NULL OR s.status != 'VOID')
    GROUP BY c.id
    HAVING due > 0.01
  `).all() as { id: string; due: number }[];

  const totalDue = rows.reduce((acc, r) => acc + (r.due || 0), 0);
  return {
    totalDue: Math.round(totalDue),
    dueCustomersCount: rows.length,
  };
}

export interface EMISummary {
  pendingReceivable: number;
  pendingCount: number;
}

export function getEMISummary(db: DatabaseSync): EMISummary {
  // Query emi_receivables if table exists
  try {
    const row = db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(net_receivable - received_amount), 0) as pending_total
      FROM emi_receivables
      WHERE status != 'RECEIVED' AND status != 'CANCELLED'
    `).get() as { count: number; pending_total: number } | undefined;

    if (row && (row.count > 0 || row.pending_total > 0)) {
      return {
        pendingReceivable: Math.round(row.pending_total),
        pendingCount: row.count,
      };
    }
  } catch {}

  // Fallback to sales with EMI
  try {
    const salesRow = db.prepare(`
      SELECT
        COUNT(*) as count,
        COALESCE(SUM(total - paid), 0) as pending_total
      FROM sales
      WHERE (total - paid) > 0 AND quotation = 0
    `).get() as { count: number; pending_total: number } | undefined;

    return {
      pendingReceivable: Math.round(salesRow?.pending_total || 0),
      pendingCount: salesRow?.count || 0,
    };
  } catch {
    return { pendingReceivable: 0, pendingCount: 0 };
  }
}

export interface RepairSummary {
  pendingCount: number;
  inProgressCount: number;
  readyCount: number;
}

export function getRepairSummary(db: DatabaseSync): RepairSummary {
  try {
    const pending = db.prepare(`
      SELECT COUNT(*) as count FROM repairs WHERE status IN ('Pending', 'Diagnosing', 'Received', 'PENDING')
    `).get() as { count: number };

    const inProgress = db.prepare(`
      SELECT COUNT(*) as count FROM repairs WHERE status IN ('In Progress', 'Under Repair', 'IN_PROGRESS', 'WAITING_PARTS')
    `).get() as { count: number };

    const ready = db.prepare(`
      SELECT COUNT(*) as count FROM repairs WHERE status IN ('Ready', 'Ready for Pickup', 'READY')
    `).get() as { count: number };

    return {
      pendingCount: pending.count || 0,
      inProgressCount: inProgress.count || 0,
      readyCount: ready.count || 0,
    };
  } catch {
    return { pendingCount: 0, inProgressCount: 0, readyCount: 0 };
  }
}
