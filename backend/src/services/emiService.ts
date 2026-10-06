import type { DatabaseSync } from "node:sqlite";
import { todayISO, uid } from "../../../shared/utils/format";
import type {
  EMIAccount,
  EMIAccountStatus,
  EMICalculatorInputs,
  EMICustomerPayment,
  EMIForeclosureSummary,
  EMIReceivable,
  EMIReceipt,
  EMIReportFilters,
  EMIScheduleRow,
  EMIStatus,
  FinanceCompany,
  InterestType,
} from "../../../shared/types";
import { calculateEMI, round2 } from "../../../shared/utils/emi";
import { logAudit } from "./auditService";
import { recordCashbookEntry } from "./ledgerService";

export interface CreateEMIReceivableInput {
  businessId?: string;
  branchId?: string;
  emiCompanyId: string;
  emiCompanyName?: string;
  financeReferenceNumber?: string;
  customerId: string;
  customerName: string;
  customerMobile?: string;
  invoiceId: string;
  saleId: string;
  productId: string;
  imei?: string;
  totalAmount: number;
  downPayment: number;
  emiFinancedAmount: number;
  processingFee?: number;
  otherCharges?: number;
  expectedPaymentDate?: string;
  notes?: string;
  createdBy?: string;
}

export interface RecordEMIReceiptInput {
  businessId?: string;
  branchId?: string;
  emiReceivableId: string;
  amountReceived: number;
  receivedDate?: string;
  paymentMethod: "BANK_TRANSFER" | "UPI" | "CASH" | "OTHER";
  bankReference?: string;
  notes?: string;
  receivedBy?: string;
}

export function getFinanceCompanies(db: DatabaseSync): FinanceCompany[] {
  const rows = db.prepare("SELECT * FROM finance_companies ORDER BY company_name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    companyName: r.company_name,
    contactPerson: r.contact_person ?? undefined,
    mobile: r.mobile ?? undefined,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    settlementDays: r.settlement_days || 7,
    processingFee: r.processing_fee || 0,
    defaultInterestRate: r.default_interest_rate ?? 0,
    defaultTenure: r.default_tenure ?? 12,
    notes: r.notes ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));
}

export function createFinanceCompany(
  db: DatabaseSync,
  input: Omit<FinanceCompany, "id" | "createdAt">
): FinanceCompany {
  const id = uid("fc");
  const now = new Date().toISOString();
  const bId = input.businessId || "biz_default";

  const stmt = db.prepare(`
    INSERT INTO finance_companies (
      id, business_id, company_name, contact_person, mobile, email, address,
      settlement_days, processing_fee, default_interest_rate, default_tenure, notes, active, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    bId,
    input.companyName,
    input.contactPerson ?? null,
    input.mobile ?? null,
    input.email ?? null,
    input.address ?? null,
    input.settlementDays || 7,
    input.processingFee || 0,
    input.defaultInterestRate || 0,
    input.defaultTenure || 12,
    input.notes ?? null,
    input.active ? 1 : 0,
    now
  );

  return {
    id,
    businessId: bId,
    companyName: input.companyName,
    contactPerson: input.contactPerson,
    mobile: input.mobile,
    email: input.email,
    address: input.address,
    settlementDays: input.settlementDays || 7,
    processingFee: input.processingFee || 0,
    defaultInterestRate: input.defaultInterestRate || 0,
    defaultTenure: input.defaultTenure || 12,
    notes: input.notes,
    active: input.active !== false,
    createdAt: now,
  };
}

export function updateFinanceCompany(
  db: DatabaseSync,
  id: string,
  input: Partial<Omit<FinanceCompany, "id" | "createdAt">>
): FinanceCompany {
  const current = db.prepare("SELECT * FROM finance_companies WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Finance Company '${id}' not found`);

  const updated = {
    companyName: input.companyName ?? current.company_name,
    contactPerson: input.contactPerson !== undefined ? input.contactPerson : current.contact_person,
    mobile: input.mobile !== undefined ? input.mobile : current.mobile,
    email: input.email !== undefined ? input.email : current.email,
    address: input.address !== undefined ? input.address : current.address,
    settlementDays: input.settlementDays !== undefined ? input.settlementDays : current.settlement_days,
    processingFee: input.processingFee !== undefined ? input.processingFee : current.processing_fee,
    defaultInterestRate: input.defaultInterestRate !== undefined ? input.defaultInterestRate : (current.default_interest_rate || 0),
    defaultTenure: input.defaultTenure !== undefined ? input.defaultTenure : (current.default_tenure || 12),
    notes: input.notes !== undefined ? input.notes : current.notes,
    active: input.active !== undefined ? (input.active ? 1 : 0) : current.active,
  };

  db.prepare(`
    UPDATE finance_companies
    SET company_name = ?, contact_person = ?, mobile = ?, email = ?, address = ?,
        settlement_days = ?, processing_fee = ?, default_interest_rate = ?, default_tenure = ?, notes = ?, active = ?
    WHERE id = ?
  `).run(
    updated.companyName,
    updated.contactPerson ?? null,
    updated.mobile ?? null,
    updated.email ?? null,
    updated.address ?? null,
    updated.settlementDays || 7,
    updated.processingFee || 0,
    updated.defaultInterestRate,
    updated.defaultTenure,
    updated.notes ?? null,
    updated.active,
    id
  );

  return {
    id,
    businessId: current.business_id,
    companyName: updated.companyName,
    contactPerson: updated.contactPerson ?? undefined,
    mobile: updated.mobile ?? undefined,
    email: updated.email ?? undefined,
    address: updated.address ?? undefined,
    settlementDays: updated.settlementDays,
    processingFee: updated.processingFee,
    defaultInterestRate: updated.defaultInterestRate,
    defaultTenure: updated.defaultTenure,
    notes: updated.notes ?? undefined,
    active: Boolean(updated.active),
    createdAt: current.created_at,
  };
}

