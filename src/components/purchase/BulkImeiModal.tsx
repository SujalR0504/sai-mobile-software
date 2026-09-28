import { useState } from "react";
import { Badge, Button, Modal } from "../ui";

interface BulkImeiModalProps {
  open: boolean;
  onClose: () => void;
  productName: string;
  requiredQty: number;
  currentImeis: string[];
  otherBillImeis?: string[];
  dbUnits?: Array<{ id: string; imei1: string; imei2?: string; status: string }>;
  onSave: (imeis: string[]) => void;
}

export function BulkImeiModal({
  open,
  onClose,
  productName,
  requiredQty,
  currentImeis,
  otherBillImeis = [],
  dbUnits = [],
  onSave,
}: BulkImeiModalProps) {
  const [text, setText] = useState(currentImeis.join("\n"));
  const [errorMsg, setErrorMsg] = useState("");

  if (!open) return null;

  const handleParseAndApply = () => {
    setErrorMsg("");
    // Split by newlines, commas, tabs, spaces
    const rawTokens = text
      .split(/[\r\n,;\t ]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (rawTokens.length === 0) {
      setErrorMsg("Please paste or type at least one IMEI number.");
      return;
    }

    // Validate format
    const invalidFormat = rawTokens.filter((t) => !/^\d{14,16}$/.test(t));
    if (invalidFormat.length > 0) {
      setErrorMsg(
        `Invalid IMEI format found: "${invalidFormat.slice(0, 3).join(", ")}"${
          invalidFormat.length > 3 ? ` and ${invalidFormat.length - 3} more` : ""
        }. Standard mobile IMEIs must contain 14 to 16 digits.`
      );
      return;
    }

    // Check duplicate in pasted list
    const seen = new Set<string>();
    const dupesInList = new Set<string>();
    for (const t of rawTokens) {
      if (seen.has(t)) {
        dupesInList.add(t);
      }
      seen.add(t);
    }
    if (dupesInList.size > 0) {
      setErrorMsg(`Duplicate IMEI found in input: ${Array.from(dupesInList).join(", ")}`);
      return;
    }

    // Check duplicate against other products in this bill
    const otherBillSet = new Set(otherBillImeis);
    const dupesInBill = rawTokens.filter((t) => otherBillSet.has(t));
    if (dupesInBill.length > 0) {
      setErrorMsg(`IMEI already used in this bill: ${dupesInBill.join(", ")}`);
      return;
    }

    // Check duplicate against existing inventory in db
    const existingInStock = rawTokens.filter((t) =>
      dbUnits.some((u) => u.imei1 === t || u.imei2 === t)
    );
    if (existingInStock.length > 0) {
      setErrorMsg(`IMEI already exists in inventory stock: ${existingInStock.join(", ")}`);
      return;
    }

    onSave(rawTokens);
    onClose();
  };

  const parsedCount = text
    .split(/[\r\n,;\t ]+/)
    .map((t) => t.trim())
    .filter(Boolean).length;

  return (
    <Modal open={open} onClose={onClose} title="Add Multiple IMEIs (Bulk Paste)" wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-border/80 bg-muted/20">
          <div>
            <div className="text-[13px] font-bold text-foreground">📱 {productName}</div>
            <div className="text-[11.5px] text-muted-foreground">
              Paste multiple 14–16 digit IMEI numbers below (one per line, comma, or space separated).
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] font-mono text-muted-foreground">
              Required: <strong>{requiredQty}</strong> | Entered: <strong>{parsedCount}</strong>
            </span>
            <Badge tone={parsedCount === requiredQty ? "success" : parsedCount > requiredQty ? "warning" : "neutral"}>
              {parsedCount === requiredQty
                ? "✓ Matches Qty"
                : parsedCount > requiredQty
                ? `+${parsedCount - requiredQty} Extra`
                : `${requiredQty - parsedCount} Remaining`}
            </Badge>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        <div>
          <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
            IMEI Numbers (One per line)
          </label>
          <textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setErrorMsg("");
            }}
            placeholder={`865778085253610\n865778085253611\n865778085253612\n...`}
            rows={8}
            className="w-full rounded-xl border border-border/90 bg-white/95 p-3 font-mono text-[12.5px] text-foreground outline-none focus:border-primary/60 focus:ring-4 focus:ring-primary/10 transition-all"
            autoFocus
          />
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="text-[11px] text-muted-foreground">
            Duplicate check against active store inventory is performed automatically.
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" variant="primary" onClick={handleParseAndApply}>
              Validate & Apply ({parsedCount} IMEIs)
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
