import { useState, useEffect } from "react";
import { Modal, Button, Input, Field } from "@/components/ui";
import { inr } from "@/lib/format";
import type { LineItem, Product } from "@/lib/types";
import { TrendingUp, AlertTriangle, Sparkles, RefreshCw, Check } from "lucide-react";

interface PriceAdjustModalProps {
  open: boolean;
  onClose: () => void;
  item: LineItem | null;
  product?: Product;
  onSave: (newPrice: number) => void;
}

export function PriceAdjustModal({
  open,
  onClose,
  item,
  product,
  onSave,
}: PriceAdjustModalProps) {
  const [priceStr, setPriceStr] = useState<string>("");

  useEffect(() => {
    if (item && open) {
      setPriceStr(String(item.price || 0));
    }
  }, [item, open]);

  if (!item) return null;

  const currentPrice = item.price;
  const costPrice = item.costPrice || 0;
  const originalCatalogPrice = product?.sellingPrice || currentPrice;
  const newPriceNum = Number(priceStr) || 0;

  const priceDiff = newPriceNum - currentPrice;
  const isIncrease = priceDiff > 0;
  const isBelowCost = newPriceNum < costPrice;

  const handleApplyIncrement = (inc: number) => {
    const updated = Math.max(0, (newPriceNum || currentPrice) + inc);
    setPriceStr(String(updated));
  };

  const handleReset = () => {
    setPriceStr(String(originalCatalogPrice));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPriceNum >= 0) {
      onSave(newPriceNum);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust Selling Price / Rate (दर बदलें / बढ़ाएं)"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Item Header & Info */}
        <div className="rounded-xl border border-border/80 bg-muted/20 p-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="font-bold text-[13px] text-foreground block">
                {item.name}
              </span>
              {item.imei && (
                <span className="text-[11px] font-mono text-muted-foreground block mt-0.5">
                  IMEI: {item.imei}
                </span>
              )}
            </div>
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0">
              Qty: {item.qty}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50 text-[11.5px]">
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Current Rate:</span>
              <span className="font-bold font-mono text-foreground">{inr(currentPrice)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Catalog MRP/Rate:</span>
              <span className="font-bold font-mono text-muted-foreground">{inr(originalCatalogPrice)}</span>
            </div>
            <div>
              <span className="text-muted-foreground block text-[10.5px]">Cost Price:</span>
              <span className="font-bold font-mono text-rose-600">{inr(costPrice)}</span>
            </div>
          </div>
        </div>

        {/* Quick Increment Buttons (+ Price Badhane Ke Shortcuts) */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
            <span>Quick Adjustments (+ जोड़ें)</span>
            {newPriceNum !== originalCatalogPrice && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[10.5px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw className="size-3" /> Reset to Original
              </button>
            )}
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {[100, 200, 500, 1000, 2000, 3000, 5000].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => handleApplyIncrement(inc)}
                className="py-1.5 px-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-800 font-mono font-bold text-[11.5px] transition-all cursor-pointer flex items-center justify-center gap-1 shadow-2xs active:scale-95"
              >
                <TrendingUp className="size-3 text-emerald-600" />
                <span>+{inc}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleApplyIncrement(-100)}
              className="py-1.5 px-2 rounded-lg border border-border/80 bg-background hover:bg-muted text-muted-foreground font-mono font-semibold text-[11.5px] transition-all cursor-pointer flex items-center justify-center"
            >
              -100
            </button>
          </div>
        </div>

        {/* New Selling Price Input */}
        <div className="space-y-2">
          <Field label="New Selling Price / Rate (₹) — नया विक्रय मूल्य">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono font-bold text-[14px]">
                ₹
              </span>
              <Input
                type="number"
                step="1"
                min="0"
                autoFocus
                value={priceStr}
                onChange={(e) => setPriceStr(e.target.value)}
                className="pl-7 pr-3 h-10 font-mono font-extrabold text-[16px] text-foreground border-primary/40 focus:border-primary shadow-xs"
                placeholder="Enter selling price"
              />
            </div>
          </Field>

          {/* Feedback Indicators */}
          {isIncrease && (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-2.5 flex items-center justify-between text-[12px] text-emerald-800">
              <div className="flex items-center gap-1.5 font-bold">
                <Sparkles className="size-4 text-emerald-600 shrink-0" />
                <span>Selling Price Increased</span>
              </div>
              <span className="font-mono font-extrabold text-[12.5px] text-emerald-700">
                +{inr(priceDiff)} Extra Profit
              </span>
            </div>
          )}

          {isBelowCost && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-2.5 flex items-start gap-2 text-[11.5px] text-amber-900">
              <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Rate is below purchase cost ({inr(costPrice)})</span>
                <span className="text-[10.5px] text-amber-800">
                  Manager PIN authorization will be requested when confirming.
                </span>
              </div>
            </div>
          )}
        </div>

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
            <span>Apply Selling Price ({inr(newPriceNum)})</span>
          </Button>
        </div>
      </form>
    </Modal>
  );
}
