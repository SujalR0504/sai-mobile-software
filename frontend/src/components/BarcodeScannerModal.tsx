import { useEffect, useRef, useState } from "react";
import { Button, Field, Input, Modal } from "./ui";

interface BarcodeScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (barcode: string) => void;
}

export function BarcodeScannerModal({ open, onClose, onDetected }: BarcodeScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCameraActive(false);
      setCameraError("");
      return;
    }

    let stream: MediaStream | null = null;
    let detector: any = null;
    let intervalId: any = null;

    if ("BarcodeDetector" in window) {
      try {
        // @ts-ignore
        detector = new BarcodeDetector({
          formats: ["code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e", "qr_code"],
        });
      } catch {
        // fallback
      }
    }

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
          setCameraActive(true);
        }

        if (detector) {
          intervalId = setInterval(async () => {
            if (videoRef.current && videoRef.current.readyState >= 2) {
              try {
                const barcodes = await detector.detect(videoRef.current);
                if (barcodes && barcodes.length > 0) {
                  const val = barcodes[0].rawValue;
                  if (val) {
                    setLastScanned(val);
                    onDetected(val);
                  }
                }
              } catch {
                // frame detection error ignore
              }
            }
          }, 400);
        }
      })
      .catch((err) => {
        console.warn("Camera access unavailable:", err);
        setCameraError("Camera unavailable or permission denied. You can still enter or scan with a hardware USB scanner.");
      });

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [open, onDetected]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onDetected(manualCode.trim());
    setManualCode("");
  };

  return (
    <Modal open={open} onClose={onClose} title="Barcode & Camera Scanner">
      <div className="space-y-4">
        {/* Live Camera Viewport */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-black/80 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
          />

          {cameraActive && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <div className="size-48 rounded-lg border-2 border-primary/80 border-dashed animate-pulse" />
              <span className="mt-2 rounded bg-black/70 px-2 py-0.5 text-[11px] text-white">
                Align barcode or IMEI within box
              </span>
            </div>
          )}

          {cameraError && (
            <div className="p-4 text-center text-[12px] text-muted-foreground">
              {cameraError}
            </div>
          )}
        </div>

        {lastScanned && (
          <div className="p-2 rounded bg-success/15 text-success text-[12px] text-center font-mono font-semibold">
            ✓ Last Scanned: {lastScanned}
          </div>
        )}

        {/* Hardware or Manual Barcode Input */}
        <form onSubmit={handleManualSubmit} className="flex gap-2">
          <Field label="Hardware Scanner / Manual Barcode Input" className="flex-1">
            <Input
              autoFocus
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan with USB barcode scanner or type code..."
              className="font-mono text-[13px]"
            />
          </Field>
          <div className="flex flex-col justify-end">
            <Button type="submit" size="md">
              Submit
            </Button>
          </div>
        </form>

        <div className="flex justify-end border-t border-border pt-2">
          <Button variant="ghost" onClick={onClose}>
            Done Scanning
          </Button>
        </div>
      </div>
    </Modal>
  );
}
