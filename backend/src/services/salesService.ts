import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type { InterestType, LineItem, PaymentSplit, Sale } from "../../../shared/types";
import { getSales, getSettings } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordCustomerLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import { createEMIAccountAndSchedule, createEMIReceivable } from "./emiService";
import { getDefaultCashAccount, getPaymentAccountById, recordAccountTransaction } from "./paymentAccountService";

export interface CreateSaleInput {
  customerId: string;
  invoiceType?: "GST" | "NON_GST";
  selectedTemplateId?: string;
  items: LineItem[];
  discount: number;
  payments: PaymentSplit[];
  quotation?: boolean;
  note?: string;
  customInvoiceNo?: string;
  user?: string;
  // EMI Sale support
  isEmi?: boolean;
  emiCompanyId?: string;
  emiDownPayment?: number;
  emiFinancedAmount?: number;
  financeReferenceNumber?: string;
  expectedPaymentDate?: string;
  processingFee?: number;
  otherCharges?: number;
  interestRate?: number;
  interestType?: InterestType;
  tenureMonths?: number;
  firstEmiDate?: string;
}

export function generateInvoiceNo(db: DatabaseSync, prefix: string): string {
  const currentYear = new Date().getFullYear();
  const basePrefix = `${prefix || "INV"}${currentYear}-`;
  const rows = db.prepare("SELECT invoice_no FROM sales WHERE invoice_no LIKE ?").all(`${basePrefix}%`) as { invoice_no: string }[];
  let maxSeq = 2040;
  for (const r of rows) {
    const seqStr = r.invoice_no.slice(basePrefix.length);
    const seqNum = parseInt(seqStr, 10);
    if (!isNaN(seqNum) && seqNum > maxSeq) {
      maxSeq = seqNum;
    }
  }
  let candidate = `${basePrefix}${maxSeq + 1}`;
  let counter = 1;
  while (db.prepare("SELECT 1 FROM sales WHERE invoice_no = ?").get(candidate)) {
    candidate = `${basePrefix}${maxSeq + 1 + counter}`;
    counter++;
  }
  return candidate;
}

