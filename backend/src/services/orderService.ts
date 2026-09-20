import type { DatabaseSync } from "node:sqlite";
import { uid, todayISO } from "../../../shared/utils/format";
import type {
  CreateOrderInput,
  CustomerOrder,
  ConvertOrderToSaleInput,
  CancelOrderInput,
  OrderItem,
  OrderPayment,
  OrderStatus,
  OrderStatusHistory,
  ReceiveOrderPaymentInput,
  Sale,
} from "../../../shared/types";
import { getSettings } from "../repositories/repository";
import { logAudit } from "./auditService";
import { recordCashbookEntry, recordCustomerLedger } from "./ledgerService";
import { recordStockMovement } from "./stockMovementService";
import { createEMIAccountAndSchedule, createEMIReceivable } from "./emiService";
import {
  getDefaultCashAccount,
  getPaymentAccountById,
  recordAccountTransaction,
} from "./paymentAccountService";
import { generateInvoiceNo } from "./salesService";

export function generateOrderNo(db: DatabaseSync, customPrefix?: string): string {
  const settings = getSettings(db);
  const currentYear = new Date().getFullYear();
  const prefix = customPrefix || (settings as any).orderPrefix || "ORD-";
  const basePrefix = `${prefix}${currentYear}-`;

  const rows = db
    .prepare("SELECT order_no FROM orders WHERE order_no LIKE ?")
    .all(`${basePrefix}%`) as { order_no: string }[];

  let maxSeq = 1000;
  for (const r of rows) {
    const seqStr = r.order_no.slice(basePrefix.length);
    const seqNum = parseInt(seqStr, 10);
    if (!isNaN(seqNum) && seqNum > maxSeq) {
      maxSeq = seqNum;
    }
  }

  let candidate = `${basePrefix}${maxSeq + 1}`;
  let counter = 1;
  while (db.prepare("SELECT 1 FROM orders WHERE order_no = ?").get(candidate)) {
    candidate = `${basePrefix}${maxSeq + 1 + counter}`;
    counter++;
  }
  return candidate;
}

export function getOrders(
  db: DatabaseSync,
  filters: {
    status?: string;
    paymentStatus?: string;
    customerId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  } = {}
): CustomerOrder[] {
  let query = `SELECT * FROM orders WHERE 1=1`;
  const params: any[] = [];

  if (filters.status && filters.status !== "ALL") {
    query += ` AND status = ?`;
    params.push(filters.status);
  }

  if (filters.paymentStatus && filters.paymentStatus !== "ALL") {
    query += ` AND payment_status = ?`;
    params.push(filters.paymentStatus);
  }

  if (filters.customerId) {
    query += ` AND customer_id = ?`;
    params.push(filters.customerId);
  }

  if (filters.startDate) {
    query += ` AND date >= ?`;
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    query += ` AND date <= ?`;
    params.push(filters.endDate);
  }

  if (filters.search) {
    const term = `%${filters.search.toLowerCase()}%`;
    query += ` AND (LOWER(order_no) LIKE ? OR LOWER(customer_name) LIKE ? OR LOWER(customer_mobile) LIKE ?)`;
    params.push(term, term, term);
  }

  query += ` ORDER BY date DESC, created_at DESC`;

  const rows = db.prepare(query).all(...params) as any[];

  return rows.map((r) => mapOrderRow(db, r, false));
}

export function getOrderById(db: DatabaseSync, id: string): CustomerOrder | null {
  const row = db.prepare("SELECT * FROM orders WHERE id = ? OR order_no = ?").get(id, id) as any;
  if (!row) return null;
  return mapOrderRow(db, row, true);
}

function mapOrderRow(db: DatabaseSync, r: any, fullDetails = false): CustomerOrder {
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid ASC")
    .all(r.id) as any[];

  const orderItems: OrderItem[] = items.map((i) => ({
    id: i.id,
    orderId: i.order_id,
    productId: i.product_id,
    productName: i.product_name,
    category: i.category ?? undefined,
    brand: i.brand ?? undefined,
    model: i.model ?? undefined,
    unitId: i.unit_id ?? undefined,
    imei: i.imei ?? undefined,
    assignedImei: i.imei ?? undefined,
    qty: i.qty,
    quantity: i.qty,
    price: i.price,
    unitPrice: i.price,
    discount: i.discount || 0,
    discountAmount: i.discount || 0,
    gst: i.gst || 0,
    taxRate: i.gst || 0,
    total: i.total,
    totalAmount: i.total,
    costPrice: i.cost_price,
    warrantyMonths: i.warranty_months ?? undefined,
  }));

  let payments: OrderPayment[] | undefined;
  let statusHistory: OrderStatusHistory[] | undefined;

  if (fullDetails) {
    const payRows = db
      .prepare(
        `SELECT op.*, pa.account_name 
         FROM order_payments op 
         LEFT JOIN payment_accounts pa ON op.payment_account_id = pa.id 
         WHERE op.order_id = ? 
         ORDER BY op.created_at ASC`
      )
      .all(r.id) as any[];

    payments = payRows.map((p) => ({
      id: p.id,
      orderId: p.order_id,
      customerId: p.customer_id,
      paymentId: p.payment_id ?? undefined,
      amount: p.amount,
      paymentMethod: p.payment_method,
      paymentMode: p.payment_method,
      paymentAccountId: p.payment_account_id ?? undefined,
      accountName: p.account_name ?? undefined,
      referenceNumber: p.reference_number ?? undefined,
      transactionReference: p.reference_number ?? undefined,
      paymentDate: p.payment_date,
      remarks: p.remarks ?? undefined,
      notes: p.remarks ?? undefined,
      createdBy: p.created_by ?? undefined,
      createdAt: p.created_at,
    }));

    const histRows = db
      .prepare("SELECT * FROM order_status_history WHERE order_id = ? ORDER BY created_at ASC")
      .all(r.id) as any[];

    statusHistory = histRows.map((h) => ({
      id: h.id,
      orderId: h.order_id,
      fromStatus: h.from_status ?? undefined,
      toStatus: h.to_status,
      action: h.action,
      user: h.user ?? undefined,
      remarks: h.remarks ?? undefined,
      createdAt: h.created_at,
    }));
  }

  return {
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    orderNo: r.order_no,
    orderNumber: r.order_no,
    date: r.date,
    orderDate: r.date,
    expectedDeliveryDate: r.expected_delivery_date ?? undefined,
    customerId: r.customer_id,
    customerName: r.customer_name,
    customerMobile: r.customer_mobile ?? undefined,
    salesPerson: r.sales_person ?? undefined,
    invoiceType: r.invoice_type || "GST",
    subtotal: r.subtotal || 0,
    tax: r.tax || 0,
    taxAmount: r.tax || 0,
    discount: r.discount || 0,
    discountAmount: r.discount || 0,
    total: r.total || 0,
    totalAmount: r.total || 0,
    advancePaid: r.advance_paid || 0,
    balanceDue: r.balance_due || 0,
    paymentStatus: r.payment_status || "UNPAID",
    status: r.status || "CONFIRMED",
    saleId: r.sale_id ?? undefined,
    notes: r.notes ?? undefined,
    stockReserved: Boolean(r.stock_reserved),
    reservationActive: Boolean(r.stock_reserved),
    createdBy: r.created_by ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    items: orderItems,
    payments,
    statusHistory,
  };
}

