import { checkMongoConnection, syncSQLiteToMongo } from "../../../database/mongoClient";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function cloudRoutes({
  pathname,
  method,
  db,
}: RouteContext): Promise<Response | null> {
  // GET /api/cloud/status
  if (pathname === "/api/cloud/status" && method === "GET") {
    try {
      const status = await checkMongoConnection();
      return jsonResponse(status);
    } catch (err: any) {
      return jsonResponse({
        connected: false,
        error: err?.message || String(err),
      });
    }
  }

  // POST /api/cloud/sync
  if (pathname === "/api/cloud/sync" && method === "POST") {
    try {
      const syncResult = await syncSQLiteToMongo(db);
      return jsonResponse(syncResult);
    } catch (err: any) {
      return errorResponse(err?.message || "Cloud sync failed", 500);
    }
  }

  return null;
}
