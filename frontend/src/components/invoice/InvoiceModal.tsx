import React, { useState } from "react";
import { Button, Modal } from "@/components/ui";
import { InvoiceDocument, type InvoiceDocumentProps } from "./InvoiceDocument";
import { inr } from "@/lib/format";

export interface InvoiceModalProps extends InvoiceDocumentProps {
  open: boolean;
  onClose: () => void;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = (props) => {
  const { open, onClose, ...docProps } = props;
  const [selectedCopy, setSelectedCopy] = useState<string>(
    docProps.copyType || "ORIGINAL FOR RECIPIENT"
  );

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleWhatsAppShare = () => {
    const customerPhone = docProps.party.phone || docProps.party.mobile || "";
    const cleanPhone = customerPhone.replace(/\D/g, "");

    const lines = [
      `*${docProps.settings.shopName || "SHRI SAI MOBILE"}*`,
      `${docProps.settings.tagline || "NO NEED TO WORRY"}`,
      `-----------------------------`,
      `*Invoice No:* ${docProps.invoiceNo}`,
      `*Date:* ${docProps.invoiceDate}`,
      `*Customer:* ${docProps.party.name}`,
      `-----------------------------`,
      `*Items:*`,
      ...docProps.items.map(
        (i) => `• ${i.name} x${i.qty} - ₹${i.totalAmount}${i.imeis && i.imeis.length ? `\n  IMEI: ${i.imeis.join(", ")}` : ""}`
      ),
      `-----------------------------`,
      `*Grand Total: ₹${docProps.totals.grandTotal}*`,
      docProps.payment?.paid !== undefined ? `*Paid: ₹${docProps.payment.paid}*` : "",
      docProps.payment?.due && docProps.payment.due > 0 ? `*Balance Due: ₹${docProps.payment.due}*` : "",
      docProps.payment?.isEmi ? `*Finance Partner: ${docProps.payment.emiCompanyName} (Down Payment: ₹${docProps.payment.emiDownPayment || 0})*` : "",
      `-----------------------------`,
      `Thank you for choosing ${docProps.settings.shopName || "SHRI SAI MOBILE"}!`,
      `Support: ${docProps.settings.phone || ""}`
    ].filter(Boolean).join("\n");

    const encoded = encodeURIComponent(lines);
    const targetUrl = cleanPhone.length >= 10
      ? `https://wa.me/91${cleanPhone.slice(-10)}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    window.open(targetUrl, "_blank");
  };

  const handleCopySummary = () => {
    const summary = `${docProps.settings.shopName} - Invoice ${docProps.invoiceNo}\nCustomer: ${docProps.party.name}\nTotal: ₹${docProps.totals.grandTotal}`;
    navigator.clipboard.writeText(summary);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 print:p-0 print:static print:bg-white print:overflow-visible">
      {/* Container Dialog */}
      <div className="bg-slate-100 rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[96vh] overflow-hidden border border-slate-700 print:max-w-none print:w-full print:h-auto print:max-h-none print:border-none print:shadow-none print:bg-white print:rounded-none">
        {/* Modal Toolbar (Hidden during printing) */}
        <div className="no-print bg-[#0b0f19] text-white px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-orange-400 font-bold">📄</span>
            <div>
              <div className="font-bold text-sm tracking-wide flex items-center gap-2">
                <span>{docProps.settings.shopName || "SHRI SAI MOBILE"} Invoice</span>
                <span className="text-xs font-mono bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded border border-orange-500/30">
                  {docProps.invoiceNo}
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                {docProps.type === "NON_GST_SALE" ? "Cash / Retail Invoice (Non-GST)" : docProps.type === "GST_SALE" ? "Tax Invoice (GST)" : docProps.type}
              </div>
            </div>
          </div>

          {/* Copy Selector & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={selectedCopy}
              onChange={(e) => setSelectedCopy(e.target.value)}
              className="bg-slate-800 text-white text-xs border border-slate-700 rounded px-2.5 py-1.5 focus:outline-none focus:border-orange-500"
            >
              <option value="ORIGINAL FOR RECIPIENT">Original (Recipient)</option>
              <option value="DUPLICATE FOR TRANSPORTER">Duplicate (Transporter)</option>
              <option value="TRIPLICATE FOR SUPPLIER">Triplicate (Supplier)</option>
              <option value="DUPLICATE FOR RECORD">Duplicate (Record)</option>
            </select>

            <Button
              size="sm"
              variant="outline"
              onClick={handleWhatsAppShare}
              className="border-emerald-600/50 text-emerald-400 hover:bg-emerald-950/40 text-xs gap-1.5"
            >
              <span>💬</span> WhatsApp
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={handleCopySummary}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs"
            >
              Copy Text
            </Button>

            <Button
              size="sm"
              onClick={handlePrint}
              className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs gap-1.5 shadow-sm"
            >
              <span>🖨️</span> Print / Save PDF
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={onClose}
              className="text-slate-400 hover:text-white text-xs"
            >
              ✕ Close
            </Button>
          </div>
        </div>

        {/* Invoice Viewport */}
        <div className="flex-1 overflow-y-auto p-2 sm:p-6 bg-slate-200/80 print:p-0 print:bg-white print:overflow-visible">
          <InvoiceDocument {...docProps} copyType={selectedCopy} />
        </div>

        {/* Footer info (Hidden in print) */}
        <div className="no-print bg-slate-100 px-4 py-2 border-t border-slate-300 text-[11px] text-slate-600 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Formatted for standard A4 paper (210mm × 297mm)</span>
          </div>
          <div>
            Grand Total: <span className="font-bold text-slate-900">{inr(docProps.totals.grandTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
