import { getRepairs } from "../../db/repository";
import { addRepair, setRepairStatus, useRepairPart } from "../../services/repairService";
import { jsonResponse, type RouteContext } from "./types";

export async function repairRoutes({ request, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Repairs collection
  if (pathname === "/api/repairs") {
    if (method === "GET") return jsonResponse(getRepairs(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addRepair(db, body), 201);
    }
  }

  // Repair parts
  const repairPartMatch = pathname.match(/^\/api\/repairs\/([^/]+)\/parts$/);
  if (repairPartMatch && method === "POST") {
    const repairId = repairPartMatch[1];
    const body = await request.json();
    return jsonResponse(useRepairPart(db, { ...body, repairId }), 201);
  }

  // Repair status
  const repairStatusMatch = pathname.match(/^\/api\/repairs\/([^/]+)\/status$/);
  if (repairStatusMatch && method === "PATCH") {
    const id = repairStatusMatch[1];
    const body = await request.json();
    setRepairStatus(db, id, body.status, body.user);
    return jsonResponse({ success: true, id, status: body.status });
  }

  return null;
}
