import { useState } from "react";
import { Modal, Button, Input, Field, Select } from "@/components/ui";
import { inr } from "@/lib/format";
import { Plus, Tag, ShieldCheck, Wrench, Truck, Sparkles, Check } from "lucide-react";

interface CustomAmountModalProps {
  open: boolean;
  onClose: () => void;
  onAdd: (customItem: { name: string; amount: number; gst: number }) => void;
  invoiceType?: "GST" | "NON_GST";
}

const PRESET_CHARGES = [
  { name: "Tempered Glass / Screen Guard", amount: 150, icon: "🛡️" },
  { name: "Mobile Back Cover / Case", amount: 250, icon: "📱" },
  { name: "Fast Charger / Data Cable", amount: 350, icon: "🔌" },
  { name: "Earphones / TWS Airbuds", amount: 499, icon: "🎧" },
  { name: "Service / Software Installation", amount: 300, icon: "🔧" },
  { name: "Mobile Repair Labor Charge", amount: 500, icon: "🛠️" },
  { name: "Express Courier / Delivery", amount: 100, icon: "🚚" },
  { name: "Extended Warranty Support", amount: 400, icon: "✨" },
];

export function CustomAmountModal({
  open,
  onClose,
  onAdd,
  invoiceType = "GST",
}: CustomAmountModalProps) {
  const [name, setName] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [gstRate, setGstRate] = useState<number>(invoiceType === "NON_GST" ? 0 : 18);

  const handleSelectPreset = (preset: { name: string; amount: number }) => {
    setName(preset.name);
    setAmountStr(String(preset.amount));
  };

  const handleQuickAddAmount = (add: number) => {
    const cur = Number(amountStr) || 0;
    setAmountStr(String(cur + add));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAmount = Number(amountStr) || 0;
    if (finalAmount <= 0) {
      alert("Please enter a valid amount greater than 0");
      return;
    }
    const finalName = name.trim() || "Custom Extra Amount";

    onAdd({
      name: finalName,
      amount: finalAmount,
      gst: invoiceType === "NON_GST" ? 0 : gstRate,
    });

    setName("");
    setAmountStr("");
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Custom Amount / Extra Charge (कस्टम राशि / चार्ज जोड़ें)"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Preset suggestions */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
            <Sparkles className="size-3 text-primary" />
            <span>Quick Presets (जल्दी से चुनें)</span>
          </label>
          <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto pr-1">
            {PRESET_CHARGES.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSelectPreset(p)}
                className="p-2 rounded-xl border border-border/80 bg-muted/15 hover:bg-primary/5 hover:border-primary/40 text-left transition-all cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-base">{p.icon}</span>
                  <span className="text-[11.5px] font-semibold text-foreground truncate group-hover:text-primary">
                    {p.name}
                  </span>
                </div>
                <span className="text-[11px] font-mono font-bold text-muted-foreground shrink-0 ml-1">
                  ₹{p.amount}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Name input */}
        <Field label="Description / Charge Name (चार्ज या आइटम का नाम)">
          <Input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tempered Glass, Service Fee, Extra Charge..."
            className="h-9 text-[13px]"
          />
        </Field>

        {/* Amount input & quick buttons */}
        <div className="space-y-1.5">
          <Field label="Amount (₹) — विक्रय राशि">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold text-[14px]">
                ₹
              </span>
              <Input
                type="number"
                step="1"
                min="1"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                placeholder="0"
                className="pl-7 pr-3 h-10 font-mono font-extrabold text-[16px] text-foreground border-primary/40"
              />
            </div>
          </Field>

          {/* Quick amount adder buttons */}
          <div className="flex flex-wrap gap-1 pt-0.5">
            {[50, 100, 200, 500, 1000].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleQuickAddAmount(num)}
                className="px-2 py-1 rounded-md border border-border bg-muted/30 hover:bg-muted font-mono font-semibold text-[11px] text-foreground cursor-pointer"
              >
                +{num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmountStr("")}
              className="px-2 py-1 rounded-md border border-border bg-background hover:bg-muted text-[11px] text-muted-foreground cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>

        {/* GST Selector */}
        {invoiceType === "GST" && (
          <Field label="GST Rate on this charge">
            <Select
              value={gstRate}
              onChange={(e) => setGstRate(Number(e.target.value))}
              className="h-8.5 text-[12px]"
            >
              <option value={0}>0% GST (Exempted)</option>
              <option value={5}>5% GST</option>
              <option value={12}>12% GST</option>
              <option value={18}>18% GST (Standard)</option>
              <option value={28}>28% GST</option>
            </Select>
          </Field>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/70">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            className="gap-1.5 font-bold shadow-xs cursor-pointer"
          >
            <Check className="size-3.5" />
            <span>Add to Bill ({inr(Number(amountStr) || 0)})</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
