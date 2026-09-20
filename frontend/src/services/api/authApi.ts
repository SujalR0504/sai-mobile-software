import { apiClient } from "./apiClient";

export interface LoginCredentials {
  identifier?: string;
  email?: string;
  password?: string;
  pin?: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  branchId?: string;
}

export const authApi = {
  login: (credentials: LoginCredentials) =>
    apiClient.post<{ success: boolean; user: AuthUser }>("/api/auth/login", credentials),

  verifyPin: (params: {
    pin: string;
    action: string;
    reason?: string;
    recordId?: string;
    employeeId?: string;
    employeeName?: string;
  }) => apiClient.post<{ success: boolean; verified: boolean }>("/api/auth/verify-pin", params),

  setPin: (pin: string, updatedBy?: string) =>
    apiClient.post<{ success: boolean }>("/api/auth/set-pin", { pin, updatedBy }),
};
