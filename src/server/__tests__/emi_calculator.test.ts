import { describe, expect, it, beforeAll } from "bun:test";
import { getDB } from "../db/client";
import { calculateEMI, round2, validateEMIInputs } from "../../lib/emi";
import {
  createFinanceCompany,
  createEMIAccountAndSchedule,
  getEMIAccountById,
  recordEMICustomerPayment,
  forecloseEMIAccount,
  getComprehensiveEMIReport,
  checkEmiPermission,
} from "../services/emiService";
import { createSale } from "../services/salesService";

describe("Mobile Shop ERP - Full EMI Calculator & Management Test Suite", () => {
  let db: any;
  let testCompanyId: string;
  let testCustomerId: string;
  let testProductId: string;

  beforeAll(() => {
    db = getDB();

    // Ensure test customer exists
    const cust = db.prepare("SELECT id FROM customers LIMIT 1").get() as any;
    if (cust) {
      testCustomerId = cust.id;
    } else {
      testCustomerId = "cust_test_emi";
      db.prepare(`
        INSERT INTO customers (id, business_id, branch_id, name, mobile, phone, address, created_at)
        VALUES (?, 'biz_default', 'branch_01', 'Rahul Sharma', '9811098110', '9811098110', 'Indore', datetime('now'))
      `).run(testCustomerId);
    }

    // Ensure test product exists with available stock
    const prod = db.prepare("SELECT id FROM products WHERE qty > 0 LIMIT 1").get() as any;
    if (prod) {
      testProductId = prod.id;
    } else {
      testProductId = "prod_test_emi_" + Date.now();
      db.prepare(`
        INSERT INTO products (id, name, category, brand, model, purchase_price, selling_price, qty, tracked)
        VALUES (?, 'OPPO F33 PRO 5G', 'Mobiles', 'OPPO', 'F33 PRO', 12000, 15000, 10, 0)
      `).run(testProductId);
    }

    // Ensure finance company exists
    const fc = createFinanceCompany(db, {
      companyName: "Bajaj Finserv EMI",
      contactPerson: "Rajesh Joshi",
      mobile: "9876543210",
      email: "bajaj@store.in",
      settlementDays: 3,
      processingFee: 500,
      defaultInterestRate: 12,
      defaultTenure: 12,
      active: true,
    });
    testCompanyId = fc.id;
  });

  // =========================================================================
  // 1. SECTION 24 TEST CASE: 12% ANNUAL REDUCING BALANCE
  // =========================================================================
  describe("Section 24: Annual Reducing Balance Calculation", () => {
    it("calculates dynamically: Price=₹15,000, Down=₹5,000, Financed=₹10,000, Rate=12%, Tenure=12M", () => {
      const result = calculateEMI({
        productPrice: 15000,
        discount: 0,
        downPayment: 5000,
        interestRate: 12,
        interestType: "ANNUAL_REDUCING",
        tenureMonths: 12,
        processingFee: 500,
        otherCharges: 0,
        firstEmiDate: "2026-10-10",
      });

      // 1. Verify Finance Amount
      expect(result.finalSaleAmount).toBe(15000);
      expect(result.financeAmount).toBe(10000);

      // 2. Verify monthly EMI formula output
      // P = 10000, r = 0.01, n = 12 -> raw EMI ~ 888.4878 -> rounded 888.49
      expect(result.monthlyEmi).toBe(888.49);

      // 3. Verify exactly 12 EMI rows generated
      expect(result.schedule.length).toBe(12);

      // 4. Verify schedule integrity and exact ₹10,000 principal repayment
      let sumPrincipal = 0;
      let sumInterest = 0;

      for (let i = 0; i < result.schedule.length; i++) {
        const row = result.schedule[i];
        expect(row.installmentNo).toBe(i + 1);
        expect(row.openingPrincipal).toBeGreaterThan(0);
        expect(row.principal).toBeGreaterThan(0);
        expect(row.interest).toBeGreaterThanOrEqual(0);
        sumPrincipal = round2(sumPrincipal + row.principal);
        sumInterest = round2(sumInterest + row.interest);
      }

      // Total Principal repayment must exactly equal ₹10,000.00
      expect(sumPrincipal).toBe(10000);
      expect(result.totalPrincipalRepayment).toBe(10000);

      // Final installment closing principal MUST be ₹0.00
      const finalRow = result.schedule[11];
      expect(finalRow.closingPrincipal).toBe(0.0);

      // Total interest must match accumulated interest
      expect(result.totalInterest).toBe(sumInterest);
      expect(result.totalInterest).toBeGreaterThan(600);
      expect(result.totalInterest).toBeLessThan(700);

      // Total Payable = Principal + Total Interest + Processing Fee
      expect(result.totalPayable).toBe(round2(10000 + result.totalInterest + 500));
    });
  });

  // =========================================================================
  // 2. SECTION 24 TEST CASE: ZERO INTEREST (0%)
  // =========================================================================
  describe("Section 24: Zero Interest (0%) Calculation", () => {
    it("calculates zero interest without division-by-zero error", () => {
      const result = calculateEMI({
        productPrice: 15000,
        discount: 0,
        downPayment: 5000,
        interestRate: 0,
        interestType: "ZERO_INTEREST",
        tenureMonths: 12,
        processingFee: 500,
        otherCharges: 0,
        firstEmiDate: "2026-10-10",
      });

      expect(result.financeAmount).toBe(10000);
      expect(result.totalInterest).toBe(0);

      // EMI = 10000 / 12 = 833.33
      expect(result.monthlyEmi).toBe(833.33);

      expect(result.schedule.length).toBe(12);

      // Sum of principal must equal exactly 10,000
      const sumPrincipal = result.schedule.reduce((s, r) => round2(s + r.principal), 0);
      expect(sumPrincipal).toBe(10000);

      // Final row closing principal must be 0
      expect(result.schedule[11].closingPrincipal).toBe(0.0);
    });
  });

  // =========================================================================
  // 3. SECTION 24 TEST CASE: FLAT RATE
  // =========================================================================
  describe("Section 24: Flat Rate Calculation", () => {
    it("calculates flat rate interest using Principal × Rate × Years", () => {
      // P = 10,000, Rate = 12%, Tenure = 12M (1 year), Fee = 500
      // Interest = 10000 * 0.12 * 1 = 1200
      // Total Payable = 10000 + 1200 + 500 = 11700
      // Monthly EMI = 11700 / 12 = 975
      const result = calculateEMI({
        productPrice: 15000,
        discount: 0,
        downPayment: 5000,
        interestRate: 12,
        interestType: "FLAT_RATE",
        tenureMonths: 12,
        processingFee: 500,
        otherCharges: 0,
        firstEmiDate: "2026-10-10",
      });

      expect(result.financeAmount).toBe(10000);
      expect(result.totalInterest).toBe(1200);
      expect(result.totalPayable).toBe(11700);
      expect(result.monthlyEmi).toBe(975);

      expect(result.schedule.length).toBe(12);
      expect(result.schedule[11].closingPrincipal).toBe(0.0);
    });
  });

  // =========================================================================
  // 4. INPUT VALIDATIONS
  // =========================================================================
  describe("Input Validations", () => {
    it("rejects down payment greater than final sale amount", () => {
      const v = validateEMIInputs({
        productPrice: 15000,
        discount: 0,
        downPayment: 16000,
        interestRate: 12,
        tenureMonths: 12,
      });
      expect(v.valid).toBe(false);
      expect(v.errors.downPayment).toBeDefined();
    });

    it("rejects negative interest rate", () => {
      const v = validateEMIInputs({
        productPrice: 15000,
        discount: 0,
        downPayment: 5000,
        interestRate: -5,
        tenureMonths: 12,
      });
      expect(v.valid).toBe(false);
      expect(v.errors.interestRate).toBeDefined();
    });

    it("rejects zero tenure", () => {
      const v = validateEMIInputs({
        productPrice: 15000,
        discount: 0,
        downPayment: 5000,
        interestRate: 12,
        tenureMonths: 0,
      });
      expect(v.valid).toBe(false);
      expect(v.errors.tenureMonths).toBeDefined();
    });
  });

  // =========================================================================
  // 5. EMI SALE TRANSACTION & REPAYMENT LIFECYCLE
  // =========================================================================
  describe("EMI Sale Transaction & Repayment Lifecycle", () => {
    let createdSaleId: string;
    let createdAccountId: string;

    it("creates an EMI sale via POS and links sale, finance receivable, and customer EMI account", () => {
      const sale = createSale(db, {
        customerId: testCustomerId,
        invoiceType: "GST",
        items: [
          {
            productId: testProductId,
            name: "OPPO F33 PRO 5G",
            qty: 1,
            price: 15000,
            gst: 18,
            costPrice: 12000,
          },
        ],
        discount: 0,
        payments: [
          { mode: "Cash", amount: 5000 },
          { mode: "EMI", amount: 10000 },
        ],
        isEmi: true,
        emiCompanyId: testCompanyId,
        emiDownPayment: 5000,
        emiFinancedAmount: 10000,
        interestRate: 12,
        interestType: "ANNUAL_REDUCING",
        tenureMonths: 12,
        processingFee: 500,
        firstEmiDate: "2026-10-10",
        user: "Cashier 01",
      });

      expect(sale.id).toBeDefined();
      expect(sale.total).toBe(15000);
      expect(sale.paid).toBe(5000); // Only customer cash down payment is cash received!
      createdSaleId = sale.id;

      // Verify emi_account was created
      const acctRow = db.prepare("SELECT * FROM emi_accounts WHERE sale_id = ?").get(sale.id) as any;
      expect(acctRow).toBeDefined();
      expect(acctRow.customer_id).toBe(testCustomerId);
      expect(acctRow.finance_amount).toBe(10000);
      expect(acctRow.status).toBe("ACTIVE");
      createdAccountId = acctRow.id;

      // Verify 12 schedule installments
      const sched = db
        .prepare("SELECT * FROM emi_schedules WHERE emi_account_id = ? ORDER BY installment_number ASC")
        .all(acctRow.id) as any[];
      expect(sched.length).toBe(12);
      expect(sched[0].status).toBe("PENDING");
    });

    it("records customer EMI installment payment, updates status and outstanding", () => {
      const accountBefore = getEMIAccountById(db, createdAccountId)!;
      const paymentAmount = accountBefore.monthlyEmi;

      const { payment, account } = recordEMICustomerPayment(db, {
        emiAccountId: createdAccountId,
        installmentNumber: 1,
        amount: paymentAmount,
        paymentMode: "UPI",
        referenceNumber: "UPI-TXN-98421",
        remarks: "Month 1 EMI",
      });

      expect(payment.id).toBeDefined();
      expect(payment.amount).toBe(paymentAmount);
      expect(account.totalPaid).toBe(paymentAmount);
      expect(account.outstandingAmount).toBe(round2(accountBefore.totalPayable - paymentAmount));

      // Verify first schedule installment is marked PAID
      const updatedSchedule = account.schedule!;
      expect(updatedSchedule[0].status).toBe("PAID");
      expect(updatedSchedule[1].status).toBe("PENDING");
    });

    it("forecloses / pre-closes EMI account safely without deleting schedule", () => {
      const { summary, account } = forecloseEMIAccount(db, {
        emiAccountId: createdAccountId,
        foreclosureCharges: 200,
        otherCharges: 0,
        paymentMode: "Bank",
        referenceNumber: "NEFT-CLOSE-492",
        remarks: "Customer cleared full loan early",
      });

      expect(summary.finalSettlementAmount).toBeGreaterThan(0);
      expect(account.status).toBe("PAID");
      expect(account.outstandingAmount).toBe(0);
      expect(account.foreclosedAt).toBeDefined();

      // Ensure schedule rows are preserved and marked PAID
      const schedule = account.schedule!;
      expect(schedule.length).toBe(12);
      for (const row of schedule) {
        expect(row.status).toBe("PAID");
      }
    });

    it("generates comprehensive EMI report with KPI metrics and overdue analysis", () => {
      const report = getComprehensiveEMIReport(db, {
        customerId: testCustomerId,
      });

      expect(report.metrics).toBeDefined();
      expect(report.metrics.totalEmiSales).toBeGreaterThan(0);
      expect(report.metrics.totalFinanceAmount).toBeGreaterThan(0);
      expect(report.accounts.length).toBeGreaterThan(0);
    });

    it("checks RBAC permissions for EMI actions", () => {
      // Admin should have all permissions
      const adminCanView = checkEmiPermission(db, "emp_admin", "EMI_CALCULATOR_VIEW");
      expect(adminCanView).toBe(true);

      const adminCanForeclose = checkEmiPermission(db, "emp_admin", "EMI_FORECLOSE");
      expect(adminCanForeclose).toBe(true);
    });
  });
});
