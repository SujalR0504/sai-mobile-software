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
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { customerDue, useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import { PAYMENT_MODES, type Customer, type PaymentMode } from "@/lib/types";
import {
  generateDueWhatsAppMessage,
  generateConsolidatedDueWhatsAppMessage,
  openWhatsAppChat,
} from "@/lib/whatsapp";

export const Route = createFileRoute("/customers")({
  head: () => ({
    meta: [{ title: "Customers CRM & Dues — Mobile Store ERP" }],
  }),
  component: CustomersPage,
});

function CustomersPage() {
  const { db, addCustomer, updateCustomer, recordCustomerPayment } = useStore();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetCustomer, setTargetCustomer] = useState<Customer | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<Customer | null>(null);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

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
    const customerSales = db.sales.filter((s) => s.customerId === c.id && !s.quotation);
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
              const salesCount = db.sales.filter((s) => s.customerId === c.id && !s.quotation).length;
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
                    {salesCount} bills
                  </Td>
                  <Td right mono className={due > 0 ? "font-bold text-destructive" : "text-muted-foreground"}>
                    {inr(due)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
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
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono">{entry.date}</td>
                        <td className="py-2 px-3">
                          <div className="font-semibold">{entry.notes || entry.referenceId || "Transaction"}</div>
                          {entry.referenceId && (
                            <div className="text-[10px] text-muted-foreground font-mono">Ref: {entry.referenceId}</div>
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
                    ))}
                  </tbody>
                </table>
              );
            })()}
          </div>
        </div>
      </Modal>
    </div>
  );
}
