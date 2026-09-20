export * from "./permissions";
export const INVOICE_TYPES = ["GST", "NON_GST"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];
export const PAYMENT_MODES = ["Cash", "UPI", "Card", "Bank Transfer", "Credit", "EMI", "Cheque"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];
