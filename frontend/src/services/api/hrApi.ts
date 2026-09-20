import type { AttendanceRecord, Employee, PayrollRecord } from "../../lib/types";
import { apiClient } from "./apiClient";

export const hrApi = {
  getEmployees: () => apiClient.get<Employee[]>("/api/employees"),
  addEmployee: (employee: any) => apiClient.post<Employee>("/api/employees", employee),

  getAttendance: (date?: string) =>
    apiClient.get<AttendanceRecord[]>(date ? `/api/attendance?date=${date}` : "/api/attendance"),
  checkIn: (data: any) => apiClient.post<AttendanceRecord>("/api/attendance/check-in", data),
  checkOut: (employeeId: string) => apiClient.post<{ success: boolean }>("/api/attendance/check-out", { employeeId }),

  getPayroll: (month?: number, year?: number) => {
    const params = new URLSearchParams();
    if (month) params.set("month", month.toString());
    if (year) params.set("year", year.toString());
    const query = params.toString() ? "?" + params.toString() : "";
    return apiClient.get<PayrollRecord[]>(`/api/payroll${query}`);
  },
  calculatePayroll: (data: any) => apiClient.post<PayrollRecord>("/api/payroll/calculate", data),
  disbursePayroll: (payrollId: string, paymentMethod: string) =>
    apiClient.post<PayrollRecord>("/api/payroll/disburse", { payrollId, paymentMethod }),
};
