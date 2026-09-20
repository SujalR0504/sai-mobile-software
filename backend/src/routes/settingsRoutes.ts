import { getFullDB, getSettings } from "../repositories/repository";
import { resetDemoData, updateSettings, wipeStoreData } from "../services/settingsService";
import { jsonResponse, type RouteContext } from "./types";

export async function settingsRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Health
  if (pathname === "/api/health") {
    return jsonResponse({ status: "ok", timestamp: new Date().toISOString() });
  }

  // Hydration / Full DB
  if (pathname === "/api/db" && method === "GET") {
    return jsonResponse(getFullDB(db));
  }

  // Settings
  if (pathname === "/api/settings") {
    if (method === "GET") return jsonResponse(getSettings(db));
    if (method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateSettings(db, body));
    }
  }

  // Reset Demo DB
  if (pathname === "/api/reset" && method === "POST") {
    resetDemoData(db);
    return jsonResponse({ success: true, db: getFullDB(db) });
  }

  // Wipe All Store Data (Clean Slate)
  if (pathname === "/api/wipe" && method === "POST") {
    wipeStoreData(db);
    return jsonResponse({ success: true, db: getFullDB(db) });
  }

  return null;
}
