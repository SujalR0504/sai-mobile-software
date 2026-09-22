import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, fmtDate } from "@/lib/format";
import type { CreditNote, CreditNoteItem, LineItem, Sale } from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { creditNoteToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { openWhatsAppChat, generateCreditNoteWhatsAppMessage } from "@/lib/whatsapp";
import {
  FileText,
  Plus,
  Search,
  Share2,
  Printer,
  Ban,
  DollarSign,
  ArrowRightLeft,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";

export const Route = createFileRoute("/credit-notes")({
  head: () => ({
    meta: [{ title: "Credit Notes — Mobile Shop ERP" }],
  }),
  component: CreditNotesPage,
});

interface SelectedReturnItem {
  productId: string;
  productName: string;
  qty: number;
  maxQty: number;
  rate: number;
  gstRate: number;
  unitId?: string;
  imei?: string;
  availableImeis?: string[];
  selected: boolean;
}

function CreditNotesPage() {
  const { db, createCreditNote, applyCreditNote, refundCreditNote, cancelCreditNote } = useStore();

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Create Modal State
  const [createModal, setCreateModal] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [saleId, setSaleId] = useState("");
  const [returnReason, setReturnReason] = useState("CUSTOMER_RETURN");
  const [notes, setNotes] = useState("");
  const [physicalReturn, setPhysicalReturn] = useState(true);
  const [adjustmentType, setAdjustmentType] = useState<"CREDIT_BALANCE" | "REFUND" | "INVOICE_ADJUSTMENT">("CREDIT_BALANCE");
  const [returnItems, setReturnItems] = useState<SelectedReturnItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Initial refund/adjustment inputs for create modal
  const [refundMethod, setRefundMethod] = useState("Cash");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [targetSaleId, setTargetSaleId] = useState("");

  // Action Modals State
  const [selectedNote, setSelectedNote] = useState<CreditNote | null>(null);
  const [invoiceModalNote, setInvoiceModalNote] = useState<CreditNote | null>(null);
  const [applyModal, setApplyModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);

  // Apply Modal Inputs
  const [allocSaleId, setAllocSaleId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");

  // Refund Modal Inputs
  const [actionRefundAmount, setActionRefundAmount] = useState("");
  const [actionRefundMethod, setActionRefundMethod] = useState("Cash");
  const [actionRefundAccountId, setActionRefundAccountId] = useState("");
  const [actionRefundRef, setActionRefundRef] = useState("");
  const [actionRefundNotes, setActionRefundNotes] = useState("");

  // Cancel Modal Inputs
  const [cancelReason, setCancelReason] = useState("");

  const creditNotes = db.creditNotes || [];

  // Customer Map
  const customerMap = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);

  // Customer sales
  const customerSales = useMemo(() => {
    if (!customerId) return [];
    return (db.sales || []).filter((s) => s.customerId === customerId);
  }, [db.sales, customerId]);

  // Selected Sale for Create
  const selectedSale = useMemo(() => {
    return (db.sales || []).find((s) => s.id === saleId);
  }, [db.sales, saleId]);

  // When selected sale changes, populate returnItems
  const handleSaleSelect = (sId: string) => {
    setSaleId(sId);
    const s = (db.sales || []).find((x) => x.id === sId);
    if (!s) {
      setReturnItems([]);
      return;
    }

    const items: SelectedReturnItem[] = (s.items || []).map((it) => ({
      productId: it.productId,
      productName: it.name,
      qty: it.qty,
      maxQty: it.qty,
      rate: it.price,
      gstRate: s.invoiceType === "NON_GST" ? 0 : (it.gst || 0),
      unitId: it.unitId,
      imei: it.imei || (it.imeis && it.imeis[0]) || undefined,
      availableImeis: it.imeis && it.imeis.length > 0 ? it.imeis : it.imei ? [it.imei] : [],
      selected: true,
    }));
    setReturnItems(items);
  };

  // KPI Calculations
  const kpi = useMemo(() => {
    let totalIssued = 0;
    let totalAdjusted = 0;
    let totalRefunded = 0;
    let totalAvailable = 0;

    for (const cn of creditNotes) {
      if (cn.status !== "CANCELLED") {
        totalIssued += cn.total;
        totalAdjusted += cn.appliedAmount || 0;
        totalRefunded += cn.refundedAmount || 0;
        totalAvailable += cn.remainingAmount || 0;
      }
    }

    return { totalIssued, totalAdjusted, totalRefunded, totalAvailable };
  }, [creditNotes]);

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    return creditNotes.filter((cn) => {
      if (statusFilter !== "ALL" && cn.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && cn.invoiceType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const noteNo = (cn.noteNumber || "").toLowerCase();
        const cust = (cn.customerName || customerMap.get(cn.customerId)?.name || "").toLowerCase();
        const origInv = (cn.originalInvoiceNo || "").toLowerCase();
        const phone = (customerMap.get(cn.customerId)?.phone || "").toLowerCase();
        if (!noteNo.includes(q) && !cust.includes(q) && !origInv.includes(q) && !phone.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [creditNotes, statusFilter, typeFilter, search, customerMap]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setErrorMsg("");
    setCustomerId(db.customers[0]?.id || "");
    setSaleId("");
    setReturnItems([]);
    setReturnReason("CUSTOMER_RETURN");
    setNotes("");
    setPhysicalReturn(true);
    setAdjustmentType("CREDIT_BALANCE");
    setCreateModal(true);
  };

  // Submit Create Note
  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    const selectedRows = returnItems.filter((it) => it.selected && it.qty > 0);
    if (selectedRows.length === 0) {
      setErrorMsg("Please select at least one item with a quantity greater than 0.");
      return;
    }

    setSubmitting(true);
    try {
      const itemsPayload: CreditNoteItem[] = selectedRows.map((it) => ({
        productId: it.productId,
        productName: it.productName,
        qty: it.qty,
        rate: it.rate,
        gstRate: it.gstRate,
        taxableAmount: (it.rate * it.qty) / (1 + it.gstRate / 100),
        cgstPct: it.gstRate / 2,
        cgstAmount: ((it.rate * it.qty) - (it.rate * it.qty) / (1 + it.gstRate / 100)) / 2,
        sgstPct: it.gstRate / 2,
        sgstAmount: ((it.rate * it.qty) - (it.rate * it.qty) / (1 + it.gstRate / 100)) / 2,
        igstPct: 0,
        igstAmount: 0,
        totalAmount: it.rate * it.qty,
        imei: it.imei,
        unitId: it.unitId,
      }));

      await createCreditNote({
        customerId,
        originalInvoiceNo: selectedSale?.invoiceNo,
        originalInvoiceDate: selectedSale?.date,
        reason: returnReason,
        notes,
        physicalReturn,
        adjustmentType,
        items: itemsPayload,
        refundDetails:
          adjustmentType === "REFUND"
            ? {
                paymentMethod: refundMethod,
                paymentAccountId: refundAccountId || undefined,
              }
            : undefined,
        allocationDetails:
          adjustmentType === "INVOICE_ADJUSTMENT" && targetSaleId
            ? {
                saleId: targetSaleId,
              }
            : undefined,
      });

      setCreateModal(false);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create credit note.");
    } finally {
      setSubmitting(false);
    }
  };

  // Apply Action Modal Open
  const handleOpenApply = (note: CreditNote) => {
    setSelectedNote(note);
    setAllocSaleId("");
    setAllocAmount(String(note.remainingAmount));
    setApplyModal(true);
  };

  const handleSubmitApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !allocSaleId || !allocAmount) return;
    const amt = Number(allocAmount);
    if (amt <= 0 || amt > selectedNote.remainingAmount) {
      alert("Invalid allocation amount.");
      return;
    }

    try {
      await applyCreditNote(selectedNote.id, {
        allocations: [{ saleId: allocSaleId, amount: amt }],
      });
      setApplyModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to apply credit note.");
    }
  };

  // Refund Action Modal Open
  const handleOpenRefund = (note: CreditNote) => {
    setSelectedNote(note);
    setActionRefundAmount(String(note.remainingAmount));
    setActionRefundMethod("Cash");
    setActionRefundAccountId(db.paymentAccounts?.[0]?.id || "");
    setActionRefundRef("");
    setActionRefundNotes("");
    setRefundModal(true);
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !actionRefundAmount) return;
    const amt = Number(actionRefundAmount);
    if (amt <= 0 || amt > selectedNote.remainingAmount) {
      alert("Invalid refund amount.");
      return;
    }

    try {
      await refundCreditNote(selectedNote.id, {
        amount: amt,
        paymentMethod: actionRefundMethod,
        paymentAccountId: actionRefundAccountId || undefined,
        referenceNo: actionRefundRef || undefined,
        notes: actionRefundNotes || undefined,
      });
      setRefundModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to process refund.");
    }
  };

  // Cancel Action Modal Open
  const handleOpenCancel = (note: CreditNote) => {
    setSelectedNote(note);
    setCancelReason("");
    setCancelModal(true);
  };

  const handleSubmitCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !cancelReason.trim()) return;

    try {
      await cancelCreditNote(selectedNote.id, cancelReason);
      setCancelModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to cancel credit note.");
    }
  };

  // WhatsApp Share
  const handleShareWhatsApp = (cn: CreditNote) => {
    const cust = customerMap.get(cn.customerId);
    const phone = cust?.phone;
    if (!phone || phone === "—") {
      alert("Customer does not have a valid phone number recorded.");
      return;
    }

    const msg = generateCreditNoteWhatsAppMessage({
      customerName: cust.name,
      noteNumber: cn.noteNumber,
      date: cn.date,
      originalInvoiceNo: cn.originalInvoiceNo,
      reason: cn.reason,
      total: cn.total,
      appliedAmount: cn.appliedAmount,
      refundedAmount: cn.refundedAmount,
      remainingAmount: cn.remainingAmount,
      status: cn.status,
      items: cn.items?.map((i) => ({ name: i.productName, qty: i.qty, rate: i.rate })),
      shopName: db.settings.shopName,
    });

    openWhatsAppChat({
      phone,
      message: msg,
      actionName: "CREDIT_NOTE_WHATSAPP",
      recordId: cn.id,
    });
  };

  // Unpaid invoices for customer when applying
  const unpaidCustomerSales = useMemo(() => {
    if (!selectedNote) return [];
    return (db.sales || []).filter((s) => s.customerId === selectedNote.customerId && s.paid < s.total);
  }, [db.sales, selectedNote]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Credit Notes"
        sub="Manage customer credit notes, return items, apply invoices & cash/bank refunds."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1 inline" /> Create Credit Note
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-gradient-to-br from-blue-50 to-indigo-50/40 border-blue-200">
          <div className="text-xs text-blue-700 font-semibold uppercase tracking-wider">Total Credit Notes</div>
          <div className="text-xl font-bold text-blue-950 mt-1">{inr(kpi.totalIssued)}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">{creditNotes.length} notes issued</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-200">
          <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Adjusted in Invoices</div>
          <div className="text-xl font-bold text-emerald-950 mt-1">{inr(kpi.totalAdjusted)}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Applied to customer bills</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-amber-50 to-orange-50/40 border-amber-200">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Cash/Bank Refunded</div>
          <div className="text-xl font-bold text-amber-950 mt-1">{inr(kpi.totalRefunded)}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Paid out to customers</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-purple-50 to-pink-50/40 border-purple-200">
          <div className="text-xs text-purple-700 font-semibold uppercase tracking-wider">Available Outstanding</div>
          <div className="text-xl font-bold text-purple-950 mt-1">{inr(kpi.totalAvailable)}</div>
          <div className="text-[11px] text-purple-600 mt-0.5">Available customer balance</div>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHead
          title="Issued Credit Notes"
          sub={`${filteredNotes.length} notes matching criteria`}
          actions={
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search note#, customer, inv#..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded border border-slate-300 w-48 md:w-60 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <select
                className="text-xs py-1.5 px-2 rounded border border-slate-300 focus:outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="ALL">All Status</option>
                <option value="ISSUED">Issued (Unadjusted)</option>
                <option value="PARTIALLY_ADJUSTED">Partially Adjusted</option>
                <option value="FULLY_ADJUSTED">Fully Adjusted</option>
                <option value="REFUNDED">Refunded</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                className="text-xs py-1.5 px-2 rounded border border-slate-300 focus:outline-none"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Invoices</option>
                <option value="GST">GST Only</option>
                <option value="NON_GST">Non-GST Only</option>
              </select>
            </div>
          }
        />

        {filteredNotes.length === 0 ? (
          <Empty text="No credit notes found. Click '+ Create Credit Note' to generate one." />
        ) : (
          <Table head={["Note #", "Date", "Customer", "Against Inv", "Type", "Items Returned", ">Total", ">Adjusted", ">Available", "Status", "Actions"]}>
            {filteredNotes.map((cn) => {
              const cust = customerMap.get(cn.customerId);
              const isGst = cn.invoiceType === "GST";
              const isCancelled = cn.status === "CANCELLED";
              const hasBalance = (cn.remainingAmount || 0) > 0 && !isCancelled;

              return (
                <tr key={cn.id} className={`hover:bg-slate-50/80 ${isCancelled ? "opacity-60 bg-red-50/20" : ""}`}>
                  <Td>
                    <div className="font-mono font-bold text-blue-700">{cn.noteNumber}</div>
                    <div className="text-[10px] text-slate-500">{cn.reason}</div>
                  </Td>
                  <Td>
                    <div className="text-xs">{fmtDate(cn.date)}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-slate-900">{cn.customerName || cust?.name || "Customer"}</div>
                    {cust?.phone && cust.phone !== "—" && (
                      <div className="text-[10px] text-slate-500 font-mono">{cust.phone}</div>
                    )}
                  </Td>
                  <Td>
                    {cn.originalInvoiceNo ? (
                      <div>
                        <span className="font-mono font-semibold text-slate-800">{cn.originalInvoiceNo}</span>
                        {cn.originalInvoiceDate && (
                          <div className="text-[10px] text-slate-400">{fmtDate(cn.originalInvoiceDate)}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="space-y-0.5">
                      <Badge variant={isGst ? "info" : "default"}>{cn.invoiceType}</Badge>
                      <div className="text-[10px] text-slate-500">
                        {cn.physicalReturn ? "📦 Physical" : "💳 Financial"}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-800">
                      {cn.items?.length || 0} item(s)
                    </div>
                    {cn.items && cn.items.length > 0 && (
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {cn.items.map((i) => i.productName).join(", ")}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="font-bold text-slate-900">{inr(cn.total)}</div>
                    {isGst && (
                      <div className="text-[10px] text-slate-400">
                        Tax: {inr((cn.cgst || 0) + (cn.sgst || 0) + (cn.igst || 0))}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="text-xs font-medium text-emerald-700">
                      {inr(cn.appliedAmount || 0)}
                    </div>
                    {(cn.refundedAmount || 0) > 0 && (
                      <div className="text-[10px] text-amber-600">
                        Refund: {inr(cn.refundedAmount!)}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="font-bold text-purple-700">
                      {inr(cn.remainingAmount || 0)}
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        cn.status === "FULLY_ADJUSTED"
                          ? "success"
                          : cn.status === "PARTIALLY_ADJUSTED"
                          ? "warning"
                          : cn.status === "REFUNDED"
                          ? "info"
                          : cn.status === "CANCELLED"
                          ? "danger"
                          : "default"
                      }
                    >
                      {cn.status}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {/* Print Invoice */}
                      <button
                        title="Print / View Credit Note Document"
                        onClick={() => setInvoiceModalNote(cn)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-blue-600 transition"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* WhatsApp */}
                      <button
                        title="Share on WhatsApp"
                        onClick={() => handleShareWhatsApp(cn)}
                        className="p-1 hover:bg-emerald-50 rounded text-slate-600 hover:text-emerald-600 transition"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {/* Adjust in Invoice */}
                      {hasBalance && (
                        <button
                          title="Adjust Against Sale Invoice"
                          onClick={() => handleOpenApply(cn)}
                          className="p-1 hover:bg-blue-50 rounded text-slate-600 hover:text-blue-600 transition"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}

                      {/* Refund */}
                      {hasBalance && (
                        <button
                          title="Issue Refund"
                          onClick={() => handleOpenRefund(cn)}
                          className="p-1 hover:bg-amber-50 rounded text-slate-600 hover:text-amber-600 transition"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cancel */}
                      {!isCancelled && (
                        <button
                          title="Cancel Credit Note"
                          onClick={() => handleOpenCancel(cn)}
                          className="p-1 hover:bg-red-50 rounded text-slate-600 hover:text-red-600 transition"
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* CREATE CREDIT NOTE MODAL */}
      <Modal
        open={createModal}
        onClose={() => !submitting && setCreateModal(false)}
        title="Create New Credit Note"
        sub="Issue credit note for returned goods, price adjustments, or trade discounts."
      >
        <form onSubmit={handleSubmitCreate} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Customer and Original Sale */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Select Customer *">
              <Select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setSaleId("");
                  setReturnItems([]);
                }}
              >
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone && c.phone !== "—" ? `(${c.phone})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Original Sale Invoice *">
              <Select
                value={saleId}
                onChange={(e) => handleSaleSelect(e.target.value)}
              >
                <option value="">-- Choose Sale Invoice --</option>
                {customerSales.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.invoiceNo} — {fmtDate(s.date)} — {inr(s.total)} ({s.invoiceType || "GST"})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Sale details preview */}
          {selectedSale && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Invoice: <strong className="text-slate-900">{selectedSale.invoiceNo}</strong></span>
                <span className="text-slate-600">Type: <Badge variant={selectedSale.invoiceType === "NON_GST" ? "default" : "info"}>{selectedSale.invoiceType || "GST"}</Badge></span>
                <span className="text-slate-600">Invoice Total: <strong className="text-slate-900">{inr(selectedSale.total)}</strong></span>
                <span className="text-slate-600">Paid: <strong className="text-emerald-700">{inr(selectedSale.paid)}</strong></span>
              </div>
            </div>
          )}

          {/* Items Table with IMEI selection and partial qty */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 flex justify-between items-center">
                <span>Select Items to Return / Credit</span>
                <span className="text-[11px] text-slate-500">Uncheck items you do not wish to return</span>
              </div>

              <div className="border border-slate-200 rounded max-h-56 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                    <tr>
                      <th className="p-2 w-8">Sel</th>
                      <th className="p-2">Item Name</th>
                      <th className="p-2 w-20">Qty</th>
                      <th className="p-2 w-24">Rate (₹)</th>
                      <th className="p-2">IMEI</th>
                      <th className="p-2 text-right w-24">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {returnItems.map((it, idx) => {
                      const itemTotal = it.selected ? it.rate * it.qty : 0;
                      return (
                        <tr key={idx} className={it.selected ? "bg-white" : "bg-slate-50 opacity-60"}>
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={it.selected}
                              onChange={(e) => {
                                const next = [...returnItems];
                                next[idx]!.selected = e.target.checked;
                                setReturnItems(next);
                              }}
                            />
                          </td>
                          <td className="p-2 font-medium text-slate-900">{it.productName}</td>
                          <td className="p-2">
                            <input
                              type="number"
                              min={1}
                              max={it.maxQty}
                              disabled={!it.selected}
                              className="w-16 px-1.5 py-1 text-xs border rounded focus:outline-none"
                              value={it.qty}
                              onChange={(e) => {
                                const val = Math.max(1, Math.min(it.maxQty, Number(e.target.value) || 1));
                                const next = [...returnItems];
                                next[idx]!.qty = val;
                                setReturnItems(next);
                              }}
                            />
                          </td>
                          <td className="p-2 font-mono">{inr(it.rate)}</td>
                          <td className="p-2">
                            {it.availableImeis && it.availableImeis.length > 0 ? (
                              <select
                                disabled={!it.selected}
                                className="text-[11px] p-1 border rounded w-full font-mono focus:outline-none"
                                value={it.imei || ""}
                                onChange={(e) => {
                                  const next = [...returnItems];
                                  next[idx]!.imei = e.target.value;
                                  setReturnItems(next);
                                }}
                              >
                                {it.availableImeis.map((im) => (
                                  <option key={im} value={im}>
                                    {im}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-slate-400 font-mono text-[10px]">No IMEI</span>
                            )}
                          </td>
                          <td className="p-2 text-right font-bold font-mono text-slate-900">
                            {inr(itemTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Row: Reason & Physical Return */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Credit Reason *">
              <Select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                <option value="CUSTOMER_RETURN">Customer Return / Changed Mind</option>
                <option value="DEFECTIVE_PRODUCT">Defective Product / Hardware Issue</option>
                <option value="PRICE_CORRECTION">Price Correction / Overcharge</option>
                <option value="DISCOUNT_AFTER_SALE">Post-Sale Discount / Promotion</option>
                <option value="ORDER_CANCELLATION">Order Cancellation</option>
                <option value="OTHER">Other Reason</option>
              </Select>
            </Field>

            <Field label="Physical Inventory Return?">
              <div className="pt-2 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="physicalReturn"
                    checked={physicalReturn === true}
                    onChange={() => setPhysicalReturn(true)}
                  />
                  <span><strong>YES</strong> (Restock unit & update IMEI)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="physicalReturn"
                    checked={physicalReturn === false}
                    onChange={() => setPhysicalReturn(false)}
                  />
                  <span><strong>NO</strong> (Pure Financial Credit)</span>
                </label>
              </div>
            </Field>
          </div>

          {/* Row: Initial Adjustment Type */}
          <Field label="How should this Credit Note be settled initially?">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label
                className={`border rounded p-2.5 text-xs cursor-pointer flex flex-col ${
                  adjustmentType === "CREDIT_BALANCE" ? "border-blue-500 bg-blue-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="adjType"
                    checked={adjustmentType === "CREDIT_BALANCE"}
                    onChange={() => setAdjustmentType("CREDIT_BALANCE")}
                  />
                  <span className="font-semibold text-slate-900">Customer Credit Balance</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Keep in customer's account for future purchases.
                </span>
              </label>

              <label
                className={`border rounded p-2.5 text-xs cursor-pointer flex flex-col ${
                  adjustmentType === "REFUND" ? "border-amber-500 bg-amber-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="adjType"
                    checked={adjustmentType === "REFUND"}
                    onChange={() => setAdjustmentType("REFUND")}
                  />
                  <span className="font-semibold text-slate-900">Immediate Refund</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Payout cash or bank transfer to customer right now.
                </span>
              </label>

              <label
                className={`border rounded p-2.5 text-xs cursor-pointer flex flex-col ${
                  adjustmentType === "INVOICE_ADJUSTMENT" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="adjType"
                    checked={adjustmentType === "INVOICE_ADJUSTMENT"}
                    onChange={() => setAdjustmentType("INVOICE_ADJUSTMENT")}
                  />
                  <span className="font-semibold text-slate-900">Apply to Unpaid Bill</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Directly knock off an outstanding customer invoice.
                </span>
              </label>
            </div>
          </Field>

          {/* Conditional: Refund Options */}
          {adjustmentType === "REFUND" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
              <div className="font-semibold text-amber-900">Refund Payout Details</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">Payment Method</label>
                  <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer / NEFT</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Card</option>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">Deduct From Account</label>
                  <Select value={refundAccountId} onChange={(e) => setRefundAccountId(e.target.value)}>
                    <option value="">-- Main Cash / Bank --</option>
                    {(db.paymentAccounts || []).map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.accountName} ({acc.accountType}) — {inr(acc.currentBalance)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Conditional: Invoice Adjustment Options */}
          {adjustmentType === "INVOICE_ADJUSTMENT" && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-2">
              <div className="font-semibold text-emerald-900">Select Invoice to Knock Off</div>
              <Select value={targetSaleId} onChange={(e) => setTargetSaleId(e.target.value)}>
                <option value="">-- Choose Unpaid Invoice --</option>
                {customerSales
                  .filter((s) => s.id !== saleId && s.paid < s.total)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoiceNo} — Due: {inr(s.total - s.paid)} (Total: {inr(s.total)})
                    </option>
                  ))}
              </Select>
            </div>
          )}

          <Field label="Remarks / Internal Notes">
            <Input
              placeholder="e.g. Return inspected by supervisor, customer requested refund"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setCreateModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || returnItems.filter((i) => i.selected).length === 0}>
              {submitting ? "Processing..." : "Generate Credit Note"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* APPLY TO INVOICE ACTION MODAL */}
      <Modal
        open={applyModal}
        onClose={() => setApplyModal(false)}
        title={`Apply Credit Note ${selectedNote?.noteNumber || ""}`}
        sub={`Available Credit Balance: ${inr(selectedNote?.remainingAmount || 0)}`}
      >
        <form onSubmit={handleSubmitApply} className="space-y-4">
          <Field label="Target Unpaid Invoice *">
            <Select value={allocSaleId} onChange={(e) => setAllocSaleId(e.target.value)}>
              <option value="">-- Choose Unpaid Invoice --</option>
              {unpaidCustomerSales.map((s) => {
                const due = s.total - s.paid;
                return (
                  <option key={s.id} value={s.id}>
                    {s.invoiceNo} — Date: {fmtDate(s.date)} — Pending Due: {inr(due)}
                  </option>
                );
              })}
            </Select>
          </Field>

          <Field label="Amount to Apply (₹) *">
            <Input
              type="number"
              step="0.01"
              min={1}
              max={selectedNote?.remainingAmount || 0}
              value={allocAmount}
              onChange={(e) => setAllocAmount(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setApplyModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!allocSaleId || !allocAmount}>
              Confirm Allocation
            </Button>
          </div>
        </form>
      </Modal>

      {/* REFUND ACTION MODAL */}
      <Modal
        open={refundModal}
        onClose={() => setRefundModal(false)}
        title={`Issue Refund for ${selectedNote?.noteNumber || ""}`}
        sub={`Available Balance: ${inr(selectedNote?.remainingAmount || 0)}`}
      >
        <form onSubmit={handleSubmitRefund} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Refund Amount (₹) *">
              <Input
                type="number"
                step="0.01"
                min={1}
                max={selectedNote?.remainingAmount || 0}
                value={actionRefundAmount}
                onChange={(e) => setActionRefundAmount(e.target.value)}
              />
            </Field>

            <Field label="Payment Method *">
              <Select value={actionRefundMethod} onChange={(e) => setActionRefundMethod(e.target.value)}>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer / NEFT</option>
                <option value="UPI">UPI</option>
                <option value="Card">Card</option>
              </Select>
            </Field>
          </div>

          <Field label="Pay Out From Account">
            <Select value={actionRefundAccountId} onChange={(e) => setActionRefundAccountId(e.target.value)}>
              <option value="">-- Main Cash / Bank --</option>
              {(db.paymentAccounts || []).map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.accountName} ({acc.accountType}) — Balance: {inr(acc.currentBalance)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Txn / Ref No.">
              <Input
                placeholder="e.g. UTR1283941"
                value={actionRefundRef}
                onChange={(e) => setActionRefundRef(e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <Input
                placeholder="e.g. Refunded to customer"
                value={actionRefundNotes}
                onChange={(e) => setActionRefundNotes(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setRefundModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!actionRefundAmount}>
              Issue Refund
            </Button>
          </div>
        </form>
      </Modal>

      {/* CANCEL CREDIT NOTE MODAL */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title={`Cancel Credit Note ${selectedNote?.noteNumber || ""}`}
        sub="Warning: Cancellation reverses customer ledger credit and returned inventory."
      >
        <form onSubmit={handleSubmitCancel} className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Irreversible Action</span>
            </div>
            <div>
              Cancelling this Credit Note will deduct the credit from the customer's ledger.
              {selectedNote?.physicalReturn && (
                <div>Any physical stock returned will be decremented from stock inventory.</div>
              )}
            </div>
          </div>

          <Field label="Reason for Cancellation *">
            <Input
              required
              placeholder="e.g. Issued by mistake / customer retracted return"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setCancelModal(false)}>
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={!cancelReason.trim()}>
              Confirm Cancellation
            </Button>
          </div>
        </form>
      </Modal>

      {/* PRINT / PREVIEW INVOICE MODAL */}
      {invoiceModalNote && (
        <InvoiceModal
          open={!!invoiceModalNote}
          onClose={() => setInvoiceModalNote(null)}
          documentProps={creditNoteToInvoiceProps(invoiceModalNote, db)}
        />
      )}
    </div>
  );
}