export function deleteFinanceCompany(db: DatabaseSync, id: string): boolean {
  const count = db.prepare("SELECT COUNT(*) as cnt FROM emi_receivables WHERE emi_company_id = ?").get(id) as any;
  if (count && count.cnt > 0) {
    db.prepare("UPDATE finance_companies SET active = 0 WHERE id = ?").run(id);
    return true;
  }
  db.prepare("DELETE FROM finance_companies WHERE id = ?").run(id);
  return true;
}

export function createEMIReceivable(
  db: DatabaseSync,
  input: CreateEMIReceivableInput
): EMIReceivable {
  const id = uid("emi");
  const now = new Date().toISOString();
  const bId = input.businessId || "biz_default";
  const branchId = input.branchId || "branch_01";
  const date = todayISO();

  // If company name not given, look up
  let companyName = input.emiCompanyName;
  if (!companyName) {
    const comp = db.prepare("SELECT company_name FROM finance_companies WHERE id = ?").get(input.emiCompanyId) as any;
    companyName = comp?.company_name || "Finance Company";
  }

  const processingFee = input.processingFee || 0;
  const otherCharges = input.otherCharges || 0;
  // Net receivable from finance company = Financed Amount - Processing Fee + Other Charges
  const netReceivable = Math.max(0, input.emiFinancedAmount - processingFee + otherCharges);

  const stmt = db.prepare(`
    INSERT INTO emi_receivables (
      id, business_id, branch_id, emi_company_id, emi_company_name, finance_reference_number,
      customer_id, customer_name, customer_mobile, invoice_id, sale_id, product_id, imei,
      total_amount, down_payment, emi_financed_amount, processing_fee, other_charges,
      net_receivable, received_amount, emi_sale_date, expected_payment_date,
      status, notes, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 'EMI_PENDING', ?, ?, ?)
  `);

  stmt.run(
    id,
    bId,
    branchId,
    input.emiCompanyId,
    companyName,
    input.financeReferenceNumber ?? null,
    input.customerId,
    input.customerName,
    input.customerMobile ?? null,
    input.invoiceId,
    input.saleId,
    input.productId,
    input.imei ?? null,
    input.totalAmount,
    input.downPayment,
    input.emiFinancedAmount,
    processingFee,
    otherCharges,
    netReceivable,
    date,
    input.expectedPaymentDate ?? null,
    input.notes ?? null,
    input.createdBy ?? "Staff",
    now
  );

  logAudit(db, {
    action: "CREATE_EMI_RECEIVABLE",
    module: "EMI_SALES",
    recordId: id,
    newValue: {
      id,
      company: companyName,
      financedAmount: input.emiFinancedAmount,
      invoice: input.invoiceId,
      customer: input.customerName,
    },
    reason: `Created EMI receivable for Invoice ${input.invoiceId}`,
  });

  return {
    id,
    businessId: bId,
    branchId,
    emiCompanyId: input.emiCompanyId,
    emiCompanyName: companyName,
    financeReferenceNumber: input.financeReferenceNumber,
    customerId: input.customerId,
    customerName: input.customerName,
    customerMobile: input.customerMobile,
    invoiceId: input.invoiceId,
    saleId: input.saleId,
    productId: input.productId,
    imei: input.imei,
    totalAmount: input.totalAmount,
    downPayment: input.downPayment,
    emiFinancedAmount: input.emiFinancedAmount,
    processingFee,
    otherCharges,
    netReceivable,
    receivedAmount: 0,
    emiSaleDate: date,
    expectedPaymentDate: input.expectedPaymentDate,
    status: "EMI_PENDING",
    notes: input.notes,
    createdBy: input.createdBy,
    createdAt: now,
  };
}

