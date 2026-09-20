/**
 * Frontend API Client
 * Centralized fetch handler providing type-safety, standard error extraction, and request options.
 */

export interface ApiResponse<T = any> {
  success?: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  errorDetails?: { code: string; message: string };
  message?: string;
}

export class ApiError extends Error {
  statusCode: number;
  errorCode?: string;
  details?: any;

  constructor(message: string, statusCode = 400, errorCode?: string, details?: any) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
  }
}

let activeEmployeeId: string | null = null;

export function setActiveEmployeeId(id: string | null) {
  activeEmployeeId = id;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (activeEmployeeId && !headers.has("x-employee-id")) {
    headers.set("x-employee-id", activeEmployeeId);
  }

  const url = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("Content-Type") || "";
  let payload: any = null;

  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const errorMsg =
      payload?.error ||
      payload?.message ||
      payload?.errorDetails?.message ||
      `Request failed with status ${response.status}`;
    const errorCode = payload?.errorCode || payload?.errorDetails?.code;
    throw new ApiError(errorMsg, response.status, errorCode, payload);
  }

  return payload as T;
}

export const apiClient = {
  get: <T = any>(url: string, options?: RequestInit) =>
    apiRequest<T>(url, { ...options, method: "GET" }),

  post: <T = any>(url: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(url, {
      ...options,
      method: "POST",
      body: body ? JSON.stringify(body) : undefined,
    }),

  patch: <T = any>(url: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(url, {
      ...options,
      method: "PATCH",
      body: body ? JSON.stringify(body) : undefined,
    }),

  put: <T = any>(url: string, body?: any, options?: RequestInit) =>
    apiRequest<T>(url, {
      ...options,
      method: "PUT",
      body: body ? JSON.stringify(body) : undefined,
    }),

  delete: <T = any>(url: string, options?: RequestInit) =>
    apiRequest<T>(url, { ...options, method: "DELETE" }),
};
