import { inr } from "@/lib/format";
import type { CustomerOrder } from "@/lib/types";
import { Button, Modal } from "../ui";
import { Printer, Share2, CheckCircle2 } from "lucide-react";
import { generateOrderWhatsAppMessage, openWhatsAppChat } from "@/lib/whatsappOrders";

interface OrderPrintVoucherProps {
  open: boolean;
  onClose: () => void;
  order: CustomerOrder;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopGstin?: string;
}

export function OrderPrintVoucher({
  open,
  onClose,
  order,
  shopName = "SHRI SAI MOBILE",
  shopPhone = "8770758326",
  shopAddress = "In Front of Court, Near Prashant Restaurant, HARDA (M.P.) 461331",
  shopGstin = "23ASFPG1385D1Z7",
}: OrderPrintVoucherProps) {
  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsApp = () => {
    const text = generateOrderWhatsAppMessage(order, shopName, shopPhone);
    openWhatsAppChat(order.customerMobile || "", text);
  };

  return (
    <Modal open={open} onClose={onClose} title="Order Booking Voucher — Print Preview" wide>
      <div className="space-y-4">
        {/* Printable Paper Document */}
        <div
          id="order-printable-voucher"
          className="rounded-xl border border-slate-300 bg-white p-6 text-slate-800 shadow-xs print:m-0 print:border-none print:p-0"
        >
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900">{shopName}</h1>
                <p className="text-[12px] font-medium text-slate-600">{shopAddress}</p>
                <p className="text-[11px] text-slate-500">
                  Tel: {shopPhone} {shopGstin ? `| GSTIN: ${shopGstin}` : ""}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block rounded bg-primary px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  Customer Booking Voucher
                </span>
                <p className="mt-1 font-mono text-[14px] font-bold text-slate-900">{order.orderNo}</p>
                <p className="text-[11px] text-slate-500">Date: {order.date}</p>
                {order.expectedDeliveryDate && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Est. Delivery: {order.expectedDeliveryDate}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Customer & Order Metadata */}
          <div className="my-3 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-[12px]">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Customer Details</span>
              <p className="font-bold text-slate-900">{order.customerName}</p>
              <p className="text-slate-600">Mobile: {order.customerMobile || "N/A"}</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase text-slate-400">Order Information</span>
              <p className="font-semibold text-slate-800">Status: <span className="font-bold text-primary">{order.status}</span></p>
              <p className="text-slate-600">Sales Person: {order.salesPerson || "Counter"}</p>
            </div>
          </div>

          {/* Products Table */}
          <div className="my-4">
            <table className="w-full text-left text-[12px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100 font-bold text-slate-700">
                  <th className="py-2 px-2">#</th>
                  <th className="py-2 px-2">Item Description</th>
                  <th className="py-2 px-2">Brand / Model</th>
                  <th className="py-2 px-2 text-center">Qty</th>
                  <th className="py-2 px-2 text-right">Price</th>
                  <th className="py-2 px-2 text-right">Disc.</th>
                  <th className="py-2 px-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {order.items.map((item, idx) => (
                  <tr key={item.id} className="text-slate-700">
                    <td className="py-2 px-2 text-slate-400">{idx + 1}</td>
                    <td className="py-2 px-2">
                      <div className="font-bold text-slate-900">{item.productName}</div>
                      {item.imei && (
                        <div className="text-[10px] text-slate-500 font-mono">IMEI: {item.imei}</div>
                      )}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {[item.brand, item.model].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 px-2 text-center font-medium">{item.qty}</td>
                    <td className="py-2 px-2 text-right num">{inr(item.price)}</td>
                    <td className="py-2 px-2 text-right num text-rose-600">
                      {item.discount > 0 ? `-${inr(item.discount)}` : "—"}
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-slate-900 num">
                      {inr(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Financial Breakdown & Advances */}
          <div className="my-4 grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                Advance Payment History
              </div>
              {order.payments && order.payments.length > 0 ? (
                <div className="space-y-1.5">
                  {order.payments.map((p, i) => (
                    <div
                      key={p.id || i}
                      className="flex items-center justify-between rounded bg-slate-50 p-1.5 text-[11px]"
                    >
                      <div>
                        <span className="font-semibold text-slate-800">{p.paymentMethod}</span>
                        {p.accountName && (
                          <span className="text-slate-500 text-[10px]"> ({p.accountName})</span>
                        )}
                        <div className="text-[9.5px] text-slate-400">
                          {p.paymentDate} {p.referenceNumber ? `· Ref: ${p.referenceNumber}` : ""}
                        </div>
                      </div>
                      <span className="font-bold text-emerald-700 num">{inr(p.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] italic text-slate-400">No advance payment recorded</p>
              )}
            </div>

            <div className="rounded-lg bg-slate-50 p-3 space-y-1.5 text-[12px]">
              <div className="flex justify-between text-slate-600">
                <span>Order Total Amount:</span>
                <span className="font-bold text-slate-900 num">{inr(order.total)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Advance Paid:</span>
                <span className="num">-{inr(order.advancePaid)}</span>
              </div>
              <div className="border-t border-slate-300 pt-1.5 flex justify-between text-[13px] font-black text-rose-700">
                <span>Balance Payable at Delivery:</span>
                <span className="num">{inr(order.balanceDue)}</span>
              </div>
            </div>
          </div>

          {/* Notes & Terms */}
          <div className="my-3 rounded-lg border border-slate-200 p-2.5 text-[11px] text-slate-600 space-y-1">
            <p className="font-semibold text-slate-800">Booking Terms & Conditions:</p>
            <p>1. Please present this Booking Voucher at the counter during device pickup.</p>
            <p>2. Balance amount must be settled in full before handover of product/accessories.</p>
            <p>3. Advance payment is credited directly to order booking; final invoice is issued upon handover.</p>
            {order.notes && (
              <p className="text-amber-800 pt-1">
                <strong>Order Note:</strong> {order.notes}
              </p>
            )}
          </div>

          {/* Signatures */}
          <div className="mt-8 flex justify-between pt-6 text-center text-[11px] text-slate-500">
            <div className="w-40 border-t border-slate-400 pt-1">Customer Signature</div>
            <div className="w-40 border-t border-slate-400 pt-1">Authorised Signatory</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-2 no-print">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" onClick={handleWhatsApp} className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
            <Share2 className="size-4" />
            WhatsApp Customer
          </Button>
          <Button onClick={handlePrint} className="gap-1.5 bg-primary text-white">
            <Printer className="size-4" />
            Print Voucher
          </Button>
        </div>
      </div>
    </Modal>
  );
}
