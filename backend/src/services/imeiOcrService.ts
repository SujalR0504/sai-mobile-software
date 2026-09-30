import { createWorker, type Worker } from "tesseract.js";

let ocrWorker: Worker | null = null;
let isInitializing = false;

/**
 * Initializes or returns the cached singleton Tesseract OCR worker.
 */
async function getOcrWorker(): Promise<Worker> {
  if (ocrWorker) return ocrWorker;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 50));
    }
    if (ocrWorker) return ocrWorker;
  }

  isInitializing = true;
  try {
    const worker = await createWorker("eng");
    ocrWorker = worker;
    return worker;
  } finally {
    isInitializing = false;
  }
}

export interface ImeiOcrResult {
  success: boolean;
  imeis: string[];
  imei1?: string;
  imei2?: string;
  rawText: string;
}

/**
 * Parses IMEI numbers from raw OCR text.
 * Accurately extracts IMEI1, IMEI2, and any 14-16 digit GSM IMEI numbers.
 */
export function parseImeisFromText(text: string): {
  imeis: string[];
  imei1?: string;
  imei2?: string;
} {
  const imeis: string[] = [];

  // 1. Look for explicit IMEI 1 / IMEI 2 tags (including OCR variations like IVE, IVER, 1MEI, etc.)
  const imei1Match =
    text.match(/(?:IMEI\s*1?|IVE\s*1?|1MEI\s*1?)[\s:=-]+([0-9\s]{14,18})/i) ||
    text.match(/IMEI\s*[:=-]+([0-9\s]{14,18})/i);

  const imei2Match = text.match(
    /(?:IMEI\s*2|IVER\s*2?|IVE\s*2|1MEI\s*2)[\s:=-]+([0-9\s]{14,18})/i
  );

  let imei1: string | undefined = undefined;
  let imei2: string | undefined = undefined;

  if (imei1Match) {
    const cleaned = imei1Match[1].replace(/\s+/g, "");
    if (/^\d{14,16}$/.test(cleaned)) {
      imei1 = cleaned;
      imeis.push(cleaned);
    }
  }

  if (imei2Match) {
    const cleaned = imei2Match[1].replace(/\s+/g, "");
    if (/^\d{14,16}$/.test(cleaned)) {
      imei2 = cleaned;
      if (!imeis.includes(cleaned)) {
        imeis.push(cleaned);
      }
    }
  }

  // 2. Scan line by line for any 14-16 digit numbers (handling spaces inserted by OCR)
  const lines = text.split("\n");
  for (const line of lines) {
    // Remove label prefixes
    const stripped = line.replace(/[^0-9\s]/g, " ");
    const tokens = stripped.split(/\s+/).filter(Boolean);

    // Check single token of 14-16 digits
    for (const t of tokens) {
      if (/^\d{14,16}$/.test(t)) {
        if (!imeis.includes(t)) {
          imeis.push(t);
        }
      }
    }

    // Sometimes OCR separates 15 digits into groups like "86799 20870 36778"
    const mergedLineDigits = line.replace(/[^0-9]/g, "");
    if (mergedLineDigits.length === 15 || mergedLineDigits.length === 14) {
      if (!imeis.includes(mergedLineDigits)) {
        imeis.push(mergedLineDigits);
      }
    }
  }

  // 3. Fallback: global regex for 14-16 digits
  const allDigits = text.match(/\b\d{14,16}\b/g) || [];
  for (const d of allDigits) {
    if (!imeis.includes(d)) {
      imeis.push(d);
    }
  }

  // Assign primary if not explicitly tagged
  if (!imei1 && imeis.length > 0) imei1 = imeis[0];
  if (!imei2 && imeis.length > 1) imei2 = imeis[1];

  return { imeis, imei1, imei2 };
}

/**
 * Extracts IMEIs from an uploaded image (Buffer or Base64 data URL).
 */
export async function extractImeisFromImage(
  imageSource: string | Buffer
): Promise<ImeiOcrResult> {
  const worker = await getOcrWorker();

  let input: any = imageSource;
  if (typeof imageSource === "string" && imageSource.startsWith("data:")) {
    // Extract base64 part
    const base64Data = imageSource.split(",")[1];
    input = Buffer.from(base64Data, "base64");
  }

  const { data } = await worker.recognize(input);
  const rawText = data.text || "";

  const { imeis, imei1, imei2 } = parseImeisFromText(rawText);

  return {
    success: imeis.length > 0,
    imeis,
    imei1,
    imei2,
    rawText,
  };
}
