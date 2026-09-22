import type { DatabaseSync } from "node:sqlite";
import type {
  AttendanceRecord,
  AttendanceStatus,
  AuditLog,
  Branch,
  CashbookEntry,
  Category,
  Customer,
  CustomerLedgerEntry,
  DB,
  Employee,
  Expense,
  ExpenseCategory,
  LineItem,
  PaymentEntry,
  PaymentMode,
  PaymentSplit,
  PayrollRecord,
  Product,
  Purchase,
  Repair,
  RepairPart,
  RepairStatus,
  ReturnDoc,
  Role,
  Sale,
  Settings,
  StockMovement,
  StockMovementType,
  Supplier,
  SupplierLedgerEntry,
  Unit,
  UnitStatus,
  CreditNote,
  DebitNote,
  PurchaseAttachment,
  PaymentAccount,
} from "../../../shared/types";
import { getPaymentAccounts } from "../services/paymentAccountService";
import { getOrders } from "../services/orderService";

export function getSettings(db: DatabaseSync): Settings {
  const row = db.prepare("SELECT * FROM settings WHERE id = 'shop'").get() as any;
  if (!row) {
    return {
      shopName: "SHRI SAI MOBILE",
      tagline: "NO NEED TO WORRY",
      ownerName: "Shri Sai Mobile",
      phone: "8770758326",
      whatsapp: "8770758326",
      email: "saimobileharda@gmail.com",
      website: "",
      address: "In Front of Court, Near Prashant Restaurant, HARDA (M.P.) 461331",
      city: "Harda",
      state: "Madhya Pradesh",
      stateCode: "23",
      pincode: "461331",
      gstin: "23ASFPG1385D1Z7",
      pan: "ASFPG1385D",
      defaultGst: 18,
      invoicePrefix: "GST/2026-27/",
      gstInvoicePrefix: "GST/2026-27/",
      nongstInvoicePrefix: "NG/2026-27/",
      purchaseInvoicePrefix: "PUR/2026-27/",
      openingCash: 25000,
      shopLatitude: 28.5355,
      shopLongitude: 77.3910,
      allowedRadiusMeters: 200,
      logoUrl: "/shri_sai_logo.png",
      brandsBannerUrl: "/brands_banner.png",
      locationQrUrl: "/location_qr.png",
      upiId: "8770758326@upi",
      upiQrUrl: "/location_qr.png",
      bankName: "State Bank of India",
      bankAccountNo: "39810293847",
      bankIfsc: "SBIN0000382",
      bankBranch: "Main Branch, Harda",
      watermarkEnabled: true,
      watermarkText: "SHRI SAI MOBILE",
      signatureTitle: "Authorised Signatory",
      primaryColor: "#000000",
      secondaryColor: "#f97316",
      dealsIn: "Mobile Phones & Electronics Items",
      businessServices: "SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE",
      footerText: "MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER",
      termsAndConditions: [
        "Goods once sold will not be taken back or exchanged.",
        "Manufacturer warranty will be applicable as per company policy.",
        "Subject to Harda (M.P.) Jurisdiction only.",
        "Please verify your GST details & items before leaving.",
        "No cash refund. Exchange as per company policy.",
        "Finance/EMI is subject to company's terms & conditions.",
        "Late payment charges @ 2% per month on outstanding.",
        "Cheque bounce charges ₹500/- per cheque.",
        "All disputes subject to Harda (M.P.) jurisdiction only.",
        "Thank you for shopping with SHRI SAI MOBILE."
      ],
    };
  }

  let terms = [
    "Goods once sold will not be taken back or exchanged.",
    "Manufacturer warranty will be applicable as per company policy.",
    "Subject to Harda (M.P.) Jurisdiction only.",
    "Please verify your GST details & items before leaving.",
    "No cash refund. Exchange as per company policy.",
    "Finance/EMI is subject to company's terms & conditions.",
    "Late payment charges @ 2% per month on outstanding.",
    "Cheque bounce charges ₹500/- per cheque.",
    "All disputes subject to Harda (M.P.) jurisdiction only.",
    "Thank you for shopping with SHRI SAI MOBILE."
  ];

  if (row.terms_and_conditions) {
    try {
      const parsed = JSON.parse(row.terms_and_conditions);
      if (Array.isArray(parsed) && parsed.length > 0) {
        terms = parsed;
      }
    } catch {
      // Keep default
    }
  }

  return {
    shopName: row.shop_name || "SHRI SAI MOBILE",
    tagline: row.tagline || "NO NEED TO WORRY",
    ownerName: row.owner_name,
    phone: row.phone,
    whatsapp: row.whatsapp ?? row.phone,
    email: row.email ?? "saimobileharda@gmail.com",
    website: row.website ?? "",
    address: row.address,
    city: row.city ?? "Harda",
    state: row.state ?? "Madhya Pradesh",
    stateCode: row.state_code ?? "23",
    pincode: row.pincode ?? "461331",
    gstin: row.gstin,
    pan: row.pan ?? "ASFPG1385D",
    defaultGst: row.default_gst ?? 18,
    invoicePrefix: row.invoice_prefix ?? "GST/2026-27/",
    gstInvoicePrefix: row.gst_invoice_prefix ?? "GST/2026-27/",
    nongstInvoicePrefix: row.nongst_invoice_prefix ?? "NG/2026-27/",
    purchaseInvoicePrefix: row.purchase_invoice_prefix ?? "PUR/2026-27/",
    openingCash: row.opening_cash ?? 25000,
    shopLatitude: row.shop_latitude ?? 28.5355,
    shopLongitude: row.shop_longitude ?? 77.3910,
    allowedRadiusMeters: row.allowed_radius_meters ?? 200,
    logoUrl: row.logo_url || "/shri_sai_logo.png",
    brandsBannerUrl: row.brands_banner_url || "/brands_banner.png",
    locationQrUrl: row.location_qr_url || "/location_qr.png",
    upiId: row.upi_id || "8770758326@upi",
    upiQrUrl: row.upi_qr_url || "/location_qr.png",
    bankName: row.bank_name || "State Bank of India",
    bankAccountNo: row.bank_account_no || "39810293847",
    bankIfsc: row.bank_ifsc || "SBIN0000382",
    bankBranch: row.bank_branch || "Main Branch, Harda",
    termsAndConditions: terms,
    watermarkEnabled: row.watermark_enabled !== 0,
    watermarkText: row.watermark_text || "SHRI SAI MOBILE",
    signatureUrl: row.signature_url ?? undefined,
    signatureTitle: row.signature_title || "Authorised Signatory",
    primaryColor: row.primary_color || "#000000",
    secondaryColor: row.secondary_color || "#f97316",
    dealsIn: row.deals_in || "Mobile Phones & Electronics Items",
    businessServices: row.business_services || "SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE",
    footerText: row.footer_text || "MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER",
  };
}

