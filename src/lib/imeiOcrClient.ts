/**
 * Client-side camera frame capture and OCR IMEI extraction helper.
 */

export interface CapturedImeis {
  success: boolean;
  imeis: string[];
  imei1?: string;
  imei2?: string;
  rawText?: string;
}

/**
 * Captures the current frame from a HTMLVideoElement and calls the backend OCR service.
 */
export async function captureAndExtractImeis(
  video: HTMLVideoElement,
  options: {
    cropToCenter?: boolean;
    maxWidth?: number;
  } = {}
): Promise<CapturedImeis> {
  if (!video || video.readyState < 2) {
    return { success: false, imeis: [] };
  }

  const { cropToCenter = true, maxWidth = 1000 } = options;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { success: false, imeis: [] };

  const videoWidth = video.videoWidth || 1280;
  const videoHeight = video.videoHeight || 720;

  let sx = 0;
  let sy = 0;
  let sw = videoWidth;
  let sh = videoHeight;

  if (cropToCenter) {
    // Focus on the middle 80% width and middle 60% height where user points at the sticker
    sw = Math.floor(videoWidth * 0.85);
    sh = Math.floor(videoHeight * 0.65);
    sx = Math.floor((videoWidth - sw) / 2);
    sy = Math.floor((videoHeight - sh) / 2);
  }

  // Scale down to maxWidth for high OCR speed
  const scale = Math.min(1, maxWidth / sw);
  canvas.width = Math.floor(sw * scale);
  canvas.height = Math.floor(sh * scale);

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

  const base64 = canvas.toDataURL("image/jpeg", 0.85);

  try {
    const res = await fetch("/api/imei/ocr-scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64 }),
    });

    if (!res.ok) {
      return { success: false, imeis: [] };
    }

    const data: CapturedImeis = await res.json();
    return data;
  } catch (err) {
    console.warn("OCR API request error:", err);
    return { success: false, imeis: [] };
  }
}