export function recordEMIReceipt(
  db: DatabaseSync,
  input: RecordEMIReceiptInput
): { receipt: EMIReceipt; receivable: EMIReceivable } {
  const receivable = db.prepare("SELECT * FROM emi_receivables WHERE id = ?").get(input.emiReceivableId) as any;
  if (!receivable) {
    throw new Error(`EMI Receivable '${input.emiReceivableId}' not found`);
  }

  if (receivable.status === "RECEIVED") {
    throw new Error("This EMI receivable has already been fully received.");
  }

  if (input.amountReceived <= 0) {
    throw new Error("Amount received must be greater than zero");
  }

  const remaining = Math.max(0, receivable.net_receivable - receivable.received_amount);
  if (input.amountReceived > remaining) {
    throw new Error(`Amount received (₹${input.amountReceived}) exceeds remaining receivable (₹${remaining})`);
  }

  const receiptId = uid("emircp");
  const now = new Date().toISOString();
  const date = input.receivedDate || todayISO();
  const bId = input.businessId || receivable.business_id || "biz_default";
  const branchId = input.branchId || receivable.branch_id || "branch_01";

  // 1. Insert EMI Receipt
  const insertReceipt = db.prepare(`
    INSERT INTO emi_receipts (
      id, business_id, branch_id, emi_receivable_id, amount_received,
      received_date, payment_method, bank_reference, notes, received_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertReceipt.run(
    receiptId,
    bId,
    branchId,
    input.emiReceivableId,
    input.amountReceived,
    date,
    input.paymentMethod,
    input.bankReference ?? null,
    input.notes ?? null,
    input.receivedBy ?? "Staff",
    now
  );

  // 2. Update Receivable status and totals
  const newReceivedTotal = receivable.received_amount + input.amountReceived;
  const newStatus: EMIStatus = newReceivedTotal >= receivable.net_receivable ? "RECEIVED" : "PARTIALLY_RECEIVED";

  db.prepare(`
    UPDATE emi_receivables
    SET received_amount = ?,
        status = ?,
        received_date = ?,
        payment_method = ?,
        received_by = ?
    WHERE id = ?
  `).run(
    newReceivedTotal,
    newStatus,
    date,
    input.paymentMethod,
    input.receivedBy ?? "Staff",
    input.emiReceivableId
  );

  // 3. Update Cashbook / Bank Ledger
  // When finance company settles, increase selected cash/bank balance
  recordCashbookEntry(
    db,
    "EMI_RECEIPT",
    input.emiReceivableId,
    "EMI_FINANCE_RECEIPT",
    input.amountReceived,
    0,
    `EMI Receipt (${input.paymentMethod}) from ${receivable.emi_company_name} for Inv #${receivable.invoice_id} (Ref: ${input.bankReference || receivable.finance_reference_number || "—"})`
  );

  // 4. Log Audit Trail
  logAudit(db, {
    action: "RECORD_EMI_RECEIPT",
    module: "EMI_RECEIVABLES",
    recordId: receiptId,
    oldValue: { status: receivable.status, receivedAmount: receivable.received_amount },
    newValue: { status: newStatus, receivedAmount: newReceivedTotal, receiptAmount: input.amountReceived },
    reason: `Recorded ${newStatus === "RECEIVED" ? "full" : "partial"} settlement of ₹${input.amountReceived} from ${receivable.emi_company_name}`,
  });

  const receipt: EMIReceipt = {
    id: receiptId,
    businessId: bId,
    branchId,
    emiReceivableId: input.emiReceivableId,
    amountReceived: input.amountReceived,
    receivedDate: date,
    paymentMethod: input.paymentMethod,
    bankReference: input.bankReference,
    notes: input.notes,
    receivedBy: input.receivedBy,
    createdAt: now,
  };

  const updatedReceivable: EMIReceivable = {
    id: receivable.id,
    businessId: receivable.business_id,
    branchId: receivable.branch_id,
    emiCompanyId: receivable.emi_company_id,
    emiCompanyName: receivable.emi_company_name,
    financeReferenceNumber: receivable.finance_reference_number,
    customerId: receivable.customer_id,
    customerName: receivable.customer_name,
    customerMobile: receivable.customer_mobile,
    invoiceId: receivable.invoice_id,
    saleId: receivable.sale_id,
    productId: receivable.product_id,
    imei: receivable.imei,
    totalAmount: receivable.total_amount,
    downPayment: receivable.down_payment,
    emiFinancedAmount: receivable.emi_financed_amount,
    processingFee: receivable.processing_fee,
    otherCharges: receivable.other_charges,
    netReceivable: receivable.net_receivable,
    receivedAmount: newReceivedTotal,
    emiSaleDate: receivable.emi_sale_date,
    expectedPaymentDate: receivable.expected_payment_date,
    receivedDate: date,
    paymentMethod: input.paymentMethod,
    status: newStatus,
    notes: receivable.notes,
    createdBy: receivable.created_by,
    receivedBy: input.receivedBy,
    createdAt: receivable.created_at,
  };

  return { receipt, receivable: updatedReceivable };
}

export interface EMIReceivableFilters {
  companyId?: string;
  status?: string;
  search?: string;
  fromDate?: string;
  toDate?: string;
}

export function getEMIReceivables(db: DatabaseSync, filters?: EMIReceivableFilters): EMIReceivable[] {
  let query = "SELECT * FROM emi_receivables WHERE 1=1";
  const params: any[] = [];

  if (filters?.companyId && filters.companyId !== "ALL") {
    query += " AND emi_company_id = ?";
    params.push(filters.companyId);
  }

  if (filters?.status && filters.status !== "ALL") {
    query += " AND status = ?";
    params.push(filters.status);
  }

  if (filters?.fromDate) {
    query += " AND emi_sale_date >= ?";
    params.push(filters.fromDate);
  }

  if (filters?.toDate) {
    query += " AND emi_sale_date <= ?";
    params.push(filters.toDate);
  }

  if (filters?.search) {
    const q = `%${filters.search.toLowerCase()}%`;
    query += " AND (LOWER(customer_name) LIKE ? OR LOWER(customer_mobile) LIKE ? OR LOWER(invoice_id) LIKE ? OR LOWER(imei) LIKE ? OR LOWER(finance_reference_number) LIKE ?)";
    params.push(q, q, q, q, q);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    emiCompanyId: r.emi_company_id,
    emiCompanyName: r.emi_company_name,
    financeReferenceNumber: r.finance_reference_number ?? undefined,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile ?? undefined,
    invoiceId: r.invoice_id,
    saleId: r.sale_id,
    productId: r.product_id,
    imei: r.imei ?? undefined,
    totalAmount: r.total_amount,
    downPayment: r.down_payment,
    emiFinancedAmount: r.emi_financed_amount,
    processingFee: r.processing_fee || 0,
    otherCharges: r.other_charges || 0,
    netReceivable: r.net_receivable,
    receivedAmount: r.received_amount || 0,
    emiSaleDate: r.emi_sale_date,
    expectedPaymentDate: r.expected_payment_date ?? undefined,
    receivedDate: r.received_date ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
    status: r.status as EMIStatus,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? undefined,
    receivedBy: r.received_by ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getEMIReceivableById(db: DatabaseSync, id: string): EMIReceivable | null {
  const r = db.prepare("SELECT * FROM emi_receivables WHERE id = ?").get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    emiCompanyId: r.emi_company_id,
    emiCompanyName: r.emi_company_name,
    financeReferenceNumber: r.finance_reference_number ?? undefined,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile ?? undefined,
    invoiceId: r.invoice_id,
    saleId: r.sale_id,
    productId: r.product_id,
    imei: r.imei ?? undefined,
    totalAmount: r.total_amount,
    downPayment: r.down_payment,
    emiFinancedAmount: r.emi_financed_amount,
    processingFee: r.processing_fee || 0,
    otherCharges: r.other_charges || 0,
    netReceivable: r.net_receivable,
    receivedAmount: r.received_amount || 0,
    emiSaleDate: r.emi_sale_date,
    expectedPaymentDate: r.expected_payment_date ?? undefined,
    receivedDate: r.received_date ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
    status: r.status as EMIStatus,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? undefined,
    receivedBy: r.received_by ?? undefined,
    createdAt: r.created_at,
  };
}

export function getEMIReceipts(db: DatabaseSync, filters?: { emiReceivableId?: string } | string): EMIReceipt[] {
  let query = "SELECT * FROM emi_receipts";
  const params: any[] = [];
  const recId = typeof filters === "string" ? filters : filters?.emiReceivableId;
  if (recId) {
    query += " WHERE emi_receivable_id = ?";
    params.push(recId);
  }
  query += " ORDER BY created_at DESC";
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    emiReceivableId: r.emi_receivable_id,
    amountReceived: r.amount_received,
    receivedDate: r.received_date,
    paymentMethod: r.payment_method,
    bankReference: r.bank_reference ?? undefined,
    notes: r.notes ?? undefined,
    receivedBy: r.received_by ?? undefined,
    createdAt: r.created_at,
  }));
}

