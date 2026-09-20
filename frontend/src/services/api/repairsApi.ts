import type { Repair, RepairStatus } from "../../lib/types";
import { apiClient } from "./apiClient";

export const repairsApi = {
  getRepairs: () => apiClient.get<Repair[]>("/api/repairs"),
  addRepair: (repair: Omit<Repair, "id" | "jobId" | "createdAt" | "status">) =>
    apiClient.post<Repair>("/api/repairs", repair),
  usePart: (repairId: string, partData: any) =>
    apiClient.post<any>(`/api/repairs/${repairId}/parts`, partData),
  setStatus: (repairId: string, status: RepairStatus, user?: string) =>
    apiClient.patch<{ success: boolean; id: string; status: RepairStatus }>(`/api/repairs/${repairId}/status`, { status, user }),
};
