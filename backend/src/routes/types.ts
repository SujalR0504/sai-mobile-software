import type { DatabaseSync } from "node:sqlite";

export interface RouteContext {
  request: Request;
  url: URL;
  pathname: string;
  method: string;
  db: DatabaseSync;
}

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-employee-id",
    },
  });
}

export function errorResponse(message: string, status = 400, code?: string): Response {
  return jsonResponse({
    success: false,
    error: message,
    errorCode: code || "ERROR",
    errorDetails: {
      code: code || "ERROR",
      message,
    },
    message,
  }, status);
}

export type RouteHandler = (ctx: RouteContext) => Promise<Response | null> | Response | null;
