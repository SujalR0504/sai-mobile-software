export type Category =
  | "Mobile Phones"
  | "Tablets"
  | "Chargers"
  | "Cables"
  | "Earphones"
  | "Covers"
  | "Tempered Glass"
  | "Smart Watches"
  | "Speakers"
  | "Other Accessories";

export const CATEGORIES: Category[] = [
  "Mobile Phones",
  "Tablets",
  "Chargers",
  "Cables",
  "Earphones",
  "Covers",
  "Tempered Glass",
  "Smart Watches",
  "Speakers",
  "Other Accessories",
];

export type UnitStatus =
  | "PURCHASED"
  | "available"
  | "IN_STOCK"
  | "sold"
  | "SOLD"
  | "returned"
  | "RETURNED"
  | "damaged"
  | "DAMAGED"
  | "reserved"
  | "RESERVED"
  | "UNDER_INSPECTION"
  | "UNDER_REPAIR"
  | "PURCHASE_RETURNED";

export const UNIT_STATUSES: string[] = [
  "available",
  "sold",
  "returned",
  "damaged",
  "reserved",
  "UNDER_INSPECTION",
  "UNDER_REPAIR",
  "PURCHASE_RETURNED",
];

export type Role =
  | "OWNER"
  | "ADMIN"
  | "MANAGER"
  | "SALES"
  | "ACCOUNTANT"
  | "TECHNICIAN"
  | "CUSTOM";

export type PermissionModule =
  | "Dashboard"
  | "POS"
  | "Sales"
  | "Purchases"
  | "Sale Returns"
  | "Purchase Returns"
  | "Products"
  | "Stock"
  | "IMEI"
  | "Customers"
  | "Dealers"
  | "Repairs"
  | "Payments"
  | "EMI Receivables"
  | "Expenses"
  | "Cashbook"
  | "Reports"
  | "Employees"
  | "Attendance"
  | "Payroll"
  | "Orders"
  | "Settings"
  | "Credit Notes"
  | "Debit Notes";

export const PERMISSION_MODULES: PermissionModule[] = [
  "Dashboard",
  "POS",
  "Sales",
  "Purchases",
  "Sale Returns",
  "Purchase Returns",
  "Products",
  "Stock",
  "IMEI",
  "Customers",
  "Dealers",
  "Repairs",
  "Payments",
  "EMI Receivables",
  "Expenses",
  "Cashbook",
  "Reports",
  "Employees",
  "Attendance",
  "Payroll",
  "Orders",
  "Settings",
  "Credit Notes",
  "Debit Notes",
];

export type PermissionAction =
  | "VIEW"
  | "CREATE"
  | "EDIT"
  | "DELETE"
  | "APPROVE"
  | "PRINT"
  | "EXPORT"
  | "CANCEL"
  | "REFUND"
  | "ADJUST"
  | "VIEW_COST"
  | "VIEW_PROFIT"
  | "RECEIVE_PAYMENT"
  | "AUTHORIZE";

export const PERMISSION_ACTIONS: PermissionAction[] = [
  "VIEW",
  "CREATE",
  "EDIT",
  "DELETE",
  "APPROVE",
  "PRINT",
  "EXPORT",
  "CANCEL",
  "REFUND",
  "ADJUST",
  "VIEW_COST",
  "VIEW_PROFIT",
  "RECEIVE_PAYMENT",
  "AUTHORIZE",
];

export interface EmployeePermissionEntry {
  id?: string;
  businessId?: string;
  employeeId: string;
  module: PermissionModule;
  action: PermissionAction;
  allowed: boolean;
}


export interface Business {
  id: string;
  name: string;
  ownerId?: string;
  createdAt: string;
}

export interface Branch {
  id: string;
  businessId: string;
  name: string;
  code: string;
  address?: string;
  phone?: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
}

export interface Employee {
  id: string;
  businessId?: string;
  branchId?: string;
  employeeId: string; // e.g. "EMP-001"
  fullName: string;
  photo?: string;
  mobile: string;
  email?: string;
  address?: string;
  joiningDate: string;
  department: string;
  designation: string;
  salaryType: "MONTHLY" | "DAILY" | "HOURLY" | "COMMISSION" | "MIXED";
  basicSalary: number;
  bankDetails?: string;
  emergencyContact?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "LEFT";
  role: Role;
  userId?: string;
}

export type AttendanceStatus =
  | "PRESENT"
  | "LATE"
  | "HALF_DAY"
  | "ABSENT"
  | "LEAVE"
  | "WORK_FROM_HOME";

