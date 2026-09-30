import { useEffect, useRef, useState, useCallback } from "react";
import { Badge, Button, Field, Input, Modal } from "@/components/ui";
import { inr } from "@/lib/format";
import type { Product, Unit } from "@/lib/types";
import {
  Camera,
  CameraOff,
  Barcode,
  Scan,
  Trash2,
  Copy,
  Check,
  AlertCircle,
  Plus,
  Smartphone,
  RefreshCw,
  Sparkles,
  FileText,
  Loader2,
} from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { captureAndExtractImeis } from "@/lib/imeiOcrClient";

export interface ProductImeiModalProps {
  open: boolean;
  onClose: () => void;
  product: Product | null;
  existingUnits?: Unit[];
  currentStock?: number;
  onAddUnits: (
    productId: string,
    rows: Array<{ imei1: string; purchasePrice: number }>
  ) => void;
  onSuccess?: (addedCount: number) => void;
}

export function ProductImeiModal({
  open,
  onClose,
  product,
  existingUnits = [],
  currentStock = 0,
  onAddUnits,
  onSuccess,
}: ProductImeiModalProps) {
  const [imeis, setImeis] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState<number>(0);

  // Camera states
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [copiedAll, setCopiedAll] = useState(false);
  const [isOcrReading, setIsOcrReading] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const manualInputRef = useRef<HTMLInputElement | null>(null);
  const ocrBusyRef = useRef<boolean>(false);

  // Initialize or reset when modal opens
  useEffect(() => {
    if (open && product) {
      setImeis([]);
      setManualInput("");
      setBulkText("");
      setShowBulkPaste(false);
      setPurchasePrice(product.purchasePrice || 0);
      setFeedback(null);
      setCameraActive(true); // Open live camera scanner
    } else {
      stopCamera();
      setCameraActive(false);
      setCameraError(null);
      setCameraPermissionDenied(false);
      setFeedback(null);
      setIsOcrReading(false);
    }
  }, [open, product]);

  // Audio feedback tone
  const playBeep = useCallback((success: boolean = true) => {
    try {
      const AudioContextClass =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(success ? 880 : 320, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.16);

      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.16);
    } catch {
      // Audio restricted without user interaction
    }
  }, []);

  // Validate and automatically register an IMEI
  const handleProcessImei = useCallback(
    (rawVal: string, source: "ocr" | "barcode" | "manual" = "manual"): boolean => {
      const cleaned = rawVal.trim().replace(/[\s\-_]/g, "");
      if (!cleaned) return false;

      // Filter out non-IMEI barcodes (e.g. 13-digit EAN-13 barcodes like 6942675408009)
      if (source === "barcode" && cleaned.length === 13) {
        // EAN product barcode, not IMEI
        return false;
      }

      if (cleaned.length < 8) {
        setFeedback({
          type: "error",
          text: `Code '${cleaned}' is too short for an IMEI/Serial (min 8 characters).`,
        });
        playBeep(false);
        return false;
      }

      // Check if already in current scan list
      if (imeis.includes(cleaned)) {
        setFeedback({
          type: "error",
          text: `IMEI ${cleaned} is ALREADY in this scan list!`,
        });
        playBeep(false);
        return false;
      }

      // Check if already exists in active inventory
      const existingInDb = existingUnits.find(
        (u) => u.imei1 === cleaned || u.imei2 === cleaned || u.serial === cleaned
      );
      if (existingInDb) {
        setFeedback({
          type: "error",
          text: `Duplicate: IMEI ${cleaned} already exists in inventory (Status: ${existingInDb.status}).`,
        });
        playBeep(false);
        return false;
      }

      // Successfully add
      setImeis((prev) => {
        const next = [...prev, cleaned];
        setBulkText(next.join("\n"));
        return next;
      });

      playBeep(true);
      setFeedback({
        type: "success",
        text: source === "ocr"
          ? `✓ Scanned Sticker Text: IMEI ${cleaned} (Total: ${imeis.length + 1})`
          : `✓ Scanned: ${cleaned} (Total: ${imeis.length + 1})`,
      });

      if (source === "manual") {
        setManualInput("");
      }
      return true;
    },
    [imeis, existingUnits, playBeep]
  );

  // Stop camera tracks cleanly
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.stop().catch(() => {});
        html5QrCodeRef.current.clear();
      } catch {}
      html5QrCodeRef.current = null;
    }
  }, []);

  // Trigger instant high-res OCR frame capture
  const handleSnapOcr = useCallback(async () => {
    if (!videoRef.current || ocrBusyRef.current) return;
    ocrBusyRef.current = true;
    setIsOcrReading(true);

    try {
      const res = await captureAndExtractImeis(videoRef.current, { cropToCenter: true, maxWidth: 1000 });
      if (res.success && res.imeis.length > 0) {
        let addedCount = 0;
        for (const im of res.imeis) {
          const ok = handleProcessImei(im, "ocr");
          if (ok) addedCount++;
        }
        if (addedCount === 0) {
          setFeedback({
            type: "info",
            text: `Detected: ${res.imeis.join(", ")} (Already added).`,
          });
        }
      } else {
        setFeedback({
          type: "error",
          text: "Could not read sticker numbers. Please ensure sticker is well-lit and aligned.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        text: "Sticker OCR recognition failed. Please try again.",
      });
    } finally {
      setIsOcrReading(false);
      ocrBusyRef.current = false;
    }
  }, [handleProcessImei]);

  // Camera detection loop: combines periodic OCR frame extraction + native BarcodeDetector
  useEffect(() => {
    if (!open || !cameraActive) {
      stopCamera();
      return;
    }

    let isSubscribed = true;
    let ocrInterval: any = null;
    let barcodeInterval: any = null;

    const startScanner = async () => {
      stopCamera();
      setCameraError(null);
      setCameraPermissionDenied(false);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraError("Camera access is not supported by your browser or connection is not secure (HTTPS required).");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 }, // High resolution for sharp text reading
            height: { ideal: 1080 },
          },
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

        // --- ENGINE 1: Continuous OCR Sticker Text Recognition ---
        // Runs every 1400ms to read "IMEI1: 86799..." text from the box
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
                const now = Date.now();
                for (const im of res.imeis) {
                  if (
                    lastScannedRef.current.code !== im ||
                    now - lastScannedRef.current.time > 2000
                  ) {
                    lastScannedRef.current = { code: im, time: now };
                    handleProcessImei(im, "ocr");
                  }
                }
              }
            } catch {
              // Ignore background OCR frame slips
            } finally {
              ocrBusyRef.current = false;
            }
          }
        }, 1400);

        // --- ENGINE 2: BarcodeDetector Fallback (Only accepts 14-16 digit IMEIs, rejects 13-digit EANs) ---
        if ("BarcodeDetector" in window) {
          try {
            // @ts-ignore
            const detector = new BarcodeDetector({
              formats: ["code_128", "code_39", "qr_code", "data_matrix"],
            });

            barcodeInterval = setInterval(async () => {
              if (videoRef.current && videoRef.current.readyState >= 2 && isSubscribed) {
                try {
                  const barcodes = await detector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0) {
                    const rawVal = barcodes[0].rawValue?.trim();
                    const now = Date.now();
                    // Must be 14-16 digits (reject 13-digit EANs)
                    if (
                      rawVal &&
                      /^\d{14,16}$/.test(rawVal) &&
                      (lastScannedRef.current.code !== rawVal ||
                        now - lastScannedRef.current.time > 2000)
                    ) {
                      lastScannedRef.current = { code: rawVal, time: now };
                      handleProcessImei(rawVal, "barcode");
                    }
                  }
                } catch {}
              }
            }, 300);
          } catch {}
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        console.warn("Camera getUserMedia error:", err);
        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraPermissionDenied(true);
          setCameraError("Camera permission denied. Please allow camera in browser address bar.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("No camera detected on this computer / device.");
        } else {
          setCameraError("Camera could not be started. You can use a USB Barcode Scanner or type below.");
        }
      }
    };

    startScanner();

    return () => {
      isSubscribed = false;
      if (ocrInterval) clearInterval(ocrInterval);
      if (barcodeInterval) clearInterval(barcodeInterval);
      stopCamera();
    };
  }, [open, cameraActive, facingMode, handleProcessImei, stopCamera]);

  // Support USB / Handheld Barcode Gun Rapid Typing
  const handleGunKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (manualInput.trim()) {
        handleProcessImei(manualInput.trim(), "manual");
      }
    }
  };

  const handleManualAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleProcessImei(manualInput.trim(), "manual");
    }
  };

  // Sync from bulk textarea if user pastes multiple lines
  const handleBulkTextChange = (text: string) => {
    setBulkText(text);
    const parsed = text
      .split("\n")
      .map((l) => l.trim().replace(/[\s\-_]/g, ""))
      .filter((l) => l.length >= 8);

    const unique = Array.from(new Set(parsed));
    setImeis(unique);
  };

  const removeImei = (val: string) => {
    const next = imeis.filter((i) => i !== val);
    setImeis(next);
    setBulkText(next.join("\n"));
  };

  const clearAllImeis = () => {
    if (imeis.length === 0) return;
    if (window.confirm("Are you sure you want to clear all scanned IMEIs in this batch?")) {
      setImeis([]);
      setBulkText("");
      setFeedback(null);
    }
  };

  const copyAllToClipboard = () => {
    if (!imeis.length) return;
    navigator.clipboard.writeText(imeis.join("\n"));
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Final submission to inventory
  const handleAddAllToInventory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!product || imeis.length === 0) return;

    const rows = imeis.map((imei) => ({
      imei1: imei,
      purchasePrice: purchasePrice || product.purchasePrice || 0,
    }));

    onAddUnits(product.id, rows);
    if (onSuccess) {
      onSuccess(rows.length);
    }
    onClose();
  };

  if (!product) return null;

  const totalCost = imeis.length * (purchasePrice || product.purchasePrice || 0);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add & Scan IMEIs — ${product.name}`}
      wide
    >
      <div className="space-y-4">
        {/* Top Product Header Card */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border/80 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[14px] font-bold text-foreground flex items-center gap-2">
                <span>{product.name}</span>
                <Badge tone="brand">{product.brand}</Badge>
              </div>
              <div className="text-[12px] text-muted-foreground flex items-center gap-2 mt-0.5">
                <span>Category: <strong>{product.category || "Mobile"}</strong></span>
                {product.storage && <span>• Storage: <strong>{product.storage}</strong></span>}
                {product.color && <span>• Color: <strong>{product.color}</strong></span>}
                <span>• In Stock: <strong className="text-foreground">{currentStock} units</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Ready to Inward
              </div>
              <div className="text-[16px] font-mono font-bold text-primary">
                {imeis.length} {imeis.length === 1 ? "Unit" : "Units"}
              </div>
            </div>
            {imeis.length > 0 && (
              <Badge tone="success" className="text-xs py-1 px-2.5">
                Valuation: {inr(totalCost)}
              </Badge>
            )}
          </div>
        </div>

        {/* Live Feedback Toast Banner */}
        {feedback && (
          <div
            className={`p-2.5 rounded-lg text-[12px] font-medium border flex items-center justify-between transition-all animate-in fade-in duration-200 ${
              feedback.type === "success"
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                : feedback.type === "error"
                ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
                : "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30"
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === "success" ? (
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-2 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Camera Live Scanner Section */}
        <div className="rounded-xl border border-border/80 overflow-hidden bg-slate-950 text-white shadow-sm">
          {/* Scanner Header Controls */}
          <div className="p-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <FileText className="w-4 h-4 text-emerald-400" />
              <span>Box Sticker Text Scanner (Reads IMEI1 / IMEI2 Numbers)</span>
              {cameraActive && (
                <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400 font-normal bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-800/60">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Sticker OCR Active
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {cameraActive && (
                <>
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    onClick={handleSnapOcr}
                    disabled={isOcrReading}
                    className="h-7 text-[11.5px] bg-emerald-600 hover:bg-emerald-500 text-white border-none gap-1 px-2.5 font-bold shadow-xs"
                    title="Instant snapshot and read sticker text numbers"
                  >
                    {isOcrReading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Reading...
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        📸 Read Sticker Text
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={() =>
                      setFacingMode((prev) =>
                        prev === "environment" ? "user" : "environment"
                      )
                    }
                    className="px-2 py-1 text-[11px] bg-slate-800 hover:bg-slate-700 rounded-md border border-slate-700 text-slate-200 flex items-center gap-1 transition"
                    title="Switch Front/Back Camera"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Flip
                  </button>
                </>
              )}

              <Button
                type="button"
                size="sm"
                variant={cameraActive ? "danger" : "primary"}
                onClick={() => setCameraActive(!cameraActive)}
                className="h-7 text-[11px] gap-1 px-2.5"
              >
                {cameraActive ? (
                  <>
                    <CameraOff className="w-3.5 h-3.5" />
                    Off
                  </>
                ) : (
                  <>
                    <Camera className="w-3.5 h-3.5" />
                    Turn On Camera
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Camera Viewport */}
          {cameraActive ? (
            <div className="relative aspect-video max-h-[260px] w-full overflow-hidden flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Viewfinder Target Reticle Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-72 h-32 sm:w-96 sm:h-36 border-2 border-emerald-400 rounded-xl shadow-[0_0_25px_rgba(52,211,153,0.4)] flex flex-col items-center justify-between p-2">
                  <div className="w-full flex justify-between">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                    <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  </div>

                  {/* Animated laser line */}
                  <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />

                  <div className="text-[11px] font-mono text-emerald-300 font-bold tracking-wider bg-slate-950/85 px-3 py-0.5 rounded-full border border-emerald-500/50 shadow-md">
                    POINT AT &quot;IMEI1 / IMEI2&quot; TEXT NUMBERS
                  </div>

                  <div className="w-full flex justify-between">
                    <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                    <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>
              </div>

              <div className="absolute bottom-2 left-3 text-[10.5px] text-slate-300 bg-slate-900/85 px-2.5 py-0.5 rounded-md border border-slate-800 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Hold box sticker in frame — reads printed numbers automatically (No barcode needed)
              </div>
            </div>
          ) : (
            <div className="p-6 text-center space-y-2 bg-slate-950/60">
              <Camera className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-[13px] font-medium text-slate-300">
                {cameraPermissionDenied
                  ? "Camera permission was denied in browser."
                  : cameraError || "Camera scanner is paused."}
              </div>
              <div className="text-[11.5px] text-slate-500 max-w-sm mx-auto">
                Click &quot;Turn On Camera&quot; to read the printed IMEI1 / IMEI2 numbers from the box sticker, or use USB barcode scanner below.
              </div>
              <Button
                type="button"
                size="sm"
                variant="primary"
                onClick={() => setCameraActive(true)}
                className="mt-2 text-xs"
              >
                <Camera className="w-3.5 h-3.5 mr-1" />
                Start Camera Scanner
              </Button>
            </div>
          )}
        </div>

        {/* USB Barcode Gun / Manual IMEI Input */}
        <form onSubmit={handleManualAddSubmit} className="space-y-1.5">
          <div className="flex items-center justify-between text-[11.5px] font-semibold text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Barcode className="w-4 h-4 text-primary" />
              Scan with Barcode Gun or Type IMEI:
            </span>
            <button
              type="button"
              onClick={() => setShowBulkPaste(!showBulkPaste)}
              className="text-primary hover:underline text-xs"
            >
              {showBulkPaste ? "Hide Bulk Paste Textarea" : "Show Bulk Paste / Raw Text"}
            </button>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                ref={manualInputRef}
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                onKeyDown={handleGunKeyDown}
                placeholder="Point barcode scanner gun here or type 15-digit IMEI..."
                className="font-mono text-[13px] h-10 pr-10"
              />
              {manualInput && (
                <button
                  type="button"
                  onClick={() => setManualInput("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            <Button
              type="submit"
              variant="primary"
              disabled={!manualInput.trim()}
              className="h-10 px-4 text-xs font-semibold gap-1.5 shrink-0"
            >
              <Plus className="w-4 h-4" />
              Add IMEI
            </Button>
          </div>
        </form>

        {/* Bulk Paste Textarea (Toggleable) */}
        {showBulkPaste && (
          <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-foreground">
              <span>Bulk Paste IMEIs (One per line)</span>
              <span className="text-[11px] text-muted-foreground">
                Paste directly from Excel or supplier invoice
              </span>
            </div>
            <textarea
              className="w-full h-24 rounded-lg border border-border bg-[var(--surface-glass-strong)] p-2.5 text-[12px] font-mono outline-none focus:border-primary resize-y"
              placeholder="867992087036778&#10;867992087036760"
              value={bulkText}
              onChange={(e) => handleBulkTextChange(e.target.value)}
            />
          </div>
        )}

        {/* Scanned IMEIs Chips Register */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/10 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] font-bold text-foreground">
                Scanned IMEIs Batch
              </span>
              <Badge tone={imeis.length > 0 ? "success" : "neutral"}>
                {imeis.length} {imeis.length === 1 ? "unit" : "units"}
              </Badge>
            </div>

            {imeis.length > 0 && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={copyAllToClipboard}
                  className="h-7 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                >
                  {copiedAll ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      Copy All
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={clearAllImeis}
                  className="h-7 text-[11px] gap-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                >
                  <Trash2 className="w-3 h-3" />
                  Clear All
                </Button>
              </div>
            )}
          </div>

          {imeis.length === 0 ? (
            <div className="text-center py-6 border border-dashed border-border/70 rounded-lg text-xs text-muted-foreground space-y-1">
              <Scan className="w-6 h-6 text-muted-foreground/40 mx-auto" />
              <p className="font-medium text-foreground">No IMEIs added to this batch yet.</p>
              <p className="text-[11px]">
                Point camera at box sticker numbers (e.g. IMEI1: 867992087036778) to read automatically.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
              {imeis.map((imei, idx) => (
                <span
                  key={imei}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1 text-[12px] font-mono border border-border/80 shadow-xs text-foreground group"
                >
                  <span className="text-muted-foreground text-[10px] font-sans font-semibold">
                    #{idx + 1}
                  </span>
                  <strong>{imei}</strong>
                  <button
                    type="button"
                    onClick={() => removeImei(imei)}
                    className="text-muted-foreground hover:text-rose-500 text-sm leading-none ml-1 transition"
                    title="Remove IMEI"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Cost & Inward Summary */}
        <div className="p-3 rounded-xl border border-border/80 bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Field label="Purchase Cost per Unit (₹)" className="w-44">
              <Input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="h-9 text-xs font-semibold"
              />
            </Field>
            <div className="text-xs text-muted-foreground pt-4">
              Cost will be recorded for each of the {imeis.length} unit(s).
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-muted-foreground uppercase font-bold tracking-wider">
              Total Stock Valuation
            </div>
            <div className="text-[16px] font-mono font-bold text-foreground">
              {inr(totalCost)}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-3 border-t border-border">
          <div className="text-[11.5px] text-muted-foreground">
            Sticker Text OCR active. Point camera at IMEI1 or IMEI2 numbers on the phone box.
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={imeis.length === 0}
              onClick={handleAddAllToInventory}
              className="gap-1.5"
            >
              <Check className="w-4 h-4" />
              Add {imeis.length} {imeis.length === 1 ? "Unit" : "Units"} to Inventory
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
