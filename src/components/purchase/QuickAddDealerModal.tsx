import { useState } from "react";
import { Button, Field, Input, Modal } from "../ui";
import { useStore } from "@/lib/store";
import type { Supplier } from "@/lib/types";

interface QuickAddDealerModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (dealer: Supplier) => void;
}

export function QuickAddDealerModal({
  open,
  onClose,
  onSuccess,
}: QuickAddDealerModalProps) {
  const { addSupplier } = useStore();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [gstin, setGstin] = useState("");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg("Dealer Name is required.");
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const trimmedGstin = gstin.trim().toUpperCase();
      const stateCode = trimmedGstin.length >= 2 && /^\d{2}/.test(trimmedGstin)
        ? trimmedGstin.substring(0, 2)
        : "23";

      const dealerPayload: Omit<Supplier, "id"> = {
        name: name.trim(),
        company: name.trim(),
        phone: mobile.trim() || "0000000000",
        address: address.trim() || "Local Market",
        city: "Harda",
        state: stateCode === "23" ? "Madhya Pradesh" : "Other State",
        stateCode,
      };
      if (mobile.trim()) dealerPayload.mobile = mobile.trim();
      if (trimmedGstin) dealerPayload.gstin = trimmedGstin;

      const created = addSupplier(dealerPayload);

      onSuccess(created);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to create dealer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="+ Add New Dealer">
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <Field label="Dealer Name *">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. ABC Mobile Distributors"
            className="h-9.5 text-[13px]"
            autoFocus
            required
          />
        </Field>

        <Field label="Mobile Number">
          <Input
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            placeholder="e.g. 9876543210"
            className="h-9.5 text-[13px]"
          />
        </Field>

        <Field label="GSTIN (Optional)">
          <Input
            value={gstin}
            onChange={(e) => setGstin(e.target.value.toUpperCase())}
            placeholder="e.g. 23AAAAA0000A1Z5"
            className="h-9.5 text-[13px] font-mono uppercase"
          />
        </Field>

        <Field label="Address (Optional)">
          <Input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. Station Road, Market Area"
            className="h-9.5 text-[13px]"
          />
        </Field>

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-[11px] text-muted-foreground">
            Auto-selected immediately upon saving.
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={saving || !name.trim()}>
              {saving ? "Saving..." : "Save & Select Dealer"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