export function getBranches(db: DatabaseSync): Branch[] {
  const rows = db.prepare("SELECT * FROM branches").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    code: r.code,
    address: r.address ?? undefined,
    phone: r.phone ?? undefined,
    latitude: r.latitude,
    longitude: r.longitude,
    allowedRadiusMeters: r.allowed_radius_meters,
  }));
}

export function getEmployees(db: DatabaseSync): Employee[] {
  const rows = db.prepare("SELECT * FROM employees ORDER BY employee_id ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    employeeId: r.employee_id,
    fullName: r.full_name,
    photo: r.photo ?? undefined,
    mobile: r.mobile,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    joiningDate: r.joining_date,
    department: r.department,
    designation: r.designation,
    salaryType: r.salary_type,
    basicSalary: r.basic_salary,
    bankDetails: r.bank_details ?? undefined,
    emergencyContact: r.emergency_contact ?? undefined,
    status: r.status,
    role: r.role as Role,
    userId: r.user_id ?? undefined,
  }));
}

export function getAttendance(db: DatabaseSync, date?: string): AttendanceRecord[] {
  const query = date
    ? "SELECT * FROM attendance WHERE date = ? ORDER BY check_in_time DESC"
    : "SELECT * FROM attendance ORDER BY date DESC, check_in_time DESC";
  const rows = (date ? db.prepare(query).all(date) : db.prepare(query).all()) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    employeeId: r.employee_id,
    employeeName: r.employee_name ?? undefined,
    date: r.date,
    checkInTime: r.check_in_time ?? undefined,
    checkOutTime: r.check_out_time ?? undefined,
    latitude: r.latitude ?? undefined,
    longitude: r.longitude ?? undefined,
    accuracy: r.accuracy ?? undefined,
    distanceFromShop: r.distance_from_shop ?? undefined,
    isWithinRadius: Boolean(r.is_within_radius),
    deviceInformation: r.device_information ?? undefined,
    status: r.status as AttendanceStatus,
    adminOverride: Boolean(r.admin_override),
  }));
}

