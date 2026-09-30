import { getUnits } from "../repositories/repository";
import { getIMEI, validateIMEI } from "../services/imeiService";
import { searchImei, setUnitStatus } from "../services/stockService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

import { extractImeisFromImage } from "../services/imeiOcrService";

export async function imeiRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // OCR Image / Camera Frame IMEI Extraction
  if (pathname === "/api/imei/ocr-scan" && method === "POST") {
    try {
      const body = await request.json();
      const image = body.image || body.base64;
      if (!image) {
        return errorResponse("Missing image base64 data", 400, "VALIDATION_ERROR");
      }
      const result = await extractImeisFromImage(image);
      return jsonResponse(result);
    } catch (err: any) {
      return errorResponse(err?.message || "Failed to process image OCR", 500, "OCR_ERROR");
    }
  }

  // Validate IMEI format & duplicate check
  if (pathname === "/api/imei/validate" && method === "POST") {
    const body = await request.json();
    const imei = body.imei || body.code || "";
    const result = validateIMEI(db, imei);
    return jsonResponse(result);
  }

  // Lookup IMEI
  if (pathname === "/api/imei/lookup" && method === "GET") {
    const imei = url.searchParams.get("imei") || url.searchParams.get("code") || "";
    if (!imei) return errorResponse("IMEI parameter is required", 400, "VALIDATION_ERROR");
    const result = getIMEI(db, imei);
    if (!result) return errorResponse("IMEI not found in inventory", 404, "NOT_FOUND");
    return jsonResponse({ found: true, unit: result });
  }

  // Units list or search
  if (pathname === "/api/units" && method === "GET") {
    const imeiQuery = url.searchParams.get("search");
    if (imeiQuery) {
      return jsonResponse(searchImei(db, imeiQuery));
    }
    return jsonResponse(getUnits(db));
  }

  // Set unit status
  const unitStatusMatch = pathname.match(/^\/api\/units\/([^/]+)\/status$/);
  if (unitStatusMatch && method === "PATCH") {
    const id = unitStatusMatch[1];
    const body = await request.json();
    setUnitStatus(db, id, body.status);
    return jsonResponse({ success: true, id, status: body.status });
  }

  return null;
}
