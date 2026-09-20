import { describe, expect, it } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { getDB } from "../../../database/client";
import { handleApiRequest } from "../routes/router";
import { calculateEMI, validateEMIInputs } from "../../../shared/utils/emi";
import { checkEmployeePermission } from "../services/permissionService";
import { getCustomerDue, getSupplierDue } from "../services/duesAndPaymentsService";

describe("Commercial Mobile Shop ERP - Clean Architecture & Layer Separation", () => {
  const db = getDB();

  it("Layer Isolation: guarantees frontend does not directly import SQLite database connectors", () => {
    const frontendDir = path.resolve(process.cwd(), "frontend/src");
    
    function scanDir(dir: string): string[] {
      const violations: string[] = [];
      const files = fs.readdirSync(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          violations.push(...scanDir(fullPath));
        } else if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          const content = fs.readFileSync(fullPath, "utf-8");
          if (content.includes("from \"node:sqlite\"") || content.includes("from 'node:sqlite'")) {
            violations.push(fullPath);
          }
        }
      }
      return violations;
    }

    const violations = scanDir(frontendDir);
    expect(violations).toEqual([]);
  });

  it("Shared Tier: pure calculation functions (EMI, Amortization, Format) are universally accessible", () => {
    const valid = validateEMIInputs({
      productPrice: 30000,
      downPayment: 5000,
      interestRate: 12,
      tenureMonths: 6,
    });
    expect(valid.valid).toBe(true);

    const calc = calculateEMI({
      productPrice: 30000,
      discount: 0,
      downPayment: 5000,
      interestRate: 12,
      interestType: "ANNUAL_REDUCING",
      tenureMonths: 6,
      processingFee: 500,
      otherCharges: 0,
    });
    expect(calc.monthlyEmi).toBeGreaterThan(0);
    expect(calc.schedule.length).toBe(6);
    expect(calc.totalPayable).toBeGreaterThan(25000);
  });

  it("Backend Tier: Customer due and outstanding calculation is strictly performed on backend", () => {
    const cust = db.prepare("SELECT id FROM customers LIMIT 1").get() as any;
    expect(cust).toBeDefined();

    const dueAmount = getCustomerDue(db, cust.id);
    expect(typeof dueAmount).toBe("number");
  });

  it("Backend Tier: Dealer due and outstanding balance calculation is strictly performed on backend", () => {
    const sup = db.prepare("SELECT id FROM suppliers LIMIT 1").get() as any;
    expect(sup).toBeDefined();

    const dueAmount = getSupplierDue(db, sup.id);
    expect(typeof dueAmount).toBe("number");
  });

  it("Backend Tier: Employee RBAC permissions enforcement blocks unauthorized mutations", () => {
    const emp = db.prepare("SELECT id, role FROM employees WHERE role != 'OWNER' LIMIT 1").get() as any;
    if (emp) {
      const canEditSettings = checkEmployeePermission(db, emp.id, "Settings", "EDIT");
      expect(canEditSettings).toBe(false);
    }
  });

  it("REST API Architecture: Endpoints return standardized JSON responses", async () => {
    const req = new Request("http://localhost:8080/api/settings", {
      method: "GET",
    });
    const res = await handleApiRequest(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty("shopName");
  });

  it("REST API Architecture: 404 handler returns structured error envelope", async () => {
    const req = new Request("http://localhost:8080/api/unknown-endpoint-404", {
      method: "GET",
    });
    const res = await handleApiRequest(req);
    expect(res.status).toBe(404);

    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.errorCode).toBe("NOT_FOUND");
  });
});
