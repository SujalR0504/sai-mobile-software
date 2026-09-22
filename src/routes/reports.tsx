import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHead,
  Row,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { customerDue, lowStockProducts, saleProfit, stockOf, useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import type {
  ItemWiseReportRow,
  ItemWiseSummary,
  ProductStockLedgerEntry,
  ImeiWiseReportRow,
  CreditNoteReportRow,
  DebitNoteReportRow,
  CustomerCreditBalanceRow,
  DealerCreditBalanceRow,
} from "@/lib/types";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [{ title: "Reports & Financial Analytics — Mobile Store ERP" }],
  }),
  component: ReportsPage,
});

function ReportsPage() {
  const { db } = useStore();
  const [activeTab, setActiveTab] = useState<
    "overview" | "item_wise" | "imei_wise" | "emi" | "dealers" | "categories" | "gst" | "credit_notes" | "debit_notes" | "customer_credit" | "dealer_credit"
  >("overview");

  // Remote reports data
  const [emiReport, setEmiReport] = useState<any>(null);
  const [dealerReport, setDealerReport] = useState<any>(null);
  const [categoryReport, setCategoryReport] = useState<any[]>([]);
  const [loadingReports, setLoadingReports] = useState(false);

  // Item-Wise Stock Report State
  const [itemStartDate, setItemStartDate] = useState("");
  const [itemEndDate, setItemEndDate] = useState("");
  const [itemCategory, setItemCategory] = useState("ALL");
  const [itemBrand, setItemBrand] = useState("ALL");
  const [itemProductType, setItemProductType] = useState<"ALL" | "TRACKED" | "BULK">("ALL");
  const [itemGstType, setItemGstType] = useState<"ALL" | "GST" | "NON_GST">("ALL");
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [itemWiseRows, setItemWiseRows] = useState<ItemWiseReportRow[]>([]);
  const [itemWiseSummary, setItemWiseSummary] = useState<ItemWiseSummary | null>(null);
  const [loadingItemWise, setLoadingItemWise] = useState(false);

  // Product Movement Drilldown State
  const [drilldownProduct, setDrilldownProduct] = useState<ItemWiseReportRow | null>(null);
  const [drilldownLedger, setDrilldownLedger] = useState<ProductStockLedgerEntry[]>([]);
  const [loadingDrilldown, setLoadingDrilldown] = useState(false);

  // IMEI-Wise Report State
  const [imeiSearch, setImeiSearch] = useState("");
  const [imeiStatus, setImeiStatus] = useState("ALL");
  const [imeiBrand, setImeiBrand] = useState("ALL");
  const [imeiWiseRows, setImeiWiseRows] = useState<ImeiWiseReportRow[]>([]);
  const [loadingImeiWise, setLoadingImeiWise] = useState(false);

  // Categories and Brands from products
  const categoriesList = useMemo(() => {
    return Array.from(new Set(db.products.map((p) => p.category).filter(Boolean)));
  }, [db.products]);

  const brandsList = useMemo(() => {
    return Array.from(new Set(db.products.map((p) => p.brand).filter(Boolean)));
  }, [db.products]);

  // Load Item-Wise Report
  const loadItemWiseReport = async () => {
    setLoadingItemWise(true);
    try {
      const params = new URLSearchParams();
      if (itemStartDate) params.append("startDate", itemStartDate);
      if (itemEndDate) params.append("endDate", itemEndDate);
      if (itemCategory !== "ALL") params.append("category", itemCategory);
      if (itemBrand !== "ALL") params.append("brand", itemBrand);
      if (itemProductType !== "ALL") params.append("productType", itemProductType);
      if (itemGstType !== "ALL") params.append("gstType", itemGstType);

      const res = await fetch(`/api/reports/item-wise?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setItemWiseRows(data.rows || []);
        setItemWiseSummary(data.summary || null);
      }
    } catch (e) {
      console.error("Error loading item-wise report", e);
    } finally {
      setLoadingItemWise(false);
    }
  };

  // Load IMEI-Wise Report
  const loadImeiWiseReport = async () => {
    setLoadingImeiWise(true);
    try {
      const params = new URLSearchParams();
      if (imeiSearch.trim()) params.append("search", imeiSearch.trim());
      if (imeiStatus !== "ALL") params.append("status", imeiStatus);
      if (imeiBrand !== "ALL") params.append("brand", imeiBrand);

      const res = await fetch(`/api/reports/imei-wise?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setImeiWiseRows(data || []);
      }
    } catch (e) {
      console.error("Error loading IMEI-wise report", e);
    } finally {
      setLoadingImeiWise(false);
    }
  };

  // Open Product Movement Drilldown
  const openDrilldown = async (row: ItemWiseReportRow) => {
    setDrilldownProduct(row);
    setLoadingDrilldown(true);
    try {
      const res = await fetch(`/api/reports/item-wise/${row.productId}/drilldown`);
      if (res.ok) {
        const data = await res.json();
        setDrilldownLedger(data);
      }
    } catch (e) {
      console.error("Error loading drilldown ledger", e);
    } finally {
      setLoadingDrilldown(false);
    }
  };

  // Credit Notes Report State
  const [cnStartDate, setCnStartDate] = useState("");
  const [cnEndDate, setCnEndDate] = useState("");
  const [cnStatus, setCnStatus] = useState("ALL");
  const [cnCustomerId, setCnCustomerId] = useState("ALL");
  const [cnRows, setCnRows] = useState<CreditNoteReportRow[]>([]);
  const [cnSummary, setCnSummary] = useState<any>(null);
  const [loadingCn, setLoadingCn] = useState(false);

  const loadCnReport = async () => {
    setLoadingCn(true);
    try {
      const params = new URLSearchParams();
      if (cnStartDate) params.append("startDate", cnStartDate);
      if (cnEndDate) params.append("endDate", cnEndDate);
      if (cnStatus !== "ALL") params.append("status", cnStatus);
      if (cnCustomerId !== "ALL") params.append("customerId", cnCustomerId);
      const res = await fetch(`/api/reports/credit-notes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setCnRows(data.rows || []);
        setCnSummary(data.summary || null);
      }
    } catch (e) {
      console.error("Error loading credit notes report", e);
    } finally {
      setLoadingCn(false);
    }
  };

  // Debit Notes Report State
  const [dnStartDate, setDnStartDate] = useState("");
  const [dnEndDate, setDnEndDate] = useState("");
  const [dnStatus, setDnStatus] = useState("ALL");
  const [dnSupplierId, setDnSupplierId] = useState("ALL");
  const [dnRows, setDnRows] = useState<DebitNoteReportRow[]>([]);
  const [dnSummary, setDnSummary] = useState<any>(null);
  const [loadingDn, setLoadingDn] = useState(false);

  const loadDnReport = async () => {
    setLoadingDn(true);
    try {
      const params = new URLSearchParams();
      if (dnStartDate) params.append("startDate", dnStartDate);
      if (dnEndDate) params.append("endDate", dnEndDate);
      if (dnStatus !== "ALL") params.append("status", dnStatus);
      if (dnSupplierId !== "ALL") params.append("supplierId", dnSupplierId);
      const res = await fetch(`/api/reports/debit-notes?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDnRows(data.rows || []);
        setDnSummary(data.summary || null);
      }
    } catch (e) {
      console.error("Error loading debit notes report", e);
    } finally {
      setLoadingDn(false);
    }
  };

  // Customer Credit Balance Report State
  const [custCreditRows, setCustCreditRows] = useState<CustomerCreditBalanceRow[]>([]);
  const [custCreditSummary, setCustCreditSummary] = useState<any>(null);
  const [loadingCustCredit, setLoadingCustCredit] = useState(false);

  const loadCustCreditReport = async () => {
    setLoadingCustCredit(true);
    try {
      const res = await fetch("/api/reports/customer-credit-balance");
      if (res.ok) {
        const data = await res.json();
        setCustCreditRows(data.rows || []);
        setCustCreditSummary(data.summary || null);
      }
    } catch (e) {
      console.error("Error loading customer credit balance report", e);
    } finally {
      setLoadingCustCredit(false);
    }
  };

  // Dealer Credit Balance Report State
  const [dealerCreditRows, setDealerCreditRows] = useState<DealerCreditBalanceRow[]>([]);
  const [dealerCreditSummary, setDealerCreditSummary] = useState<any>(null);
  const [loadingDealerCredit, setLoadingDealerCredit] = useState(false);

  const loadDealerCreditReport = async () => {
    setLoadingDealerCredit(true);
    try {
      const res = await fetch("/api/reports/dealer-credit-balance");
      if (res.ok) {
        const data = await res.json();
        setDealerCreditRows(data.rows || []);
        setDealerCreditSummary(data.summary || null);
      }
    } catch (e) {
      console.error("Error loading dealer credit balance report", e);
    } finally {
      setLoadingDealerCredit(false);
    }
  };

  useEffect(() => {
    if (activeTab === "item_wise") {
      loadItemWiseReport();
    } else if (activeTab === "imei_wise") {
      loadImeiWiseReport();
    } else if (activeTab === "credit_notes") {
      loadCnReport();
    } else if (activeTab === "debit_notes") {
      loadDnReport();
    } else if (activeTab === "customer_credit") {
      loadCustCreditReport();
    } else if (activeTab === "dealer_credit") {
      loadDealerCreditReport();
    }
  }, [
    activeTab,
    itemCategory,
    itemBrand,
    itemProductType,
    itemGstType,
    imeiStatus,
    imeiBrand,
    cnStartDate,
    cnEndDate,
    cnStatus,
    cnCustomerId,
    dnStartDate,
    dnEndDate,
    dnStatus,
    dnSupplierId,
  ]);

  const filteredItemWiseRows = useMemo(() => {
    const q = itemSearchQuery.trim().toLowerCase();
    if (!q) return itemWiseRows;
    return itemWiseRows.filter(
      (r) =>
        r.productName.toLowerCase().includes(q) ||
        r.brand.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        (r.model && r.model.toLowerCase().includes(q)) ||
        (r.hsn && r.hsn.toLowerCase().includes(q))
    );
  }, [itemWiseRows, itemSearchQuery]);

  // Export functions
  const exportItemWiseCSV = () => {
    if (filteredItemWiseRows.length === 0) return;
    const headers = [
      "Product Name",
      "Category",
      "Brand",
      "Model",
      "Type",
      "HSN/SAC",
      "GST Rate",
      "Opening Stock",
      "Purchases In",
      "Purchase Returns Out",
      "Sales Out",
      "Sale Returns In",
      "Adjustments",
      "Closing Stock",
      "Purchase Cost",
      "Selling Price",
      "Stock Valuation",
    ];
    const rows = filteredItemWiseRows.map((r) => [
      `"${r.productName.replace(/"/g, '""')}"`,
      `"${r.category}"`,
      `"${r.brand}"`,
      `"${r.model || ""}"`,
      r.tracked ? "Tracked (IMEI)" : "Bulk (Qty)",
      r.hsn || "",
      `${r.gstRate}%`,
      r.openingStock,
      r.purchasesIn,
      r.purchaseReturnsOut,
      r.salesOut,
      r.saleReturnsIn,
      r.adjustments,
      r.closingStock,
      r.purchasePrice,
      r.sellingPrice,
      r.stockValuation,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `item_wise_stock_report_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportImeiWiseCSV = () => {
    if (imeiWiseRows.length === 0) return;
    const headers = [
      "IMEI Number",
      "Product Name",
      "Category",
      "Brand",
      "Status",
      "Purchase Date",
      "Dealer Name",
      "Inward Bill #",
      "Purchase Cost",
      "Sale Date",
      "Customer Name",
      "Outward Invoice #",
      "Selling Price",
      "Days in Inventory",
    ];
    const rows = imeiWiseRows.map((r) => [
      `"${r.imei}"`,
      `"${r.productName.replace(/"/g, '""')}"`,
      `"${r.category}"`,
      `"${r.brand}"`,
      r.status,
      r.purchaseDate || "",
      `"${r.dealerName || ""}"`,
      `"${r.purchaseInvoiceNo || ""}"`,
      r.purchaseCost || 0,
      r.saleDate || "",
      `"${r.customerName || ""}"`,
      `"${r.saleInvoiceNo || ""}"`,
      r.sellingPrice || 0,
      r.daysInStock || 0,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `imei_wise_report_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCreditNotesCSV = () => {
    if (cnRows.length === 0) return;
    const headers = [
      "Date",
      "Credit Note #",
      "Original Invoice #",
      "Original Invoice Date",
      "Customer Name",
      "Customer Phone",
      "Return Type",
      "Items Summary",
      "Subtotal",
      "CGST",
      "SGST",
      "IGST",
      "Total Amount",
      "Refunded Amount",
      "Applied Amount",
      "Remaining Balance",
      "Status",
    ];
    const rows = cnRows.map((r) => [
      r.date,
      `"${r.noteNumber}"`,
      `"${r.originalInvoiceNo || ""}"`,
      r.originalInvoiceDate || "",
      `"${r.customerName}"`,
      `"${r.customerPhone || ""}"`,
      r.physicalReturn ? "Physical Return" : "Financial Adjustment",
      `"${(r.itemsSummary || "").replace(/"/g, '""')}"`,
      r.subtotal,
      r.cgst,
      r.sgst,
      r.igst,
      r.total,
      r.refundedAmount,
      r.appliedAmount,
      r.remainingAmount,
      r.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `credit_notes_report_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportDebitNotesCSV = () => {
    if (dnRows.length === 0) return;
    const headers = [
      "Date",
      "Debit Note #",
      "Original Purchase Bill #",
      "Original Bill Date",
      "Dealer Name",
      "Return Type",
      "Items Summary",
      "Subtotal",
      "CGST",
      "SGST",
      "IGST",
      "Total Amount",
      "Refunded Amount",
      "Applied Amount",
      "Remaining Balance",
      "Status",
    ];
    const rows = dnRows.map((r) => [
      r.date,
      `"${r.noteNumber}"`,
      `"${r.originalInvoiceNo || ""}"`,
      r.originalInvoiceDate || "",
      `"${r.dealerName}"`,
      r.physicalReturn ? "Physical Return" : "Financial Adjustment",
      `"${(r.itemsSummary || "").replace(/"/g, '""')}"`,
      r.subtotal,
      r.cgst,
      r.sgst,
      r.igst,
      r.total,
      r.refundedAmount,
      r.appliedAmount,
      r.remainingAmount,
      r.status,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `debit_notes_report_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportCustomerCreditCSV = () => {
    if (custCreditRows.length === 0) return;
    const headers = [
      "Customer Name",
      "Mobile",
      "Total Notes Issued",
      "Total Credit Amount",
      "Total Used / Adjusted",
      "Total Refunded",
      "Current Credit Balance Available",
    ];
    const rows = custCreditRows.map((r) => [
      `"${r.customerName}"`,
      `"${r.phone || ""}"`,
      r.totalNotes,
      r.totalCreditAmount,
      r.totalApplied,
      r.totalRefunded,
      r.currentCreditBalance,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `customer_credit_balance_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportDealerCreditCSV = () => {
    if (dealerCreditRows.length === 0) return;
    const headers = [
      "Dealer Name",
      "Mobile / Phone",
      "Total Debit Notes Raised",
      "Total Debit Amount",
      "Total Used / Adjusted",
      "Total Refunded",
      "Current Available Debit Balance",
    ];
    const rows = dealerCreditRows.map((r) => [
      `"${r.dealerName}"`,
      `"${r.phone || ""}"`,
      r.totalNotes,
      r.totalDebitAmount,
      r.totalApplied,
      r.totalRefunded,
      r.currentCreditBalance,
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `dealer_credit_balance_${todayISO()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  useEffect(() => {
    setLoadingReports(true);
    Promise.all([
      fetch("/api/reports/emi").then((r) => r.json()).catch(() => null),
      fetch("/api/reports/dealers").then((r) => r.json()).catch(() => null),
      fetch("/api/reports/categories").then((r) => r.json()).catch(() => []),
    ]).then(([emi, dealers, cats]) => {
      if (emi) setEmiReport(emi);
      if (dealers) setDealerReport(dealers);
      if (Array.isArray(cats)) setCategoryReport(cats);
      setLoadingReports(false);
    });
  }, []);

  // All-time sales
  const nonQuotationSales = useMemo(() => db.sales.filter((s) => !s.quotation), [db.sales]);
  const totalSalesRevenue = useMemo(
    () => nonQuotationSales.reduce((a, s) => a + s.total, 0),
    [nonQuotationSales],
  );
  const totalProfit = useMemo(
    () => nonQuotationSales.reduce((a, s) => a + saleProfit(s), 0),
    [nonQuotationSales],
  );
  const totalExpenses = useMemo(() => db.expenses.reduce((a, e) => a + e.amount, 0), [db.expenses]);
  const netProfit = totalProfit - totalExpenses;

  // Inventory valuation
  const inventoryValuation = useMemo(() => {
    let totalCost = 0;
    let totalRetail = 0;
    let availableUnits = 0;

    for (const p of db.products) {
      const stock = stockOf(db, p.id);
      availableUnits += stock;
      totalCost += stock * p.purchasePrice;
      totalRetail += stock * p.sellingPrice;
    }

    return { totalCost, totalRetail, availableUnits };
  }, [db]);

  // Cash flow summary
  const cashIn = db.payments
    .filter((p) => p.party === "customer" && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);

  const cashOut = db.payments
    .filter((p) => (p.party === "supplier" || p.party === "dealer") && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);

  const cashInHand = db.settings.openingCash + cashIn - cashOut - totalExpenses;
  const low = lowStockProducts(db);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Reports & Store Analytics"
        sub="P&L summary, EMI receivables, dealer accounts, category stock valuation, and cash flow."
      />

      {/* Tabs */}
      <div className="flex border-b border-border text-[13px] font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "overview"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Overview & P&L
        </button>
        <button
          onClick={() => setActiveTab("item_wise")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "item_wise"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Item-Wise Stock Report
        </button>
        <button
          onClick={() => setActiveTab("imei_wise")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "imei_wise"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          IMEI-Wise Report
        </button>
        <button
          onClick={() => setActiveTab("emi")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "emi"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          EMI Finance Report
        </button>
        <button
          onClick={() => setActiveTab("dealers")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "dealers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Dealer Accounts Report
        </button>
        <button
          onClick={() => setActiveTab("categories")}
          className={`px-4 py-2 border-b-2 transition-colors ${
            activeTab === "categories"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Category Stock Valuation
        </button>
        <button
          onClick={() => setActiveTab("gst")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "gst"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          GST & TDS 194R Analytics
        </button>
        <button
          onClick={() => setActiveTab("credit_notes")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "credit_notes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Credit Notes Report
        </button>
        <button
          onClick={() => setActiveTab("debit_notes")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "debit_notes"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Debit Notes Report
        </button>
        <button
          onClick={() => setActiveTab("customer_credit")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "customer_credit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Customer Credit Balances
        </button>
        <button
          onClick={() => setActiveTab("dealer_credit")}
          className={`px-4 py-2 border-b-2 transition-colors whitespace-nowrap ${
            activeTab === "dealer_credit"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Dealer Credit Balances
        </button>
      </div>

      {activeTab === "overview" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Total Sales Revenue" value={inr(totalSalesRevenue)} />
            <Stat label="Gross Profit" value={inr(totalProfit)} tone="success" />
            <Stat label="Net Profit (After Expenses)" value={inr(netProfit)} tone={netProfit >= 0 ? "success" : "danger"} />
            <Stat label="Current Cash in Drawer" value={inr(cashInHand)} />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Inventory Valuation Card */}
            <Card>
              <CardHead title="Stock Asset Valuation" sub="Live value of all stock in counter" />
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Total Units in Stock:</span>
                  <span className="num font-bold text-[14px]">{inventoryValuation.availableUnits} units</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Total Asset Value (Cost):</span>
                  <span className="num font-bold text-[14px] text-primary">{inr(inventoryValuation.totalCost)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Estimated Retail Value (MRP/Selling):</span>
                  <span className="num font-bold text-[14px]">{inr(inventoryValuation.totalRetail)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-muted-foreground">Potential Future Margin:</span>
                  <span className="num font-bold text-success text-[14px]">
                    {inr(inventoryValuation.totalRetail - inventoryValuation.totalCost)}
                  </span>
                </div>
              </div>
            </Card>

            {/* Cash Register Reconciliation */}
            <Card>
              <CardHead title="Cash Drawer Register" sub="Cash balance calculations" />
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Opening Cash:</span>
                  <span className="num font-semibold">{inr(db.settings.openingCash)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Total Customer Cash Inflow:</span>
                  <span className="num font-semibold text-success">+{inr(cashIn)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Total Dealer Cash Outflow:</span>
                  <span className="num font-semibold text-warning">-{inr(cashOut)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-border pb-2 text-[13px]">
                  <span className="text-muted-foreground">Total Shop Expenses:</span>
                  <span className="num font-semibold text-destructive">-{inr(totalExpenses)}</span>
                </div>
                <div className="flex items-center justify-between text-[14px] font-bold">
                  <span>Closing Cash in Drawer:</span>
                  <span className="num text-primary">{inr(cashInHand)}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Low Stock Warning Card */}
          <Card>
            <CardHead
              title="Reorder Alerts / Low Stock"
              sub={`${low.length} products below safety reorder threshold`}
            />
            {low.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-muted-foreground">
                All inventory levels are healthy! No items below reorder level.
              </div>
            ) : (
              <Table head={["Product Model", "Category", ">Current Stock", ">Reorder Level", ">Dealer Price", "Action"]}>
                {low.map(({ product, stock }) => (
                  <Row key={product.id}>
                    <Td className="font-semibold">{product.name}</Td>
                    <Td>
                      <Badge tone="neutral">{product.category}</Badge>
                    </Td>
                    <Td right mono>
                      <Badge tone="warning">
                        {stock} {product.tracked ? "units" : "pcs"}
                      </Badge>
                    </Td>
                    <Td right mono>
                      {product.reorderLevel}
                    </Td>
                    <Td right mono>
                      {inr(product.purchasePrice)}
                    </Td>
                    <Td>
                      <span className="text-[11px] text-warning font-semibold">Needs Reorder</span>
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* ITEM-WISE MASTER STOCK REPORT */}
      {activeTab === "item_wise" && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <Card>
            <CardHead
              title="Filter Item-Wise Stock Movement"
              sub="Custom date range, category, brand, model, and GST classification"
              right={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportItemWiseCSV}
                    disabled={filteredItemWiseRows.length === 0}
                    className="gap-1.5"
                  >
                    📥 Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                    className="gap-1.5"
                  >
                    🖨️ Print Report
                  </Button>
                </div>
              }
            />
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                <Field label="From Date">
                  <Input
                    type="date"
                    value={itemStartDate}
                    onChange={(e) => setItemStartDate(e.target.value)}
                  />
                </Field>

                <Field label="To Date">
                  <Input
                    type="date"
                    value={itemEndDate}
                    onChange={(e) => setItemEndDate(e.target.value)}
                  />
                </Field>

                <Field label="Category">
                  <Select
                    value={itemCategory}
                    onChange={(e) => setItemCategory(e.target.value)}
                  >
                    <option value="ALL">All Categories</option>
                    {categoriesList.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Brand">
                  <Select
                    value={itemBrand}
                    onChange={(e) => setItemBrand(e.target.value)}
                  >
                    <option value="ALL">All Brands</option>
                    {brandsList.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Type">
                  <Select
                    value={itemProductType}
                    onChange={(e) => setItemProductType(e.target.value as any)}
                  >
                    <option value="ALL">All Products</option>
                    <option value="TRACKED">Tracked (IMEI)</option>
                    <option value="BULK">Bulk / Non-Tracked</option>
                  </Select>
                </Field>

                <Field label="Taxation">
                  <Select
                    value={itemGstType}
                    onChange={(e) => setItemGstType(e.target.value as any)}
                  >
                    <option value="ALL">All Bills</option>
                    <option value="GST">GST Only</option>
                    <option value="NON_GST">Non-GST Only</option>
                  </Select>
                </Field>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Input
                  placeholder="Live search by product name, brand, model or HSN..."
                  value={itemSearchQuery}
                  onChange={(e) => setItemSearchQuery(e.target.value)}
                  className="max-w-md"
                />
                <Button size="sm" onClick={loadItemWiseReport} disabled={loadingItemWise}>
                  {loadingItemWise ? "Refreshing..." : "Apply / Refresh"}
                </Button>
                {(itemStartDate || itemEndDate || itemCategory !== "ALL" || itemBrand !== "ALL" || itemProductType !== "ALL" || itemGstType !== "ALL" || itemSearchQuery) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setItemStartDate("");
                      setItemEndDate("");
                      setItemCategory("ALL");
                      setItemBrand("ALL");
                      setItemProductType("ALL");
                      setItemGstType("ALL");
                      setItemSearchQuery("");
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* KPI Summary Cards */}
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Stat
              label="Opening Stock"
              value={`${itemWiseSummary?.totalOpening ?? 0} units`}
              tone="neutral"
            />
            <Stat
              label="Purchases In"
              value={`+${itemWiseSummary?.totalPurchasesIn ?? 0}`}
              tone="info"
            />
            <Stat
              label="Sales Out"
              value={`-${itemWiseSummary?.totalSalesOut ?? 0}`}
              tone="warning"
            />
            <Stat
              label="Closing Stock"
              value={`${itemWiseSummary?.totalClosing ?? 0} units`}
              tone="success"
            />
            <Stat
              label="Closing Asset Valuation"
              value={inr(itemWiseSummary?.totalValuation ?? 0)}
              tone="neutral"
            />
          </section>

          {/* Item-Wise Master Stock Movement Table */}
          <Card>
            <CardHead
              title="Product Stock Movement Ledger"
              sub={`Showing ${filteredItemWiseRows.length} items. Formula: Closing = Opening + Inward - Inward Returns - Outward + Outward Returns +/- Adjustments`}
            />

            {loadingItemWise ? (
              <div className="py-12 text-center text-muted-foreground text-[13px]">
                Calculating real-time inventory ledger...
              </div>
            ) : filteredItemWiseRows.length === 0 ? (
              <Empty text="No matching products found for the selected filter." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11.5px] border-collapse min-w-[1100px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                      <th className="p-2.5">#</th>
                      <th className="p-2.5 min-w-[200px]">Product / Model</th>
                      <th className="p-2.5">Category & Brand</th>
                      <th className="p-2.5">HSN</th>
                      <th className="p-2.5 text-right font-mono">Opening</th>
                      <th className="p-2.5 text-right font-mono text-indigo-600">Pur (+)</th>
                      <th className="p-2.5 text-right font-mono text-rose-500">Pur Ret (-)</th>
                      <th className="p-2.5 text-right font-mono text-amber-600">Sale (-)</th>
                      <th className="p-2.5 text-right font-mono text-teal-600">Sale Ret (+)</th>
                      <th className="p-2.5 text-right font-mono">Adj</th>
                      <th className="p-2.5 text-right font-mono font-bold text-foreground">Closing</th>
                      <th className="p-2.5 text-right font-mono">Cost</th>
                      <th className="p-2.5 text-right font-mono font-bold text-primary">Valuation</th>
                      <th className="p-2.5 text-center">Movement</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredItemWiseRows.map((r, idx) => (
                      <tr key={r.productId} className="hover:bg-muted/20 transition-colors">
                        <td className="p-2.5 text-muted-foreground font-mono">{idx + 1}</td>
                        <td className="p-2.5">
                          <div className="font-bold text-foreground text-[12px]">{r.productName}</div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge tone={r.tracked ? "info" : "neutral"} className="text-[10px]">
                              {r.tracked ? "IMEI" : "Bulk"}
                            </Badge>
                            {r.model && <span className="text-[10.5px] text-muted-foreground">{r.model}</span>}
                          </div>
                        </td>
                        <td className="p-2.5">
                          <div className="font-medium text-foreground">{r.brand}</div>
                          <div className="text-[10.5px] text-muted-foreground">{r.category}</div>
                        </td>
                        <td className="p-2.5 font-mono text-muted-foreground">{r.hsn || "—"}</td>
                        <td className="p-2.5 text-right font-mono font-medium">{r.openingStock}</td>
                        <td className="p-2.5 text-right font-mono text-indigo-600 font-medium">+{r.purchasesIn}</td>
                        <td className="p-2.5 text-right font-mono text-rose-500 font-medium">-{r.purchaseReturnsOut}</td>
                        <td className="p-2.5 text-right font-mono text-amber-600 font-medium">-{r.salesOut}</td>
                        <td className="p-2.5 text-right font-mono text-teal-600 font-medium">+{r.saleReturnsIn}</td>
                        <td className="p-2.5 text-right font-mono text-muted-foreground">
                          {r.adjustments > 0 ? `+${r.adjustments}` : r.adjustments}
                        </td>
                        <td className="p-2.5 text-right font-mono font-bold text-foreground text-[12.5px]">
                          <span className={r.closingStock <= 0 ? "text-destructive" : ""}>
                            {r.closingStock}
                          </span>
                        </td>
                        <td className="p-2.5 text-right font-mono text-muted-foreground">{inr(r.purchasePrice)}</td>
                        <td className="p-2.5 text-right font-mono font-bold text-primary">{inr(r.stockValuation)}</td>
                        <td className="p-2.5 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-[11px] h-7 px-2.5"
                            onClick={() => openDrilldown(r)}
                          >
                            🔍 History
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* IMEI-WISE SERIALIZED UNITS REPORT */}
      {activeTab === "imei_wise" && (
        <div className="space-y-4">
          <Card>
            <CardHead
              title="IMEI & Serial Number Register"
              sub="Complete serialized unit tracking from purchase inward to sale dispatch."
              right={
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={exportImeiWiseCSV}
                    disabled={imeiWiseRows.length === 0}
                    className="gap-1.5"
                  >
                    📥 Export CSV
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.print()}
                    className="gap-1.5"
                  >
                    🖨️ Print Report
                  </Button>
                </div>
              }
            />
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <Field label="Search IMEI / Serial">
                  <Input
                    placeholder="e.g. 86420104..."
                    value={imeiSearch}
                    onChange={(e) => setImeiSearch(e.target.value)}
                    className="font-mono"
                  />
                </Field>

                <Field label="Stock Status">
                  <Select
                    value={imeiStatus}
                    onChange={(e) => setImeiStatus(e.target.value)}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="AVAILABLE">AVAILABLE (In Stock)</option>
                    <option value="SOLD">SOLD</option>
                    <option value="RETURNED">RETURNED</option>
                    <option value="DAMAGED">DAMAGED</option>
                    <option value="REPAIR">REPAIR</option>
                    <option value="RESERVED">RESERVED</option>
                  </Select>
                </Field>

                <Field label="Brand">
                  <Select
                    value={imeiBrand}
                    onChange={(e) => setImeiBrand(e.target.value)}
                  >
                    <option value="ALL">All Brands</option>
                    {brandsList.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="flex items-end">
                  <Button onClick={loadImeiWiseReport} disabled={loadingImeiWise} className="w-full">
                    {loadingImeiWise ? "Searching..." : "Search IMEIs"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* Quick Metrics */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Total Tracked IMEIs"
              value={String(imeiWiseRows.length)}
              tone="neutral"
            />
            <Stat
              label="Available in Counter"
              value={String(imeiWiseRows.filter((r) => r.status === "AVAILABLE").length)}
              tone="success"
            />
            <Stat
              label="Sold to Customers"
              value={String(imeiWiseRows.filter((r) => r.status === "SOLD").length)}
              tone="info"
            />
            <Stat
              label="Under Repair / Return"
              value={String(imeiWiseRows.filter((r) => r.status !== "AVAILABLE" && r.status !== "SOLD").length)}
              tone="warning"
            />
          </div>

          <Card>
            <CardHead
              title="Tracked Units Lifecycle"
              sub={`${imeiWiseRows.length} serial entries found`}
            />

            {loadingImeiWise ? (
              <div className="py-12 text-center text-muted-foreground text-[13px]">
                Loading serialized units...
              </div>
            ) : imeiWiseRows.length === 0 ? (
              <Empty text="No IMEI records found matching the query." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[11.5px] border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/80 text-muted-foreground font-semibold">
                      <th className="p-2.5">IMEI Number</th>
                      <th className="p-2.5">Product & Model</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Inward Purchase</th>
                      <th className="p-2.5">Outward Sale</th>
                      <th className="p-2.5 text-right">Age (Days)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {imeiWiseRows.map((r) => {
                      const statusTone =
                        r.status === "AVAILABLE"
                          ? "success"
                          : r.status === "SOLD"
                          ? "info"
                          : r.status === "DAMAGED"
                          ? "danger"
                          : "warning";

                      return (
                        <tr key={r.imei} className="hover:bg-muted/20">
                          <td className="p-2.5 font-mono font-bold text-primary text-[12px]">
                            {r.imei}
                          </td>
                          <td className="p-2.5">
                            <div className="font-semibold text-foreground">{r.productName}</div>
                            <div className="text-[10.5px] text-muted-foreground">{r.brand} · {r.category}</div>
                          </td>
                          <td className="p-2.5">
                            <Badge tone={statusTone}>{r.status}</Badge>
                          </td>
                          <td className="p-2.5">
                            {r.purchaseDate ? (
                              <div>
                                <div className="font-medium text-foreground">{r.purchaseInvoiceNo || "Purchase Bill"}</div>
                                <div className="text-[10.5px] text-muted-foreground">
                                  {r.purchaseDate} • {r.dealerName || "Dealer"} • {inr(r.purchaseCost || 0)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">Opening / Initial Stock</span>
                            )}
                          </td>
                          <td className="p-2.5">
                            {r.status === "SOLD" && r.saleDate ? (
                              <div>
                                <div className="font-medium text-foreground">{r.saleInvoiceNo || "Sales Bill"}</div>
                                <div className="text-[10.5px] text-muted-foreground">
                                  {r.saleDate} • {r.customerName || "Customer"} • {inr(r.sellingPrice || 0)}
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="p-2.5 text-right font-mono">
                            {r.daysInStock !== undefined ? `${r.daysInStock}d` : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {activeTab === "emi" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Pending from Finance"
              value={inr(emiReport?.summary?.totalPending || 0)}
              hint={`${emiReport?.summary?.pendingCount || 0} loans pending payout`}
              tone="warning"
            />
            <Stat
              label="Received Payouts"
              value={inr(emiReport?.summary?.totalReceived || 0)}
              hint="Credited to store bank"
              tone="success"
            />
            <Stat
              label="Total Financed Loans"
              value={inr(emiReport?.summary?.totalReceivables || 0)}
              hint={`${emiReport?.summary?.count || 0} loan entries`}
            />
            <Stat
              label="Active NBFC Partners"
              value={String(emiReport?.byCompany?.length || 0)}
              hint="Finance agencies"
            />
          </div>

          <Card>
            <CardHead title="Finance Company Performance Breakdown" sub="Settlement summary by NBFC partner" />
            {(!emiReport?.byCompany || emiReport.byCompany.length === 0) ? (
              <Empty text="No EMI finance transactions booked yet." />
            ) : (
              <Table head={["Finance Partner", ">Total Financed", ">Settled Amount", ">Pending Balance", ">Loans Count"]}>
                {emiReport.byCompany.map((c: any) => (
                  <Row key={c.companyName}>
                    <Td className="font-semibold">{c.companyName}</Td>
                    <Td right mono>{inr(c.totalFinanced)}</Td>
                    <Td right mono className="text-success font-semibold">{inr(c.totalReceived)}</Td>
                    <Td right mono className={c.totalPending > 0 ? "font-bold text-warning" : "text-muted-foreground"}>
                      {inr(c.totalPending)}
                    </Td>
                    <Td right mono>{c.count}</Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "dealers" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Total Outstanding to Dealers"
              value={inr(dealerReport?.totalOutstanding || 0)}
              hint="Pending vendor payables"
              tone={dealerReport?.totalOutstanding > 0 ? "warning" : "success"}
            />
            <Stat
              label="Total Purchased (All Time)"
              value={inr(dealerReport?.totalPurchased || 0)}
              hint="Inward stock bills"
            />
            <Stat
              label="Total Paid to Dealers"
              value={inr(dealerReport?.totalPaid || 0)}
              hint="Cash, Bank, UPI"
              tone="success"
            />
            <Stat
              label="Registered Dealers"
              value={String(dealerReport?.totalDealers || 0)}
              hint="Wholesale distributors"
            />
          </div>

          <Card>
            <CardHead title="Dealer Ledger Outstanding Summary" sub="Purchases vs payments per wholesale dealer" />
            {(!dealerReport?.dealers || dealerReport.dealers.length === 0) ? (
              <Empty text="No dealer purchase records found." />
            ) : (
              <Table head={["Dealer / Company", "Phone", ">Purchases (Bills)", ">Paid", ">Outstanding Due"]}>
                {dealerReport.dealers.map((d: any) => (
                  <Row key={d.dealerId}>
                    <Td className="font-semibold">{d.dealerName}</Td>
                    <Td mono className="text-[11px] text-muted-foreground">{d.phone}</Td>
                    <Td right mono>{inr(d.totalPurchased)} ({d.purchasesCount})</Td>
                    <Td right mono className="text-success">{inr(d.totalPaid)}</Td>
                    <Td right mono className={d.outstanding > 0 ? "font-bold text-warning" : "text-muted-foreground"}>
                      {inr(d.outstanding)}
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "categories" && (
        <div className="space-y-4">
          <Card>
            <CardHead title="Category-Wise Stock Asset Distribution" sub="Inventory distribution across product categories" />
            {categoryReport.length === 0 ? (
              <Empty text="No categorized stock records available." />
            ) : (
              <Table head={["Product Category", ">Products Listed", ">Stock Quantity", ">Total Cost Value", ">Estimated Retail Value"]}>
                {categoryReport.map((c) => (
                  <Row key={c.category}>
                    <Td className="font-semibold">{c.category}</Td>
                    <Td right mono>{c.productCount}</Td>
                    <Td right mono className="font-medium text-foreground">{c.stockQty} pcs</Td>
                    <Td right mono className="font-semibold text-primary">{inr(c.inventoryCost)}</Td>
                    <Td right mono className="font-semibold text-success">{inr(c.retailValue)}</Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "gst" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="GST Purchases Total"
              value={inr(
                db.purchases
                  .filter((p) => p.purchaseType !== "NON_GST")
                  .reduce((sum, p) => sum + p.total, 0)
              )}
              tone="info"
            />
            <Stat
              label="Non-GST Purchases Total"
              value={inr(
                db.purchases
                  .filter((p) => p.purchaseType === "NON_GST")
                  .reduce((sum, p) => sum + p.total, 0)
              )}
              tone="neutral"
            />
            <Stat
              label="Total Input GST Claimed"
              value={inr(
                db.purchases.reduce((sum, p) => sum + (p.tax || 0), 0)
              )}
              tone="success"
            />
            <Stat
              label="TDS 194R Deductions"
              value={inr(
                (db.debitNotes || []).reduce((sum, d) => sum + (d.amount || 0), 0)
              )}
              tone="warning"
            />
          </section>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHead
                title="Purchase Bills Tax Breakdown"
                sub="Inward bills by GST type, place of supply, and tax split"
              />
              <Table head={["Invoice #", "Dealer", "Type", ">Taxable", ">Tax", ">Total"]}>
                {db.purchases.map((p) => (
                  <Row key={p.id}>
                    <Td mono className="font-semibold text-primary">{p.invoiceNo}</Td>
                    <Td>{db.suppliers.find((s) => s.id === p.supplierId)?.name || "Dealer"}</Td>
                    <Td>
                      <Badge tone={p.purchaseType === "NON_GST" ? "neutral" : "info"}>
                        {p.purchaseType || "GST"}
                      </Badge>
                    </Td>
                    <Td right mono>{inr(p.subtotal || p.taxableValue || 0)}</Td>
                    <Td right mono className={p.tax > 0 ? "text-indigo-600 font-semibold" : "text-muted-foreground"}>
                      {inr(p.tax || 0)}
                    </Td>
                    <Td right mono className="font-bold">{inr(p.total)}</Td>
                  </Row>
                ))}
              </Table>
            </Card>

            <Card>
              <CardHead
                title="Debit Notes & TDS 194R Summary"
                sub="Deductions and adjustments reducing dealer payable"
              />
              {!db.debitNotes || db.debitNotes.length === 0 ? (
                <Empty text="No debit notes or TDS 194R claims recorded yet." />
              ) : (
                <Table head={["Note #", "Date", "Dealer", "Reason", ">Debit Amount"]}>
                  {db.debitNotes.map((dn) => (
                    <Row key={dn.id}>
                      <Td mono className="font-semibold">{dn.noteNumber}</Td>
                      <Td>{dn.date}</Td>
                      <Td>{db.suppliers.find((s) => s.id === (dn.dealerId || dn.supplierId))?.name || "Dealer"}</Td>
                      <Td>{dn.reason}</Td>
                      <Td right mono className="font-bold text-rose-600">-{inr(dn.amount)}</Td>
                    </Row>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}

      {activeTab === "credit_notes" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total Notes" value={cnSummary?.totalNotes ?? cnRows.length} />
            <Stat label="Total Credit Amount" value={inr(cnSummary?.totalAmount ?? 0)} />
            <Stat label="Total Adjusted" value={inr(cnSummary?.totalApplied ?? 0)} tone="success" />
            <Stat label="Total Refunded" value={inr(cnSummary?.totalRefunded ?? 0)} tone="warning" />
            <Stat label="Outstanding Credit" value={inr(cnSummary?.totalRemaining ?? 0)} />
          </section>

          <Card>
            <CardHead
              title="Credit Notes Register"
              sub="Detailed audit of all sales credit notes, taxes & balances"
              actions={
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    type="date"
                    className="w-36 text-xs"
                    value={cnStartDate}
                    onChange={(e) => setCnStartDate(e.target.value)}
                  />
                  <Input
                    type="date"
                    className="w-36 text-xs"
                    value={cnEndDate}
                    onChange={(e) => setCnEndDate(e.target.value)}
                  />
                  <Select
                    className="text-xs w-32"
                    value={cnStatus}
                    onChange={(e) => setCnStatus(e.target.value)}
                  >
                    <option value="ALL">All Status</option>
                    <option value="ISSUED">Issued</option>
                    <option value="PARTIALLY_ADJUSTED">Partially Adjusted</option>
                    <option value="FULLY_ADJUSTED">Fully Adjusted</option>
                    <option value="REFUNDED">Refunded</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportCreditNotesCSV} disabled={cnRows.length === 0}>
                    Export CSV
                  </Button>
                </div>
              }
            />

            {loadingCn ? (
              <div className="py-8 text-center text-muted-foreground text-xs">Loading Credit Notes Report...</div>
            ) : cnRows.length === 0 ? (
              <Empty text="No credit notes found for the selected period." />
            ) : (
              <Table head={["Date", "Note #", "Orig Inv #", "Customer", "Type", "Items", ">Subtotal", ">Tax", ">Total", ">Adjusted", ">Refunded", ">Remaining", "Status"]}>
                {cnRows.map((r, idx) => (
                  <Row key={idx}>
                    <Td>{r.date}</Td>
                    <Td mono className="font-bold text-blue-700">{r.noteNumber}</Td>
                    <Td mono>{r.originalInvoiceNo || "—"}</Td>
                    <Td>
                      <div className="font-medium">{r.customerName}</div>
                      {r.customerPhone && <div className="text-[10px] text-muted-foreground">{r.customerPhone}</div>}
                    </Td>
                    <Td>
                      <Badge tone={r.physicalReturn ? "info" : "neutral"}>
                        {r.physicalReturn ? "Physical" : "Financial"}
                      </Badge>
                    </Td>
                    <Td className="text-xs max-w-[120px] truncate" title={r.itemsSummary}>{r.itemsSummary || "—"}</Td>
                    <Td right mono>{inr(r.subtotal)}</Td>
                    <Td right mono>{inr(r.cgst + r.sgst + r.igst)}</Td>
                    <Td right mono className="font-bold text-foreground">{inr(r.total)}</Td>
                    <Td right mono className="text-emerald-600 font-medium">{inr(r.appliedAmount)}</Td>
                    <Td right mono className="text-amber-600 font-medium">{inr(r.refundedAmount)}</Td>
                    <Td right mono className="font-bold text-primary">{inr(r.remainingAmount)}</Td>
                    <Td>
                      <Badge tone={r.status === "CANCELLED" ? "danger" : r.status === "FULLY_ADJUSTED" ? "success" : "neutral"}>
                        {r.status}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "debit_notes" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Total Debit Notes" value={dnSummary?.totalNotes ?? dnRows.length} />
            <Stat label="Total Debit Amount" value={inr(dnSummary?.totalAmount ?? 0)} />
            <Stat label="Total Adjusted" value={inr(dnSummary?.totalApplied ?? 0)} tone="success" />
            <Stat label="Refunds Received" value={inr(dnSummary?.totalRefunded ?? 0)} tone="warning" />
            <Stat label="Outstanding Balance" value={inr(dnSummary?.totalRemaining ?? 0)} />
          </section>

          <Card>
            <CardHead
              title="Debit Notes Register"
              sub="Purchase returns, price discrepancies & supplier claims"
              actions={
                <div className="flex flex-wrap gap-2 items-center">
                  <Input
                    type="date"
                    className="w-36 text-xs"
                    value={dnStartDate}
                    onChange={(e) => setDnStartDate(e.target.value)}
                  />
                  <Input
                    type="date"
                    className="w-36 text-xs"
                    value={dnEndDate}
                    onChange={(e) => setDnEndDate(e.target.value)}
                  />
                  <Select
                    className="text-xs w-32"
                    value={dnStatus}
                    onChange={(e) => setDnStatus(e.target.value)}
                  >
                    <option value="ALL">All Status</option>
                    <option value="ISSUED">Issued</option>
                    <option value="PARTIALLY_ADJUSTED">Partially Adjusted</option>
                    <option value="FULLY_ADJUSTED">Fully Adjusted</option>
                    <option value="REFUNDED">Refunded</option>
                    <option value="CANCELLED">Cancelled</option>
                  </Select>
                  <Button variant="outline" size="sm" onClick={exportDebitNotesCSV} disabled={dnRows.length === 0}>
                    Export CSV
                  </Button>
                </div>
              }
            />

            {loadingDn ? (
              <div className="py-8 text-center text-muted-foreground text-xs">Loading Debit Notes Report...</div>
            ) : dnRows.length === 0 ? (
              <Empty text="No debit notes found for the selected period." />
            ) : (
              <Table head={["Date", "Note #", "Purchase Bill #", "Dealer", "Type", "Items", ">Subtotal", ">Tax", ">Total", ">Adjusted", ">Refund Recv", ">Remaining", "Status"]}>
                {dnRows.map((r, idx) => (
                  <Row key={idx}>
                    <Td>{r.date}</Td>
                    <Td mono className="font-bold text-indigo-700">{r.noteNumber}</Td>
                    <Td mono>{r.originalInvoiceNo || "—"}</Td>
                    <Td className="font-medium">{r.dealerName}</Td>
                    <Td>
                      <Badge tone={r.physicalReturn ? "info" : "neutral"}>
                        {r.physicalReturn ? "Physical" : "Financial"}
                      </Badge>
                    </Td>
                    <Td className="text-xs max-w-[120px] truncate" title={r.itemsSummary}>{r.itemsSummary || "—"}</Td>
                    <Td right mono>{inr(r.subtotal)}</Td>
                    <Td right mono>{inr(r.cgst + r.sgst + r.igst)}</Td>
                    <Td right mono className="font-bold text-foreground">{inr(r.total)}</Td>
                    <Td right mono className="text-emerald-600 font-medium">{inr(r.appliedAmount)}</Td>
                    <Td right mono className="text-amber-600 font-medium">{inr(r.refundedAmount)}</Td>
                    <Td right mono className="font-bold text-primary">{inr(r.remainingAmount)}</Td>
                    <Td>
                      <Badge tone={r.status === "CANCELLED" ? "danger" : r.status === "FULLY_ADJUSTED" ? "success" : "neutral"}>
                        {r.status}
                      </Badge>
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "customer_credit" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-2">
            <Stat label="Customers with Outstanding Credit" value={custCreditSummary?.totalCustomersWithBalance ?? custCreditRows.length} />
            <Stat label="Total Available Credit Balance" value={inr(custCreditSummary?.totalCreditBalance ?? 0)} />
          </section>

          <Card>
            <CardHead
              title="Customer Credit Balance Ledger"
              sub="Active credit balances available for future purchase adjustment"
              actions={
                <Button variant="outline" size="sm" onClick={exportCustomerCreditCSV} disabled={custCreditRows.length === 0}>
                  Export CSV
                </Button>
              }
            />

            {loadingCustCredit ? (
              <div className="py-8 text-center text-muted-foreground text-xs">Loading Customer Credit Balances...</div>
            ) : custCreditRows.length === 0 ? (
              <Empty text="No customers with active credit balances." />
            ) : (
              <Table head={["Customer Name", "Mobile", ">Total Notes Issued", ">Total Credit Issued", ">Total Adjusted", ">Total Refunded", ">Current Credit Balance"]}>
                {custCreditRows.map((r, idx) => (
                  <Row key={idx}>
                    <Td className="font-medium text-foreground">{r.customerName}</Td>
                    <Td mono>{r.phone || "—"}</Td>
                    <Td right>{r.totalNotes}</Td>
                    <Td right mono className="font-semibold">{inr(r.totalCreditAmount)}</Td>
                    <Td right mono className="text-emerald-600">{inr(r.totalApplied)}</Td>
                    <Td right mono className="text-amber-600">{inr(r.totalRefunded)}</Td>
                    <Td right mono className="font-bold text-primary text-sm">{inr(r.currentCreditBalance)}</Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {activeTab === "dealer_credit" && (
        <div className="space-y-4">
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-2">
            <Stat label="Dealers with Available Debit Balance" value={dealerCreditSummary?.totalDealersWithBalance ?? dealerCreditRows.length} />
            <Stat label="Total Pending Debit Balance" value={inr(dealerCreditSummary?.totalCreditBalance ?? 0)} />
          </section>

          <Card>
            <CardHead
              title="Dealer Debit Balance Ledger"
              sub="Debit balances available to deduct against inward supplier bills"
              actions={
                <Button variant="outline" size="sm" onClick={exportDealerCreditCSV} disabled={dealerCreditRows.length === 0}>
                  Export CSV
                </Button>
              }
            />

            {loadingDealerCredit ? (
              <div className="py-8 text-center text-muted-foreground text-xs">Loading Dealer Debit Balances...</div>
            ) : dealerCreditRows.length === 0 ? (
              <Empty text="No dealers with active debit balances." />
            ) : (
              <Table head={["Dealer Name", "Mobile / Phone", ">Total Debit Notes Raised", ">Total Debit Amount", ">Total Adjusted in Bills", ">Total Refund Received", ">Current Debit Balance"]}>
                {dealerCreditRows.map((r, idx) => (
                  <Row key={idx}>
                    <Td className="font-medium text-foreground">{r.dealerName}</Td>
                    <Td mono>{r.phone || "—"}</Td>
                    <Td right>{r.totalNotes}</Td>
                    <Td right mono className="font-semibold">{inr(r.totalDebitAmount)}</Td>
                    <Td right mono className="text-emerald-600">{inr(r.totalApplied)}</Td>
                    <Td right mono className="text-amber-600">{inr(r.totalRefunded)}</Td>
                    <Td right mono className="font-bold text-primary text-sm">{inr(r.currentCreditBalance)}</Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* PRODUCT MOVEMENT DRILLDOWN MODAL */}
      <Modal
        open={Boolean(drilldownProduct)}
        onClose={() => setDrilldownProduct(null)}
        title={`Stock Movement History — ${drilldownProduct?.productName}`}
        wide
      >
        {drilldownProduct && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Product Name</span>
                <span className="font-bold text-foreground">{drilldownProduct.productName}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Brand & Category</span>
                <span className="font-medium text-foreground">
                  {drilldownProduct.brand} • {drilldownProduct.category}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Current Balance</span>
                <span className="font-mono font-bold text-emerald-600 text-[13px]">
                  {drilldownProduct.closingStock} units
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Unit Purchase Cost</span>
                <span className="font-mono font-medium">{inr(drilldownProduct.purchasePrice)}</span>
              </div>
            </div>

            <div className="text-[12.5px] font-bold text-foreground">
              Chronological Stock Movement Ledger ({drilldownLedger.length} events)
            </div>

            {loadingDrilldown ? (
              <div className="py-8 text-center text-muted-foreground text-[12px]">
                Loading product movement history...
              </div>
            ) : drilldownLedger.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground italic text-[12px]">
                No transactions recorded for this product yet.
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                <table className="w-full text-left text-[11.5px]">
                  <thead className="bg-muted/40 text-muted-foreground font-semibold sticky top-0">
                    <tr>
                      <th className="p-2">Date</th>
                      <th className="p-2">Type</th>
                      <th className="p-2">Ref / Invoice #</th>
                      <th className="p-2">Party Name</th>
                      <th className="p-2 text-right">In (+)</th>
                      <th className="p-2 text-right">Out (-)</th>
                      <th className="p-2 text-right font-bold">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {drilldownLedger.map((e, idx) => {
                      const typeTone =
                        e.type === "PURCHASE" || e.type === "SALE_RETURN"
                          ? "success"
                          : e.type === "SALE" || e.type === "PURCHASE_RETURN"
                          ? "warning"
                          : "neutral";

                      return (
                        <tr key={idx} className="hover:bg-muted/20">
                          <td className="p-2 font-mono text-[11px]">{e.date}</td>
                          <td className="p-2">
                            <Badge tone={typeTone} className="text-[10px]">
                              {e.type}
                            </Badge>
                          </td>
                          <td className="p-2 font-mono font-semibold text-primary">{e.referenceNo || "—"}</td>
                          <td className="p-2 font-medium">{e.partyName || "—"}</td>
                          <td className="p-2 text-right font-mono text-emerald-600 font-medium">
                            {e.qtyIn > 0 ? `+${e.qtyIn}` : "—"}
                          </td>
                          <td className="p-2 text-right font-mono text-rose-500 font-medium">
                            {e.qtyOut > 0 ? `-${e.qtyOut}` : "—"}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-foreground">
                            {e.balance}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-border">
              <Button onClick={() => setDrilldownProduct(null)}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}


