import { inr } from "./format";

/**
 * Normalizes an Indian phone number to WhatsApp international standard (e.g. 919876543210).
 * Returns null if the number is missing or invalid.
 */
export function normalizeIndianPhoneNumber(phone?: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `91${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("0")) {
    return `91${digits.slice(1)}`;
  }
  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }
  if (digits.length >= 10) {
    return digits;
  }
  return null;
}

export const normalizeIndianPhone = normalizeIndianPhoneNumber;

export interface CustomerDueInvoice {
  invoiceNo: string;
  date: string;
  total: number;
  paid?: number;
  due: number;
}

/**
 * Generates WhatsApp reminder for a single customer invoice.
 */
export function generateCustomerDueSingleMessage(params: {
  customerName: string;
  customerPhone?: string;
  invoiceNo: string;
  invoiceDate: string;
  total: number;
  paid: number;
  due: number;
  shopName?: string;
  upiId?: string;
}): string {
  const shop = params.shopName || "SHRI SAI MOBILE";
  return [
    `*${shop}*`,
    "Mobile Phones, Tablets & Accessories | Official Store",
    "--------------------------------------------------",
    `Dear ${params.customerName},`,
    "",
    "This is a gentle payment reminder for your invoice:",
    "",
    `📄 *Invoice No:* ${params.invoiceNo}`,
    `📅 *Invoice Date:* ${params.invoiceDate}`,
    `💰 *Total Amount:* ${inr(params.total)}`,
    `✅ *Paid Amount:* ${inr(params.paid)}`,
    `⚠️ *Outstanding Due:* ${inr(params.due)}`,
    "",
    `Please clear the pending balance of *${inr(params.due)}* via UPI / Cash / Net Banking.`,
    params.upiId ? `📲 *UPI ID:* ${params.upiId}` : "📲 *UPI ID:* 8817740040@paytm",
    "",
    "Thank you for choosing Shri Sai Mobile!",
    "NO NEED TO WORRY",
  ].join("\n");
}

export function generateDueWhatsAppMessage(params: {
  customerName: string;
  customerPhone?: string;
  invoiceNo: string;
  invoiceDate: string;
  totalAmount: number;
  paidAmount: number;
  dueAmount: number;
  shopName?: string;
  upiId?: string;
}): string {
  return generateCustomerDueSingleMessage({
    customerName: params.customerName,
    customerPhone: params.customerPhone,
    invoiceNo: params.invoiceNo,
    invoiceDate: params.invoiceDate,
    total: params.totalAmount,
    paid: params.paidAmount,
    due: params.dueAmount,
    shopName: params.shopName,
    upiId: params.upiId,
  });
}

/**
 * Generates consolidated WhatsApp reminder across multiple unpaid invoices.
 */
export function generateCustomerDueConsolidatedMessage(params: {
  customerName: string;
  customerPhone?: string;
  invoices: CustomerDueInvoice[];
  totalDue: number;
  shopName?: string;
  upiId?: string;
}): string {
  const shop = params.shopName || "SHRI SAI MOBILE";

  const invLines = params.invoices.map(
    (inv) =>
      `• *${inv.invoiceNo}* (${inv.date}) — Bill: ${inr(inv.total)} | Due: *${inr(inv.due)}*`
  );

  const lines = [
    `*${shop}*`,
    "Mobile Phones, Tablets & Accessories | Customer Accounts",
    "--------------------------------------------------",
    `Dear ${params.customerName},`,
    "",
    "This is a consolidated statement reminder for your outstanding invoices:",
    "",
    ...invLines,
    "",
    `🔴 *Total Outstanding Balance: ${inr(params.totalDue)}*`,
    "",
    "Please clear the pending balance at your earliest convenience.",
    params.upiId ? `📲 *UPI ID:* ${params.upiId}` : "📲 *UPI ID:* 8817740040@paytm",
    "",
    "Thank you for your business!",
    "NO NEED TO WORRY",
  ];

  return lines.join("\n");
}

export function generateConsolidatedDueWhatsAppMessage(params: {
  customerName: string;
  customerPhone?: string;
  totalDue: number;
  invoices: CustomerDueInvoice[];
  shopName?: string;
  upiId?: string;
}): string {
  return generateCustomerDueConsolidatedMessage(params);
}

export type RepairWhatsAppType = "RECEIVED" | "IN_PROGRESS" | "READY" | "DELIVERED";

/**
 * Generates contextual repair update message.
 */
export function generateRepairWhatsAppMessage(params: any): string {
  const shop = params.shopName || "SHRI SAI MOBILE";
  const statusKey = (params.type || params.status || "RECEIVED").toUpperCase();

  const jobId = params.jobId || params.repairId || "JOB-001";
  const device = params.device || "Mobile Phone";
  const problem = params.problem || "Repair Intake";
  const estimate = params.estimate !== undefined ? params.estimate : params.charges || 0;
  const advance = params.advance || 0;
  const balance = params.balanceDue !== undefined ? params.balanceDue : Math.max(0, estimate - advance);

  if (statusKey === "RECEIVED") {
    return [
      `*${shop}* — Service & Repair Center`,
      "--------------------------------------------------",
      `Dear ${params.customerName},`,
      "",
      "✅ *Device Received & Job Card Created*",
      "",
      `🔧 *Job ID:* ${jobId}`,
      `📱 *Device Model:* ${device}`,
      params.imei ? `🔢 *IMEI/Serial:* ${params.imei}` : "",
      `⚠️ *Reported Problem:* ${problem}`,
      `💵 *Estimated Total:* ${inr(estimate)}`,
      advance > 0 ? `💰 *Advance Received:* ${inr(advance)}` : "",
      `⏳ *Pending Balance:* ${inr(balance)}`,
      "",
      "Our technicians are inspecting your device. We will update you on progress.",
      "",
      "Thank you,",
      shop,
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (statusKey === "IN_PROGRESS" || statusKey === "DIAGNOSING" || statusKey === "REPAIRING") {
    return [
      `*${shop}* — Service & Repair Center`,
      "--------------------------------------------------",
      `Dear ${params.customerName},`,
      "",
      "🛠️ *Repair Update: In Progress*",
      "",
      `🔧 *Job ID:* ${jobId}`,
      `📱 *Device Model:* ${device}`,
      `⚡ *Current Status:* ${params.status || "Diagnosing & Repairing"}`,
      `💵 *Estimated Charges:* ${inr(estimate)}`,
      "",
      "Your device is on the technician workbench. We will notify you once ready.",
      "",
      "Thank you,",
      shop,
    ].join("\n");
  }

  if (statusKey === "READY") {
    return [
      `*${shop}* — Service & Repair Center`,
      "--------------------------------------------------",
      `Dear ${params.customerName},`,
      "",
      "🎉 *Good News! Your Device is Ready for Pickup*",
      "",
      `🔧 *Job ID:* ${jobId}`,
      `📱 *Device Model:* ${device}`,
      `💵 *Total Charges:* ${inr(estimate)}`,
      advance > 0 ? `💰 *Advance Paid:* ${inr(advance)}` : "",
      `🔴 *Payable at Pickup:* ${inr(balance)}`,
      "",
      "Please visit our store with your Job ID to collect your device.",
      "",
      "Thank you,",
      shop,
    ].join("\n");
  }

  // DELIVERED
  return [
    `*${shop}* — Service & Repair Center`,
    "--------------------------------------------------",
    `Dear ${params.customerName},`,
    "",
    "✨ *Device Delivered Successfully*",
    "",
    `🔧 *Job ID:* ${jobId}`,
    `📱 *Device Model:* ${device}`,
    `💰 *Total Settled:* ${inr(estimate)}`,
    "",
    "Thank you for trusting Shri Sai Mobile for your repair needs!",
    "NO NEED TO WORRY",
  ].join("\n");
}

/**
 * Generates formatted pre-filled WhatsApp message for an EMI Plan quotation or active account.
 */
export function generateEMIPlanWhatsAppMessage(params: {
  shopName?: string;
  shopPhone?: string;
  customerName?: string;
  customerPhone?: string;
  productName?: string;
  imei?: string;
  saleAmount: number;
  downPayment: number;
  financeAmount: number;
  financeCompany?: string;
  interestRate: number;
  interestType?: string;
  tenureMonths: number;
  monthlyEmi: number;
  totalInterest: number;
  processingFee?: number;
  totalPayable: number;
  firstEmiDate?: string;
  scheduleSummary?: string;
}): string {
  const shop = params.shopName || "SHRI SAI MOBILE";
  const customer = params.customerName || "Valued Customer";
  const lines = [
    `*📱 ${shop.toUpperCase()} — EMI FINANCING PLAN*`,
    "--------------------------------------------------",
    `Dear ${customer},`,
    "Here are the details of your customized Easy EMI Plan:",
    "",
    params.productName ? `📦 *Product:* ${params.productName}` : null,
    params.imei ? `🔢 *IMEI / Serial:* ${params.imei}` : null,
    `💰 *Sale Price:* ${inr(params.saleAmount)}`,
    `💵 *Down Payment Paid:* ${inr(params.downPayment)}`,
    `🏦 *Finance Amount (Loan):* ${inr(params.financeAmount)}`,
    params.financeCompany ? `🏢 *Finance Partner:* ${params.financeCompany}` : null,
    `📊 *Interest Rate:* ${params.interestRate}% ${params.interestType ? `(${params.interestType.replace("_", " ")})` : ""}`,
    `⏳ *Tenure:* ${params.tenureMonths} Months`,
    `📅 *Monthly EMI:* *${inr(params.monthlyEmi)} / month*`,
    `📈 *Total Interest:* ${inr(params.totalInterest)}`,
    params.processingFee ? `📑 *Processing Fee:* ${inr(params.processingFee)}` : null,
    `🏁 *Total Finance Payable:* *${inr(params.totalPayable)}*`,
    params.firstEmiDate ? `🗓️ *First EMI Due Date:* ${params.firstEmiDate}` : null,
    "",
    params.scheduleSummary ? `📋 *Installment Preview:*\n${params.scheduleSummary}\n` : null,
    "For inquiries, visit our store or contact us at " + (params.shopPhone || "our support desk") + ".",
    "Thank you for choosing " + shop + "!",
    "--------------------------------------------------",
  ].filter(Boolean);

  return lines.join("\n");
}

/**
 * Generates WhatsApp message for Credit Note.
 */
export function generateCreditNoteWhatsAppMessage(params: {
  customerName: string;
  noteNumber: string;
  date: string;
  originalInvoiceNo?: string;
  reason?: string;
  total: number;
  appliedAmount?: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  items?: Array<{ name: string; qty: number; rate: number }>;
  shopName?: string;
}): string {
  const shop = params.shopName || "SHRI SAI MOBILE";
  const lines = [
    `*${shop}*`,
    "Mobile Phones & Electronics | Official Store",
    "--------------------------------------------------",
    `Dear ${params.customerName},`,
    "",
    "A Credit Note has been issued for your account:",
    "",
    `📄 *Credit Note No:* ${params.noteNumber}`,
    `📅 *Date:* ${params.date}`,
  ];

  if (params.originalInvoiceNo) {
    lines.push(`📑 *Against Invoice:* ${params.originalInvoiceNo}`);
  }
  if (params.reason) {
    lines.push(`📝 *Reason:* ${params.reason}`);
  }

  if (params.items && params.items.length > 0) {
    lines.push("");
    lines.push("*Items:*");
    params.items.forEach((it, idx) => {
      lines.push(`${idx + 1}. ${it.name} (Qty: ${it.qty}) - ${inr(it.rate)}`);
    });
  }

  lines.push("");
  lines.push(`💰 *Total Credit Amount:* ${inr(params.total)}`);
  if ((params.refundedAmount ?? 0) > 0) {
    lines.push(`💵 *Refunded Amount:* ${inr(params.refundedAmount!)}`);
  }
  if ((params.appliedAmount ?? 0) > 0) {
    lines.push(`🔄 *Adjusted in Invoices:* ${inr(params.appliedAmount!)}`);
  }
  lines.push(`💎 *Available Credit Balance:* ${inr(params.remainingAmount ?? 0)}`);
  lines.push(`📌 *Status:* ${params.status}`);
  lines.push("");
  lines.push("You can utilize this credit balance towards your future purchases.");
  lines.push("Thank you for shopping with Shri Sai Mobile!");
  lines.push("NO NEED TO WORRY");

  return lines.join("\n");
}

/**
 * Generates WhatsApp message for Debit Note.
 */
export function generateDebitNoteWhatsAppMessage(params: {
  dealerName: string;
  noteNumber: string;
  date: string;
  originalInvoiceNo?: string;
  reason?: string;
  total: number;
  appliedAmount?: number;
  refundedAmount?: number;
  remainingAmount?: number;
  status: string;
  items?: Array<{ name: string; qty: number; rate: number }>;
  shopName?: string;
}): string {
  const shop = params.shopName || "SHRI SAI MOBILE";
  const lines = [
    `*${shop}*`,
    "Dealer / Supplier Notice",
    "--------------------------------------------------",
    `Dear ${params.dealerName},`,
    "",
    "A Debit Note has been raised against your account:",
    "",
    `📄 *Debit Note No:* ${params.noteNumber}`,
    `📅 *Date:* ${params.date}`,
  ];

  if (params.originalInvoiceNo) {
    lines.push(`📑 *Original Purchase Bill:* ${params.originalInvoiceNo}`);
  }
  if (params.reason) {
    lines.push(`📝 *Reason:* ${params.reason}`);
  }

  if (params.items && params.items.length > 0) {
    lines.push("");
    lines.push("*Items Returned/Adjusted:*");
    params.items.forEach((it, idx) => {
      lines.push(`${idx + 1}. ${it.name} (Qty: ${it.qty}) - ${inr(it.rate)}`);
    });
  }

  lines.push("");
  lines.push(`💰 *Total Debit Note Amount:* ${inr(params.total)}`);
  if ((params.appliedAmount ?? 0) > 0) {
    lines.push(`🔄 *Adjusted against Bill:* ${inr(params.appliedAmount!)}`);
  }
  if ((params.refundedAmount ?? 0) > 0) {
    lines.push(`💵 *Refund Received:* ${inr(params.refundedAmount!)}`);
  }
  lines.push(`📌 *Balance Due/Pending:* ${inr(params.remainingAmount ?? 0)}`);
  lines.push(`📌 *Status:* ${params.status}`);
  lines.push("");
  lines.push("Please update your ledger records accordingly.");
  lines.push("Shri Sai Mobile");

  return lines.join("\n");
}

/**
 * Dispatches WhatsApp message with validation and audit logging.
 * Polymorphic: accepts either (phone, message, options) OR ({ phone, message, ... }).
 */
export function openWhatsAppChat(
  phoneOrParams: string | { phone?: string | null; message: string; actionName?: string; recordId?: string },
  messageParam?: string,
  optionsParam?: { party?: string; partyId?: string; refId?: string; reason?: string }
): { success: boolean; error?: string } {
  let phone: string | null = null;
  let message = "";
  let action = "WHATSAPP_DISPATCH";
  let recordId: string | undefined = undefined;

  if (typeof phoneOrParams === "object" && phoneOrParams !== null) {
    phone = phoneOrParams.phone || null;
    message = phoneOrParams.message;
    action = phoneOrParams.actionName || action;
    recordId = phoneOrParams.recordId;
  } else {
    phone = phoneOrParams;
    message = messageParam || "";
    if (optionsParam) {
      action = optionsParam.reason || action;
      recordId = optionsParam.refId || optionsParam.partyId;
    }
  }

  const normalized = normalizeIndianPhoneNumber(phone);
  if (!normalized) {
    return {
      success: false,
      error: "Customer mobile number is missing or invalid.",
    };
  }

  const encoded = encodeURIComponent(message);
  const targetUrl = `https://wa.me/${normalized}?text=${encoded}`;
  if (typeof window !== "undefined") {
    window.open(targetUrl, "_blank");
  }

  // Log audit asynchronously
  if (typeof fetch !== "undefined") {
    fetch("/api/audit-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        module: "WHATSAPP",
        recordId,
        reason: `WhatsApp dispatched to +${normalized}`,
      }),
    }).catch(() => {});
  }

  return { success: true };
}
