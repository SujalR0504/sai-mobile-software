import type { ReactNode, SelectHTMLAttributes, InputHTMLAttributes, ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "glass rounded-2xl border border-border/80 shadow-[var(--shadow-card)] animate-in-soft transition-all duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHead({
  title,
  right,
  action,
  sub,
}: {
  title: string;
  sub?: string;
  right?: ReactNode;
  action?: ReactNode;
}) {
  const rightElement = right ?? action;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/70 px-5 py-3.5 bg-foreground/[0.015] rounded-t-2xl">
      <div>
        <div className="text-[14px] font-bold tracking-tight text-foreground">{title}</div>
        {sub ? <div className="text-[11.5px] text-muted-foreground mt-0.5">{sub}</div> : null}
      </div>
      {rightElement}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info";

const toneMap: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border border-slate-200/80",
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200/80",
  warning: "bg-amber-50 text-amber-700 border border-amber-200/80",
  danger: "bg-rose-50 text-rose-700 border border-rose-200/80",
  info: "bg-indigo-50 text-indigo-700 border border-indigo-200/80",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold tracking-wide whitespace-nowrap shadow-[0_1px_2px_rgba(0,0,0,0.02)]",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
  delay = 0,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  delay?: number;
}) {
  const valueTone =
    tone === "success"
      ? "text-emerald-600"
      : tone === "danger"
        ? "text-rose-600"
        : tone === "warning"
          ? "text-amber-600"
          : tone === "info"
            ? "text-indigo-600"
            : "text-foreground";
  return (
    <div
      className="glass animate-in-soft rounded-2xl border border-border/80 p-5 shadow-[var(--shadow-card)] hover:border-primary/30 transition-all duration-200"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="text-[11.5px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className={cn("num mt-2 text-2xl font-bold tracking-tight", valueTone)}>{value}</div>
      {hint ? <div className="mt-1.5 text-[11.5px] text-muted-foreground font-medium">{hint}</div> : null}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold transition-all duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none";

const variants = {
  primary: "bg-gradient-to-r from-primary to-indigo-600 text-white shadow-sm hover:from-primary/90 hover:to-indigo-600/90 hover:shadow-indigo-500/20 hover:shadow-md",
  ghost: "border border-border/90 bg-white/90 text-foreground hover:bg-slate-50 shadow-sm",
  soft: "bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20",
  danger: "bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/80",
  success: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-sm hover:from-emerald-500 hover:to-teal-500 hover:shadow-md",
  outline: "border border-border/90 bg-transparent text-foreground hover:bg-muted/40 shadow-xs",
} as const;

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: "sm" | "md" | "lg";
}) {
  const sizes = {
    sm: "h-7.5 px-3 text-[11.5px]",
    md: "h-9.5 px-4",
    lg: "h-12 px-6 text-[14px]",
  };
  return <button className={cn(btnBase, variants[variant], sizes[size], className)} {...props} />;
}

const fieldCls =
  "h-9.5 w-full rounded-xl border border-border/90 bg-white/95 px-3 text-[13px] text-foreground outline-none shadow-[inset_0_1px_2px_rgba(0,0,0,0.02)] placeholder:text-muted-foreground/60 focus:border-primary/60 focus:ring-4 focus:ring-primary/10 transition-all";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldCls, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(fieldCls, "pr-3 cursor-pointer", className)} {...props}>
      {children}
    </select>
  );
}

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-[11px] font-semibold text-foreground/80 tracking-wide">{label}</span>
      {children}
    </label>
  );
}

export function Table({
  head,
  headers,
  children,
}: {
  head?: string[];
  headers?: string[];
  children: ReactNode;
}) {
  const colHeaders = head || headers || [];
  return (
    <div className="overflow-x-auto rounded-xl -mx-1 sm:mx-0">
      <table className="w-full min-w-full text-[12px] sm:text-[13px]">
        <thead>
          <tr className="border-b border-border/80 bg-foreground/[0.02] text-left text-[10.5px] sm:text-[11px] tracking-[0.06em] text-muted-foreground uppercase font-semibold">
            {colHeaders.map((h) => (
              <th
                key={h}
                className={cn(
                  "px-3 sm:px-4 py-2.5 sm:py-3 font-semibold whitespace-nowrap",
                  h.startsWith(">") && "text-right",
                )}
              >
                {h.replace(/^>/, "")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">{children}</tbody>
      </table>
    </div>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={cn("hover:bg-primary/[0.035] transition-colors", onClick && "cursor-pointer")}
    >
      {children}
    </tr>
  );
}

export function Td({
  children,
  className,
  right,
  mono,
}: {
  children: ReactNode;
  className?: string;
  right?: boolean;
  mono?: boolean;
}) {
  return (
    <td
      className={cn("px-3 sm:px-4 py-2.5 sm:py-3.5 align-middle", right && "text-right", mono && "num", className)}
    >
      {children}
    </td>
  );
}

export function Empty({
  text,
  message,
  title,
  icon,
}: {
  text?: string;
  message?: string;
  title?: string;
  icon?: ReactNode;
}) {
  const label = text || message || title || "No data available";
  return (
    <div className="px-4 py-12 text-center text-[13px] text-muted-foreground font-medium">
      <div className="mx-auto mb-2 text-2xl opacity-40">{icon || "📭"}</div>
      {label}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/40 p-2 sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className={cn(
          "bg-white/95 my-3 sm:my-6 w-full rounded-2xl border border-white/80 shadow-2xl shadow-slate-900/20 animate-in-soft overflow-hidden transition-all",
          wide ? "max-w-[96vw] md:max-w-3xl lg:max-w-4xl" : "max-w-[96vw] sm:max-w-lg",
        )}
      >
        <div className="flex items-center justify-between border-b border-border/80 px-4 sm:px-5 py-3 sm:py-4 bg-slate-50/50">
          <div className="text-[13px] sm:text-[14px] font-bold tracking-tight text-foreground">{title}</div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-slate-200/60 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="p-3.5 sm:p-5 max-h-[85vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function PageHead({
  title,
  sub,
  actions,
}: {
  title: string;
  sub?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-1">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
        {sub ? <p className="text-[12.5px] text-muted-foreground mt-0.5">{sub}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