export interface AttendanceRecord {
  id: string;
  businessId?: string;
  branchId?: string;
  employeeId: string;
  employeeName?: string;
  date: string;
  checkInTime?: string;
  checkOutTime?: string;
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  distanceFromShop?: number;
  isWithinRadius: boolean;
  deviceInformation?: string;
  status: AttendanceStatus;
  adminOverride?: boolean;
}

export interface PayrollRecord {
  id: string;
  businessId?: string;
  branchId?: string;
  employeeId: string;
  employeeName?: string;
  month: number;
  year: number;
  basicSalary: number;
  allowances: number;
  overtime: number;
  commission: number;
  bonus: number;
  deductions: number;
  advances: number;
  attendanceDeductions: number;
  grossSalary: number;
  netSalary: number;
  status: "DRAFT" | "CALCULATED" | "APPROVED" | "PAID" | "CANCELLED";
  paymentDate?: string;
  paymentMethod?: string;
}

export interface CategoryEntity {
  id: string;
  businessId?: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  sortOrder?: number;
  active?: boolean;
  createdAt?: string;
}

export interface SubcategoryEntity {
  id: string;
  businessId?: string;
  categoryId: string;
  name: string;
  slug?: string;
  description?: string;
  active?: boolean;
  createdAt?: string;
}

export interface BrandEntity {
  id: string;
  businessId?: string;
  categoryId?: string;
  subcategoryId?: string;
  name: string;
  slug?: string;
  logo?: string;
  logoUrl?: string;
  active?: boolean;
  createdAt?: string;
}

export interface ModelEntity {
  id: string;
  businessId?: string;
  brandId: string;
  categoryId?: string;
  subcategoryId?: string;
  name: string;
  modelNumber?: string;
  releaseYear?: number;
  series?: string;
  active?: boolean;
  createdAt?: string;
}

export interface ProductVariant {
  id: string;
  businessId?: string;
  productId: string;
  modelId?: string;
  sku?: string;
  barcode?: string;
  ram?: string;
  storage?: string;
  color?: string;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  gst: number;
  hsn?: string;
  qty: number;
  tracked: boolean;
  createdAt: string;
}

export interface Product {
  id: string;
  businessId?: string;
  name: string;
  brand: string;
  model: string;
  variant?: string;
  ram?: string;
  storage?: string;
  color?: string;
  category: string;
  categoryId?: string;
  subcategoryId?: string;
  brandId?: string;
  modelId?: string;
  tracked: boolean; // IMEI / serial tracked
  sku?: string;
  barcode?: string;
  hsn?: string;
  mrp: number;
  purchasePrice: number;
  sellingPrice: number;
  minimumSellingPrice?: number;
  minimumStock?: number;
  gst: number;
  supplierId?: string;
  dealerId?: string;
  warrantyMonths: number;
  qty: number; // used for non-tracked items
  openingStock?: number;
  reservedQty?: number;
  reorderLevel: number;
}

export interface Unit {
  id: string;
  businessId?: string;
  branchId?: string;
  productId: string;
  imei1: string;
  imei2?: string;
  serial?: string;
  purchasePrice: number;
  sellingPrice?: number;
  status: UnitStatus;
  purchaseId?: string;
  saleId?: string;
  customerId?: string;
  orderId?: string;
}

export interface Customer {
  id: string;
  businessId?: string;
  name: string;
  mobile?: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  address?: string;
  city?: string;
  gstin?: string;
  customerType?: string;
  notes?: string;
  createdAt: string;
}

export interface Dealer {
  id: string;
  businessId?: string;
  name: string;
  company?: string;
  phone: string;
  mobile?: string;
  whatsapp?: string;
  email?: string;
  gstin?: string;
  address?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  contactPerson?: string;
  notes?: string;
  creditLimit?: number;
  paymentTerms?: string;
  status?: "ACTIVE" | "INACTIVE";
}

export type Supplier = Dealer;

export type PaymentMode = "Cash" | "UPI" | "Card" | "Bank" | "Credit" | "EMI" | "OTHER";
export const PAYMENT_MODES: PaymentMode[] = ["Cash", "UPI", "Card", "Bank", "Credit", "EMI", "OTHER"];

export interface FinanceCompany {
  id: string;
  businessId?: string;
  companyName: string;
  contactPerson?: string;
  mobile?: string;
  email?: string;
  address?: string;
  settlementDays: number;
  processingFee: number;
  defaultInterestRate?: number;
  defaultTenure?: number;
  notes?: string;
  active: boolean;
  createdAt?: string;
}

