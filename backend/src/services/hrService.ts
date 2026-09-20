import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { AttendanceRecord, AttendanceStatus, Employee, PayrollRecord } from "../../../shared/types";
import { logAudit } from "./auditService";
import { recordCashbookEntry } from "./ledgerService";

// Haversine formula for geo-distance in meters
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function addEmployee(db: DatabaseSync, input: any): Employee {
  const id = uid("emp");
  const now = new Date().toISOString();
  const empCode = input.employeeId || uid("EMP");
  const name = input.fullName || input.name || "Staff Member";
  const mobile = input.mobile || input.phone || "0000000000";
  const joiningDate = input.joiningDate || todayISO();
  const department = input.department || "Sales";
  const designation = input.designation || "Sales Staff";
  const salaryType = input.salaryType || "monthly";
  const basicSalary = Number(input.basicSalary || 0);
  const status = input.status || "ACTIVE";
  const role = input.role || "sales";

  const stmt = db.prepare(`
    INSERT INTO employees (id, business_id, branch_id, employee_id, full_name, photo, mobile, email, address, joining_date, department, designation, salary_type, basic_salary, bank_details, emergency_contact, status, role, user_id, created_at)
    VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    empCode,
    name,
    input.photo ?? null,
    mobile,
    input.email ?? null,
    input.address ?? null,
    joiningDate,
    department,
    designation,
    salaryType,
    basicSalary,
    input.bankDetails ?? null,
    input.emergencyContact ?? null,
    status,
    role,
    input.userId ?? null,
    now
  );

  logAudit(db, {
    action: "EMPLOYEE_CREATE",
    module: "EMPLOYEES",
    recordId: id,
    newValue: { employeeId: empCode, name },
    reason: "New employee onboarding",
  });

  return {
    id,
    businessId: "biz_default",
    branchId: "branch_01",
    employeeId: empCode,
    fullName: name,
    photo: input.photo,
    mobile,
    email: input.email,
    address: input.address,
    joiningDate,
    department,
    designation,
    salaryType,
    basicSalary,
    bankDetails: input.bankDetails,
    emergencyContact: input.emergencyContact,
    status,
    role,
    userId: input.userId,
    createdAt: now,
  };
}

export interface CheckInInput {
  employeeId: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  deviceInformation?: string;
  adminOverride?: boolean;
}

export function recordAttendanceCheckIn(db: DatabaseSync, input: CheckInInput): AttendanceRecord {
  const emp = db.prepare("SELECT full_name FROM employees WHERE id = ?").get(input.employeeId) as any;
  if (!emp) throw new Error(`Employee ${input.employeeId} not found`);

  const branch = db.prepare("SELECT latitude, longitude, allowed_radius_meters FROM branches WHERE id = 'branch_01'").get() as any;
  const shopLat = branch?.latitude ?? 28.5355;
  const shopLon = branch?.longitude ?? 77.3910;
  const allowedRadius = branch?.allowed_radius_meters ?? 200;

  let distance: number | undefined;
  let isWithinRadius = true;

  if (input.latitude && input.longitude) {
    distance = calculateDistanceMeters(input.latitude, input.longitude, shopLat, shopLon);
    if (distance > allowedRadius) {
      isWithinRadius = false;
      if (!input.adminOverride) {
        throw new Error(
          `Location check failed! You are ${distance}m away from the shop (Allowed: ${allowedRadius}m). Admin authorization override required.`
        );
      }
    }
  }

  const id = uid("att");
  const date = todayISO();
  const time = new Date().toLocaleTimeString("en-IN", { hour12: false });
  const status: AttendanceStatus = "PRESENT";
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO attendance (id, business_id, branch_id, employee_id, employee_name, date, check_in_time, latitude, longitude, accuracy, distance_from_shop, is_within_radius, device_information, status, admin_override, created_at)
    VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    input.employeeId,
    emp.full_name,
    date,
    time,
    input.latitude ?? null,
    input.longitude ?? null,
    input.accuracy ?? null,
    distance ?? null,
    isWithinRadius ? 1 : 0,
    input.deviceInformation ?? "Web Browser",
    status,
    input.adminOverride ? 1 : 0,
    now
  );

  return {
    id,
    employeeId: input.employeeId,
    employeeName: emp.full_name,
    date,
    checkInTime: time,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy,
    distanceFromShop: distance,
    isWithinRadius,
    deviceInformation: input.deviceInformation,
    status,
    adminOverride: input.adminOverride,
  };
}

export function recordAttendanceCheckOut(db: DatabaseSync, employeeId: string): void {
  const date = todayISO();
  const time = new Date().toLocaleTimeString("en-IN", { hour12: false });

  const record = db.prepare(`
    SELECT id FROM attendance
    WHERE employee_id = ? AND date = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(employeeId, date) as any;

  if (!record) {
    throw new Error("No check-in record found for today");
  }

  db.prepare("UPDATE attendance SET check_out_time = ? WHERE id = ?").run(time, record.id);
}

export interface CalculatePayrollInput {
  employeeId: string;
  month: number;
  year: number;
  allowances?: number;
  overtime?: number;
  commission?: number;
  bonus?: number;
  deductions?: number;
  advances?: number;
}

export function calculatePayroll(db: DatabaseSync, input: CalculatePayrollInput): PayrollRecord {
  const emp = db.prepare("SELECT full_name, basic_salary FROM employees WHERE id = ?").get(input.employeeId) as any;
  if (!emp) throw new Error(`Employee ${input.employeeId} not found`);

  const basic = emp.basic_salary || 0;
  const allowances = input.allowances || 0;
  const overtime = input.overtime || 0;
  const commission = input.commission || 0;
  const bonus = input.bonus || 0;
  const deductions = input.deductions || 0;
  const advances = input.advances || 0;

  // Check attendance absences for attendance deductions
  const monthStr = `${input.year}-${String(input.month).padStart(2, "0")}`;
  const absences = db.prepare(`
    SELECT COUNT(*) as count FROM attendance
    WHERE employee_id = ? AND date LIKE ? AND status = 'ABSENT'
  `).get(input.employeeId, `${monthStr}%`) as any;

  const dailyRate = basic / 30;
  const attendanceDeductions = Math.round((absences?.count || 0) * dailyRate);

  const grossSalary = basic + allowances + overtime + commission + bonus;
  const netSalary = Math.max(0, grossSalary - deductions - advances - attendanceDeductions);

  const id = uid("payr");
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO payroll (id, business_id, branch_id, employee_id, employee_name, month, year, basic_salary, allowances, overtime, commission, bonus, deductions, advances, attendance_deductions, gross_salary, net_salary, status, created_at)
    VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CALCULATED', ?)
  `);

  stmt.run(
    id,
    input.employeeId,
    emp.full_name,
    input.month,
    input.year,
    basic,
    allowances,
    overtime,
    commission,
    bonus,
    deductions,
    advances,
    attendanceDeductions,
    grossSalary,
    netSalary,
    now
  );

  return {
    id,
    employeeId: input.employeeId,
    employeeName: emp.full_name,
    month: input.month,
    year: input.year,
    basicSalary: basic,
    allowances,
    overtime,
    commission,
    bonus,
    deductions,
    advances,
    attendanceDeductions,
    grossSalary,
    netSalary,
    status: "CALCULATED",
  };
}

export function disbursePayroll(db: DatabaseSync, payrollId: string, paymentMethod = "Bank"): PayrollRecord {
  const p = db.prepare("SELECT * FROM payroll WHERE id = ?").get(payrollId) as any;
  if (!p) throw new Error("Payroll record not found");

  const now = new Date().toISOString();
  const today = todayISO();

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(`
      UPDATE payroll
      SET status = 'PAID', payment_date = ?, payment_method = ?
      WHERE id = ?
    `).run(today, paymentMethod, payrollId);

    if (paymentMethod === "Cash") {
      recordCashbookEntry(
        db,
        "PAYROLL_DISBURSEMENT",
        payrollId,
        "Salary",
        0,
        p.net_salary,
        `Salary for ${p.employee_name} (${p.month}/${p.year})`
      );
    }

    logAudit(db, {
      action: "PAYROLL_PAID",
      module: "PAYROLL",
      recordId: payrollId,
      newValue: { netSalary: p.net_salary, method: paymentMethod },
      reason: `Salary disbursed to ${p.employee_name}`,
    });

    db.exec("COMMIT;");

    return {
      ...p,
      status: "PAID",
      paymentDate: today,
      paymentMethod,
    };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
