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
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import { PAYMENT_MODES, type PaymentMode } from "@/lib/types";
import { paymentAccountsApi } from "@/services/api";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [{ title: "Payment Ledger & Cash Flow — Mobile Store ERP" }],
  }),
  component: PaymentsPage,
});

function PaymentsPage() {
  const { db, addPayment } = useStore();
  const [partyFilter, setPartyFilter] = useState("All");
  const [modeFilter, setModeFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    date: todayISO(),
    party: "customer" as "customer" | "supplier",
    partyId: db.customers[0]?.id || "",
    amount: 1000,
    mode: "UPI" as PaymentMode,
    note: "",
  });

  const customerMap = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const supplierMap = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers]);

  const filteredPayments = useMemo(() => {
    return db.payments.filter((p) => {
      if (partyFilter !== "All" && p.party !== partyFilter) return false;
      if (modeFilter !== "All" && p.mode !== modeFilter) return false;
      return true;
    });
  }, [db.payments, partyFilter, modeFilter]);

  const totalCollected = useMemo(
    () => db.payments.filter((p) => p.party === "customer").reduce((sum, p) => sum + p.amount, 0),
    [db.payments],
  );

  const totalPaidOut = useMemo(
    () => db.payments.filter((p) => p.party === "supplier").reduce((sum, p) => sum + p.amount, 0),
    [db.payments],
  );

  const handleCreatePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.partyId || form.amount <= 0) return;

    addPayment(form);
    setModalOpen(false);
  };

  const paymentAccounts = useMemo(() => db.paymentAccounts || [], [db.paymentAccounts]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [accountTxList, setAccountTxList] = useState<any[]>([]);
  const [accountTxLoading, setAccountTxLoading] = useState(false);
  const [accountModalOpen, setAccountModalOpen] = useState(false);

  const openAccountLedger = async (acc: any) => {
    setSelectedAccount(acc);
    setAccountModalOpen(true);
    setAccountTxLoading(true);
    try {
      const txs = await paymentAccountsApi.getAccountTransactions(acc.id);
      setAccountTxList(txs || []);
    } catch {
      setAccountTxList([]);
    } finally {
      setAccountTxLoading(false);
    }
  };

  const totalAccountBalance = useMemo(
    () => paymentAccounts.reduce((sum, a) => sum + (a.currentBalance || 0), 0),
    [paymentAccounts],
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Payment Ledger & Cash Flow"
        sub="Monitor cash in, cash out, payment accounts balances, and detailed ledger statements."
        actions={
          <Button onClick={() => setModalOpen(true)}>+ Record Payment</Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Cash & Bank Balance" value={inr(totalAccountBalance)} tone="success" />
        <Stat label="Total Received (In)" value={inr(totalCollected)} tone="default" />
        <Stat label="Total Paid (Out)" value={inr(totalPaidOut)} tone="warning" />
        <Stat label="Active Accounts" value={String(paymentAccounts.length)} />
      </section>

      {/* Payment Accounts Master Grid */}
      <Card>
        <CardHead
          title="Payment Accounts & Balances"
          sub={`${paymentAccounts.length} active business accounts`}
        />
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {paymentAccounts.map((acc) => (
            <div
              key={acc.id}
              className="rounded-xl border border-border p-3.5 bg-background hover:border-primary/50 transition-all flex flex-col justify-between space-y-2.5 shadow-2xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-[13px] text-foreground flex items-center gap-1.5">
                    {acc.accountName}
                    {acc.isDefault && (
                      <Badge tone="success" className="text-[9px] px-1 py-0">
                        Default
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {acc.upiId ? `UPI: ${acc.upiId}` : acc.accountNumber ? `A/C: ${acc.accountNumber}` : acc.bankName || "Internal Drawer"}
                  </div>
                </div>
                <Badge tone={acc.accountType === "CASH" ? "warning" : acc.accountType === "UPI" ? "info" : "default"} className="text-[9.5px]">
                  {acc.accountType}
                </Badge>
              </div>

              <div className="border-t border-border/60 pt-2 flex items-baseline justify-between">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">Balance</div>
                  <div className="text-base font-black num text-foreground">{inr(acc.currentBalance || 0)}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[10.5px] px-2"
                  onClick={() => openAccountLedger(acc)}
                >
                  Ledger
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead
          title="Transactions Ledger"
          sub={`${filteredPayments.length} entries`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={partyFilter}
                onChange={(e) => setPartyFilter(e.target.value)}
                className="w-32"
              >
                <option value="All">All Parties</option>
                <option value="customer">Customer In</option>
                <option value="supplier">Vendor Out</option>
              </Select>
              <Select
                value={modeFilter}
                onChange={(e) => setModeFilter(e.target.value)}
                className="w-32"
              >
                <option value="All">All Modes</option>
                {PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {filteredPayments.length === 0 ? (
          <Empty text="No payments recorded." />
        ) : (
          <Table head={["Date", "Flow Type", "Party Name", "Mode", ">Amount", "Reference / Note"]}>
            {filteredPayments.map((p) => {
              const partyName =
                p.party === "customer"
                  ? customerMap.get(p.partyId)?.name || "Customer"
                  : supplierMap.get(p.partyId)?.name || "Dealer";
              const isIncome = p.party === "customer";
              return (
                <Row key={p.id}>
                  <Td>{p.date}</Td>
                  <Td>
                    <Badge tone={isIncome ? "success" : "warning"}>
                      {isIncome ? "Receipt (In)" : "Payment (Out)"}
                    </Badge>
                  </Td>
                  <Td className="font-medium">{partyName}</Td>
                  <Td>
                    <Badge tone="neutral">{p.mode}</Badge>
                  </Td>
                  <Td right mono className={isIncome ? "font-bold text-success" : "font-bold text-warning"}>
                    {isIncome ? `+${inr(p.amount)}` : `-${inr(p.amount)}`}
                  </Td>
                  <Td className="text-muted-foreground text-[11px]">{p.note || "—"}</Td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {/* Record Payment Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Manual Payment Entry"
      >
        <form onSubmit={handleCreatePayment} className="space-y-3">
          <Field label="Transaction Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>

          <Field label="Party Type">
            <Select
              value={form.party}
              onChange={(e) => {
                const party = e.target.value as "customer" | "supplier";
                const firstId = party === "customer" ? db.customers[0]?.id : db.suppliers[0]?.id;
                setForm({ ...form, party, partyId: firstId || "" });
              }}
            >
              <option value="customer">Customer (Received In)</option>
              <option value="supplier">Dealer (Paid Out)</option>
            </Select>
          </Field>

          <Field label={form.party === "customer" ? "Select Customer *" : "Select Dealer *"}>
            <Select
              value={form.partyId}
              onChange={(e) => setForm({ ...form, partyId: e.target.value })}
              required
            >
              {form.party === "customer"
                ? db.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))
                : db.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.phone})
                    </option>
                  ))}
            </Select>
          </Field>

          <Field label="Amount (₹) *">
            <Input
              type="number"
              min="1"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>

          <Field label="Payment Mode">
            <Select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value as PaymentMode })}
            >
              {PAYMENT_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Note / Remark">
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Due clearance or manual advance"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Record Entry</Button>
          </div>
        </form>
      </Modal>

      {/* Account Transaction Ledger Modal */}
      <Modal
        open={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        title={`Account Statement & Ledger — ${selectedAccount?.accountName}`}
        wide
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted/40 rounded-lg border border-border text-[12px]">
            <div>
              <div className="font-bold text-sm text-foreground flex items-center gap-2">
                <span>{selectedAccount?.accountName}</span>
                <Badge tone={selectedAccount?.accountType === "CASH" ? "warning" : selectedAccount?.accountType === "UPI" ? "info" : "default"} className="text-[9.5px]">
                  {selectedAccount?.accountType}
                </Badge>
              </div>
              <div className="text-muted-foreground mt-0.5">
                {selectedAccount?.upiId ? `UPI: ${selectedAccount?.upiId}` : selectedAccount?.accountNumber ? `A/C: ${selectedAccount?.accountNumber}` : selectedAccount?.bankName || "Cash Drawer"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground uppercase tracking-wider">Current Live Balance</div>
              <div className="text-lg font-black text-foreground num">{inr(selectedAccount?.currentBalance || 0)}</div>
            </div>
          </div>

          <div className="max-h-[60vh] overflow-y-auto border border-border rounded-lg">
            {accountTxLoading ? (
              <div className="p-8 text-center text-muted-foreground text-[12px]">
                Loading account statement...
              </div>
            ) : accountTxList.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-[12px]">
                No transactions recorded in this account yet.
              </div>
            ) : (
              <table className="w-full text-[11px] text-left">
                <thead className="bg-muted/80 text-muted-foreground font-semibold border-b border-border sticky top-0">
                  <tr>
                    <th className="py-2 px-3">Date</th>
                    <th className="py-2 px-3">Transaction / Description</th>
                    <th className="py-2 px-3">Type</th>
                    <th className="py-2 px-3">Method</th>
                    <th className="py-2 px-3 text-right">Debit (-Out)</th>
                    <th className="py-2 px-3 text-right">Credit (+In)</th>
                    <th className="py-2 px-3 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {accountTxList.map((tx) => (
                    <tr key={tx.id} className="hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono">{tx.date}</td>
                      <td className="py-2 px-3">
                        <div className="font-semibold">{tx.description || tx.referenceType}</div>
                        {tx.referenceId && (
                          <div className="text-[10px] text-muted-foreground font-mono">Ref: {tx.referenceId}</div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <Badge tone={tx.credit > 0 ? "success" : "warning"} className="text-[9.5px]">
                          {tx.transactionType || tx.referenceType}
                        </Badge>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-[10px] font-mono text-muted-foreground">{tx.paymentMethod || "—"}</span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium text-destructive">
                        {tx.debit > 0 ? inr(tx.debit) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-medium text-emerald-600">
                        {tx.credit > 0 ? inr(tx.credit) : "—"}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-foreground">
                        {inr(tx.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