export interface EMIDashboardMetrics {
  totalPendingAmount: number;
  totalPendingCount: number;
  totalPartiallyReceivedAmount: number;
  totalPartiallyReceivedCount: number;
  receivedThisMonthAmount: number;
  receivedThisMonthCount: number;
  totalReceivableAmount: number;
}

export function getEMIDashboardMetrics(db: DatabaseSync): EMIDashboardMetrics {
  const currentMonth = todayISO().slice(0, 7); // YYYY-MM

  // Pending
  const pending = db.prepare(`
    SELECT COUNT(*) as count, SUM(net_receivable - received_amount) as total
    FROM emi_receivables
    WHERE status = 'EMI_PENDING'
  `).get() as any;

  // Partially Received
  const partial = db.prepare(`
    SELECT COUNT(*) as count, SUM(net_receivable - received_amount) as remaining
    FROM emi_receivables
    WHERE status = 'PARTIALLY_RECEIVED'
  `).get() as any;

  // Received this month
  const receivedMonth = db.prepare(`
    SELECT COUNT(*) as count, SUM(amount_received) as total
    FROM emi_receipts
    WHERE received_date LIKE ?
  `).get(`${currentMonth}%`) as any;

  // Total Receivable across all active
  const totalReceivable = db.prepare(`
    SELECT SUM(net_receivable - received_amount) as total
    FROM emi_receivables
    WHERE status IN ('EMI_PENDING', 'PARTIALLY_RECEIVED')
  `).get() as any;

  return {
    totalPendingAmount: pending?.total || 0,
    totalPendingCount: pending?.count || 0,
    totalPartiallyReceivedAmount: partial?.remaining || 0,
    totalPartiallyReceivedCount: partial?.count || 0,
    receivedThisMonthAmount: receivedMonth?.total || 0,
    receivedThisMonthCount: receivedMonth?.count || 0,
    totalReceivableAmount: totalReceivable?.total || 0,
  };
}

// =========================================================================
// CUSTOMER EMI ACCOUNTS & SCHEDULES MANAGEMENT
// =========================================================================

export interface CreateEMIAccountInput extends EMICalculatorInputs {
  businessId?: string;
  branchId?: string;
  saleId?: string;
  invoiceId: string;
  createdBy?: string;
}

