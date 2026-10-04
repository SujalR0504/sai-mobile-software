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
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import {
  PAYMENT_MODES,
  type LineItem,
  type PaymentEntry,
  type PaymentMode,
  type Purchase,
  type DebitNote,
  type Supplier,
} from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { purchaseToInvoiceProps, debitNoteToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { FastPurchaseEntry } from "@/components/purchase/FastPurchaseEntry";

export const Route = createFileRoute("/purchase")({
  head: () => ({
    meta: [{ title: "NEW PURCHASE - DEALER BILL — Mobile Store ERP" }],
  }),
  component: PurchasePage,
});

export function PurchasePage() {
  const { db, recordPurchase, addSupplier, refreshFromBackend } = useStore();
  const [activeTab, setActiveTab] = useState<"BILLS" | "NEW_PURCHASE" | "DEBIT_NOTES">("NEW_PURCHASE");
  const [query, setQuery] = useState("");
  const [selectedBill, setSelectedBill] = useState<Purchase | null>(null);
  const [selectedPurchaseInvoice, setSelectedPurchaseInvoice] = useState<Purchase | null>(null);
  const [selectedDebitNoteInvoice, setSelectedDebitNoteInvoice] = useState<DebitNote | null>(null);


  const [billPayments, setBillPayments] = useState<PaymentEntry[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(todayISO());
  const [payMode, setPayMode] = useState<PaymentMode>("Bank");
  const [payReferenceNo, setPayReferenceNo] = useState<string>("");
  const [payChequeNo, setPayChequeNo] = useState<string>("");
  const [payBankName, setPayBankName] = useState<string>("");
  const [payRemarks, setPayRemarks] = useState<string>("");
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string>("");

  const loadPaymentsForBill = async (billId: string) => {
    setLoadingPayments(true);
    try {
      const res = await fetch(`/api/purchases/${billId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setBillPayments(data);
      }
    } catch (e) {
      console.error("Failed to load payments", e);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (selectedBill) {
      loadPaymentsForBill(selectedBill.id);
    } else {
      setBillPayments([]);
    }
  }, [selectedBill]);

  const openAddPaymentModal = (bill: Purchase) => {
    const outstanding = bill.dueAmount !== undefined ? bill.dueAmount : Math.max(0, bill.total - bill.paid);
    setPaymentBill(bill);
    setPayAmount(outstanding);
    setPayDate(todayISO());
    setPayMode("Bank");
    setPayReferenceNo("");
    setPayChequeNo("");
    setPayBankName("");
    setPayRemarks("");
    setPaymentError("");
    setPayModalOpen(true);
  };

  const handleSubmitPurchasePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentBill) return;
    const outstanding = paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid);
    if (payAmount <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }
    if (payAmount > outstanding) {
      setPaymentError(`Payment amount cannot exceed outstanding balance of ₹${outstanding.toLocaleString('en-IN')}.`);
      return;
    }

    setIsRecordingPayment(true);
    setPaymentError("");
    try {
      const res = await fetch(`/api/purchases/${paymentBill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(payAmount),
          date: payDate,
          mode: payMode,
          referenceNo: payReferenceNo.trim() || undefined,
          chequeNo: payChequeNo.trim() || undefined,
          bankName: payBankName.trim() || undefined,
          remarks: payRemarks.trim() || undefined,
          user_name: "Admin",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record payment");
      }

      const data = await res.json();
      await refreshFromBackend();
      if (selectedBill && selectedBill.id === paymentBill.id) {
        setSelectedBill(data.purchase);
        loadPaymentsForBill(paymentBill.id);
      }
      setPayModalOpen(false);
    } catch (err: any) {
      setPaymentError(err.message || "Error recording payment.");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleDeletePurchasePayment = async (paymentId: string) => {
    if (!selectedBill) return;
    if (!confirm("Are you sure you want to delete this payment record? This will reverse the ledger entry.")) return;

    try {
      const res = await fetch(`/api/purchases/${selectedBill.id}/payments/${paymentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        await refreshFromBackend();
        setSelectedBill(data.purchase);
        loadPaymentsForBill(selectedBill.id);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete payment");
      }
    } catch {
      alert("Network error deleting payment");
    }
  };

  // Debit Note Modal State
  const [debitNoteModalOpen, setDebitNoteModalOpen] = useState(false);
  const [debitNoteForm, setDebitNoteForm] = useState({
    dealerId: db.suppliers[0]?.id || "",
    noteNumber: "",
    date: todayISO(),
    reason: "TDS 194R Payable @ 10%",
    amount: 3664,
    originalInvoiceNo: "2627TTRM/695",
    tdsApplicable: true,
    tdsSection: "TDS 194R",
    tdsRate: 10,
    remarks: "TDS 194R on Dealer Sales Promotion / Incentives",
  });

  const dealerMap = useMemo(() => {
    return new Map(db.suppliers.map((s) => [s.id, s]));
  }, [db.suppliers]);

  // Submit Debit Note
  const handleSubmitDebitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/debit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debitNoteForm),
      });
      if (res.ok) {
        setDebitNoteModalOpen(false);
        await refreshFromBackend();
      }
    } catch {
      alert("Failed to create debit note");
    }
  };

  const filteredPurchases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.purchases.filter((p) => {
      const dealer = dealerMap.get(p.supplierId || p.dealerId || "");
      if (!q) return true;
      return (
        p.invoiceNo.toLowerCase().includes(q) ||
        (dealer && dealer.name.toLowerCase().includes(q)) ||
        (dealer && dealer.company && dealer.company.toLowerCase().includes(q))
      );
    });
  }, [db.purchases, query, dealerMap]);

  const totalOutstandingToDealers = useMemo(() => {
    return db.purchases.reduce((sum, p) => sum + (p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.total - p.paid)), 0);
  }, [db.purchases]);

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHead
        title="NEW PURCHASE - DEALER BILL"
        sub="Inward mobile phones, tablets and accessories with GST/Non-GST calculation, OCR auto-extraction, serial IMEI tracking, and Dealer ledger updates."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={activeTab === "NEW_PURCHASE" ? "primary" : "outline"}
              onClick={() => setActiveTab("NEW_PURCHASE")}
            >
              + New Purchase Bill
            </Button>
            <Button
              variant={activeTab === "BILLS" ? "primary" : "outline"}
              onClick={() => setActiveTab("BILLS")}
            >
              Purchase Bills ({db.purchases.length})
            </Button>
            <Button
              variant={activeTab === "DEBIT_NOTES" ? "primary" : "outline"}
              onClick={() => setActiveTab("DEBIT_NOTES")}
            >
              Debit Notes & TDS ({db.debitNotes?.length || 0})
            </Button>
          </div>
        }
      />

      {/* KPI Stats (shown on Bills tab) */}
      {activeTab === "BILLS" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Total Inward Bills" value={String(db.purchases.length)} tone="info" />
          <Stat
            label="Total Purchases"
            value={inr(db.purchases.reduce((sum, p) => sum + p.total, 0))}
            tone="neutral"
          />
          <Stat
            label="Paid to Dealers"
            value={inr(db.purchases.reduce((sum, p) => sum + p.paid, 0))}
            tone="success"
          />
          <Stat
            label="Outstanding Payable"
            value={inr(totalOutstandingToDealers)}
            tone={totalOutstandingToDealers > 0 ? "danger" : "success"}
          />
        </div>
      )}

      {/* TAB 1: NEW PURCHASE - FAST 3-STEP DEALER BILL */}
      {activeTab === "NEW_PURCHASE" && (
        <FastPurchaseEntry
          onSavedPurchase={(created) => {
            setSelectedPurchaseInvoice(created);
            refreshFromBackend();
          }}
          onViewInvoice={(p) => setSelectedPurchaseInvoice(p)}
          onOpenAddPayment={(p) => openAddPaymentModal(p)}
        />
      )}


      {/* TAB 2: PURCHASE BILLS HISTORY */}
      {activeTab === "BILLS" && (
        <Card>
          <CardHead
            title="Dealer Purchase Bills"
            sub={`${filteredPurchases.length} total dealer bills recorded.`}
            right={
              <Input
                placeholder="Search invoice or dealer..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56 sm:w-72"
              />
            }
          />

          {filteredPurchases.length === 0 ? (
            <Empty text="No dealer purchase bills found." />
          ) : (
            <Table
              head={[
                "Invoice #",
                "Date",
                "Mode",
                "Dealer",
                "Status",
                "Place of Supply",
                "Items",
                ">Taxable",
                ">Total",
                ">Paid",
                ">Due",
                "Actions",
              ]}
            >
              {filteredPurchases.map((p) => {
                const dealer = dealerMap.get(p.supplierId || p.dealerId || "");
                const due = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.total - p.paid);

                return (
                  <Row key={p.id}>
                    <Td mono className="font-semibold text-primary">
                      {p.invoiceNo}
                    </Td>
                    <Td>{p.date}</Td>
                    <Td>
                      <Badge tone={p.purchaseType === "NON_GST" ? "neutral" : "info"}>
                        {p.purchaseType || "GST"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="font-semibold">{dealer?.name || "Unknown"}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">{dealer?.gstin}</div>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          due === 0
                            ? "success"
                            : p.paid > 0
                            ? "warning"
                            : "danger"
                        }
                      >
                        {due === 0 ? "PAID" : p.paid > 0 ? "PARTIAL" : "UNPAID"}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="text-[11px] font-medium">
                        {p.placeOfSupply || "MP"} (Code: {p.stateCode || "23"})
                      </span>
                    </Td>
                    <Td>
                      <div className="text-[11px] max-w-xs truncate">
                        {p.items.map((i) => `${i.name} (×${i.qty})`).join(", ")}
                      </div>
                    </Td>
                    <Td right mono className="text-muted-foreground">
                      {inr(p.subtotal || p.taxableValue || 0)}
                    </Td>
                    <Td right mono className="font-bold text-foreground">
                      {inr(p.total)}
                    </Td>
                    <Td right mono className="text-emerald-600 font-medium">
                      {inr(p.paid)}
                    </Td>
                    <Td
                      right
                      mono
                      className={due > 0 ? "text-destructive font-bold" : "text-muted-foreground"}
                    >
                      {inr(due)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {due > 0 && (
                          <Button
                            size="sm"
                            variant="soft"
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                            onClick={() => openAddPaymentModal(p)}
                          >
                            + Pay
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedBill(p)}
                        >
                          View Bill
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium"
                          onClick={() => setSelectedPurchaseInvoice(p)}
                          title="Print / View Official A4 Invoice"
                        >
                          🖨️ Invoice
                        </Button>
                      </div>
                    </Td>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: DEBIT NOTES & TDS */}
      {activeTab === "DEBIT_NOTES" && (
        <Card>
          <CardHead
            title="Debit Notes & TDS 194R"
            sub="Issued debit notes to dealers (e.g. TDS 194R Payable @ 10%, rate revisions, or claims). Automatically debits Dealer Ledger."
            right={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDebitNoteModalOpen(true)}
              >
                + Issue Debit Note
              </Button>
            }
          />

          {!db.debitNotes || db.debitNotes.length === 0 ? (
            <Empty text="No debit notes recorded yet. Click '+ Issue Debit Note' to record TDS 194R or price differences." />
          ) : (
            <Table head={["Debit Note #", "Date", "Dealer", "Reason / Section", "Orig. Invoice", ">Amount (₹)", "Status", "Actions"]}>
              {db.debitNotes.map((dn) => {
                const dealer = dealerMap.get(dn.dealerId || dn.supplierId || "");
                return (
                  <Row key={dn.id}>
                    <Td mono className="font-bold text-primary">
                      {dn.noteNumber}
                    </Td>
                    <Td>{dn.date}</Td>
                    <Td>
                      <div className="font-semibold">{dealer?.name || "Dealer"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{dealer?.gstin}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-[12px]">{dn.reason}</div>
                      {dn.section && (
                        <div className="text-[10.5px] text-indigo-600">{dn.section}</div>
                      )}
                    </Td>
                    <Td mono className="text-[11px]">
                      {dn.originalInvoiceNo || "—"}
                    </Td>
                    <Td right mono className="font-bold text-rose-600">
                      {inr(dn.amount)}
                    </Td>
                    <Td>
                      <Badge tone="success">{dn.status}</Badge>
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium"
                        onClick={() => setSelectedDebitNoteInvoice(dn)}
                        title="Print / View Official Debit Note"
                      >
                        🖨️ View Note
                      </Button>
                    </Td>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      )}



      {/* VIEW BILL DETAILS MODAL */}
      <Modal
        open={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        title={`Dealer Bill — ${selectedBill?.invoiceNo}`}
        wide
      >
        {selectedBill && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Dealer</span>
                <span className="font-bold text-foreground">
                  {dealerMap.get(selectedBill.supplierId || selectedBill.dealerId || "")?.name || "Dealer"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Bill Date</span>
                <span className="font-medium text-foreground">{selectedBill.date}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Bill Mode & Status</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge tone={selectedBill.purchaseType === "NON_GST" ? "neutral" : "info"}>
                    {selectedBill.purchaseType || "GST"}
                  </Badge>
                  <Badge
                    tone={
                      (selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) === 0
                        ? "success"
                        : selectedBill.paid > 0
                        ? "warning"
                        : "danger"
                    }
                  >
                    {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) === 0
                      ? "PAID"
                      : selectedBill.paid > 0
                      ? "PARTIALLY PAID"
                      : "UNPAID"}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Place of Supply</span>
                <span className="font-medium text-foreground">
                  {selectedBill.placeOfSupply || "MP"} (Code: {selectedBill.stateCode || "23"})
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-border/80 overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b bg-muted/40 font-semibold text-left">
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Taxable</th>
                    <th className="p-2 text-right">CGST</th>
                    <th className="p-2 text-right">SGST</th>
                    <th className="p-2 text-right">IGST</th>
                    <th className="p-2 text-right font-bold">Total</th>
                    <th className="p-2">IMEIs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedBill.items.map((i, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{i.name}</td>
                      <td className="p-2 text-center">{i.qty}</td>
                      <td className="p-2 text-right font-mono">{inr(i.taxableAmount || i.costPrice * i.qty)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.cgstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.sgstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.igstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono font-bold">{inr(i.totalAmount || i.price * i.qty)}</td>
                      <td className="p-2 font-mono text-[10.5px] text-muted-foreground">
                        {i.imeis?.length ? i.imeis.join(", ") : i.imei || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bill Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/60 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Grand Total</span>
                <span className="font-bold text-[14px] font-mono text-primary">{inr(selectedBill.total)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Paid</span>
                <span className="font-bold text-[14px] font-mono text-emerald-600">{inr(selectedBill.paid)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Balance Due</span>
                <span className="font-bold text-[14px] font-mono text-destructive">
                  {inr(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Payment Mode</span>
                <span className="font-semibold text-foreground">{selectedBill.mode}</span>
              </div>
            </div>

            {/* Payment History Section */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-bold text-foreground">
                  💳 Payment History ({billPayments.length})
                </span>
                {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) > 0 && (
                  <Button
                    size="sm"
                    variant="soft"
                    className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                    onClick={() => openAddPaymentModal(selectedBill)}
                  >
                    + Add Payment
                  </Button>
                )}
              </div>

              {loadingPayments ? (
                <div className="text-[12px] text-muted-foreground py-2">Loading payment records...</div>
              ) : billPayments.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic py-1">
                  No additional payment transactions recorded for this bill.
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Mode</th>
                        <th className="p-2">Reference / UTR</th>
                        <th className="p-2">Bank / Cheque</th>
                        <th className="p-2 text-right">Amount (₹)</th>
                        <th className="p-2">User</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {billPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">
                            <Badge tone="neutral">{p.mode}</Badge>
                          </td>
                          <td className="p-2 font-mono text-muted-foreground">{p.referenceNo || p.note || "—"}</td>
                          <td className="p-2">
                            {p.chequeNo ? `Cheque #${p.chequeNo}` : ""}
                            {p.bankName ? ` (${p.bankName})` : ""}
                            {!p.chequeNo && !p.bankName ? "—" : ""}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-600">
                            {inr(p.amount)}
                          </td>
                          <td className="p-2 text-muted-foreground">{p.userName || "Admin"}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeletePurchasePayment(p.id)}
                              className="text-destructive font-bold hover:opacity-75 text-xs px-1"
                              title="Delete payment"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5"
                onClick={() => {
                  const bill = selectedBill;
                  setSelectedBill(null);
                  setSelectedPurchaseInvoice(bill);
                }}
              >
                🖨️ Print Official Invoice (A4)
              </Button>
              <div className="flex items-center gap-2">
                {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) > 0 && (
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => openAddPaymentModal(selectedBill)}
                  >
                    + Receive / Add Payment
                  </Button>
                )}
                <Button onClick={() => setSelectedBill(null)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>



      {/* ISSUE DEBIT NOTE MODAL */}
      <Modal
        open={debitNoteModalOpen}
        onClose={() => setDebitNoteModalOpen(false)}
        title="Issue Debit Note (TDS 194R / Revisions)"
      >
        <form onSubmit={handleSubmitDebitNote} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Select Dealer *">
              <Select
                value={debitNoteForm.dealerId}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, dealerId: e.target.value })}
                required
              >
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city || "Harda"})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Debit Note #">
              <Input
                placeholder="e.g. 2627DNTDS/65"
                value={debitNoteForm.noteNumber}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, noteNumber: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date *">
              <Input
                type="date"
                value={debitNoteForm.date}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Debit Amount (₹) *">
              <Input
                type="number"
                step="0.01"
                value={debitNoteForm.amount}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, amount: Number(e.target.value) })}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Reason / Section *">
              <Input
                value={debitNoteForm.reason}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, reason: e.target.value })}
                required
              />
            </Field>
            <Field label="Original Invoice Ref">
              <Input
                placeholder="2627TTRM/695"
                value={debitNoteForm.originalInvoiceNo}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, originalInvoiceNo: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Remarks / Details">
            <Input
              value={debitNoteForm.remarks}
              onChange={(e) => setDebitNoteForm({ ...debitNoteForm, remarks: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDebitNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Confirm & Issue Debit Note</Button>
          </div>
        </form>
      </Modal>

      {/* RECORD PURCHASE PAYMENT MODAL */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Receive / Add Payment — ${paymentBill?.invoiceNo}`}
      >
        {paymentBill && (
          <form onSubmit={handleSubmitPurchasePayment} className="space-y-4">
            {paymentError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-[12px] text-destructive font-medium">
                ⚠️ {paymentError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Dealer</span>
                <span className="font-bold text-foreground">
                  {dealerMap.get(paymentBill.supplierId || paymentBill.dealerId || "")?.name || "Dealer"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Bill Invoice #</span>
                <span className="font-mono font-bold text-primary">{paymentBill.invoiceNo}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Total Bill Amount</span>
                <span className="font-mono font-medium">{inr(paymentBill.total)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Previously Paid</span>
                <span className="font-mono font-medium text-emerald-600">{inr(paymentBill.paid)}</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-border/40 flex items-center justify-between">
                <span className="font-bold text-[12.5px] text-foreground">Outstanding Payable:</span>
                <span className="font-mono font-bold text-[14px] text-destructive">
                  {inr(paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid))}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Payment Amount (₹) *">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  required
                  className="font-bold font-mono text-[14px]"
                />
              </Field>

              <Field label="Payment Date *">
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Payment Mode *">
                <Select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                  required
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Reference No / UTR / Txn ID">
                <Input
                  placeholder="e.g. UTR / IMPS / Bank Ref"
                  value={payReferenceNo}
                  onChange={(e) => setPayReferenceNo(e.target.value)}
                />
              </Field>
            </div>

            {(payMode === "Cheque" || payMode === "Bank") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Cheque Number">
                  <Input
                    placeholder="e.g. 104523"
                    value={payChequeNo}
                    onChange={(e) => setPayChequeNo(e.target.value)}
                  />
                </Field>

                <Field label="Bank Name">
                  <Input
                    placeholder="e.g. HDFC / SBI Bank"
                    value={payBankName}
                    onChange={(e) => setPayBankName(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <Field label="Remarks / Notes">
              <Input
                placeholder="e.g. Part payment via RTGS"
                value={payRemarks}
                onChange={(e) => setPayRemarks(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isRecordingPayment}>
                {isRecordingPayment ? "Recording Payment..." : "Record & Post Payment"}
              </Button>
            </div>
          </form>
        )}
      </Modal>


      {/* UNIVERSAL INVOICE MODALS FOR REAL PURCHASE & DEBIT NOTE DATA */}
      {selectedPurchaseInvoice && (
        <InvoiceModal
          open={Boolean(selectedPurchaseInvoice)}
          onClose={() => setSelectedPurchaseInvoice(null)}
          {...purchaseToInvoiceProps(selectedPurchaseInvoice, db)}
        />
      )}

      {selectedDebitNoteInvoice && (
        <InvoiceModal
          open={Boolean(selectedDebitNoteInvoice)}
          onClose={() => setSelectedDebitNoteInvoice(null)}
          {...debitNoteToInvoiceProps(selectedDebitNoteInvoice, db)}
        />
      )}
    </div>
  );
}
