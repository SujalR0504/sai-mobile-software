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
import { supplierDue, useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import { PAYMENT_MODES, type PaymentMode, type Supplier, type Purchase } from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { purchaseToInvoiceProps } from "@/components/invoice/invoiceAdapters";

export const Route = createFileRoute("/suppliers")({
  head: () => ({
    meta: [{ title: "Dealers & Wholesale Distributors — Mobile Store ERP" }],
  }),
  component: SuppliersPage,
});

function SuppliersPage() {
  const { db, addSupplier, recordDealerPayment } = useStore();
  const [query, setQuery] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [targetDealer, setTargetDealer] = useState<Supplier | null>(null);
  const [ledgerDealer, setLedgerDealer] = useState<Supplier | null>(null);
  const [ledgerModalOpen, setLedgerModalOpen] = useState(false);

  // Dealer Bills View State
  const [billsDealer, setBillsDealer] = useState<Supplier | null>(null);
  const [billsModalOpen, setBillsModalOpen] = useState(false);
  const [selectedPurchaseInvoice, setSelectedPurchaseInvoice] = useState<Purchase | null>(null);
  const [billsSearchQuery, setBillsSearchQuery] = useState("");

  const [form, setForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    city: "Harda",
    state: "Madhya Pradesh",
    stateCode: "23",
    contactPerson: "",
  });
  const [payAmount, setPayAmount] = useState(0);
  const [payMode, setPayMode] = useState<PaymentMode>("Bank");
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.company && s.company.toLowerCase().includes(q)) ||
        s.phone.includes(q) ||
        (s.gstin && s.gstin.toLowerCase().includes(q)),
    );
  }, [db.suppliers, query]);

  const totalPayable = useMemo(() => {
    return db.suppliers.reduce((sum, s) => sum + supplierDue(db, s.id), 0);
  }, [db]);

  const dealerBills = useMemo(() => {
    if (!billsDealer) return [];
    return db.purchases.filter((p) => p.supplierId === billsDealer.id);
  }, [db.purchases, billsDealer]);

  const filteredDealerBills = useMemo(() => {
    const q = billsSearchQuery.trim().toLowerCase();
    if (!q) return dealerBills;
    return dealerBills.filter(
      (b) =>
        b.invoiceNo.toLowerCase().includes(q) ||
        (b.date && b.date.toLowerCase().includes(q)) ||
        (b.purchaseType && b.purchaseType.toLowerCase().includes(q))
    );
  }, [dealerBills, billsSearchQuery]);

  const handleSaveDealer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.phone) return;

    addSupplier(form);
    setModalOpen(false);
    setForm({
      name: "",
      company: "",
      phone: "",
      email: "",
      gstin: "",
      address: "",
      city: "Harda",
      state: "Madhya Pradesh",
      stateCode: "23",
      contactPerson: "",
    });
  };

  const handlePayDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetDealer || payAmount <= 0) return;

    try {
      setIsSubmittingPay(true);
      await recordDealerPayment({
        dealerId: targetDealer.id,
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

  const openProfile = (dealer: Supplier) => {
    setTargetDealer(dealer);
    setProfileModalOpen(true);
  };

  // Profile calculations
  const dealerPurchases = useMemo(() => {
    if (!targetDealer) return [];
    return db.purchases.filter((p) => p.supplierId === targetDealer.id);
  }, [db.purchases, targetDealer]);

  const dealerPayments = useMemo(() => {
    if (!targetDealer) return [];
    return db.payments.filter((p) => (p.party === "supplier" || p.party === "dealer") && p.partyId === targetDealer.id);
  }, [db.payments, targetDealer]);

  const totalPurchasedAmount = useMemo(() => {
    return dealerPurchases.reduce((s, p) => s + p.total, 0);
  }, [dealerPurchases]);

  const totalPaidAmount = useMemo(() => {
    return dealerPayments.reduce((s, p) => s + p.amount, 0);
  }, [dealerPayments]);

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <PageHead
        title="Dealers & Wholesale Distributors"
        sub="Manage authorized mobile distributors, purchase bills, and vendor ledger balances."
        actions={
          <Button onClick={() => setModalOpen(true)}>+ Add Dealer</Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Total Dealers" value={String(db.suppliers.length)} />
        <Stat
          label="Dealer Payables (Dues)"
          value={inr(totalPayable)}
          tone={totalPayable > 0 ? "warning" : "success"}
        />
      </section>

      <Card>
        <CardHead
          title="Authorized Dealers List"
          sub={`${filtered.length} wholesale partners registered`}
          right={
            <Input
              placeholder="Search dealer name or phone..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-64"
            />
          }
        />

        {filtered.length === 0 ? (
          <Empty text="No dealers found." />
        ) : (
          <Table head={["Dealer / Company", "Phone", "GSTIN", "City / Address", ">Purchases", ">Payable Due", "Actions"]}>
            {filtered.map((s) => {
              const due = supplierDue(db, s.id);
              const purCount = db.purchases.filter((p) => p.supplierId === s.id).length;
              return (
                <Row key={s.id}>
                  <Td>
                    <div className="font-semibold text-foreground hover:text-primary cursor-pointer" onClick={() => openProfile(s)}>
                      {s.name}
                    </div>
                  </Td>
                  <Td mono className="font-medium">
                    {s.phone}
                  </Td>
                  <Td mono className="text-[11px] text-muted-foreground">
                    {s.gstin || "—"}
                  </Td>
                  <Td>{s.address || "—"}</Td>
                  <Td right mono>
                    <button
                      type="button"
                      onClick={() => {
                        setBillsDealer(s);
                        setBillsSearchQuery("");
                        setBillsModalOpen(true);
                      }}
                      className="cursor-pointer font-bold text-primary hover:underline hover:text-primary/80 transition-colors inline-flex items-center gap-1"
                      title="View all purchase bills for this dealer"
                    >
                      <span>{purCount} bills</span>
                      <span className="text-[10px]">↗</span>
                    </button>
                  </Td>
                  <Td right mono className={due > 0 ? "font-bold text-warning" : "text-muted-foreground"}>
                    {inr(due)}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setBillsDealer(s);
                          setBillsSearchQuery("");
                          setBillsModalOpen(true);
                        }}
                        className="font-bold text-primary border-primary/40 hover:bg-primary/5 shadow-2xs gap-1"
                      >
                        📄 Bills
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openProfile(s)}
                      >
                        Profile
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setLedgerDealer(s);
                          setLedgerModalOpen(true);
                        }}
                      >
                        Ledger
                      </Button>
                      {due > 0 && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => {
                            setTargetDealer(s);
                            setPayAmount(due);
                            setPayMode("Bank");
                            const def = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
                            setPayAccountId(def?.id || "");
                            setPayRef("");
                            setPayNote(`Payment to ${s.name}`);
                            setPayModalOpen(true);
                          }}
                        >
                          Pay Dealer
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

      {/* Add Dealer Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Authorized Dealer / Distributor"
        wide
      >
        <form onSubmit={handleSaveDealer} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Dealer / Distributor Name *">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Tanay Traders"
              />
            </Field>
            <Field label="Company / Brand Handled">
              <Input
                value={form.company}
                onChange={(e) => setForm({ ...form, company: e.target.value })}
                placeholder="e.g. Realme Distributor"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Phone / Mobile Number *">
              <Input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 9811223344"
              />
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="dealer@trade.com"
              />
            </Field>
            <Field label="Contact Person">
              <Input
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                placeholder="e.g. Sumit Maheshwari"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="GSTIN Number">
              <Input
                value={form.gstin}
                onChange={(e) => {
                  const g = e.target.value.toUpperCase();
                  const code = g.length >= 2 ? g.substring(0, 2) : "23";
                  setForm({ ...form, gstin: g, stateCode: code });
                }}
                placeholder="e.g. 23AQDPA6961H2Z2"
              />
            </Field>
            <Field label="State">
              <Input
                value={form.state}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
                placeholder="Madhya Pradesh"
              />
            </Field>
            <Field label="State Code">
              <Input
                value={form.stateCode}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                placeholder="23"
              />
            </Field>
          </div>

          <Field label="Warehouse / City Address">
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="e.g. Main Market, Harda"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Dealer</Button>
          </div>
        </form>
      </Modal>

      {/* Pay Dealer Modal */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Pay Dealer — ${targetDealer?.name}`}
      >
        <form onSubmit={handlePayDealer} className="space-y-3">
          <div className="p-3 rounded-md bg-warning/10 border border-warning/20 text-[13px] flex items-center justify-between">
            <span>Outstanding Payable Balance:</span>
            <span className="font-bold text-warning text-sm num">{inr(supplierDue(db, targetDealer?.id || ""))}</span>
          </div>

          <Field label="Amount to Pay (₹) *">
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
              <option value="Bank">Bank Transfer (NEFT / RTGS / IMPS)</option>
              <option value="UPI">UPI</option>
              <option value="Cash">Cash Drawer</option>
              <option value="Card">Debit / Credit Card</option>
            </Select>
          </Field>

          {/* Account Dropdown */}
          <Field label={`Withdraw from ${payMode} Account *`}>
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
                  {a.accountName} {a.accountNumber ? `(A/C: ${a.accountNumber.slice(-4)})` : a.upiId ? `(${a.upiId})` : ""} · Bal: {inr(a.currentBalance || 0)}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Reference / Transaction ID / Cheque #">
            <Input
              value={payRef}
              onChange={(e) => setPayRef(e.target.value)}
              placeholder="e.g. UTR / Cheque # / Ref #"
            />
          </Field>

          <Field label="Note / Remarks">
            <Input
              value={payNote}
              onChange={(e) => setPayNote(e.target.value)}
              placeholder="e.g. Payment for invoice"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmittingPay}>
              {isSubmittingPay ? "Processing..." : `Pay ${inr(payAmount)}`}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Dealer Ledger Modal */}
      <Modal
        open={ledgerModalOpen}
        onClose={() => setLedgerModalOpen(false)}
        title={`Dealer Statement & Ledger — ${ledgerDealer?.name}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg border border-border text-[12px]">
            <div>
              <div className="font-bold text-sm text-foreground">{ledgerDealer?.name}</div>
              <div className="text-muted-foreground">{ledgerDealer?.company} · {ledgerDealer?.phone} · GSTIN: {ledgerDealer?.gstin || "Unregistered"}</div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Current Payable Balance</div>
              <div className="text-lg font-black text-warning num">{inr(supplierDue(db, ledgerDealer?.id || ""))}</div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-border rounded-lg">
            {(() => {
              const entries = (db.supplierLedger || []).filter((e) => e.supplierId === ledgerDealer?.id);
              if (entries.length === 0) {
                return (
                  <div className="p-8 text-center text-muted-foreground text-[12px]">
                    No ledger transactions recorded yet for this dealer.
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
                      <th className="py-2 px-3 text-right">Debit (-Payable)</th>
                      <th className="py-2 px-3 text-right">Credit (+Payable)</th>
                      <th className="py-2 px-3 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/30">
                        <td className="py-2 px-3 font-mono">{entry.date}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center justify-between gap-1">
                            <div>
                              <div className="font-semibold">{entry.notes || entry.referenceId || "Transaction"}</div>
                              {entry.referenceId && (
                                <div className="text-[10px] text-muted-foreground font-mono">Ref: {entry.referenceId}</div>
                              )}
                            </div>
                            {entry.type === "PURCHASE" && (
                              (() => {
                                const p = db.purchases.find(
                                  (item) => item.invoiceNo === entry.referenceId || item.id === entry.referenceId
                                );
                                if (!p) return null;
                                return (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-[10px] h-6 px-2 py-0 border-primary/40 text-primary hover:bg-primary/5 shrink-0"
                                    onClick={() => setSelectedPurchaseInvoice(p)}
                                  >
                                    👁️ View Bill
                                  </Button>
                                );
                              })()
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <Badge tone={entry.type === "PAYMENT" ? "success" : entry.type === "PURCHASE" ? "warning" : "info"} className="text-[9.5px]">
                            {entry.type}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-emerald-600">
                          {entry.debit > 0 ? inr(entry.debit) : "—"}
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-medium text-destructive">
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

      {/* Dealer Profile Modal */}
      {profileModalOpen && targetDealer ? (
        <Modal
          open={profileModalOpen}
          onClose={() => setProfileModalOpen(false)}
          title={`Dealer Profile — ${targetDealer.name}`}
          wide
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl border border-border bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Firm / Company</span>
                <span className="font-bold text-foreground">{targetDealer.company || targetDealer.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Contact & Mobile</span>
                <span className="font-medium text-foreground">{targetDealer.contactPerson || "Manager"} · {targetDealer.phone}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">GSTIN</span>
                <span className="font-mono font-semibold text-foreground">{targetDealer.gstin || "Unregistered"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">State & Code</span>
                <span className="font-medium text-foreground">{targetDealer.state || "MP"} ({targetDealer.stateCode || "23"})</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-border p-3 bg-[var(--surface-glass)]">
                <div className="text-[11px] text-muted-foreground">Total Inward Purchased</div>
                <div className="text-[15px] font-bold num">{inr(totalPurchasedAmount)}</div>
              </div>
              <div className="rounded-xl border border-border p-3 bg-[var(--surface-glass)]">
                <div className="text-[11px] text-muted-foreground">Total Paid</div>
                <div className="text-[15px] font-bold num text-emerald-600">{inr(totalPaidAmount)}</div>
              </div>
              <div className="rounded-xl border border-border p-3 bg-[var(--surface-glass)]">
                <div className="text-[11px] text-muted-foreground">Outstanding Due</div>
                <div className={`text-[15px] font-bold num ${supplierDue(db, targetDealer.id) > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {inr(supplierDue(db, targetDealer.id))}
                </div>
              </div>
            </div>

            {/* Inward Purchases Table */}
            <div>
              <div className="text-[12px] font-bold text-foreground mb-2">Recent Inward Purchases ({dealerPurchases.length})</div>
              {dealerPurchases.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic py-2">No purchase records found for this dealer.</div>
              ) : (
                <div className="max-h-48 overflow-y-auto overflow-x-auto rounded-xl border border-border">
                  <table className="w-full min-w-[580px] text-left text-[11px]">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-2">Invoice #</th>
                        <th className="p-2">Date</th>
                        <th className="p-2">Mode</th>
                        <th className="p-2 text-right">Taxable</th>
                        <th className="p-2 text-right">Total</th>
                        <th className="p-2 text-right">Paid</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {dealerPurchases.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="p-2 font-mono font-semibold text-primary">{p.invoiceNo}</td>
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">
                            <Badge tone={p.purchaseType === "NON_GST" ? "neutral" : "info"}>
                              {p.purchaseType || "GST"}
                            </Badge>
                          </td>
                          <td className="p-2 text-right font-mono">{inr(p.subtotal || p.taxableValue || 0)}</td>
                          <td className="p-2 text-right font-mono font-bold">{inr(p.total)}</td>
                          <td className="p-2 text-right font-mono text-emerald-600">{inr(p.paid)}</td>
                          <td className="p-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[10px] h-6 px-2 py-0 border-primary/30 text-primary hover:bg-primary/5 cursor-pointer"
                              onClick={() => setSelectedPurchaseInvoice(p)}
                            >
                              👁️ View Bill
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Dealer Payment History */}
            <div>
              <div className="text-[12px] font-bold text-foreground mb-2 flex items-center justify-between">
                <span>💳 Payment History ({dealerPayments.length})</span>
                {supplierDue(db, targetDealer.id) > 0 && (
                  <Button
                    size="sm"
                    variant="soft"
                    className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                    onClick={() => {
                      setPayAmount(supplierDue(db, targetDealer.id));
                      setPayNote(`Payment to ${targetDealer.name}`);
                      setPayModalOpen(true);
                    }}
                  >
                    + Record Payment
                  </Button>
                )}
              </div>
              {dealerPayments.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic py-2">No payment transactions recorded for this dealer.</div>
              ) : (
                <div className="max-h-48 overflow-y-auto rounded-xl border border-border">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Mode</th>
                        <th className="p-2">Ref / UTR</th>
                        <th className="p-2">Cheque / Bank</th>
                        <th className="p-2 text-right">Amount (₹)</th>
                        <th className="p-2">User</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {dealerPayments.map((p) => (
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
                          <td className="p-2 text-right font-mono font-bold text-emerald-600">{inr(p.amount)}</td>
                          <td className="p-2 text-muted-foreground">{p.userName || "Admin"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Debit Notes for this Dealer */}
            {db.debitNotes && db.debitNotes.some((dn) => (dn.dealerId || dn.supplierId) === targetDealer.id) && (
              <div>
                <div className="text-[12px] font-bold text-foreground mb-2">Issued Debit Notes & TDS 194R</div>
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-left text-[11px]">
                    <thead className="bg-muted/40 text-muted-foreground font-semibold">
                      <tr>
                        <th className="p-2">Note #</th>
                        <th className="p-2">Date</th>
                        <th className="p-2">Reason / Section</th>
                        <th className="p-2 text-right">Debit Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {db.debitNotes
                        .filter((dn) => (dn.dealerId || dn.supplierId) === targetDealer.id)
                        .map((dn) => (
                          <tr key={dn.id} className="hover:bg-muted/20">
                            <td className="p-2 font-mono font-semibold text-primary">{dn.noteNumber}</td>
                            <td className="p-2">{dn.date}</td>
                            <td className="p-2 font-medium">{dn.reason}</td>
                            <td className="p-2 text-right font-mono font-bold text-rose-600">-{inr(dn.amount)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              {supplierDue(db, targetDealer.id) > 0 && (
                <Button
                  size="sm"
                  onClick={() => {
                    setProfileModalOpen(false);
                    setPayAmount(supplierDue(db, targetDealer.id));
                    setPayNote(`Payment to ${targetDealer.name}`);
                    setPayModalOpen(true);
                  }}
                >
                  Pay Outstanding Balance
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setProfileModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}

      {/* Dealer Purchase Bills & Invoices Modal */}
      {billsModalOpen && billsDealer && (
        <Modal
          open={billsModalOpen}
          onClose={() => setBillsModalOpen(false)}
          title={`Purchase Invoices & Bills — ${billsDealer.name}`}
          wide
        >
          <div className="space-y-4">
            {/* Header Dealer Profile / Stats Summary */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-xl border border-border bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Dealer / Firm</span>
                <span className="font-bold text-foreground">{billsDealer.company || billsDealer.name}</span>
                <span className="text-muted-foreground block text-[10.5px]">{billsDealer.phone}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">GSTIN</span>
                <span className="font-mono font-semibold text-foreground">{billsDealer.gstin || "Unregistered"}</span>
                <span className="text-muted-foreground block text-[10.5px]">{billsDealer.city || "Harda"}, {billsDealer.state || "MP"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Total Purchased</span>
                <span className="text-[15px] font-bold num text-foreground">
                  {inr(dealerBills.reduce((s, b) => s + b.total, 0))}
                </span>
                <span className="text-muted-foreground block text-[10.5px]">{dealerBills.length} purchase invoices</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Payable Balance Due</span>
                <span className={`text-[15px] font-bold num ${supplierDue(db, billsDealer.id) > 0 ? "text-destructive" : "text-emerald-600"}`}>
                  {inr(supplierDue(db, billsDealer.id))}
                </span>
                {supplierDue(db, billsDealer.id) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setBillsModalOpen(false);
                      setTargetDealer(billsDealer);
                      setPayAmount(supplierDue(db, billsDealer.id));
                      setPayMode("Bank");
                      const def = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
                      setPayAccountId(def?.id || "");
                      setPayRef("");
                      setPayNote(`Payment to ${billsDealer.name}`);
                      setPayModalOpen(true);
                    }}
                    className="text-[10px] text-primary hover:underline font-bold block"
                  >
                    + Pay Dealer
                  </button>
                )}
              </div>
            </div>

            {/* Filter Search */}
            <div className="flex items-center justify-between gap-2">
              <div className="text-[12px] font-bold text-foreground">
                Inward Purchase Bills ({filteredDealerBills.length})
              </div>
              <Input
                placeholder="Search invoice #, date, type..."
                value={billsSearchQuery}
                onChange={(e) => setBillsSearchQuery(e.target.value)}
                className="w-48 sm:w-60 text-xs"
              />
            </div>

            {filteredDealerBills.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-[12px] border border-dashed border-border rounded-xl">
                No purchase bills found for this dealer.
              </div>
            ) : (
              <div className="max-h-[55vh] overflow-y-auto overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[650px] text-left text-[11.5px]">
                  <thead className="bg-muted/60 text-muted-foreground font-semibold sticky top-0 border-b border-border">
                    <tr>
                      <th className="py-2.5 px-3">Invoice #</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3 text-center">Items</th>
                      <th className="py-2.5 px-3 text-right">Taxable</th>
                      <th className="py-2.5 px-3 text-right">Total Bill</th>
                      <th className="py-2.5 px-3 text-right">Paid</th>
                      <th className="py-2.5 px-3 text-right">Due</th>
                      <th className="py-2.5 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {filteredDealerBills.map((b) => {
                      const due = b.dueAmount !== undefined ? b.dueAmount : Math.max(0, b.total - b.paid);
                      return (
                        <tr key={b.id} className="hover:bg-muted/20 transition-colors">
                          <td className="py-2.5 px-3 font-mono font-bold text-primary">
                            {b.invoiceNo}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-muted-foreground">
                            {b.date}
                          </td>
                          <td className="py-2.5 px-3">
                            <Badge tone={b.purchaseType === "NON_GST" ? "neutral" : "info"} className="text-[10px]">
                              {b.purchaseType || "GST"}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono">
                            {b.items?.length || 0}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">
                            {inr(b.taxableValue || b.subtotal || b.total)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-foreground">
                            {inr(b.total)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-emerald-600 font-medium">
                            {inr(b.paid)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono font-bold ${due > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {inr(due)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setSelectedPurchaseInvoice(b)}
                              className="gap-1 font-semibold text-primary border-primary/30 hover:bg-primary/10 shadow-2xs cursor-pointer text-xs"
                            >
                              <span>👁️</span>
                              <span>View Bill</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setBillsModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Universal Purchase Invoice Modal for viewing full bill */}
      {selectedPurchaseInvoice && (
        <InvoiceModal
          open={Boolean(selectedPurchaseInvoice)}
          onClose={() => setSelectedPurchaseInvoice(null)}
          {...purchaseToInvoiceProps(selectedPurchaseInvoice, db)}
        />
      )}
    </div>
  );
}
