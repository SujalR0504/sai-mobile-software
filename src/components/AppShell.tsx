import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useStore, lowStockProducts } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Receipt,
  CreditCard,
  Calculator,
  Package,
  Boxes,
  ShoppingBag,
  RotateCcw,
  Users,
  Building2,
  Wrench,
  Wallet,
  ReceiptIndianRupee,
  BookOpen,
  UserCheck,
  ShieldCheck,
  MapPin,
  Banknote,
  BarChart3,
  Settings,
  Store,
  Plus,
  ArrowUpRight,
  Sparkles,
  ShoppingCart,
  FileText,
  FileSpreadsheet,
} from "lucide-react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/pos", label: "POS Billing", icon: Receipt },
  { to: "/orders", label: "Customer Orders", icon: ShoppingCart },
  { to: "/emi", label: "EMI Calculator", icon: Calculator },
  { to: "/products", label: "Products & Models", icon: Package },
  { to: "/stock", label: "Inventory & IMEI", icon: Boxes },
  { to: "/purchase", label: "Inward Purchase", icon: ShoppingBag },
  { to: "/returns", label: "Sales Returns", icon: RotateCcw },
  { to: "/credit-notes", label: "Credit Notes", icon: FileText },
  { to: "/debit-notes", label: "Debit Notes", icon: FileSpreadsheet },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/suppliers", label: "Dealers", icon: Building2 },
  { to: "/repairs", label: "Repair Service", icon: Wrench },
  { to: "/payments", label: "Payments", icon: Wallet },
  { to: "/expenses", label: "Expenses", icon: ReceiptIndianRupee },
  { to: "/cashbook", label: "Cashbook Ledger", icon: BookOpen },
  { to: "/employees", label: "Employees", icon: UserCheck },
  { to: "/permissions", label: "Permissions Matrix", icon: ShieldCheck },
  { to: "/attendance", label: "Attendance Tracking", icon: MapPin },
  { to: "/payroll", label: "Staff Payroll", icon: Banknote },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { db } = useStore();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));
  const pendingRepairs = (db.repairs || []).filter((r) => r.status !== "Delivered").length;
  const pendingOrders = (db.orders || []).filter(
    (o) => o.status !== "CANCELLED" && o.status !== "CONVERTED_TO_SALE",
  ).length;
  const lowStock = lowStockProducts(db).length;

  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  if (pathname === "/login") {
    return <main className="min-h-screen bg-background">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Desktop Sidebar */}
      <aside className="no-print sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/80 glass md:flex">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-border/60">
          <img
            src="/shri_sai_logo.png"
            alt={db.settings?.shopName || "Shri Sai Mobile"}
            className="size-10 rounded-xl object-contain bg-black shadow-md border border-border/40 p-0.5 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13.5px] font-bold tracking-tight text-foreground">
              {db.settings?.shopName || "Mobile Shop ERP"}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10.5px] font-medium text-emerald-600 tracking-wide uppercase">
                Active Terminal
              </span>
            </div>
          </div>
        </div>

        {/* Navigation List */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-3 space-y-0.5 text-[13px] font-medium">
          {NAV.map((n) => {
            const active = current?.to === n.to;
            const Icon = n.icon;
            const badge =
              n.to === "/repairs"
                ? pendingRepairs
                : n.to === "/stock"
                  ? lowStock
                  : n.to === "/orders"
                    ? pendingOrders
                    : 0;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 transition-all duration-150",
                  active
                    ? "bg-gradient-to-r from-primary/15 via-primary/10 to-transparent text-primary font-semibold shadow-[inset_3px_0_0_0_var(--color-primary)]"
                    : "text-slate-600 hover:bg-slate-100/70 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0 transition-transform group-hover:scale-110",
                    active ? "text-primary" : "text-slate-400 group-hover:text-slate-600",
                  )}
                />
                <span className="truncate">{n.label}</span>
                {badge > 0 ? (
                  <span
                    className={cn(
                      "num ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold shadow-xs",
                      n.to === "/stock"
                        ? "bg-rose-50 text-rose-600 border border-rose-200"
                        : n.to === "/orders"
                          ? "bg-indigo-50 text-indigo-700 border border-indigo-200"
                          : "bg-amber-50 text-amber-700 border border-amber-200",
                    )}
                  >
                    {badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* User / Terminal Footer */}
        <div className="border-t border-border/80 p-3 bg-foreground/[0.015]">
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl hover:bg-white/60 transition-colors">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-700 text-[11px] font-bold">
                {(db.settings?.ownerName || "AD").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[12px] font-semibold text-foreground">
                  {db.settings?.ownerName || "Store Owner"}
                </div>
                <div className="truncate text-[10.5px] text-muted-foreground">Admin · Counter 01</div>
              </div>
            </div>
            <Link
              to="/login"
              className="rounded-lg p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Switch User"
            >
              <ArrowUpRight className="size-4" />
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="min-w-0 flex-1 flex flex-col">
        {/* Top Header */}
        <header className="no-print sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-border/80 glass px-4 py-3 md:px-6">
          <div className="min-w-0 flex items-center gap-2.5">
            <img
              src="/shri_sai_logo.png"
              alt="Logo"
              className="size-8 rounded-lg object-contain bg-black border border-border/40 p-0.5 md:hidden shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[16px] font-bold tracking-tight text-foreground">
                  {current?.label ?? "Dashboard"}
                </span>
                <span className="hidden sm:inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                  Store 01
                </span>
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground mt-0.5">
                {today} · {db.settings?.shopName || "Mobile Shop"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/repairs"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-white/80 px-3.5 py-2 text-[12px] font-semibold text-slate-700 shadow-xs hover:bg-white active:scale-95 transition-all"
            >
              <Wrench className="size-3.5 text-amber-500" />
              <span>Service Job</span>
            </Link>
            <Link
              to="/pos"
              className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-primary to-indigo-600 px-4 py-2 text-[12.5px] font-semibold text-white shadow-sm hover:shadow-indigo-500/20 hover:shadow-md active:scale-95 transition-all"
            >
              <Plus className="size-4" />
              <span>New Sale</span>
              <kbd className="hidden lg:inline-block ml-1 rounded bg-white/20 px-1 py-0.2 text-[10px] font-mono">
                F1
              </kbd>
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Pills */}
        <nav className="no-print flex gap-1.5 overflow-x-auto border-b border-border/80 glass px-3 py-2 text-[12px] md:hidden">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = current?.to === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 rounded-lg px-2.5 py-1.5 font-semibold text-[11.5px] transition-colors",
                  active
                    ? "bg-primary text-white shadow-xs"
                    : "text-slate-600 hover:bg-slate-100",
                )}
              >
                <Icon className="size-3.5" />
                <span>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Page Content Viewport */}
        <div className="flex-1 space-y-5 p-4 md:p-6 max-w-7xl w-full mx-auto">{children}</div>
      </main>
    </div>
  );
}