export type InterestType =
  | "ANNUAL_REDUCING"
  | "MONTHLY_REDUCING"
  | "FLAT_RATE"
  | "ZERO_INTEREST";

export interface EMICalculatorInputs {
  productPrice: number;
  discount: number;
  downPayment: number;
  interestRate: number;
  interestType: InterestType;
  tenureMonths: number;
  processingFee: number;
  otherCharges: number;
  firstEmiDate: string;
  financeCompanyId?: string;
  financeCompanyName?: string;
  productId?: string;
  productName?: string;
  imei?: string;
  customerId?: string;
  customerName?: string;
  customerMobile?: string;
}

export interface EMIScheduleRow {
  installmentNo: number;
  dueDate: string;
  openingPrincipal: number;
  emi: number;
  interest: number;
  principal: number;
  closingPrincipal: number;
  status: "PENDING" | "PAID" | "PARTIALLY_PAID" | "OVERDUE";
  paidAmount?: number;
  paidDate?: string;
}

export interface EMICalculationResult {
  productPrice: number;
  discount: number;
  finalSaleAmount: number;
  downPayment: number;
  financeAmount: number;
  interestRate: number;
  interestType: InterestType;
  tenureMonths: number;
  processingFee: number;
  otherCharges: number;
  firstEmiDate: string;
  monthlyEmi: number;
  totalInterest: number;
  totalPayable: number;
  totalPrincipalRepayment: number;
  roundingAdjustment: number;
  schedule: EMIScheduleRow[];
}

export type EMIAccountStatus =
  | "PENDING"
  | "ACTIVE"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERDUE"
  | "CANCELLED";

export interface EMIAccount {
  id: string;
  businessId?: string;
  branchId?: string;
  saleId?: string;
  invoiceId: string;
  customerId: string;
  customerName: string;
  customerMobile?: string;
  productId?: string;
  productName?: string;
  imei?: string;
  financeCompanyId?: string;
  financeCompanyName?: string;
  productPrice: number;
  discount: number;
  saleAmount: number;
  downPayment: number;
  financeAmount: number;
  interestRate: number;
  interestType: InterestType;
  tenureMonths: number;
  processingFee: number;
  otherCharges: number;
  firstEmiDate: string;
  monthlyEmi: number;
  totalInterest: number;
  totalPayable: number;
  totalPaid: number;
  outstandingAmount: number;
  status: EMIAccountStatus;
  foreclosedAt?: string;
  foreclosureCharges?: number;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  schedule?: EMIScheduleRow[];
}

