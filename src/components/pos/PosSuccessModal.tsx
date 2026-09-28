import { Button, Modal } from "../ui";
import { inr } from "@/lib/format";
import { openWhatsAppChat } from "@/lib/whatsapp";
import type { Customer, Sale } from "@/lib/types";

interface PosSuccessModalProps {
  open: boolean;
  onClose: () => void;
  sale: Sale | null;
  customer?: Customer;
  onPrint: () => void;
  onNewSale: () => void;
  onViewInvoice: () => void;
}

export function PosSuccessModal({
  open,
  onClose,
  sale,
  customer,
  onPrint,
  onNewSale,
  onViewInvoice,
}: PosSuccessModalProps) {
  if (!sale) return null;

  const dueAmount = sale.dueAmount !== undefined ? sale.dueAmount : Math.max(0, sale.total - sale.paid);
  const customerMobile = customer?.phone || customer?.mobile || "";
  const hasValidPhone = customerMobile && customerMobile !== "—" && customerMobile !== "0000000000";

  const handleWhatsAppBill = () => {
    if (!hasValidPhone) {
      alert("Customer does not have a valid mobile number for WhatsApp.");
      return;
    }

    const itemsSummary = sale.items.map((i) => `• ${i.name} (Qty: ${i.qty}) - ₹${i.price * i.qty}`).join("\n");
    const msg = `🧾 *INVOICE: ${sale.invoiceNo}*\nDate: ${sale.date}\nCustomer: ${customer?.name || "Customer"}\n\n*Items:*\n${itemsSummary}\n\n*Grand Total:* ₹${sale.total.toLocaleString("en-IN")}\n*Paid:* ₹${sale.paid.toLocaleString("en-IN")}${dueAmount > 0 ? `\n*Balance Due:* ₹${dueAmount.toLocaleString("en-IN")}` : ""}\n\nThank you for shopping with us! 🙏`;

    openWhatsAppChat(customerMobile, msg, {
      party: "customer",
      partyId: sale.customerId,
      invoiceNo: sale.invoiceNo,
      amount: sale.total,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title="Bill Generated Successfully" wide={false}>
      <div className="space-y-4 py-1">
        {/* Success Icon & Invoice Heading */}
        <div className="text-center space-y-1">
          <div className="size-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-2xl">
            ✓
          </div>
          <h3 className="text-lg font-bold text-foreground">Sale Completed!</h3>
          <p className="text-xs text-muted-foreground font-mono">Invoice #{sale.invoiceNo}</p>
        </div>

        {/* Bill Summary Box */}
        <div className="rounded-xl border border-border/70 bg-muted/20 p-3.5 space-y-2 text-[12.5px]">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Customer:</span>
            <span className="font-bold text-foreground">{customer?.name || "Walk-in Customer"}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Items ({sale.items.length}):</span>
            <span className="font-semibold text-foreground">
              {sale.items.map((i) => `${i.name} (x${i.qty})`).join(", ").slice(0, 35)}
              {sale.items.map((i) => i.name).join(", ").length > 35 ? "..." : ""}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-border/50 pt-2 font-bold">
            <span>Grand Total:</span>
            <span className="font-mono text-[14px] text-primary">{inr(sale.total)}</span>
          </div>

          <div className="flex items-center justify-between text-emerald-700">
            <span>Paid Amount:</span>
            <span className="font-mono font-bold">{inr(sale.paid)}</span>
          </div>

          {dueAmount > 0 && (
            <div className="flex items-center justify-between text-destructive font-bold pt-1 border-t border-border/40">
              <span>Balance Due:</span>
              <span className="font-mono">{inr(dueAmount)}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <Button
            type="button"
            variant="primary"
            onClick={onPrint}
            className="w-full text-xs font-bold h-10 gap-1.5"
          >
            <span>🖨️</span> PRINT BILL (F7)
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleWhatsAppBill}
            disabled={!hasValidPhone}
            className="w-full text-xs font-bold h-10 gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50 disabled:opacity-50"
          >
            <span>💬</span> WHATSAPP BILL
          </Button>

          <Button
            type="button"
            variant="soft"
            onClick={onViewInvoice}
            className="w-full text-xs font-medium h-9"
          >
            View Full Invoice
          </Button>

          <Button
            type="button"
            variant="secondary"
            onClick={onNewSale}
            className="w-full text-xs font-bold h-9 bg-primary/10 text-primary hover:bg-primary/20"
          >
            + NEW SALE (F1)
          </Button>
        </div>
      </div>
    </Modal>
  );
}
