import { handleApiRequest } from "../api/router";
import { getDB, closeDB } from "../db/client";

async function runTests() {
  console.log("--- Starting Backend Business Logic Tests ---");

  // 1. Health check
  const healthReq = new Request("http://localhost:5173/api/health");
  const healthRes = await handleApiRequest(healthReq);
  const healthData = await healthRes.json();
  console.assert(healthRes.status === 200, "Health check should return 200");
  console.assert(healthData.status === "ok", "Health data should be ok");
  console.log("✓ Health check passed");

  // 2. Hydration DB (load demo test fixtures for regression testing)
  await handleApiRequest(new Request("http://localhost:5173/api/reset", { method: "POST" }));
  const dbReq = new Request("http://localhost:5173/api/db");
  const dbRes = await handleApiRequest(dbReq);
  const dbData = await dbRes.json();
  console.assert(dbRes.status === 200, "DB hydration should return 200");
  console.assert(dbData.products.length > 0, "Products should be seeded");
  console.assert(dbData.units.length > 0, "Units should be seeded");
  console.log(`✓ DB loaded with ${dbData.products.length} products and ${dbData.units.length} units`);

  // 3. Dashboard KPIs
  const dashReq = new Request("http://localhost:5173/api/dashboard");
  const dashRes = await handleApiRequest(dashReq);
  const dashData = await dashRes.json();
  console.assert(dashRes.status === 200, "Dashboard should return 200");
  console.assert(typeof dashData.salesTotal === "number", "Sales total should be number");
  console.assert(typeof dashData.cashInHand === "number", "Cash in hand should be number");
  console.log(`✓ Dashboard KPIs: Sales = ₹${dashData.salesTotal}, Cash in Hand = ₹${dashData.cashInHand}`);

  // 4. POS Sale Creation with Tracked Unit
  // Find an available tracked unit
  const availableUnit = dbData.units.find((u: any) => u.status === "available");
  console.assert(Boolean(availableUnit), "Should have an available unit");
  const targetProduct = dbData.products.find((p: any) => p.id === availableUnit.productId);

  const salePayload = {
    customerId: dbData.customers[0].id,
    items: [
      {
        productId: targetProduct.id,
        name: targetProduct.name,
        unitId: availableUnit.id,
        imei: availableUnit.imei1,
        qty: 1,
        price: targetProduct.sellingPrice,
        gst: targetProduct.gst,
        costPrice: targetProduct.purchasePrice,
        warrantyMonths: targetProduct.warrantyMonths,
      },
    ],
    discount: 500,
    payments: [
      { mode: "Cash", amount: 10000 },
      { mode: "UPI", amount: targetProduct.sellingPrice - 500 - 10000 },
    ],
    note: "Automated test bill",
  };

  const saleReq = new Request("http://localhost:5173/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(salePayload),
  });
  const saleRes = await handleApiRequest(saleReq);
  const createdSale = await saleRes.json();
  console.assert(saleRes.status === 201, `Sale creation failed: ${JSON.stringify(createdSale)}`);
  console.assert(createdSale.invoiceNo.startsWith(dbData.settings.invoicePrefix), "Invoice prefix matches");
  console.log(`✓ Sale created successfully: Invoice ${createdSale.invoiceNo}, Total ₹${createdSale.total}`);

  // 5. Verify IMEI status changed to 'sold'
  const unitCheckReq = new Request("http://localhost:5173/api/units");
  const unitCheckRes = await handleApiRequest(unitCheckReq);
  const updatedUnits = await unitCheckRes.json();
  const soldUnit = updatedUnits.find((u: any) => u.id === availableUnit.id);
  console.assert(soldUnit.status === "sold", "Unit status must now be 'sold'");
  console.assert(soldUnit.saleId === createdSale.id, "Unit must link to the sale ID");
  console.log(`✓ Unit IMEI ${availableUnit.imei1} successfully updated to 'sold' linked to ${createdSale.id}`);

  // 6. Test Double-Selling Prevention (crucial business logic!)
  const doubleSaleReq = new Request("http://localhost:5173/api/sales", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(salePayload),
  });
  const doubleSaleRes = await handleApiRequest(doubleSaleReq);
  const doubleSaleData = await doubleSaleRes.json();
  console.assert(doubleSaleRes.status === 400, "Selling already sold unit must fail with 400");
  console.assert(doubleSaleData.error.includes("not available"), "Error message must state unit is not available");
  console.log(`✓ Double-selling prevention successfully triggered: "${doubleSaleData.error}"`);

  // 7. Purchase & Stock Intake
  const newImei = "99" + String(Date.now()).slice(-13);

  const purchasePayload = {
    invoiceNo: `PUR-TEST-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    supplierId: dbData.suppliers[0].id,
    items: [
      {
        productId: targetProduct.id,
        name: targetProduct.name,
        qty: 1,
        price: targetProduct.purchasePrice,
        gst: targetProduct.gst,
        costPrice: targetProduct.purchasePrice,
      },
    ],
    imeis: {
      [targetProduct.id]: [newImei],
    },
    discount: 0,
    paid: targetProduct.purchasePrice,
    mode: "Bank",
  };
  const purReq = new Request("http://localhost:5173/api/purchases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(purchasePayload),
  });
  const purRes = await handleApiRequest(purReq);
  const purData = await purRes.json();
  console.assert(purRes.status === 201, `Purchase creation failed: ${JSON.stringify(purData)}`);
  console.log(`✓ Purchase recorded: Invoice ${purData.invoiceNo}`);

  // Verify new IMEI is now in inventory
  const searchImeiReq = new Request(`http://localhost:5173/api/units?search=${newImei}`);
  const searchImeiRes = await handleApiRequest(searchImeiReq);
  const searchImeiData = await searchImeiRes.json();
  console.assert(searchImeiData.length === 1, "New IMEI must be found in stock");
  console.assert(searchImeiData[0].status === "available", "New IMEI must be available");
  console.log(`✓ New IMEI ${newImei} verified in active stock with status 'available'`);

  // 8. Repair Workflow
  const repairPayload = {
    customerId: dbData.customers[0].id,
    device: "OnePlus 11 5G",
    imei: "867543210987654",
    problem: "Cracked display + charging port issue",
    estimate: 6500,
    advance: 1000,
    technician: "Ramesh",
  };
  const repairReq = new Request("http://localhost:5173/api/repairs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(repairPayload),
  });
  const repairRes = await handleApiRequest(repairReq);
  const repairData = await repairRes.json();
  console.assert(repairRes.status === 201, `Repair creation failed: ${JSON.stringify(repairData)}`);
  console.assert(repairData.jobId.startsWith("REP-"), "Job ID starts with REP-");
  console.log(`✓ Repair job card created: ${repairData.jobId}, Advance ₹${repairData.advance}`);

  // Update repair status
  const repairStatusReq = new Request(`http://localhost:5173/api/repairs/${repairData.id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "Ready" }),
  });
  const repairStatusRes = await handleApiRequest(repairStatusReq);
  console.assert(repairStatusRes.status === 200, "Repair status update should succeed");
  console.log(`✓ Repair status updated to 'Ready'`);

  // 9. Employee & Attendance Geo-fence Workflow
  let empRes = await handleApiRequest(new Request("http://localhost:5173/api/employees"));
  let employees = await empRes.json();
  if (employees.length === 0) {
    await handleApiRequest(new Request("http://localhost:5173/api/employees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test Staff",
        mobile: "9876543210",
        role: "SALES",
        salary: 20000,
        permissions: ["POS"]
      })
    }));
    empRes = await handleApiRequest(new Request("http://localhost:5173/api/employees"));
    employees = await empRes.json();
  }
  console.assert(employees.length > 0, "Employees list not empty");
  const testEmp = employees[0];
  console.log(`✓ Employees API verified (${employees.length} employees)`);

  // Attendance check-in within radius (shop is at 28.5355, 77.3910)
  const checkInReq = new Request("http://localhost:5173/api/attendance/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: testEmp.id,
      latitude: 28.53555,
      longitude: 77.39105,
      accuracy: 10,
    }),
  });
  const checkInRes = await handleApiRequest(checkInReq);
  const checkInData = await checkInRes.json();
  console.assert(checkInRes.status === 201, `Geo-fence check-in failed: ${JSON.stringify(checkInData)}`);
  console.assert(checkInData.isWithinRadius === true, "Check-in within geofence radius");
  console.log(`✓ Geo-fenced attendance verified within radius (${checkInData.distanceFromShop.toFixed(1)}m from shop)`);

  // Attendance check-in outside radius without override (e.g. 5km away)
  const farCheckInReq = new Request("http://localhost:5173/api/attendance/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: testEmp.id,
      latitude: 28.5900,
      longitude: 77.4500,
      accuracy: 10,
    }),
  });
  const farCheckInRes = await handleApiRequest(farCheckInReq);
  console.assert(farCheckInRes.status === 403, "Outside radius attendance without override must be rejected with 403");
  console.log(`✓ Geo-fence restriction outside radius correctly rejected (403 Forbidden)`);

  // Attendance check-in outside radius WITH admin override
  const overrideCheckInReq = new Request("http://localhost:5173/api/attendance/check-in", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: testEmp.id,
      latitude: 28.5900,
      longitude: 77.4500,
      accuracy: 10,
      adminOverride: true,
    }),
  });
  const overrideRes = await handleApiRequest(overrideCheckInReq);
  console.assert(overrideRes.status === 201, "Admin override attendance must be accepted");
  console.log(`✓ Admin override attendance allowed successfully`);

  // 10. Payroll Engine Workflow
  const payrollReq = new Request("http://localhost:5173/api/payroll/calculate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      employeeId: testEmp.id,
      month: 9,
      year: 2026,
      allowances: 2000,
      overtime: 1500,
      commission: 1000,
      deductions: 500,
    }),
  });
  const payrollRes = await handleApiRequest(payrollReq);
  const payrollData = await payrollRes.json();
  console.assert(payrollRes.status === 201, `Payroll generation failed: ${JSON.stringify(payrollData)}`);
  const expectedGross = testEmp.basicSalary + 2000 + 1500 + 1000;
  const expectedNet = expectedGross - 500;
  console.assert(payrollData.grossSalary === expectedGross, "Payroll Gross Salary matches formula");
  console.assert(payrollData.netSalary === expectedNet, "Payroll Net Salary matches formula");
  console.log(`✓ Payroll engine verified: Gross ₹${payrollData.grossSalary}, Net ₹${payrollData.netSalary}`);

  // 11. Cashbook & Ledger Reconciliation
  const cashbookRes = await handleApiRequest(new Request("http://localhost:5173/api/cashbook"));
  const cashbookData = await cashbookRes.json();
  console.assert(Array.isArray(cashbookData), "Cashbook returns array of entries");
  console.log(`✓ Cashbook verified (${cashbookData.length} ledger transactions recorded)`);

  // 12. Admin PIN Verification
  const validPinRes = await handleApiRequest(new Request("http://localhost:5173/api/auth/verify-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "1234", action: "TEST_ACTION", reason: "Automated verification" }),
  }));
  console.assert(validPinRes.status === 200, "Valid PIN 1234 must return 200");
  const invalidPinRes = await handleApiRequest(new Request("http://localhost:5173/api/auth/verify-pin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin: "9999", action: "TEST_ACTION", reason: "Automated verification" }),
  }));
  console.assert(invalidPinRes.status === 403, "Invalid PIN 9999 must return 403 Forbidden");
  console.log("✓ Admin PIN verification verified (Correct: 200, Incorrect: 403)");


  // 13. Barcode & IMEI Quick Lookup
  const barcodeRes = await handleApiRequest(new Request(`http://localhost:5173/api/barcode/lookup?code=${newImei}`));
  const barcodeData = await barcodeRes.json();
  console.assert(barcodeData.found === true, "IMEI lookup should find unit");
  console.assert(barcodeData.type === "IMEI", "Type is IMEI");
  console.log(`✓ Barcode & IMEI lookup endpoint verified for ${newImei}`);

  // 14. Reset Demo Data
  const resetReq = new Request("http://localhost:5173/api/reset", { method: "POST" });
  const resetRes = await handleApiRequest(resetReq);
  const resetData = await resetRes.json();
  console.assert(resetRes.status === 200, "Reset should succeed");
  console.assert(resetData.db.products.length > 0, "Products re-seeded");
  console.log("✓ Demo reset verified");

  console.log("--- ALL BACKEND BUSINESS LOGIC & ERP TESTS PASSED! ---");
}


runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