export function createEMIAccountAndSchedule(
  db: DatabaseSync,
  input: CreateEMIAccountInput
): EMIAccount {
  const id = uid("emiacct");
  const now = new Date().toISOString();
  const bId = input.businessId || "biz_default";
  const branchId = input.branchId || "branch_01";

  // Run mathematical calculation
  const calc = calculateEMI(input);

  const productPrice = calc.productPrice;
  const discount = calc.discount;
  const saleAmount = calc.finalSaleAmount;
  const downPayment = calc.downPayment;
  const financeAmount = calc.financeAmount;
  const interestRate = calc.interestRate;
  const interestType = calc.interestType;
  const tenureMonths = calc.tenureMonths;
  const processingFee = calc.processingFee;
  const otherCharges = calc.otherCharges;
  const firstEmiDate = calc.firstEmiDate;
  const monthlyEmi = calc.monthlyEmi;
  const totalInterest = calc.totalInterest;
  const totalPayable = calc.totalPayable;
  const outstandingAmount = totalPayable;

  if (!input.financeCompanyId) {
    throw new Error("Finance/EMI Company is required to create an EMI account.");
  }

  const financeCompany = db.prepare(`
    SELECT id, company_name
    FROM finance_companies
    WHERE id = ? AND active = 1
  `).get(input.financeCompanyId) as {
    id: string;
    company_name: string;
  } | undefined;

  if (!financeCompany) {
    throw new Error("Selected Finance/EMI Company is invalid or inactive.");
  }

  const companyName = financeCompany.company_name;

  // 1. Insert EMI Account
  const insertAcct = db.prepare(`
    INSERT INTO emi_accounts (
      id, business_id, branch_id, sale_id, invoice_id, customer_id, customer_name, customer_mobile,
      product_id, product_name, imei, finance_company_id, finance_company_name,
      product_price, discount, sale_amount, down_payment, finance_amount,
      interest_rate, interest_type, tenure_months, processing_fee, other_charges,
      first_emi_date, monthly_emi, total_interest, total_payable, total_paid,
      outstanding_amount, status, created_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, 0,
      ?, 'ACTIVE', ?, ?, ?
    )
  `);

  insertAcct.run(
    id,
    bId,
    branchId,
    input.saleId ?? null,
    input.invoiceId,
    input.customerId || "cust_walkin",
    input.customerName || "Walk-in Customer",
    input.customerMobile ?? null,
    input.productId ?? null,
    input.productName ?? null,
    input.imei ?? null,
    input.financeCompanyId ?? null,
    companyName ?? null,
    productPrice,
    discount,
    saleAmount,
    downPayment,
    financeAmount,
    interestRate,
    interestType,
    tenureMonths,
    processingFee,
    otherCharges,
    firstEmiDate,
    monthlyEmi,
    totalInterest,
    totalPayable,
    outstandingAmount,
    input.createdBy ?? "Staff",
    now,
    now
  );

  // 2. Insert Schedule Rows
  const insertSched = db.prepare(`
    INSERT INTO emi_schedules (
      id, emi_account_id, installment_number, due_date, opening_principal,
      emi_amount, interest_amount, principal_amount, closing_principal,
      paid_amount, paid_date, status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, null, 'PENDING', ?)
  `);

  for (const row of calc.schedule) {
    insertSched.run(
      uid("sch"),
      id,
      row.installmentNo,
      row.dueDate,
      row.openingPrincipal,
      row.emi,
      row.interest,
      row.principal,
      row.closingPrincipal,
      now
    );
  }

  logAudit(db, {
    action: "CREATE_EMI_ACCOUNT",
    module: "EMI_SALES",
    recordId: id,
    newValue: {
      id,
      invoice: input.invoiceId,
      customer: input.customerName,
      principal: financeAmount,
      tenure: tenureMonths,
      monthlyEmi,
    },
    reason: `Created EMI account and ${calc.schedule.length}-month repayment schedule for Inv #${input.invoiceId}`,
  });

  return {
    id,
    businessId: bId,
    branchId,
    saleId: input.saleId,
    invoiceId: input.invoiceId,
    customerId: input.customerId || "cust_walkin",
    customerName: input.customerName || "Walk-in Customer",
    customerMobile: input.customerMobile,
    productId: input.productId,
    productName: input.productName,
    imei: input.imei,
    financeCompanyId: input.financeCompanyId,
    financeCompanyName: companyName,
    productPrice,
    discount,
    saleAmount,
    downPayment,
    financeAmount,
    interestRate,
    interestType,
    tenureMonths,
    processingFee,
    otherCharges,
    firstEmiDate,
    monthlyEmi,
    totalInterest,
    totalPayable,
    totalPaid: 0,
    outstandingAmount,
    status: "ACTIVE",
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    schedule: calc.schedule,
  };
}

export function getEMIAccounts(
  db: DatabaseSync,
  filters?: { customerId?: string; status?: string; search?: string }
): EMIAccount[] {
  let query = "SELECT * FROM emi_accounts WHERE 1=1";
  const params: any[] = [];

  if (filters?.customerId) {
    query += " AND customer_id = ?";
    params.push(filters.customerId);
  }

  if (filters?.status && filters.status !== "ALL") {
    query += " AND status = ?";
    params.push(filters.status);
  }

  if (filters?.search) {
    const q = `%${filters.search.toLowerCase()}%`;
    query += " AND (LOWER(customer_name) LIKE ? OR LOWER(customer_mobile) LIKE ? OR LOWER(invoice_id) LIKE ? OR LOWER(imei) LIKE ? OR LOWER(product_name) LIKE ?)";
    params.push(q, q, q, q, q);
  }

  query += " ORDER BY created_at DESC";

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    saleId: r.sale_id ?? undefined,
    invoiceId: r.invoice_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile ?? undefined,
    productId: r.product_id ?? undefined,
    productName: r.product_name ?? undefined,
    imei: r.imei ?? undefined,
    financeCompanyId: r.finance_company_id ?? undefined,
    financeCompanyName: r.finance_company_name ?? undefined,
    productPrice: r.product_price,
    discount: r.discount,
    saleAmount: r.sale_amount,
    downPayment: r.down_payment,
    financeAmount: r.finance_amount,
    interestRate: r.interest_rate,
    interestType: r.interest_type as InterestType,
    tenureMonths: r.tenure_months,
    processingFee: r.processing_fee,
    otherCharges: r.other_charges,
    firstEmiDate: r.first_emi_date,
    monthlyEmi: r.monthly_emi,
    totalInterest: r.total_interest,
    totalPayable: r.total_payable,
    totalPaid: r.total_paid,
    outstandingAmount: r.outstanding_amount,
    status: r.status as EMIAccountStatus,
    foreclosedAt: r.foreclosed_at ?? undefined,
    foreclosureCharges: r.foreclosure_charges ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
  }));
}