export function createOrder(db: DatabaseSync, input: CreateOrderInput): CustomerOrder {
  if (!input.items || input.items.length === 0) {
    throw new Error("Order must contain at least one product item");
  }

  const customer = db
    .prepare("SELECT id, name, phone, mobile FROM customers WHERE id = ?")
    .get(input.customerId) as any;
  if (!customer) {
    throw new Error(`Customer with ID '${input.customerId}' not found`);
  }

  const settings = getSettings(db);
  const reserveStockSetting = Boolean((settings as any).reserveStockOnOrder);
  const shouldReserveStock =
    input.reserveStock !== undefined ? Boolean(input.reserveStock) : reserveStockSetting;

  const orderId = uid("ord");
  const orderNo = input.orderNo || generateOrderNo(db);
  const orderDate = input.date || todayISO();
  const invoiceType = input.invoiceType || "GST";
  const now = new Date().toISOString();

  // Calculate pricing
  let subtotal = 0;
  let tax = 0;
  let gross = 0;
  let totalDiscount = 0;

  const processedItems = input.items.map((item, idx) => {
    const itemQty = Math.max(1, item.qty || 1);
    const itemPrice = item.price || 0;
    const itemDiscount = Math.max(0, item.discount || 0);
    const itemGst = invoiceType === "NON_GST" ? 0 : item.gst ?? 18;
    const itemGross = itemPrice * itemQty - itemDiscount;
    const itemTotal = Math.max(0, itemGross);

    const itemTax =
      invoiceType === "NON_GST" ? 0 : (itemTotal * itemGst) / (100 + itemGst);
    const itemSubtotal = itemTotal - itemTax;

    gross += itemPrice * itemQty;
    totalDiscount += itemDiscount;
    subtotal += itemSubtotal;
    tax += itemTax;

    return {
      id: `${orderId}_item_${idx + 1}`,
      productId: item.productId,
      productName: item.productName || "Product",
      category: item.category ?? null,
      brand: item.brand ?? null,
      model: item.model ?? null,
      unitId: item.unitId ?? null,
      imei: item.imei ?? null,
      qty: itemQty,
      price: itemPrice,
      discount: itemDiscount,
      gst: itemGst,
      total: itemTotal,
      costPrice: 0,
      warrantyMonths: item.warrantyMonths ?? null,
    };
  });

  const orderTotal = Math.max(0, gross - totalDiscount);

  // Validate and calculate advance payment
  let advanceAmount = 0;
  let paymentStatus: "UNPAID" | "PARTIALLY_PAID" | "FULLY_PAID" = "UNPAID";
  let orderStatus: OrderStatus = "CONFIRMED";

  if (input.advancePayment && input.advancePayment.amount > 0) {
    advanceAmount = Math.min(orderTotal, Math.max(0, input.advancePayment.amount));
    if (advanceAmount >= orderTotal) {
      paymentStatus = "FULLY_PAID";
      orderStatus = "FULLY_PAID";
    } else {
      paymentStatus = "PARTIALLY_PAID";
      orderStatus = "PARTIALLY_PAID";
    }
  }

  const balanceDue = Math.max(0, orderTotal - advanceAmount);

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert Order
    db.prepare(`
      INSERT INTO orders (
        id, business_id, branch_id, order_no, date, expected_delivery_date,
        customer_id, customer_name, customer_mobile, sales_person, invoice_type,
        subtotal, tax, discount, total, advance_paid, balance_due, payment_status,
        status, notes, stock_reserved, created_by, created_at, updated_at
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `).run(
      orderId,
      orderNo,
      orderDate,
      input.expectedDeliveryDate ?? null,
      customer.id,
      customer.name,
      customer.phone || customer.mobile || "",
      input.salesPerson ?? null,
      invoiceType,
      Math.round(subtotal),
      Math.round(tax),
      totalDiscount,
      orderTotal,
      advanceAmount,
      balanceDue,
      paymentStatus,
      orderStatus,
      input.notes ?? null,
      shouldReserveStock ? 1 : 0,
      input.user || "Sales Counter",
      now,
      now
    );

    // 2. Insert Order Items & Optional Stock Reservation
    const insertItemStmt = db.prepare(`
      INSERT INTO order_items (
        id, order_id, product_id, product_name, category, brand, model,
        unit_id, imei, qty, price, discount, gst, total, cost_price, warranty_months
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of processedItems) {
      // Lookup product cost price
      const prod = db
        .prepare("SELECT purchase_price, tracked, qty FROM products WHERE id = ?")
        .get(item.productId) as any;
      if (prod) {
        item.costPrice = prod.purchase_price || 0;
      }

      insertItemStmt.run(
        item.id,
        orderId,
        item.productId,
        item.productName,
        item.category,
        item.brand,
        item.model,
        item.unitId,
        item.imei,
        item.qty,
        item.price,
        item.discount,
        item.gst,
        item.total,
        item.costPrice,
        item.warrantyMonths
      );

      // Handle stock reservation if enabled
      if (shouldReserveStock) {
        if (item.unitId) {
          db.prepare(
            "UPDATE units SET status = 'reserved', order_id = ? WHERE id = ?"
          ).run(orderId, item.unitId);
        } else {
          db.prepare(
            "UPDATE products SET reserved_qty = COALESCE(reserved_qty, 0) + ? WHERE id = ?"
          ).run(item.qty, item.productId);
        }
      }
    }

    // 3. Process Advance Payment if any
    if (advanceAmount > 0 && input.advancePayment) {
      const adv = input.advancePayment;
      let accountId = adv.paymentAccountId;

      if (!accountId) {
        if (adv.paymentMethod === "Cash") {
          accountId = getDefaultCashAccount(db).id;
        } else {
          const acctType = adv.paymentMethod === "Bank" ? "BANK" : adv.paymentMethod.toUpperCase();
          const acct = db
            .prepare(
              "SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1"
            )
            .get(acctType) as any;
          if (acct) {
            accountId = acct.id;
          } else {
            accountId = getDefaultCashAccount(db).id;
          }
        }
      }

      const payRecordId = uid("pay");
      const orderPayId = uid("ord_pay");

      // Record in main payments table first (so foreign key payment_id is satisfied)
      db.prepare(`
        INSERT INTO payments (
          id, business_id, branch_id, date, party, party_id, ref_id,
          amount, mode, payment_account_id, reference_number, note, created_by, created_at
        ) VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payRecordId,
        adv.paymentDate || orderDate,
        customer.id,
        orderId,
        advanceAmount,
        adv.paymentMethod,
        accountId,
        adv.referenceNumber ?? null,
        `Advance for Order ${orderNo}`,
        input.user || "Sales Counter",
        now
      );

      // Record in order_payments
      db.prepare(`
        INSERT INTO order_payments (
          id, order_id, customer_id, payment_id, amount, payment_method,
          payment_account_id, reference_number, payment_date, remarks, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        orderPayId,
        orderId,
        customer.id,
        payRecordId,
        advanceAmount,
        adv.paymentMethod,
        accountId,
        adv.referenceNumber ?? null,
        adv.paymentDate || orderDate,
        adv.remarks || `Advance payment for order ${orderNo}`,
        input.user || "Sales Counter",
        now
      );

      // Atomic payment account credit
      if (accountId) {
        recordAccountTransaction(db, {
          accountId,
          transactionType: "ORDER_ADVANCE",
          referenceType: "ORDER",
          referenceId: orderId,
          amount: advanceAmount,
          isCredit: true,
          paymentMethod: adv.paymentMethod,
          date: adv.paymentDate || orderDate,
          description: `Order Advance for ${orderNo}`,
          createdBy: input.user || "Sales Counter",
        });
      }

      // Record in Cashbook if Cash
      if (adv.paymentMethod === "Cash") {
        recordCashbookEntry(
          db,
          "ORDER_ADVANCE",
          orderId,
          "Customer Orders",
          advanceAmount,
          0,
          `Advance cash for order ${orderNo}`
        );
      }

      // Record in Customer Ledger
      recordCustomerLedger(
        db,
        customer.id,
        "PAYMENT",
        orderId,
        0,
        advanceAmount,
        `Advance received for Order ${orderNo}`,
        accountId,
        adv.paymentMethod,
        adv.referenceNumber
      );
    }

    // 4. Initial Timeline Status History
    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, NULL, ?, 'ORDER_CREATED', ?, ?, ?)
    `).run(
      uid("hist"),
      orderId,
      orderStatus,
      input.user || "Sales Counter",
      advanceAmount > 0
        ? `Order created with ₹${advanceAmount} advance payment`
        : "Order created",
      now
    );

    // 5. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Sales Counter",
      action: "ORDER_CREATE",
      module: "Orders",
      recordId: orderId,
      newValue: { orderNo, total: orderTotal, advance: advanceAmount, balance: balanceDue, itemsCount: processedItems.length },
      reason: `Placed Customer Order ${orderNo}`,
    });

    db.exec("COMMIT;");

    return getOrderById(db, orderId)!;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function receiveOrderPayment(
  db: DatabaseSync,
  orderId: string,
  input: ReceiveOrderPaymentInput
): CustomerOrder {
  const order = getOrderById(db, orderId);
  if (!order) {
    throw new Error(`Order '${orderId}' not found`);
  }

  if (order.status === "CANCELLED") {
    throw new Error("Cannot receive payment on a cancelled order");
  }

  if (order.status === "CONVERTED_TO_SALE") {
    throw new Error("Cannot receive order advance on an order already converted to sale");
  }

  if (input.amount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  if (input.amount > order.balanceDue) {
    throw new Error(
      `Payment amount (₹${input.amount}) exceeds remaining order balance (₹${order.balanceDue})`
    );
  }

  let accountId = input.paymentAccountId;
  if (!accountId) {
    if (input.paymentMethod === "Cash") {
      accountId = getDefaultCashAccount(db).id;
    } else {
      const acctType = input.paymentMethod === "Bank" ? "BANK" : input.paymentMethod.toUpperCase();
      const acct = db
        .prepare(
          "SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1"
        )
        .get(acctType) as any;
      accountId = acct ? acct.id : getDefaultCashAccount(db).id;
    }
  }

  const payDate = input.paymentDate || todayISO();
  const now = new Date().toISOString();
  const payRecordId = uid("pay");
  const orderPayId = uid("ord_pay");

  const newAdvancePaid = order.advancePaid + input.amount;
  const newBalanceDue = Math.max(0, order.total - newAdvancePaid);
  const newPaymentStatus = newBalanceDue === 0 ? "FULLY_PAID" : "PARTIALLY_PAID";

  let nextStatus = order.status;
  if (newBalanceDue === 0 && (order.status === "PARTIALLY_PAID" || order.status === "CONFIRMED" || order.status === "DRAFT")) {
    nextStatus = "FULLY_PAID";
  } else if (order.status === "DRAFT" || order.status === "CONFIRMED") {
    nextStatus = "PARTIALLY_PAID";
  }

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert payments record first (so foreign key payment_id is satisfied)
    db.prepare(`
      INSERT INTO payments (
        id, business_id, branch_id, date, party, party_id, ref_id,
        amount, mode, payment_account_id, reference_number, note, created_by, created_at
      ) VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payRecordId,
      payDate,
      order.customerId,
      order.id,
      input.amount,
      input.paymentMethod,
      accountId,
      input.referenceNumber ?? null,
      `Payment for Order ${order.orderNo}`,
      input.user || "Sales Counter",
      now
    );

    // 2. Insert order_payments
    db.prepare(`
      INSERT INTO order_payments (
        id, order_id, customer_id, payment_id, amount, payment_method,
        payment_account_id, reference_number, payment_date, remarks, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderPayId,
      order.id,
      order.customerId,
      payRecordId,
      input.amount,
      input.paymentMethod,
      accountId,
      input.referenceNumber ?? null,
      payDate,
      input.remarks || `Subsequent payment for order ${order.orderNo}`,
      input.user || "Sales Counter",
      now
    );

    // 3. Update payment account balance
    if (accountId) {
      recordAccountTransaction(db, {
        accountId,
        transactionType: "ORDER_ADVANCE",
        referenceType: "ORDER",
        referenceId: order.id,
        amount: input.amount,
        isCredit: true,
        paymentMethod: input.paymentMethod,
        date: payDate,
        description: `Order Payment for ${order.orderNo}`,
        createdBy: input.user || "Sales Counter",
      });
    }

    // 4. Update Cashbook if cash
    if (input.paymentMethod === "Cash") {
      recordCashbookEntry(
        db,
        "ORDER_ADVANCE",
        order.id,
        "Customer Orders",
        input.amount,
        0,
        `Cash payment for order ${order.orderNo}`
      );
    }

    // 5. Update Customer Ledger
    recordCustomerLedger(
      db,
      order.customerId,
      "PAYMENT",
      order.id,
      0,
      input.amount,
      `Order payment received for ${order.orderNo}`,
      accountId,
      input.paymentMethod,
      input.referenceNumber
    );

    // 6. Update Order record
    db.prepare(`
      UPDATE orders
      SET advance_paid = ?, balance_due = ?, payment_status = ?, status = ?, updated_at = ?
      WHERE id = ?
    `).run(newAdvancePaid, newBalanceDue, newPaymentStatus, nextStatus, now, order.id);

    // 7. Timeline History
    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, ?, ?, 'PAYMENT_RECEIVED', ?, ?, ?)
    `).run(
      uid("hist"),
      order.id,
      order.status,
      nextStatus,
      input.user || "Sales Counter",
      `Received ₹${input.amount} via ${input.paymentMethod} (Bal: ₹${newBalanceDue})`,
      now
    );

    // 8. Audit log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Sales Counter",
      action: "ORDER_PAYMENT",
      module: "Orders",
      recordId: order.id,
      newValue: { amount: input.amount, mode: input.paymentMethod, newBalance: newBalanceDue },
      reason: `Received payment of ₹${input.amount} for order ${order.orderNo}`,
    });

    db.exec("COMMIT;");
    return getOrderById(db, order.id)!;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function updateOrderStatus(
  db: DatabaseSync,
  orderId: string,
  toStatus: OrderStatus,
  remarks?: string,
  user?: string
): CustomerOrder {
  const order = getOrderById(db, orderId);
  if (!order) throw new Error(`Order '${orderId}' not found`);

  if (order.status === "CONVERTED_TO_SALE") {
    throw new Error("Cannot change status of an order that has already been converted to a sale");
  }

  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?").run(
      toStatus,
      now,
      order.id
    );

    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, ?, ?, 'STATUS_UPDATE', ?, ?, ?)
    `).run(
      uid("hist"),
      order.id,
      order.status,
      toStatus,
      user || "Sales Counter",
      remarks || `Status updated from ${order.status} to ${toStatus}`,
      now
    );

    logAudit(db, {
      userId: user,
      userName: user || "Sales Counter",
      action: "ORDER_STATUS_CHANGE",
      module: "Orders",
      recordId: order.id,
      oldValue: { status: order.status },
      newValue: { status: toStatus },
      reason: remarks || `Order status updated to ${toStatus}`,
    });

    db.exec("COMMIT;");
    return getOrderById(db, order.id)!;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function assignOrderImei(
  db: DatabaseSync,
  orderId: string,
  itemId: string,
  unitId: string,
  imei: string,
  user?: string
): CustomerOrder {
  const order = getOrderById(db, orderId);
  if (!order) throw new Error(`Order '${orderId}' not found`);

  const unit = db.prepare("SELECT * FROM units WHERE id = ?").get(unitId) as any;
  if (!unit) throw new Error(`Unit '${unitId}' not found`);

  if (unit.status !== "available" && unit.status !== "IN_STOCK" && unit.order_id !== orderId) {
    throw new Error(`Unit with IMEI ${unit.imei1} is not available (Status: ${unit.status})`);
  }

  const now = new Date().toISOString();

  db.exec("BEGIN TRANSACTION;");
  try {
    db.prepare(`
      UPDATE order_items
      SET unit_id = ?, imei = ?
      WHERE id = ? AND order_id = ?
    `).run(unitId, imei, itemId, orderId);

    if (order.stockReserved) {
      db.prepare(`
        UPDATE units
        SET status = 'reserved', order_id = ?
        WHERE id = ?
      `).run(orderId, unitId);
    }

    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, ?, ?, 'IMEI_ASSIGNED', ?, ?, ?)
    `).run(
      uid("hist"),
      order.id,
      order.status,
      order.status,
      user || "Sales Counter",
      `Assigned IMEI ${imei} to order item`,
      now
    );

    db.exec("COMMIT;");
    return getOrderById(db, order.id)!;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

/**
 * Atomic Order to Sale Conversion
 * Critical rule: Does NOT double-count advance payments.
 * Deducts stock, creates invoice, updates customer ledger, and marks order CONVERTED_TO_SALE.
 */
export function convertOrderToSale(
  db: DatabaseSync,
  orderId: string,
  input: ConvertOrderToSaleInput
): { sale: Sale; order: CustomerOrder } {
  const order = getOrderById(db, orderId);
  if (!order) throw new Error(`Order '${orderId}' not found`);

  if (order.status === "CONVERTED_TO_SALE") {
    throw new Error(`Order '${order.orderNo}' has already been converted to sale.`);
  }

  if (order.status === "CANCELLED") {
    throw new Error(`Cannot convert a cancelled order to sale.`);
  }

  const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(order.customerId) as any;
  if (!customer) throw new Error(`Customer '${order.customerId}' not found`);

  // Optional IMEI assignments prior to final bill
  if (input.items && input.items.length > 0) {
    for (const it of input.items) {
      if (it.unitId && it.imei) {
        db.prepare("UPDATE order_items SET unit_id = ?, imei = ? WHERE id = ?").run(
          it.unitId,
          it.imei,
          it.itemId
        );
      }
    }
  }

  // Refetch items after potential updates
  const items = db
    .prepare("SELECT * FROM order_items WHERE order_id = ?")
    .all(order.id) as any[];

  // Validate items inventory availability
  for (const item of items) {
    if (item.unit_id) {
      const u = db.prepare("SELECT * FROM units WHERE id = ?").get(item.unit_id) as any;
      if (!u) throw new Error(`Unit '${item.unit_id}' not found`);
      if (
        u.status !== "available" &&
        u.status !== "IN_STOCK" &&
        u.status !== "reserved" &&
        u.status !== "RESERVED"
      ) {
        throw new Error(`Unit ${u.imei1} is not available for sale (status: ${u.status})`);
      }
    } else {
      const p = db.prepare("SELECT * FROM products WHERE id = ?").get(item.product_id) as any;
      if (!p) throw new Error(`Product '${item.product_id}' not found`);
      // Available physical stock
      if (!p.tracked && p.qty < item.qty) {
        throw new Error(
          `Insufficient stock for '${p.name}'. Available: ${p.qty}, required: ${item.qty}`
        );
      }
    }
  }

  const settings = getSettings(db);
  const invoiceNo = generateInvoiceNo(db, settings.invoicePrefix);
  const saleId = uid("s");
  const today = todayISO();
  const now = new Date().toISOString();

  // Payment Breakdown
  const totalSaleAmount = order.total;
  const advanceAlreadyReceived = order.advancePaid;
  const remainingBalance = Math.max(0, totalSaleAmount - advanceAlreadyReceived);

  const finalMode = input.finalPaymentMode;
  let finalAccountId = input.finalPaymentAccountId;

  if (remainingBalance > 0 && finalMode !== "Credit" && finalMode !== "EMI" && !finalAccountId) {
    if (finalMode === "Cash") {
      finalAccountId = getDefaultCashAccount(db).id;
    } else {
      const acctType = finalMode === "Bank" ? "BANK" : finalMode.toUpperCase();
      const acct = db
        .prepare(
          "SELECT id FROM payment_accounts WHERE account_type = ? AND status = 'ACTIVE' ORDER BY is_default DESC LIMIT 1"
        )
        .get(acctType) as any;
      finalAccountId = acct ? acct.id : getDefaultCashAccount(db).id;
    }
  }

  const isEmi = finalMode === "EMI";
  const isCredit = finalMode === "Credit";

  let emiReceivableId: string | undefined;

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Insert Sales Invoice
    db.prepare(`
      INSERT INTO sales (
        id, business_id, branch_id, invoice_no, invoice_type, selected_template_id,
        date, customer_id, discount, subtotal, tax, total, paid, quotation,
        note, status, is_emi, emi_company_id, emi_down_payment, emi_financed_amount
      ) VALUES (
        ?, 'biz_default', 'branch_01', ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, 0,
        ?, 'COMPLETED', ?, ?, ?, ?
      )
    `).run(
      saleId,
      invoiceNo,
      order.invoiceType,
      input.selectedTemplateId || "template_modern",
      today,
      order.customerId,
      order.discount,
      order.subtotal,
      order.tax,
      totalSaleAmount,
      isCredit ? advanceAlreadyReceived : isEmi ? advanceAlreadyReceived : totalSaleAmount,
      order.notes ? `Converted from Order ${order.orderNo}. ${order.notes}` : `Converted from Order ${order.orderNo}`,
      isEmi ? 1 : 0,
      isEmi ? input.emiCompanyId ?? null : null,
      isEmi ? advanceAlreadyReceived : 0,
      isEmi ? remainingBalance : 0
    );

    // 2. Insert Sale Items
    const insertSaleItemStmt = db.prepare(`
      INSERT INTO sale_items (
        id, sale_id, product_id, name, unit_id, imei, qty, price, gst, cost_price, warranty_months
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    items.forEach((item, idx) => {
      insertSaleItemStmt.run(
        `${saleId}_i_${idx + 1}`,
        saleId,
        item.product_id,
        item.product_name,
        item.unit_id ?? null,
        item.imei ?? null,
        item.qty,
        item.price,
        item.gst,
        item.cost_price,
        item.warranty_months ?? null
      );
    });

    // 3. Stock Reduction & Stock Movements
    for (const item of items) {
      if (item.unit_id) {
        db.prepare(`
          UPDATE units
          SET status = 'sold', sale_id = ?, customer_id = ?, order_id = NULL
          WHERE id = ?
        `).run(saleId, order.customerId, item.unit_id);
      } else {
        db.prepare(`
          UPDATE products
          SET qty = MAX(0, qty - ?),
              reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?)
          WHERE id = ?
        `).run(item.qty, order.stockReserved ? item.qty : 0, item.product_id);
      }

      recordStockMovement(db, {
        productId: item.product_id,
        unitId: item.unit_id ?? undefined,
        imei: item.imei ?? undefined,
        movementType: "SALE",
        quantity: -item.qty,
        costPerUnit: item.cost_price,
        referenceId: saleId,
        notes: `Sold via Order Conversion ${order.orderNo} -> Invoice ${invoiceNo}`,
        createdBy: input.user || "Sales Counter",
      });
    }

    // 4. Link Advance Payments to Sale
    // We insert previous order advances as pre-settled sale_payments
    // (NO account balance credit here, to prevent double counting!)
    const orderPayments = db
      .prepare("SELECT * FROM order_payments WHERE order_id = ?")
      .all(order.id) as any[];

    const insertSalePaymentStmt = db.prepare(`
      INSERT INTO sale_payments (id, sale_id, mode, amount, payment_account_id, reference_number)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    orderPayments.forEach((op, idx) => {
      insertSalePaymentStmt.run(
        `${saleId}_adv_${idx + 1}`,
        saleId,
        op.payment_method,
        op.amount,
        op.payment_account_id ?? null,
        op.reference_number || `Advance (${order.orderNo})`
      );
    });

    // 5. Handle Final Remaining Payment
    if (remainingBalance > 0) {
      if (isEmi && input.emiCompanyId) {
        // EMI financing for the remaining balance
        const emiReceivable = createEMIReceivable(db, {
          businessId: "biz_default",
          branchId: "branch_01",
          emiCompanyId: input.emiCompanyId,
          financeReferenceNumber: input.emiFinanceReferenceNumber,
          customerId: order.customerId,
          customerName: customer.name,
          customerMobile: customer.phone || customer.mobile,
          invoiceId: invoiceNo,
          saleId: saleId,
          productId: items[0]?.product_id || "PROD",
          imei: items[0]?.imei,
          totalAmount: totalSaleAmount,
          downPayment: advanceAlreadyReceived,
          emiFinancedAmount: remainingBalance,
          expectedPaymentDate: input.emiExpectedPaymentDate,
          notes: `EMI financed for order balance ${order.orderNo}`,
          createdBy: input.user || "Sales Counter",
        });
        emiReceivableId = emiReceivable.id;
        db.prepare("UPDATE sales SET emi_receivable_id = ? WHERE id = ?").run(emiReceivableId, saleId);

        // EMI Account
        const emiAccount = createEMIAccountAndSchedule(db, {
          businessId: "biz_default",
          branchId: "branch_01",
          saleId: saleId,
          invoiceId: invoiceNo,
          customerId: order.customerId,
          customerName: customer.name,
          customerMobile: customer.phone || customer.mobile,
          productId: items[0]?.product_id || "PROD",
          productName: items[0]?.product_name || "Product",
          imei: items[0]?.imei,
          financeCompanyId: input.emiCompanyId,
          financeCompanyName: emiReceivable.emiCompanyName,
          productPrice: totalSaleAmount,
          discount: order.discount,
          downPayment: advanceAlreadyReceived,
          interestRate: input.interestRate ?? 0,
          interestType: input.interestType ?? "ANNUAL_REDUCING",
          tenureMonths: input.tenureMonths ?? 12,
          firstEmiDate: input.emiExpectedPaymentDate || todayISO(),
          createdBy: input.user || "Sales Counter",
        });
        db.prepare("UPDATE sales SET emi_account_id = ? WHERE id = ?").run(emiAccount.id, saleId);

        insertSalePaymentStmt.run(
          `${saleId}_emi`,
          saleId,
          "EMI",
          remainingBalance,
          null,
          input.emiFinanceReferenceNumber ?? null
        );

        recordCustomerLedger(
          db,
          order.customerId,
          "PAYMENT",
          saleId,
          0,
          remainingBalance,
          `Financed by ${emiReceivable.emiCompanyName} for invoice ${invoiceNo}`
        );
      } else if (isCredit) {
        // Customer takes remainder on credit
        insertSalePaymentStmt.run(
          `${saleId}_credit`,
          saleId,
          "Credit",
          remainingBalance,
          null,
          `Credit Due for invoice ${invoiceNo}`
        );
      } else {
        // Real remaining payment via Cash, UPI, Card, or Bank
        const payRecordId = uid("pay");
        insertSalePaymentStmt.run(
          `${saleId}_final`,
          saleId,
          finalMode,
          remainingBalance,
          finalAccountId ?? null,
          input.finalPaymentReference ?? null
        );

        // Record in payments table
        db.prepare(`
          INSERT INTO payments (
            id, business_id, branch_id, date, party, party_id, ref_id,
            amount, mode, payment_account_id, reference_number, note, created_by, created_at
          ) VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          payRecordId,
          today,
          order.customerId,
          saleId,
          remainingBalance,
          finalMode,
          finalAccountId ?? null,
          input.finalPaymentReference ?? null,
          `Final payment for order conversion ${order.orderNo} -> ${invoiceNo}`,
          input.user || "Sales Counter",
          now
        );

        // Real account balance inflow
        if (finalAccountId) {
          recordAccountTransaction(db, {
            accountId: finalAccountId,
            transactionType: "SALE_PAYMENT",
            referenceType: "SALE",
            referenceId: saleId,
            amount: remainingBalance,
            isCredit: true,
            paymentMethod: finalMode,
            date: today,
            description: `Final payment for invoice ${invoiceNo} (Order ${order.orderNo})`,
            createdBy: input.user || "Sales Counter",
          });
        }

        if (finalMode === "Cash") {
          recordCashbookEntry(
            db,
            "POS_SALE_CASH",
            saleId,
            "Sales",
            remainingBalance,
            0,
            `Final payment for invoice ${invoiceNo}`
          );
        }

        recordCustomerLedger(
          db,
          order.customerId,
          "PAYMENT",
          saleId,
          0,
          remainingBalance,
          `${finalMode} final payment for invoice ${invoiceNo}`,
          finalAccountId,
          finalMode,
          input.finalPaymentReference
        );
      }
    }

    // 6. Record Customer Ledger for the Sale itself (Debit = totalSaleAmount)
    recordCustomerLedger(
      db,
      order.customerId,
      "SALE",
      saleId,
      totalSaleAmount,
      0,
      `Invoice ${invoiceNo} (From Order ${order.orderNo})`
    );

    // 7. Mark Order as Converted to Sale
    db.prepare(`
      UPDATE orders
      SET status = 'CONVERTED_TO_SALE', sale_id = ?, stock_reserved = 0, updated_at = ?
      WHERE id = ?
    `).run(saleId, now, order.id);

    // 8. Order Status History
    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, ?, 'CONVERTED_TO_SALE', 'ORDER_CONVERTED_TO_SALE', ?, ?, ?)
    `).run(
      uid("hist"),
      order.id,
      order.status,
      input.user || "Sales Counter",
      `Order converted to Sale invoice ${invoiceNo} (Total: ₹${totalSaleAmount})`,
      now
    );

    // 9. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Sales Counter",
      action: "ORDER_CONVERT_SALE",
      module: "Orders",
      recordId: order.id,
      newValue: { saleId, invoiceNo, total: totalSaleAmount, advance: advanceAlreadyReceived, balancePaid: remainingBalance },
      reason: `Converted Order ${order.orderNo} to Sale invoice ${invoiceNo}`,
    });

    db.exec("COMMIT;");

    const createdSale: Sale = {
      id: saleId,
      invoiceNo,
      invoiceType: order.invoiceType,
      selectedTemplateId: input.selectedTemplateId || "template_modern",
      date: today,
      customerId: order.customerId,
      discount: order.discount,
      subtotal: order.subtotal,
      tax: order.tax,
      total: totalSaleAmount,
      paid: isCredit ? advanceAlreadyReceived : totalSaleAmount,
      items: items.map((i) => ({
        productId: i.product_id,
        name: i.product_name,
        unitId: i.unit_id,
        imei: i.imei,
        qty: i.qty,
        price: i.price,
        gst: i.gst,
        costPrice: i.cost_price,
        warrantyMonths: i.warranty_months,
      })),
      payments: [
        ...orderPayments.map((op) => ({
          mode: op.payment_method as any,
          amount: op.amount,
          paymentAccountId: op.payment_account_id,
          referenceNumber: op.reference_number,
        })),
        ...(remainingBalance > 0
          ? [
              {
                mode: finalMode as any,
                amount: remainingBalance,
                paymentAccountId: finalAccountId,
                referenceNumber: input.finalPaymentReference,
              },
            ]
          : []),
      ],
      quotation: false,
      note: `Converted from Order ${order.orderNo}`,
      status: "COMPLETED",
      isEmi,
      emiCompanyId: isEmi ? input.emiCompanyId : undefined,
      emiReceivableId,
      emiDownPayment: isEmi ? advanceAlreadyReceived : undefined,
      emiFinancedAmount: isEmi ? remainingBalance : undefined,
    };

    return { sale: createdSale, order: getOrderById(db, order.id)! };
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function cancelOrder(
  db: DatabaseSync,
  orderId: string,
  input: CancelOrderInput = {}
): CustomerOrder {
  const order = getOrderById(db, orderId);
  if (!order) throw new Error(`Order '${orderId}' not found`);

  if (order.status === "CANCELLED") {
    throw new Error(`Order '${order.orderNo}' is already cancelled`);
  }

  if (order.status === "CONVERTED_TO_SALE") {
    throw new Error(`Cannot cancel order '${order.orderNo}' because it has already been converted to a sale`);
  }

  const now = new Date().toISOString();
  const today = todayISO();
  const refundMethod = input.refundMethod || "NO_REFUND";

  db.exec("BEGIN TRANSACTION;");
  try {
    // 1. Process Refund if advance was paid and refund is requested
    if (order.advancePaid > 0) {
      if (refundMethod === "REFUND_PAYMENT") {
        let refundAccountId = input.refundPaymentAccountId;
        if (!refundAccountId) {
          refundAccountId = getDefaultCashAccount(db).id;
        }

        // Outflow from account
        recordAccountTransaction(db, {
          accountId: refundAccountId,
          transactionType: "ORDER_REFUND",
          referenceType: "ORDER",
          referenceId: order.id,
          amount: order.advancePaid,
          isCredit: false,
          paymentMethod: "Refund",
          date: today,
          description: `Refund of advance for cancelled order ${order.orderNo}`,
          createdBy: input.user || "Sales Counter",
        });

        // Insert payment refund record
        db.prepare(`
          INSERT INTO payments (
            id, business_id, branch_id, date, party, party_id, ref_id,
            amount, mode, payment_account_id, reference_number, note, created_by, created_at
          ) VALUES (?, 'biz_default', 'branch_01', ?, 'customer', ?, ?, ?, 'Refund', ?, NULL, ?, ?, ?)
        `).run(
          uid("pay"),
          today,
          order.customerId,
          order.id,
          order.advancePaid,
          refundAccountId,
          `Refund of advance for cancelled order ${order.orderNo}`,
          input.user || "Sales Counter",
          now
        );

        // Customer Ledger debit
        recordCustomerLedger(
          db,
          order.customerId,
          "PAYMENT",
          order.id,
          order.advancePaid,
          0,
          `Refund of advance for cancelled order ${order.orderNo}`,
          refundAccountId,
          "Refund"
        );
      } else if (refundMethod === "CUSTOMER_CREDIT") {
        // Retain as customer credit balance
        recordCustomerLedger(
          db,
          order.customerId,
          "PAYMENT",
          order.id,
          0,
          0,
          `Retained ₹${order.advancePaid} advance as store credit from cancelled order ${order.orderNo}`
        );
      }
    }

    // 2. Release Stock Reservation
    if (order.stockReserved) {
      const items = db
        .prepare("SELECT * FROM order_items WHERE order_id = ?")
        .all(order.id) as any[];

      for (const item of items) {
        if (item.unit_id) {
          db.prepare(`
            UPDATE units
            SET status = 'available', order_id = NULL
            WHERE id = ?
          `).run(item.unit_id);
        } else {
          db.prepare(`
            UPDATE products
            SET reserved_qty = MAX(0, COALESCE(reserved_qty, 0) - ?)
            WHERE id = ?
          `).run(item.qty, item.product_id);
        }
      }
    }

    // 3. Mark as Cancelled
    db.prepare(`
      UPDATE orders
      SET status = 'CANCELLED',
          payment_status = ?,
          stock_reserved = 0,
          updated_at = ?
      WHERE id = ?
    `).run(
      order.advancePaid > 0 && refundMethod === "REFUND_PAYMENT" ? "REFUNDED" : order.paymentStatus,
      now,
      order.id
    );

    // 4. Timeline
    db.prepare(`
      INSERT INTO order_status_history (
        id, order_id, from_status, to_status, action, user, remarks, created_at
      ) VALUES (?, ?, ?, 'CANCELLED', 'ORDER_CANCELLED', ?, ?, ?)
    `).run(
      uid("hist"),
      order.id,
      order.status,
      input.user || "Sales Counter",
      input.refundRemarks ||
        `Order cancelled (${refundMethod === "REFUND_PAYMENT" ? "Advance refunded" : refundMethod === "CUSTOMER_CREDIT" ? "Advance retained as credit" : "No refund"})`,
      now
    );

    // 5. Audit Log
    logAudit(db, {
      userId: input.user,
      userName: input.user || "Sales Counter",
      action: "ORDER_CANCEL",
      module: "Orders",
      recordId: order.id,
      newValue: { refundMethod, advancePaid: order.advancePaid },
      reason: input.refundRemarks || `Cancelled Order ${order.orderNo}`,
    });

    db.exec("COMMIT;");
    return getOrderById(db, order.id)!;
  } catch (err) {
    db.exec("ROLLBACK;");
    throw err;
  }
}

export function getOrderReports(db: DatabaseSync, filters: any = {}) {
  const allOrders = getOrders(db, filters);

  const totalOrders = allOrders.length;
  const totalValue = allOrders.reduce((sum, o) => sum + o.total, 0);
  const totalAdvanceCollected = allOrders.reduce((sum, o) => sum + o.advancePaid, 0);
  const totalBalanceDue = allOrders
    .filter((o) => o.status !== "CANCELLED" && o.status !== "CONVERTED_TO_SALE")
    .reduce((sum, o) => sum + o.balanceDue, 0);

  const statusCounts = allOrders.reduce((acc: Record<string, number>, o) => {
    acc[o.status] = (acc[o.status] || 0) + 1;
    return acc;
  }, {});

  // Advance payments breakdown by account
  const advanceByAccountRows = db
    .prepare(`
      SELECT 
        COALESCE(pa.account_name, op.payment_method) as account_name,
        op.payment_method,
        COUNT(op.id) as count,
        SUM(op.amount) as total_amount
      FROM order_payments op
      LEFT JOIN payment_accounts pa ON op.payment_account_id = pa.id
      GROUP BY op.payment_account_id, op.payment_method
      ORDER BY total_amount DESC
    `)
    .all() as any[];

  return {
    totalOrders,
    totalValue,
    totalAdvanceCollected,
    totalBalanceDue,
    statusCounts,
    advanceByAccount: advanceByAccountRows,
    recentOrders: allOrders.slice(0, 10),
  };
}
