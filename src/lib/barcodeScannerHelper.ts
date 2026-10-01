/**
 * Utility for handling Hardware USB Barcode Scanners (e.g. TVS BS-C101 Star, Honeywell, Zebra, etc.)
 * and cleaning scanned IMEI/barcode strings.
 */

import { useEffect, useRef, useCallback } from "react";

/**
 * Extracts and cleans IMEI from raw barcode scanner text.
 * Handles barcodes with prefixes like "IMEI1:", "IMEI2:", "IMEI:", "S/N:", "SN:",
 * or pure 14-16 digit numbers, stripping non-printable characters.
 */
export function cleanBarcodeImei(raw: string): string {
  if (!raw) return "";

  // 1. Remove non-printable / control ASCII chars
  let cleaned = raw.replace(/[\x00-\x1F\x7F]/g, "").trim();

  // 2. Check if there is an exact 14 to 16 digit IMEI pattern anywhere in the string
  // (handles "IMEI1: 867992087036778", "[)>06...867992087036778", etc.)
  const imeiDigitsMatch = cleaned.match(/\b\d{14,16}\b/);
  if (imeiDigitsMatch) {
    return imeiDigitsMatch[0];
  }

  // 3. Strip common mobile box prefixes like IMEI1:, IMEI2:, IMEI:, S/N:, SN:, etc.
  cleaned = cleaned.replace(/^(IMEI\s*[12]?|MEID|S\/?N|SERIAL)\s*[:=\-#\s]+/i, "");

  // 4. Strip internal spaces and dashes
  cleaned = cleaned.replace(/[\s\-_]/g, "");

  return cleaned.trim();
}

/**
 * Plays a POS scanner sound (pleasant beep on success, warning beep on failure).
 */
export function playScanBeep(success: boolean = true) {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = success ? "sine" : "sawtooth";
    osc.frequency.setValueAtTime(success ? 920 : 320, audioCtx.currentTime);

    gain.gain.setValueAtTime(0.18, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + (success ? 0.14 : 0.22));

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + (success ? 0.14 : 0.22));
  } catch {
    // Web audio might be restricted prior to first user gesture
  }
}

export interface UseHardwareScannerOptions {
  onScan: (scannedCode: string) => void;
  enabled?: boolean;
  minLength?: number;
  maxIntervalMs?: number; // max time between keystrokes from hardware scanner
  soundOnScan?: boolean;
}

/**
 * Global window hook to capture hardware USB barcode scanner input (like TVS BS-C101 Star).
 * Hardware scanners send keystrokes in rapid bursts (< 50ms per key) followed by Enter.
 * This hook catches scans globally, even when no input is focused or when another element is clicked.
 */
export function useHardwareBarcodeScanner({
  onScan,
  enabled = true,
  minLength = 6,
  maxIntervalMs = 90,
  soundOnScan = true,
}: UseHardwareScannerOptions) {
  const bufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);
  const lastScanTimeRef = useRef<{ code: string; time: number }>({ code: "", time: 0 });

  const handleScan = useCallback(
    (rawCode: string) => {
      const cleaned = cleanBarcodeImei(rawCode);
      if (!cleaned || cleaned.length < minLength) return;

      // Prevent duplicate scan trigger within 800ms
      const now = Date.now();
      if (lastScanTimeRef.current.code === cleaned && now - lastScanTimeRef.current.time < 800) {
        return;
      }
      lastScanTimeRef.current = { code: cleaned, time: now };

      if (soundOnScan) {
        playScanBeep(true);
      }

      onScan(cleaned);
    },
    [onScan, minLength, soundOnScan]
  );

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Ignore functional modifier combinations
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      const interval = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      // If gap between keys is too long, it's manual typing, reset buffer
      if (interval > maxIntervalMs) {
        bufferRef.current = "";
      }

      if (e.key === "Enter" || e.key === "Tab") {
        if (bufferRef.current.length >= minLength) {
          e.preventDefault();
          e.stopPropagation();
          const code = bufferRef.current;
          bufferRef.current = "";
          handleScan(code);
          return;
        }
        bufferRef.current = "";
        return;
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [enabled, minLength, maxIntervalMs, handleScan]);
}