export function getEMIAccountById(db: DatabaseSync, id: string): EMIAccount | null {
  const r = db.prepare("SELECT * FROM emi_accounts WHERE id = ?").get(id) as any;
  if (!r) return null;

  const schedRows = db
    .prepare("SELECT * FROM emi_schedules WHERE emi_account_id = ? ORDER BY installment_number ASC")
    .all(id) as any[];

  const schedule: EMIScheduleRow[] = schedRows.map((s) => ({
    installmentNo: s.installment_number,
    dueDate: s.due_date,
    openingPrincipal: s.opening_principal,
    emi: s.emi_amount,
    interest: s.interest_amount,
    principal: s.principal_amount,
    closingPrincipal: s.closing_principal,
    status: s.status,
    paidAmount: s.paid_amount || 0,
    paidDate: s.paid_date ?? undefined,
  }));

  return {
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    saleId: r.sale_id ?? undefined,
    invoiceId: r.invoice_id,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile ?? undefined,
    productId: r.product_id ?? undefined,
    productName: r.product_name ?? undefined,
    imei: r.imei ?? undefined,
    financeCompanyId: r.finance_company_id ?? undefined,
    financeCompanyName: r.finance_company_name ?? undefined,
    productPrice: r.product_price,
    discount: r.discount,
    saleAmount: r.sale_amount,
    downPayment: r.down_payment,
    financeAmount: r.finance_amount,
    interestRate: r.interest_rate,
    interestType: r.interest_type as InterestType,
    tenureMonths: r.tenure_months,
    processingFee: r.processing_fee,
    otherCharges: r.other_charges,
    firstEmiDate: r.first_emi_date,
    monthlyEmi: r.monthly_emi,
    totalInterest: r.total_interest,
    totalPayable: r.total_payable,
    totalPaid: r.total_paid,
    outstandingAmount: r.outstanding_amount,
    status: r.status as EMIAccountStatus,
    foreclosedAt: r.foreclosed_at ?? undefined,
    foreclosureCharges: r.foreclosure_charges ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at ?? undefined,
    schedule,
  };
}

export function recordEMICustomerPayment(
  db: DatabaseSync,
  input: {
    emiAccountId: string;
    installmentId?: string;
    installmentNumber?: number;
    amount: number;
    paymentDate?: string;
    paymentMode: "Cash" | "UPI" | "Card" | "Bank" | "OTHER";
    referenceNumber?: string;
    remarks?: string;
    receivedBy?: string;
  }
): { payment: EMICustomerPayment; account: EMIAccount } {
  const account = getEMIAccountById(db, input.emiAccountId);
  if (!account) {
    throw new Error(`EMI Account '${input.emiAccountId}' not found`);
  }

  if (account.status === "PAID" || account.status === "CANCELLED") {
    throw new Error(`Cannot record payment: EMI Account is already ${account.status}`);
  }

  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const paymentId = uid("emipay");
  const now = new Date().toISOString();
  const date = input.paymentDate || todayISO();
  const bId = account.businessId || "biz_default";
  const branchId = account.branchId || "branch_01";

  // 1. Insert EMI Payment record
  db.prepare(`
    INSERT INTO emi_payments (
      id, business_id, branch_id, emi_account_id, installment_id, installment_number,
      customer_id, customer_name, payment_date, amount, payment_mode, reference_number,
      remarks, is_foreclosure, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
  `).run(
    paymentId,
    bId,
    branchId,
    input.emiAccountId,
    input.installmentId ?? null,
    input.installmentNumber ?? null,
    account.customerId,
    account.customerName,
    date,
    input.amount,
    input.paymentMode,
    input.referenceNumber ?? null,
    input.remarks ?? null,
    input.receivedBy ?? "Staff",
    now
  );

  // 2. Allocate payment across pending schedule installments
  let remainingPayment = input.amount;
  const schedRows = db
    .prepare("SELECT * FROM emi_schedules WHERE emi_account_id = ? ORDER BY installment_number ASC")
    .all(input.emiAccountId) as any[];

  for (const s of schedRows) {
    if (remainingPayment <= 0) break;
    const dueForThisRow = round2(s.emi_amount - (s.paid_amount || 0));
    if (dueForThisRow <= 0) continue;

    const allocation = Math.min(remainingPayment, dueForThisRow);
    const newPaidForThis = round2((s.paid_amount || 0) + allocation);
    const newRowStatus = newPaidForThis >= s.emi_amount ? "PAID" : "PARTIALLY_PAID";

    db.prepare(`
      UPDATE emi_schedules
      SET paid_amount = ?, paid_date = ?, status = ?
      WHERE id = ?
    `).run(newPaidForThis, date, newRowStatus, s.id);

    remainingPayment = round2(remainingPayment - allocation);
  }

  // 3. Update account totals
  const newTotalPaid = round2(account.totalPaid + input.amount);
  const newOutstanding = round2(Math.max(0, account.totalPayable - newTotalPaid));
  const newAccountStatus: EMIAccountStatus = newOutstanding <= 0 ? "PAID" : "PARTIALLY_PAID";

  db.prepare(`
    UPDATE emi_accounts
    SET total_paid = ?, outstanding_amount = ?, status = ?, updated_at = ?
    WHERE id = ?
  `).run(newTotalPaid, newOutstanding, newAccountStatus, now, input.emiAccountId);

  // 4. Record Cashbook Entry (store cash/bank ledger)
  recordCashbookEntry(
    db,
    "EMI_CUSTOMER_PAYMENT",
    paymentId,
    input.paymentMode === "Cash" ? "CASH" : "BANK",
    input.amount,
    0,
    `Customer EMI Payment (${input.paymentMode}) from ${account.customerName} for Inv #${account.invoiceId} (Ref: ${input.referenceNumber || "—"})`
  );

  // 5. Audit log
  logAudit(db, {
    action: "RECORD_EMI_CUSTOMER_PAYMENT",
    module: "EMI_PAYMENTS",
    recordId: paymentId,
    oldValue: { status: account.status, totalPaid: account.totalPaid, outstanding: account.outstandingAmount },
    newValue: { status: newAccountStatus, totalPaid: newTotalPaid, outstanding: newOutstanding, paymentAmount: input.amount },
    reason: `Recorded customer EMI payment of ₹${input.amount} for Inv #${account.invoiceId}`,
  });

  const updatedAccount = getEMIAccountById(db, input.emiAccountId)!;

  const paymentRecord: EMICustomerPayment = {
    id: paymentId,
    businessId: bId,
    branchId,
    emiAccountId: input.emiAccountId,
    installmentId: input.installmentId,
    installmentNumber: input.installmentNumber,
    customerId: account.customerId,
    customerName: account.customerName,
    paymentDate: date,
    amount: input.amount,
    paymentMode: input.paymentMode,
    referenceNumber: input.referenceNumber,
    remarks: input.remarks,
    isForeclosure: false,
    createdBy: input.receivedBy,
    createdAt: now,
  };

  return { payment: paymentRecord, account: updatedAccount };
}

