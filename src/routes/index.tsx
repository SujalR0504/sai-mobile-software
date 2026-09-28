import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, useCallback } from "react";
import { Badge, Button, Card, CardHead, Empty, Stat } from "@/components/ui";
import { inr, todayISO } from "@/lib/format";
import {
  Receipt,
  ScanBarcode,
  ShoppingBag,
  UserPlus,
  Wrench,
  CreditCard,
  ReceiptIndianRupee,
  Sparkles,
  ArrowRight,
  Printer,
  Calendar,
  RefreshCw,
  TrendingUp,
  Package,
  Layers,
  Smartphone,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Filter,
  CheckCircle2,
  Eye,
} from "lucide-react";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { saleToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import type { Sale } from "@/lib/types";
import { useStore } from "@/lib/store";
import { salesApi } from "@/services/api/salesApi";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mobile Store ERP" },
      {
        name: "description",
        content:
          "Daily business overview, real-time stock movement, item-wise inventory counts, low stock alerts, sales, and retail cash tracking.",
      },
    ],
  }),
  component: DashboardPage,
});

type DateFilterType = "today" | "yesterday" | "7d" | "30d" | "month" | "custom";

interface DashboardData {
  summary: {
    dateFrom: string;
    dateTo: string;
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
    currentStock: number;
    imeiStock: number;
    accessoryStock: number;
    stockValue: number;
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
  };
  stockMovement: Array<{
    date: string;
    displayDate: string;
    purchases: number;
    sales: number;
    purchaseReturns: number;
    salesReturns: number;
  }>;
  itemWiseMovement: Array<{
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
  }>;
  categoryStock: Array<{
    category: string;
    quantity: number;
    stockValue: number;
  }>;
  brandStock: Array<{
    brand: string;
    units: number;
    stockValue: number;
  }>;
  lowStock: Array<{
    id: string;
    name: string;
    model: string;
    brand: string;
    category: string;
    currentStock: number;
    minStock: number;
  }>;
  outOfStock: Array<{
    id: string;
    name: string;
    model: string;
    brand: string;
    category: string;
  }>;
  topSelling: Array<{
    id: string;
    name: string;
    model: string;
    brand: string;
    category: string;
    qtySold: number;
    salesValue: number;
  }>;
  recentTransactions: Array<{
    id: string;
    time: string;
    type: "SALE" | "PURCHASE" | "SALE_RETURN" | "PURCHASE_RETURN" | "PAYMENT" | "EXPENSE" | "REPAIR";
    reference: string;
    partyName: string;
    amount: number;
    user: string;
  }>;
  recentBills: Array<{
    id: string;
    invoiceNo: string;
    customer: string;
    amount: number;
    paymentStatus: "Paid" | "Due" | "Partial";
    time: string;
  }>;
  customerDue: {
    totalDue: number;
    dueCustomersCount: number;
  };
  emi: {
    pendingReceivable: number;
    pendingCount: number;
  };
  repairs: {
    pendingCount: number;
    inProgressCount: number;
    readyCount: number;
  };
}

