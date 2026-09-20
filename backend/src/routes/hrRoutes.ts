import { getAttendance, getEmployees, getPayroll } from "../repositories/repository";
import {
  addEmployee,
  calculatePayroll,
  disbursePayroll,
  recordAttendanceCheckIn,
  recordAttendanceCheckOut,
} from "../services/hrService";
import { jsonResponse, type RouteContext } from "./types";

export async function hrRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // Employees
  if (pathname === "/api/employees") {
    if (method === "GET") return jsonResponse(getEmployees(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(addEmployee(db, body), 201);
    }
  }

  // Attendance
  if (pathname === "/api/attendance" && method === "GET") {
    const date = url.searchParams.get("date") || undefined;
    return jsonResponse(getAttendance(db, date));
  }

  if (pathname === "/api/attendance/check-in" && method === "POST") {
    const body = await request.json();
    const att = recordAttendanceCheckIn(db, body);
    return jsonResponse(att, 201);
  }

  if (pathname === "/api/attendance/check-out" && method === "POST") {
    const body = await request.json();
    recordAttendanceCheckOut(db, body.employeeId);
    return jsonResponse({ success: true });
  }

  // Payroll
  if (pathname === "/api/payroll" && method === "GET") {
    const month = url.searchParams.get("month") ? Number(url.searchParams.get("month")) : undefined;
    const year = url.searchParams.get("year") ? Number(url.searchParams.get("year")) : undefined;
    return jsonResponse(getPayroll(db, month, year));
  }

  if (pathname === "/api/payroll/calculate" && method === "POST") {
    const body = await request.json();
    const record = calculatePayroll(db, body);
    return jsonResponse(record, 201);
  }

  if (pathname === "/api/payroll/disburse" && method === "POST") {
    const body = await request.json();
    const record = disbursePayroll(db, body.payrollId, body.paymentMethod);
    return jsonResponse(record);
  }

  return null;
}
