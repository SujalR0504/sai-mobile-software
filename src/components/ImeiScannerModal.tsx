import { useEffect, useRef, useState } from "react";
import { Badge, Button, Input, Modal } from "./ui";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, FileText, Loader2, RefreshCw } from "lucide-react";
import { captureAndExtractImeis } from "@/lib/imeiOcrClient";

export interface ImeiScannerModalProps {
  open: boolean;
  onClose: () => void;
  productId?: string;
  productName: string;
  requiredQty?: number;
  requiredCount?: number;
  currentImeis?: string[];
  currentProductImeis?: string[];
  existingImeis?: string[];
  existingPurchaseImeis?: string[];
  onAddImei?: (imei: string) => boolean | { error?: string };
  onRemoveImei?: (imei: string) => void;
  onSave?: (imeis: string[]) => void;
  dbUnits?: Array<{ id: string; imei1: string; imei2?: string; status: string }>;
}

export function ImeiScannerModal({
  open,
  onClose,
  productName,
  requiredQty: propRequiredQty,
  requiredCount: propRequiredCount,
  currentImeis: propCurrentImeis,
  currentProductImeis: propCurrentProductImeis,
  existingImeis: propExistingImeis,
  existingPurchaseImeis: propExistingPurchaseImeis,
  onAddImei,
  onRemoveImei,
  onSave,
  dbUnits = [],
}: ImeiScannerModalProps) {
  // Normalize props for backward & forward compatibility
  const requiredCount = propRequiredQty ?? propRequiredCount ?? 1;
  const initialImeis = propCurrentImeis ?? propCurrentProductImeis ?? propExistingImeis ?? [];
  const otherBillImeis = propExistingPurchaseImeis ?? [];

  const [capturedImeis, setCapturedImeis] = useState<string[]>(initialImeis);
  const [manualCode, setManualCode] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraPermissionDenied, setCameraPermissionDenied] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);
  const [isOcrReading, setIsOcrReading] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5QrcodeRef = useRef<Html5Qrcode | null>(null);
  const lastScannedRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });
  const ocrBusyRef = useRef<boolean>(false);

  // Sync state if initial list updates
  useEffect(() => {
    setCapturedImeis(initialImeis);
  }, [initialImeis.length]);

  const remaining = Math.max(0, requiredCount - capturedImeis.length);
  const isComplete = capturedImeis.length >= requiredCount;

  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 tone
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // Audio context might be restricted before user interaction
    }
  };

  const validateAndAddImei = (rawImei: string): boolean => {
    const trimmed = rawImei.trim();
    if (!trimmed) {
      setFeedbackMsg({ type: "error", text: "IMEI cannot be empty." });
      return false;
    }

    if (!/^\d{14,16}$/.test(trimmed)) {
      setFeedbackMsg({
        type: "error",
        text: `Invalid IMEI '${trimmed}'. Standard mobile phone IMEIs contain 14–16 digits.`,
      });
      return false;
    }

    // 1. Duplicate in current product or bill
    if (capturedImeis.includes(trimmed) || otherBillImeis.includes(trimmed)) {
      setFeedbackMsg({
        type: "error",
        text: `IMEI ${trimmed} is already entered in this purchase bill.`,
      });
      return false;
    }

    // 2. Duplicate in database inventory (available, sold, returned)
    const existingUnit = dbUnits.find(
      (u) => u.imei1 === trimmed || u.imei2 === trimmed
    );
    if (existingUnit) {
      setFeedbackMsg({
        type: "error",
        text: "IMEI already exists in inventory.",
      });
      return false;
    }

    // 3. Max count check
    if (capturedImeis.length >= requiredCount) {
      setFeedbackMsg({
        type: "info",
        text: `All ${requiredCount} IMEI numbers captured.`,
      });
      return false;
    }

    // Call external handler if provided
    if (onAddImei) {
      const res = onAddImei(trimmed);
      if (typeof res === "object" && res.error) {
        setFeedbackMsg({ type: "error", text: res.error });
        return false;
      }
    }

    const nextList = [...capturedImeis, trimmed];
    setCapturedImeis(nextList);
    if (onSave) {
      onSave(nextList);
    }

    playBeep();
    setFeedbackMsg({
      type: "success",
      text: `✓ Scanned: ${trimmed} (${nextList.length}/${requiredCount})`,
    });
    setManualCode("");

    return true;
  };

  const handleRemove = (imei: string) => {
    const nextList = capturedImeis.filter((im) => im !== imei);
    setCapturedImeis(nextList);
    if (onRemoveImei) {
      onRemoveImei(imei);
    }
    if (onSave) {
      onSave(nextList);
    }
  };

  // Switch camera between environment and user
  const handleToggleCamera = () => {
    setFacingMode((prev) => (prev === "environment" ? "user" : "environment"));
  };

  const handleSnapOcr = async () => {
    if (!videoRef.current || ocrBusyRef.current) return;
    ocrBusyRef.current = true;
    setIsOcrReading(true);

    try {
      const res = await captureAndExtractImeis(videoRef.current, { cropToCenter: true, maxWidth: 1000 });
      if (res.success && res.imeis.length > 0) {
        for (const im of res.imeis) {
          validateAndAddImei(im);
        }
      } else {
        setFeedbackMsg({
          type: "error",
          text: "Could not read sticker numbers. Please align phone box sticker within frame.",
        });
      }
    } catch {
      setFeedbackMsg({
        type: "error",
        text: "Sticker OCR recognition failed. Please try again.",
      });
    } finally {
      setIsOcrReading(false);
      ocrBusyRef.current = false;
    }
  };

  // Camera stream and detection setup
  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (html5QrcodeRef.current) {
        try {
          html5QrcodeRef.current.stop().catch(() => {});
          html5QrcodeRef.current.clear();
        } catch {}
        html5QrcodeRef.current = null;
      }
      setCameraActive(false);
      setCameraPermissionDenied(false);
      setCameraError(null);
      setFeedbackMsg(null);
      return;
    }

    let isSubscribed = true;
    let scanInterval: any = null;

    // Check secure context
    const isSecureContext =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!isSecureContext) {
      setCameraError("Camera requires a secure context (HTTPS or localhost). Please enter IMEI manually.");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError("Camera access is not supported by your browser. Please enter IMEI manually.");
      return;
    }

    // Stop existing stream before re-requesting with new facingMode
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setCameraError(null);

    navigator.mediaDevices
      .getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      })
      .then((stream) => {
        if (!isSubscribed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
          setCameraPermissionDenied(false);
        }

        // Detection Strategy:
        // 1. Continuous OCR Sticker Text Scanner (every 1400ms)
        const ocrInterval = setInterval(async () => {
          if (
            videoRef.current &&
            videoRef.current.readyState >= 2 &&
            capturedImeis.length < requiredCount &&
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
                    validateAndAddImei(im);
                  }
                }
              }
            } catch {
            } finally {
              ocrBusyRef.current = false;
            }
          }
        }, 1400);

        // 2. BarcodeDetector Fallback (Reject 13-digit EANs)
        if ("BarcodeDetector" in window) {
          try {
            // @ts-ignore
            const detector = new BarcodeDetector({
              formats: ["code_128", "code_39", "qr_code", "data_matrix"],
            });

            scanInterval = setInterval(async () => {
              if (
                videoRef.current &&
                videoRef.current.readyState >= 2 &&
                capturedImeis.length < requiredCount
              ) {
                try {
                  const barcodes = await detector.detect(videoRef.current);
                  if (barcodes && barcodes.length > 0) {
                    const val = barcodes[0].rawValue?.trim();
                    const now = Date.now();
                    if (
                      val &&
                      /^\d{14,16}$/.test(val) &&
                      (lastScannedRef.current.code !== val || now - lastScannedRef.current.time > 2000)
                    ) {
                      lastScannedRef.current = { code: val, time: now };
                      validateAndAddImei(val);
                    }
                  }
                } catch {}
              }
            }, 300);
          } catch {
            // Native BarcodeDetector initialization failed
          }
        } else {
          // Fallback: Html5Qrcode scanner integration
          const scannerDivId = "html5-qrcode-inward-reader";
          let readerEl = document.getElementById(scannerDivId);
          if (!readerEl) {
            readerEl = document.createElement("div");
            readerEl.id = scannerDivId;
            readerEl.style.display = "none";
            document.body.appendChild(readerEl);
          }

          try {
            const html5QrCode = new Html5Qrcode(scannerDivId);
            html5QrcodeRef.current = html5QrCode;

            html5QrCode
              .start(
                { facingMode: { ideal: facingMode } },
                {
                  fps: 10,
                  qrbox: { width: 250, height: 150 },
                },
                (decodedText) => {
                  const now = Date.now();
                  const val = decodedText.trim();
                  if (val && (lastScannedRef.current.code !== val || now - lastScannedRef.current.time > 1500)) {
                    lastScannedRef.current = { code: val, time: now };
                    validateAndAddImei(val);
                  }
                },
                () => {}
              )
              .catch((err) => {
                console.warn("Html5Qrcode fallback start failed:", err);
              });
          } catch (e) {
            console.warn("Html5Qrcode setup error:", e);
          }
        }
      })
      .catch((err: any) => {
        if (!isSubscribed) return;
        console.warn("Camera getUserMedia error:", err);
        setCameraActive(false);

        if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          setCameraPermissionDenied(true);
          setCameraError("Camera permission was denied. Please allow camera access from your browser settings or enter the IMEI manually.");
        } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          setCameraError("No camera device found on this system. Please enter IMEI manually.");
        } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
          setCameraError("Camera is currently in use by another application or tab.");
        } else {
          setCameraError("Unable to access camera. Please check camera settings or enter IMEI manually.");
        }
      });

    return () => {
      isSubscribed = false;
      if (scanInterval) clearInterval(scanInterval);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (html5QrcodeRef.current) {
        try {
          html5QrcodeRef.current.stop().catch(() => {});
          html5QrcodeRef.current.clear();
        } catch {}
        html5QrcodeRef.current = null;
      }
    };
  }, [open, facingMode]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    validateAndAddImei(manualCode.trim());
  };

  return (
    <Modal open={open} onClose={onClose} title="SCAN IMEI (Continuous Camera Barcode Scanner)" wide>
      <div className="space-y-4">
        {/* Header Summary & Progress Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border border-border/80 bg-muted/20">
          <div>
            <div className="text-[13px] font-bold text-foreground flex items-center gap-1.5">
              <span>📱 {productName}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Point camera at device box barcode or IMEI sticker
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                Captured Progress
              </div>
              <div className="text-[13.5px] font-mono font-bold text-foreground">
                {capturedImeis.length} / {requiredCount}
              </div>
            </div>
            <Badge tone={isComplete ? "success" : "warning"}>
              {isComplete ? "✓ All IMEIs Captured" : `Remaining: ${remaining}`}
            </Badge>
          </div>
        </div>

        {/* Feedback Alert Message */}
        {feedbackMsg && (
          <div
            className={`p-2.5 rounded-lg text-[12px] font-medium border flex items-center justify-between transition-all ${
              feedbackMsg.type === "success"
                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                : feedbackMsg.type === "error"
                ? "bg-destructive/10 text-destructive border-destructive/30"
                : "bg-blue-50 text-blue-800 border-blue-200"
            }`}
          >
            <span>{feedbackMsg.text}</span>
            <button
              type="button"
              onClick={() => setFeedbackMsg(null)}
              className="text-xs opacity-70 hover:opacity-100 ml-2 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {/* Live Camera Viewport / Error State */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-slate-950 flex flex-col items-center justify-center text-white shadow-inner">
          {cameraActive ? (
            <>
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />

              {/* Viewfinder Target Reticle Overlay */}
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative w-64 h-32 sm:w-80 sm:h-36 border-2 border-emerald-400/80 rounded-xl shadow-[0_0_25px_rgba(52,211,153,0.3)] flex flex-col items-center justify-between p-2">
                  <div className="w-full flex justify-between">
                    <div className="w-4 h-4 border-t-2 border-l-2 border-emerald-400" />
                    <div className="w-4 h-4 border-t-2 border-r-2 border-emerald-400" />
                  </div>

                  {/* Animated laser line */}
                  <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />

                  <div className="text-[11px] font-mono text-emerald-300 font-bold tracking-wider bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                    ALIGN &quot;IMEI1 / IMEI2&quot; TEXT HERE
                  </div>

                  <div className="w-full flex justify-between">
                    <div className="w-4 h-4 border-b-2 border-l-2 border-emerald-400" />
                    <div className="w-4 h-4 border-b-2 border-r-2 border-emerald-400" />
                  </div>
                </div>
              </div>

              {/* Live Controls on Top-Right */}
              <div className="absolute top-3 right-3 flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  onClick={handleSnapOcr}
                  disabled={isOcrReading}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white border-none text-[11px] h-8 gap-1.5 shadow-md font-bold"
                >
                  {isOcrReading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Reading...
                    </>
                  ) : (
                    <>
                      <Camera className="w-3.5 h-3.5" />
                      📸 Snap Sticker Text
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleToggleCamera}
                  className="bg-slate-900/80 text-white border-slate-700 hover:bg-slate-800 text-[11px] h-8 gap-1.5 shadow-md"
                >
                  <RefreshCw className="w-3 h-3" /> Flip ({facingMode === "environment" ? "Back" : "Front"})
                </Button>
              </div>

              <div className="absolute bottom-2.5 left-3 text-[11px] text-slate-300 bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700">
                🟢 Live Camera Active
              </div>
            </>
          ) : (
            <div className="p-6 text-center max-w-md space-y-3">
              <div className="text-3xl">📷</div>
              <div className="text-[13px] font-semibold text-slate-200">
                {cameraPermissionDenied
                  ? "Camera Permission Required"
                  : cameraError || "Initializing Camera..."}
              </div>
              <div className="text-[11.5px] text-slate-400 leading-relaxed">
                {cameraPermissionDenied
                  ? "Camera permission was denied. Please allow camera access from your browser settings or enter the IMEI manually below."
                  : "You can use your device camera or type/scan with a USB barcode scanner below."}
              </div>
              <div className="pt-2 flex justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="bg-slate-800 text-white border-slate-700 hover:bg-slate-700 text-xs"
                  onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                >
                  Retry Camera
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Manual IMEI Input & Hardware Scanner Field */}
        <form onSubmit={handleManualSubmit} className="flex gap-2 items-center">
          <Input
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            placeholder="Manual entry or USB barcode scanner for 14–16 digit IMEI..."
            className="flex-1 font-mono text-[12px] h-9"
            disabled={isComplete}
            autoFocus
          />
          <Button type="submit" variant="primary" disabled={isComplete || !manualCode.trim()} className="h-9">
            Add IMEI
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setFeedbackMsg({ type: "info", text: "Ready for next scan." })}
            className="h-9 text-[12px]"
          >
            Scan Next
          </Button>
        </form>

        {/* Scanned Tags Chips Register */}
        <div className="p-3 rounded-xl border border-border/80 bg-muted/10 space-y-2">
          <div className="flex items-center justify-between text-[11.5px] font-bold text-foreground">
            <span>Captured IMEIs for Inward ({capturedImeis.length})</span>
            {isComplete && (
              <span className="text-emerald-600 font-semibold text-xs">✓ Ready to Inward</span>
            )}
          </div>

          {capturedImeis.length === 0 ? (
            <div className="text-center py-4 text-xs text-muted-foreground">
              No IMEIs captured yet. Point your camera at a barcode or type above.
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
              {capturedImeis.map((imei, idx) => (
                <span
                  key={imei}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-background px-2.5 py-1 text-[11.5px] font-mono border border-border/80 shadow-xs text-foreground"
                >
                  <span className="text-muted-foreground text-[10px]">#{idx + 1}</span>
                  <strong>{imei}</strong>
                  <button
                    type="button"
                    onClick={() => handleRemove(imei)}
                    className="text-muted-foreground hover:text-destructive text-sm leading-none ml-1"
                    title="Remove IMEI"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center pt-2 border-t border-border">
          <div className="text-[11px] text-muted-foreground">
            Standard GSM IMEI requires 14–16 numeric digits.
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={() => {
                if (onSave) onSave(capturedImeis);
                onClose();
              }}
            >
              Done & Return to Inward ({capturedImeis.length}/{requiredCount})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