export function getPayroll(db: DatabaseSync, month?: number, year?: number): PayrollRecord[] {
  let query = "SELECT * FROM payroll";
  const params: any[] = [];
  if (month && year) {
    query += " WHERE month = ? AND year = ?";
    params.push(month, year);
  }
  query += " ORDER BY year DESC, month DESC, employee_name ASC";

  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    employeeId: r.employee_id,
    employeeName: r.employee_name ?? undefined,
    month: r.month,
    year: r.year,
    basicSalary: r.basic_salary,
    allowances: r.allowances,
    overtime: r.overtime,
    commission: r.commission,
    bonus: r.bonus,
    deductions: r.deductions,
    advances: r.advances,
    attendanceDeductions: r.attendance_deductions,
    grossSalary: r.gross_salary,
    netSalary: r.net_salary,
    status: r.status,
    paymentDate: r.payment_date ?? undefined,
    paymentMethod: r.payment_method ?? undefined,
  }));
}

export function getCustomers(db: DatabaseSync): Customer[] {
  const rows = db.prepare("SELECT * FROM customers ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    mobile: r.mobile ?? r.phone,
    phone: r.phone,
    whatsapp: r.whatsapp ?? undefined,
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    gstin: r.gstin ?? undefined,
    customerType: r.customer_type ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getSuppliers(db: DatabaseSync): Supplier[] {
  const rows = db.prepare("SELECT * FROM suppliers ORDER BY name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    company: r.company ?? r.name,
    phone: r.phone,
    mobile: r.mobile ?? r.phone,
    whatsapp: r.whatsapp ?? undefined,
    email: r.email ?? undefined,
    gstin: r.gstin ?? undefined,
    address: r.address ?? undefined,
    city: r.city ?? undefined,
    state: r.state ?? undefined,
    stateCode: r.state_code ?? undefined,
    contactPerson: r.contact_person ?? undefined,
    notes: r.notes ?? undefined,
    creditLimit: r.credit_limit ?? undefined,
    paymentTerms: r.payment_terms ?? undefined,
  }));
}

export function getProducts(db: DatabaseSync): Product[] {
  const rows = db.prepare("SELECT * FROM products ORDER BY name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    brand: r.brand,
    model: r.model,
    categoryId: r.category_id ?? undefined,
    subcategoryId: r.subcategory_id ?? undefined,
    brandId: r.brand_id ?? undefined,
    modelId: r.model_id ?? undefined,
    variant: r.variant ?? undefined,
    ram: r.ram ?? undefined,
    storage: r.storage ?? undefined,
    color: r.color ?? undefined,
    category: r.category as Category,
    tracked: Boolean(r.tracked),
    sku: r.sku ?? undefined,
    barcode: r.barcode ?? undefined,
    hsn: r.hsn ?? undefined,
    mrp: r.mrp,
    purchasePrice: r.purchase_price,
    sellingPrice: r.selling_price,
    minimumSellingPrice: r.minimum_selling_price ?? undefined,
    minimumStock: r.minimum_stock ?? undefined,
    gst: r.gst,
    supplierId: r.supplier_id ?? undefined,
    dealerId: r.supplier_id ?? undefined,
    warrantyMonths: r.warranty_months,
    qty: r.qty,
    reorderLevel: r.reorder_level,
  }));
}

export function getUnits(db: DatabaseSync): Unit[] {
  const rows = db.prepare("SELECT * FROM units").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    productId: r.product_id,
    imei1: r.imei1,
    imei2: r.imei2 ?? undefined,
    serial: r.serial ?? undefined,
    purchasePrice: r.purchase_price,
    sellingPrice: r.selling_price ?? undefined,
    status: r.status as UnitStatus,
    purchaseId: r.purchase_id ?? undefined,
    saleId: r.sale_id ?? undefined,
    customerId: r.customer_id ?? undefined,
  }));
}

