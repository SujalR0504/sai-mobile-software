import type { DatabaseSync } from "node:sqlite";
import type { InterestType, LineItem, PaymentSplit, Sale } from "../../../shared/types";

export function getSales(db: DatabaseSync, options?: { includeCancelled?: boolean; status?: string }): Sale[] {
  let query = "SELECT * FROM sales ORDER BY date DESC";
  let params: any[] = [];

  if (options?.status && options.status !== "ALL") {
    query = "SELECT * FROM sales WHERE status = ? ORDER BY date DESC";
    params = [options.status];
  } else if (!options?.includeCancelled && options?.status !== "ALL") {
    query = "SELECT * FROM sales WHERE status != 'CANCELLED' AND status != 'VOID' ORDER BY date DESC";
  }

  const sales = db.prepare(query).all(...params) as any[];
  return sales.map((s) => {
    const items = db.prepare("SELECT * FROM sale_items WHERE sale_id = ?").all(s.id) as any[];
    const payments = db.prepare("SELECT * FROM payments WHERE party = 'customer' AND ref_id = ?").all(s.id) as any[];

    return {
      id: s.id,
      invoiceNo: s.invoice_no,
      invoiceType: (s.invoice_type as "GST" | "NON_GST") || "GST",
      date: s.date,
      customerId: s.customer_id,
      items: items.map((i) => ({
        productId: i.product_id,
        unitId: i.unit_id ?? undefined,
        name: i.name,
        price: i.price,
        costPrice: i.cost_price,
        qty: i.qty,
        gst: i.gst,
        hsn: i.hsn ?? undefined,
        imei: i.imei ?? undefined,
      })),
      discount: s.discount,
      subtotal: s.subtotal,
      tax: s.tax,
      total: s.total,
      paid: s.paid,
      payments: payments.map((p) => ({
        mode: p.mode as PaymentSplit["mode"],
        amount: p.amount,
      })),
      quotation: Boolean(s.quotation),
      note: s.note ?? undefined,
      customerNote: s.customer_note ?? s.note ?? undefined,
      status: (s.status as "COMPLETED" | "VOID" | "CANCELLED") || "COMPLETED",
      cancelledAt: s.cancelled_at ?? undefined,
      cancelledBy: s.cancelled_by ?? undefined,
      cancellationReason: s.cancellation_reason ?? undefined,
      isEmi: Boolean(s.is_emi),
      emiCompanyId: s.emi_company_id ?? undefined,
      emiDownPayment: s.emi_down_payment ?? undefined,
      emiFinancedAmount: s.emi_financed_amount ?? undefined,
      financeReferenceNumber: s.finance_reference_number ?? undefined,
      expectedPaymentDate: s.expected_payment_date ?? undefined,
      interestRate: s.interest_rate ?? undefined,
      interestType: (s.interest_type as InterestType) ?? undefined,
      tenureMonths: s.tenure_months ?? undefined,
      firstEmiDate: s.first_emi_date ?? undefined,
    };
  });
}
