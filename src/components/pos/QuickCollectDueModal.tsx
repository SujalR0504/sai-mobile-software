import { useState, useMemo } from "react";
import { Button, Field, Input, Modal, Select } from "../ui";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import type { Customer, PaymentMode } from "@/lib/types";

interface QuickCollectDueModalProps {
  open: boolean;
  onClose: () => void;
  customer: Customer | null;
  outstandingDue: number;
  onSuccess?: () => void;
}

export function QuickCollectDueModal({
  open,
  onClose,
  customer,
  outstandingDue,
  onSuccess,
}: QuickCollectDueModalProps) {
  const { db, recordCustomerPayment } = useStore();

  const [amount, setAmount] = useState<number>(outstandingDue || 0);
  const [mode, setMode] = useState<PaymentMode>("Cash");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [referenceNo, setReferenceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const paymentAccounts = useMemo(() => db.paymentAccounts || [], [db.paymentAccounts]);
  const cashAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "CASH" && a.status === "ACTIVE"), [paymentAccounts]);
  const upiAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "UPI" && a.status === "ACTIVE"), [paymentAccounts]);
  const bankAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "BANK" && a.status === "ACTIVE"), [paymentAccounts]);

  const availableAccounts = useMemo(() => {
    if (mode === "Cash") return cashAccounts;
    if (mode === "UPI") return upiAccounts;
    if (mode === "Bank") return bankAccounts;
    return [];
  }, [mode, cashAccounts, upiAccounts, bankAccounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer) return;
    if (amount <= 0) {
      setErrorMsg("Payment amount must be greater than zero.");
      return;
    }

    try {
      setSaving(true);
      setErrorMsg("");

      await recordCustomerPayment({
        customerId: customer.id,
        amount,
        paymentMethod: mode,
        paymentAccountId: selectedAccountId || undefined,
        referenceNo: referenceNo.trim() || undefined,
        notes: notes.trim() || `POS Quick Due Collection - ${mode}`,
      });

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to record customer payment");
    } finally {
      setSaving(false);
    }
  };

  if (!customer) return null;

  return (
    <Modal open={open} onClose={onClose} title="Collect Customer Due">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium animate-in-soft">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Customer & Due Banner */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3.5 flex items-center justify-between text-[12.5px]">
          <div>
            <span className="font-bold text-foreground block text-[13px]">{customer.name}</span>
            <span className="text-muted-foreground text-[11px] font-mono">{customer.phone}</span>
          </div>
          <div className="text-right">
            <span className="text-[10.5px] text-muted-foreground uppercase font-bold tracking-wider block">
              Outstanding Due
            </span>
            <span className="text-[16px] font-bold text-destructive font-mono">{inr(outstandingDue)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount Received (₹) *">
            <Input
              type="number"
              step="1"
              min="1"
              max={outstandingDue}
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
              required
              className="h-10 text-[14px] font-mono font-bold"
            />
          </Field>

          <Field label="Payment Mode *">
            <Select
              value={mode}
              onChange={(e) => {
                const newMode = e.target.value as PaymentMode;
                setMode(newMode);
                if (newMode === "Cash") setSelectedAccountId(cashAccounts[0]?.id || "");
                else if (newMode === "UPI") setSelectedAccountId(upiAccounts[0]?.id || "");
                else if (newMode === "Bank") setSelectedAccountId(bankAccounts[0]?.id || "");
              }}
              className="h-10 text-[13px] font-medium"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Bank">Bank Transfer / NEFT</option>
            </Select>
          </Field>
        </div>

        {availableAccounts.length > 0 && (
          <Field label={`Deposit into ${mode} Account`}>
            <Select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="h-9.5 text-[12.5px]"
            >
              <option value="">Default Account</option>
              {availableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.accountName} {a.isDefault ? "(Default)" : ""} · Bal: {inr(a.currentBalance || 0)}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Reference / Txn No (Optional)">
          <Input
            placeholder="e.g. UPI Ref / Cash Receipt"
            value={referenceNo}
            onChange={(e) => setReferenceNo(e.target.value)}
            className="h-9 text-[12.5px]"
          />
        </Field>

        <Field label="Notes / Remarks">
          <Input
            placeholder="e.g. Counter payment received"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-9 text-[12.5px]"
          />
        </Field>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>

          <Button type="submit" variant="primary" disabled={saving || amount <= 0} className="font-bold">
            {saving ? "Saving..." : `Confirm Payment ${inr(amount)}`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