export interface EMICustomerPayment {
  id: string;
  businessId?: string;
  branchId?: string;
  emiAccountId: string;
  installmentId?: string;
  installmentNumber?: number;
  customerId: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMode: "Cash" | "UPI" | "Card" | "Bank" | "OTHER";
  referenceNumber?: string;
  remarks?: string;
  isForeclosure: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface EMIForeclosureSummary {
  emiAccountId: string;
  outstandingPrincipal: number;
  pendingInterest: number;
  foreclosureCharges: number;
  otherCharges: number;
  finalSettlementAmount: number;
}

export interface EMIReportFilters {
  fromDate?: string;
  toDate?: string;
  customerId?: string;
  companyId?: string;
  status?: string;
  salesPerson?: string;
  productId?: string;
  model?: string;
  imei?: string;
}

export type EMIStatus = "EMI_PENDING" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";

export interface EMIReceivable {
  id: string;
  businessId?: string;
  branchId?: string;
  emiCompanyId: string;
  emiCompanyName: string;
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
  processingFee: number;
  otherCharges: number;
  netReceivable: number;
  receivedAmount: number;
  emiSaleDate: string;
  expectedPaymentDate?: string;
  receivedDate?: string;
  paymentMethod?: string;
  status: EMIStatus;
  notes?: string;
  createdBy?: string;
  receivedBy?: string;
  createdAt: string;
}

export interface EMIReceipt {
  id: string;
  businessId?: string;
  branchId?: string;
  emiReceivableId: string;
  amountReceived: number;
  receivedDate: string;
  paymentMethod: "BANK_TRANSFER" | "UPI" | "CASH" | "OTHER";
  bankReference?: string;
  notes?: string;
  receivedBy?: string;
  createdAt: string;
}

export interface PaymentAccount {
  id: string;
  businessId?: string;
  accountName: string;
  accountType: "CASH" | "UPI" | "BANK" | "CARD";
  bankName?: string;
  upiId?: string;
  accountNumber?: string;
  ifsc?: string;
  openingBalance: number;
  currentBalance: number;
  status: "ACTIVE" | "INACTIVE";
  isDefault?: boolean | number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaymentAccountTransaction {
  id: string;
  businessId?: string;
  accountId: string;
  transactionType:
    | "SALE_PAYMENT"
    | "CUSTOMER_PAYMENT"
    | "DEALER_PAYMENT"
    | "PURCHASE_PAYMENT"
    | "EMI_DOWN_PAYMENT"
    | "EXPENSE_PAYMENT"
    | "ORDER_ADVANCE"
    | "ORDER_REFUND"
    | "REFUND"
    | "ADJUSTMENT";
  referenceType?: string;
  referenceId?: string;
  amount: number;
  debit: number;
  credit: number;
  balance: number;
  paymentMethod: string;
  date: string;
  description?: string;
  createdBy?: string;
  createdAt: string;
}

export interface PaymentSplit {
  mode: PaymentMode;
  amount: number;
  paymentAccountId?: string;
  referenceNumber?: string;
}

export interface LineItem {
  productId: string;
  name: string;
  unitId?: string;
  imei?: string;
  imeis?: string[];
  qty: number;
  price: number;
  gst: number;
  costPrice: number;
  warrantyMonths?: number;
  // Purchase 18-column ERP fields
  hsnSac?: string;
  unit?: string;
  rateIncludingTax?: number;
  rateExcludingTax?: number;
  discountPct?: number;
  discountAmount?: number;
  taxableAmount?: number;
  gstRate?: number;
  cgstPct?: number;
  cgstAmount?: number;
  sgstPct?: number;
  sgstAmount?: number;
  igstPct?: number;
  igstAmount?: number;
  totalAmount?: number;
}

export interface Sale {
  id: string;
  businessId?: string;
  branchId?: string;
  invoiceNo: string;
  invoiceType?: "GST" | "NON_GST";
  selectedTemplateId?: string;
  date: string;
  customerId: string;
  items: LineItem[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  payments: PaymentSplit[];
  quotation?: boolean;
  note?: string;
  status?: "COMPLETED" | "VOID" | "CANCELLED";
  isEmi?: boolean;
  emiCompanyId?: string;
  emiCompanyName?: string;
  emiReceivableId?: string;
  emiDownPayment?: number;
  emiFinancedAmount?: number;
  financeReferenceNumber?: string;
}

export interface PurchaseAttachment {
  id: string;
  purchaseId: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  fileData: string;
  createdAt: string;
}

export type NoteStatus = "DRAFT" | "ISSUED" | "PARTIALLY_APPLIED" | "PARTIALLY_ADJUSTED" | "APPLIED" | "ADJUSTED" | "REFUNDED" | "CANCELLED" | "ACTIVE" | "VOID";
export type NoteAdjustmentType = "REFUND" | "ADJUST_DUE" | "CUSTOMER_CREDIT" | "DEALER_CREDIT" | "APPLY_INVOICE" | "APPLY_PURCHASE";

export interface CreditNoteItem {
  id: string;
  creditNoteId: string;
  productId: string;
  unitId?: string;
  imei?: string;
  name: string;
  qty: number;
  rate: number;
  discount?: number;
  taxableAmount: number;
  gstRate: number;
  taxAmount: number;
  total: number;
  physicalReturn?: boolean;
}

export interface CreditNote {
  id: string;
  businessId?: string;
  branchId?: string;
  creditNoteNo: string;
  noteNumber?: string;
  date: string;
  customerId: string;
  customerName?: string;
  customerPhone?: string;
  saleId?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  reason: string;
  notes?: string;
  invoiceType: "GST" | "NON_GST";
  subtotal: number;
  tax: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  amount?: number;
  refundedAmount: number;
  appliedAmount: number;
  remainingAmount: number;
  physicalReturn: boolean;
  adjustmentType: NoteAdjustmentType;
  status: NoteStatus;
  returnId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  items?: CreditNoteItem[];
}

export interface DebitNoteItem {
  id: string;
  debitNoteId: string;
  productId: string;
  unitId?: string;
  imei?: string;
  name: string;
  qty: number;
  rate: number;
  discount?: number;
  taxableAmount: number;
  gstRate: number;
  taxAmount: number;
  total: number;
  physicalReturn?: boolean;
}

export interface DebitNote {
  id: string;
  businessId?: string;
  branchId?: string;
  debitNoteNo?: string;
  noteNumber: string;
  date: string;
  supplierId: string;
  dealerId?: string;
  dealerName?: string;
  dealerPhone?: string;
  purchaseId?: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  reason: string;
  notes?: string;
  remarks?: string;
  invoiceType?: "GST" | "NON_GST";
  subtotal?: number;
  tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  total?: number;
  amount: number;
  taxableValue?: number;
  refundedAmount?: number;
  appliedAmount?: number;
  remainingAmount?: number;
  physicalReturn?: boolean;
  adjustmentType?: NoteAdjustmentType;
  status: NoteStatus;
  section?: string;
  tdsSection?: string;
  ratePct?: number;
  tdsRate?: number;
  tdsAmount?: number;
  otherCharges?: number;
  adjustmentAmount?: number;
  returnId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt?: string;
  items?: DebitNoteItem[];
}

export interface NoteAllocation {
  id: string;
  noteType: "CREDIT_NOTE" | "DEBIT_NOTE";
  noteId: string;
  targetType: "SALE" | "PURCHASE";
  targetId: string;
  targetNo: string;
  amount: number;
  date: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface NoteRefund {
  id: string;
  noteType: "CREDIT_NOTE" | "DEBIT_NOTE";
  noteId: string;
  partyType: "CUSTOMER" | "DEALER";
  partyId: string;
  amount: number;
  paymentMethod: string;
  paymentAccountId?: string;
  paymentAccountName?: string;
  referenceNumber?: string;
  date: string;
  remarks?: string;
  createdBy?: string;
  createdAt: string;
}

export interface CreditNoteReportRow {
  id: string;
  date: string;
  creditNoteNo: string;
  customerId: string;
  customerName: string;
  originalInvoiceNo: string;
  reason: string;
  amount: number;
  gst: number;
  total: number;
  refunded: number;
  adjusted: number;
  remaining: number;
  status: NoteStatus;
  adjustmentType: string;
}

export interface DebitNoteReportRow {
  id: string;
  date: string;
  debitNoteNo: string;
  dealerId: string;
  dealerName: string;
  originalPurchaseNo: string;
  reason: string;
  amount: number;
  gst: number;
  total: number;
  refunded: number;
  adjusted: number;
  remaining: number;
  status: NoteStatus;
  adjustmentType: string;
}

export interface CustomerCreditBalanceRow {
  customerId: string;
  customerName: string;
  phone?: string;
  totalCredit: number;
  appliedCredit: number;
  refunded: number;
  remainingCredit: number;
}

export interface DealerCreditBalanceRow {
  dealerId: string;
  dealerName: string;
  phone?: string;
  totalCredit: number;
  applied: number;
  refunded: number;
  remaining: number;
}

export interface Purchase {
  id: string;
  businessId?: string;
  branchId?: string;
  invoiceNo: string;
  purchaseType?: "GST" | "NON_GST";
  date: string;
  supplierId: string;
  dealerId?: string;
  items: LineItem[];
  discount: number;
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  mode: PaymentMode;
  status?: "COMPLETED" | "VOID" | "CANCELLED";
  // ERP metadata
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  referenceNo?: string;
  poNumber?: string;
  ewayBillNo?: string;
  deliveryNoteNo?: string;
  deliveryNoteDate?: string;
  dispatchDocNo?: string;
  dispatchDocDate?: string;
  dispatchedThrough?: string;
  destination?: string;
  termsOfDelivery?: string;
  paymentTerms?: string;
  dueDate?: string;
  placeOfSupply?: string;
  stateCode?: string;
  receivedBy?: string;
  debitNoteRef?: string;
  creditNoteRef?: string;
  otherReferences?: string;
  taxableValue?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  otherCharges?: number;
  tdsApplicable?: boolean;
  tdsSection?: string;
  tdsRate?: number;
  tdsAmount?: number;
  roundOff?: number;
  dueAmount?: number;
  attachments?: PurchaseAttachment[];
}


export interface ReturnDoc {
  id: string;
  businessId?: string;
  type: "sale" | "purchase";
  refId: string;
  refNo: string;
  date: string;
  partyId: string;
  items: LineItem[];
  amount: number;
  reason: string;
  condition?: "GOOD" | "DAMAGED" | "UNDER_INSPECTION";
  mode: "Refund" | "Credit Note";
}

export type RepairStatus =
  | "RECEIVED"
  | "Received"
  | "DIAGNOSING"
  | "Diagnosing"
  | "WAITING_FOR_PART"
  | "APPROVAL_REQUIRED"
  | "REPAIRING"
  | "Repairing"
  | "READY"
  | "Ready"
  | "DELIVERED"
  | "Delivered"
  | "CANCELLED";

export const REPAIR_STATUSES: string[] = [
  "RECEIVED",
  "DIAGNOSING",
  "WAITING_FOR_PART",
  "APPROVAL_REQUIRED",
  "REPAIRING",
  "READY",
  "DELIVERED",
  "CANCELLED",
];

export interface RepairPart {
  id: string;
  repairId: string;
  productId: string;
  partName: string;
  qty: number;
  costPrice: number;
  sellingPrice: number;
}

export interface Repair {
  id: string;
  businessId?: string;
  branchId?: string;
  jobId: string;
  customerId: string;
  customerMobile?: string;
  deviceBrand?: string;
  device: string;
  imei?: string;
  problem: string;
  physicalCondition?: string;
  accessoriesReceived?: string;
  estimate: number;
  advance: number;
  technician: string;
  status: string;
  partsUsed?: RepairPart[];
  warrantyStatus?: "ACTIVE" | "EXPIRED" | "NONE";
  expectedDeliveryDate?: string;
  createdAt: string;
}

export type ExpenseCategory =
  | "Rent"
  | "Electricity"
  | "Salary"
  | "Internet"
  | "Marketing"
  | "Transport"
  | "Courier"
  | "Repair expenses"
  | "Miscellaneous";

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "Rent",
  "Electricity",
  "Salary",
  "Internet",
  "Marketing",
  "Transport",
  "Courier",
  "Repair expenses",
  "Miscellaneous",
];

export interface Expense {
  id: string;
  businessId?: string;
  branchId?: string;
  date: string;
  category: ExpenseCategory;
  amount: number;
  paymentMethod?: PaymentMode;
  note?: string;
}

export interface PaymentEntry {
  id: string;
  businessId?: string;
  branchId?: string;
  date: string;
  party: "customer" | "supplier";
  partyId: string;
  refId?: string;
  amount: number;
  mode: PaymentMode | string;
  paymentAccountId?: string;
  referenceNumber?: string;
  note?: string;
  referenceNo?: string;
  chequeNo?: string;
  bankName?: string;
  userId?: string;
  userName?: string;
  createdAt?: string;
}

export interface PurchasePaymentInput {
  purchaseId: string;
  amount: number;
  date: string;
  mode: PaymentMode | string;
  referenceNo?: string;
  chequeNo?: string;
  bankName?: string;
  remarks?: string;
  user?: string;
}

export type StockMovementType =
  | "PURCHASE"
  | "SALE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "ADJUSTMENT_IN"
  | "ADJUSTMENT_OUT"
  | "DAMAGE"
  | "LOSS"
  | "REPAIR_PART_USED"
  | "TRANSFER_IN"
  | "TRANSFER_OUT";

export interface StockMovement {
  id: string;
  businessId?: string;
  branchId?: string;
  productId: string;
  productName?: string;
  unitId?: string;
  imei?: string;
  movementType: StockMovementType;
  quantity: number;
  costPerUnit: number;
  referenceId?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface CustomerLedgerEntry {
  id: string;
  businessId?: string;
  customerId: string;
  date: string;
  type: "SALE" | "PAYMENT" | "SALE_RETURN" | "REFUND" | "CREDIT_ADJUSTMENT" | "DEBIT_ADJUSTMENT" | "CREDIT_NOTE" | "CANCELLED_CREDIT_NOTE";
  referenceId?: string;
  debit: number; // Customer owes more
  credit: number; // Customer paid or returned
  balance: number; // Running balance
  notes?: string;
  createdAt: string;
}

export interface SupplierLedgerEntry {
  id: string;
  businessId?: string;
  supplierId: string;
  date: string;
  type: "PURCHASE" | "PAYMENT" | "PURCHASE_RETURN" | "DEBIT_NOTE" | "CREDIT_NOTE" | "CREDIT_ADJUSTMENT" | "DEBIT_ADJUSTMENT" | "CANCELLED_DEBIT_NOTE";
  referenceId?: string;
  debit: number; // Store paid supplier or debit note (reduces payable)
  credit: number; // Store bought goods from supplier (increases payable)
  balance: number; // Running balance
  notes?: string;
  createdAt: string;
}

export interface CashbookEntry {
  id: string;
  businessId?: string;
  branchId?: string;
  date: string;
  type: string;
  referenceId?: string;
  category?: string;
  inflow: number;
  outflow: number;
  balance: number;
  notes?: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  businessId?: string;
  userId?: string;
  userName?: string;
  action: string;
  module: string;
  recordId?: string;
  oldValue?: string;
  newValue?: string;
  reason?: string;
  adminApprovedBy?: string;
  createdAt: string;
}

export type InvoiceTemplateType =
  | "GST_SALE"
  | "NON_GST_SALE"
  | "GST_PURCHASE"
  | "NON_GST_PURCHASE"
  | "SALE_RETURN"
  | "PURCHASE_RETURN"
  | "CREDIT_NOTE"
  | "DEBIT_NOTE";

export interface Settings {
  shopName: string;
  tagline: string;
  ownerName: string;
  phone: string;
  whatsapp?: string;
  email?: string;
  website?: string;
  address: string;
  city?: string;
  state?: string;
  stateCode?: string;
  pincode?: string;
  gstin: string;
  pan?: string;
  defaultGst: number;
  invoicePrefix: string;
  gstInvoicePrefix?: string;
  nongstInvoicePrefix?: string;
  purchaseInvoicePrefix?: string;
  openingCash: number;
  shopLatitude?: number;
  shopLongitude?: number;
  allowedRadiusMeters?: number;
  adminPin?: string;
  logoUrl?: string;
  brandsBannerUrl?: string;
  locationQrUrl?: string;
  upiId?: string;
  upiQrUrl?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  termsAndConditions?: string[];
  watermarkEnabled?: boolean;
  watermarkText?: string;
  signatureUrl?: string;
  signatureTitle?: string;
  primaryColor?: string;
  secondaryColor?: string;
  dealsIn?: string;
  businessServices?: string;
  footerText?: string;
  reserveStockOnOrder?: boolean;
  orderPrefix?: string;
}

export interface DB {
  products: Product[];
  units: Unit[];
  customers: Customer[];
  suppliers: Supplier[];
  sales: Sale[];
  purchases: Purchase[];
  purchaseAttachments?: PurchaseAttachment[];
  creditNotes?: CreditNote[];
  debitNotes?: DebitNote[];
  returns: ReturnDoc[];
  repairs: Repair[];
  repairParts?: RepairPart[];
  expenses: Expense[];
  payments: PaymentEntry[];
  employees: Employee[];
  attendance: AttendanceRecord[];
  payroll: PayrollRecord[];
  stockMovements: StockMovement[];
  customerLedger: CustomerLedgerEntry[];
  supplierLedger: SupplierLedgerEntry[];
  cashbook: CashbookEntry[];
  auditLogs: AuditLog[];
  branches: Branch[];
  settings: Settings;
  paymentAccounts?: PaymentAccount[];
  orders?: CustomerOrder[];
}

export interface ItemWiseReportRow {
  productId: string;
  productName: string;
  category: string;
  subcategory?: string;
  brand: string;
  model: string;
  sku?: string;
  barcode?: string;
  hsn?: string;
  openingStock: number;
  purchaseQty: number;
  purchaseReturnQty: number;
  saleQty: number;
  saleReturnQty: number;
  adjustmentQty: number;
  currentStock: number;
  purchasePrice: number;
  sellingPrice: number;
  purchaseValue: number;
  salesValue: number;
  estimatedProfit: number;
  tracked?: boolean;
}

export interface ItemWiseSummary {
  totalItems: number;
  totalPurchasedQty: number;
  totalSoldQty: number;
  totalPurchaseReturnQty: number;
  totalSaleReturnQty: number;
  currentStockQty: number;
  totalPurchaseValue: number;
  totalSalesValue: number;
  estimatedProfit: number;
}

export interface ProductStockLedgerEntry {
  id: string;
  date: string;
  type: "Purchase" | "Purchase Return" | "Sale" | "Sale Return" | "Stock Adjustment" | "Repair Part" | string;
  refNo: string;
  partyName?: string;
  qtyIn: number;
  qtyOut: number;
  rate: number;
  totalAmount: number;
  balanceQty: number;
  notes?: string;
}

export interface ImeiWiseReportRow {
  id: string;
  imei: string;
  productId: string;
  productName: string;
  brand: string;
  model: string;
  purchaseDate?: string;
  purchaseDealer?: string;
  purchaseInvoice?: string;
  purchasePrice: number;
  saleDate?: string;
  customer?: string;
  saleInvoice?: string;
  salePrice?: number;
  status: "AVAILABLE" | "SOLD" | "RETURNED" | "DAMAGED" | "REPAIR" | "RESERVED" | string;
}

export type OrderStatus =
  | "DRAFT"
  | "CONFIRMED"
  | "PARTIALLY_PAID"
  | "FULLY_PAID"
  | "PROCESSING"
  | "READY_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED"
  | "CONVERTED_TO_SALE";

export type OrderPaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "FULLY_PAID"
  | "REFUNDED";

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  category?: string;
  brand?: string;
  model?: string;
  unitId?: string;
  imei?: string;
  assignedImei?: string;
  qty: number;
  quantity?: number;
  price: number;
  unitPrice?: number;
  discount: number;
  discountAmount?: number;
  gst: number;
  taxRate?: number;
  total: number;
  totalAmount?: number;
  costPrice?: number;
  warrantyMonths?: number;
}

export interface OrderPayment {
  id: string;
  orderId: string;
  customerId: string;
  paymentId?: string;
  amount: number;
  paymentMethod: string; // Cash, UPI, Bank, Card
  paymentMode?: string;
  paymentAccountId?: string;
  accountName?: string;
  referenceNumber?: string;
  transactionReference?: string;
  paymentDate: string;
  remarks?: string;
  notes?: string;
  createdBy?: string;
  createdAt: string;
}

export interface OrderStatusHistory {
  id: string;
  orderId: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  action: string;
  user?: string;
  remarks?: string;
  createdAt: string;
}

export interface CustomerOrder {
  id: string;
  businessId?: string;
  branchId?: string;
  orderNo: string;
  orderNumber?: string;
  date: string;
  orderDate?: string;
  expectedDeliveryDate?: string;
  customerId: string;
  customerName: string;
  customerMobile?: string;
  salesPerson?: string;
  invoiceType: "GST" | "NON_GST";
  subtotal: number;
  tax: number;
  taxAmount?: number;
  discount: number;
  discountAmount?: number;
  total: number;
  totalAmount?: number;
  advancePaid: number;
  balanceDue: number;
  paymentStatus: OrderPaymentStatus;
  status: OrderStatus;
  saleId?: string;
  notes?: string;
  stockReserved: boolean;
  reservationActive?: boolean;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  payments?: OrderPayment[];
  statusHistory?: OrderStatusHistory[];
}

export interface CreateOrderInput {
  orderNo?: string;
  date?: string;
  expectedDeliveryDate?: string;
  customerId: string;
  salesPerson?: string;
  notes?: string;
  invoiceType?: "GST" | "NON_GST";
  items: Array<{
    productId: string;
    productName?: string;
    category?: string;
    brand?: string;
    model?: string;
    unitId?: string;
    imei?: string;
    qty: number;
    price: number;
    discount?: number;
    gst?: number;
    warrantyMonths?: number;
  }>;
  advancePayment?: {
    amount: number;
    paymentMethod: "Cash" | "UPI" | "Bank" | "Card";
    paymentAccountId?: string;
    referenceNumber?: string;
    paymentDate?: string;
    remarks?: string;
  };
  reserveStock?: boolean;
  user?: string;
}

export interface ReceiveOrderPaymentInput {
  amount: number;
  paymentMethod: "Cash" | "UPI" | "Bank" | "Card";
  paymentAccountId?: string;
  referenceNumber?: string;
  paymentDate?: string;
  remarks?: string;
  user?: string;
}

export interface ConvertOrderToSaleInput {
  selectedTemplateId?: string;
  items?: Array<{
    itemId: string;
    unitId?: string;
    imei?: string;
  }>;
  finalPaymentMode: "Cash" | "UPI" | "Bank" | "Card" | "Credit" | "EMI";
  finalPaymentAccountId?: string;
  finalPaymentReference?: string;
  emiCompanyId?: string;
  emiFinanceReferenceNumber?: string;
  emiExpectedPaymentDate?: string;
  interestRate?: number;
  interestType?: InterestType;
  tenureMonths?: number;
  user?: string;
}

export interface CancelOrderInput {
  refundMethod?: "REFUND_PAYMENT" | "CUSTOMER_CREDIT" | "NO_REFUND";
  refundPaymentAccountId?: string;
  refundRemarks?: string;
  user?: string;
}

