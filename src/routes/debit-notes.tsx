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
import type { DebitNote, DebitNoteItem, Purchase, Supplier } from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { debitNoteToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { openWhatsAppChat, generateDebitNoteWhatsAppMessage } from "@/lib/whatsapp";
import {
  FileSpreadsheet,
  Plus,
  Search,
  Share2,
  Printer,
  Ban,
  DollarSign,
  ArrowRightLeft,
  AlertTriangle,
  Building2,
} from "lucide-react";

export const Route = createFileRoute("/debit-notes")({
  head: () => ({
    meta: [{ title: "Debit Notes — Mobile Shop ERP" }],
  }),
  component: DebitNotesPage,
});

interface SelectedDebitItem {
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

function DebitNotesPage() {
  const { db, createDebitNote, applyDebitNote, refundDebitNote, cancelDebitNote } = useStore();

  // Filters & Search
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  // Create Modal State
  const [createModal, setCreateModal] = useState(false);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [returnReason, setReturnReason] = useState("PURCHASE_RETURN");
  const [notes, setNotes] = useState("");
  const [physicalReturn, setPhysicalReturn] = useState(true);
  const [adjustmentType, setAdjustmentType] = useState<"CREDIT_BALANCE" | "REFUND" | "PURCHASE_ADJUSTMENT">("CREDIT_BALANCE");
  const [returnItems, setReturnItems] = useState<SelectedDebitItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Initial refund/adjustment inputs for create modal
  const [refundMethod, setRefundMethod] = useState("Bank Transfer");
  const [refundAccountId, setRefundAccountId] = useState("");
  const [targetPurchaseId, setTargetPurchaseId] = useState("");

  // Action Modals State
  const [selectedNote, setSelectedNote] = useState<DebitNote | null>(null);
  const [invoiceModalNote, setInvoiceModalNote] = useState<DebitNote | null>(null);
  const [applyModal, setApplyModal] = useState(false);
  const [refundModal, setRefundModal] = useState(false);
  const [cancelModal, setCancelModal] = useState(false);

  // Apply Modal Inputs
  const [allocPurchaseId, setAllocPurchaseId] = useState("");
  const [allocAmount, setAllocAmount] = useState("");

  // Refund Modal Inputs
  const [actionRefundAmount, setActionRefundAmount] = useState("");
  const [actionRefundMethod, setActionRefundMethod] = useState("Bank Transfer");
  const [actionRefundAccountId, setActionRefundAccountId] = useState("");
  const [actionRefundRef, setActionRefundRef] = useState("");
  const [actionRefundNotes, setActionRefundNotes] = useState("");

  // Cancel Modal Inputs
  const [cancelReason, setCancelReason] = useState("");

  const debitNotes = db.debitNotes || [];

  // Supplier Map
  const supplierMap = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers]);

  // Supplier purchases
  const supplierPurchases = useMemo(() => {
    if (!supplierId) return [];
    return (db.purchases || []).filter((p) => (p.supplierId || p.dealerId) === supplierId);
  }, [db.purchases, supplierId]);

  // Selected Purchase for Create
  const selectedPurchase = useMemo(() => {
    return (db.purchases || []).find((p) => p.id === purchaseId);
  }, [db.purchases, purchaseId]);

  // When selected purchase changes, populate returnItems
  const handlePurchaseSelect = (pId: string) => {
    setPurchaseId(pId);
    const p = (db.purchases || []).find((x) => x.id === pId);
    if (!p) {
      setReturnItems([]);
      return;
    }

    const items: SelectedDebitItem[] = (p.items || []).map((it) => ({
      productId: it.productId,
      productName: it.name,
      qty: it.qty,
      maxQty: it.qty,
      rate: it.costPrice || it.price,
      gstRate: p.purchaseType === "NON_GST" ? 0 : (it.gstRate || it.gst || 0),
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

    for (const dn of debitNotes) {
      if (dn.status !== "CANCELLED") {
        totalIssued += dn.total || dn.amount;
        totalAdjusted += dn.appliedAmount || 0;
        totalRefunded += dn.refundedAmount || 0;
        totalAvailable += dn.remainingAmount || 0;
      }
    }

    return { totalIssued, totalAdjusted, totalRefunded, totalAvailable };
  }, [debitNotes]);

  // Filtered Notes
  const filteredNotes = useMemo(() => {
    return debitNotes.filter((dn) => {
      if (statusFilter !== "ALL" && dn.status !== statusFilter) return false;
      if (typeFilter !== "ALL" && dn.invoiceType !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const noteNo = (dn.noteNumber || "").toLowerCase();
        const sup = (dn.dealerName || supplierMap.get(dn.supplierId || dn.dealerId || "")?.name || "").toLowerCase();
        const origInv = (dn.originalInvoiceNo || "").toLowerCase();
        if (!noteNo.includes(q) && !sup.includes(q) && !origInv.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [debitNotes, statusFilter, typeFilter, search, supplierMap]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setErrorMsg("");
    setSupplierId(db.suppliers[0]?.id || "");
    setPurchaseId("");
    setReturnItems([]);
    setReturnReason("PURCHASE_RETURN");
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
      const itemsPayload: DebitNoteItem[] = selectedRows.map((it) => ({
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

      await createDebitNote({
        dealerId: supplierId,
        purchaseId: selectedPurchase?.id,
        originalInvoiceNo: selectedPurchase?.invoiceNo,
        originalInvoiceDate: selectedPurchase?.date,
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
          adjustmentType === "PURCHASE_ADJUSTMENT" && targetPurchaseId
            ? {
                purchaseId: targetPurchaseId,
              }
            : undefined,
      });

      setCreateModal(false);
    } catch (err: any) {
      setErrorMsg(err?.message || "Failed to create debit note.");
    } finally {
      setSubmitting(false);
    }
  };

  // Apply Action Modal Open
  const handleOpenApply = (note: DebitNote) => {
    setSelectedNote(note);
    setAllocPurchaseId("");
    setAllocAmount(String(note.remainingAmount));
    setApplyModal(true);
  };

  const handleSubmitApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !allocPurchaseId || !allocAmount) return;
    const amt = Number(allocAmount);
    if (amt <= 0 || amt > (selectedNote.remainingAmount ?? 0)) {
      alert("Invalid allocation amount.");
      return;
    }

    try {
      await applyDebitNote(selectedNote.id, {
        allocations: [{ purchaseId: allocPurchaseId, amount: amt }],
      });
      setApplyModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to apply debit note.");
    }
  };

  // Receive Dealer Refund Modal Open
  const handleOpenRefund = (note: DebitNote) => {
    setSelectedNote(note);
    setActionRefundAmount(String(note.remainingAmount));
    setActionRefundMethod("Bank Transfer");
    setActionRefundAccountId(db.paymentAccounts?.[0]?.id || "");
    setActionRefundRef("");
    setActionRefundNotes("");
    setRefundModal(true);
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !actionRefundAmount) return;
    const amt = Number(actionRefundAmount);
    if (amt <= 0 || amt > (selectedNote.remainingAmount ?? 0)) {
      alert("Invalid refund amount.");
      return;
    }

    try {
      await refundDebitNote(selectedNote.id, {
        amount: amt,
        paymentMethod: actionRefundMethod,
        paymentAccountId: actionRefundAccountId || undefined,
        referenceNo: actionRefundRef || undefined,
        notes: actionRefundNotes || undefined,
      });
      setRefundModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to record refund.");
    }
  };

  // Cancel Action Modal Open
  const handleOpenCancel = (note: DebitNote) => {
    setSelectedNote(note);
    setCancelReason("");
    setCancelModal(true);
  };

  const handleSubmitCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNote || !cancelReason.trim()) return;

    try {
      await cancelDebitNote(selectedNote.id, cancelReason);
      setCancelModal(false);
    } catch (err: any) {
      alert(err?.message || "Failed to cancel debit note.");
    }
  };

  // WhatsApp Share
  const handleShareWhatsApp = (dn: DebitNote) => {
    const sup = supplierMap.get(dn.supplierId || dn.dealerId || "");
    const phone = sup?.phone;
    if (!phone || phone === "—") {
      alert("Dealer does not have a valid contact phone recorded.");
      return;
    }

    const msg = generateDebitNoteWhatsAppMessage({
      dealerName: sup.name,
      noteNumber: dn.noteNumber,
      date: dn.date,
      originalInvoiceNo: dn.originalInvoiceNo,
      reason: dn.reason,
      total: dn.total || dn.amount,
      appliedAmount: dn.appliedAmount,
      refundedAmount: dn.refundedAmount,
      remainingAmount: dn.remainingAmount,
      status: dn.status,
      items: dn.items?.map((i) => ({ name: i.productName, qty: i.qty, rate: i.rate })),
      shopName: db.settings.shopName,
    });

    openWhatsAppChat({
      phone,
      message: msg,
      actionName: "DEBIT_NOTE_WHATSAPP",
      recordId: dn.id,
    });
  };

  // Unpaid purchases for dealer
  const unpaidDealerPurchases = useMemo(() => {
    if (!selectedNote) return [];
    const dealerId = selectedNote.supplierId || selectedNote.dealerId;
    return (db.purchases || []).filter(
      (p) => (p.supplierId || p.dealerId) === dealerId && p.paid < p.total
    );
  }, [db.purchases, selectedNote]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Debit Notes"
        sub="Manage supplier & dealer debit notes, purchase returns, bill adjustments & refunds."
        actions={
          <Button onClick={handleOpenCreate}>
            <Plus className="w-4 h-4 mr-1 inline" /> Create Debit Note
          </Button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 bg-gradient-to-br from-indigo-50 to-blue-50/40 border-indigo-200">
          <div className="text-xs text-indigo-700 font-semibold uppercase tracking-wider">Total Debit Notes</div>
          <div className="text-xl font-bold text-indigo-950 mt-1">{inr(kpi.totalIssued)}</div>
          <div className="text-[11px] text-indigo-600 mt-0.5">{debitNotes.length} notes raised</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-emerald-50 to-teal-50/40 border-emerald-200">
          <div className="text-xs text-emerald-700 font-semibold uppercase tracking-wider">Adjusted in Bills</div>
          <div className="text-xl font-bold text-emerald-950 mt-1">{inr(kpi.totalAdjusted)}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Applied to dealer purchase bills</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-amber-50 to-orange-50/40 border-amber-200">
          <div className="text-xs text-amber-700 font-semibold uppercase tracking-wider">Dealer Refunds Received</div>
          <div className="text-xl font-bold text-amber-950 mt-1">{inr(kpi.totalRefunded)}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Inflow received into accounts</div>
        </Card>
        <Card className="p-3 bg-gradient-to-br from-purple-50 to-pink-50/40 border-purple-200">
          <div className="text-xs text-purple-700 font-semibold uppercase tracking-wider">Available Outstanding</div>
          <div className="text-xl font-bold text-purple-950 mt-1">{inr(kpi.totalAvailable)}</div>
          <div className="text-[11px] text-purple-600 mt-0.5">Available dealer credit balance</div>
        </Card>
      </div>

      {/* Table Card */}
      <Card>
        <CardHead
          title="Raised Debit Notes"
          sub={`${filteredNotes.length} notes matching criteria`}
          actions={
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search note#, dealer, bill#..."
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
                <option value="REFUNDED">Refund Received</option>
                <option value="CANCELLED">Cancelled</option>
              </select>

              <select
                className="text-xs py-1.5 px-2 rounded border border-slate-300 focus:outline-none"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="ALL">All Bills</option>
                <option value="GST">GST Only</option>
                <option value="NON_GST">Non-GST Only</option>
              </select>
            </div>
          }
        />

        {filteredNotes.length === 0 ? (
          <Empty text="No debit notes found. Click '+ Create Debit Note' to generate one." />
        ) : (
          <Table head={["Note #", "Date", "Dealer", "Purchase Bill", "Type", "Items Returned", ">Total", ">Adjusted", ">Available", "Status", "Actions"]}>
            {filteredNotes.map((dn) => {
              const sup = supplierMap.get(dn.supplierId || dn.dealerId || "");
              const isGst = dn.invoiceType === "GST";
              const isCancelled = dn.status === "CANCELLED";
              const hasBalance = (dn.remainingAmount || 0) > 0 && !isCancelled;
              const noteTotal = dn.total || dn.amount;

              return (
                <tr key={dn.id} className={`hover:bg-slate-50/80 ${isCancelled ? "opacity-60 bg-red-50/20" : ""}`}>
                  <Td>
                    <div className="font-mono font-bold text-indigo-700">{dn.noteNumber}</div>
                    <div className="text-[10px] text-slate-500">{dn.reason}</div>
                  </Td>
                  <Td>
                    <div className="text-xs">{fmtDate(dn.date)}</div>
                  </Td>
                  <Td>
                    <div className="font-medium text-slate-900">{dn.dealerName || sup?.name || "Dealer"}</div>
                    {sup?.phone && sup.phone !== "—" && (
                      <div className="text-[10px] text-slate-500 font-mono">{sup.phone}</div>
                    )}
                  </Td>
                  <Td>
                    {dn.originalInvoiceNo ? (
                      <div>
                        <span className="font-mono font-semibold text-slate-800">{dn.originalInvoiceNo}</span>
                        {dn.originalInvoiceDate && (
                          <div className="text-[10px] text-slate-400">{fmtDate(dn.originalInvoiceDate)}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td>
                    <div className="space-y-0.5">
                      <Badge variant={isGst ? "info" : "default"}>{dn.invoiceType || "GST"}</Badge>
                      <div className="text-[10px] text-slate-500">
                        {dn.physicalReturn ? "📦 Physical" : "💳 Financial"}
                      </div>
                    </div>
                  </Td>
                  <Td>
                    <div className="text-xs font-semibold text-slate-800">
                      {dn.items?.length || 1} item(s)
                    </div>
                    {dn.items && dn.items.length > 0 && (
                      <div className="text-[10px] text-slate-500 truncate max-w-[140px]">
                        {dn.items.map((i) => i.productName).join(", ")}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="font-bold text-slate-900">{inr(noteTotal)}</div>
                    {isGst && (
                      <div className="text-[10px] text-slate-400">
                        Tax: {inr((dn.cgst || 0) + (dn.sgst || 0) + (dn.igst || 0))}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="text-xs font-medium text-emerald-700">
                      {inr(dn.appliedAmount || 0)}
                    </div>
                    {(dn.refundedAmount || 0) > 0 && (
                      <div className="text-[10px] text-amber-600">
                        Refund: {inr(dn.refundedAmount!)}
                      </div>
                    )}
                  </Td>
                  <Td align="right">
                    <div className="font-bold text-purple-700">
                      {inr(dn.remainingAmount || 0)}
                    </div>
                  </Td>
                  <Td>
                    <Badge
                      variant={
                        dn.status === "FULLY_ADJUSTED"
                          ? "success"
                          : dn.status === "PARTIALLY_ADJUSTED"
                          ? "warning"
                          : dn.status === "REFUNDED"
                          ? "info"
                          : dn.status === "CANCELLED"
                          ? "danger"
                          : "default"
                      }
                    >
                      {dn.status}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1">
                      {/* Print Invoice */}
                      <button
                        title="Print / View Debit Note Document"
                        onClick={() => setInvoiceModalNote(dn)}
                        className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-indigo-600 transition"
                      >
                        <Printer className="w-4 h-4" />
                      </button>

                      {/* WhatsApp */}
                      <button
                        title="Share on WhatsApp"
                        onClick={() => handleShareWhatsApp(dn)}
                        className="p-1 hover:bg-emerald-50 rounded text-slate-600 hover:text-emerald-600 transition"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {/* Adjust against Purchase Bill */}
                      {hasBalance && (
                        <button
                          title="Adjust Against Purchase Bill"
                          onClick={() => handleOpenApply(dn)}
                          className="p-1 hover:bg-blue-50 rounded text-slate-600 hover:text-blue-600 transition"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                      )}

                      {/* Receive Refund */}
                      {hasBalance && (
                        <button
                          title="Record Refund Received"
                          onClick={() => handleOpenRefund(dn)}
                          className="p-1 hover:bg-amber-50 rounded text-slate-600 hover:text-amber-600 transition"
                        >
                          <DollarSign className="w-4 h-4" />
                        </button>
                      )}

                      {/* Cancel */}
                      {!isCancelled && (
                        <button
                          title="Cancel Debit Note"
                          onClick={() => handleOpenCancel(dn)}
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

      {/* CREATE DEBIT NOTE MODAL */}
      <Modal
        open={createModal}
        onClose={() => !submitting && setCreateModal(false)}
        title="Create New Debit Note"
        sub="Raise debit note to supplier for returned goods, price difference, or warranties."
      >
        <form onSubmit={handleSubmitCreate} className="space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Row 1: Supplier and Original Purchase */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Select Dealer / Supplier *">
              <Select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPurchaseId("");
                  setReturnItems([]);
                }}
              >
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.phone ? `(${s.phone})` : ""}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Original Purchase Bill *">
              <Select
                value={purchaseId}
                onChange={(e) => handlePurchaseSelect(e.target.value)}
              >
                <option value="">-- Choose Purchase Bill --</option>
                {supplierPurchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.invoiceNo} — {fmtDate(p.date)} — {inr(p.total)} ({p.purchaseType || "GST"})
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Purchase details preview */}
          {selectedPurchase && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Bill No: <strong className="text-slate-900">{selectedPurchase.invoiceNo}</strong></span>
                <span className="text-slate-600">Type: <Badge variant={selectedPurchase.purchaseType === "NON_GST" ? "default" : "info"}>{selectedPurchase.purchaseType || "GST"}</Badge></span>
                <span className="text-slate-600">Bill Total: <strong className="text-slate-900">{inr(selectedPurchase.total)}</strong></span>
                <span className="text-slate-600">Paid: <strong className="text-emerald-700">{inr(selectedPurchase.paid)}</strong></span>
              </div>
            </div>
          )}

          {/* Items Table with IMEI selection and partial qty */}
          {returnItems.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700 flex justify-between items-center">
                <span>Select Items to Return / Debit</span>
                <span className="text-[11px] text-slate-500">Uncheck items not being returned</span>
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
            <Field label="Debit Reason *">
              <Select value={returnReason} onChange={(e) => setReturnReason(e.target.value)}>
                <option value="PURCHASE_RETURN">Purchase Return / Defective Unit</option>
                <option value="DEFECTIVE_GOODS">Damaged / Dead on Arrival (DOA)</option>
                <option value="PRICE_DIFFERENCE">Billed Price Difference / Overcharge</option>
                <option value="SHORTAGE_IN_TRANSIT">Shortage in Delivery / Transit</option>
                <option value="VENDOR_DISCOUNT_DISPUTE">Supplier Scheme / Rebate Dispute</option>
                <option value="OTHER">Other Reason</option>
              </Select>
            </Field>

            <Field label="Physical Inventory Return?">
              <div className="pt-2 flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="physicalReturnDebit"
                    checked={physicalReturn === true}
                    onChange={() => setPhysicalReturn(true)}
                  />
                  <span><strong>YES</strong> (Stock OUT & mark IMEI RETURNED_TO_DEALER)</span>
                </label>
                <label className="flex items-center gap-1.5 text-xs text-slate-800 cursor-pointer">
                  <input
                    type="radio"
                    name="physicalReturnDebit"
                    checked={physicalReturn === false}
                    onChange={() => setPhysicalReturn(false)}
                  />
                  <span><strong>NO</strong> (Pure Financial Debit)</span>
                </label>
              </div>
            </Field>
          </div>

          {/* Row: Initial Adjustment Type */}
          <Field label="How should this Debit Note be settled initially?">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <label
                className={`border rounded p-2.5 text-xs cursor-pointer flex flex-col ${
                  adjustmentType === "CREDIT_BALANCE" ? "border-indigo-500 bg-indigo-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="adjTypeDebit"
                    checked={adjustmentType === "CREDIT_BALANCE"}
                    onChange={() => setAdjustmentType("CREDIT_BALANCE")}
                  />
                  <span className="font-semibold text-slate-900">Dealer Credit Balance</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Keep in dealer's account to deduct from future inward bills.
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
                    name="adjTypeDebit"
                    checked={adjustmentType === "REFUND"}
                    onChange={() => setAdjustmentType("REFUND")}
                  />
                  <span className="font-semibold text-slate-900">Immediate Dealer Refund</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Supplier returned money directly via bank / cash.
                </span>
              </label>

              <label
                className={`border rounded p-2.5 text-xs cursor-pointer flex flex-col ${
                  adjustmentType === "PURCHASE_ADJUSTMENT" ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="adjTypeDebit"
                    checked={adjustmentType === "PURCHASE_ADJUSTMENT"}
                    onChange={() => setAdjustmentType("PURCHASE_ADJUSTMENT")}
                  />
                  <span className="font-semibold text-slate-900">Apply to Inward Bill</span>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 pl-5">
                  Immediately reduce outstanding payable on another bill.
                </span>
              </label>
            </div>
          </Field>

          {/* Conditional: Refund Options */}
          {adjustmentType === "REFUND" && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs space-y-2">
              <div className="font-semibold text-amber-900">Refund Inflow Details</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">Payment Method</label>
                  <Select value={refundMethod} onChange={(e) => setRefundMethod(e.target.value)}>
                    <option value="Bank Transfer">Bank Transfer / NEFT</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                  </Select>
                </div>
                <div>
                  <label className="text-[11px] text-slate-600 block mb-1">Deposit To Account</label>
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

          {/* Conditional: Purchase Adjustment Options */}
          {adjustmentType === "PURCHASE_ADJUSTMENT" && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs space-y-2">
              <div className="font-semibold text-emerald-900">Select Purchase Bill to Reduce Payable</div>
              <Select value={targetPurchaseId} onChange={(e) => setTargetPurchaseId(e.target.value)}>
                <option value="">-- Choose Unpaid Bill --</option>
                {supplierPurchases
                  .filter((p) => p.id !== purchaseId && p.paid < p.total)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.invoiceNo} — Due: {inr(p.total - p.paid)} (Total: {inr(p.total)})
                    </option>
                  ))}
              </Select>
            </div>
          )}

          <Field label="Remarks / Internal Notes">
            <Input
              placeholder="e.g. Courier tracking # / dealer approval code"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={() => setCreateModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || returnItems.filter((i) => i.selected).length === 0}>
              {submitting ? "Processing..." : "Generate Debit Note"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* APPLY TO PURCHASE ACTION MODAL */}
      <Modal
        open={applyModal}
        onClose={() => setApplyModal(false)}
        title={`Apply Debit Note ${selectedNote?.noteNumber || ""}`}
        sub={`Available Balance: ${inr(selectedNote?.remainingAmount || 0)}`}
      >
        <form onSubmit={handleSubmitApply} className="space-y-4">
          <Field label="Target Unpaid Purchase Bill *">
            <Select value={allocPurchaseId} onChange={(e) => setAllocPurchaseId(e.target.value)}>
              <option value="">-- Choose Unpaid Purchase Bill --</option>
              {unpaidDealerPurchases.map((p) => {
                const due = p.total - p.paid;
                return (
                  <option key={p.id} value={p.id}>
                    {p.invoiceNo} — Date: {fmtDate(p.date)} — Pending Due: {inr(due)}
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
            <Button type="submit" disabled={!allocPurchaseId || !allocAmount}>
              Confirm Allocation
            </Button>
          </div>
        </form>
      </Modal>

      {/* RECORD REFUND ACTION MODAL */}
      <Modal
        open={refundModal}
        onClose={() => setRefundModal(false)}
        title={`Record Refund Received for ${selectedNote?.noteNumber || ""}`}
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
                <option value="Bank Transfer">Bank Transfer / NEFT</option>
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Cheque">Cheque</option>
              </Select>
            </Field>
          </div>

          <Field label="Deposit Into Account">
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
                placeholder="e.g. UTR9281741"
                value={actionRefundRef}
                onChange={(e) => setActionRefundRef(e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <Input
                placeholder="e.g. Bank credit received from dealer"
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
              Record Inflow
            </Button>
          </div>
        </form>
      </Modal>

      {/* CANCEL DEBIT NOTE MODAL */}
      <Modal
        open={cancelModal}
        onClose={() => setCancelModal(false)}
        title={`Cancel Debit Note ${selectedNote?.noteNumber || ""}`}
        sub="Warning: Cancellation reverses dealer ledger debit and stock movements."
      >
        <form onSubmit={handleSubmitCancel} className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded text-xs text-red-800 space-y-1">
            <div className="font-bold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <span>Irreversible Action</span>
            </div>
            <div>
              Cancelling this Debit Note will reinstate the payable due to the dealer.
              {selectedNote?.physicalReturn && (
                <div>Any physical stock returned will be re-added to inventory.</div>
              )}
            </div>
          </div>

          <Field label="Reason for Cancellation *">
            <Input
              required
              placeholder="e.g. Raised in error / dealer rejected warranty claim"
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
          documentProps={debitNoteToInvoiceProps(invoiceModalNote, db)}
        />
      )}
    </div>
  );
}