export function DashboardPage() {
  const { db } = useStore();
  const navigate = useNavigate();
  const [dateFilter, setDateFilter] = useState<DateFilterType>("today");
  const [customFrom, setCustomFrom] = useState(todayISO());
  const [customTo, setCustomTo] = useState(todayISO());
  const [topSellingRange, setTopSellingRange] = useState<"today" | "7d" | "30d">("7d");
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);

  const handleOpenBill = async (billId: string, invoiceNo: string) => {
    const cached = db.sales.find((s) => s.id === billId || s.invoiceNo === invoiceNo);
    if (cached) {
      setSelectedSale(cached);
      return;
    }
    try {
      const sale = await salesApi.getSale(billId);
      if (sale) {
        setSelectedSale(sale);
      }
    } catch (e) {
      console.error("Failed to load sale for bill view", e);
    }
  };

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  // User & Permissions check (Requirement 22)
  const currentUser = useMemo(() => {
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("erp_user");
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const role = currentUser?.role?.toUpperCase() || "ADMIN";
  const isAdminOrOwner = role === "ADMIN" || role === "OWNER" || role === "MANAGER";

  // Permissions flags
  const canViewSales = isAdminOrOwner || role === "SALES" || role === "CASHIER" || role === "ACCOUNTANT";
  const canViewPurchases = isAdminOrOwner || role === "ACCOUNTANT";
  const canViewStock = isAdminOrOwner || role === "SALES" || role === "CASHIER" || role === "TECHNICIAN";

  // Compute dateFrom and dateTo based on dateFilter
  const { dateFrom, dateTo } = useMemo(() => {
    const today = todayISO();
    if (dateFilter === "today") {
      return { dateFrom: today, dateTo: today };
    }
    if (dateFilter === "yesterday") {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      const yStr = d.toISOString().split("T")[0]!;
      return { dateFrom: yStr, dateTo: yStr };
    }
    if (dateFilter === "7d") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { dateFrom: d.toISOString().split("T")[0]!, dateTo: today };
    }
    if (dateFilter === "30d") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      return { dateFrom: d.toISOString().split("T")[0]!, dateTo: today };
    }
    if (dateFilter === "month") {
      const d = new Date();
      d.setDate(1);
      return { dateFrom: d.toISOString().split("T")[0]!, dateTo: today };
    }
    if (dateFilter === "custom") {
      return { dateFrom: customFrom, dateTo: customTo };
    }
    return { dateFrom: today, dateTo: today };
  }, [dateFilter, customFrom, customTo]);

  // Fetch consolidated dashboard data from backend (Requirement 17 & 21)
  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom,
        dateTo,
        topRange: topSellingRange,
      });
      const res = await fetch(`/api/dashboard/all?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Dashboard fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, topSellingRange]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Fallback safe values
  const summary = data?.summary || {
    dateFrom,
    dateTo,
    salesTotal: 0,
    salesBills: 0,
    salesQty: 0,
    purchaseTotal: 0,
    purchaseBills: 0,
    purchaseQty: 0,
    salesReturnCount: 0,
    salesReturnQty: 0,
    salesReturnTotal: 0,
    purchaseReturnCount: 0,
    purchaseReturnQty: 0,
    purchaseReturnTotal: 0,
    currentStock: 0,
    imeiStock: 0,
    accessoryStock: 0,
    stockValue: 0,
    openingStock: 0,
    purchasedQty: 0,
    purchaseReturnQty: 0,
    soldQty: 0,
    salesReturnQty: 0,
    adjustmentsIn: 0,
    adjustmentsOut: 0,
    adjustments: 0,
    netMovement: 0,
    closingStock: 0,
  };

  const stockMovementPoints = data?.stockMovement || [];
  const itemWiseMovement = data?.itemWiseMovement || [];
  const categoryStock = data?.categoryStock || [];
  const brandStock = data?.brandStock || [];
  const lowStock = data?.lowStock || [];
  const outOfStock = data?.outOfStock || [];
  const topSelling = data?.topSelling || [];
  const recentTransactions = data?.recentTransactions || [];
  const recentBills = data?.recentBills || [];
  const customerDue = data?.customerDue || { totalDue: 0, dueCustomersCount: 0 };
  const emi = data?.emi || { pendingReceivable: 0, pendingCount: 0 };
  const repairs = data?.repairs || { pendingCount: 0, inProgressCount: 0, readyCount: 0 };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* 1. HEADER & DATE FILTER BAR */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-white/80 glass-strong p-4 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black tracking-tight text-foreground">Dashboard</h1>
            <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
              Store 01
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time Counter Terminal · Stock Control & Daily Operations
          </p>
        </div>

        {/* Date Filter Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-muted/60 p-1 border border-border/60">
            {(
              [
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "7d", label: "Last 7 Days" },
                { id: "30d", label: "Last 30 Days" },
                { id: "month", label: "This Month" },
                { id: "custom", label: "Custom" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setDateFilter(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  dateFilter === t.id
                    ? "bg-white text-primary shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {dateFilter === "custom" && (
            <div className="flex items-center gap-1.5 bg-white p-1 rounded-xl border border-border/80 text-xs">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="h-7 px-1.5 rounded-lg border border-border text-xs"
              />
              <span className="text-muted-foreground font-semibold">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="h-7 px-1.5 rounded-lg border border-border text-xs"
              />
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={fetchDashboardData}
            disabled={loading}
            className="h-8 text-xs font-bold gap-1 bg-white hover:bg-muted shadow-2xs"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* 2. QUICK ACTIONS (Compact buttons) */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-indigo-500/[0.04] to-transparent p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/pos"
            className="inline-flex items-center gap-1.5 rounded-xl bg-primary hover:bg-primary/90 px-3.5 py-2 text-xs font-extrabold text-white shadow-xs transition-all active:scale-[0.98]"
          >
            <Receipt className="size-3.5" />
            <span>New Sale (F1)</span>
          </Link>

          <Link
            to="/pos"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 shadow-2xs transition-all"
          >
            <ScanBarcode className="size-3.5 text-primary" />
            <span>Scan Barcode</span>
          </Link>

          {canViewPurchases && (
            <Link
              to="/purchase"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 shadow-2xs transition-all"
            >
              <ShoppingBag className="size-3.5 text-blue-600" />
              <span>Inward Purchase</span>
            </Link>
          )}

          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 shadow-2xs transition-all"
          >
            <UserPlus className="size-3.5 text-emerald-600" />
            <span>New Customer</span>
          </Link>

          <Link
            to="/repairs"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 shadow-2xs transition-all"
          >
            <Wrench className="size-3.5 text-amber-600" />
            <span>Service Job</span>
          </Link>

          <Link
            to="/emi"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15 shadow-2xs transition-all"
          >
            <CreditCard className="size-3.5" />
            <span>EMI Settlement</span>
          </Link>

          <Link
            to="/expenses"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white px-3 py-2 text-xs font-bold text-foreground hover:border-primary/40 shadow-2xs transition-all"
          >
            <ReceiptIndianRupee className="size-3.5 text-rose-600" />
            <span>Add Expense</span>
          </Link>
        </div>
      </section>

      {/* 3. TODAY'S BUSINESS (Or selected date period) */}
      <section className="space-y-2">
        <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
          <span>{dateFilter === "today" ? "Today's Business" : "Business for Period"}</span>
          <span className="text-[11px] font-mono lowercase">{summary.dateFrom} → {summary.dateTo}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* SALES */}
          {canViewSales && (
            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between hover:border-primary/40 transition-all">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="flex items-center gap-1.5 text-primary">
                  <Receipt className="size-3.5" /> SALES
                </span>
                <Badge tone="info">{summary.salesBills} Bills</Badge>
              </div>
              <div className="my-2.5">
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {inr(summary.salesTotal)}
                </div>
                <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                  {summary.salesQty} Items Sold
                </div>
              </div>
              <Link to="/reports" className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1">
                <span>View Sales Report</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}

          {/* PURCHASE */}
          {canViewPurchases && (
            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between hover:border-emerald-500/40 transition-all">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="flex items-center gap-1.5 text-emerald-600">
                  <ShoppingBag className="size-3.5" /> PURCHASE
                </span>
                <Badge tone="success">{summary.purchaseBills} Invoices</Badge>
              </div>
              <div className="my-2.5">
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {inr(summary.purchaseTotal)}
                </div>
                <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                  {summary.purchaseQty} Items Inward
                </div>
              </div>
              <Link to="/purchase" className="text-[11px] font-bold text-emerald-600 hover:underline flex items-center gap-1">
                <span>Purchase Inwards</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}

          {/* SALES RETURN */}
          {canViewSales && (
            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between hover:border-amber-500/40 transition-all">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="flex items-center gap-1.5 text-amber-600">
                  <ArrowDownLeft className="size-3.5" /> SALES RETURN
                </span>
                <Badge tone={summary.salesReturnQty > 0 ? "warning" : "neutral"}>
                  {summary.salesReturnCount} Returns
                </Badge>
              </div>
              <div className="my-2.5">
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {summary.salesReturnQty} <span className="text-sm font-semibold text-muted-foreground">Items</span>
                </div>
                <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                  Value: {inr(summary.salesReturnTotal)}
                </div>
              </div>
              <Link to="/returns" className="text-[11px] font-bold text-amber-600 hover:underline flex items-center gap-1">
                <span>Return Registry</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}

          {/* PURCHASE RETURN */}
          {canViewPurchases && (
            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between hover:border-purple-500/40 transition-all">
              <div className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                <span className="flex items-center gap-1.5 text-purple-600">
                  <ArrowUpRight className="size-3.5" /> PURCHASE RETURN
                </span>
                <Badge tone={summary.purchaseReturnQty > 0 ? "warning" : "neutral"}>
                  {summary.purchaseReturnCount} Returns
                </Badge>
              </div>
              <div className="my-2.5">
                <div className="text-2xl font-black text-foreground tracking-tight">
                  {summary.purchaseReturnQty} <span className="text-sm font-semibold text-muted-foreground">Items</span>
                </div>
                <div className="text-xs font-semibold text-muted-foreground mt-0.5">
                  Value: {inr(summary.purchaseReturnTotal)}
                </div>
              </div>
              <Link to="/returns" className="text-[11px] font-bold text-purple-600 hover:underline flex items-center gap-1">
                <span>Dealer Returns</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* 4. STOCK OVERVIEW */}
      {canViewStock && (
        <section className="space-y-2">
          <div className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-muted-foreground px-1">
            <span>Stock Overview</span>
            <span className="text-[11px]">Real-time Inventory Balance</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs">
              <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Package className="size-3.5 text-primary" /> CURRENT STOCK
              </div>
              <div className="text-2xl font-black text-foreground mt-2">
                {summary.currentStock} <span className="text-sm font-semibold text-muted-foreground">Units</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Total physical inventory</div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs">
              <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Smartphone className="size-3.5 text-indigo-600" /> IMEI STOCK
              </div>
              <div className="text-2xl font-black text-indigo-700 mt-2">
                {summary.imeiStock} <span className="text-sm font-semibold text-muted-foreground">Devices</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Serialized in stock</div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs">
              <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <Layers className="size-3.5 text-emerald-600" /> ACCESSORY STOCK
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-2">
                {summary.accessoryStock} <span className="text-sm font-semibold text-muted-foreground">Units</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Retail accessories & parts</div>
            </div>

            <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs">
              <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                <ReceiptIndianRupee className="size-3.5 text-amber-600" /> STOCK VALUE
              </div>
              <div className="text-2xl font-black text-foreground mt-2">
                {inr(summary.stockValue)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">Purchase cost valuation</div>
            </div>
          </div>
        </section>
      )}

      {/* 5. DAILY STOCK MOVEMENT (Core Highlight Section) */}
      {canViewStock && (
        <section className="space-y-3">
          <Card className="p-5 border-primary/30 shadow-md bg-gradient-to-b from-white via-white to-primary/[0.02]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-lg bg-primary text-white text-xs font-bold">
                    <TrendingUp className="size-3.5" />
                  </span>
                  <h2 className="text-base font-black text-foreground tracking-tight">DAILY STOCK MOVEMENT</h2>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Audited stock balance equation: Closing = Opening + Inward − Outward
                </p>
              </div>

              {/* DAILY COUNTS BADGES */}
              <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
                <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-xl border border-blue-200">
                  Purchased: +{summary.purchasedQty}
                </span>
                <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-xl border border-rose-200">
                  Sold: -{summary.soldQty}
                </span>
                <span className="bg-purple-50 text-purple-700 px-2.5 py-1 rounded-xl border border-purple-200">
                  Purchase Return: -{summary.purchaseReturnQty}
                </span>
                <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-xl border border-amber-200">
                  Sales Return: +{summary.salesReturnQty}
                </span>
                <span className={`px-2.5 py-1 rounded-xl border ${
                  summary.netMovement >= 0
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-rose-50 text-rose-700 border-rose-200"
                }`}>
                  Net Movement: {summary.netMovement >= 0 ? `+${summary.netMovement}` : summary.netMovement} Items
                </span>
                <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-xl border border-slate-300">
                  Current Stock: {summary.currentStock} Items
                </span>
              </div>
            </div>

            {/* FORMULA FLOW CARDS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-4 text-center">
              <div className="rounded-xl border border-border/80 bg-slate-50 p-3">
                <div className="text-[10.5px] font-bold text-muted-foreground uppercase">Opening</div>
                <div className="text-xl font-black text-foreground mt-1">{summary.openingStock}</div>
                <div className="text-[10px] text-muted-foreground">Start of period</div>
              </div>

              <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3">
                <div className="text-[10.5px] font-bold text-blue-700 uppercase">+ Purchased</div>
                <div className="text-xl font-black text-blue-700 mt-1">+{summary.purchasedQty}</div>
                <div className="text-[10px] text-blue-600/80">Inward stock</div>
              </div>

              <div className="rounded-xl border border-purple-200 bg-purple-50/60 p-3">
                <div className="text-[10.5px] font-bold text-purple-700 uppercase">− Purchase Ret</div>
                <div className="text-xl font-black text-purple-700 mt-1">
                  {summary.purchaseReturnQty > 0 ? `-${summary.purchaseReturnQty}` : "0"}
                </div>
                <div className="text-[10px] text-purple-600/80">Returned to dealer</div>
              </div>

              <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3">
                <div className="text-[10.5px] font-bold text-rose-700 uppercase">− Sold</div>
                <div className="text-xl font-black text-rose-700 mt-1">
                  {summary.soldQty > 0 ? `-${summary.soldQty}` : "0"}
                </div>
                <div className="text-[10px] text-rose-600/80">Customer sales</div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
                <div className="text-[10.5px] font-bold text-amber-700 uppercase">+ Sales Ret</div>
                <div className="text-xl font-black text-amber-700 mt-1">
                  {summary.salesReturnQty > 0 ? `+${summary.salesReturnQty}` : "0"}
                </div>
                <div className="text-[10px] text-amber-600/80">Customer return</div>
              </div>

              <div className="rounded-xl border border-border/80 bg-slate-50 p-3">
                <div className="text-[10.5px] font-bold text-muted-foreground uppercase">± Adjustment</div>
                <div className="text-xl font-black text-foreground mt-1">
                  {summary.adjustments >= 0 ? `+${summary.adjustments}` : summary.adjustments}
                </div>
                <div className="text-[10px] text-muted-foreground">Audit corrections</div>
              </div>

              <div className="col-span-2 sm:col-span-2 lg:col-span-1 rounded-xl border border-emerald-300 bg-emerald-500/10 p-3">
                <div className="text-[10.5px] font-black text-emerald-800 uppercase">= Closing</div>
                <div className="text-2xl font-black text-emerald-700 mt-0.5">{summary.closingStock}</div>
                <div className="text-[10px] text-emerald-800 font-semibold">Available now</div>
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* 6. ITEM-WISE DAILY MOVEMENT TABLE */}
      {canViewStock && (
        <Card className="p-0 overflow-hidden shadow-xs border-border/80">
          <CardHead
            title="Today's Item Movement"
            sub="Item-by-item opening, transactions, and closing stock balance"
            right={
              <Badge tone={itemWiseMovement.length > 0 ? "info" : "neutral"}>
                {itemWiseMovement.length} items moved
              </Badge>
            }
          />
          <div className="overflow-x-auto">
            {itemWiseMovement.length === 0 ? (
              <div className="py-10 text-center">
                <Empty text="No stock movement recorded for the selected period." />
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">#</th>
                    <th className="py-3 px-3">Product / Model</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Brand</th>
                    <th className="py-3 px-3 text-right">Opening</th>
                    <th className="py-3 px-3 text-right text-blue-600">Purchased</th>
                    <th className="py-3 px-3 text-right text-purple-600">Purchase Ret</th>
                    <th className="py-3 px-3 text-right text-rose-600">Sold</th>
                    <th className="py-3 px-3 text-right text-amber-600">Sales Ret</th>
                    <th className="py-3 px-3 text-right font-black text-emerald-700">Closing</th>
                    <th className="py-3 px-3 text-center">Tracking</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {itemWiseMovement.map((row, idx) => (
                    <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                      <td className="py-2.5 px-3 text-center text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="py-2.5 px-3 font-bold text-foreground">
                        <div>{row.name}</div>
                        {row.model && row.model !== "—" && (
                          <div className="text-[10px] text-muted-foreground font-normal">{row.model}</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{row.category}</td>
                      <td className="py-2.5 px-3 text-foreground font-medium">{row.brand}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold">{row.opening}</td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-blue-600">
                        {row.purchased > 0 ? `+${row.purchased}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-purple-600">
                        {row.purchaseReturn > 0 ? `-${row.purchaseReturn}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600">
                        {row.sold > 0 ? `-${row.sold}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-amber-600">
                        {row.salesReturn > 0 ? `+${row.salesReturn}` : "0"}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700 text-[13px]">
                        {row.closing}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row.isImei ? (
                          <Badge tone="info" className="text-[9.5px]">IMEI</Badge>
                        ) : (
                          <Badge tone="neutral" className="text-[9.5px]">Qty</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      {/* 7. STOCK MOVEMENT CHART */}
      {canViewStock && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">STOCK MOVEMENT TREND</h3>
              <p className="text-[11px] text-muted-foreground">Daily purchases, sales, and returns over time</p>
            </div>
            {/* Chart Legend */}
            <div className="flex items-center gap-3 text-xs font-semibold">
              <span className="flex items-center gap-1.5 text-blue-600">
                <span className="size-2.5 rounded-full bg-blue-500 inline-block" /> Purchases
              </span>
              <span className="flex items-center gap-1.5 text-emerald-600">
                <span className="size-2.5 rounded-full bg-emerald-500 inline-block" /> Sales
              </span>
              <span className="flex items-center gap-1.5 text-purple-600">
                <span className="size-2.5 rounded-full bg-purple-500 inline-block" /> Purchase Returns
              </span>
              <span className="flex items-center gap-1.5 text-amber-600">
                <span className="size-2.5 rounded-full bg-amber-500 inline-block" /> Sales Returns
              </span>
            </div>
          </div>

          {/* SVG Multi-bar / trend visualizer */}
          <div className="pt-2">
            {stockMovementPoints.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">No trend data available</div>
            ) : (
              <div className="grid grid-cols-7 gap-2 items-end min-h-[140px] pt-6 px-2">
                {stockMovementPoints.map((pt) => {
                  const maxVal = Math.max(
                    ...stockMovementPoints.map((p) => Math.max(p.purchases, p.sales, p.purchaseReturns, p.salesReturns, 5)),
                  );
                  const pHeight = Math.min(100, Math.round((pt.purchases / maxVal) * 100));
                  const sHeight = Math.min(100, Math.round((pt.sales / maxVal) * 100));

                  return (
                    <div key={pt.date} className="flex flex-col items-center gap-1 group">
                      <div className="w-full flex items-end justify-center gap-1 h-28 bg-muted/20 rounded-xl p-1 relative">
                        {/* Tooltip on hover */}
                        <div className="absolute -top-12 z-20 hidden group-hover:flex flex-col bg-slate-900 text-white text-[10px] p-1.5 rounded-lg shadow-md whitespace-nowrap">
                          <span>{pt.displayDate}:</span>
                          <span>Purchase: {pt.purchases} · Sales: {pt.sales}</span>
                        </div>

                        {/* Purchase Bar */}
                        <div
                          style={{ height: `${Math.max(6, pHeight)}%` }}
                          className="w-1/2 max-w-[14px] bg-blue-500 rounded-t-md transition-all group-hover:bg-blue-600"
                          title={`Purchased: ${pt.purchases}`}
                        />
                        {/* Sales Bar */}
                        <div
                          style={{ height: `${Math.max(6, sHeight)}%` }}
                          className="w-1/2 max-w-[14px] bg-emerald-500 rounded-t-md transition-all group-hover:bg-emerald-600"
                          title={`Sold: ${pt.sales}`}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-muted-foreground">{pt.displayDate}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 8. CATEGORY STOCK & BRAND STOCK (2 Columns) */}
      {canViewStock && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* CATEGORY STOCK */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-foreground">CATEGORY STOCK</h3>
                <p className="text-[11px] text-muted-foreground">Click category to inspect stock items</p>
              </div>
              <Link to="/reports" className="text-xs font-bold text-primary hover:underline">
                View All →
              </Link>
            </div>

            <div className="divide-y divide-border/60">
              {categoryStock.map((c) => (
                <Link
                  key={c.category}
                  to="/reports"
                  className="flex items-center justify-between py-2 hover:bg-muted/30 px-2 rounded-lg transition-colors"
                >
                  <span className="font-semibold text-xs text-foreground">{c.category}</span>
                  <div className="flex items-center gap-3">
                    <Badge tone={c.quantity > 0 ? "info" : "neutral"} className="text-[10px]">
                      {c.quantity} Units
                    </Badge>
                    <span className="num font-bold text-xs text-foreground w-20 text-right">
                      {inr(c.stockValue)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          {/* BRAND STOCK */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-foreground">BRAND STOCK</h3>
                <p className="text-[11px] text-muted-foreground">Inventory distribution by hardware brand</p>
              </div>
              <Link to="/reports" className="text-xs font-bold text-primary hover:underline">
                View All →
              </Link>
            </div>

            <div className="divide-y divide-border/60 max-h-[380px] overflow-y-auto pr-1">
              {brandStock.length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">No brand inventory</div>
              ) : (
                brandStock.map((b) => (
                  <Link
                    key={b.brand}
                    to="/reports"
                    className="flex items-center justify-between py-2 hover:bg-muted/30 px-2 rounded-lg transition-colors"
                  >
                    <span className="font-semibold text-xs text-foreground">{b.brand}</span>
                    <div className="flex items-center gap-3">
                      <Badge tone={b.units > 0 ? "success" : "neutral"} className="text-[10px]">
                        {b.units} Units
                      </Badge>
                      <span className="num font-bold text-xs text-foreground w-20 text-right">
                        {inr(b.stockValue)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>
      )}

      {/* 9. LOW STOCK & OUT OF STOCK (2 Columns) */}
      {canViewStock && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* LOW STOCK */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-500" />
                <h3 className="text-sm font-bold text-foreground">LOW STOCK</h3>
              </div>
              <Link to="/stock" className="text-xs font-bold text-primary hover:underline">
                [View All]
              </Link>
            </div>

            {lowStock.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                All inventory items are above reorder level.
              </div>
            ) : (
              <div className="divide-y divide-border/60 text-xs">
                {lowStock.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-bold text-foreground">{item.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">{item.category} · {item.brand}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-amber-600">
                        {item.currentStock} left (Min: {item.minStock})
                      </span>
                      <Badge tone="warning" className="text-[9.5px]">Low</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* OUT OF STOCK */}
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div className="flex items-center gap-1.5">
                <XCircle className="size-4 text-rose-500" />
                <h3 className="text-sm font-bold text-foreground">OUT OF STOCK</h3>
              </div>
              <Link to="/stock" className="text-xs font-bold text-primary hover:underline">
                [View All]
              </Link>
            </div>

            {outOfStock.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No products are currently out of stock.
              </div>
            ) : (
              <div className="divide-y divide-border/60 text-xs">
                {outOfStock.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2">
                    <div>
                      <div className="font-bold text-foreground">{item.name}</div>
                      <div className="text-[10.5px] text-muted-foreground">{item.category} · {item.brand}</div>
                    </div>
                    <Badge tone="danger" className="text-[9.5px]">0 in stock</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 10. TOP SELLING PRODUCTS */}
      {canViewSales && (
        <Card className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-foreground">TOP SELLING PRODUCTS</h3>
              <p className="text-[11px] text-muted-foreground">Ranked by units sold based on verified customer sales</p>
            </div>

            {/* Range Toggle: Today | 7 Days | 30 Days */}
            <div className="flex items-center rounded-xl bg-muted/60 p-0.5 border border-border/60 text-xs">
              {(
                [
                  { id: "today", label: "Today" },
                  { id: "7d", label: "7 Days" },
                  { id: "30d", label: "30 Days" },
                ] as const
              ).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTopSellingRange(r.id)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    topSellingRange === r.id
                      ? "bg-white text-primary shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {topSelling.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No sales recorded for this period.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 border-b border-border text-[11px] font-bold text-muted-foreground uppercase">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">#</th>
                    <th className="py-2.5 px-3">Product</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-right">Qty Sold</th>
                    <th className="py-2.5 px-3 text-right">Sales Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {topSelling.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="py-2 px-3 text-center text-muted-foreground font-mono">{idx + 1}</td>
                      <td className="py-2 px-3 font-bold text-foreground">
                        {p.name} {p.model && p.model !== "—" ? `(${p.model})` : ""}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">{p.category}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-primary">
                        {p.qtySold} Units
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                        {inr(p.salesValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 11. RECENT TRANSACTIONS & RECENT BILLS (2 Columns) */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* RECENT TRANSACTIONS */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
            <div>
              <h3 className="text-sm font-bold text-foreground">RECENT TRANSACTIONS</h3>
              <p className="text-[11px] text-muted-foreground">Latest 10 retail, purchase, and store events</p>
            </div>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No recent transactions</div>
          ) : (
            <div className="divide-y divide-border/60 text-xs">
              {recentTransactions.map((tx) => {
                const toneMap: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
                  SALE: "info",
                  PURCHASE: "success",
                  SALE_RETURN: "warning",
                  PURCHASE_RETURN: "warning",
                  PAYMENT: "success",
                  EXPENSE: "danger",
                  REPAIR: "neutral",
                };
                return (
                  <div key={tx.id} className="flex items-center justify-between py-2">
                    <div className="min-w-0 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Badge tone={toneMap[tx.type] || "neutral"} className="text-[9.5px]">
                          {tx.type.replace("_", " ")}
                        </Badge>
                        <span className="font-mono font-semibold text-foreground truncate">{tx.reference}</span>
                      </div>
                      <div className="text-[10.5px] text-muted-foreground truncate mt-0.5">
                        {tx.partyName} · By {tx.user}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold font-mono text-foreground">{inr(tx.amount)}</div>
                      <div className="text-[10px] text-muted-foreground">{tx.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* RECENT BILLS */}
        {canViewSales && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-border/70 pb-2.5">
              <div>
                <h3 className="text-sm font-bold text-foreground">RECENT BILLS</h3>
                <p className="text-[11px] text-muted-foreground">Counter sales invoices & payments</p>
              </div>
              <Link
                to="/reports"
                search={{ tab: "invoices" }}
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                <span>[View All Bills]</span>
                <ArrowRight className="size-3" />
              </Link>
            </div>

            {recentBills.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">No bills generated yet</div>
            ) : (
              <div className="divide-y divide-border/60 text-xs">
                {recentBills.map((bill) => (
                  <div
                    key={bill.id}
                    onClick={() => handleOpenBill(bill.id, bill.invoiceNo)}
                    className="flex items-center justify-between py-2.5 px-2 -mx-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer group"
                    title="Click to view & print invoice"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-mono font-bold text-primary group-hover:underline flex items-center gap-1.5">
                        <span>{bill.invoiceNo}</span>
                        {bill.time && (
                          <span className="text-[10px] text-muted-foreground font-normal">
                            {bill.time.includes("T") ? bill.time.split("T")[0] : bill.time}
                          </span>
                        )}
                      </div>
                      <div className="text-[10.5px] text-muted-foreground truncate">{bill.customer}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold font-mono text-foreground">{inr(bill.amount)}</span>
                      <Badge
                        tone={bill.paymentStatus === "Paid" ? "success" : bill.paymentStatus === "Partial" ? "warning" : "danger"}
                        className="text-[9.5px]"
                      >
                        {bill.paymentStatus}
                      </Badge>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenBill(bill.id, bill.invoiceNo);
                        }}
                        className="h-6.5 px-2 text-[11px] font-bold gap-1 bg-primary/10 text-primary hover:bg-primary/20 border-primary/20 shadow-none"
                      >
                        <Eye className="size-3" /> View Bill
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>

      {/* 12. PENDING EMI, CUSTOMER DUE, REPAIRS (3 Columns) */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* PENDING EMI */}
        <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <CreditCard className="size-3.5 text-primary" /> PENDING EMI FINANCE
            </div>
            <div className="text-xl font-black text-foreground mt-2">
              {inr(emi.pendingReceivable)}
            </div>
            <div className="text-xs font-semibold text-muted-foreground mt-0.5">
              {emi.pendingCount} Pending Settlements
            </div>
          </div>
          <Link
            to="/emi"
            className="mt-3 text-xs font-bold text-primary hover:underline flex items-center gap-1"
          >
            <span>Open EMI Settlements</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        {/* CUSTOMER DUE */}
        <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <ReceiptIndianRupee className="size-3.5 text-rose-600" /> CUSTOMER DUE
            </div>
            <div className="text-xl font-black text-rose-600 mt-2">
              {inr(customerDue.totalDue)}
            </div>
            <div className="text-xs font-semibold text-muted-foreground mt-0.5">
              {customerDue.dueCustomersCount} Customers with outstanding balance
            </div>
          </div>
          <Link
            to="/customers"
            className="mt-3 text-xs font-bold text-rose-600 hover:underline flex items-center gap-1"
          >
            <span>[View Due & WhatsApp]</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        {/* REPAIRS SUMMARY */}
        <div className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
              <Wrench className="size-3.5 text-amber-600" /> REPAIR SERVICE
            </div>
            <div className="flex items-center gap-3 mt-2">
              <div>
                <span className="text-lg font-black text-foreground">{repairs.pendingCount}</span>
                <span className="text-[10px] text-muted-foreground block">Pending</span>
              </div>
              <div className="h-6 w-px bg-border/80" />
              <div>
                <span className="text-lg font-black text-amber-600">{repairs.inProgressCount}</span>
                <span className="text-[10px] text-muted-foreground block">In Progress</span>
              </div>
              <div className="h-6 w-px bg-border/80" />
              <div>
                <span className="text-lg font-black text-emerald-600">{repairs.readyCount}</span>
                <span className="text-[10px] text-muted-foreground block">Ready</span>
              </div>
            </div>
          </div>
          <Link
            to="/repairs"
            className="mt-3 text-xs font-bold text-amber-600 hover:underline flex items-center gap-1"
          >
            <span>Repair Service Desk</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>

      {/* UNIVERSAL INVOICE MODAL FOR RECENT BILLS */}
      {selectedSale && (
        <InvoiceModal
          open={Boolean(selectedSale)}
          onClose={() => setSelectedSale(null)}
          {...saleToInvoiceProps(selectedSale, db)}
        />
      )}
    </div>
  );
}
