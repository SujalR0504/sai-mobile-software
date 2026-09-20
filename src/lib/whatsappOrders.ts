import { inr } from "./format";
import type { CustomerOrder } from "./types";
import { openWhatsAppChat } from "./whatsapp";

export { openWhatsAppChat };

export type OrderWhatsAppTemplate =
  | "CONFIRMED"
  | "PAYMENT_RECEIVED"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

export interface GenerateOrderWhatsAppParams {
  template?: OrderWhatsAppTemplate;
  order: CustomerOrder;
  customerName?: string;
  customerPhone?: string;
  shopName?: string;
  shopPhone?: string;
}

/**
 * Dispatches an order-specific WhatsApp message to a customer phone number.
 */
export function openOrderWhatsAppChat(
  phone?: string | null,
  message?: string
): { success: boolean; error?: string } {
  return openWhatsAppChat(phone || "", message || "", {
    reason: "ORDER_WHATSAPP",
  });
}

/**
 * Generates formatted WhatsApp messages for customer orders.
 * Supports polymorphic arguments:
 *  1. ({ template, order, customerName, customerPhone, shopName, shopPhone })
 *  2. (order, shopName, shopPhone)
 */
export function generateOrderWhatsAppMessage(
  paramsOrOrder: GenerateOrderWhatsAppParams | CustomerOrder,
  shopNameArg = "SHRI SAI MOBILE",
  shopPhoneArg = "8770758326"
): string {
  let template: OrderWhatsAppTemplate = "CONFIRMED";
  let order: CustomerOrder;
  let customerName = "";
  let shopName = shopNameArg;
  let shopPhone = shopPhoneArg;

  if ("order" in paramsOrOrder) {
    // Called with options object
    const p = paramsOrOrder as GenerateOrderWhatsAppParams;
    order = p.order;
    template = p.template || "CONFIRMED";
    customerName = p.customerName || order.customerName || "Customer";
    shopName = p.shopName || shopNameArg;
    shopPhone = p.shopPhone || shopPhoneArg;
  } else {
    // Called with order directly
    order = paramsOrOrder as CustomerOrder;
    customerName = order.customerName || "Customer";
  }

  const itemsText = (order.items || [])
    .map((i) => `• ${i.productName} (Qty: ${i.qty}) — ${inr(i.total)}`)
    .join("\n");

  const header = [
    `*${shopName}*`,
    "Mobile Phones, Accessories & Service Store",
    "━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Hello *${customerName}*,`,
    "",
  ];

  if (template === "READY") {
    return [
      ...header,
      `🎉 *Good News! Your order ${order.orderNo} is READY for Pickup!*`,
      "",
      "📦 *Order Items:*",
      itemsText || "• Product ready",
      "",
      `💰 *Total Amount:* ${inr(order.total)}`,
      `✅ *Advance Received:* ${inr(order.advancePaid)}`,
      `🔴 *Payable at Pickup:* *${inr(order.balanceDue)}*`,
      "",
      "Please show your booking voucher when collecting your order at our store.",
      `📞 Contact: ${shopPhone}`,
      "",
      "Thank you for choosing us! 🙏",
    ].join("\n");
  }

  if (template === "DELIVERED") {
    return [
      ...header,
      `✨ *Your order ${order.orderNo} has been delivered successfully!*`,
      "",
      "📦 *Delivered Items:*",
      itemsText || "• Handed over to customer",
      "",
      `💰 *Total Bill:* ${inr(order.total)}`,
      `✅ *Amount Paid:* ${inr(order.advancePaid)}`,
      "",
      "Thank you for shopping with us! We look forward to serving you again.",
      `📞 For support: ${shopPhone}`,
      "",
      "SHRI SAI MOBILE — NO NEED TO WORRY",
    ].join("\n");
  }

  if (template === "CANCELLED") {
    return [
      ...header,
      `⚠️ *Notice: Order ${order.orderNo} has been cancelled.*`,
      "",
      "If any advance amount was paid, kindly visit our store desk for refund/settlement.",
      `📞 Helpline: ${shopPhone}`,
    ].join("\n");
  }

  if (template === "PAYMENT_RECEIVED") {
    return [
      ...header,
      `💳 *Payment Received for Order ${order.orderNo}*`,
      "",
      `✅ *Advance / Paid:* ${inr(order.advancePaid)}`,
      `⏳ *Remaining Balance:* ${inr(order.balanceDue)}`,
      `💰 *Total Order Value:* ${inr(order.total)}`,
      order.expectedDeliveryDate ? `📅 *Expected Delivery:* ${order.expectedDeliveryDate}` : "",
      "",
      "Thank you for your payment!",
      `📞 For questions: ${shopPhone}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  // Default: CONFIRMED
  const lines = [
    ...header,
    `Your order *${order.orderNo}* has been confirmed!`,
    "",
    "📦 *Order Items:*",
    itemsText || "• Reserved items",
    "",
    `💰 *Order Total:* ${inr(order.total)}`,
    `✅ *Advance Paid:* ${inr(order.advancePaid)}`,
    `⏳ *Balance Due:* ${inr(order.balanceDue)}`,
  ];

  if (order.expectedDeliveryDate) {
    lines.push(`📅 *Expected Delivery:* ${order.expectedDeliveryDate}`);
  }

  lines.push(
    "",
    `Status: *${order.status}*`,
    "",
    "Please show your order booking voucher when picking up your product.",
    `For any query, contact us at: ${shopPhone}`,
    "",
    "Thank you for choosing us! 🙏"
  );

  return lines.join("\n");
}
