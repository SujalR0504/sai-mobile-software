import { useState } from "react";
import { Button, Field, Input, Modal } from "./ui";

interface AdminPinModalProps {
  open: boolean;
  onClose: () => void;
  action: string;
  reasonPrompt?: string;
  onAuthorized: (pin: string, reason: string) => void;
}

export function AdminPinModal({
  open,
  onClose,
  action,
  reasonPrompt = "Reason for privileged authorization *",
  onAuthorized,
}: AdminPinModalProps) {
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || !reason) return;
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin,
          action,
          reason,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Incorrect Admin PIN");
        setLoading(false);
        return;
      }

      onAuthorized(pin, reason);
      setPin("");
      setReason("");
      onClose();
    } catch {
      setError("Authorization server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Admin Authorization Required">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive">
          <strong>Restricted Operation: {action.replace(/_/g, " ")}</strong>
          <p className="mt-0.5 text-muted-foreground">
            This action modifies audited financial or inventory balances and requires an authorized Admin PIN.
          </p>
        </div>

        {error && (
          <div className="text-[12px] font-semibold text-destructive">
            ⚠ {error}
          </div>
        )}

        <Field label="Admin PIN / Password *">
          <Input
            type="password"
            autoFocus
            maxLength={12}
            required
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter 4-digit PIN"
            className="tracking-widest font-mono text-center text-lg"
          />
        </Field>

        <Field label={reasonPrompt}>
          <Input
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Customer requested discount approval"
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" disabled={loading || !pin || !reason}>
            {loading ? "Verifying..." : "Authorize Action"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
