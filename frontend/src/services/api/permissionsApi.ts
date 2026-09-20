import type { EmployeePermission, PermissionAction, PermissionModule } from "../../lib/types";
import { apiClient } from "./apiClient";

export const permissionsApi = {
  getModules: () =>
    apiClient.get<{ modules: readonly PermissionModule[]; actions: readonly PermissionAction[] }>("/api/permissions/modules"),

  getEmployeePermissions: (employeeId: string) =>
    apiClient.get<EmployeePermission[]>(`/api/permissions/employee/${employeeId}`),

  setEmployeePermission: (employeeId: string, module: string, action: string, allowed: boolean) =>
    apiClient.post<{ success: boolean }>(`/api/permissions/employee/${employeeId}`, { module, action, allowed }),

  bulkUpdate: (employeeId: string, permissions: Array<{ module: string; action: string; allowed: boolean }>) =>
    apiClient.post<{ success: boolean; count: number }>(`/api/permissions/employee/${employeeId}/bulk`, { permissions }),

  resetRole: (employeeId: string, role: string) =>
    apiClient.post<{ success: boolean }>(`/api/permissions/employee/${employeeId}/reset`, { role }),

  checkPermission: (employeeId: string, module: string, action: string) =>
    apiClient.post<{ allowed: boolean }>("/api/permissions/check", { employeeId, module, action }),
};
