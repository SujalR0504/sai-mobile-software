import type { DatabaseSync } from "node:sqlite";
import { seedDB } from "./seed";
import type { DB } from "../../lib/types";

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      latitude REAL NOT NULL DEFAULT 28.5355,
      longitude REAL NOT NULL DEFAULT 77.3910,
      allowed_radius_meters INTEGER NOT NULL DEFAULT 200,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'SALES',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      role_name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      role TEXT NOT NULL,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS admin_pins (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      created_by TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      shop_name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      owner_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      gstin TEXT NOT NULL,
      default_gst REAL NOT NULL,
      invoice_prefix TEXT NOT NULL,
      opening_cash REAL NOT NULL,
      shop_latitude REAL DEFAULT 28.5355,
      shop_longitude REAL DEFAULT 77.3910,
      allowed_radius_meters INTEGER DEFAULT 200
    );

    CREATE TABLE IF NOT EXISTS employees (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      employee_id TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      photo TEXT,
      mobile TEXT NOT NULL,
      email TEXT,
      address TEXT,
      joining_date TEXT NOT NULL,
      department TEXT NOT NULL,
      designation TEXT NOT NULL,
      salary_type TEXT NOT NULL,
      basic_salary REAL NOT NULL,
      bank_details TEXT,
      emergency_contact TEXT,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      role TEXT NOT NULL DEFAULT 'SALES',
      user_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      employee_name TEXT,
      date TEXT NOT NULL,
      check_in_time TEXT,
      check_out_time TEXT,
      latitude REAL,
      longitude REAL,
      accuracy REAL,
      distance_from_shop REAL,
      is_within_radius INTEGER NOT NULL DEFAULT 1,
      device_information TEXT,
      status TEXT NOT NULL,
      admin_override INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payroll (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      employee_id TEXT NOT NULL REFERENCES employees(id),
      employee_name TEXT,
      month INTEGER NOT NULL,
      year INTEGER NOT NULL,
      basic_salary REAL NOT NULL,
      allowances REAL NOT NULL DEFAULT 0,
      overtime REAL NOT NULL DEFAULT 0,
      commission REAL NOT NULL DEFAULT 0,
      bonus REAL NOT NULL DEFAULT 0,
      deductions REAL NOT NULL DEFAULT 0,
      advances REAL NOT NULL DEFAULT 0,
      attendance_deductions REAL NOT NULL DEFAULT 0,
      gross_salary REAL NOT NULL,
      net_salary REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'DRAFT',
      payment_date TEXT,
      payment_method TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      name TEXT NOT NULL,
      mobile TEXT,
      phone TEXT NOT NULL,
      whatsapp TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      gstin TEXT,
      customer_type TEXT,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      name TEXT NOT NULL,
      company TEXT,
      phone TEXT NOT NULL,
      mobile TEXT,
      whatsapp TEXT,
      email TEXT,
      gstin TEXT,
      address TEXT,
      city TEXT,
      state TEXT DEFAULT 'Madhya Pradesh',
      state_code TEXT DEFAULT '23',
      contact_person TEXT,
      notes TEXT,
      credit_limit REAL,
      payment_terms TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      name TEXT NOT NULL,
      brand TEXT NOT NULL,
      model TEXT NOT NULL,
      variant TEXT,
      ram TEXT,
      storage TEXT,
      color TEXT,
      category TEXT NOT NULL,
      tracked INTEGER NOT NULL DEFAULT 1,
      sku TEXT,
      barcode TEXT,
      hsn TEXT,
      mrp REAL NOT NULL,
      purchase_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      minimum_selling_price REAL,
      minimum_stock INTEGER DEFAULT 2,
      gst REAL NOT NULL,
      supplier_id TEXT,
      warranty_months INTEGER NOT NULL DEFAULT 12,
      qty INTEGER NOT NULL DEFAULT 0,
      reorder_level INTEGER NOT NULL DEFAULT 2
    );

    CREATE TABLE IF NOT EXISTS units (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      imei1 TEXT NOT NULL,
      imei2 TEXT,
      serial TEXT,
      purchase_price REAL NOT NULL,
      selling_price REAL,
      status TEXT NOT NULL,
      purchase_id TEXT,
      sale_id TEXT,
      customer_id TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT,
      unit_id TEXT,
      imei TEXT,
      movement_type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      cost_per_unit REAL NOT NULL,
      reference_id TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      invoice_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      discount REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      paid REAL NOT NULL,
      quotation INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'COMPLETED'
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit_id TEXT,
      imei TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      gst REAL NOT NULL,
      cost_price REAL NOT NULL,
      warranty_months INTEGER
    );

    CREATE TABLE IF NOT EXISTS sale_payments (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      amount REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      invoice_no TEXT NOT NULL,
      date TEXT NOT NULL,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id),
      discount REAL NOT NULL DEFAULT 0,
      subtotal REAL NOT NULL,
      tax REAL NOT NULL,
      total REAL NOT NULL,
      paid REAL NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'COMPLETED'
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      gst REAL NOT NULL,
      cost_price REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      ref_no TEXT NOT NULL,
      date TEXT NOT NULL,
      party_id TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT NOT NULL,
      condition TEXT DEFAULT 'GOOD',
      mode TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS return_items (
      id TEXT PRIMARY KEY,
      return_id TEXT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      unit_id TEXT,
      name TEXT NOT NULL,
      qty INTEGER NOT NULL,
      price REAL NOT NULL,
      gst REAL NOT NULL DEFAULT 0,
      cost_price REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS repairs (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      job_id TEXT NOT NULL UNIQUE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_mobile TEXT,
      device_brand TEXT,
      device TEXT NOT NULL,
      imei TEXT,
      problem TEXT NOT NULL,
      physical_condition TEXT,
      accessories_received TEXT,
      estimate REAL NOT NULL,
      advance REAL NOT NULL DEFAULT 0,
      technician TEXT NOT NULL,
      status TEXT NOT NULL,
      warranty_status TEXT DEFAULT 'NONE',
      expected_delivery_date TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS repair_parts (
      id TEXT PRIMARY KEY,
      repair_id TEXT NOT NULL REFERENCES repairs(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      part_name TEXT NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      cost_price REAL NOT NULL,
      selling_price REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      date TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_method TEXT DEFAULT 'Cash',
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      date TEXT NOT NULL,
      party TEXT NOT NULL,
      party_id TEXT NOT NULL,
      ref_id TEXT,
      amount REAL NOT NULL,
      mode TEXT NOT NULL,
      note TEXT
    );

    CREATE TABLE IF NOT EXISTS customer_ledger (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      reference_id TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS supplier_ledger (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      reference_id TEXT,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cashbook (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      branch_id TEXT,
      date TEXT NOT NULL,
      type TEXT NOT NULL,
      reference_id TEXT,
      category TEXT,
      inflow REAL NOT NULL DEFAULT 0,
      outflow REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      business_id TEXT,
      user_id TEXT,
      user_name TEXT,
      action TEXT NOT NULL,
      module TEXT NOT NULL,
      record_id TEXT,
      old_value TEXT,
      new_value TEXT,
      reason TEXT,
      admin_approved_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS finance_companies (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      contact_person TEXT,
      mobile TEXT,
      email TEXT,
      address TEXT,
      settlement_days INTEGER DEFAULT 7,
      processing_fee REAL DEFAULT 0,
      default_interest_rate REAL DEFAULT 0,
      default_tenure INTEGER DEFAULT 12,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_receivables (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_company_id TEXT NOT NULL REFERENCES finance_companies(id),
      emi_company_name TEXT NOT NULL,
      finance_reference_number TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      invoice_id TEXT NOT NULL,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL,
      imei TEXT,
      total_amount REAL NOT NULL,
      down_payment REAL NOT NULL,
      emi_financed_amount REAL NOT NULL,
      processing_fee REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      net_receivable REAL NOT NULL,
      received_amount REAL NOT NULL DEFAULT 0,
      emi_sale_date TEXT NOT NULL,
      expected_payment_date TEXT,
      received_date TEXT,
      payment_method TEXT,
      status TEXT NOT NULL DEFAULT 'EMI_PENDING',
      notes TEXT,
      created_by TEXT,
      received_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_receipts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_receivable_id TEXT NOT NULL REFERENCES emi_receivables(id) ON DELETE CASCADE,
      amount_received REAL NOT NULL,
      received_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      bank_reference TEXT,
      notes TEXT,
      received_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_accounts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      sale_id TEXT REFERENCES sales(id),
      invoice_id TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      product_id TEXT,
      product_name TEXT,
      imei TEXT,
      finance_company_id TEXT REFERENCES finance_companies(id),
      finance_company_name TEXT,
      product_price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      sale_amount REAL NOT NULL,
      down_payment REAL NOT NULL,
      finance_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      interest_type TEXT NOT NULL DEFAULT 'ANNUAL_REDUCING',
      tenure_months INTEGER NOT NULL,
      processing_fee REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      first_emi_date TEXT NOT NULL,
      monthly_emi REAL NOT NULL,
      total_interest REAL NOT NULL DEFAULT 0,
      total_payable REAL NOT NULL,
      total_paid REAL NOT NULL DEFAULT 0,
      outstanding_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      foreclosed_at TEXT,
      foreclosure_charges REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_schedules (
      id TEXT PRIMARY KEY,
      emi_account_id TEXT NOT NULL REFERENCES emi_accounts(id) ON DELETE CASCADE,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      opening_principal REAL NOT NULL,
      emi_amount REAL NOT NULL,
      interest_amount REAL NOT NULL,
      principal_amount REAL NOT NULL,
      closing_principal REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_payments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_account_id TEXT NOT NULL REFERENCES emi_accounts(id) ON DELETE CASCADE,
      installment_id TEXT REFERENCES emi_schedules(id),
      installment_number INTEGER,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      reference_number TEXT,
      remarks TEXT,
      is_foreclosure INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      slug TEXT,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT,
      logo TEXT,
      logo_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      model_number TEXT,
      release_year INTEGER,
      series TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employee_permissions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(business_id, employee_id, module, action)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      branch_id TEXT DEFAULT 'branch_01',
      order_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      expected_delivery_date TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      sales_person TEXT,
      invoice_type TEXT NOT NULL DEFAULT 'GST',
      subtotal REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      advance_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      sale_id TEXT REFERENCES sales(id),
      notes TEXT,
      stock_reserved INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      category TEXT,
      brand TEXT,
      model TEXT,
      unit_id TEXT REFERENCES units(id),
      imei TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      gst REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      warranty_months INTEGER
    );

    CREATE TABLE IF NOT EXISTS order_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      payment_id TEXT REFERENCES payments(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_account_id TEXT REFERENCES payment_accounts(id),
      reference_number TEXT,
      payment_date TEXT NOT NULL,
      remarks TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      action TEXT NOT NULL,
      user TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_perm_unique ON employee_permissions(business_id, employee_id, module, action);

    CREATE INDEX IF NOT EXISTS idx_units_product ON units(product_id);
    CREATE INDEX IF NOT EXISTS idx_units_imei1 ON units(imei1);
    CREATE INDEX IF NOT EXISTS idx_units_status ON units(status);
    CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(date);
    CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_repairs_status ON repairs(status);
    CREATE INDEX IF NOT EXISTS idx_payments_party ON payments(party, party_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_prod ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_customer_ledger ON customer_ledger(customer_id);
    CREATE INDEX IF NOT EXISTS idx_supplier_ledger ON supplier_ledger(supplier_id);
    CREATE INDEX IF NOT EXISTS idx_cashbook_date ON cashbook(date);
    CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance(employee_id, date);
    CREATE INDEX IF NOT EXISTS idx_payroll_emp_month ON payroll(employee_id, month, year);
    CREATE INDEX IF NOT EXISTS idx_emi_receivables_status ON emi_receivables(status);
    CREATE INDEX IF NOT EXISTS idx_emi_receivables_company ON emi_receivables(emi_company_id);
    CREATE INDEX IF NOT EXISTS idx_emi_receivables_sale ON emi_receivables(sale_id);
    CREATE INDEX IF NOT EXISTS idx_emi_receipts_receivable ON emi_receipts(emi_receivable_id);
    CREATE INDEX IF NOT EXISTS idx_subcategories_cat ON subcategories(category_id);
    CREATE INDEX IF NOT EXISTS idx_brands_subcat ON brands(subcategory_id);
    CREATE INDEX IF NOT EXISTS idx_models_brand ON models(brand_id);
    CREATE INDEX IF NOT EXISTS idx_emp_permissions ON employee_permissions(employee_id, module, action);
    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);
  `);

  runMigrations(db);
}


function addColumnIfNotExists(db: DatabaseSync, table: string, column: string, typeDef: string) {
  try {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${typeDef}`);
    }
  } catch {
    // Ignore error if column/table already exists or handled
  }
}

export function runMigrations(db: DatabaseSync): void {
  addColumnIfNotExists(db, "sales", "business_id", "TEXT");
  addColumnIfNotExists(db, "sales", "branch_id", "TEXT");
  addColumnIfNotExists(db, "sales", "status", "TEXT NOT NULL DEFAULT 'COMPLETED'");

  addColumnIfNotExists(db, "sale_items", "cost_price", "REAL NOT NULL DEFAULT 0");
  addColumnIfNotExists(db, "sale_items", "warranty_months", "INTEGER");

  addColumnIfNotExists(db, "purchases", "business_id", "TEXT");
  addColumnIfNotExists(db, "purchases", "branch_id", "TEXT");
  addColumnIfNotExists(db, "purchases", "status", "TEXT NOT NULL DEFAULT 'COMPLETED'");

  addColumnIfNotExists(db, "customers", "business_id", "TEXT");
  addColumnIfNotExists(db, "customers", "mobile", "TEXT");
  addColumnIfNotExists(db, "customers", "whatsapp", "TEXT");
  addColumnIfNotExists(db, "customers", "email", "TEXT");
  addColumnIfNotExists(db, "customers", "city", "TEXT");
  addColumnIfNotExists(db, "customers", "customer_type", "TEXT");
  addColumnIfNotExists(db, "customers", "notes", "TEXT");

  addColumnIfNotExists(db, "suppliers", "business_id", "TEXT");
  addColumnIfNotExists(db, "suppliers", "company", "TEXT");
  addColumnIfNotExists(db, "suppliers", "mobile", "TEXT");
  addColumnIfNotExists(db, "suppliers", "whatsapp", "TEXT");
  addColumnIfNotExists(db, "suppliers", "email", "TEXT");
  addColumnIfNotExists(db, "suppliers", "gstin", "TEXT");
  addColumnIfNotExists(db, "suppliers", "address", "TEXT");
  addColumnIfNotExists(db, "suppliers", "notes", "TEXT");
  addColumnIfNotExists(db, "suppliers", "credit_limit", "REAL");
  addColumnIfNotExists(db, "suppliers", "payment_terms", "TEXT");

  addColumnIfNotExists(db, "products", "business_id", "TEXT");
  addColumnIfNotExists(db, "products", "branch_id", "TEXT");
  addColumnIfNotExists(db, "products", "sku", "TEXT");
  addColumnIfNotExists(db, "products", "barcode", "TEXT");
  addColumnIfNotExists(db, "products", "hsn", "TEXT");
  addColumnIfNotExists(db, "products", "minimum_selling_price", "REAL");
  addColumnIfNotExists(db, "products", "minimum_stock", "INTEGER DEFAULT 2");
  addColumnIfNotExists(db, "products", "reorder_level", "INTEGER NOT NULL DEFAULT 5");
  addColumnIfNotExists(db, "products", "color", "TEXT");
  addColumnIfNotExists(db, "products", "warranty_months", "INTEGER");


  addColumnIfNotExists(db, "units", "business_id", "TEXT");
  addColumnIfNotExists(db, "units", "branch_id", "TEXT");
  addColumnIfNotExists(db, "units", "imei2", "TEXT");
  addColumnIfNotExists(db, "units", "cost_price", "REAL NOT NULL DEFAULT 0");
  addColumnIfNotExists(db, "units", "selling_price", "REAL");
  addColumnIfNotExists(db, "units", "purchase_id", "TEXT");

  addColumnIfNotExists(db, "settings", "shop_latitude", "REAL DEFAULT 28.5355");
  addColumnIfNotExists(db, "settings", "shop_longitude", "REAL DEFAULT 77.3910");
  addColumnIfNotExists(db, "settings", "allowed_radius_meters", "INTEGER DEFAULT 200");
  addColumnIfNotExists(db, "settings", "logo_url", "TEXT DEFAULT '/shri_sai_logo.png'");
  addColumnIfNotExists(db, "settings", "brands_banner_url", "TEXT DEFAULT '/brands_banner.png'");
  addColumnIfNotExists(db, "settings", "location_qr_url", "TEXT DEFAULT '/location_qr.png'");
  addColumnIfNotExists(db, "settings", "upi_id", "TEXT DEFAULT '8770758326@upi'");
  addColumnIfNotExists(db, "settings", "upi_qr_url", "TEXT");
  addColumnIfNotExists(db, "settings", "city", "TEXT DEFAULT 'Harda'");
  addColumnIfNotExists(db, "settings", "state", "TEXT DEFAULT 'Madhya Pradesh'");
  addColumnIfNotExists(db, "settings", "state_code", "TEXT DEFAULT '23'");
  addColumnIfNotExists(db, "settings", "pincode", "TEXT DEFAULT '461331'");
  addColumnIfNotExists(db, "settings", "pan", "TEXT DEFAULT 'ASFPG1385D'");
  addColumnIfNotExists(db, "settings", "whatsapp", "TEXT DEFAULT '8770758326'");
  addColumnIfNotExists(db, "settings", "email", "TEXT DEFAULT 'saimobileharda@gmail.com'");
  addColumnIfNotExists(db, "settings", "website", "TEXT");
  addColumnIfNotExists(db, "settings", "bank_name", "TEXT DEFAULT 'State Bank of India'");
  addColumnIfNotExists(db, "settings", "bank_account_no", "TEXT DEFAULT '39810293847'");
  addColumnIfNotExists(db, "settings", "bank_ifsc", "TEXT DEFAULT 'SBIN0000382'");
  addColumnIfNotExists(db, "settings", "bank_branch", "TEXT DEFAULT 'Main Branch, Harda'");
  addColumnIfNotExists(db, "settings", "terms_and_conditions", "TEXT");
  addColumnIfNotExists(db, "settings", "watermark_enabled", "INTEGER DEFAULT 1");
  addColumnIfNotExists(db, "settings", "watermark_text", "TEXT DEFAULT 'SHRI SAI MOBILE'");
  addColumnIfNotExists(db, "settings", "signature_url", "TEXT");
  addColumnIfNotExists(db, "settings", "signature_title", "TEXT DEFAULT 'Authorised Signatory'");
  addColumnIfNotExists(db, "settings", "gst_invoice_prefix", "TEXT DEFAULT 'GST/2026-27/'");
  addColumnIfNotExists(db, "settings", "nongst_invoice_prefix", "TEXT DEFAULT 'NG/2026-27/'");
  addColumnIfNotExists(db, "settings", "purchase_invoice_prefix", "TEXT DEFAULT 'PUR/2026-27/'");
  addColumnIfNotExists(db, "settings", "primary_color", "TEXT DEFAULT '#000000'");
  addColumnIfNotExists(db, "settings", "secondary_color", "TEXT DEFAULT '#f97316'");
  addColumnIfNotExists(db, "settings", "deals_in", "TEXT DEFAULT 'Mobile Phones & Electronics Items'");
  addColumnIfNotExists(db, "settings", "business_services", "TEXT DEFAULT 'SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE'");
  addColumnIfNotExists(db, "settings", "footer_text", "TEXT DEFAULT 'MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER'");

  addColumnIfNotExists(db, "repairs", "business_id", "TEXT");
  addColumnIfNotExists(db, "repairs", "branch_id", "TEXT");
  addColumnIfNotExists(db, "repairs", "customer_mobile", "TEXT");
  addColumnIfNotExists(db, "repairs", "device_brand", "TEXT");
  addColumnIfNotExists(db, "repairs", "imei", "TEXT");
  addColumnIfNotExists(db, "repairs", "physical_condition", "TEXT");
  addColumnIfNotExists(db, "repairs", "accessories_received", "TEXT");
  addColumnIfNotExists(db, "repairs", "warranty_status", "TEXT DEFAULT 'NONE'");
  addColumnIfNotExists(db, "repairs", "expected_delivery_date", "TEXT");

  addColumnIfNotExists(db, "expenses", "business_id", "TEXT");
  addColumnIfNotExists(db, "expenses", "branch_id", "TEXT");
  addColumnIfNotExists(db, "expenses", "payment_method", "TEXT DEFAULT 'Cash'");

  addColumnIfNotExists(db, "payments", "business_id", "TEXT");
  addColumnIfNotExists(db, "payments", "branch_id", "TEXT");

  addColumnIfNotExists(db, "cashbook", "business_id", "TEXT");
  addColumnIfNotExists(db, "cashbook", "branch_id", "TEXT");

  addColumnIfNotExists(db, "returns", "business_id", "TEXT");
  addColumnIfNotExists(db, "returns", "branch_id", "TEXT");
  addColumnIfNotExists(db, "returns", "condition", "TEXT DEFAULT 'GOOD'");

  addColumnIfNotExists(db, "return_items", "gst", "REAL NOT NULL DEFAULT 0");
  addColumnIfNotExists(db, "return_items", "cost_price", "REAL NOT NULL DEFAULT 0");

  // New Columns for Category Hierarchy & EMI Sales
  addColumnIfNotExists(db, "products", "category_id", "TEXT");
  addColumnIfNotExists(db, "products", "subcategory_id", "TEXT");
  addColumnIfNotExists(db, "products", "brand_id", "TEXT");
  addColumnIfNotExists(db, "products", "model_id", "TEXT");

  addColumnIfNotExists(db, "sales", "is_emi", "INTEGER DEFAULT 0");
  addColumnIfNotExists(db, "sales", "emi_company_id", "TEXT");
  addColumnIfNotExists(db, "sales", "emi_receivable_id", "TEXT");
  addColumnIfNotExists(db, "sales", "emi_account_id", "TEXT");
  addColumnIfNotExists(db, "sales", "emi_down_payment", "REAL");
  addColumnIfNotExists(db, "sales", "emi_financed_amount", "REAL");

  addColumnIfNotExists(db, "finance_companies", "default_interest_rate", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "finance_companies", "default_tenure", "INTEGER DEFAULT 12");

  // Ensure new tables are created in existing databases
  db.exec(`
    CREATE TABLE IF NOT EXISTS finance_companies (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      company_name TEXT NOT NULL,
      contact_person TEXT,
      mobile TEXT,
      email TEXT,
      address TEXT,
      settlement_days INTEGER DEFAULT 7,
      processing_fee REAL DEFAULT 0,
      default_interest_rate REAL DEFAULT 0,
      default_tenure INTEGER DEFAULT 12,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_accounts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      sale_id TEXT REFERENCES sales(id),
      invoice_id TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      product_id TEXT,
      product_name TEXT,
      imei TEXT,
      finance_company_id TEXT REFERENCES finance_companies(id),
      finance_company_name TEXT,
      product_price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      sale_amount REAL NOT NULL,
      down_payment REAL NOT NULL,
      finance_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      interest_type TEXT NOT NULL DEFAULT 'ANNUAL_REDUCING',
      tenure_months INTEGER NOT NULL,
      processing_fee REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      first_emi_date TEXT NOT NULL,
      monthly_emi REAL NOT NULL,
      total_interest REAL NOT NULL DEFAULT 0,
      total_payable REAL NOT NULL,
      total_paid REAL NOT NULL DEFAULT 0,
      outstanding_amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      foreclosed_at TEXT,
      foreclosure_charges REAL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_schedules (
      id TEXT PRIMARY KEY,
      emi_account_id TEXT NOT NULL REFERENCES emi_accounts(id) ON DELETE CASCADE,
      installment_number INTEGER NOT NULL,
      due_date TEXT NOT NULL,
      opening_principal REAL NOT NULL,
      emi_amount REAL NOT NULL,
      interest_amount REAL NOT NULL,
      principal_amount REAL NOT NULL,
      closing_principal REAL NOT NULL,
      paid_amount REAL NOT NULL DEFAULT 0,
      paid_date TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_payments (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_account_id TEXT NOT NULL REFERENCES emi_accounts(id) ON DELETE CASCADE,
      installment_id TEXT REFERENCES emi_schedules(id),
      installment_number INTEGER,
      customer_id TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      payment_date TEXT NOT NULL,
      amount REAL NOT NULL,
      payment_mode TEXT NOT NULL DEFAULT 'Cash',
      reference_number TEXT,
      remarks TEXT,
      is_foreclosure INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_emi_accounts_customer ON emi_accounts(customer_id);
    CREATE INDEX IF NOT EXISTS idx_emi_accounts_sale ON emi_accounts(sale_id);
    CREATE INDEX IF NOT EXISTS idx_emi_accounts_status ON emi_accounts(status);
    CREATE INDEX IF NOT EXISTS idx_emi_schedules_account ON emi_schedules(emi_account_id, installment_number);
    CREATE INDEX IF NOT EXISTS idx_emi_payments_account ON emi_payments(emi_account_id);

    CREATE TABLE IF NOT EXISTS emi_receivables (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_company_id TEXT NOT NULL REFERENCES finance_companies(id),
      emi_company_name TEXT NOT NULL,
      finance_reference_number TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      invoice_id TEXT NOT NULL,
      sale_id TEXT NOT NULL REFERENCES sales(id),
      product_id TEXT NOT NULL,
      imei TEXT,
      total_amount REAL NOT NULL,
      down_payment REAL NOT NULL,
      emi_financed_amount REAL NOT NULL,
      processing_fee REAL NOT NULL DEFAULT 0,
      other_charges REAL NOT NULL DEFAULT 0,
      net_receivable REAL NOT NULL,
      received_amount REAL NOT NULL DEFAULT 0,
      emi_sale_date TEXT NOT NULL,
      expected_payment_date TEXT,
      received_date TEXT,
      payment_method TEXT,
      status TEXT NOT NULL DEFAULT 'EMI_PENDING',
      notes TEXT,
      created_by TEXT,
      received_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS emi_receipts (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      emi_receivable_id TEXT NOT NULL REFERENCES emi_receivables(id) ON DELETE CASCADE,
      amount_received REAL NOT NULL,
      received_date TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      bank_reference TEXT,
      notes TEXT,
      received_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      name TEXT NOT NULL UNIQUE,
      slug TEXT,
      description TEXT,
      icon TEXT,
      sort_order INTEGER DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subcategories (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT,
      description TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      subcategory_id TEXT REFERENCES subcategories(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      slug TEXT,
      logo TEXT,
      logo_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      brand_id TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      model_number TEXT,
      release_year INTEGER,
      series TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employee_permissions (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      action TEXT NOT NULL,
      allowed INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(business_id, employee_id, module, action)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_emp_perm_unique ON employee_permissions(business_id, employee_id, module, action);
  `);

  addColumnIfNotExists(db, "categories", "slug", "TEXT");
  addColumnIfNotExists(db, "categories", "active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists(db, "subcategories", "slug", "TEXT");
  addColumnIfNotExists(db, "subcategories", "active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists(db, "brands", "slug", "TEXT");
  addColumnIfNotExists(db, "brands", "logo_url", "TEXT");
  addColumnIfNotExists(db, "brands", "active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists(db, "models", "model_number", "TEXT");
  addColumnIfNotExists(db, "models", "release_year", "INTEGER");
  addColumnIfNotExists(db, "models", "active", "INTEGER NOT NULL DEFAULT 1");
  addColumnIfNotExists(db, "finance_companies", "active", "INTEGER NOT NULL DEFAULT 1");

  // Dealer (Supplier) Details
  addColumnIfNotExists(db, "suppliers", "city", "TEXT");
  addColumnIfNotExists(db, "suppliers", "state", "TEXT DEFAULT 'Madhya Pradesh'");
  addColumnIfNotExists(db, "suppliers", "state_code", "TEXT DEFAULT '23'");
  addColumnIfNotExists(db, "suppliers", "contact_person", "TEXT");

  // Purchase Details & Invoice Metadata
  addColumnIfNotExists(db, "purchases", "purchase_type", "TEXT DEFAULT 'GST'");
  addColumnIfNotExists(db, "purchases", "original_invoice_no", "TEXT");
  addColumnIfNotExists(db, "purchases", "original_invoice_date", "TEXT");
  addColumnIfNotExists(db, "purchases", "reference_no", "TEXT");
  addColumnIfNotExists(db, "purchases", "po_number", "TEXT");
  addColumnIfNotExists(db, "purchases", "eway_bill_no", "TEXT");
  addColumnIfNotExists(db, "purchases", "delivery_note_no", "TEXT");
  addColumnIfNotExists(db, "purchases", "delivery_note_date", "TEXT");
  addColumnIfNotExists(db, "purchases", "dispatch_doc_no", "TEXT");
  addColumnIfNotExists(db, "purchases", "dispatch_doc_date", "TEXT");
  addColumnIfNotExists(db, "purchases", "dispatched_through", "TEXT");
  addColumnIfNotExists(db, "purchases", "destination", "TEXT");
  addColumnIfNotExists(db, "purchases", "terms_of_delivery", "TEXT");
  addColumnIfNotExists(db, "purchases", "payment_terms", "TEXT");
  addColumnIfNotExists(db, "purchases", "due_date", "TEXT");
  addColumnIfNotExists(db, "purchases", "place_of_supply", "TEXT DEFAULT 'Madhya Pradesh'");
  addColumnIfNotExists(db, "purchases", "state_code", "TEXT DEFAULT '23'");
  addColumnIfNotExists(db, "purchases", "received_by", "TEXT");
  addColumnIfNotExists(db, "purchases", "debit_note_ref", "TEXT");
  addColumnIfNotExists(db, "purchases", "credit_note_ref", "TEXT");
  addColumnIfNotExists(db, "purchases", "other_references", "TEXT");
  addColumnIfNotExists(db, "purchases", "taxable_value", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "cgst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "sgst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "igst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "other_charges", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "tds_applicable", "INTEGER DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "tds_section", "TEXT");
  addColumnIfNotExists(db, "purchases", "tds_rate", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "tds_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "round_off", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchases", "due_amount", "REAL DEFAULT 0");

  // Purchase Items columns
  addColumnIfNotExists(db, "purchase_items", "hsn_sac", "TEXT DEFAULT '85171300'");
  addColumnIfNotExists(db, "purchase_items", "unit", "TEXT DEFAULT 'pcs'");
  addColumnIfNotExists(db, "purchase_items", "rate_including_tax", "REAL");
  addColumnIfNotExists(db, "purchase_items", "rate_excluding_tax", "REAL");
  addColumnIfNotExists(db, "purchase_items", "discount_pct", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "discount_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "taxable_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "gst_rate", "REAL DEFAULT 18");
  addColumnIfNotExists(db, "purchase_items", "cgst_pct", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "cgst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "sgst_pct", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "sgst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "igst_pct", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "igst_amount", "REAL DEFAULT 0");
  addColumnIfNotExists(db, "purchase_items", "total_amount", "REAL DEFAULT 0");

  // Sales columns
  addColumnIfNotExists(db, "sales", "invoice_type", "TEXT DEFAULT 'GST'");
  addColumnIfNotExists(db, "sales", "selected_template_id", "TEXT DEFAULT 'modern'");

  // Sale Payments columns
  addColumnIfNotExists(db, "sale_payments", "payment_account_id", "TEXT");
  addColumnIfNotExists(db, "sale_payments", "reference_number", "TEXT");

  // Payments columns
  addColumnIfNotExists(db, "payments", "payment_account_id", "TEXT");
  addColumnIfNotExists(db, "payments", "reference_number", "TEXT");
  addColumnIfNotExists(db, "payments", "reference_no", "TEXT");
  addColumnIfNotExists(db, "payments", "cheque_no", "TEXT");
  addColumnIfNotExists(db, "payments", "bank_name", "TEXT");
  addColumnIfNotExists(db, "payments", "user_id", "TEXT");
  addColumnIfNotExists(db, "payments", "user_name", "TEXT");
  addColumnIfNotExists(db, "payments", "created_by", "TEXT");
  addColumnIfNotExists(db, "payments", "created_at", "TEXT");

  // Customer Ledger columns
  addColumnIfNotExists(db, "customer_ledger", "payment_account_id", "TEXT");
  addColumnIfNotExists(db, "customer_ledger", "payment_method", "TEXT");
  addColumnIfNotExists(db, "customer_ledger", "reference_no", "TEXT");

  // Supplier Ledger columns
  addColumnIfNotExists(db, "supplier_ledger", "payment_account_id", "TEXT");
  addColumnIfNotExists(db, "supplier_ledger", "payment_method", "TEXT");
  addColumnIfNotExists(db, "supplier_ledger", "reference_no", "TEXT");

  // Expenses columns
  addColumnIfNotExists(db, "expenses", "payment_account_id", "TEXT");
  addColumnIfNotExists(db, "expenses", "payment_method", "TEXT DEFAULT 'Cash'");

  // Create Purchase Attachments, Debit Notes, Payment Accounts & Transactions tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS purchase_attachments (
      id TEXT PRIMARY KEY,
      purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER,
      file_data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS debit_notes (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      branch_id TEXT,
      debit_note_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      dealer_id TEXT NOT NULL REFERENCES suppliers(id),
      original_invoice_no TEXT,
      original_invoice_date TEXT,
      reason TEXT NOT NULL,
      amount REAL NOT NULL,
      tax REAL DEFAULT 0,
      tds_applicable INTEGER DEFAULT 0,
      tds_section TEXT,
      tds_rate REAL DEFAULT 0,
      tds_amount REAL DEFAULT 0,
      other_charges REAL DEFAULT 0,
      adjustment_amount REAL DEFAULT 0,
      remarks TEXT,
      created_at TEXT NOT NULL,
      created_by TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_accounts (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      bank_name TEXT,
      upi_id TEXT,
      account_number TEXT,
      ifsc TEXT,
      opening_balance REAL NOT NULL DEFAULT 0,
      current_balance REAL NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS payment_account_transactions (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      account_id TEXT NOT NULL REFERENCES payment_accounts(id),
      transaction_type TEXT NOT NULL,
      reference_type TEXT,
      reference_id TEXT,
      amount REAL NOT NULL,
      debit REAL NOT NULL DEFAULT 0,
      credit REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL,
      payment_method TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_pat_account ON payment_account_transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_pat_type ON payment_account_transactions(transaction_type);
    CREATE INDEX IF NOT EXISTS idx_pat_ref ON payment_account_transactions(reference_id);

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      business_id TEXT DEFAULT 'biz_default',
      branch_id TEXT DEFAULT 'branch_01',
      order_no TEXT NOT NULL UNIQUE,
      date TEXT NOT NULL,
      expected_delivery_date TEXT,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_mobile TEXT,
      sales_person TEXT,
      invoice_type TEXT NOT NULL DEFAULT 'GST',
      subtotal REAL NOT NULL DEFAULT 0,
      tax REAL NOT NULL DEFAULT 0,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      advance_paid REAL NOT NULL DEFAULT 0,
      balance_due REAL NOT NULL DEFAULT 0,
      payment_status TEXT NOT NULL DEFAULT 'UNPAID',
      status TEXT NOT NULL DEFAULT 'CONFIRMED',
      sale_id TEXT REFERENCES sales(id),
      notes TEXT,
      stock_reserved INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      category TEXT,
      brand TEXT,
      model TEXT,
      unit_id TEXT REFERENCES units(id),
      imei TEXT,
      qty INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      gst REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      cost_price REAL NOT NULL DEFAULT 0,
      warranty_months INTEGER
    );

    CREATE TABLE IF NOT EXISTS order_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      payment_id TEXT REFERENCES payments(id),
      amount REAL NOT NULL,
      payment_method TEXT NOT NULL,
      payment_account_id TEXT REFERENCES payment_accounts(id),
      reference_number TEXT,
      payment_date TEXT NOT NULL,
      remarks TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_status_history (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      from_status TEXT,
      to_status TEXT NOT NULL,
      action TEXT NOT NULL,
      user TEXT,
      remarks TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id);
    CREATE INDEX IF NOT EXISTS idx_order_history_order ON order_status_history(order_id);
  `);

  addColumnIfNotExists(db, "settings", "reserve_stock_on_order", "INTEGER DEFAULT 0");
  addColumnIfNotExists(db, "settings", "order_prefix", "TEXT DEFAULT 'ORD-'");
  addColumnIfNotExists(db, "products", "reserved_qty", "INTEGER DEFAULT 0");
  addColumnIfNotExists(db, "units", "order_id", "TEXT REFERENCES orders(id)");

  seedCategoriesAndHierarchy(db);
  seedReferenceDealers(db);
  seedPaymentAccounts(db);
  seedSampleOrders(db);
}

export function seedPaymentAccounts(db: DatabaseSync): void {
  try {
    const count = (db.prepare("SELECT COUNT(*) as c FROM payment_accounts").get() as any)?.c || 0;
    if (count > 0) return;

    const now = new Date().toISOString();
    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO payment_accounts (
        id, business_id, account_name, account_type, bank_name, upi_id, account_number, ifsc,
        opening_balance, current_balance, status, is_default, created_at, updated_at
      ) VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)
    `);

    const defaultAccounts = [
      {
        id: "acct_cash_default",
        name: "Store Cash Drawer",
        type: "CASH",
        bankName: null,
        upiId: null,
        accountNo: null,
        ifsc: null,
        openingBalance: 10000,
        isDefault: 1,
      },
      {
        id: "acct_upi_phonepe",
        name: "PhonePe - SBI",
        type: "UPI",
        bankName: "State Bank of India",
        upiId: "saimobile@sbi",
        accountNo: null,
        ifsc: null,
        openingBalance: 25000,
        isDefault: 0,
      },
      {
        id: "acct_upi_gpay",
        name: "Google Pay - HDFC",
        type: "UPI",
        bankName: "HDFC Bank",
        upiId: "saimobile@hdfcbank",
        accountNo: null,
        ifsc: null,
        openingBalance: 20000,
        isDefault: 0,
      },
      {
        id: "acct_upi_paytm",
        name: "Paytm - ICICI",
        type: "UPI",
        bankName: "ICICI Bank",
        upiId: "saimobile@icici",
        accountNo: null,
        ifsc: null,
        openingBalance: 15000,
        isDefault: 0,
      },
      {
        id: "acct_upi_axis",
        name: "Business UPI - Axis",
        type: "UPI",
        bankName: "Axis Bank",
        upiId: "saimobile@axisbank",
        accountNo: null,
        ifsc: null,
        openingBalance: 10000,
        isDefault: 0,
      },
      {
        id: "acct_bank_hdfc",
        name: "HDFC Current Account",
        type: "BANK",
        bankName: "HDFC Bank",
        upiId: null,
        accountNo: "50200012345678",
        ifsc: "HDFC0001234",
        openingBalance: 50000,
        isDefault: 0,
      },
      {
        id: "acct_bank_sbi",
        name: "SBI Current Account",
        type: "BANK",
        bankName: "State Bank of India",
        upiId: null,
        accountNo: "39810293847",
        ifsc: "SBIN0000382",
        openingBalance: 40000,
        isDefault: 0,
      },
      {
        id: "acct_card_pos",
        name: "Card POS Machine / Settlement",
        type: "CARD",
        bankName: "HDFC Bank",
        upiId: null,
        accountNo: null,
        ifsc: null,
        openingBalance: 10000,
        isDefault: 0,
      },
    ];

    for (const a of defaultAccounts) {
      insertAccount.run(
        a.id,
        a.name,
        a.type,
        a.bankName,
        a.upiId,
        a.accountNo,
        a.ifsc,
        a.openingBalance,
        a.openingBalance,
        a.isDefault,
        now,
        now
      );
    }
  } catch (err) {
    console.warn("Could not seed default payment accounts:", err);
  }
}

export function seedSampleOrders(db: DatabaseSync): void {
  try {
    const count = (db.prepare("SELECT COUNT(*) as c FROM orders").get() as any)?.c || 0;
    if (count > 0) return;

    // Check if prerequisite customer c1 exists to avoid FK error in partial test runs
    const hasCustomer = db.prepare("SELECT 1 FROM customers WHERE id = 'c1'").get();
    if (!hasCustomer) return;

    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const expectedDate = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);

    // Sample Order 1: Rahul Sharma, Oppo F33 Pro
    const ord1Id = "ord_demo_1001";
    db.prepare(`
      INSERT INTO orders (
        id, business_id, branch_id, order_no, date, expected_delivery_date,
        customer_id, customer_name, customer_mobile, sales_person, invoice_type,
        subtotal, tax, discount, total, advance_paid, balance_due, payment_status,
        status, notes, stock_reserved, created_by, created_at, updated_at
      ) VALUES (
        ?, 'biz_default', 'branch_01', 'ORD-2026-1001', ?, ?,
        'c1', 'Rahul Sharma', '98110 44521', 'Vikram Sharma', 'GST',
        12712, 2288, 0, 15000, 5000, 10000, 'PARTIALLY_PAID',
        'PARTIALLY_PAID', 'Pre-booking for newly launched OPPO F33 Pro Midnight Blue', 0, 'Vikram Sharma', ?, ?
      )
    `).run(ord1Id, today, expectedDate, now, now);

    db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name, category, brand, model,
        qty, price, discount, gst, total, cost_price, warranty_months
      ) VALUES (
        'item_ord1_1', ?, 'p1', 'OPPO F33 Pro 5G (8GB/128GB)', 'Mobile Phones', 'OPPO', 'F33 Pro',
        1, 15000, 0, 18, 15000, 12500, 12
      )
    `).run(ord1Id);

    db.prepare(`
      INSERT INTO order_payments (
        id, order_id, customer_id, amount, payment_method, payment_account_id,
        reference_number, payment_date, remarks, created_by, created_at
      ) VALUES (
        'pay_ord1_1', ?, 'c1', 5000, 'UPI', 'acct_upi_phonepe',
        'UPI-9482710492', ?, 'Advance token payment received via PhonePe', 'Vikram Sharma', ?
      )
    `).run(ord1Id, today, now);

    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (
        'hist_ord1_1', ?, NULL, 'CONFIRMED', 'ORDER_CREATED', 'Vikram Sharma', 'Order created with initial pre-booking', ?
      ), (
        'hist_ord1_2', ?, 'CONFIRMED', 'PARTIALLY_PAID', 'ADVANCE_RECEIVED', 'Vikram Sharma', 'Advance payment ₹5,000 recorded via PhonePe', ?
      )
    `).run(ord1Id, now, ord1Id, now);

    // Sample Order 2: Priya Menon, iPhone 15 & Cover
    const ord2Id = "ord_demo_1002";
    db.prepare(`
      INSERT INTO orders (
        id, business_id, branch_id, order_no, date, expected_delivery_date,
        customer_id, customer_name, customer_mobile, sales_person, invoice_type,
        subtotal, tax, discount, total, advance_paid, balance_due, payment_status,
        status, notes, stock_reserved, created_by, created_at, updated_at
      ) VALUES (
        ?, 'biz_default', 'branch_01', 'ORD-2026-1002', ?, ?,
        'c2', 'Priya Menon', '99534 11908', 'Vikram Sharma', 'GST',
        59746, 10754, 500, 70000, 20000, 50000, 'PARTIALLY_PAID',
        'READY_FOR_DELIVERY', 'Customer requested delivery after 5 PM', 0, 'Vikram Sharma', ?, ?
      )
    `).run(ord2Id, today, expectedDate, now, now);

    db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name, category, brand, model,
        qty, price, discount, gst, total, cost_price, warranty_months
      ) VALUES (
        'item_ord2_1', ?, 'p2', 'Apple iPhone 15 (128GB Black)', 'Mobile Phones', 'Apple', 'iPhone 15',
        1, 69500, 500, 18, 69000, 61000, 12
      ),
      (
        'item_ord2_2', ?, 'p6', 'Magnetic Silicone Case for iPhone 15', 'Covers', 'Apple', 'Case',
        1, 1000, 0, 18, 1000, 400, 6
      )
    `).run(ord2Id, ord2Id);

    db.prepare(`
      INSERT INTO order_payments (
        id, order_id, customer_id, amount, payment_method, payment_account_id,
        reference_number, payment_date, remarks, created_by, created_at
      ) VALUES (
        'pay_ord2_1', ?, 'c2', 20000, 'Bank', 'acct_bank_sbi',
        'NEFT-SBI839218', ?, 'Booking advance via SBI Bank Transfer', 'Vikram Sharma', ?
      )
    `).run(ord2Id, today, now);

    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (
        'hist_ord2_1', ?, NULL, 'CONFIRMED', 'ORDER_CREATED', 'Vikram Sharma', 'Customer booked iPhone 15 with Cover', ?
      ), (
        'hist_ord2_2', ?, 'CONFIRMED', 'PARTIALLY_PAID', 'ADVANCE_RECEIVED', 'Vikram Sharma', 'Advance payment ₹20,000 received', ?
      ), (
        'hist_ord2_3', ?, 'PARTIALLY_PAID', 'READY_FOR_DELIVERY', 'PRODUCT_READY', 'Vikram Sharma', 'Device arrived from distributor and inspected', ?
      )
    `).run(ord2Id, now, ord2Id, now, ord2Id, now);

  } catch (err) {
    console.warn("Could not seed sample orders:", err);
  }
}

export function seedReferenceDealers(db: DatabaseSync): void {
  try {
    try {
      const flag = db.prepare("SELECT value FROM app_flags WHERE key = 'clean_slate'").get() as { value: string } | undefined;
      if (flag && flag.value === "true") {
        return;
      }
    } catch {
      // ignore
    }
    const insertDealer = db.prepare(`
      INSERT OR REPLACE INTO suppliers (id, business_id, name, company, phone, email, gstin, address, state, state_code, contact_person)
      VALUES (?, 'biz_default', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertDealer.run(
      "sup_ramniwas",
      "Ramniwas Sumit Kumar Maheshwari",
      "Ramniwas Sumit Kumar Maheshwari",
      "9826011223",
      "sumit.maheshwari@gmail.com",
      "23ABJFR0427Q1ZW",
      "Main Road, Harda Near Ghanta Ghar, 461331",
      "Madhya Pradesh",
      "23",
      "Sumit Maheshwari"
    );

    insertDealer.run(
      "sup_tanay",
      "Tanay Traders",
      "Tanay Traders",
      "9826173460",
      "neerajagrawal1983@gmail.com",
      "23AQDPA6961H2Z2",
      "13 Vardan Complex Kachahri Ke Samne, Harda 461331",
      "Madhya Pradesh",
      "23",
      "Neeraj Agrawal"
    );
  } catch (err) {
    console.warn("Could not seed reference dealers:", err);
  }
}

export function seedCategoriesAndHierarchy(db: DatabaseSync): void {
  const bId = "biz_default";
  const now = new Date().toISOString();

  // 1. Finance Companies
  try {
    try {
      const flag = db.prepare("SELECT value FROM app_flags WHERE key = 'clean_slate'").get() as { value: string } | undefined;
      if (flag && flag.value === "true") {
        return;
      }
    } catch {
      // ignore
    }
    const checkFC = db.prepare("SELECT COUNT(*) as cnt FROM finance_companies").get() as any;
    if (!checkFC || checkFC.cnt === 0) {
      const insertFC = db.prepare(`
        INSERT OR REPLACE INTO finance_companies (id, business_id, company_name, contact_person, mobile, settlement_days, processing_fee, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
      `);
      insertFC.run("fc_bajaj", bId, "Bajaj Finserv", "Rajesh Khanna", "9811001122", 5, 250, now);
      insertFC.run("fc_hdb", bId, "HDB Financial Services", "Amitabh Sen", "9822002233", 7, 300, now);
      insertFC.run("fc_tvs", bId, "TVS Credit", "Sundaram Iyer", "9833003344", 7, 200, now);
      insertFC.run("fc_idfc", bId, "IDFC First Bank", "Priya Sharma", "9844004455", 3, 150, now);
      insertFC.run("fc_dmi", bId, "DMI Finance", "Rohit Malhotra", "9855005566", 7, 250, now);
    }
  } catch (err) {
    console.warn("Error seeding finance companies:", err);
  }

  // 2. Categories Hierarchy
  try {
    try {
      const flag = db.prepare("SELECT value FROM app_flags WHERE key = 'clean_slate'").get() as { value: string } | undefined;
      if (flag && flag.value === "true") {
        return;
      }
    } catch {
      // ignore
    }
    const checkCat = db.prepare("SELECT COUNT(*) as cnt FROM categories").get() as any;
    if (!checkCat || checkCat.cnt === 0) {
      const insertCat = db.prepare(`INSERT OR REPLACE INTO categories (id, business_id, name, description, icon, sort_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
      const insertSub = db.prepare(`INSERT OR REPLACE INTO subcategories (id, business_id, category_id, name, description, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
      const insertBrand = db.prepare(`INSERT OR REPLACE INTO brands (id, business_id, subcategory_id, name, created_at) VALUES (?, ?, ?, ?, ?)`);
      const insertModel = db.prepare(`INSERT OR REPLACE INTO models (id, business_id, brand_id, name, series, created_at) VALUES (?, ?, ?, ?, ?, ?)`);

      // Top Level Categories
      insertCat.run("cat_mobile", bId, "Mobile", "Smartphones and feature phones", "📱", 1, now);
      insertCat.run("cat_accessories", bId, "Mobile Accessories", "Chargers, cables, covers, glasses", "🔌", 2, now);
      insertCat.run("cat_earbuds", bId, "Earbuds", "TWS, neckbands, wired earphones", "🎧", 3, now);
      insertCat.run("cat_tablet", bId, "Tablet", "Android tablets and iPads", "📟", 4, now);
      insertCat.run("cat_laptop", bId, "Laptop", "Windows, Mac, Gaming laptops", "💻", 5, now);

      // Subcategories for Mobile
      insertSub.run("sub_smart", bId, "cat_mobile", "Smart Phone", "Touchscreen Android & iOS smartphones", now);
      insertSub.run("sub_keypad", bId, "cat_mobile", "Keypad Phone", "Feature phones with buttons", now);

      // Subcategories for Accessories
      insertSub.run("sub_charger", bId, "cat_accessories", "Charger", "Wall adapters and fast chargers", now);
      insertSub.run("sub_cable", bId, "cat_accessories", "Cable", "Type-C, Lightning, Micro-USB", now);
      insertSub.run("sub_cover", bId, "cat_accessories", "Cover", "Back cases and flip covers", now);
      insertSub.run("sub_glass", bId, "cat_accessories", "Tempered Glass", "Screen protectors", now);
      insertSub.run("sub_powerbank", bId, "cat_accessories", "Power Bank", "Portable battery banks", now);
      insertSub.run("sub_headphones", bId, "cat_accessories", "Headphones", "Over-ear headphones", now);
      insertSub.run("sub_other_acc", bId, "cat_accessories", "Other Accessories", "Holders, straps, OTG", now);

      // Subcategories for Earbuds
      insertSub.run("sub_tws", bId, "cat_earbuds", "TWS", "True Wireless Stereo buds", now);
      insertSub.run("sub_neckband", bId, "cat_earbuds", "Neckband", "Wireless neckbands", now);
      insertSub.run("sub_wired", bId, "cat_earbuds", "Wired Earphones", "3.5mm and Type-C wired earphones", now);

      // Subcategories for Tablet
      insertSub.run("sub_android_tab", bId, "cat_tablet", "Android Tablet", "Samsung, Lenovo, Xiaomi tabs", now);
      insertSub.run("sub_ipad", bId, "cat_tablet", "iPad", "Apple iPad, Air, Pro", now);

      // Subcategories for Laptop
      insertSub.run("sub_win_laptop", bId, "cat_laptop", "Windows Laptop", "Dell, HP, Lenovo, ASUS", now);
      insertSub.run("sub_macbook", bId, "cat_laptop", "MacBook", "Apple MacBook Air, Pro", now);
      insertSub.run("sub_gaming_laptop", bId, "cat_laptop", "Gaming Laptop", "High performance gaming laptops", now);
      insertSub.run("sub_chromebook", bId, "cat_laptop", "Chromebook", "Google Chrome OS laptops", now);

      // Brands under Smart Phone
      insertBrand.run("br_oppo", bId, "sub_smart", "OPPO", now);
      insertBrand.run("br_vivo", bId, "sub_smart", "VIVO", now);
      insertBrand.run("br_samsung", bId, "sub_smart", "Samsung", now);
      insertBrand.run("br_apple", bId, "sub_smart", "Apple", now);
      insertBrand.run("br_oneplus", bId, "sub_smart", "OnePlus", now);
      insertBrand.run("br_xiaomi", bId, "sub_smart", "Xiaomi", now);
      insertBrand.run("br_realme", bId, "sub_smart", "Realme", now);

      // Brands under Keypad Phone
      insertBrand.run("br_nokia", bId, "sub_keypad", "Nokia", now);
      insertBrand.run("br_itel", bId, "sub_keypad", "Itel", now);

      // Models under OPPO
      insertModel.run("mod_oppo_a5", bId, "br_oppo", "OPPO A5", "A Series", now);
      insertModel.run("mod_oppo_a6", bId, "br_oppo", "OPPO A6", "A Series", now);
      insertModel.run("mod_oppo_reno", bId, "br_oppo", "OPPO Reno Series", "Reno Series", now);

      // Models under VIVO
      insertModel.run("mod_vivo_y", bId, "br_vivo", "VIVO Y Series", "Y Series", now);
      insertModel.run("mod_vivo_v", bId, "br_vivo", "VIVO V Series", "V Series", now);

      // Models under Samsung
      insertModel.run("mod_sam_a", bId, "br_samsung", "Galaxy A Series", "Galaxy A", now);
      insertModel.run("mod_sam_s", bId, "br_samsung", "Galaxy S Series", "Galaxy S", now);

      // Models under Nokia
      insertModel.run("mod_nokia_105", bId, "br_nokia", "Nokia 105", "Classic", now);
      insertModel.run("mod_nokia_110", bId, "br_nokia", "Nokia 110", "Classic", now);
    }
  } catch (err) {
    console.warn("Error seeding categories hierarchy:", err);
  }
}




export function seedIfEmpty(db: DatabaseSync): void {
  try {
    const flag = db.prepare("SELECT value FROM app_flags WHERE key = 'clean_slate'").get() as { value: string } | undefined;
    if (flag && flag.value === "true") {
      return;
    }
  } catch {
    // Ignore if table not yet created
  }

  const prodCheck = db.prepare("SELECT COUNT(*) as cnt FROM products").get() as { cnt: number };
  const empCheck = db.prepare("SELECT COUNT(*) as cnt FROM employees").get() as { cnt: number };
  if (!prodCheck || prodCheck.cnt === 0 || !empCheck || empCheck.cnt === 0) {
    const initial = seedDB();
    populateDatabase(db, initial);
  }
}

export function wipeAllData(db: DatabaseSync): void {
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM order_status_history;
    DELETE FROM order_payments;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM audit_logs;
    DELETE FROM cashbook;
    DELETE FROM supplier_ledger;
    DELETE FROM customer_ledger;
    DELETE FROM repair_parts;
    DELETE FROM repairs;
    DELETE FROM stock_movements;
    DELETE FROM payroll;
    DELETE FROM attendance;
    DELETE FROM employees;
    DELETE FROM employee_permissions;
    DELETE FROM return_items;
    DELETE FROM returns;
    DELETE FROM debit_notes;
    DELETE FROM purchase_attachments;
    DELETE FROM emi_payments;
    DELETE FROM emi_schedules;
    DELETE FROM emi_accounts;
    DELETE FROM emi_receipts;
    DELETE FROM emi_receivables;
    DELETE FROM finance_companies;
    DELETE FROM sale_payments;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM purchase_items;
    DELETE FROM purchases;
    DELETE FROM expenses;
    DELETE FROM payments;
    DELETE FROM units;
    DELETE FROM products;
    DELETE FROM models;
    DELETE FROM brands;
    DELETE FROM subcategories;
    DELETE FROM categories;
    DELETE FROM customers;
    DELETE FROM suppliers;
    DELETE FROM payment_account_transactions;
    UPDATE payment_accounts SET opening_balance = 0, current_balance = 0;
    CREATE TABLE IF NOT EXISTS app_flags (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT OR REPLACE INTO app_flags (key, value) VALUES ('clean_slate', 'true');
    PRAGMA foreign_keys = ON;
  `);
}

export function resetDatabase(db: DatabaseSync): void {
  try {
    db.prepare("DELETE FROM app_flags WHERE key = 'clean_slate'").run();
  } catch {
    // ignore
  }
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM order_status_history;
    DELETE FROM order_payments;
    DELETE FROM order_items;
    DELETE FROM orders;
    DELETE FROM audit_logs;
    DELETE FROM cashbook;
    DELETE FROM supplier_ledger;
    DELETE FROM customer_ledger;
    DELETE FROM repair_parts;
    DELETE FROM stock_movements;
    DELETE FROM payroll;
    DELETE FROM attendance;
    DELETE FROM employees;
    DELETE FROM return_items;
    DELETE FROM returns;
    DELETE FROM emi_receipts;
    DELETE FROM emi_receivables;
    DELETE FROM finance_companies;
    DELETE FROM sale_payments;
    DELETE FROM sale_items;
    DELETE FROM sales;
    DELETE FROM purchase_items;
    DELETE FROM purchases;
    DELETE FROM repairs;
    DELETE FROM expenses;
    DELETE FROM payments;
    DELETE FROM units;
    DELETE FROM products;
    DELETE FROM models;
    DELETE FROM brands;
    DELETE FROM subcategories;
    DELETE FROM categories;
    DELETE FROM customers;
    DELETE FROM suppliers;
    DELETE FROM settings;
    DELETE FROM employee_permissions;
    DELETE FROM permissions;
    DELETE FROM roles;
    DELETE FROM users;
    DELETE FROM branches;
    DELETE FROM businesses;
    PRAGMA foreign_keys = ON;
  `);
  const initial = seedDB();
  populateDatabase(db, initial);
}

export function populateDatabase(db: DatabaseSync, data: DB): void {
  const bId = "biz_default";
  const branchId = "branch_01";
  const now = new Date().toISOString();

  // Business & Branch
  db.prepare(`
    INSERT OR REPLACE INTO businesses (id, name, owner_id, created_at)
    VALUES (?, ?, 'usr_owner', ?)
  `).run(bId, data.settings.shopName || "Mobile Store ERP", now);

  db.prepare(`
    INSERT OR REPLACE INTO branches (id, business_id, name, code, address, phone, latitude, longitude, allowed_radius_meters, created_at)
    VALUES (?, ?, 'Main Branch', 'BR-01', ?, ?, 28.5355, 77.3910, 200, ?)
  `).run(branchId, bId, data.settings.address, data.settings.phone, now);

  // Admin PIN (Default hashed PIN "1234")
  db.prepare(`
    INSERT OR REPLACE INTO admin_pins (id, business_id, pin_hash, created_by, updated_at)
    VALUES ('pin_default', ?, '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4', 'System', ?)
  `).run(bId, now);

  // Users (Default accounts)
  const insertUser = db.prepare(`
    INSERT OR REPLACE INTO users (id, business_id, branch_id, email, password_hash, name, role, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `);
  insertUser.run("usr_owner", bId, branchId, "admin@mobilestore.in", "admin123", "Sanjay Sharma", "OWNER", now);
  insertUser.run("usr_sales", bId, branchId, "sales@mobilestore.in", "sales123", "Vikram Sharma", "SALES", now);
  insertUser.run("usr_tech", bId, branchId, "tech@mobilestore.in", "tech123", "Ramesh Kumar", "TECHNICIAN", now);
  insertUser.run("usr_acc", bId, branchId, "accounts@mobilestore.in", "acc123", "Pooja Verma", "ACCOUNTANT", now);


  // Settings
  db.prepare(`
    INSERT OR REPLACE INTO settings (
      id, shop_name, tagline, owner_name, phone, address, gstin, default_gst, invoice_prefix, opening_cash,
      shop_latitude, shop_longitude, allowed_radius_meters, logo_url, brands_banner_url, location_qr_url,
      upi_id, city, state, state_code, pincode, pan, whatsapp, email, website,
      bank_name, bank_account_no, bank_ifsc, bank_branch, terms_and_conditions,
      watermark_enabled, watermark_text, signature_title, gst_invoice_prefix, nongst_invoice_prefix,
      purchase_invoice_prefix, primary_color, secondary_color, deals_in, business_services, footer_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "shop",
    data.settings.shopName || "SHRI SAI MOBILE",
    data.settings.tagline || "NO NEED TO WORRY",
    data.settings.ownerName || "Shri Sai Mobile",
    data.settings.phone || "8770758326",
    data.settings.address || "In Front of Court, Near Prashant Restaurant, HARDA (M.P.) 461331",
    data.settings.gstin || "23ASFPG1385D1Z7",
    data.settings.defaultGst || 18,
    data.settings.invoicePrefix || "GST/2026-27/",
    data.settings.openingCash || 25000,
    data.settings.shopLatitude || 28.5355,
    data.settings.shopLongitude || 77.3910,
    data.settings.allowedRadiusMeters || 200,
    data.settings.logoUrl || "/shri_sai_logo.png",
    data.settings.brandsBannerUrl || "/brands_banner.png",
    data.settings.locationQrUrl || "/location_qr.png",
    data.settings.upiId || "8770758326@upi",
    data.settings.city || "Harda",
    data.settings.state || "Madhya Pradesh",
    data.settings.stateCode || "23",
    data.settings.pincode || "461331",
    data.settings.pan || "ASFPG1385D",
    data.settings.whatsapp || "8770758326",
    data.settings.email || "saimobileharda@gmail.com",
    data.settings.website || "",
    data.settings.bankName || "State Bank of India",
    data.settings.bankAccountNo || "39810293847",
    data.settings.bankIfsc || "SBIN0000382",
    data.settings.bankBranch || "Main Branch, Harda",
    data.settings.termsAndConditions ? JSON.stringify(data.settings.termsAndConditions) : null,
    data.settings.watermarkEnabled !== false ? 1 : 0,
    data.settings.watermarkText || "SHRI SAI MOBILE",
    data.settings.signatureTitle || "Authorised Signatory",
    data.settings.gstInvoicePrefix || "GST/2026-27/",
    data.settings.nongstInvoicePrefix || "NG/2026-27/",
    data.settings.purchaseInvoicePrefix || "PUR/2026-27/",
    data.settings.primaryColor || "#000000",
    data.settings.secondaryColor || "#f97316",
    data.settings.dealsIn || "Mobile Phones & Electronics Items",
    data.settings.businessServices || "SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE",
    data.settings.footerText || "MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER"
  );

  // Seed Employees
  const insertEmployee = db.prepare(`
    INSERT OR REPLACE INTO employees (id, business_id, branch_id, employee_id, full_name, photo, mobile, email, address, joining_date, department, designation, salary_type, basic_salary, bank_details, emergency_contact, status, role, user_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialEmployees = [
    {
      id: "emp_1",
      employeeId: "EMP-001",
      fullName: "Vikram Sharma",
      mobile: "9876543210",
      email: "vikram@mobilestore.in",
      address: "Sector 18, Noida",
      joiningDate: "2024-01-15",
      department: "Sales",
      designation: "Senior Counter Sales",
      salaryType: "MONTHLY",
      basicSalary: 28000,
      bankDetails: "HDFC A/C: 50100234567891",
      emergencyContact: "9876543211 (Brother)",
      status: "ACTIVE",
      role: "SALES",
    },
    {
      id: "emp_2",
      employeeId: "EMP-002",
      fullName: "Ramesh Verma",
      mobile: "9811223344",
      email: "ramesh.tech@mobilestore.in",
      address: "Atta Market, Noida",
      joiningDate: "2024-03-01",
      department: "Service Center",
      designation: "Lead Hardware Technician",
      salaryType: "MONTHLY",
      basicSalary: 32000,
      bankDetails: "SBI A/C: 30456789012",
      emergencyContact: "9811223345 (Father)",
      status: "ACTIVE",
      role: "TECHNICIAN",
    },
    {
      id: "emp_3",
      employeeId: "EMP-003",
      fullName: "Pooja Patel",
      mobile: "9822334455",
      email: "pooja@mobilestore.in",
      address: "Indirapuram, Ghaziabad",
      joiningDate: "2024-06-10",
      department: "Accounts & Billing",
      designation: "Store Accountant",
      salaryType: "MONTHLY",
      basicSalary: 25000,
      bankDetails: "ICICI A/C: 002101567890",
      emergencyContact: "9822334456 (Mother)",
      status: "ACTIVE",
      role: "ACCOUNTANT",
    },
  ];

  for (const emp of initialEmployees) {
    insertEmployee.run(
      emp.id,
      bId,
      branchId,
      emp.employeeId,
      emp.fullName,
      null,
      emp.mobile,
      emp.email,
      emp.address,
      emp.joiningDate,
      emp.department,
      emp.designation,
      emp.salaryType,
      emp.basicSalary,
      emp.bankDetails,
      emp.emergencyContact,
      emp.status,
      emp.role,
      null,
      now
    );
  }

  // Customers
  const insertCustomer = db.prepare(`
    INSERT OR REPLACE INTO customers (id, business_id, name, mobile, phone, address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const c of data.customers) {
    insertCustomer.run(c.id, bId, c.name, c.phone, c.phone, c.address ?? null, c.createdAt);
  }

  // Suppliers
  const insertSupplier = db.prepare(`
    INSERT OR REPLACE INTO suppliers (id, business_id, name, company, phone, mobile, gstin, address)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of data.suppliers) {
    insertSupplier.run(s.id, bId, s.name, s.name, s.phone, s.phone, s.gstin ?? null, s.address ?? null);
  }

  // Products
  const insertProduct = db.prepare(`
    INSERT OR REPLACE INTO products (id, business_id, name, brand, model, variant, ram, storage, color, category, tracked, sku, barcode, hsn, mrp, purchase_price, selling_price, gst, supplier_id, warranty_months, qty, reorder_level)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const p of data.products) {
    const sku = `${p.brand.slice(0, 3).toUpperCase()}-${p.model.replace(/\s+/g, "-").toUpperCase()}`;
    const barcode = `890${Math.floor(100000000 + Math.random() * 900000000)}`;
    insertProduct.run(
      p.id,
      bId,
      p.name,
      p.brand,
      p.model,
      p.variant ?? null,
      p.ram ?? null,
      p.storage ?? null,
      p.color ?? null,
      p.category,
      p.tracked ? 1 : 0,
      sku,
      barcode,
      "85171200",
      p.mrp,
      p.purchasePrice,
      p.sellingPrice,
      p.gst,
      p.supplierId ?? null,
      p.warrantyMonths,
      p.qty,
      p.reorderLevel
    );
  }

  // Units
  const insertUnit = db.prepare(`
    INSERT OR REPLACE INTO units (id, business_id, branch_id, product_id, imei1, imei2, serial, purchase_price, status, purchase_id, sale_id, customer_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const u of data.units) {
    insertUnit.run(
      u.id,
      bId,
      branchId,
      u.productId,
      u.imei1,
      u.imei2 ?? null,
      u.serial ?? null,
      u.purchasePrice,
      u.status,
      u.purchaseId ?? null,
      u.saleId ?? null,
      u.customerId ?? null
    );
  }

  // Sales
  const insertSale = db.prepare(`
    INSERT OR REPLACE INTO sales (id, business_id, branch_id, invoice_no, date, customer_id, discount, subtotal, tax, total, paid, quotation, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSaleItem = db.prepare(`
    INSERT OR REPLACE INTO sale_items (id, sale_id, product_id, name, unit_id, imei, qty, price, gst, cost_price, warranty_months)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSalePayment = db.prepare(`
    INSERT OR REPLACE INTO sale_payments (id, sale_id, mode, amount)
    VALUES (?, ?, ?, ?)
  `);
  const insertCustLedger = db.prepare(`
    INSERT OR REPLACE INTO customer_ledger (id, business_id, customer_id, date, type, reference_id, debit, credit, balance, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const s of data.sales) {
    insertSale.run(
      s.id,
      bId,
      branchId,
      s.invoiceNo,
      s.date,
      s.customerId,
      s.discount,
      s.subtotal,
      s.tax,
      s.total,
      s.paid,
      s.quotation ? 1 : 0,
      s.note ?? null
    );

    s.items.forEach((item, idx) => {
      insertSaleItem.run(
        `${s.id}_item_${idx}`,
        s.id,
        item.productId,
        item.name,
        item.unitId ?? null,
        item.imei ?? null,
        item.qty,
        item.price,
        item.gst,
        item.costPrice,
        item.warrantyMonths ?? null
      );
    });

    s.payments.forEach((pay, idx) => {
      insertSalePayment.run(
        `${s.id}_pay_${idx}`,
        s.id,
        pay.mode,
        pay.amount
      );
    });

    if (!s.quotation) {
      // Sale debit
      insertCustLedger.run(
        `cled_s_${s.id}`,
        bId,
        s.customerId,
        s.date,
        "SALE",
        s.id,
        s.total,
        0,
        s.total,
        `Invoice ${s.invoiceNo}`,
        s.date
      );
      // Payment credit if paid
      if (s.paid > 0) {
        insertCustLedger.run(
          `cled_p_${s.id}`,
          bId,
          s.customerId,
          s.date,
          "PAYMENT",
          s.id,
          0,
          s.paid,
          s.total - s.paid,
          `Payment for ${s.invoiceNo}`,
          s.date
        );
      }
    }
  }

  // Purchases & Supplier Ledger
  const insertPurchase = db.prepare(`
    INSERT OR REPLACE INTO purchases (id, business_id, branch_id, invoice_no, date, supplier_id, discount, subtotal, tax, total, paid, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPurchaseItem = db.prepare(`
    INSERT OR REPLACE INTO purchase_items (id, purchase_id, product_id, name, qty, price, gst, cost_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertSupLedger = db.prepare(`
    INSERT OR REPLACE INTO supplier_ledger (id, business_id, supplier_id, date, type, reference_id, debit, credit, balance, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of data.purchases) {
    insertPurchase.run(
      p.id,
      bId,
      branchId,
      p.invoiceNo,
      p.date,
      p.supplierId,
      p.discount,
      p.subtotal,
      p.tax,
      p.total,
      p.paid,
      p.mode
    );
    p.items.forEach((item, idx) => {
      insertPurchaseItem.run(
        `${p.id}_item_${idx}`,
        p.id,
        item.productId,
        item.name,
        item.qty,
        item.price,
        item.gst,
        item.costPrice
      );
    });

    // Supplier credit
    insertSupLedger.run(
      `sled_p_${p.id}`,
      bId,
      p.supplierId,
      p.date,
      "PURCHASE",
      p.id,
      0,
      p.total,
      p.total,
      `Bill ${p.invoiceNo}`,
      p.date
    );
    if (p.paid > 0) {
      insertSupLedger.run(
        `sled_pay_${p.id}`,
        bId,
        p.supplierId,
        p.date,
        "PAYMENT",
        p.id,
        p.paid,
        0,
        p.total - p.paid,
        `Payment for ${p.invoiceNo}`,
        p.date
      );
    }
  }

  // Returns
  const insertReturn = db.prepare(`
    INSERT OR REPLACE INTO returns (id, business_id, type, ref_id, ref_no, date, party_id, amount, reason, condition, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertReturnItem = db.prepare(`
    INSERT OR REPLACE INTO return_items (id, return_id, product_id, unit_id, name, qty, price, gst, cost_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of data.returns) {
    insertReturn.run(
      r.id,
      bId,
      r.type,
      r.refId,
      r.refNo,
      r.date,
      r.partyId,
      r.amount,
      r.reason,
      "GOOD",
      r.mode
    );
    r.items.forEach((item, idx) => {
      insertReturnItem.run(
        `${r.id}_item_${idx}`,
        r.id,
        item.productId,
        item.unitId ?? null,
        item.name,
        item.qty,
        item.price,
        item.gst,
        item.costPrice
      );
    });
  }

  // Repairs
  const insertRepair = db.prepare(`
    INSERT OR REPLACE INTO repairs (id, business_id, branch_id, job_id, customer_id, device, imei, problem, estimate, advance, technician, status, warranty_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)
  `);
  for (const r of data.repairs) {
    insertRepair.run(
      r.id,
      bId,
      branchId,
      r.jobId,
      r.customerId,
      r.device,
      r.imei ?? null,
      r.problem,
      r.estimate,
      r.advance,
      r.technician,
      r.status,
      r.createdAt
    );
  }

  // Expenses
  const insertExpense = db.prepare(`
    INSERT OR REPLACE INTO expenses (id, business_id, branch_id, date, category, amount, payment_method, note)
    VALUES (?, ?, ?, ?, ?, ?, 'Cash', ?)
  `);
  for (const e of data.expenses) {
    insertExpense.run(e.id, bId, branchId, e.date, e.category, e.amount, e.note ?? null);
  }

  // Payments
  const insertPayment = db.prepare(`
    INSERT OR REPLACE INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const pay of data.payments) {
    insertPayment.run(
      pay.id,
      bId,
      branchId,
      pay.date,
      pay.party,
      pay.partyId,
      pay.refId ?? null,
      pay.amount,
      pay.mode,
      pay.note ?? null
    );
  }

  // Initial Cashbook
  const insertCashbook = db.prepare(`
    INSERT OR REPLACE INTO cashbook (id, business_id, branch_id, date, type, reference_id, category, inflow, outflow, balance, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertCashbook.run(
    "cb_init",
    bId,
    branchId,
    new Date().toISOString().slice(0, 10),
    "OPENING_BALANCE",
    "settings",
    "Cash Drawer",
    data.settings.openingCash,
    0,
    data.settings.openingCash,
    "Opening Counter Cash",
    now
  );

  // Initial Audit Log
  const insertAudit = db.prepare(`
    INSERT OR REPLACE INTO audit_logs (id, business_id, user_id, user_name, action, module, record_id, old_value, new_value, reason, admin_approved_by, created_at)
    VALUES (?, ?, 'usr_owner', 'Store Owner', 'SYSTEM_INITIALIZATION', 'SETTINGS', 'shop', null, 'Seeded initial business catalog', 'Initial Setup', 'Admin', ?)
  `);
  insertAudit.run("audit_init", bId, now);
}
