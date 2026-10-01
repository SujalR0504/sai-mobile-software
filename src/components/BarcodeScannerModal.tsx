import { useEffect, useRef, useState, useCallback } from "react";
import { Button, Field, Input, Modal, Badge } from "./ui";
import { Camera, CameraOff, Scan, FileText, Loader2, RefreshCw, Barcode } from "lucide-react";
import { captureAndExtractImeis } from "@/lib/imeiOcrClient";
import { cleanBarcodeImei, playScanBeep, useHardwareBarcodeScanner } from "@/lib/barcodeScannerHelper";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [isOcrReading, setIsOcrReading] = useState(false);
  const ocrBusyRef = useRef<boolean>(false);
  const lastScannedTimeRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const handleDetectedCode = useCallback(
    (code: string, source: "ocr" | "barcode" | "manual" = "manual") => {
      const cleaned = cleanBarcodeImei(code);
      if (!cleaned) return;

      const now = Date.now();
      if (
        lastScannedTimeRef.current.code === cleaned &&
        now - lastScannedTimeRef.current.time < 1500
      ) {
        return;
      }

      lastScannedTimeRef.current = { code: cleaned, time: now };
      setLastScanned(cleaned);
      playScanBeep(true);
      onDetected(cleaned);
    },
    [onDetected]
  );

  // Global listener for TVS BS-C101 Star / USB barcode gun
  useHardwareBarcodeScanner({
    enabled: open,
    soundOnScan: false,
    onScan: (scanned) => {
      handleDetectedCode(scanned, "barcode");
    },
  });

  // Manual snap OCR
  const handleSnapOcr = async () => {
    if (!videoRef.current || ocrBusyRef.current) return;
    ocrBusyRef.current = true;
    setIsOcrReading(true);

    try {
      const res = await captureAndExtractImeis(videoRef.current, { cropToCenter: true, maxWidth: 1000 });
      if (res.success && res.imeis.length > 0) {
        handleDetectedCode(res.imeis[0], "ocr");
      } else {
        setCameraError("Could not read sticker numbers. Please align the phone box sticker within frame.");
        setTimeout(() => setCameraError(""), 3000);
      }
    } catch {
      setCameraError("Sticker OCR recognition failed. Please try again.");
      setTimeout(() => setCameraError(""), 3000);
    } finally {
      setIsOcrReading(false);
      ocrBusyRef.current = false;
    }
  };

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraActive(false);
      setCameraError("");
      setIsOcrReading(false);
      return;
    }

    let isSubscribed = true;
    let ocrInterval: any = null;
    let barcodeInterval: any = null;

    stopCamera();

    navigator.mediaDevices
      ?.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      })
      .then((s) => {
        if (!isSubscribed) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
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
                handleDetectedCode(res.imeis[0], "ocr");
              }
            } catch {
            } finally {
              ocrBusyRef.current = false;
            }
          }
        }, 1400);

        // ENGINE 2: BarcodeDetector Fallback (14-16 digits only)
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
                    const val = barcodes[0].rawValue?.trim();
                    if (val && /^\d{14,16}$/.test(val)) {
                      handleDetectedCode(val, "barcode");
                    }
                  }
                } catch {}
              }
            }, 300);
          } catch {}
        }
      })
      .catch((err) => {
        console.warn("Camera access unavailable:", err);
        setCameraError("Camera unavailable or permission denied. You can still enter or scan with a hardware USB scanner.");
      });

    return () => {
      isSubscribed = false;
      if (ocrInterval) clearInterval(ocrInterval);
      if (barcodeInterval) clearInterval(barcodeInterval);
      stopCamera();
    };
  }, [open, facingMode, handleDetectedCode, stopCamera]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDetectedCode(manualCode.trim(), "manual");
    setManualCode("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Sticker IMEI & Camera Scanner">
      <div className="space-y-4">
        {/* Top Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <FileText className="w-3.5 h-3.5 text-emerald-500" />
            <span>Reads &quot;IMEI1 / IMEI2&quot; text numbers from phone box sticker</span>
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
                  className="h-7 text-xs bg-emerald-600 hover:bg-emerald-500 text-white border-none gap-1 font-bold"
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

                <button
                  type="button"
                  onClick={() => setFacingMode((prev) => (prev === "environment" ? "user" : "environment"))}
                  className="px-2 py-1 text-xs rounded border border-border bg-muted/60 text-foreground flex items-center gap-1 hover:bg-muted"
                  title="Switch Front/Back Camera"
                >
                  <RefreshCw className="w-3 h-3" />
                  Flip
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Camera Viewport */}
        <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-700 bg-black flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {cameraActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="relative w-72 h-32 border-2 border-emerald-400 rounded-xl shadow-[0_0_20px_rgba(52,211,153,0.4)] flex flex-col items-center justify-between p-2">
                <div className="w-full flex justify-between">
                  <div className="w-3.5 h-3.5 border-t-2 border-l-2 border-emerald-400" />
                  <div className="w-3.5 h-3.5 border-t-2 border-r-2 border-emerald-400" />
                </div>

                <div className="w-full h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse" />

                <div className="text-[10px] font-mono text-emerald-300 font-bold tracking-wider bg-slate-950/80 px-2.5 py-0.5 rounded-full border border-emerald-500/40">
                  ALIGN &quot;IMEI1 / IMEI2&quot; TEXT HERE
                </div>

                <div className="w-full flex justify-between">
                  <div className="w-3.5 h-3.5 border-b-2 border-l-2 border-emerald-400" />
                  <div className="w-3.5 h-3.5 border-b-2 border-r-2 border-emerald-400" />
                </div>
              </div>
            </div>
          )}

          {cameraError && (
            <div className="p-4 text-center text-[12px] text-rose-400 bg-slate-900/90 rounded border border-rose-500/40 m-2">
              {cameraError}
            </div>
          )}
        </div>

        {lastScanned && (
          <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[12.5px] text-center font-mono font-bold flex items-center justify-center gap-2">
            <span>✓ Scanned IMEI:</span>
            <span className="text-foreground bg-background px-2 py-0.5 rounded border border-border">
              {lastScanned}
            </span>
          </div>
        )}

        {/* Hardware TVS / USB Barcode Scanner Status & Input */}
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Barcode className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                <span>TVS / USB Barcode Scanner Ready</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
              </div>
              <p className="text-[11px] text-muted-foreground">
                TVS मशीन का बटन दबाकर बॉक्स का बारकोड स्कैन करें (बिना क्लिक किए काम करेगा)
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <Field label="Hardware Scanner / Manual Input" className="flex-1">
            <Input
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="TVS स्कैनर से बारकोड स्कैन करें या 15-digit IMEI टाइप करें..."
              className="font-mono text-[13px] border-emerald-500/30 focus:border-emerald-500"
            />
          </Field>
          <div className="flex flex-col justify-end">
            <Button type="submit" size="md" className="bg-emerald-600 hover:bg-emerald-500 text-white">
              Submit
            </Button>
          </div>
        </form>

        <div className="flex justify-between items-center border-t border-border pt-2 text-xs text-muted-foreground">
          <span>Sticker OCR active. Point camera at IMEI numbers on box.</span>
          <Button variant="ghost" onClick={onClose}>
            Done Scanning
          </Button>
        </div>
      </div>
    </Modal>
  );
}
