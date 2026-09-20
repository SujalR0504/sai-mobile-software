import type { DB, Settings } from "../../lib/types";
import { apiClient } from "./apiClient";

export const settingsApi = {
  getSettings: () => apiClient.get<Settings>("/api/settings"),
  updateSettings: (patch: Partial<Settings>) => apiClient.patch<Settings>("/api/settings", patch),
  getDB: () => apiClient.get<DB>("/api/db"),
  resetDemo: () => apiClient.post<{ success: boolean; db: DB }>("/api/reset"),
  wipeAllData: () => apiClient.post<{ success: boolean; db: DB }>("/api/wipe"),
  getHealth: () => apiClient.get<{ status: string; timestamp: string }>("/api/health"),
};
