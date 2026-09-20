import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Badge, Button, Card, CardHead, Empty, Stat } from "@/components/ui";
import { customerDue, lowStockProducts, saleProfit, stockOf, useStore } from "@/lib/store";
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
} from "lucide-react";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { saleToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import type { Sale } from "@/lib/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mobile Store ERP" },
      {
        name: "description",
        content:
          "Today's sales, purchases, profit, cash in hand, dues, low stock and pending repairs at a glance.",
      },
      { property: "og:title", content: "Dashboard — Mobile Store ERP" },
      {
        property: "og:description",
        content: "Daily counter overview for your mobile shop: sales, profit, dues and repairs.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { db } = useStore();
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const today = todayISO();

  const salesToday = (db.sales || []).filter((s) => s.date === today && !s.quotation);
  const purchasesToday = (db.purchases || []).filter((p) => p.date === today);
  const expensesToday = (db.expenses || []).filter((e) => e.date === today);

  const salesTotal = salesToday.reduce((a, s) => a + s.total, 0);
  const purchaseTotal = purchasesToday.reduce((a, p) => a + p.total, 0);
  const profit = salesToday.reduce((a, s) => a + saleProfit(s), 0);
  const expenseTotal = expensesToday.reduce((a, e) => a + e.amount, 0);

  const cashIn = (db.payments || [])
    .filter((p) => p.party === "customer" && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);
  const cashOut = (db.payments || [])
    .filter((p) => p.party === "supplier" && p.mode === "Cash")
    .reduce((a, p) => a + p.amount, 0);
  const cashInHand = (db.settings?.openingCash || 0) + cashIn - cashOut - expenseTotal;

  const totalDue = (db.customers || []).reduce((a, c) => a + customerDue(db, c.id), 0);
  const dueCustomers = (db.customers || []).filter((c) => customerDue(db, c.id) > 0).length;

  const low = lowStockProducts(db);
  const pendingRepairs = (db.repairs || []).filter((r) => r.status !== "Delivered");
  const readyRepairs = pendingRepairs.filter((r) => r.status === "Ready").length;

  const recent = [...(db.sales || [])].filter((s) => !s.quotation).slice(-5).reverse();
  const margin = salesTotal > 0 ? ((profit / salesTotal) * 100).toFixed(1) : "0.0";
  const avgBill = salesToday.length ? salesTotal / salesToday.length : 0;

  // Calculate EMI pending from sales
  const emiPendingAmount = (db.sales || [])
    .filter((s) => s.isEmi && s.status !== "VOID")
    .reduce((sum, s) => sum + (s.emiFinancedAmount || (s.total - (s.emiDownPayment || 0))), 0);

  return (
    <div className="space-y-5">
      {/* Quick Actions Toolbar */}
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-indigo-500/[0.04] to-transparent p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid size-6 place-items-center rounded-lg bg-primary text-white text-[11px]">
              <Sparkles className="size-3.5" />
            </span>
            <span className="text-[12.5px] font-bold tracking-wide uppercase text-primary">
              Quick Retail Actions
            </span>
          </div>
          <span className="text-[11px] font-medium text-muted-foreground bg-white/80 px-2.5 py-0.5 rounded-full border border-border/60">
            Counter Terminal · Store 01
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/pos"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-indigo-600 px-4 py-2.5 text-[12.5px] font-bold text-white shadow-sm hover:shadow-indigo-500/20 hover:shadow-md transition-all active:scale-[0.98]"
          >
            <Receipt className="size-4" />
            <span>New Sale (F1)</span>
          </Link>

          <Link
            to="/pos"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/90 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-primary/40 shadow-2xs transition-all"
          >
            <ScanBarcode className="size-4 text-indigo-500" />
            <span>Scan Barcode</span>
          </Link>

          <Link
            to="/purchase"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/90 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-primary/40 shadow-2xs transition-all"
          >
            <ShoppingBag className="size-4 text-blue-500" />
            <span>Inward Purchase</span>
          </Link>

          <Link
            to="/customers"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/90 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-primary/40 shadow-2xs transition-all"
          >
            <UserPlus className="size-4 text-emerald-500" />
            <span>New Customer</span>
          </Link>

          <Link
            to="/repairs"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/90 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-primary/40 shadow-2xs transition-all"
          >
            <Wrench className="size-4 text-amber-500" />
            <span>Service Job</span>
          </Link>

          <Link
            to="/emi"
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/30 bg-indigo-50/80 px-3.5 py-2.5 text-[12px] font-semibold text-indigo-700 hover:bg-indigo-100 shadow-2xs transition-all"
          >
            <CreditCard className="size-4 text-indigo-600" />
            <span>EMI Settlements</span>
          </Link>

          <Link
            to="/expenses"
            className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/90 px-3.5 py-2.5 text-[12px] font-semibold text-slate-700 hover:bg-white hover:border-primary/40 shadow-2xs transition-all"
          >
            <ReceiptIndianRupee className="size-4 text-rose-500" />
            <span>Add Expense</span>
          </Link>
        </div>
      </section>

      {/* KPI Stats Grid */}
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Stat label="Today's Sales" value={inr(salesTotal)} hint={`${salesToday.length} bills`} tone="info" />
        <Stat
          label="Today's Purchase"
          value={inr(purchaseTotal)}
          hint={`${purchasesToday.length} invoices`}
          delay={60}
        />
        <Stat
          label="Today's Profit"
          value={inr(profit)}
          hint={`${margin}% margin`}
          tone="success"
          delay={120}
        />
        <Stat label="Cash in Hand" value={inr(cashInHand)} hint="Drawer A" delay={180} />
        <Stat
          label="Credit / Due"
          value={inr(totalDue)}
          hint={`${dueCustomers} customers`}
          tone="danger"
          delay={240}
        />
        <Stat
          label="Pending EMI Finance"
          value={inr(emiPendingAmount)}
          hint="From Bajaj / HDB / TVS"
          tone={emiPendingAmount > 0 ? "warning" : undefined}
          delay={270}
        />
        <Stat
          label="Low Stock"
          value={String(low.length)}
          hint="items below reorder"
          tone="warning"
          delay={300}
        />
        <Stat
          label="Pending Repairs"
          value={String(pendingRepairs.length)}
          hint={`${readyRepairs} ready for pickup`}
          delay={360}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Low Stock"
            right={<Badge tone="warning">{low.length} items</Badge>}
          />
          <div className="divide-y divide-border text-[12px]">
            {low.length === 0 ? <Empty text="Everything is above reorder level." /> : null}
            {low.slice(0, 6).map(({ product, stock }) => (
              <div
                key={product.id}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.03]"
              >
                <span className="w-44 truncate font-medium">{product.name}</span>
                <span className="num text-muted-foreground">{stock} left</span>
                <Badge className="ml-auto" tone={stock <= 1 ? "danger" : "warning"}>
                  {stock <= 1 ? "Critical" : "Low"}
                </Badge>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <CardHead
            title="Recent Bills"
            right={
              <Link to="/reports" className="text-[11px] font-medium text-primary">
                View reports
              </Link>
            }
          />
          <div className="divide-y divide-border text-[12px]">
            {recent.length === 0 ? <Empty text="No bills yet. Start from POS Billing." /> : null}
            {recent.map((s) => {
              const cust = db.customers.find((c) => c.id === s.customerId);
              const due = s.total - s.paid;
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-foreground/[0.03] transition-colors"
                >
                  <span className="num w-20 text-muted-foreground font-mono">{s.invoiceNo}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{cust?.name}</span>
                  <span className="num font-semibold">{inr(s.total)}</span>
                  <Badge className="ml-auto" tone={due > 0 ? "warning" : "success"}>
                    {due > 0 ? `Due ${inr(due)}` : "Paid"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="size-7 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                    onClick={() => setSelectedSale(s)}
                    title="Print / View Invoice"
                  >
                    <Printer className="size-3.5" />
                  </Button>
                </div>
              );
            })}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHead
            title="Pending Repairs"
            right={
              <Link to="/repairs" className="text-[11px] font-medium text-primary">
                All jobs
              </Link>
            }
          />
          <div className="divide-y divide-border text-[12px]">
            {pendingRepairs.length === 0 ? <Empty text="No repair jobs in the queue." /> : null}
            {pendingRepairs.slice(0, 5).map((r) => {
              const cust = db.customers.find((c) => c.id === r.customerId);
              return (
                <div key={r.id} className="px-4 py-2.5 hover:bg-foreground/[0.03]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {r.device} · {cust?.name}
                    </span>
                    <Badge tone={r.status === "Ready" ? "success" : "warning"}>{r.status}</Badge>
                  </div>
                  <div className="num mt-1 text-[10.5px] text-muted-foreground">
                    {r.jobId} · {r.problem.slice(0, 38)} · {inr(r.estimate)}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHead title="Stock Snapshot" sub="Units currently on the shelf" />
          <div className="divide-y divide-border text-[12px]">
            {db.products.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                <span className="text-[10.5px] text-muted-foreground">{p.category}</span>
                <span className="num w-14 text-right">{stockOf(db, p.id)}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* UNIVERSAL INVOICE MODAL FOR RECENT SALES */}
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