export function createSale(db: DatabaseSync, input: CreateSaleInput): Sale {
  if (!input.items || input.items.length === 0) {
    throw new Error("Sale must contain at least one item");
  }

  // Validate Customer
  let customer = db.prepare("SELECT id, name, phone, mobile FROM customers WHERE id = ?").get(input.customerId) as any;
  if (!customer) {
    // Check if customer exists by phone or mobile
    customer = db.prepare("SELECT id, name, phone, mobile FROM customers WHERE phone = ? OR mobile = ?").get(input.customerId, input.customerId) as any;
    if (customer) {
      input.customerId = customer.id;
    } else {
      const defaultCustomer = db.prepare("SELECT id, name, phone, mobile FROM customers WHERE id = 'c0'").get() as any;
      if (defaultCustomer && (input.customerId === "c0" || !input.customerId)) {
        customer = defaultCustomer;
        input.customerId = "c0";
      } else {
        const newCustId = input.customerId || uid("c");
        const now = todayISO();
        db.prepare("INSERT INTO customers (id, name, phone, mobile, created_at) VALUES (?, ?, ?, ?, ?)").run(
          newCustId,
          "Walk-in Customer",
          "9999999999",
          "9999999999",
          now
        );
        customer = { id: newCustId, name: "Walk-in Customer", phone: "9999999999", mobile: "9999999999" };
        input.customerId = newCustId;
      }
    }
  }

  const invoiceType: "GST" | "NON_GST" = input.invoiceType || "GST";
  const selectedTemplateId = input.selectedTemplateId || "modern";

  // Calculate pricing
  const gross = input.items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const discount = Math.max(0, input.discount || 0);
  const total = Math.max(0, gross - discount);
  const tax = invoiceType === "NON_GST"
    ? 0
    : input.items.reduce(
        (sum, item) => sum + (item.price * item.qty * item.gst) / (100 + item.gst),
        0
      );
  const subtotal = Math.round(total - tax);
  const isQuotation = Boolean(input.quotation);

  // Initialize payments if not provided
  if (!input.payments || input.payments.length === 0) {
    input.payments = [{ mode: "Cash", amount: total }];
  }

  // Determine if this is an EMI sale
  const isEmi = Boolean(input.isEmi || input.payments.some((p) => p.mode === "EMI"));
  let emiCompanyId = input.emiCompanyId;
  let emiDownPayment = 0;
  let emiFinancedAmount = 0;

  if (isEmi) {
    if (!emiCompanyId) {
      const defaultCompany = db.prepare("SELECT id FROM finance_companies WHERE active = 1 LIMIT 1").get() as any;
      if (defaultCompany) {
        emiCompanyId = defaultCompany.id;
      } else {
        throw new Error("A Finance/EMI Company must be selected for EMI sales.");
      }
    }

    if (input.emiDownPayment !== undefined) {
      if (input.emiDownPayment < 0) {
        throw new Error("Down payment cannot be negative.");
      }
      emiDownPayment = input.emiDownPayment;
    } else {
      emiDownPayment = input.payments
        .filter((p) => p.mode !== "EMI" && p.mode !== "Credit")
        .reduce((sum, p) => sum + p.amount, 0);
    }

    if (emiDownPayment < 0) {
      throw new Error("Down payment cannot be negative.");
    }
    if (emiDownPayment > total) {
      throw new Error("Down payment cannot be greater than total sale amount.");
    }

    if (input.emiFinancedAmount !== undefined) {
      emiFinancedAmount = input.emiFinancedAmount;
    } else {
      emiFinancedAmount = total - emiDownPayment;
    }

    if (emiFinancedAmount < 0) {
      throw new Error("Financed amount cannot be negative.");
    }

    // Ensure payments array reflects EMI finance mode if not present
    if (emiFinancedAmount > 0 && !input.payments.some((p) => p.mode === "EMI")) {
      input.payments.push({ mode: "EMI", amount: emiFinancedAmount });
    }
  }

  // Payment reconciliation check:
  // The system must verify: Cash + UPI + Bank + Card + EMI + Credit = Invoice Total
  // Do NOT allow the bill to be finalized if payment allocation does not equal the bill total (Requirement 2 & 9)
  if (!isQuotation) {
    const sumPayments = input.payments.reduce((sum, p) => sum + p.amount, 0);
    if (Math.abs(sumPayments - total) > 0.01) {
      throw new Error(
        `Total payment allocations (₹${sumPayments}) must equal invoice total (₹${total}).`
      );
    }

    // Validate payment accounts for real payments (Requirement 26)
    for (const p of input.payments) {
      if (p.amount > 0 && p.mode !== "Credit" && p.mode !== "EMI") {
        if (!p.paymentAccountId) {
          if (p.mode.toLowerCase() === "cash") {
            p.paymentAccountId = getDefaultCashAccount(db).id;
          } else {
            // Find active payment account of this type
            const acctType = p.mode === "Bank Transfer" ? "BANK" : p.mode.toUpperCase();
            const acct = db
              .prepare(
                "SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' LIMIT 1"
              )
              .get(acctType) as any;
            if (acct) {
              p.paymentAccountId = acct.id;
            } else {
              throw new Error(`Please select the payment account for ${p.mode}.`);
            }
          }
        }

        const resolvedAccount = getPaymentAccountById(db, p.paymentAccountId);
        if (!resolvedAccount) {
          throw new Error(`Payment Account '${p.paymentAccountId}' not found.`);
        }
      }
    }
  }

  const paid = input.payments
    .filter((p) => p.mode !== "Credit" && p.mode !== "EMI")
    .reduce((sum, p) => sum + p.amount, 0);

  const settings = getSettings(db);
  const invoiceNo = input.customInvoiceNo || generateInvoiceNo(db, settings.invoicePrefix);
  const saleId = uid("s");
  const date = todayISO();
  let emiReceivableId: string | undefined = undefined;

  // Execute in transaction (Requirement 28)
  db.exec("BEGIN TRANSACTION;");
  try {
    // Validate unit availability and stock
    if (!isQuotation) {
      for (const item of input.items) {
        if (item.unitId) {
          let unit = db.prepare("SELECT id, imei1, status, purchase_price FROM units WHERE id = ?").get(item.unitId) as any;
          if (!unit && item.imei) {
            unit = db.prepare("SELECT id, imei1, status, purchase_price FROM units WHERE (imei1 = ? OR imei2 = ?) LIMIT 1").get(item.imei, item.imei) as any;
            if (unit) item.unitId = unit.id;
          }
          if (unit) {
            if (unit.status !== "available" && unit.status !== "IN_STOCK") {
              throw new Error(`Unit with IMEI ${unit.imei1} is not available (Current status: ${unit.status})`);
            }
            item.costPrice = item.costPrice ?? unit.purchase_price;
          } else {
            // Unit was not found in database by id or imei; clear unitId so it falls back to product deduction
            item.unitId = undefined;
          }
        }
        const product = db.prepare("SELECT id, name, qty, tracked, purchase_price FROM products WHERE id = ?").get(item.productId) as any;
        if (product) {
          item.costPrice = item.costPrice ?? product.purchase_price ?? 0;
        } else {
          item.costPrice = item.costPrice ?? 0;
        }
      }
    }

    // Insert Sale (including selected_template_id & invoice_type)
    const insertSaleStmt = db.prepare(`
      INSERT INTO sales (
        id, business_id, branch_id, invoice_no, invoice_type, selected_template_id, date, customer_id, discount, subtotal, tax,
        total, paid, quotation, note, status, is_emi, emi_company_id, emi_down_payment, emi_financed_amount
      )
      VALUES (?, 'biz_default', 'branch_01', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED', ?, ?, ?, ?)
    `);
    insertSaleStmt.run(
      saleId,
      invoiceNo,
      invoiceType,
      selectedTemplateId,
      date,
      input.customerId,
      discount,
      subtotal,
      Math.round(tax),
      total,
      paid,
      isQuotation ? 1 : 0,
      input.note ?? null,
      isEmi ? 1 : 0,
      emiCompanyId ?? null,
      isEmi ? emiDownPayment : 0,
      isEmi ? emiFinancedAmount : 0
    );

    // Insert Sale Items
    const insertItemStmt = db.prepare(`
      INSERT INTO sale_items (id, sale_id, product_id, name, unit_id, imei, qty, price, gst, cost_price, warranty_months)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    input.items.forEach((item, idx) => {
      insertItemStmt.run(
        `${saleId}_i_${idx}`,
        saleId,
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

    // Insert Sale Payments with payment_account_id and reference_number
    const insertPaymentStmt = db.prepare(`
      INSERT INTO sale_payments (id, sale_id, mode, amount, payment_account_id, reference_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    input.payments.forEach((pay, idx) => {
      insertPaymentStmt.run(
        `${saleId}_p_${idx}`,
        saleId,
        pay.mode,
        pay.amount,
        pay.paymentAccountId ?? null,
        pay.referenceNumber ?? null
      );
    });

    // If not quotation, update inventory, ledger, accounts and EMI
    if (!isQuotation) {
      const updateUnitStmt = db.prepare(`
        UPDATE units
        SET status = 'sold', sale_id = ?, customer_id = ?
        WHERE id = ?
      `);

      const updateUnitByImeiStmt = db.prepare(`
        UPDATE units
        SET status = 'sold', sale_id = ?, customer_id = ?
        WHERE (imei1 = ? OR imei2 = ?) AND status = 'available'
      `);

      const decrementStockStmt = db.prepare(`
        UPDATE products
        SET qty = MAX(0, qty - ?)
        WHERE id = ?
      `);

      for (const item of input.items) {
        if (item.unitId) {
          updateUnitStmt.run(saleId, input.customerId, item.unitId);
        } else if (item.imei) {
          updateUnitByImeiStmt.run(saleId, input.customerId, item.imei, item.imei);
        }

        // ALWAYS decrement product qty on sale
        decrementStockStmt.run(item.qty, item.productId);

        // Create Stock Movement Ledger entry if product exists in inventory
        const productExists = db.prepare("SELECT id FROM products WHERE id = ?").get(item.productId);
        if (productExists) {
          recordStockMovement(db, {
            productId: item.productId,
            unitId: item.unitId,
            imei: item.imei,
            movementType: "SALE",
            quantity: -item.qty,
            costPerUnit: item.costPrice || 0,
            referenceId: saleId,
            notes: `Sold via POS Bill ${invoiceNo}`,
            createdBy: input.user || "Cashier",
          });
        }
      }

      // If EMI, create EMI receivable record only if financed amount > 0
      let emiReceivableName = "Finance Company";
      if (isEmi && emiCompanyId && emiFinancedAmount > 0) {
        const receivable = createEMIReceivable(db, {
          businessId: "biz_default",
          branchId: "branch_01",
          emiCompanyId: emiCompanyId,
          financeReferenceNumber: input.financeReferenceNumber,
          customerId: input.customerId,
          customerName: customer.name,
          customerMobile: customer.phone || customer.mobile,
          invoiceId: invoiceNo,
          saleId: saleId,
          productId: input.items[0]?.productId || "PROD",
          imei: input.items[0]?.imei,
          totalAmount: total,
          downPayment: emiDownPayment,
          emiFinancedAmount: emiFinancedAmount,
          processingFee: input.processingFee || 0,
          otherCharges: input.otherCharges || 0,
          expectedPaymentDate: input.expectedPaymentDate,
          notes: input.note,
          createdBy: input.user || "Cashier",
        });
        emiReceivableId = receivable.id;
        emiReceivableName = receivable.emiCompanyName;
        db.prepare("UPDATE sales SET emi_receivable_id = ? WHERE id = ?").run(receivable.id, saleId);

        // Also create customer EMI account and schedule
        const emiAccount = createEMIAccountAndSchedule(db, {
          businessId: "biz_default",
          branchId: "branch_01",
          saleId: saleId,
          invoiceId: invoiceNo,
          customerId: input.customerId,
          customerName: customer.name,
          customerMobile: customer.phone || customer.mobile,
          productId: input.items[0]?.productId || "PROD",
          productName: input.items[0]?.name || "Product",
          imei: input.items[0]?.imei,
          financeCompanyId: emiCompanyId,
          financeCompanyName: emiReceivableName,
          productPrice: gross,
          discount: discount,
          downPayment: emiDownPayment,
          interestRate: input.interestRate ?? 0,
          interestType: input.interestType ?? "ANNUAL_REDUCING",
          tenureMonths: input.tenureMonths ?? 12,
          processingFee: input.processingFee ?? 0,
          otherCharges: input.otherCharges ?? 0,
          firstEmiDate: input.firstEmiDate ?? todayISO(),
          createdBy: input.user || "Cashier",
        });
        db.prepare("UPDATE sales SET emi_account_id = ? WHERE id = ?").run(emiAccount.id, saleId);
      }

      // Add payment ledger records and payment account transactions for non-credit, non-EMI payments
      const insertLedgerStmt = db.prepare(`
        INSERT INTO payments (id, business_id, branch_id, date, party, party_id, ref_id, amount, mode, payment_account_id, reference_number, note, created_by, created_at)
        VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      let totalCashPaid = 0;
      const now = new Date().toISOString();

      input.payments
        .filter((p) => p.mode !== "Credit" && p.mode !== "EMI" && p.amount > 0)
        .forEach((p) => {
          const payId = uid("pay");
          insertLedgerStmt.run(
            payId,
            date,
            input.customerId,
            saleId,
            p.amount,
            p.mode,
            p.paymentAccountId ?? null,
            p.referenceNumber ?? null,
            `Sale payment for invoice ${invoiceNo}`,
            input.user || "Cashier",
            now
          );

          if (p.mode === "Cash") {
            totalCashPaid += p.amount;
          }

          // Atomic Payment Account Transaction (Inflow/Credit increases account balance) (Requirements 7, 8, 24)
          if (p.paymentAccountId) {
            recordAccountTransaction(db, {
              accountId: p.paymentAccountId,
              transactionType: isEmi ? "EMI_DOWN_PAYMENT" : "SALE_PAYMENT",
              referenceType: "SALE",
              referenceId: saleId,
              amount: p.amount,
              isCredit: true,
              paymentMethod: p.mode,
              date,
              description: `${isEmi ? "Down payment" : "POS Sale"} for invoice ${invoiceNo}`,
              createdBy: input.user || "Cashier",
            });
          }
        });

      // Update Customer Ledger
      recordCustomerLedger(db, input.customerId, "SALE", saleId, total, 0, `Invoice ${invoiceNo}`);
      if (isEmi) {
        if (emiDownPayment > 0) {
          recordCustomerLedger(db, input.customerId, "PAYMENT", saleId, 0, emiDownPayment, `Down payment for invoice ${invoiceNo}`);
        }
        if (emiFinancedAmount > 0) {
          recordCustomerLedger(db, input.customerId, "PAYMENT", saleId, 0, emiFinancedAmount, `Financed by ${emiReceivableName} for invoice ${invoiceNo}`);
        }
      } else {
        // Record credit in customer ledger for each received payment
        input.payments
          .filter((p) => p.mode !== "Credit" && p.mode !== "EMI" && p.amount > 0)
          .forEach((p) => {
            recordCustomerLedger(
              db,
              input.customerId,
              "PAYMENT",
              saleId,
              0,
              p.amount,
              `${p.mode} payment for invoice ${invoiceNo}`,
              p.paymentAccountId,
              p.mode,
              p.referenceNumber
            );
          });
      }

      // Update Cashbook if cash paid
      if (totalCashPaid > 0) {
        recordCashbookEntry(db, isEmi ? "EMI_DOWN_PAYMENT" : "POS_SALE_CASH", saleId, "Sales", totalCashPaid, 0, `${isEmi ? "EMI Down payment" : "Cash sale"} invoice ${invoiceNo}`);
      }

      // Record Audit Log
      logAudit(db, {
        userId: input.user,
        userName: input.user || "Sales Counter",
        action: "SALE_CREATE",
        module: "POS",
        recordId: saleId,
        newValue: { invoiceNo, total, itemsCount: input.items.length, isEmi, emiFinancedAmount, paid },
        reason: `Generated invoice ${invoiceNo}${isEmi ? ` (EMI Financed: ₹${emiFinancedAmount})` : ""}`,
      });
    }

    db.exec("COMMIT;");

    return {
      id: saleId,
      invoiceNo,
      invoiceType,
      selectedTemplateId,
      date,
      customerId: input.customerId,
      items: input.items,
      discount,
      subtotal,
      tax: Math.round(tax),
      total,
      paid,
      payments: input.payments,
      quotation: isQuotation,
      note: input.note,
      status: "COMPLETED",
      isEmi,
      emiCompanyId,
      emiReceivableId,
      emiDownPayment: isEmi ? emiDownPayment : undefined,
      emiFinancedAmount: isEmi ? emiFinancedAmount : undefined,
    };
  } catch (error) {
    db.exec("ROLLBACK;");
    throw error;
  }
}

export function voidSale(
  db: DatabaseSync,
  saleId: string,
  reason: string,
  adminUser = "Admin"
): void {
  const sale = db.prepare("SELECT * FROM sales WHERE id = ?").get(saleId) as any;
  if (!sale) throw new Error("Sale not found");
  if (sale.status === "VOID") throw new Error("Sale is already voided");

  const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(saleId) as any[];

  db.exec("BEGIN TRANSACTION;");
  try {
    // Mark sale VOID (Never hard delete financial records per spec!)
    db.prepare("UPDATE sales SET status = 'VOID' WHERE id = ?").run(saleId);

    // If EMI sale, mark receivable CANCELLED
    if (sale.is_emi && sale.emi_receivable_id) {
      db.prepare("UPDATE emi_receivables SET status = 'CANCELLED' WHERE id = ?").run(sale.emi_receivable_id);
    }

    // Restore stock & units
    for (const item of items) {
      if (item.unit_id) {
        db.prepare("UPDATE units SET status = 'available', sale_id = NULL, customer_id = NULL WHERE id = ?").run(item.unit_id);
      } else if (item.imei) {
        db.prepare("UPDATE units SET status = 'available', sale_id = NULL, customer_id = NULL WHERE (imei1 = ? OR imei2 = ?) AND sale_id = ?").run(item.imei, item.imei, saleId);
      }
      db.prepare("UPDATE products SET qty = qty + ? WHERE id = ?").run(item.qty, item.product_id);

      recordStockMovement(db, {
        productId: item.product_id,
        unitId: item.unit_id,
        imei: item.imei,
        movementType: "ADJUSTMENT_IN",
        quantity: item.qty,
        costPerUnit: item.cost_price,
        referenceId: saleId,
        notes: `Reverted due to voided bill ${sale.invoice_no}`,
        createdBy: adminUser,
      });
    }

    // Reverse customer ledger
    recordCustomerLedger(db, sale.customer_id, "CREDIT_ADJUSTMENT", saleId, 0, sale.total, `Voided bill ${sale.invoice_no}: ${reason}`);

    logAudit(db, {
      userName: adminUser,
      action: "FINANCIAL_TRANSACTION_VOID",
      module: "SALES",
      recordId: saleId,
      oldValue: { status: "COMPLETED", invoiceNo: sale.invoice_no },
      newValue: { status: "VOID" },
      reason,
      adminApprovedBy: adminUser,
    });

    db.exec("COMMIT;");
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getSaleById(db: DatabaseSync, saleId: string): Sale | null {
  const sales = getSales(db);
  return sales.find((s) => s.id === saleId) ?? null;
}
