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
import { inr, todayISO } from "@/lib/format";
import type {
  EMIAccount,
  EMIAccountStatus,
  EMIReceivable,
  EMIReceipt,
  EMIStatus,
  FinanceCompany,
} from "@/lib/types";
import { EMICalculator } from "@/components/EMICalculator";
import { Calculator, CreditCard, Users, Building2, BarChart3, Receipt, CheckCircle, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/emi")({
  head: () => ({
    meta: [{ title: "EMI Calculator & Finance Hub — Mobile Store ERP" }],
  }),
  component: EMIHubPage,
});

function getStatusTone(status: EMIStatus | EMIAccountStatus): "neutral" | "success" | "warning" | "danger" | "info" {
  switch (status) {
    case "RECEIVED":
    case "PAID":
      return "success";
    case "PARTIALLY_RECEIVED":
    case "PARTIALLY_PAID":
      return "info";
    case "EMI_PENDING":
    case "PENDING":
      return "warning";
    case "ACTIVE":
      return "info";
    case "OVERDUE":
    case "CANCELLED":
      return "danger";
    default:
      return "neutral";
  }
}

export function EMIHubPage() {
  const [activeTab, setActiveTab] = useState<
    "CALCULATOR" | "ACCOUNTS" | "RECEIVABLES" | "COMPANIES" | "REPORTS"
  >("CALCULATOR");

  const [receivables, setReceivables] = useState<EMIReceivable[]>([]);
  const [accounts, setAccounts] = useState<EMIAccount[]>([]);
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters for Receivables
  const [companyFilter, setCompanyFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Filters for Customer Accounts
  const [accountSearch, setAccountSearch] = useState("");
  const [accountStatusFilter, setAccountStatusFilter] = useState("ALL");

  // Search for Companies
  const [companySearch, setCompanySearch] = useState("");

  // Receipt Modal State (Receivables from Finance Co)
  const [settleModalOpen, setSettleModalOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState<EMIReceivable | null>(null);
  const [settleAmount, setSettleAmount] = useState<number>(0);
  const [settleMethod, setSettleMethod] = useState<"BANK_TRANSFER" | "UPI" | "CASH" | "OTHER">("BANK_TRANSFER");
  const [settleRef, setSettleRef] = useState("");
  const [settleDate, setSettleDate] = useState(todayISO());
  const [settleNotes, setSettleNotes] = useState("");
  const [settleSubmitting, setSettleSubmitting] = useState(false);

  // Customer Payment Modal State
  const [custPaymentModalOpen, setCustPaymentModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<EMIAccount | null>(null);
  const [custPayAmount, setCustPayAmount] = useState<number>(0);
  const [custPayMethod, setCustPayMethod] = useState<"Cash" | "UPI" | "Card" | "Bank" | "OTHER">("Cash");
  const [custPayRef, setCustPayRef] = useState("");
  const [custPayRemarks, setCustPayRemarks] = useState("");
  const [custPayDate, setCustPayDate] = useState(todayISO());
  const [custPaySubmitting, setCustPaySubmitting] = useState(false);

  // Foreclose Modal State
  const [forecloseModalOpen, setForecloseModalOpen] = useState(false);
  const [forecloseAccount, setForecloseAccount] = useState<EMIAccount | null>(null);
  const [forecloseCharges, setForeclosureCharges] = useState<number>(0);
  const [forecloseRemarks, setForecloseRemarks] = useState("");
  const [forecloseMethod, setForecloseMethod] = useState<"Cash" | "UPI" | "Card" | "Bank" | "OTHER">("Cash");
  const [forecloseRef, setForecloseRef] = useState("");
  const [forecloseSubmitting, setForecloseSubmitting] = useState(false);

  // Receipt History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [receiptHistory, setReceiptHistory] = useState<EMIReceipt[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // View Receivable Details Modal State
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [detailReceivable, setDetailReceivable] = useState<EMIReceivable | null>(null);

  // View Customer Account Details Modal State
  const [accountDetailsModalOpen, setAccountDetailsModalOpen] = useState(false);
  const [detailAccount, setDetailAccount] = useState<EMIAccount | null>(null);

  // Add / Edit Finance Company Modal State
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<FinanceCompany | null>(null);
  const [companyForm, setCompanyForm] = useState({
    companyName: "",
    contactPerson: "",
    mobile: "",
    email: "",
    address: "",
    settlementDays: 7,
    processingFee: 0,
    defaultInterestRate: 12,
    defaultTenure: 12,
    notes: "",
    active: true,
  });
  const [companySubmitting, setCompanySubmitting] = useState(false);

  // Detailed Report State
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportFilters, setReportFilters] = useState({
    fromDate: "",
    toDate: "",
    companyId: "ALL",
    status: "ALL",
    salesPerson: "",
    imei: "",
  });

  // Load Data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [resRec, resComp, resAccts] = await Promise.all([
        fetch("/api/emi/receivables").then((r) => r.json()),
        fetch("/api/emi/companies").then((r) => r.json()),
        fetch("/api/emi/accounts").then((r) => r.json()),
      ]);
      setReceivables(Array.isArray(resRec) ? resRec : []);
      setCompanies(Array.isArray(resComp) ? resComp : []);
      setAccounts(Array.isArray(resAccts) ? resAccts : []);
    } catch (err) {
      console.error("Failed to load EMI data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchReport = async () => {
    try {
      setReportLoading(true);
      const params = new URLSearchParams();
      if (reportFilters.fromDate) params.set("fromDate", reportFilters.fromDate);
      if (reportFilters.toDate) params.set("toDate", reportFilters.toDate);
      if (reportFilters.companyId !== "ALL") params.set("companyId", reportFilters.companyId);
      if (reportFilters.status !== "ALL") params.set("status", reportFilters.status);
      if (reportFilters.salesPerson) params.set("salesPerson", reportFilters.salesPerson);
      if (reportFilters.imei) params.set("imei", reportFilters.imei);

      const res = await fetch(`/api/emi/reports/detailed?${params.toString()}`);
      const data = await res.json();
      setReportData(data);
    } catch (err) {
      console.error("Failed to fetch EMI report:", err);
    } finally {
      setReportLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === "REPORTS") {
      fetchReport();
    }
  }, [activeTab, reportFilters]);

  // Filtered Receivables
  const filteredReceivables = useMemo(() => {
    return receivables.filter((r) => {
      if (companyFilter !== "ALL" && r.emiCompanyId !== companyFilter) return false;
      if (statusFilter !== "ALL" && r.status !== statusFilter) return false;
      if (fromDate && r.emiSaleDate < fromDate) return false;
      if (toDate && r.emiSaleDate > toDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCust = r.customerName?.toLowerCase().includes(q);
        const matchMobile = r.customerMobile?.toLowerCase().includes(q);
        const matchInv = r.invoiceId?.toLowerCase().includes(q);
        const matchImei = r.imei?.toLowerCase().includes(q);
        const matchRef = r.financeReferenceNumber?.toLowerCase().includes(q);
        const matchComp = r.emiCompanyName?.toLowerCase().includes(q);
        if (!matchCust && !matchMobile && !matchInv && !matchImei && !matchRef && !matchComp) return false;
      }
      return true;
    });
  }, [receivables, companyFilter, statusFilter, fromDate, toDate, searchQuery]);

  // Filtered Customer Accounts
  const filteredAccounts = useMemo(() => {
    return accounts.filter((a) => {
      if (accountStatusFilter !== "ALL" && a.status !== accountStatusFilter) return false;
      if (accountSearch.trim()) {
        const q = accountSearch.toLowerCase();
        const matchCust = a.customerName?.toLowerCase().includes(q);
        const matchMobile = a.customerMobile?.toLowerCase().includes(q);
        const matchInv = a.invoiceId?.toLowerCase().includes(q);
        const matchProd = a.productName?.toLowerCase().includes(q);
        const matchImei = a.imei?.toLowerCase().includes(q);
        const matchComp = a.financeCompanyName?.toLowerCase().includes(q);
        if (!matchCust && !matchMobile && !matchInv && !matchProd && !matchImei && !matchComp) return false;
      }
      return true;
    });
  }, [accounts, accountStatusFilter, accountSearch]);

  // Filtered Companies
  const filteredCompanies = useMemo(() => {
    if (!companySearch.trim()) return companies;
    const q = companySearch.toLowerCase();
    return companies.filter(
      (c) =>
        c.companyName.toLowerCase().includes(q) ||
        (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
        (c.mobile && c.mobile.includes(q))
    );
  }, [companies, companySearch]);

  // Metrics
  const metrics = useMemo(() => {
    const totalFinanced = receivables.reduce((sum, r) => sum + r.emiFinancedAmount, 0);
    const totalReceived = receivables.reduce((sum, r) => sum + r.receivedAmount, 0);
    const totalPending = receivables
      .filter((r) => r.status !== "RECEIVED" && r.status !== "CANCELLED")
      .reduce((sum, r) => sum + (r.netReceivable - r.receivedAmount), 0);
    const pendingCount = receivables.filter(
      (r) => r.status !== "RECEIVED" && r.status !== "CANCELLED"
    ).length;
    const totalCustOutstanding = accounts
      .filter((a) => a.status !== "PAID" && a.status !== "CANCELLED")
      .reduce((sum, a) => sum + a.outstandingAmount, 0);

    return { totalFinanced, totalReceived, totalPending, pendingCount, totalCustOutstanding };
  }, [receivables, accounts]);

  // Open Settlement Modal (Finance Co payout)
  const openSettlement = (r: EMIReceivable) => {
    setSelectedReceivable(r);
    const remaining = Math.max(0, r.netReceivable - r.receivedAmount);
    setSettleAmount(remaining);
    setSettleMethod("BANK_TRANSFER");
    setSettleRef("");
    setSettleDate(todayISO());
    setSettleNotes("");
    setSettleModalOpen(true);
  };

  // Open Receipt History Modal
  const openHistory = async (r: EMIReceivable) => {
    setSelectedReceivable(r);
    setHistoryModalOpen(true);
    try {
      setHistoryLoading(true);
      const res = await fetch(`/api/emi/receipts?receivableId=${r.id}`);
      const data = await res.json();
      setReceiptHistory(Array.isArray(data) ? data : []);
    } catch {
      setReceiptHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Open Customer Payment Modal
  const openCustomerPayment = (acct: EMIAccount) => {
    setSelectedAccount(acct);
    setCustPayAmount(acct.monthlyEmi || acct.outstandingAmount);
    setCustPayMethod("Cash");
    setCustPayRef("");
    setCustPayRemarks(`Installment payment for Inv #${acct.invoiceId}`);
    setCustPayDate(todayISO());
    setCustPaymentModalOpen(true);
  };

  // Open Foreclosure Modal
  const openForeclosure = (acct: EMIAccount) => {
    setForecloseAccount(acct);
    setForeclosureCharges(round2(acct.outstandingAmount * 0.02)); // Default 2%
    setForecloseRemarks("Early settlement / Pre-closure");
    setForecloseMethod("Cash");
    setForecloseRef("");
    setForecloseModalOpen(true);
  };

  // Open Account Details / Amortization Modal
  const openAccountDetails = async (acct: EMIAccount) => {
    try {
      const res = await fetch(`/api/emi/accounts/${acct.id}`);
      const full = await res.json();
      setDetailAccount(full);
      setAccountDetailsModalOpen(true);
    } catch (err) {
      alert("Failed to load account details.");
    }
  };

  // Submit Receivable Receipt
  const handleSettleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReceivable) return;
    const remaining = Math.max(0, selectedReceivable.netReceivable - selectedReceivable.receivedAmount);

    if (settleAmount <= 0) {
      alert("Receipt amount must be greater than zero.");
      return;
    }
    if (settleAmount > remaining) {
      alert(`Receipt amount (₹${settleAmount}) cannot exceed remaining amount (₹${remaining}).`);
      return;
    }

    try {
      setSettleSubmitting(true);
      const res = await fetch("/api/emi/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emiReceivableId: selectedReceivable.id,
          amountReceived: Number(settleAmount),
          receivedDate: settleDate,
          paymentMethod: settleMethod,
          bankReference: settleRef || undefined,
          notes: settleNotes || undefined,
          receivedBy: "Manager",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record receipt");
      }

      setSettleModalOpen(false);
      setSelectedReceivable(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to record EMI receipt");
    } finally {
      setSettleSubmitting(false);
    }
  };

  // Submit Customer EMI Payment
  const handleCustomerPaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    if (custPayAmount <= 0) {
      alert("Payment amount must be greater than zero.");
      return;
    }

    try {
      setCustPaySubmitting(true);
      const res = await fetch(`/api/emi/accounts/${selectedAccount.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(custPayAmount),
          paymentDate: custPayDate,
          paymentMode: custPayMethod,
          referenceNumber: custPayRef || undefined,
          remarks: custPayRemarks || undefined,
          receivedBy: "Cashier",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record payment");
      }

      setCustPaymentModalOpen(false);
      setSelectedAccount(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to record customer EMI payment");
    } finally {
      setCustPaySubmitting(false);
    }
  };

  // Submit Foreclosure
  const handleForecloseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forecloseAccount) return;

    if (!confirm(`Are you sure you want to pre-close EMI loan for ${forecloseAccount.customerName}? This will settle the account in full.`)) {
      return;
    }

    try {
      setForecloseSubmitting(true);
      const res = await fetch(`/api/emi/accounts/${forecloseAccount.id}/foreclose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          foreclosureCharges: Number(forecloseCharges) || 0,
          paymentMode: forecloseMethod,
          referenceNumber: forecloseRef || undefined,
          remarks: forecloseRemarks || undefined,
          receivedBy: "Manager",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to foreclose EMI account");
      }

      setForecloseModalOpen(false);
      setForecloseAccount(null);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to foreclose account");
    } finally {
      setForecloseSubmitting(false);
    }
  };

  // Open Add / Edit Company Modal
  const openAddCompany = () => {
    setEditingCompany(null);
    setCompanyForm({
      companyName: "",
      contactPerson: "",
      mobile: "",
      email: "",
      address: "",
      settlementDays: 7,
      processingFee: 0,
      defaultInterestRate: 12,
      defaultTenure: 12,
      notes: "",
      active: true,
    });
    setCompanyModalOpen(true);
  };

  const openEditCompany = (c: FinanceCompany) => {
    setEditingCompany(c);
    setCompanyForm({
      companyName: c.companyName,
      contactPerson: c.contactPerson || "",
      mobile: c.mobile || "",
      email: c.email || "",
      address: c.address || "",
      settlementDays: c.settlementDays || 7,
      processingFee: c.processingFee || 0,
      defaultInterestRate: c.defaultInterestRate ?? 12,
      defaultTenure: c.defaultTenure ?? 12,
      notes: c.notes || "",
      active: c.active !== false,
    });
    setCompanyModalOpen(true);
  };

  const handleCompanySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.companyName.trim()) {
      alert("Company Name is required");
      return;
    }

    try {
      setCompanySubmitting(true);
      const url = editingCompany ? `/api/emi/companies/${editingCompany.id}` : "/api/emi/companies";
      const method = editingCompany ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyForm),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save finance company");
      }

      setCompanyModalOpen(false);
      await fetchData();
    } catch (err: any) {
      alert(err.message || "Failed to save finance company");
    } finally {
      setCompanySubmitting(false);
    }
  };

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHead
        title="EMI Calculator & Finance Hub"
        sub="Calculate smartphone EMIs, book financed sales, track customer loans, and monitor NBFC partner settlements."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-border/80 text-[12px] font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("CALCULATOR")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  activeTab === "CALCULATOR"
                    ? "bg-white text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Calculator className="size-3.5" />
                EMI Calculator
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("ACCOUNTS")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  activeTab === "ACCOUNTS"
                    ? "bg-white text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Users className="size-3.5" />
                Customer Loans ({accounts.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("RECEIVABLES")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  activeTab === "RECEIVABLES"
                    ? "bg-white text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CreditCard className="size-3.5" />
                NBFC Receivables
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("COMPANIES")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  activeTab === "COMPANIES"
                    ? "bg-white text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Building2 className="size-3.5" />
                Partners ({companies.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("REPORTS")}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all cursor-pointer ${
                  activeTab === "REPORTS"
                    ? "bg-white text-primary shadow-xs font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <BarChart3 className="size-3.5" />
                EMI Report
              </button>
            </div>

            {activeTab === "COMPANIES" ? (
              <Button variant="primary" onClick={openAddCompany}>
                + Add Finance Partner
              </Button>
            ) : null}
          </div>
        }
      />

      {/* KPI Cards across the Hub */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label="Pending from NBFCs"
          value={inr(metrics.totalPending)}
          hint={`${metrics.pendingCount} company payouts due`}
          tone={metrics.totalPending > 0 ? "warning" : "success"}
        />
        <Stat
          label="Settled by NBFCs"
          value={inr(metrics.totalReceived)}
          hint="Credited to shop cash/bank"
          tone="success"
        />
        <Stat
          label="Customer Loan Outstanding"
          value={inr(metrics.totalCustOutstanding)}
          hint={`${accounts.length} active customer accounts`}
          tone={metrics.totalCustOutstanding > 0 ? "info" : "neutral"}
        />
        <Stat
          label="Finance Partners"
          value={companies.length.toString()}
          hint="Configured agencies (Bajaj, HDFC...)"
        />
      </div>

      {/* TAB 1: STANDALONE EMI CALCULATOR */}
      {activeTab === "CALCULATOR" ? (
        <EMICalculator isPosMode={false} />
      ) : null}

      {/* TAB 2: CUSTOMER EMI LOAN ACCOUNTS */}
      {activeTab === "ACCOUNTS" ? (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
              <Field label="Search Customer / Mobile / Invoice / IMEI">
                <Input
                  value={accountSearch}
                  onChange={(e) => setAccountSearch(e.target.value)}
                  placeholder="e.g. Rahul, 98110, INV-2026..."
                />
              </Field>
              <Field label="Loan Status">
                <Select
                  value={accountStatusFilter}
                  onChange={(e) => setAccountStatusFilter(e.target.value)}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active (Running)</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="PAID">Paid / Closed</option>
                  <option value="OVERDUE">Overdue</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </Field>
              <div className="flex items-end">
                <span className="text-[12px] text-muted-foreground pb-2 font-medium">
                  Showing {filteredAccounts.length} customer EMI accounts
                </span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead
              title={`Customer EMI Loan Accounts (${filteredAccounts.length})`}
              right={
                <span className="text-[12px] font-medium text-muted-foreground">
                  Total Outstanding: <strong className="text-primary num">{inr(metrics.totalCustOutstanding)}</strong>
                </span>
              }
            />

            {filteredAccounts.length === 0 ? (
              <Empty
                icon="📱"
                text={
                  loading
                    ? "Loading customer EMI accounts..."
                    : "No customer EMI accounts found matching your search. Process an EMI sale in POS or configure a loan."
                }
              />
            ) : (
              <Table
                head={[
                  "Invoice",
                  "Customer",
                  "Mobile",
                  "Product / Device",
                  "Partner",
                  ">Principal",
                  ">Monthly EMI",
                  ">Total Paid",
                  ">Outstanding",
                  "Status",
                  "Actions",
                ]}
              >
                {filteredAccounts.map((a) => (
                  <Row key={a.id}>
                    <Td mono className="font-semibold text-foreground">
                      {a.invoiceId}
                    </Td>
                    <Td className="font-medium text-foreground">{a.customerName}</Td>
                    <Td mono className="text-muted-foreground">
                      {a.customerMobile || "—"}
                    </Td>
                    <Td className="font-medium">
                      <div className="truncate max-w-xs">{a.productName || "Mobile Device"}</div>
                      {a.imei ? (
                        <div className="font-mono text-[10.5px] text-muted-foreground">IMEI: {a.imei}</div>
                      ) : null}
                    </Td>
                    <Td className="text-foreground">{a.financeCompanyName || "Direct Store"}</Td>
                    <Td right mono className="font-semibold text-primary">
                      {inr(a.financeAmount)}
                    </Td>
                    <Td right mono className="font-bold text-foreground">
                      {inr(a.monthlyEmi)}
                    </Td>
                    <Td right mono className="font-medium text-emerald-600">
                      {inr(a.totalPaid)}
                    </Td>
                    <Td right mono className={`font-bold ${a.outstandingAmount > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                      {inr(a.outstandingAmount)}
                    </Td>
                    <Td>
                      <Badge tone={getStatusTone(a.status)}>{a.status}</Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {a.status !== "PAID" && a.status !== "CANCELLED" ? (
                          <>
                            <Button size="sm" variant="primary" onClick={() => openCustomerPayment(a)}>
                              Pay EMI
                            </Button>
                            <Button size="sm" variant="soft" onClick={() => openForeclosure(a)}>
                              Pre-Close
                            </Button>
                          </>
                        ) : null}
                        <Button size="sm" variant="ghost" onClick={() => openAccountDetails(a)}>
                          Schedule
                        </Button>
                      </div>
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {/* TAB 3: NBFC RECEIVABLES */}
      {activeTab === "RECEIVABLES" ? (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label="Search Invoice / Customer / Mobile / IMEI">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. INV-2038, 98110, IMEI..."
                />
              </Field>

              <Field label="Finance Company">
                <Select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}>
                  <option value="ALL">All Companies</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Status">
                <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="ALL">All Statuses</option>
                  <option value="EMI_PENDING">Pending Payout</option>
                  <option value="PARTIALLY_RECEIVED">Partially Settled</option>
                  <option value="RECEIVED">Fully Settled</option>
                  <option value="CANCELLED">Cancelled</option>
                </Select>
              </Field>

              <Field label="From Date">
                <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </Field>

              <Field label="To Date">
                <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead
              title={`EMI Receivables List (${filteredReceivables.length})`}
              right={
                <span className="text-[12px] text-muted-foreground font-medium">
                  Total Pending from NBFCs: <strong className="text-primary num">{inr(metrics.totalPending)}</strong>
                </span>
              }
            />

            {filteredReceivables.length === 0 ? (
              <Empty
                icon="💳"
                text={
                  loading
                    ? "Loading EMI receivables..."
                    : "No EMI receivables found matching your criteria. Process an EMI sale from POS to generate records."
                }
              />
            ) : (
              <Table
                head={[
                  "Invoice",
                  "Customer",
                  "Mobile",
                  "IMEI",
                  "Finance Company",
                  ">Sale Amount",
                  ">Down Payment",
                  ">Financed Amount",
                  ">Received",
                  ">Remaining",
                  "Expected Date",
                  "Status",
                  "Action",
                ]}
              >
                {filteredReceivables.map((r) => {
                  const remaining = Math.max(0, r.netReceivable - r.receivedAmount);
                  return (
                    <Row key={r.id}>
                      <Td mono className="font-semibold text-foreground">
                        {r.invoiceId}
                        {r.financeReferenceNumber ? (
                          <div className="text-[10px] text-primary/80 font-mono">Ref: {r.financeReferenceNumber}</div>
                        ) : null}
                      </Td>
                      <Td className="font-medium">{r.customerName}</Td>
                      <Td mono className="text-muted-foreground">{r.customerMobile || "—"}</Td>
                      <Td mono className="text-[11px] text-muted-foreground font-mono">{r.imei || "—"}</Td>
                      <Td className="font-medium text-foreground">{r.emiCompanyName}</Td>
                      <Td right mono className="font-medium">{inr(r.totalAmount)}</Td>
                      <Td right mono className="text-emerald-600 font-medium">{inr(r.downPayment)}</Td>
                      <Td right mono className="font-semibold text-primary">{inr(r.emiFinancedAmount)}</Td>
                      <Td right mono className="font-semibold text-emerald-600">{inr(r.receivedAmount)}</Td>
                      <Td right mono className={`font-bold ${remaining > 0 ? "text-amber-600" : "text-muted-foreground"}`}>
                        {inr(remaining)}
                      </Td>
                      <Td className="text-muted-foreground text-[11.5px]">{r.expectedPaymentDate || r.emiSaleDate || "—"}</Td>
                      <Td><Badge tone={getStatusTone(r.status)}>{r.status.replace("_", " ")}</Badge></Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          {r.status !== "RECEIVED" && r.status !== "CANCELLED" ? (
                            <Button size="sm" variant="primary" onClick={() => openSettlement(r)}>
                              Receive Payout
                            </Button>
                          ) : (
                            <Button size="sm" variant="soft" onClick={() => openHistory(r)}>
                              History
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { setDetailReceivable(r); setDetailsModalOpen(true); }}>
                            Details
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {/* TAB 4: FINANCE PARTNERS */}
      {activeTab === "COMPANIES" ? (
        <div className="space-y-4">
          <Card>
            <div className="p-4 flex items-center justify-between gap-3">
              <Input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Search finance partners by name, contact, phone..."
                className="max-w-md"
              />
              <span className="text-[12px] text-muted-foreground font-medium">
                {filteredCompanies.length} partner companies configured
              </span>
            </div>
          </Card>

          <Card>
            <CardHead
              title="Finance / NBFC Partner Companies"
              right={
                <Button size="sm" variant="primary" onClick={openAddCompany}>
                  + New Partner
                </Button>
              }
            />

            {filteredCompanies.length === 0 ? (
              <Empty icon="🏢" text="No finance companies found." />
            ) : (
              <Table
                head={[
                  "Company Name",
                  "Contact Person",
                  "Mobile",
                  ">Default Interest",
                  ">Default Tenure",
                  ">Processing Fee",
                  "Status",
                  "Actions",
                ]}
              >
                {filteredCompanies.map((c) => (
                  <Row key={c.id}>
                    <Td className="font-semibold text-foreground">{c.companyName}</Td>
                    <Td>{c.contactPerson || "—"}</Td>
                    <Td mono>{c.mobile || "—"}</Td>
                    <Td right mono>{c.defaultInterestRate ?? 12}%</Td>
                    <Td right mono>{c.defaultTenure ?? 12} Months</Td>
                    <Td right mono>{inr(c.processingFee || 0)}</Td>
                    <Td>
                      <Badge tone={c.active !== false ? "success" : "neutral"}>
                        {c.active !== false ? "Active" : "Inactive"}
                      </Badge>
                    </Td>
                    <Td>
                      <Button size="sm" variant="ghost" onClick={() => openEditCompany(c)}>
                        Edit
                      </Button>
                    </Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {/* TAB 5: COMPREHENSIVE EMI REPORT */}
      {activeTab === "REPORTS" ? (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="From Date">
                <Input
                  type="date"
                  value={reportFilters.fromDate}
                  onChange={(e) => setReportFilters({ ...reportFilters, fromDate: e.target.value })}
                />
              </Field>
              <Field label="To Date">
                <Input
                  type="date"
                  value={reportFilters.toDate}
                  onChange={(e) => setReportFilters({ ...reportFilters, toDate: e.target.value })}
                />
              </Field>
              <Field label="Finance Company">
                <Select
                  value={reportFilters.companyId}
                  onChange={(e) => setReportFilters({ ...reportFilters, companyId: e.target.value })}
                >
                  <option value="ALL">All Partners</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.companyName}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Loan Status">
                <Select
                  value={reportFilters.status}
                  onChange={(e) => setReportFilters({ ...reportFilters, status: e.target.value })}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PARTIALLY_PAID">Partially Paid</option>
                  <option value="PAID">Paid</option>
                  <option value="OVERDUE">Overdue</option>
                </Select>
              </Field>
              <Field label="Salesperson">
                <Input
                  value={reportFilters.salesPerson}
                  onChange={(e) => setReportFilters({ ...reportFilters, salesPerson: e.target.value })}
                  placeholder="e.g. Cashier"
                />
              </Field>
              <Field label="Device IMEI">
                <Input
                  value={reportFilters.imei}
                  onChange={(e) => setReportFilters({ ...reportFilters, imei: e.target.value })}
                  placeholder="e.g. 86420..."
                />
              </Field>
            </div>
          </Card>

          {/* Report KPI Metrics */}
          {reportData?.metrics ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              <Stat label="Total EMI Sales" value={inr(reportData.metrics.totalEmiSales)} hint={`${reportData.metrics.totalEmiSalesCount} loan accounts`} />
              <Stat label="Financed Principal" value={inr(reportData.metrics.totalFinanceAmount)} tone="info" />
              <Stat label="Down Payments" value={inr(reportData.metrics.totalDownPayment)} tone="success" />
              <Stat label="NBFC Receivable" value={inr(reportData.metrics.totalReceivable)} />
              <Stat label="NBFC Settled" value={inr(reportData.metrics.totalReceived)} tone="success" />
              <Stat label="Customer Due" value={inr(reportData.metrics.totalOutstanding)} tone="warning" />
              <Stat label="Overdue Amount" value={inr(reportData.metrics.overdueAmount)} tone={reportData.metrics.overdueAmount > 0 ? "danger" : "success"} />
            </div>
          ) : null}

          {/* Detailed report table */}
          <Card>
            <CardHead title="EMI Transactions Drill-down" />
            {!reportData?.accounts || reportData.accounts.length === 0 ? (
              <Empty icon="📊" text="No EMI transactions matching report filters." />
            ) : (
              <Table
                head={[
                  "Invoice",
                  "Customer",
                  "Product / Device",
                  "Partner",
                  ">Sale Price",
                  ">Down Payment",
                  ">Loan Principal",
                  ">Monthly EMI",
                  ">Total Paid",
                  ">Outstanding",
                  "Status",
                ]}
              >
                {reportData.accounts.map((a: any) => (
                  <Row key={a.id}>
                    <Td mono className="font-semibold text-foreground">{a.invoice_id}</Td>
                    <Td className="font-medium">{a.customer_name}</Td>
                    <Td>{a.product_name || "Device"}</Td>
                    <Td>{a.finance_company_name || "Direct"}</Td>
                    <Td right mono className="font-medium">{inr(a.sale_amount)}</Td>
                    <Td right mono className="text-emerald-600 font-medium">{inr(a.down_payment)}</Td>
                    <Td right mono className="font-bold text-primary">{inr(a.finance_amount)}</Td>
                    <Td right mono className="font-semibold text-foreground">{inr(a.monthly_emi)}</Td>
                    <Td right mono className="text-emerald-600 font-semibold">{inr(a.total_paid)}</Td>
                    <Td right mono className="font-bold text-amber-600">{inr(a.outstanding_amount)}</Td>
                    <Td><Badge tone={getStatusTone(a.status)}>{a.status}</Badge></Td>
                  </Row>
                ))}
              </Table>
            )}
          </Card>
        </div>
      ) : null}

      {/* Record Customer Installment Payment Modal */}
      {custPaymentModalOpen && selectedAccount ? (
        <Modal
          open={custPaymentModalOpen}
          title={`Record Customer EMI Payment — ${selectedAccount.customerName}`}
          onClose={() => setCustPaymentModalOpen(false)}
        >
          <form onSubmit={handleCustomerPaymentSubmit} className="space-y-4">
            <div className="rounded-xl border border-border bg-slate-50 p-3.5 text-[12.5px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #:</span>
                <span className="font-mono font-bold text-foreground">{selectedAccount.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-semibold text-foreground">{selectedAccount.productName || "Mobile Device"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Regular Monthly EMI:</span>
                <span className="font-bold text-primary num">{inr(selectedAccount.monthlyEmi)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Paid:</span>
                <span className="font-medium text-emerald-600 num">{inr(selectedAccount.totalPaid)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span>Remaining Loan Balance:</span>
                <span className="num text-primary font-extrabold">{inr(selectedAccount.outstandingAmount)}</span>
              </div>
            </div>

            <Field label="Payment Amount (₹) *">
              <Input
                type="number"
                min="1"
                max={selectedAccount.outstandingAmount}
                value={custPayAmount || ""}
                onChange={(e) => setCustPayAmount(Number(e.target.value))}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment Mode *">
                <Select value={custPayMethod} onChange={(e) => setCustPayMethod(e.target.value as any)}>
                  <option value="Cash">Cash Drawer</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="Card">Debit / Credit Card</option>
                  <option value="Bank">Direct Bank Transfer</option>
                </Select>
              </Field>
              <Field label="Payment Date *">
                <Input type="date" value={custPayDate} onChange={(e) => setCustPayDate(e.target.value)} required />
              </Field>
            </div>

            <Field label="Reference / UTR / Transaction No">
              <Input
                value={custPayRef}
                onChange={(e) => setCustPayRef(e.target.value)}
                placeholder="e.g. UPI-9842104"
              />
            </Field>

            <Field label="Remarks">
              <Input
                value={custPayRemarks}
                onChange={(e) => setCustPayRemarks(e.target.value)}
                placeholder="e.g. Month 2 EMI received"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setCustPaymentModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={custPaySubmitting}>
                {custPaySubmitting ? "Recording..." : `Confirm Payment (${inr(custPayAmount)})`}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Foreclose / Pre-close Modal */}
      {forecloseModalOpen && forecloseAccount ? (
        <Modal
          open={forecloseModalOpen}
          title={`Pre-Close / Foreclose Loan — ${forecloseAccount.customerName}`}
          onClose={() => setForecloseModalOpen(false)}
        >
          <form onSubmit={handleForecloseSubmit} className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 text-[12.5px] space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-amber-800">
                <AlertTriangle className="size-4" />
                <span>Foreclosure Settlement Summary</span>
              </div>
              <div className="flex justify-between text-muted-foreground pt-1">
                <span>Outstanding Balance:</span>
                <span className="font-bold text-foreground num">{inr(forecloseAccount.outstandingAmount)}</span>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <span>Foreclosure Penalty / Charges:</span>
                <span className="font-medium text-foreground num">+{inr(forecloseCharges)}</span>
              </div>
              <div className="flex justify-between border-t border-amber-200 pt-1.5 text-base font-extrabold text-amber-900">
                <span>Final Settlement Amount:</span>
                <span className="num">{inr(round2(forecloseAccount.outstandingAmount + forecloseCharges))}</span>
              </div>
            </div>

            <Field label="Foreclosure Charges (₹)">
              <Input
                type="number"
                min="0"
                value={forecloseCharges || ""}
                onChange={(e) => setForeclosureCharges(Math.max(0, Number(e.target.value) || 0))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Settlement Mode *">
                <Select value={forecloseMethod} onChange={(e) => setForecloseMethod(e.target.value as any)}>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="Card">Card</option>
                  <option value="Bank">Bank</option>
                </Select>
              </Field>
              <Field label="Reference No">
                <Input value={forecloseRef} onChange={(e) => setForecloseRef(e.target.value)} placeholder="UTR / Txn Ref" />
              </Field>
            </div>

            <Field label="Foreclosure Remarks">
              <Input value={forecloseRemarks} onChange={(e) => setForecloseRemarks(e.target.value)} />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setForecloseModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={forecloseSubmitting}>
                {forecloseSubmitting ? "Closing..." : `Confirm Full Foreclosure (${inr(round2(forecloseAccount.outstandingAmount + forecloseCharges))})`}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Account Details & Full Schedule Modal */}
      {accountDetailsModalOpen && detailAccount ? (
        <Modal
          open={accountDetailsModalOpen}
          title={`Customer EMI Account Details — Inv #${detailAccount.invoiceId}`}
          onClose={() => setAccountDetailsModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            {/* Customer EMI Profile (Matches Requirement 13) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl bg-slate-50 p-4 border border-border text-[12px]">
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Customer</span>
                <div className="font-bold text-foreground mt-0.5">{detailAccount.customerName}</div>
                <div className="font-mono text-muted-foreground">{detailAccount.customerMobile || "No phone"}</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Product & IMEI</span>
                <div className="font-bold text-foreground mt-0.5">{detailAccount.productName || "Mobile Device"}</div>
                <div className="font-mono text-muted-foreground text-[11px]">{detailAccount.imei || "Non-serialized"}</div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Financing Details</span>
                <div className="font-bold text-primary mt-0.5">{detailAccount.financeCompanyName || "Direct Store"}</div>
                <div className="text-muted-foreground">
                  {detailAccount.interestRate}% ({detailAccount.interestType.replace("_", " ")}) • {detailAccount.tenureMonths}M
                </div>
              </div>
              <div>
                <span className="text-[10px] text-muted-foreground uppercase font-semibold">Loan Repayment</span>
                <div className="font-bold text-foreground mt-0.5">EMI: <span className="text-primary num">{inr(detailAccount.monthlyEmi)}</span></div>
                <div className="text-muted-foreground num">Paid: {inr(detailAccount.totalPaid)} • Due: {inr(detailAccount.outstandingAmount)}</div>
              </div>
            </div>

            {/* Repayment Amortization Schedule Table */}
            <div>
              <div className="text-[13px] font-bold text-foreground mb-2 flex items-center justify-between">
                <span>Repayment Amortization Schedule ({detailAccount.schedule?.length || 0} Installments)</span>
                <Badge tone={getStatusTone(detailAccount.status)}>{detailAccount.status}</Badge>
              </div>

              {!detailAccount.schedule || detailAccount.schedule.length === 0 ? (
                <Empty text="No schedule records found." />
              ) : (
                <div className="max-h-80 overflow-y-auto rounded-xl border border-border">
                  <Table head={["EMI #", "Due Date", ">Opening", ">EMI Amount", ">Interest", ">Principal", ">Closing", "Paid Amount", "Status"]}>
                    {detailAccount.schedule.map((s) => (
                      <Row key={s.installmentNo}>
                        <Td className="font-semibold text-center">{s.installmentNo}</Td>
                        <Td className="font-medium">{s.dueDate}</Td>
                        <Td right mono>{inr(s.openingPrincipal)}</Td>
                        <Td right mono className="font-bold text-foreground">{inr(s.emi)}</Td>
                        <Td right mono className="text-amber-600">{inr(s.interest)}</Td>
                        <Td right mono className="text-emerald-600">{inr(s.principal)}</Td>
                        <Td right mono className="font-semibold text-foreground">
                          {s.closingPrincipal === 0 ? "₹0.00" : inr(s.closingPrincipal)}
                        </Td>
                        <Td mono className="text-emerald-600 font-semibold">{inr(s.paidAmount || 0)}</Td>
                        <Td><Badge tone={s.status === "PAID" ? "success" : "neutral"}>{s.status}</Badge></Td>
                      </Row>
                    ))}
                  </Table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              {detailAccount.status !== "PAID" && detailAccount.status !== "CANCELLED" ? (
                <>
                  <Button variant="primary" onClick={() => { setAccountDetailsModalOpen(false); openCustomerPayment(detailAccount); }}>
                    Pay EMI
                  </Button>
                  <Button variant="soft" onClick={() => { setAccountDetailsModalOpen(false); openForeclosure(detailAccount); }}>
                    Pre-Close
                  </Button>
                </>
              ) : null}
              <Button variant="ghost" onClick={() => setAccountDetailsModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Record NBFC Receipt Modal */}
      {settleModalOpen && selectedReceivable ? (
        <Modal
          open={settleModalOpen}
          title={`Record NBFC Payout Settlement — ${selectedReceivable.emiCompanyName}`}
          onClose={() => setSettleModalOpen(false)}
        >
          <form onSubmit={handleSettleSubmit} className="space-y-4">
            <div className="rounded-xl border border-border bg-slate-50 p-3 text-[12.5px] space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer:</span>
                <span className="font-semibold text-foreground">{selectedReceivable.customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Invoice #:</span>
                <span className="font-mono font-semibold">{selectedReceivable.invoiceId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Financed Amount:</span>
                <span className="font-bold text-primary num">{inr(selectedReceivable.emiFinancedAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Already Received:</span>
                <span className="font-medium text-emerald-600 num">{inr(selectedReceivable.receivedAmount)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1 font-bold">
                <span>Remaining Due from Company:</span>
                <span className="num text-primary font-extrabold">
                  {inr(Math.max(0, selectedReceivable.netReceivable - selectedReceivable.receivedAmount))}
                </span>
              </div>
            </div>

            <Field label="Amount Received from Finance Co (₹) *">
              <Input
                type="number"
                min="1"
                max={Math.max(0, selectedReceivable.netReceivable - selectedReceivable.receivedAmount)}
                value={settleAmount || ""}
                onChange={(e) => setSettleAmount(Number(e.target.value))}
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Settlement Method *">
                <Select value={settleMethod} onChange={(e) => setSettleMethod(e.target.value as any)}>
                  <option value="BANK_TRANSFER">Direct Bank NEFT/RTGS</option>
                  <option value="UPI">UPI / QR Code</option>
                  <option value="CASH">Cash Deposit</option>
                  <option value="OTHER">Cheque / Other</option>
                </Select>
              </Field>
              <Field label="Received Date *">
                <Input type="date" value={settleDate} onChange={(e) => setSettleDate(e.target.value)} required />
              </Field>
            </div>

            <Field label="Bank UTR / Reference No">
              <Input value={settleRef} onChange={(e) => setSettleRef(e.target.value)} placeholder="e.g. UTR-94827103" />
            </Field>

            <Field label="Notes / Remarks">
              <Input value={settleNotes} onChange={(e) => setSettleNotes(e.target.value)} placeholder="Payout batch remarks" />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setSettleModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={settleSubmitting}>
                {settleSubmitting ? "Recording..." : `Confirm Receipt (${inr(settleAmount)})`}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* Add / Edit Finance Partner Modal */}
      {companyModalOpen ? (
        <Modal
          open={companyModalOpen}
          title={editingCompany ? "Edit Finance Partner" : "Add Finance / EMI Company"}
          onClose={() => setCompanyModalOpen(false)}
        >
          <form onSubmit={handleCompanySubmit} className="space-y-3">
            <Field label="Company / NBFC Name *">
              <Input
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                placeholder="e.g. Bajaj Finserv, HDFC Bank, TVS Credit, IDFC"
                required
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Contact Person">
                <Input
                  value={companyForm.contactPerson}
                  onChange={(e) => setCompanyForm({ ...companyForm, contactPerson: e.target.value })}
                  placeholder="e.g. Area Manager"
                />
              </Field>
              <Field label="Phone / Mobile">
                <Input
                  value={companyForm.mobile}
                  onChange={(e) => setCompanyForm({ ...companyForm, mobile: e.target.value })}
                  placeholder="e.g. 9876543210"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Default Interest Rate (%)">
                <Input
                  type="number"
                  value={companyForm.defaultInterestRate}
                  onChange={(e) => setCompanyForm({ ...companyForm, defaultInterestRate: Number(e.target.value) })}
                  placeholder="12"
                />
              </Field>
              <Field label="Default Tenure (Months)">
                <Input
                  type="number"
                  value={companyForm.defaultTenure}
                  onChange={(e) => setCompanyForm({ ...companyForm, defaultTenure: Number(e.target.value) })}
                  placeholder="12"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Settlement Days">
                <Input
                  type="number"
                  value={companyForm.settlementDays}
                  onChange={(e) => setCompanyForm({ ...companyForm, settlementDays: Number(e.target.value) })}
                  placeholder="7"
                />
              </Field>
              <Field label="Processing Fee (₹)">
                <Input
                  type="number"
                  value={companyForm.processingFee}
                  onChange={(e) => setCompanyForm({ ...companyForm, processingFee: Number(e.target.value) })}
                  placeholder="0"
                />
              </Field>
            </div>

            <Field label="Partner Email">
              <Input
                type="email"
                value={companyForm.email}
                onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                placeholder="e.g. dealer.support@bajajfinserv.in"
              />
            </Field>

            <Field label="Address">
              <Input
                value={companyForm.address}
                onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                placeholder="Branch address"
              />
            </Field>

            <Field label="Notes / Merchant ID">
              <Input
                value={companyForm.notes}
                onChange={(e) => setCompanyForm({ ...companyForm, notes: e.target.value })}
                placeholder="e.g. MID-99482"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setCompanyModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={companySubmitting}>
                {companySubmitting ? "Saving..." : editingCompany ? "Update Partner" : "Save Partner"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}

      {/* History Modal */}
      {historyModalOpen && selectedReceivable ? (
        <Modal
          open={historyModalOpen}
          title={`Receipt History — Inv #${selectedReceivable.invoiceId}`}
          onClose={() => setHistoryModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between text-[13px] rounded-xl bg-slate-50 p-3 border border-border">
              <div>
                <span className="font-semibold">{selectedReceivable.customerName}</span> · {selectedReceivable.emiCompanyName}
              </div>
              <div>
                Total Financed: <strong className="num text-primary">{inr(selectedReceivable.emiFinancedAmount)}</strong> · Received: <strong className="num text-emerald-600">{inr(selectedReceivable.receivedAmount)}</strong>
              </div>
            </div>

            {historyLoading ? (
              <div className="py-8 text-center text-muted-foreground text-[13px]">Loading receipt history...</div>
            ) : receiptHistory.length === 0 ? (
              <Empty icon="🧾" text="No receipts recorded yet for this EMI receivable." />
            ) : (
              <Table head={["Receipt ID", "Date", ">Amount Received", "Payment Method", "Bank Reference", "Notes", "Received By"]}>
                {receiptHistory.map((rcp) => (
                  <Row key={rcp.id}>
                    <Td mono className="font-medium">{rcp.id}</Td>
                    <Td>{rcp.receivedDate}</Td>
                    <Td right mono className="font-bold text-emerald-600">{inr(rcp.amountReceived)}</Td>
                    <Td>{rcp.paymentMethod}</Td>
                    <Td mono className="text-muted-foreground">{rcp.bankReference || "—"}</Td>
                    <Td className="text-muted-foreground">{rcp.notes || "—"}</Td>
                    <Td>{rcp.receivedBy || "Staff"}</Td>
                  </Row>
                ))}
              </Table>
            )}

            <div className="flex justify-end pt-2">
              <Button variant="ghost" onClick={() => setHistoryModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
