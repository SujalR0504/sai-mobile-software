import { describe, expect, it } from "bun:test";
import { getDB } from "../db/client";
import { addCustomer, deleteCustomer, getCustomerDue } from "../services/duesAndPaymentsService";
import { createSale } from "../services/salesService";
import { addProduct } from "../services/stockService";
import { customerRoutes } from "../../../backend/src/routes/customerRoutes";
import { addEmployee } from "../services/hrService";
import { checkEmployeePermission, setEmployeePermission } from "../services/permissionService";

describe("Customer Deletion Feature", () => {
  const db = getDB();

  // 1. Clean deletion without transactions
  it("successfully deletes a customer without transaction history", () => {
    const cust = addCustomer(db, {
      name: "Rohit Test",
      phone: "9826000001",
      address: "Bhopal MP",
    });

    // Verify it exists in DB
    const checkBefore = db.prepare("SELECT * FROM customers WHERE id = ?").get(cust.id);
    expect(checkBefore).toBeDefined();

    // Delete customer
    const res = deleteCustomer(db, cust.id);
    expect(res.success).toBe(true);
    expect(res.id).toBe(cust.id);

    // Verify it was removed
    const checkAfter = db.prepare("SELECT * FROM customers WHERE id = ?").get(cust.id);
    expect(checkAfter).toBeUndefined();
  });

  // 2. Block deletion if customer has sales / due without force
  it("blocks deletion if customer has transactions/due unless force is true", () => {
    const cust = addCustomer(db, {
      name: "Suresh Due Customer",
      phone: "9826000002",
      address: "Harda MP",
    });

    const prod = addProduct(db, {
      name: "Tempered Glass S24",
      brand: "Samsung",
      category: "Accessories",
      tracked: false,
      sellingPrice: 500,
      qty: 10,
    });

    // Create partial payment sale => Leaves ₹300 due
    createSale(db, {
      customerId: cust.id,
      items: [{ productId: prod.id, name: prod.name, price: 500, qty: 1 }],
      discount: 0,
      payments: [
        { mode: "Cash", amount: 200 },
        { mode: "Credit", amount: 300 },
      ],
    });

    const due = getCustomerDue(db, cust.id);
    expect(due).toBe(300);

    // Delete attempt without force must fail
    expect(() => {
      deleteCustomer(db, cust.id, false);
    }).toThrow(/Cannot delete customer/i);

    // Force delete succeeds and cleans up linked records
    const forceRes = deleteCustomer(db, cust.id, true);
    expect(forceRes.success).toBe(true);

    const checkAfter = db.prepare("SELECT * FROM customers WHERE id = ?").get(cust.id);
    expect(checkAfter).toBeUndefined();

    // Verify audit log
    const audit = db.prepare("SELECT * FROM audit_logs WHERE record_id = ? AND action = 'CUSTOMER_DELETE'").get(cust.id) as any;
    expect(audit).toBeDefined();
    expect(audit.module).toBe("Customers");
  });

  // 3. API endpoint permission check
  it("enforces permission check via DELETE /api/customers/:id", async () => {
    const cust = addCustomer(db, {
      name: "Permission Test Customer",
      phone: "9826000003",
    });

    // Create a staff member without Customers:DELETE permission
    const staff = addEmployee(db, {
      fullName: "Staff Member",
      role: "CASHIER",
      department: "Sales",
    });
    setEmployeePermission(db, staff.id, "Customers", "DELETE", false);

    // Request DELETE with staff header
    const req = new Request(`http://localhost/api/customers/${cust.id}`, {
      method: "DELETE",
      headers: {
        "x-employee-id": staff.id,
      },
    });

    const url = new URL(req.url);
    const res = await customerRoutes({
      request: req,
      url,
      pathname: url.pathname,
      method: req.method,
      db,
    });

    expect(res).not.toBeNull();
    expect(res?.status).toBe(403);
    const body = await res?.json();
    expect(body.error).toContain("Customers:DELETE");

    // Admin deletion succeeds
    const adminReq = new Request(`http://localhost/api/customers/${cust.id}`, {
      method: "DELETE",
      headers: {
        "x-user-id": "admin",
      },
    });
    const adminUrl = new URL(adminReq.url);
    const adminRes = await customerRoutes({
      request: adminReq,
      url: adminUrl,
      pathname: adminUrl.pathname,
      method: adminReq.method,
      db,
    });

    expect(adminRes?.status).toBe(200);
    const adminBody = await adminRes?.json();
    expect(adminBody.success).toBe(true);
  });
});
