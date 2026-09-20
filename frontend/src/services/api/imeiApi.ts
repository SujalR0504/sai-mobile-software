import type { Unit, UnitStatus } from "../../lib/types";
import { apiClient } from "./apiClient";

export interface IMEIValidationResponse {
  valid: boolean;
  imei: string;
  exists: boolean;
  status?: UnitStatus;
  productName?: string;
  productId?: string;
  unitId?: string;
  error?: string;
}

export const imeiApi = {
  validateIMEI: (imei: string) =>
    apiClient.post<IMEIValidationResponse>("/api/imei/validate", { imei }),

  lookupIMEI: (imei: string) =>
    apiClient.get<{ found: boolean; unit: any }>(`/api/imei/lookup?imei=${encodeURIComponent(imei)}`),

  getUnits: (searchQuery?: string) =>
    apiClient.get<Unit[]>(searchQuery ? `/api/units?search=${encodeURIComponent(searchQuery)}` : "/api/units"),

  setUnitStatus: (unitId: string, status: UnitStatus) =>
    apiClient.patch<{ success: boolean; id: string; status: UnitStatus }>(`/api/units/${unitId}/status`, { status }),
};
