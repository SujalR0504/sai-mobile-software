import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button, Card, Field, Input } from "@/components/ui";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Staff Login — Mobile Store ERP & POS" },
      { name: "description", content: "Fast counter login with PIN or employee credentials" },
    ],
  }),
  component: LoginPage,
});

type LoginMode = "pin" | "credentials";

export function LoginPage() {
  const { db } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState<LoginMode>("pin");
  const [pin, setPin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handlePinDigit = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      if (next.length === 4) {
        submitPinLogin(next);
      }
    }
  };

  const handlePinClear = () => {
    setPin("");
    setError("");
  };

  const handlePinBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setError("");
  };

  const submitPinLogin = async (pinValue: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pinValue }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect PIN. Try default: 1234");
        setPin("");
        setLoading(false);
        return;
      }
      localStorage.setItem("erp_user", JSON.stringify(data.user));
      navigate({ to: "/pos" });
    } catch {
      setError("Server connection error");
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid email or password");
        setLoading(false);
        return;
      }
      localStorage.setItem("erp_user", JSON.stringify(data.user));
      navigate({ to: data.user.role === "SALES" ? "/pos" : "/" });
    } catch {
      setError("Server connection error");
    } finally {
      setLoading(false);
    }
  };

  const selectDemoRole = (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setMode("credentials");
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-radial from-primary/5 via-background to-background">
      <div className="w-full max-w-md space-y-4">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <img
            src="/shri_sai_logo.png"
            alt={db.settings.shopName}
            className="inline-block size-16 rounded-2xl object-contain bg-black shadow-lg shadow-primary/25 border border-border/40 p-1"
          />
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {db.settings.shopName}
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest font-medium">
            POS & ERP · Branch 01
          </p>
        </div>

        {/* Login Box */}
        <Card className="p-6 glass-strong shadow-2xl border-border/80">
          {/* Mode Switcher Tabs */}
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-semibold mb-5">
            <button
              type="button"
              onClick={() => {
                setMode("pin");
                setError("");
              }}
              className={`rounded-md py-1.5 transition-all ${
                mode === "pin"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              ⚡ Quick PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("credentials");
                setError("");
              }}
              className={`rounded-md py-1.5 transition-all ${
                mode === "credentials"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              👤 Email / Password
            </button>
          </div>

          {error && (
            <div className="mb-4 rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-center text-xs font-semibold text-destructive animate-shake">
              ⚠ {error}
            </div>
          )}

          {mode === "pin" ? (
            <div className="space-y-4">
              <div className="text-center space-y-1">
                <div className="text-xs text-muted-foreground font-medium">
                  Enter 4-digit staff PIN (Default: <strong className="text-foreground">1234</strong>)
                </div>
                {/* 4 PIN Dots */}
                <div className="flex justify-center gap-3 py-2">
                  {[0, 1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`size-3.5 rounded-full border transition-all duration-200 ${
                        pin.length > idx
                          ? "bg-primary border-primary scale-110 shadow-sm shadow-primary"
                          : "border-border bg-muted/50"
                      }`}
                    />
                  ))}
                </div>
              </div>

              {/* Numpad */}
              <div className="grid grid-cols-3 gap-2 pt-1 max-w-[260px] mx-auto">
                {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={loading}
                    onClick={() => handlePinDigit(num)}
                    className="num size-16 rounded-xl border border-border bg-card/60 text-lg font-bold hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handlePinClear}
                  className="size-16 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handlePinDigit("0")}
                  className="num size-16 rounded-xl border border-border bg-card/60 text-lg font-bold hover:bg-primary/10 hover:border-primary/40 active:scale-95 transition-all"
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handlePinBackspace}
                  className="size-16 rounded-xl border border-border text-base text-muted-foreground hover:bg-muted active:scale-95 transition-all"
                >
                  ⌫
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleCredentialsSubmit} className="space-y-3.5">
              <Field label="Email / Mobile">
                <Input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@mobilestore.in"
                />
              </Field>

              <Field label="Password">
                <Input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>

              <Button type="submit" size="lg" className="w-full font-bold mt-2" disabled={loading}>
                {loading ? "Signing In..." : "Sign In to ERP"}
              </Button>
            </form>
          )}

          {/* Quick Demo Accounts */}
          <div className="mt-6 pt-4 border-t border-border">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5 text-center">
              Quick 1-Click Demo Logins
            </div>
            <div className="grid grid-cols-2 gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => selectDemoRole("admin@mobilestore.in", "admin123")}
                className="flex items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-all"
              >
                <span>👑</span>
                <div>
                  <div className="font-semibold text-[11px]">Owner / Admin</div>
                  <div className="text-[9.5px] text-muted-foreground">Full ERP Access</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectDemoRole("sales@mobilestore.in", "sales123")}
                className="flex items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-all"
              >
                <span>💼</span>
                <div>
                  <div className="font-semibold text-[11px]">Sales Counter</div>
                  <div className="text-[9.5px] text-muted-foreground">POS Billing Only</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectDemoRole("tech@mobilestore.in", "tech123")}
                className="flex items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-all"
              >
                <span>🔧</span>
                <div>
                  <div className="font-semibold text-[11px]">Technician</div>
                  <div className="text-[9.5px] text-muted-foreground">Repair Job Cards</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => selectDemoRole("accounts@mobilestore.in", "acc123")}
                className="flex items-center gap-1.5 p-2 rounded-lg border border-border hover:border-primary/40 hover:bg-primary/5 text-left transition-all"
              >
                <span>📊</span>
                <div>
                  <div className="font-semibold text-[11px]">Accountant</div>
                  <div className="text-[9.5px] text-muted-foreground">Ledgers & Cashbook</div>
                </div>
              </button>
            </div>
          </div>
        </Card>

        {/* Direct Back to POS link */}
        <div className="text-center text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate({ to: "/pos" })}
            className="hover:text-primary transition-colors underline underline-offset-4"
          >
            ← Skip directly to POS Counter
          </button>
        </div>
      </div>
    </div>
  );
}
