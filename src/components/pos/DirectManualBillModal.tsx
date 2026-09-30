import { useState, useRef, useEffect, useCallback } from "react";
import { Modal, Button, Input, Field, Badge } from "@/components/ui";
import { inr } from "@/lib/format";
import type { LineItem } from "@/lib/types";
import {
  Zap,
  Plus,
  Scan,
  Camera,
  CameraOff,
  Check,
  Smartphone,
  ShieldCheck,
  Tag,
  Sparkles,
  Barcode,
  Wrench,
  Package,
  Loader2,
  FileText,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { captureAndExtractImeis } from "@/lib/imeiOcrClient";

export interface DirectManualBillModalProps {
  open: boolean;
  onClose: () => void;
  onAddManualItem: (item: LineItem) => void;
  invoiceType?: "GST" | "NON_GST";
  initialItemName?: string;
  initialPrice?: number;
  initialGst?: number;
}

const QUICK_PRESETS = [
  { name: "Unlisted / Second-Hand Mobile", category: "Mobile Phones", price: 6500, gst: 18, isPhone: true, icon: "📱" },
  { name: "Tempered Glass / Screen Guard", category: "Tempered Glass", price: 150, gst: 18, isPhone: false, icon: "🛡️" },
  { name: "Fast Charger (33W/65W)", category: "Chargers", price: 499, gst: 18, isPhone: false, icon: "🔌" },
  { name: "Braided Type-C Fast Cable", category: "Cables", price: 199, gst: 18, isPhone: false, icon: "⚡" },
  { name: "Mobile Silicon / Matte Cover", category: "Covers", price: 200, gst: 18, isPhone: false, icon: "📱" },
  { name: "Bluetooth TWS / Earbuds", category: "Earphones", price: 799, gst: 18, isPhone: false, icon: "🎧" },
  { name: "Display Combo Replacement", category: "Other Accessories", price: 1800, gst: 18, isPhone: false, icon: "🛠️" },
  { name: "Mobile Battery Replacement", category: "Other Accessories", price: 850, gst: 18, isPhone: false, icon: "🔋" },
];

export function DirectManualBillModal({
  open,
  onClose,
  onAddManualItem,
  invoiceType = "GST",
  initialItemName = "",
  initialPrice,
  initialGst,
}: DirectManualBillModalProps) {
  const [name, setName] = useState(initialItemName);
  const [category, setCategory] = useState("Other Accessories");
  const [qty, setQty] = useState(1);
  const [priceStr, setPriceStr] = useState(initialPrice ? String(initialPrice) : "");
  const [costPriceStr, setCostPriceStr] = useState("");
  const [gstRate, setGstRate] = useState<number>(
    invoiceType === "NON_GST" ? 0 : (initialGst !== undefined ? initialGst : 18)
  );
  const [imei, setImei] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState<number>(0);
  const [hsnSac, setHsnSac] = useState("");

  // Camera scanner states for IMEI
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isOcrReading, setIsOcrReading] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5QrRef = useRef<Html5Qrcode | null>(null);
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  const ocrBusyRef = useRef<boolean>(false);

  useEffect(() => {
    if (open) {
      setName(initialItemName || "");
      setPriceStr(initialPrice ? String(initialPrice) : "");
      setCostPriceStr("");
      setQty(1);
      setImei("");
      setGstRate(invoiceType === "NON_GST" ? 0 : (initialGst !== undefined ? initialGst : 18));
      setWarrantyMonths(0);
      setHsnSac("");
      setScannerOpen(false);
      setIsOcrReading(false);
      setTimeout(() => nameInputRef.current?.focus(), 80);
    } else {
      stopCamera();
    }
  }, [open, initialItemName, initialPrice, initialGst, invoiceType]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (html5QrRef.current) {
      try {
        html5QrRef.current.stop().catch(() => {});
        html5QrRef.current.clear();
      } catch {}
      html5QrRef.current = null;
    }
  }, []);

  const handleSnapOcr = async () => {
    if (!videoRef.current || ocrBusyRef.current) return;
    ocrBusyRef.current = true;
    setIsOcrReading(true);

    try {
      const res = await captureAndExtractImeis(videoRef.current, { cropToCenter: true, maxWidth: 1000 });
      if (res.success && res.imeis.length > 0) {
        setImei(res.imeis[0]);
        setScannerOpen(false);
        playBeep();
      } else {
        setCameraError("Could not read sticker numbers. Please align the phone box sticker within frame.");
        setTimeout(() => setCameraError(null), 3000);
      }
    } catch {
      setCameraError("Sticker OCR recognition failed. Please try again.");
      setTimeout(() => setCameraError(null), 3000);
    } finally {
      setIsOcrReading(false);
      ocrBusyRef.current = false;
    }
  };

  // Camera scanner effect
  useEffect(() => {
    if (!scannerOpen || !open) {
      stopCamera();
      return;
    }

    let isSubscribed = true;
    let ocrInterval: any = null;
    let barcodeInterval: any = null;

    const startCamera = async () => {
      stopCamera();
      setCameraError(null);

      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Camera is not supported or not secure (HTTPS required).");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        });

        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play().catch(() => {});
        }

        // ENGINE 1: Continuous Sticker Text OCR Loop (every 1400ms)
        ocrInterval = setInterval(async () => {
          if (
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            !ocrBusyRef.current &&
            isSubscribed
          ) {
            ocrBusyRef.current = true;
            try {
              const res = await captureAndExtractImeis(videoRef.current, { cropToCenter: true, maxWidth: 900 });
              if (res.success && res.imeis.length > 0 && isSubscribed) {
                setImei(res.imeis[0]);
                setScannerOpen(false);
                playBeep();
              }
            } catch {
            } finally {
              ocrBusyRef.current = false;
            }
          }
        }, 1400);

        // ENGINE 2: Barcode fallback (14-16 digits only)
        if ("BarcodeDetector" in window) {
          try {
            // @ts-ignore
            const detector = new BarcodeDetector({
              formats: ["code_128", "code_39", "qr_code", "data_matrix"],
            });
            barcodeInterval = setInterval(async () => {
              if (videoRef.current && videoRef.current.readyState >= 2 && isSubscribed) {
                try {
                  const codes = await detector.detect(videoRef.current);
                  if (codes && codes.length > 0) {
                    const val = codes[0].rawValue?.trim();
                    if (val && /^\d{14,16}$/.test(val)) {
                      setImei(val);
                      setScannerOpen(false);
                      playBeep();
                    }
                  }
                } catch {}
              }
            }, 300);
          } catch {}
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        setCameraError("Camera unavailable or permission denied.");
      }
    };

    startCamera();

    return () => {
      isSubscribed = false;
      if (ocrInterval) clearInterval(ocrInterval);
      if (barcodeInterval) clearInterval(barcodeInterval);
      stopCamera();
    };
  }, [scannerOpen, open, stopCamera]);

  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch {}
  };

  const handleApplyPreset = (p: typeof QUICK_PRESETS[0]) => {
    setName(p.name);
    setCategory(p.category);
    setPriceStr(String(p.price));
    setGstRate(invoiceType === "NON_GST" ? 0 : p.gst);
  };

  const handleBuildItem = (): LineItem | null => {
    const finalPrice = Number(priceStr);
    if (!name.trim()) {
      alert("Please enter item name (आइटम का नाम डालें)");
      return null;
    }
    if (isNaN(finalPrice) || finalPrice <= 0) {
      alert("Please enter a valid selling price greater than 0");
      return null;
    }

    const uniqueId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const cost = Number(costPriceStr) || 0;

    const item: LineItem = {
      productId: uniqueId,
      name: name.trim(),
      qty: Math.max(1, qty),
      price: finalPrice,
      gst: invoiceType === "NON_GST" ? 0 : gstRate,
      costPrice: cost,
      warrantyMonths: warrantyMonths || undefined,
      isManual: true,
      bypassStock: true,
      category,
      hsnSac: hsnSac.trim() || undefined,
      imei: imei.trim() || undefined,
    };

    return item;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const item = handleBuildItem();
    if (!item) return;

    onAddManualItem(item);
    playBeep();
    onClose();
  };

  const handleAddAndAnother = (e: React.FormEvent) => {
    e.preventDefault();
    const item = handleBuildItem();
    if (!item) return;

    onAddManualItem(item);
    playBeep();

    // Reset fields for the next item
    setName("");
    setPriceStr("");
    setCostPriceStr("");
    setImei("");
    setQty(1);
    setHsnSac("");
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const subtotalPreview = (Number(priceStr) || 0) * (Number(qty) || 1);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="⚡ Direct Bill / Manual Item (डायरेक्ट मैनुअल बिल)"
      wide
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Info banner */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Direct Bill Mode:</strong> Add any product, service, or uncatalogued stock directly to the bill without prior inventory entry.
            </span>
          </div>
          <Badge tone="warning" className="shrink-0 text-[10px]">
            No Stock Required
          </Badge>
        </div>

        {/* Quick Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-primary" />
              Quick Presets (जल्दी से चुनें)
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 max-h-24 overflow-y-auto pr-1">
            {QUICK_PRESETS.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className="p-1.5 rounded-lg border border-border/80 bg-muted/20 hover:bg-primary/10 hover:border-primary/40 text-left transition-all cursor-pointer flex items-center justify-between group text-[11px]"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <span>{p.icon}</span>
                  <span className="font-medium text-foreground truncate group-hover:text-primary">
                    {p.name}
                  </span>
                </div>
                <span className="font-mono font-bold text-muted-foreground text-[10.5px] ml-1 shrink-0">
                  ₹{p.price}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Item Details Form */}
        <div className="space-y-3 p-3.5 rounded-xl border border-border/80 bg-muted/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Field label="Item Name / Description (आइटम का नाम) *">
                <Input
                  ref={nameInputRef}
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Vivo V29 Display, Tempered Glass, Fast Charger, Used Phone..."
                  className="h-9.5 text-xs font-medium"
                />
              </Field>
            </div>

            <div>
              <Field label="Category (कैटेगरी)">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full h-9.5 rounded-md border border-border bg-[var(--surface-glass-strong)] px-2.5 text-xs font-medium text-foreground outline-none focus:border-primary"
                >
                  <option value="Mobile Phones">Mobile Phones</option>
                  <option value="Tablets">Tablets</option>
                  <option value="Chargers">Chargers</option>
                  <option value="Cables">Cables</option>
                  <option value="Earphones">Earphones / TWS</option>
                  <option value="Covers">Covers & Cases</option>
                  <option value="Tempered Glass">Tempered Glass</option>
                  <option value="Smart Watches">Smart Watches</option>
                  <option value="Repair Parts">Repair / Service Part</option>
                  <option value="Other Accessories">Other Accessories</option>
                </select>
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Field label="Quantity (संख्या) *">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={qty}
                  onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
                  className="h-9.5 text-xs font-mono font-bold"
                />
              </Field>
            </div>

            <div>
              <Field label="Selling Price (₹ प्रति दर) *">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={priceStr}
                  onChange={(e) => setPriceStr(e.target.value)}
                  placeholder="₹ 0"
                  className="h-9.5 text-xs font-mono font-bold text-primary"
                />
              </Field>
            </div>

            <div>
              <Field label="Purchase / Cost Price (₹ - Optional)">
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={costPriceStr}
                  onChange={(e) => setCostPriceStr(e.target.value)}
                  placeholder="₹ Cost"
                  className="h-9.5 text-xs font-mono"
                  title="Used to track profit margin. Defaults to ₹0."
                />
              </Field>
            </div>

            <div>
              <Field label="GST Rate (%)">
                <select
                  value={invoiceType === "NON_GST" ? 0 : gstRate}
                  disabled={invoiceType === "NON_GST"}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="w-full h-9.5 rounded-md border border-border bg-[var(--surface-glass-strong)] px-2.5 text-xs font-medium text-foreground outline-none focus:border-primary disabled:opacity-50"
                >
                  <option value={0}>0% (Non-GST / Exempt)</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST (Standard)</option>
                  <option value={28}>28% GST</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Optional IMEI / Serial & Warranty */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-border/40">
            <div className="md:col-span-2">
              <Field label="IMEI / Serial Number (वैकल्पिक)">
                <div className="flex gap-2">
                  <Input
                    value={imei}
                    onChange={(e) => setImei(e.target.value)}
                    placeholder="Scan or type 15-digit IMEI / Serial (Optional)..."
                    className="h-9 font-mono text-xs flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant={scannerOpen ? "danger" : "outline"}
                    onClick={() => setScannerOpen(!scannerOpen)}
                    className="h-9 text-xs gap-1 px-3 shrink-0"
                  >
                    {scannerOpen ? (
                      <>
                        <CameraOff className="w-3.5 h-3.5" />
                        Close Camera
                      </>
                    ) : (
                      <>
                        <Scan className="w-3.5 h-3.5 text-primary" />
                        Scan IMEI
                      </>
                    )}
                  </Button>
                </div>
              </Field>
            </div>

            <div>
              <Field label="Warranty (वारंटी)">
                <select
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                  className="w-full h-9 rounded-md border border-border bg-[var(--surface-glass-strong)] px-2 text-xs font-medium text-foreground outline-none focus:border-primary"
                >
                  <option value={0}>No Warranty</option>
                  <option value={1}>1 Month Warranty</option>
                  <option value={3}>3 Months Warranty</option>
                  <option value={6}>6 Months Warranty</option>
                  <option value={12}>1 Year Warranty</option>
                </select>
              </Field>
            </div>
          </div>

          {/* Live Camera Scanner Viewport if toggled */}
          {scannerOpen && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-white animate-in fade-in duration-150">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span className="flex items-center gap-1.5 font-semibold text-emerald-400">
                  <FileText className="w-3.5 h-3.5" />
                  Reads Sticker Text &quot;IMEI1 / IMEI2&quot;
                </span>

                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={handleSnapOcr}
                  disabled={isOcrReading}
                  className="h-6.5 text-[11px] bg-emerald-600 hover:bg-emerald-500 text-white border-none gap-1 font-bold"
                >
                  {isOcrReading ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Reading...
                    </>
                  ) : (
                    <>
                      <Camera className="w-3 h-3" />
                      📸 Snap Sticker Text
                    </>
                  )}
                </Button>
              </div>

              <div className="relative aspect-video max-h-[160px] w-full overflow-hidden rounded-lg bg-black flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" autoPlay playsInline muted />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="w-64 h-24 border-2 border-emerald-400 rounded-lg flex flex-col justify-between p-1.5 shadow-[0_0_15px_rgba(52,211,153,0.35)]">
                    <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse my-auto" />
                    <div className="text-[10px] font-mono text-emerald-300 font-bold text-center bg-black/75 rounded px-1">
                      ALIGN &quot;IMEI1: 86799...&quot; TEXT HERE
                    </div>
                  </div>
                </div>
              </div>
              {cameraError && (
                <div className="text-xs text-rose-400 text-center">{cameraError}</div>
              )}
            </div>
          )}
        </div>

        {/* Live Bill Total Preview */}
        <div className="p-3 rounded-xl border border-border/80 bg-muted/20 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            Item Total: <strong>{qty} × {inr(Number(priceStr) || 0)}</strong>
            {invoiceType === "GST" && gstRate > 0 && (
              <span className="ml-2 font-mono text-[11px] text-primary">
                (incl. {gstRate}% GST)
              </span>
            )}
          </div>
          <div className="text-right">
            <span className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider mr-2">
              Item Amount:
            </span>
            <span className="font-mono font-bold text-[16px] text-foreground">
              {inr(subtotalPreview)}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleAddAndAnother}
              className="text-xs gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              + Add &amp; Add Another
            </Button>
            <Button type="submit" variant="primary" className="text-xs gap-1.5 font-semibold">
              <Zap className="w-3.5 h-3.5" />
              ⚡ Add to Bill ({inr(subtotalPreview)})
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