export function getStockMovements(db: DatabaseSync): StockMovement[] {
  const rows = db.prepare("SELECT * FROM stock_movements ORDER BY created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    productId: r.product_id,
    productName: r.product_name ?? undefined,
    unitId: r.unit_id ?? undefined,
    imei: r.imei ?? undefined,
    movementType: r.movement_type as StockMovementType,
    quantity: r.quantity,
    costPerUnit: r.cost_per_unit,
    referenceId: r.reference_id ?? undefined,
    notes: r.notes ?? undefined,
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getSales(db: DatabaseSync): Sale[] {
  const salesRows = db.prepare("SELECT * FROM sales ORDER BY date DESC, invoice_no DESC").all() as any[];
  const itemRows = db.prepare("SELECT * FROM sale_items").all() as any[];
  const paymentRows = db.prepare("SELECT * FROM sale_payments").all() as any[];

  const itemsBySale = new Map<string, LineItem[]>();
  for (const item of itemRows) {
    const list = itemsBySale.get(item.sale_id) ?? [];
    list.push({
      productId: item.product_id,
      name: item.name,
      unitId: item.unit_id ?? undefined,
      imei: item.imei ?? undefined,
      qty: item.qty,
      price: item.price,
      gst: item.gst,
      costPrice: item.cost_price,
      warrantyMonths: item.warranty_months ?? undefined,
    });
    itemsBySale.set(item.sale_id, list);
  }

  const paymentsBySale = new Map<string, PaymentSplit[]>();
  for (const pay of paymentRows) {
    const list = paymentsBySale.get(pay.sale_id) ?? [];
    list.push({
      mode: pay.mode as PaymentMode,
      amount: pay.amount,
    });
    paymentsBySale.set(pay.sale_id, list);
  }

  return salesRows.map((s) => ({
    id: s.id,
    businessId: s.business_id,
    branchId: s.branch_id,
    invoiceNo: s.invoice_no,
    date: s.date,
    customerId: s.customer_id,
    items: itemsBySale.get(s.id) ?? [],
    discount: s.discount,
    subtotal: s.subtotal,
    tax: s.tax,
    total: s.total,
    paid: s.paid,
    payments: paymentsBySale.get(s.id) ?? [],
    quotation: Boolean(s.quotation),
    note: s.note ?? undefined,
    status: s.status,
    invoiceType: (s.invoice_type as "GST" | "NON_GST") || "GST",
    isEmi: Boolean(s.is_emi),
    emiCompanyId: s.emi_company_id ?? undefined,
    emiReceivableId: s.emi_receivable_id ?? undefined,
    emiDownPayment: s.emi_down_payment ?? undefined,
    emiFinancedAmount: s.emi_financed_amount ?? undefined,
  }));
}

export const getDealers = getSuppliers;

export function getPurchases(db: DatabaseSync): Purchase[] {
  const purchasesRows = db.prepare("SELECT * FROM purchases ORDER BY date DESC, invoice_no DESC").all() as any[];
  const itemRows = db.prepare("SELECT * FROM purchase_items").all() as any[];
  const unitRows = db.prepare("SELECT purchase_id, product_id, imei1 FROM units WHERE purchase_id IS NOT NULL").all() as any[];

  const imeisByPurchaseAndProduct = new Map<string, string[]>();
  for (const u of unitRows) {
    const key = `${u.purchase_id}_${u.product_id}`;
    const list = imeisByPurchaseAndProduct.get(key) ?? [];
    list.push(u.imei1);
    imeisByPurchaseAndProduct.set(key, list);
  }

  const itemsByPurchase = new Map<string, LineItem[]>();
  for (const item of itemRows) {
    const list = itemsByPurchase.get(item.purchase_id) ?? [];
    const itemImeis = imeisByPurchaseAndProduct.get(`${item.purchase_id}_${item.product_id}`) ?? [];
    list.push({
      productId: item.product_id,
      name: item.name,
      qty: item.qty,
      price: item.price,
      gst: item.gst,
      costPrice: item.cost_price,
      imei: itemImeis[0],
      imeis: itemImeis,
      hsnSac: item.hsn_sac ?? undefined,
      unit: item.unit ?? "pcs",
      rateIncludingTax: item.rate_including_tax ?? undefined,
      rateExcludingTax: item.rate_excluding_tax ?? undefined,
      discountPct: item.discount_pct ?? 0,
      discountAmount: item.discount_amount ?? 0,
      taxableAmount: item.taxable_amount ?? 0,
      gstRate: item.gst_rate ?? item.gst,
      cgstPct: item.cgst_pct ?? 0,
      cgstAmount: item.cgst_amount ?? 0,
      sgstPct: item.sgst_pct ?? 0,
      sgstAmount: item.sgst_amount ?? 0,
      igstPct: item.igst_pct ?? 0,
      igstAmount: item.igst_amount ?? 0,
      totalAmount: item.total_amount ?? (item.price * item.qty),
    });
    itemsByPurchase.set(item.purchase_id, list);
  }

  return purchasesRows.map((p) => ({
    id: p.id,
    businessId: p.business_id,
    branchId: p.branch_id,
    invoiceNo: p.invoice_no,
    purchaseType: (p.purchase_type as "GST" | "NON_GST") || "GST",
    date: p.date,
    supplierId: p.supplier_id,
    dealerId: p.supplier_id,
    items: itemsByPurchase.get(p.id) ?? [],
    discount: p.discount,
    subtotal: p.subtotal,
    tax: p.tax,
    total: p.total,
    paid: p.paid,
    mode: p.mode as PaymentMode,
    status: p.status,
    originalInvoiceNo: p.original_invoice_no ?? undefined,
    originalInvoiceDate: p.original_invoice_date ?? undefined,
    referenceNo: p.reference_no ?? undefined,
    poNumber: p.po_number ?? undefined,
    ewayBillNo: p.eway_bill_no ?? undefined,
    deliveryNoteNo: p.delivery_note_no ?? undefined,
    deliveryNoteDate: p.delivery_note_date ?? undefined,
    dispatchDocNo: p.dispatch_doc_no ?? undefined,
    dispatchDocDate: p.dispatch_doc_date ?? undefined,
    dispatchedThrough: p.dispatched_through ?? undefined,
    destination: p.destination ?? undefined,
    termsOfDelivery: p.terms_of_delivery ?? undefined,
    paymentTerms: p.payment_terms ?? undefined,
    dueDate: p.due_date ?? undefined,
    placeOfSupply: p.place_of_supply ?? "Madhya Pradesh",
    stateCode: p.state_code ?? "23",
    receivedBy: p.received_by ?? undefined,
    debitNoteRef: p.debit_note_ref ?? undefined,
    creditNoteRef: p.credit_note_ref ?? undefined,
    otherReferences: p.other_references ?? undefined,
    taxableValue: p.taxable_value ?? undefined,
    cgstAmount: p.cgst_amount ?? undefined,
    sgstAmount: p.sgst_amount ?? undefined,
    igstAmount: p.igst_amount ?? undefined,
    otherCharges: p.other_charges ?? undefined,
    tdsApplicable: Boolean(p.tds_applicable),
    tdsSection: p.tds_section ?? undefined,
    tdsRate: p.tds_rate ?? undefined,
    tdsAmount: p.tds_amount ?? undefined,
    roundOff: p.round_off ?? undefined,
    dueAmount: p.due_amount !== undefined && p.due_amount !== null ? p.due_amount : Math.max(0, p.total - p.paid),
  }));
}

export function getReturns(db: DatabaseSync): ReturnDoc[] {
  const returnRows = db.prepare("SELECT * FROM returns ORDER BY date DESC").all() as any[];
  const itemRows = db.prepare("SELECT * FROM return_items").all() as any[];

  const itemsByReturn = new Map<string, LineItem[]>();
  for (const item of itemRows) {
    const list = itemsByReturn.get(item.return_id) ?? [];
    list.push({
      productId: item.product_id,
      name: item.name,
      unitId: item.unit_id ?? undefined,
      qty: item.qty,
      price: item.price,
      gst: item.gst,
      costPrice: item.cost_price,
    });
    itemsByReturn.set(item.return_id, list);
  }

  return returnRows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    type: r.type as "sale" | "purchase",
    refId: r.ref_id,
    refNo: r.ref_no,
    date: r.date,
    partyId: r.party_id,
    items: itemsByReturn.get(r.id) ?? [],
    amount: r.amount,
    reason: r.reason,
    condition: r.condition,
    mode: r.mode as "Refund" | "Credit Note",
  }));
}

