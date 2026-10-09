import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
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
import { customerDue, useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import { PAYMENT_MODES, type Customer, type PaymentMode, type Sale } from "@/lib/types";
import {
  generateDueWhatsAppMessage,
  generateConsolidatedDueWhatsAppMessage,
  openWhatsAppChat,
} from "@/lib/whatsapp";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { saleToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { Eye, FileText, Trash2, AlertTriangle } from "lucide-react";
import { permissionsApi } from "@/services/api/permissionsApi";
import { CancelSaleBillModal } from "@/components/sales/CancelSaleBillModal";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [{ title: "Customers CRM & Dues — Mobile Store ERP" }],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { db, addCustomer, updateCustomer, deleteCustomer, recordCustomerPayment } = useStore();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  // Delete Customer State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [forceDeleteConfirm, setForceDeleteConfirm] = useState(false);
  const [isDeletingCustomer, setIsDeletingCustomer] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const openDeleteModal = (c: Customer) => {
    setCustomerToDelete(c);
    setForceDeleteConfirm(false);
    setDeleteError("");
    setDeleteModalOpen(true);
  };

  const handleConfirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setIsDeletingCustomer(true);
    setDeleteError("");
    try {
      await deleteCustomer(customerToDelete.id, forceDeleteConfirm);
      setDeleteModalOpen(false);
      setCustomerToDelete(null);
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete customer");
    } finally {
      setIsDeletingCustomer(false);
    }
  };

  // Customer Bills Modal State
  const [billsCustomer, setBillsCustomer] = useState<Customer | null>(null);
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [selectedSaleForInvoice, setSelectedSaleForInvoice] = useState<Sale | null>(null);

  const openCustomerBills = (c: Customer) => {
    setBillsCustomer(c);
    setBillsModalOpen(true);
  };

  const customerSales = useMemo(() => {
    if (!billsCustomer) return [];
    const custPhone = billsCustomer.phone || billsCustomer.mobile;
    return (db.sales || [])
      .filter((s) => {
        if (s.quotation || s.status === "CANCELLED" || s.status === "VOID") return false;
        if (s.customerId === billsCustomer.id) return true;
        if (custPhone && custPhone !== "9999999999") {
          const matchedCust = (db.customers || []).find((c) => c.id === s.customerId);
          if (matchedCust && (matchedCust.phone === custPhone || matchedCust.mobile === custPhone)) {
            return true;
          }
        }
        return false;
      })
      .slice()
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [db.sales, billsCustomer, db.customers]);

  const [saleToCancel, setSaleToCancel] = useState<Sale | null>(null);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // User & permissions check
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
  const [canDeleteBill, setCanDeleteBill] = useState(
    role === "ADMIN" || role === "OWNER"
  );
  const [canDeleteCustomer, setCanDeleteCustomer] = useState(
    role === "ADMIN" || role === "OWNER"
  );

  useEffect(() => {
    if (role === "ADMIN" || role === "OWNER") {
      setCanDeleteBill(true);
      setCanDeleteCustomer(true);
      return;
    }
    if (currentUser?.employeeId || currentUser?.id) {
      const empId = currentUser.employeeId || currentUser.id;
      permissionsApi.checkPermission(empId, "Sales", "DELETE")
        .then((res) => {
          setCanDeleteBill(res.allowed);
        })
        .catch(() => {
          setCanDeleteBill(false);
        });

      permissionsApi.checkPermission(empId, "Customers", "DELETE")
        .then((res) => {
          setCanDeleteCustomer(res.allowed);
        })
        .catch(() => {
          setCanDeleteCustomer(false);
        });
    } else {
      setCanDeleteBill(false);
      setCanDeleteCustomer(false);
    }
  }, [currentUser, role]);

  const [form, setForm] = useState({ name: "", phone: "", address: "" });
  const [payAmount, setPayAmount] = useState(0);
  const [payMode, setPayMode] = useState<PaymentMode>("UPI");
  const [payAccountId, setPayAccountId] = useState<string>("");
  const [payRef, setPayRef] = useState("");
  const [payNote, setPayNote] = useState("");
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);

  const paymentAccounts = useMemo(() => db.paymentAccounts || [], [db.paymentAccounts]);
  const cashAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "CASH" && a.status === "ACTIVE"), [paymentAccounts]);
  const upiAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "UPI" && a.status === "ACTIVE"), [paymentAccounts]);
  const bankAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "BANK" && a.status === "ACTIVE"), [paymentAccounts]);
  const cardAccounts = useMemo(() => paymentAccounts.filter((a) => (a.accountType === "CARD" || a.accountType === "BANK") && a.status === "ACTIVE"), [paymentAccounts]);

  const getDefaultAccountForMode = (m: string) => {
    if (m === "Cash") return cashAccounts.find((a) => a.isDefault) || cashAccounts[0];
    if (m === "UPI") return upiAccounts.find((a) => a.isDefault) || upiAccounts[0];
    if (m === "Bank") return bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
    if (m === "Card") return cardAccounts.find((a) => a.isDefault) || cardAccounts[0];
    return undefined;
  };

  const handleWhatsAppDue = (c: Customer, due: number) => {
    const custPhone = c.phone || c.mobile;
    const customerSales = (db.sales || []).filter((s) => {
      if (s.quotation) return false;
      if (s.customerId === c.id) return true;
      if (custPhone && custPhone !== "9999999999") {
        const matchedCust = (db.customers || []).find((item) => item.id === s.customerId);
        if (matchedCust && (matchedCust.phone === custPhone || matchedCust.mobile === custPhone)) {
          return true;
        }
      }
      return false;
    });
    const unpaidSales = customerSales.filter(
      (s) => (s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid)) > 0
    );

    let message = "";
    if (unpaidSales.length <= 1) {
      const inv = unpaidSales[0] || customerSales[customerSales.length - 1];
      message = generateDueWhatsAppMessage({
        customerName: c.name,
        customerPhone: c.phone,
        invoiceNo: inv ? inv.invoiceNo : "OUTSTANDING",
        invoiceDate: inv ? inv.date : todayISO(),
        totalAmount: inv ? inv.total : due,
        paidAmount: inv ? inv.paid : 0,
        dueAmount: due,
      });
    } else {
      message = generateConsolidatedDueWhatsAppMessage({
        customerName: c.name,
        customerPhone: c.phone,
        totalDue: due,
        invoices: unpaidSales.map((s) => ({
          invoiceNo: s.invoiceNo,
          date: s.date,
          total: s.total,
          due: s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid),
        })),
      });
    }

    openWhatsAppChat(c.phone, message, {
      party: "customer",
      partyId: c.id,
      reason: "due_reminder",
    });
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.customers.filter(
      (c) => c.name.toLowerCase().includes(q) || c.phone.includes(q),
    );
  }, [db.customers, query]);

  const totalDues = useMemo(() => {
    return db.customers.reduce((sum, c) => sum + customerDue(db, c.id), 0);
  }, [db]);

  const openAddModal = () => {
    setEditingCustomer(null);
    setForm({ name: "", phone: "", address: "" });
    setModalOpen(true);
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setForm({ name: c.name, phone: c.phone, address: c.address || "" });
    setModalOpen(true);
  };

  const openPayModal = (c: Customer) => {
    setTargetCustomer(c);
    const due = customerDue(db, c.id);
    setPayAmount(due);
    setPayMode("UPI");
    const defUpi = upiAccounts.find((a) => a.isDefault) || upiAccounts[0];
    setPayAccountId(defUpi?.id || "");
    setPayRef("");
    setPayNote(`Settlement from ${c.name}`);
    setPayModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, form);
    } else {
      addCustomer(form);
    }
    setModalOpen(false);
  };

  const handleCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetCustomer || payAmount <= 0) return;

    try {
      setIsSubmittingPay(true);
      await recordCustomerPayment({
        customerId: targetCustomer.id,
        amount: payAmount,
        paymentMethod: payMode,
        paymentAccountId: payAccountId || undefined,
        referenceNo: payRef || undefined,
        notes: payNote || undefined,
      });
      setPayModalOpen(false);
    } catch (err: any) {
      alert(err.message || "Failed to record payment");
    } finally {
      setIsSubmittingPay(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Customers CRM & Dues"
        sub="Manage customer contact directory, bill history, and outstanding credit balances."
        actions={<Button onClick={openAddModal}>+ Add Customer</Button>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Customers" value={String(db.customers.length)} />
        <Stat
          label="Total Credit Outstanding"
          value={inr(totalDues)}
          tone={totalDues > 0 ? "danger" : "success"}
        />
      </section>

      <Card>
        <CardHead
          title="Customer Directory"
          sub={`${filtered.length} customers listed`}
          right={
            <Input
              placeholder="Search by name or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-48 sm:w-64"
            />
          }
        />

        {filtered.length === 0 ? (
          <Empty text="No customers found." />
        ) : (
          <Table head={["Customer Name", "Phone Number", "Address", ">Total Invoices", ">Current Due", "Actions"]}>
            {filtered.map((c) => {
              const due = customerDue(db, c.id);
              const custPhone = c.phone || c.mobile;
              const salesCount = (db.sales || []).filter((s) => {
                if (s.quotation) return false;
                if (s.customerId === c.id) return true;
                if (custPhone && custPhone !== "9999999999") {
                  const matchedCust = (db.customers || []).find((item) => item.id === s.customerId);
                  if (matchedCust && (matchedCust.phone === custPhone || matchedCust.mobile === custPhone)) {
                    return true;
                  }
                }
                return false;
              }).length;
              return (
                <Row key={c.id}>
                  <Td>
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-[10.5px] text-muted-foreground">Joined: {c.createdAt}</div>
                  </Td>
                  <Td mono className="font-medium">
                    {c.phone}
                  </Td>
                  <Td>{c.address || "—"}</Td>
                  <Td right mono>
                    <button
                      type="button"
                      onClick={() => openCustomerBills(c)}
                      className="inline-flex items-center gap-1 font-mono font-bold text-primary hover:underline hover:bg-primary/10 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                      title="Click to view all bills of this customer"
                    >
                      <FileText className="size-3.5" />
                      <span>{salesCount} bills</span>
                    </button>
                  </Td>
                  <Td right mono className={due > 0 ? "font-bold text-destructive" : "text-muted-foreground"}>
                    {inr(due)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 font-bold text-primary bg-primary/5 hover:bg-primary/15 border-primary/25"
                        onClick={() => openCustomerBills(c)}
                        title="View Customer Bills & Invoices"
                      >
                        <FileText className="size-3.5" /> Bills
                      </Button>
                      {due > 0 && (
                        <>
                          <Button size="sm" variant="success" onClick={() => openPayModal(c)}>
                            Collect Due
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 gap-1 font-medium"
                            onClick={() => handleWhatsAppDue(c, due)}
                            title="Send WhatsApp Payment Due Reminder"
                          >
                            💬 WhatsApp Due
                          </Button>
                        </>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLedgerCustomer(c);
                          setLedgerModalOpen(true);
                        }}
                      >
                        Ledger
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEditModal(c)}>
                        Edit
                      </Button>
                      {canDeleteCustomer && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive gap-1 px-2 font-medium"
                          onClick={() => openDeleteModal(c)}
                          title="Delete Customer"
                        >
                          <Trash2 className="size-3" />
                          Delete
                        </Button>
                      )}
                    </div>
                  </Td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Add / Edit Customer Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingCustomer ? "Edit Customer" : "New Customer"}
      >
        <form onSubmit={handleSaveCustomer} className="space-y-3">
          <Field label="Full Name *">
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Subhashish Sharma"
            />
          </Field>
          <Field label="Phone Number *">
            <Input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="e.g. 9876543210"
            />
          </Field>
          <Field label="Address / City">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. Sector 18, Noida"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingCustomer ? "Update" : "Save Customer"}</Button>
          </div>
        </form>
      </Modal>

      {/* Collect Payment Modal */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Collect Payment — ${targetCustomer?.name}`}
      >
        <form onSubmit={handleCollectPayment} className="space-y-3">
          <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-[13px] flex items-center justify-between">
            <span>Outstanding Due:</span>
            <span className="font-bold text-destructive text-sm num">{inr(customerDue(db, targetCustomer?.id || ""))}</span>
          </div>

          <Field label="Amount to Collect (₹) *">
            <Input
              type="number"
              min="1"
              required
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
            />
          </Field>

          <Field label="Payment Method *">
            <Select
              value={payMode}
              onChange={(e) => {
                const m = e.target.value as PaymentMode;
                setPayMode(m);
                const def = getDefaultAccountForMode(m);
                if (def) setPayAccountId(def.id);
              }}
            >
              <option value="UPI">UPI</option>
              <option value="Cash">Cash</option>
              <option value="Bank">Bank Transfer</option>
              <option value="Card">Debit / Credit Card</option>
            </Select>
          </Field>

          {/* Account Dropdown */}
          <Field label={`Deposit into ${payMode} Account *`}>
            <Select
              value={payAccountId}
              onChange={(e) => setPayAccountId(e.target.value)}
            >
              {(payMode === "Cash"
                ? cashAccounts
                : payMode === "UPI"
                ? upiAccounts
                : payMode === "Card"
                ? cardAccounts
                : bankAccounts
              ).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} {a.upiId ? `(${a.upiId})` : a.accountNumber ? `(A/C: ${a.accountNumber.slice(-4)})` : ""} · Bal: {inr(a.currentBalance || 0)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Transaction / Reference #">
            <Input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UPI UTR / Cheque / Auth Code"
            />
          </Field>

          <Field label="Note / Remarks">
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="e.g. Partial settlement for bill"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success" disabled={isSubmittingPay}>
              {isSubmittingPay ? "Recording..." : `Receive ${inr(payAmount)}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer Ledger Modal */}
      <Modal
        open={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title={`Customer Statement & Ledger — ${ledgerCustomer?.name}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg border border-border text-[12px]">
            <div>
              <div className="font-bold text-sm text-foreground">{ledgerCustomer?.name}</div>
              <div className="text-muted-foreground">{ledgerCustomer?.phone} · {ledgerCustomer?.address || "No address"}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Current Outstanding</div>
              <div className="text-lg font-black text-destructive num">{inr(customerDue(db, ledgerCustomer?.id || ""))}</div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-border rounded-lg">
            {(() => {
              const entries = (db.customerLedger || []).filter((e) => e.customerId === ledgerCustomer?.id);
              if (entries.length === 0) {
                return (
                  <div className="p-8 text-center text-muted-foreground text-[12px]">
                    No ledger transactions recorded yet for this customer.
                  </div>
                );
              }

              return (
                <table className="w-full text-[11px] text-left">
                  <thead className="bg-muted/80 text-muted-foreground font-semibold border-b border-border sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Particulars / Ref</th>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3 text-right">Debit (+Due)</th>
                      <th className="py-2 px-3 text-right">Credit (-Due)</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => {
                      const matchedSale =
                        entry.type === "SALE"
                          ? (db.sales || []).find((s) => s.id === entry.referenceId || s.invoiceNo === entry.referenceId)
                          : null;
                      return (
                        <tr key={entry.id} className="hover:bg-muted/30">
                          <td className="py-2 px-3 font-mono">{entry.date}</td>
                          <td className="py-2 px-3">
                            <div className="font-semibold">{entry.notes || entry.referenceId || "Transaction"}</div>
                            {entry.referenceId && (
                              <div className="text-[10px] text-muted-foreground font-mono flex items-center gap-2 mt-0.5">
                                <span>Ref: {entry.referenceId}</span>
                                {matchedSale && (
                                  <button
                                    type="button"
                                    onClick={() => setSelectedSaleForInvoice(matchedSale)}
                                    className="text-[10px] font-bold text-primary hover:underline flex items-center gap-0.5 bg-primary/10 px-1.5 py-0.5 rounded cursor-pointer"
                                  >
                                    <Eye className="size-2.5" /> View Bill
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="py-2 px-3">
                            <Badge tone={entry.type === "PAYMENT" ? "success" : entry.type === "SALE" ? "default" : "info"} className="text-[9.5px]">
                              {entry.type}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-destructive">
                            {entry.debit > 0 ? inr(entry.debit) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-medium text-emerald-600">
                            {entry.credit > 0 ? inr(entry.credit) : "—"}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                            {inr(entry.balance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </Modal>

      {/* Customer Invoices / Bills Modal */}
      <Modal
        open={billsModalOpen}
        onClose={() => setBillsModalOpen(false)}
        title={`Sales Bills & Invoices — ${billsCustomer?.name}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-xl border border-border text-[12px]">
            <div>
              <div className="font-bold text-sm text-foreground flex items-center gap-2">
                <span>{billsCustomer?.name}</span>
                <span className="text-[11px] font-normal text-muted-foreground">({customerSales.length} total bills)</span>
              </div>
              <div className="text-muted-foreground">{billsCustomer?.phone} · {billsCustomer?.address || "No address"}</div>
            </div>
            <div className="flex items-center gap-4 text-right">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Total Billed</div>
                <div className="text-sm font-bold text-foreground font-mono">
                  {inr(customerSales.reduce((acc, s) => acc + (s.total || 0), 0))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Current Due</div>
                <div className="text-sm font-black text-destructive font-mono">
                  {inr(customerDue(db, billsCustomer?.id || ""))}
                </div>
              </div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-border/80 rounded-xl">
            {customerSales.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-xs">
                No sales bills recorded for this customer yet.
              </div>
            ) : (
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/80 text-muted-foreground font-semibold border-b border-border sticky top-0">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Invoice No</th>
                    <th className="py-2.5 px-3">Items Sold</th>
                    <th className="py-2.5 px-3 text-right">Total Amount</th>
                    <th className="py-2.5 px-3 text-right">Paid</th>
                    <th className="py-2.5 px-3 text-right">Balance Due</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customerSales.map((s) => {
                    const isPaid = s.paid >= s.total - 0.01;
                    const isPartial = s.paid > 0 && !isPaid;
                    const due = Math.max(0, s.total - s.paid);
                    return (
                      <tr key={s.id} className="hover:bg-muted/30">
                        <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap font-mono text-[11px]">
                          {new Date(s.date).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-primary whitespace-nowrap">
                          {s.invoiceNo}
                          {s.invoiceType && (
                            <span className="ml-1.5 text-[9.5px] px-1 py-0.2 rounded bg-muted text-muted-foreground font-sans">
                              {s.invoiceType}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 max-w-[220px] truncate" title={s.items?.map((it) => it.name).join(", ")}>
                          {s.items?.map((it) => `${it.name} (x${it.qty})`).join(", ")}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                          {inr(s.total)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-semibold">
                          {inr(s.paid)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {due > 0 ? (
                            <span className="text-destructive font-bold">{inr(due)}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge
                            tone={isPaid ? "success" : isPartial ? "warning" : "danger"}
                            className="text-[10px]"
                          >
                            {isPaid ? "Paid" : isPartial ? "Partial" : "Due"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              onClick={() => setSelectedSaleForInvoice(s)}
                              className="h-6.5 px-2 text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-xs"
                            >
                              <Eye className="size-3" /> View Bill
                            </Button>
                            {canDeleteBill && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => {
                                  setSaleToCancel(s);
                                  setCancelModalOpen(true);
                                }}
                                className="h-6.5 px-2 text-xs font-bold gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-xs"
                                title="Cancel / Delete Sale Bill"
                              >
                                <Trash2 className="size-3" /> Cancel Bill
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setBillsModalOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      </Modal>

      {/* UNIVERSAL INVOICE MODAL FOR BILL VIEW / PRINT */}
      {selectedSaleForInvoice && (
        <InvoiceModal
          open={Boolean(selectedSaleForInvoice)}
          onClose={() => setSelectedSaleForInvoice(null)}
          {...saleToInvoiceProps(selectedSaleForInvoice, db)}
        />
      )}

      {/* CANCEL SALE BILL MODAL */}
      <CancelSaleBillModal
        open={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setSaleToCancel(null);
        }}
        sale={saleToCancel}
        customerName={billsCustomer?.name}
        onSuccess={() => {
          setCancelModalOpen(false);
          setSaleToCancel(null);
        }}
      />

      {/* DELETE CUSTOMER CONFIRMATION MODAL */}
      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (!isDeletingCustomer) {
            setDeleteModalOpen(false);
            setCustomerToDelete(null);
          }
        }}
        title={`Delete Customer — ${customerToDelete?.name || ""}`}
      >
        {customerToDelete && (() => {
          const due = customerDue(db, customerToDelete.id);
          const bills = (db.sales || []).filter(
            (s) => (s.customerId === customerToDelete.id || (customerToDelete.phone && (db.customers || []).find((c) => c.id === s.customerId)?.phone === customerToDelete.phone)) &&
                   s.status !== "CANCELLED" && s.status !== "VOID"
          );
          const hasTransactions = bills.length > 0 || due > 0;

          return (
            <div className="space-y-3.5">
              <div className="p-3 rounded-xl bg-muted/40 border border-border text-[12px] space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-sm text-foreground">{customerToDelete.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">{customerToDelete.phone}</span>
                </div>
                {customerToDelete.address && (
                  <div className="text-muted-foreground text-[11px]">{customerToDelete.address}</div>
                )}
                <div className="flex items-center justify-between pt-1 border-t border-border/60 text-[11px]">
                  <span className="text-muted-foreground">Total Invoices: <strong>{bills.length} bills</strong></span>
                  <span className={due > 0 ? "text-destructive font-bold" : "text-emerald-600 font-semibold"}>
                    Outstanding Due: {inr(due)}
                  </span>
                </div>
              </div>

              {hasTransactions ? (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-[11.5px] space-y-2">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="size-4 shrink-0 text-destructive" />
                    Warning: Customer Has Active Transactions
                  </div>
                  <p className="text-[11px] leading-relaxed text-destructive/90">
                    This customer has <strong>{bills.length} recorded bill(s)</strong> and{" "}
                    <strong>{inr(due)} outstanding balance</strong>. Deleting this customer will remove their ledger history and invoice records.
                  </p>
                  <label className="flex items-start gap-2 pt-1 font-semibold text-[11px] cursor-pointer text-foreground bg-white/70 p-2 rounded-lg border border-destructive/20">
                    <input
                      type="checkbox"
                      checked={forceDeleteConfirm}
                      onChange={(e) => setForceDeleteConfirm(e.target.checked)}
                      className="mt-0.5 rounded border-border text-destructive focus:ring-destructive cursor-pointer"
                    />
                    <span>I understand this action is permanent and want to force-delete this customer and all linked records</span>
                  </label>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Are you sure you want to delete this customer? This record will be removed from your customer directory.
                </p>
              )}

              {deleteError && (
                <div className="p-2.5 rounded-lg bg-destructive/15 border border-destructive/30 text-destructive text-xs font-medium">
                  {deleteError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isDeletingCustomer}
                  onClick={() => {
                    setDeleteModalOpen(false);
                    setCustomerToDelete(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isDeletingCustomer || (hasTransactions && !forceDeleteConfirm)}
                  onClick={handleConfirmDeleteCustomer}
                  className="gap-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold shadow-xs"
                >
                  <Trash2 className="size-3.5" />
                  {isDeletingCustomer ? "Deleting..." : "Confirm Delete"}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
