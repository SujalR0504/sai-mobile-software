import React, { useState } from "react";
import { Modal, Button, Input } from "@/components/ui";
import { inr } from "@/lib/format";
import type { Sale } from "@/lib/types";
import { salesApi } from "@/services/api/salesApi";

export interface CancelSaleBillModalProps {
  open: boolean;
  onClose: () => void;
  sale: Sale | null;
  customerName?: string;
  onSuccess?: () => void;
}

export const CancelSaleBillModal: React.FC<CancelSaleBillModalProps> = ({
  open,
  onClose,
  sale,
  customerName,
  onSuccess,
}) => {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!open || !sale) return null;

  const handleConfirm = async () => {
    if (!reason.trim()) {
      setErrorMessage("Please enter a mandatory reason for cancelling this bill.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      let currentUser: any = null;
      try {
        const raw = localStorage.getItem("erp_user");
        if (raw) currentUser = JSON.parse(raw);
      } catch {}

      const userName = currentUser?.name || currentUser?.username || "Admin";
      const employeeId = currentUser?.employeeId || currentUser?.id;
      const role = currentUser?.role?.toUpperCase() || "ADMIN";

      const res = await salesApi.cancelSale(sale.id, reason.trim(), userName, employeeId, role);

      if (res && res.success) {
        setReason("");
        onClose();
        if (onSuccess) onSuccess();
      } else {
        setErrorMessage(res?.message || "Failed to cancel bill.");
      }
    } catch (err: any) {
      console.error("Cancel sale error:", err);
      const msg = err?.message || err?.error || "Error cancelling sale bill.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) {
          setReason("");
          setErrorMessage(null);
          onClose();
        }
      }}
      title="Delete / Cancel Sale Bill?"
    >
      <div className="space-y-4 text-xs">
        {/* Bill Details Summary Card */}
        <div className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
          <div className="flex justify-between items-center text-[13px]">
            <span className="font-semibold text-muted-foreground">Invoice No:</span>
            <span className="font-mono font-bold text-primary">{sale.invoiceNo}</span>
          </div>
          <div className="flex justify-between items-center text-[13px]">
            <span className="font-semibold text-muted-foreground">Customer:</span>
            <span className="font-bold text-foreground">{customerName || "Customer"}</span>
          </div>
          <div className="flex justify-between items-center text-[13px]">
            <span className="font-semibold text-muted-foreground">Amount:</span>
            <span className="font-mono font-extrabold text-foreground">{inr(sale.total)}</span>
          </div>
        </div>

        {/* Reversal Impact Warning */}
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 space-y-2">
          <div className="font-bold text-destructive text-[12px] flex items-center gap-1.5">
            <span>⚠️</span> Deleting this bill will reverse:
          </div>
          <ul className="list-disc list-inside space-y-0.5 text-muted-foreground text-[11.5px] leading-relaxed">
            <li><strong className="text-foreground">Sale transaction</strong> (status set to CANCELLED)</li>
            <li><strong className="text-foreground">Stock movement</strong> (quantity restored back to stock)</li>
            <li><strong className="text-foreground">IMEI status</strong> (reverted to IN_STOCK)</li>
            <li><strong className="text-foreground">Customer ledger</strong> (full sale reversed, zero dangling due)</li>
            <li><strong className="text-foreground">Payment transactions</strong> (reversal recorded, balance updated)</li>
            <li><strong className="text-foreground">Account balance</strong> (deducted from cash/bank/UPI)</li>
            {sale.isEmi && <li><strong className="text-foreground">EMI record</strong> (receivable cancelled)</li>}
          </ul>
          <p className="text-[11px] font-semibold text-destructive pt-1">
            This action cannot be undone directly.
          </p>
        </div>

        {/* Mandatory Reason Input */}
        <div className="space-y-1.5">
          <label className="font-bold text-foreground text-[12px] block">
            Reason for Cancellation <span className="text-destructive">*</span>
          </label>
          <Input
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            placeholder="e.g. Customer returned items, wrong billing entered..."
            className="w-full text-xs"
            disabled={loading}
            autoFocus
          />
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/15 p-2.5 text-destructive font-semibold text-[11.5px]">
            {errorMessage}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setReason("");
              setErrorMessage(null);
              onClose();
            }}
            disabled={loading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={loading || !reason.trim()}
            className="text-xs font-bold gap-1.5 shadow-sm"
          >
            {loading ? "Cancelling Bill..." : "Confirm Delete / Cancel Bill"}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