export function getRepairs(db: DatabaseSync): Repair[] {
  const rows = db.prepare("SELECT * FROM repairs ORDER BY created_at DESC").all() as any[];
  const partsRows = db.prepare("SELECT * FROM repair_parts").all() as any[];

  const partsByRepair = new Map<string, RepairPart[]>();
  for (const part of partsRows) {
    const list = partsByRepair.get(part.repair_id) ?? [];
    list.push({
      id: part.id,
      repairId: part.repair_id,
      productId: part.product_id,
      partName: part.part_name,
      qty: part.qty,
      costPrice: part.cost_price,
      sellingPrice: part.selling_price,
    });
    partsByRepair.set(part.repair_id, list);
  }

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    jobId: r.job_id,
    customerId: r.customer_id,
    customerMobile: r.customer_mobile ?? undefined,
    deviceBrand: r.device_brand ?? undefined,
    device: r.device,
    imei: r.imei ?? undefined,
    problem: r.problem,
    physicalCondition: r.physical_condition ?? undefined,
    accessoriesReceived: r.accessories_received ?? undefined,
    estimate: r.estimate,
    advance: r.advance,
    technician: r.technician,
    status: r.status as RepairStatus,
    partsUsed: partsByRepair.get(r.id) ?? [],
    warrantyStatus: r.warranty_status,
    expectedDeliveryDate: r.expected_delivery_date ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getExpenses(db: DatabaseSync): Expense[] {
  const rows = db.prepare("SELECT * FROM expenses ORDER BY date DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    date: r.date,
    category: r.category as ExpenseCategory,
    amount: r.amount,
    paymentMethod: r.payment_method as PaymentMode,
    note: r.note ?? undefined,
  }));
}