export function forecloseEMIAccount(
  db: DatabaseSync,
  input: {
    emiAccountId: string;
    foreclosureCharges?: number;
    otherCharges?: number;
    paymentMode: "Cash" | "UPI" | "Card" | "Bank" | "OTHER";
    referenceNumber?: string;
    remarks?: string;
    receivedBy?: string;
  }
): { summary: EMIForeclosureSummary; account: EMIAccount } {
  const account = getEMIAccountById(db, input.emiAccountId);
  if (!account) {
    throw new Error(`EMI Account '${input.emiAccountId}' not found`);
  }

  if (account.status === "PAID" || account.status === "CANCELLED") {
    throw new Error(`Cannot foreclose: EMI Account is already ${account.status}`);
  }

  const schedRows = db
    .prepare("SELECT * FROM emi_schedules WHERE emi_account_id = ? ORDER BY installment_number ASC")
    .all(input.emiAccountId) as any[];

  // Calculate outstanding principal from unpaid schedule portions
  let outstandingPrincipal = 0;
  let pendingInterest = 0;
  const today = todayISO();

  for (const s of schedRows) {
    if (s.status !== "PAID") {
      const unpaidPortion = Math.max(0, s.emi_amount - (s.paid_amount || 0));
      if (unpaidPortion > 0) {
        outstandingPrincipal = round2(outstandingPrincipal + s.principal_amount);
        // Only charge interest for overdue or current installment
        if (s.due_date <= today) {
          pendingInterest = round2(pendingInterest + s.interest_amount);
        }
      }
    }
  }

  const foreclosureCharges = round2(Math.max(0, input.foreclosureCharges || 0));
  const otherCharges = round2(Math.max(0, input.otherCharges || 0));
  const finalSettlementAmount = round2(
    outstandingPrincipal + pendingInterest + foreclosureCharges + otherCharges
  );

  const paymentId = uid("emifc");
  const now = new Date().toISOString();
  const bId = account.businessId || "biz_default";
  const branchId = account.branchId || "branch_01";

  // 1. Record Foreclosure Payment
  db.prepare(`
    INSERT INTO emi_payments (
      id, business_id, branch_id, emi_account_id, customer_id, customer_name,
      payment_date, amount, payment_mode, reference_number, remarks, is_foreclosure,
      created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    paymentId,
    bId,
    branchId,
    input.emiAccountId,
    account.customerId,
    account.customerName,
    today,
    finalSettlementAmount,
    input.paymentMode,
    input.referenceNumber ?? null,
    input.remarks ? `FORECLOSURE: ${input.remarks}` : "Loan Foreclosure Settlement",
    input.receivedBy ?? "Staff",
    now
  );

  // 2. Mark all remaining schedule rows as PAID (without deleting history)
  for (const s of schedRows) {
    if (s.status !== "PAID") {
      db.prepare(`
        UPDATE emi_schedules
        SET paid_amount = emi_amount, paid_date = ?, status = 'PAID'
        WHERE id = ?
      `).run(today, s.id);
    }
  }

  // 3. Update account as fully PAID / Foreclosed
  const newTotalPaid = round2(account.totalPaid + finalSettlementAmount);
  db.prepare(`
    UPDATE emi_accounts
    SET total_paid = ?, outstanding_amount = 0, status = 'PAID',
        foreclosed_at = ?, foreclosure_charges = ?, updated_at = ?
    WHERE id = ?
  `).run(newTotalPaid, now, foreclosureCharges, now, input.emiAccountId);

  // 4. Record Cashbook Entry
  recordCashbookEntry(
    db,
    "EMI_FORECLOSURE",
    paymentId,
    input.paymentMode === "Cash" ? "CASH" : "BANK",
    finalSettlementAmount,
    0,
    `EMI Loan Foreclosure (${input.paymentMode}) from ${account.customerName} for Inv #${account.invoiceId} (Ref: ${input.referenceNumber || "—"})`
  );

  // 5. Audit trail
  logAudit(db, {
    action: "FORECLOSE_EMI_ACCOUNT",
    module: "EMI_SALES",
    recordId: input.emiAccountId,
    oldValue: { status: account.status, outstanding: account.outstandingAmount },
    newValue: { status: "PAID", settlementAmount: finalSettlementAmount, foreclosedAt: now },
    reason: `Foreclosed EMI account for Inv #${account.invoiceId} with final settlement of ₹${finalSettlementAmount}`,
  });

  const summary: EMIForeclosureSummary = {
    emiAccountId: input.emiAccountId,
    outstandingPrincipal,
    pendingInterest,
    foreclosureCharges,
    otherCharges,
    finalSettlementAmount,
  };

  const updatedAccount = getEMIAccountById(db, input.emiAccountId)!;
  return { summary, account: updatedAccount };
}