export function getPayments(db: DatabaseSync): PaymentEntry[] {
  const rows = db.prepare("SELECT * FROM payments ORDER BY date DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    date: r.date,
    party: r.party as "customer" | "supplier",
    partyId: r.party_id,
    refId: r.ref_id ?? undefined,
    amount: r.amount,
    mode: r.mode as PaymentMode,
    note: r.note ?? undefined,
  }));
}

export function getCustomerLedger(db: DatabaseSync, customerId?: string): CustomerLedgerEntry[] {
  const query = customerId
    ? "SELECT * FROM customer_ledger WHERE customer_id = ? ORDER BY date DESC, created_at DESC, rowid DESC"
    : "SELECT * FROM customer_ledger ORDER BY date DESC, created_at DESC, rowid DESC";
  const rows = (customerId ? db.prepare(query).all(customerId) : db.prepare(query).all()) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    customerId: r.customer_id,
    date: r.date,
    type: r.type,
    referenceId: r.reference_id ?? undefined,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getSupplierLedger(db: DatabaseSync, supplierId?: string): SupplierLedgerEntry[] {
  const query = supplierId
    ? "SELECT * FROM supplier_ledger WHERE supplier_id = ? ORDER BY date DESC, created_at DESC, rowid DESC"
    : "SELECT * FROM supplier_ledger ORDER BY date DESC, created_at DESC, rowid DESC";
  const rows = (supplierId ? db.prepare(query).all(supplierId) : db.prepare(query).all()) as any[];

  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    supplierId: r.supplier_id,
    date: r.date,
    type: r.type,
    referenceId: r.reference_id ?? undefined,
    debit: r.debit,
    credit: r.credit,
    balance: r.balance,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getCashbook(db: DatabaseSync): CashbookEntry[] {
  const rows = db.prepare("SELECT * FROM cashbook ORDER BY date DESC, created_at DESC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    date: r.date,
    type: r.type,
    referenceId: r.reference_id ?? undefined,
    category: r.category ?? undefined,
    inflow: r.inflow,
    outflow: r.outflow,
    balance: r.balance,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getAuditLogs(db: DatabaseSync): AuditLog[] {
  const rows = db.prepare("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 200").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    userId: r.user_id ?? undefined,
    userName: r.user_name ?? undefined,
    action: r.action,
    module: r.module,
    recordId: r.record_id ?? undefined,
    oldValue: r.old_value ?? undefined,
    newValue: r.new_value ?? undefined,
    reason: r.reason ?? undefined,
    adminApprovedBy: r.admin_approved_by ?? undefined,
    createdAt: r.created_at,
  }));
}

export function getPurchaseAttachments(db: DatabaseSync, purchaseId?: string): PurchaseAttachment[] {
  const query = purchaseId
    ? "SELECT * FROM purchase_attachments WHERE purchase_id = ? ORDER BY created_at DESC"
    : "SELECT * FROM purchase_attachments ORDER BY created_at DESC";
  const rows = (purchaseId ? db.prepare(query).all(purchaseId) : db.prepare(query).all()) as any[];
  return rows.map((r) => ({
    id: r.id,
    purchaseId: r.purchase_id,
    fileName: r.file_name,
    fileType: r.file_type,
    fileSize: r.file_size ?? undefined,
    fileData: r.file_data,
    createdAt: r.created_at,
  }));
}

export function savePurchaseAttachment(
  db: DatabaseSync,
  item: { id: string; purchaseId: string; fileName: string; fileType: string; fileSize?: number; fileData: string; createdAt: string }
): void {
  db.prepare(`
    INSERT INTO purchase_attachments (id, purchase_id, file_name, file_type, file_size, file_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(item.id, item.purchaseId, item.fileName, item.fileType, item.fileSize || 0, item.fileData, item.createdAt);
}

export function deletePurchaseAttachment(db: DatabaseSync, id: string): void {
  db.prepare("DELETE FROM purchase_attachments WHERE id = ?").run(id);
}

export function getCreditNotes(db: DatabaseSync, customerId?: string): CreditNote[] {
  try {
    const query = customerId
      ? `SELECT cn.*, c.name as customer_name, c.phone as customer_phone
         FROM credit_notes cn
         JOIN customers c ON cn.customer_id = c.id
         WHERE cn.customer_id = ?
         ORDER BY cn.date DESC, cn.created_at DESC`
      : `SELECT cn.*, c.name as customer_name, c.phone as customer_phone
         FROM credit_notes cn
         JOIN customers c ON cn.customer_id = c.id
         ORDER BY cn.date DESC, cn.created_at DESC`;
    const rows = (customerId ? db.prepare(query).all(customerId) : db.prepare(query).all()) as any[];

    return rows.map((r) => {
      const items = db
        .prepare("SELECT * FROM credit_note_items WHERE credit_note_id = ?")
        .all(r.id) as any[];

      return {
        id: r.id,
        businessId: r.business_id,
        branchId: r.branch_id,
        creditNoteNo: r.credit_note_no,
        noteNumber: r.credit_note_no,
        date: r.date,
        customerId: r.customer_id,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        saleId: r.sale_id ?? undefined,
        originalInvoiceNo: r.original_invoice_no ?? undefined,
        originalInvoiceDate: r.original_invoice_date ?? undefined,
        reason: r.reason,
        notes: r.notes ?? undefined,
        invoiceType: r.invoice_type || "GST",
        subtotal: r.subtotal || 0,
        tax: r.tax || 0,
        cgst: r.cgst || 0,
        sgst: r.sgst || 0,
        igst: r.igst || 0,
        total: r.total || 0,
        amount: r.total || 0,
        refundedAmount: r.refunded_amount || 0,
        appliedAmount: r.applied_amount || 0,
        remainingAmount: r.remaining_amount || 0,
        physicalReturn: Boolean(r.physical_return),
        adjustmentType: r.adjustment_type || "CUSTOMER_CREDIT",
        status: r.status || "ISSUED",
        returnId: r.return_id ?? undefined,
        createdBy: r.created_by ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? undefined,
        items: items.map((i) => ({
          id: i.id,
          creditNoteId: i.credit_note_id,
          productId: i.product_id,
          unitId: i.unit_id ?? undefined,
          imei: i.imei ?? undefined,
          name: i.name,
          qty: i.qty,
          rate: i.rate,
          discount: i.discount || 0,
          taxableAmount: i.taxable_amount,
          gstRate: i.gst_rate,
          taxAmount: i.tax_amount,
          total: i.total,
          physicalReturn: Boolean(i.physical_return),
        })),
      };
    });
  } catch {
    return [];
  }
}

export function getDebitNotes(db: DatabaseSync, dealerId?: string): DebitNote[] {
  try {
    const query = dealerId
      ? `SELECT dn.*, s.name as dealer_name, s.phone as dealer_phone
         FROM debit_notes dn
         JOIN suppliers s ON dn.dealer_id = s.id
         WHERE dn.dealer_id = ?
         ORDER BY dn.date DESC, dn.created_at DESC`
      : `SELECT dn.*, s.name as dealer_name, s.phone as dealer_phone
         FROM debit_notes dn
         JOIN suppliers s ON dn.dealer_id = s.id
         ORDER BY dn.date DESC, dn.created_at DESC`;
    const rows = (dealerId ? db.prepare(query).all(dealerId) : db.prepare(query).all()) as any[];

    return rows.map((r) => {
      let items: any[] = [];
      try {
        items = db
          .prepare("SELECT * FROM debit_note_items WHERE debit_note_id = ?")
          .all(r.id) as any[];
      } catch {
        items = [];
      }

      return {
        id: r.id,
        businessId: r.business_id,
        branchId: r.branch_id,
        debitNoteNo: r.debit_note_no,
        noteNumber: r.debit_note_no,
        date: r.date,
        supplierId: r.dealer_id,
        dealerId: r.dealer_id,
        dealerName: r.dealer_name,
        dealerPhone: r.dealer_phone,
        purchaseId: r.purchase_id ?? undefined,
        originalInvoiceNo: r.original_invoice_no ?? undefined,
        originalInvoiceDate: r.original_invoice_date ?? undefined,
        reason: r.reason,
        notes: r.remarks ?? undefined,
        remarks: r.remarks ?? undefined,
        invoiceType: r.invoice_type || "GST",
        subtotal: r.subtotal !== undefined ? r.subtotal : r.amount,
        tax: r.tax || 0,
        cgst: r.cgst || 0,
        sgst: r.sgst || 0,
        igst: r.igst || 0,
        total: r.total !== undefined ? r.total : r.amount,
        amount: r.amount,
        taxableValue: r.taxable_value !== undefined ? r.taxable_value : r.amount,
        refundedAmount: r.refunded_amount || 0,
        appliedAmount: r.applied_amount || 0,
        remainingAmount: r.remaining_amount !== undefined ? r.remaining_amount : r.amount,
        physicalReturn: Boolean(r.physical_return),
        adjustmentType: r.adjustment_type || "DEALER_CREDIT",
        status: r.status || "ACTIVE",
        section: r.tds_section ?? undefined,
        tdsSection: r.tds_section ?? undefined,
        ratePct: r.tds_rate ?? undefined,
        tdsRate: r.tds_rate ?? undefined,
        tdsAmount: r.tds_amount ?? undefined,
        otherCharges: r.other_charges ?? undefined,
        adjustmentAmount: r.adjustment_amount ?? undefined,
        returnId: r.return_id ?? undefined,
        createdBy: r.created_by ?? undefined,
        createdAt: r.created_at,
        updatedAt: r.updated_at ?? undefined,
        items: items.map((i) => ({
          id: i.id,
          debitNoteId: i.debit_note_id,
          productId: i.product_id,
          unitId: i.unit_id ?? undefined,
          imei: i.imei ?? undefined,
          name: i.name,
          qty: i.qty,
          rate: i.rate,
          discount: i.discount || 0,
          taxableAmount: i.taxable_amount,
          gstRate: i.gst_rate,
          taxAmount: i.tax_amount,
          total: i.total,
          physicalReturn: Boolean(i.physical_return),
        })),
      };
    });
  } catch {
    return [];
  }
}

export function getFullDB(db: DatabaseSync): DB {
  return {
    products: getProducts(db),
    units: getUnits(db),
    customers: getCustomers(db),
    suppliers: getSuppliers(db),
    sales: getSales(db),
    purchases: getPurchases(db),
    purchaseAttachments: getPurchaseAttachments(db),
    creditNotes: getCreditNotes(db),
    debitNotes: getDebitNotes(db),
    returns: getReturns(db),
    repairs: getRepairs(db),
    expenses: getExpenses(db),
    payments: getPayments(db),
    employees: getEmployees(db),
    attendance: getAttendance(db),
    payroll: getPayroll(db),
    stockMovements: getStockMovements(db),
    customerLedger: getCustomerLedger(db),
    supplierLedger: getSupplierLedger(db),
    cashbook: getCashbook(db),
    auditLogs: getAuditLogs(db),
    branches: getBranches(db),
    settings: getSettings(db),
    paymentAccounts: getPaymentAccounts(db),
    orders: getOrders(db),
  };
}