export function getComprehensiveEMIReport(
  db: DatabaseSync,
  filters?: EMIReportFilters
) {
  let query = `
    SELECT
      a.*,
      s.invoice_no
    FROM emi_accounts a
    LEFT JOIN sales s ON a.sale_id = s.id
    WHERE 1=1
  `;
  const params: any[] = [];

  if (filters?.fromDate) {
    query += " AND a.created_at >= ?";
    params.push(filters.fromDate);
  }

  if (filters?.toDate) {
    query += " AND a.created_at <= ?";
    params.push(filters.toDate + "T23:59:59");
  }

  if (filters?.customerId && filters.customerId !== "ALL") {
    query += " AND a.customer_id = ?";
    params.push(filters.customerId);
  }

  if (filters?.companyId && filters.companyId !== "ALL") {
    query += " AND a.finance_company_id = ?";
    params.push(filters.companyId);
  }

  if (filters?.status && filters.status !== "ALL") {
    query += " AND a.status = ?";
    params.push(filters.status);
  }

  if (filters?.salesPerson) {
    query += " AND LOWER(a.created_by) LIKE ?";
    params.push(`%${filters.salesPerson.toLowerCase()}%`);
  }

  if (filters?.productId) {
    query += " AND a.product_id = ?";
    params.push(filters.productId);
  }

  if (filters?.imei) {
    query += " AND LOWER(a.imei) LIKE ?";
    params.push(`%${filters.imei.toLowerCase()}%`);
  }

  query += " ORDER BY a.created_at DESC";

  const accounts = db.prepare(query).all(...params) as any[];

  // Also query receivables
  const receivables = getEMIReceivables(db, {
    fromDate: filters?.fromDate,
    toDate: filters?.toDate,
    companyId: filters?.companyId,
    status: filters?.status as any,
  });

  const today = todayISO();
  let overdueAmount = 0;

  // Calculate overdue across active accounts
  for (const acct of accounts) {
    if (acct.status !== "PAID" && acct.status !== "CANCELLED") {
      const overdueInstallments = db.prepare(`
        SELECT SUM(emi_amount - paid_amount) as overdue
        FROM emi_schedules
        WHERE emi_account_id = ? AND due_date < ? AND status != 'PAID'
      `).get(acct.id, today) as any;
      if (overdueInstallments?.overdue) {
        overdueAmount = round2(overdueAmount + overdueInstallments.overdue);
      }
    }
  }

  const totalEmiSales = accounts.reduce((sum, a) => sum + (a.sale_amount || 0), 0);
  const totalFinanceAmount = accounts.reduce((sum, a) => sum + (a.finance_amount || 0), 0);
  const totalDownPayment = accounts.reduce((sum, a) => sum + (a.down_payment || 0), 0);
  const totalReceivable = receivables.reduce((sum, r) => sum + (r.netReceivable || 0), 0);
  const totalReceived = receivables.reduce((sum, r) => sum + (r.receivedAmount || 0), 0);
  const totalOutstanding = accounts.reduce((sum, a) => sum + (a.outstanding_amount || 0), 0);

  return {
    metrics: {
      totalEmiSalesCount: accounts.length,
      totalEmiSales,
      totalFinanceAmount,
      totalDownPayment,
      totalReceivable,
      totalReceived,
      totalOutstanding,
      overdueAmount,
    },
    accounts,
    receivables,
  };
}

export function checkEmiPermission(
  db: DatabaseSync,
  employeeIdOrRole: string,
  permission:
    | "EMI_CALCULATOR_VIEW"
    | "EMI_CALCULATOR_USE"
    | "EMI_CREATE"
    | "EMI_EDIT"
    | "EMI_DELETE"
    | "EMI_PAYMENT_RECEIVE"
    | "EMI_FORECLOSE"
    | "EMI_REPORT_VIEW"
    | "EMI_EXPORT"
): boolean {
  let role = (employeeIdOrRole || "sales").toLowerCase();
  const emp = db
    .prepare("SELECT role FROM employees WHERE id = ? OR employee_id = ?")
    .get(employeeIdOrRole, employeeIdOrRole) as any;
  if (emp?.role) {
    role = emp.role.toLowerCase();
  }

  if (role === "admin" || role === "owner" || role.includes("admin") || role.includes("owner")) {
    return true;
  }

  // Cashier, manager, and accountant can view & use calculator
  if (permission === "EMI_CALCULATOR_VIEW" || permission === "EMI_CALCULATOR_USE") {
    return ["admin", "owner", "manager", "cashier", "sales", "accountant"].includes(role);
  }

  if (permission === "EMI_CREATE" || permission === "EMI_EDIT") {
    return ["admin", "owner", "manager", "cashier"].includes(role);
  }

  if (permission === "EMI_PAYMENT_RECEIVE") {
    return ["admin", "owner", "manager", "cashier", "accountant"].includes(role);
  }

  if (permission === "EMI_FORECLOSE") {
    return ["admin", "owner", "manager"].includes(role);
  }

  if (permission === "EMI_DELETE") {
    return ["admin", "owner"].includes(role);
  }

  if (permission === "EMI_REPORT_VIEW" || permission === "EMI_EXPORT") {
    return ["admin", "owner", "manager", "accountant"].includes(role);
  }

  return false;
}

