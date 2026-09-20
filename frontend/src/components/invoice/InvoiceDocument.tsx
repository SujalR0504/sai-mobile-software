import React from "react";
import type { InvoiceTemplateType, PaymentMode, Settings } from "../../lib/types";
import { inr, inr2, fmtDate, numberToIndianWords } from "../../lib/format";

export interface InvoiceItem {
  srNo?: number;
  name: string;
  model?: string;
  brand?: string;
  hsnSac?: string;
  imeis?: string[];
  imei?: string;
  qty: number;
  unit?: string;
  rateExclTax?: number;
  rateInclTax?: number;
  discountPct?: number;
  discountAmount?: number;
  taxableAmount?: number;
  gstRate?: number;
  cgstPct?: number;
  cgstAmount?: number;
  sgstPct?: number;
  sgstAmount?: number;
  igstPct?: number;
  igstAmount?: number;
  totalAmount: number;
}

export interface InvoiceDocumentProps {
  type: InvoiceTemplateType;
  settings: Settings;
  copyType?: "ORIGINAL FOR RECIPIENT" | "DUPLICATE FOR TRANSPORTER" | "TRIPLICATE FOR SUPPLIER" | "DUPLICATE FOR RECORD" | string;

  // Metadata
  invoiceNo: string;
  invoiceDate: string;
  originalInvoiceNo?: string;
  originalInvoiceDate?: string;
  poNumber?: string;
  ewayBillNo?: string;
  deliveryNoteNo?: string;
  deliveryNoteDate?: string;
  dispatchDocNo?: string;
  dispatchDocDate?: string;
  dispatchedThrough?: string;
  destination?: string;
  termsOfDelivery?: string;
  paymentTerms?: string;
  dueDate?: string;
  placeOfSupply?: string;
  stateCode?: string;
  salesPerson?: string;
  remarks?: string;

  // Party Details (Buyer / Dealer)
  party: {
    name: string;
    phone?: string;
    mobile?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    stateCode?: string;
    gstin?: string;
    pan?: string;
    isUnregistered?: boolean;
    contactPerson?: string;
  };

  // Line items
  items: InvoiceItem[];

  // Totals
  totals: {
    totalQty?: number;
    grossAmount?: number;
    subtotal: number;
    discount?: number;
    taxableValue?: number;
    cgstAmount?: number;
    sgstAmount?: number;
    igstAmount?: number;
    otherCharges?: number;
    tdsAmount?: number;
    roundOff?: number;
    grandTotal: number;
    amountInWords?: string;
  };

  // Payment / EMI
  payment?: {
    mode?: PaymentMode | string;
    paid?: number;
    due?: number;
    isEmi?: boolean;
    emiCompanyName?: string;
    emiDownPayment?: number;
    emiFinancedAmount?: number;
    paymentSplits?: Array<{ mode: string; amount: number }>;
  };

  // Watermark toggle
  watermarkEnabled?: boolean;

  // Optional custom className
  className?: string;
}

export const InvoiceDocument: React.FC<InvoiceDocumentProps> = ({
  type,
  settings,
  copyType = "ORIGINAL FOR RECIPIENT",
  invoiceNo,
  invoiceDate,
  originalInvoiceNo,
  originalInvoiceDate,
  poNumber,
  ewayBillNo,
  deliveryNoteNo,
  deliveryNoteDate,
  dispatchDocNo,
  dispatchDocDate,
  dispatchedThrough,
  destination,
  termsOfDelivery,
  paymentTerms,
  dueDate,
  placeOfSupply,
  stateCode,
  salesPerson,
  remarks,
  party,
  items,
  totals,
  payment,
  watermarkEnabled,
  className = "",
}) => {
  const isGst = type === "GST_SALE" || type === "GST_PURCHASE";
  const isPurchase = type === "GST_PURCHASE" || type === "NON_GST_PURCHASE" || type === "PURCHASE_RETURN";
  const isReturn = type === "SALE_RETURN" || type === "PURCHASE_RETURN";

  // Ribbon Title
  let title = "TAX INVOICE";
  if (type === "NON_GST_SALE") title = "CASH / RETAIL INVOICE (NON-GST)";
  else if (type === "GST_PURCHASE") title = "PURCHASE INVOICE";
  else if (type === "NON_GST_PURCHASE") title = "PURCHASE INVOICE (NON-GST)";
  else if (type === "SALE_RETURN") title = "CREDIT NOTE / SALE RETURN";
  else if (type === "PURCHASE_RETURN") title = "DEBIT NOTE / PURCHASE RETURN";

  const showWatermark = watermarkEnabled ?? (settings.watermarkEnabled !== false);
  const watermarkText = settings.watermarkText || "SHRI SAI MOBILE";

  // Amount in words
  const words = totals.amountInWords || numberToIndianWords(totals.grandTotal);

  // Intrastate vs Interstate
  const resolvedStateCode = stateCode || party.stateCode || (party.gstin ? party.gstin.substring(0, 2) : "23");
  const isIntrastate = resolvedStateCode === "23" || resolvedStateCode === (settings.stateCode || "23");

  // Total Quantity calculation
  const totalQty = totals.totalQty ?? items.reduce((sum, item) => sum + (item.qty || 1), 0);

  // Shop Details
  const shopName = settings.shopName || "SHRI SAI MOBILE";
  const shopTagline = settings.tagline || "NO NEED TO WORRY";
  const shopAddress = settings.address || "In Front of Court, Near Prashant Restaurant, HARDA (M.P.) 461331";
  const shopPhone = settings.phone || "8770758326";
  const shopEmail = settings.email || "saimobileharda@gmail.com";
  const shopGstin = settings.gstin || "23ASFPG1385D1Z7";
  const shopState = settings.state || "Madhya Pradesh";
  const shopStateCode = settings.stateCode || "23";
  const shopDealsIn = settings.dealsIn || "Mobile Phones & Electronics Items";
  const shopServices = settings.businessServices || "SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE";
  const shopFooter = settings.footerText || "MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER";

  const defaultTerms = [
    "Goods once sold will not be taken back or exchanged.",
    "Manufacturer warranty will be applicable as per company policy.",
    "Subject to Harda (M.P.) Jurisdiction only.",
    "Please verify your GST details & items before leaving.",
    "No cash refund. Exchange as per company policy.",
    "Finance/EMI is subject to company's terms & conditions.",
    "Late payment charges @ 2% per month on outstanding.",
    "Cheque bounce charges ₹500/- per cheque.",
    "All disputes subject to Harda (M.P.) jurisdiction only.",
    "Thank you for shopping with SHRI SAI MOBILE.",
  ];

  const termsList = (settings.termsAndConditions && settings.termsAndConditions.length > 0)
    ? settings.termsAndConditions
    : defaultTerms;

  return (
    <div
      className={`printable-invoice bg-white text-black font-sans text-[11px] leading-tight select-text relative max-w-[850px] mx-auto p-4 md:p-6 border border-slate-300 shadow-sm print:border-none print:shadow-none print:max-w-none print:w-full print:p-0 ${className}`}
      style={{ minHeight: "297mm", boxSizing: "border-box" }}
    >
      {/* ========================================================================= */}
      {/* 1. TOP HEADER BRAND BANNER                                                */}
      {/* ========================================================================= */}
      <div className="bg-[#0b0f19] text-white rounded-t-lg overflow-hidden border-b-2 border-orange-500 relative">
        <div className="p-3 md:p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Logo & Tagline */}
          <div className="flex items-center gap-3">
            <img
              src={settings.logoUrl || "/shri_sai_logo.png"}
              alt={shopName}
              className="h-16 md:h-20 w-auto object-contain shrink-0"
              onError={(e) => {
                // Fallback styled brand title if image fails
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl md:text-2xl font-black tracking-tight text-white uppercase">
                  {shopName}
                </span>
              </div>
              <div className="text-[10px] md:text-[11px] tracking-widest text-orange-400 font-bold uppercase mt-0.5">
                {shopTagline}
              </div>
              <div className="text-[9px] text-slate-300 mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="text-orange-400 font-semibold">{shopServices}</span>
              </div>
            </div>
          </div>

          {/* Deals In & Brands Strip */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="text-[10px] text-amber-300 font-semibold tracking-wide">
              Deals In : <span className="text-white font-medium">{shopDealsIn}</span>
            </div>
            <img
              src={settings.brandsBannerUrl || "/brands_banner.png"}
              alt="Supported Brands"
              className="h-9 md:h-11 w-auto object-contain bg-white/95 rounded px-1.5 py-0.5"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
        </div>

        {/* Address, Phone, Email & Location QR Sub-bar */}
        <div className="bg-[#131926] px-3 md:px-4 py-2 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-[10px] text-slate-300">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-orange-400">📍</span>
              <span>{shopAddress}</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap text-slate-300">
              <div className="flex items-center gap-1">
                <span className="text-orange-400">📞</span>
                <span className="font-semibold text-white">{shopPhone}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-orange-400">✉️</span>
                <span>{shopEmail}</span>
              </div>
              {shopGstin && (
                <div className="flex items-center gap-1">
                  <span className="text-orange-400 font-bold">GSTIN:</span>
                  <span className="font-mono text-white font-semibold">{shopGstin}</span>
                </div>
              )}
            </div>
          </div>

          {/* QR Code */}
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <img
              src={settings.locationQrUrl || "/location_qr.png"}
              alt="Scan QR"
              className="w-11 h-11 bg-white p-0.5 rounded border border-slate-700 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <div className="text-[8px] uppercase tracking-wider text-slate-400 font-bold leading-tight">
              Scan for<br /><span className="text-orange-400">Location / UPI</span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TITLE RIBBON & COPY MARKER                                             */}
      {/* ========================================================================= */}
      <div className="flex items-stretch border-x border-b border-black mt-0 bg-white">
        {/* Left bold Title Chevron */}
        <div className="bg-[#0b0f19] text-white px-4 py-1.5 flex items-center justify-center font-black tracking-wider text-xs md:text-sm uppercase shrink-0 border-r-4 border-orange-500">
          {title}
        </div>
        {/* Right Copy Markers */}
        <div className="flex-1 flex items-center justify-end px-3 py-1 text-[9px] md:text-[10px] text-slate-600 uppercase font-semibold tracking-wider gap-2">
          <span>{copyType}</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-400">STATE: {shopState.toUpperCase()} ({shopStateCode})</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. THREE-COLUMN PARTY & INVOICE DETAILS GRID                              */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 border-x border-b border-black text-[10px]">
        {/* Column 1: BUYER DETAILS (or DEALER in purchase) */}
        <div className="border-b md:border-b-0 md:border-r border-black p-2.5 flex flex-col justify-between">
          <div>
            <div className="bg-orange-500 text-white font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider text-[9px] mb-1.5 flex items-center justify-between">
              <span>{isPurchase ? "Dealer Details (Seller)" : "Buyer Details (Bill To)"}</span>
              {party.isUnregistered && (
                <span className="bg-black/40 text-[8px] px-1 rounded font-normal">Unregistered</span>
              )}
            </div>
            <div className="space-y-1">
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">Name</span>
                <span className="mr-1">:</span>
                <span className="font-bold text-slate-900 break-words">{party.name || "Cash Customer"}</span>
              </div>
              {party.contactPerson && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">Contact</span>
                  <span className="mr-1">:</span>
                  <span className="text-slate-800">{party.contactPerson}</span>
                </div>
              )}
              {(party.phone || party.mobile) && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">Mobile</span>
                  <span className="mr-1">:</span>
                  <span className="text-slate-800 font-mono">{party.phone || party.mobile}</span>
                </div>
              )}
              {isGst && party.gstin ? (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">GSTIN</span>
                  <span className="mr-1">:</span>
                  <span className="font-mono font-bold text-slate-900">{party.gstin}</span>
                </div>
              ) : isGst ? (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">GSTIN</span>
                  <span className="mr-1">:</span>
                  <span className="italic text-slate-500">Unregistered Customer</span>
                </div>
              ) : null}
              {party.pan && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">PAN</span>
                  <span className="mr-1">:</span>
                  <span className="font-mono text-slate-800">{party.pan}</span>
                </div>
              )}
              {party.address && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">Address</span>
                  <span className="mr-1">:</span>
                  <span className="text-slate-800 break-words">{party.address}</span>
                </div>
              )}
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">State</span>
                <span className="mr-1">:</span>
                <span className="text-slate-800">{party.state || "Madhya Pradesh"} ({party.stateCode || "23"})</span>
              </div>
              {party.email && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">Email</span>
                  <span className="mr-1">:</span>
                  <span className="text-slate-800 truncate">{party.email}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: INVOICE DETAILS */}
        <div className="border-b md:border-b-0 md:border-r border-black p-2.5 bg-slate-50/50">
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-1 border-b border-slate-200">
              <span className="font-bold text-slate-700">Invoice No.</span>
              <span className="font-mono font-black text-red-600 text-xs tracking-wider">{invoiceNo}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Invoice Date</span>
              <span className="font-medium text-slate-900">{fmtDate(invoiceDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Bill Type</span>
              <span className="font-bold text-slate-900">
                {isGst ? "☑ GST Purchase/Sale" : "☑ Non-GST (Retail)"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-600">Place of Supply</span>
              <span className="font-medium text-slate-900">{placeOfSupply || "Madhya Pradesh (23)"}</span>
            </div>
            {paymentTerms && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Payment Terms</span>
                <span className="font-medium text-slate-900">{paymentTerms}</span>
              </div>
            )}
            {dueDate && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Due Date</span>
                <span className="font-medium text-slate-900">{fmtDate(dueDate)}</span>
              </div>
            )}
            {originalInvoiceNo && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Original Inv No.</span>
                <span className="font-mono font-semibold text-slate-900">{originalInvoiceNo}</span>
              </div>
            )}
            {ewayBillNo && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">e-Way Bill No.</span>
                <span className="font-mono text-slate-900">{ewayBillNo}</span>
              </div>
            )}
            {deliveryNoteNo && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Delivery Note</span>
                <span className="font-mono text-slate-900">{deliveryNoteNo}</span>
              </div>
            )}
            {dispatchedThrough && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Dispatched Via</span>
                <span className="text-slate-900">{dispatchedThrough}</span>
              </div>
            )}
            {destination && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Destination</span>
                <span className="text-slate-900">{destination}</span>
              </div>
            )}
            {salesPerson && (
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-600">Salesperson</span>
                <span className="text-slate-900">{salesPerson}</span>
              </div>
            )}
          </div>
        </div>

        {/* Column 3: DEALER DETAILS (SELLER) (or Shop Details in sales) */}
        <div className="p-2.5 flex flex-col justify-between">
          <div>
            <div className="bg-orange-500 text-white font-bold px-2 py-0.5 rounded-sm uppercase tracking-wider text-[9px] mb-1.5 flex items-center justify-between">
              <span>{isPurchase ? "Purchaser Details (Bill To)" : "Dealer Details (Seller)"}</span>
              <span className="bg-black/40 text-[8px] px-1 rounded font-normal">Registered Store</span>
            </div>
            <div className="space-y-1">
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">Name</span>
                <span className="mr-1">:</span>
                <span className="font-bold text-slate-900">{shopName}</span>
              </div>
              {isGst && (
                <div className="flex">
                  <span className="w-16 font-semibold text-slate-700 shrink-0">GSTIN</span>
                  <span className="mr-1">:</span>
                  <span className="font-mono font-bold text-slate-900">{shopGstin}</span>
                </div>
              )}
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">Address</span>
                <span className="mr-1">:</span>
                <span className="text-slate-800 break-words">{shopAddress}</span>
              </div>
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">State</span>
                <span className="mr-1">:</span>
                <span className="text-slate-800">{shopState} ({shopStateCode})</span>
              </div>
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">Contact</span>
                <span className="mr-1">:</span>
                <span className="text-slate-800 font-mono">{shopPhone}</span>
              </div>
              <div className="flex">
                <span className="w-16 font-semibold text-slate-700 shrink-0">Email</span>
                <span className="mr-1">:</span>
                <span className="text-slate-800 truncate">{shopEmail}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. PRODUCTS & ITEMS TABLE (With Center Watermark)                         */}
      {/* ========================================================================= */}
      <div className="relative border-x border-b border-black">
        {/* Subtle Watermark in background */}
        {showWatermark && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0 opacity-[0.06] overflow-hidden">
            <div className="text-center transform -rotate-12">
              <div className="text-5xl md:text-6xl font-black uppercase text-slate-900 tracking-tighter">
                {watermarkText}
              </div>
              <div className="text-xl md:text-2xl font-bold tracking-widest text-orange-600 mt-1">
                {shopTagline}
              </div>
            </div>
          </div>
        )}

        <table className="w-full text-left border-collapse relative z-10 text-[10px]">
          <thead>
            <tr className="bg-orange-500 text-white font-bold text-[9px] uppercase tracking-wider divide-x divide-orange-600">
              <th className="py-1.5 px-2 text-center w-8">S.No.</th>
              <th className="py-1.5 px-2 flex-1">Product Name / Description</th>
              {isGst && <th className="py-1.5 px-2 text-center w-20">HSN/SAC</th>}
              <th className="py-1.5 px-2 w-32">IMEI / Serial No.</th>
              <th className="py-1.5 px-2 text-center w-12">Qty.</th>
              <th className="py-1.5 px-2 text-right w-20">{isGst ? "Rate (Incl.)" : "Rate (₹)"}</th>
              {isGst && <th className="py-1.5 px-2 text-right w-20">Rate (Excl.)</th>}
              <th className="py-1.5 px-2 text-right w-14">Disc. %</th>
              {!isGst && <th className="py-1.5 px-2 text-right w-16">Disc. (₹)</th>}
              <th className="py-1.5 px-2 text-right w-24">Amount (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {items.map((item, idx) => {
              const imeis = item.imeis && item.imeis.length > 0
                ? item.imeis
                : item.imei
                  ? [item.imei]
                  : [];

              const rateIncl = item.rateInclTax ?? item.rateExclTax ?? (item.totalAmount / (item.qty || 1));
              const rateExcl = item.rateExclTax ?? (item.taxableAmount ? item.taxableAmount / (item.qty || 1) : rateIncl);

              return (
                <tr key={idx} className="divide-x divide-slate-200 hover:bg-slate-50/50">
                  <td className="py-2 px-2 text-center font-semibold text-slate-700">
                    {item.srNo ?? idx + 1}
                  </td>
                  <td className="py-2 px-2">
                    <div className="font-bold text-slate-900 text-[11px]">{item.name}</div>
                    {item.model && (
                      <div className="text-[9px] text-slate-500 font-medium">{item.brand ? `${item.brand} • ` : ""}{item.model}</div>
                    )}
                    {/* Show IMEI below product name if serialized */}
                    {imeis.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {imeis.map((im, imIdx) => (
                          <span
                            key={imIdx}
                            className="inline-block bg-slate-100 text-slate-800 font-mono text-[9px] px-1 py-0.5 rounded border border-slate-300"
                          >
                            IMEI: {im}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  {isGst && (
                    <td className="py-2 px-2 text-center font-mono text-slate-700">
                      {item.hsnSac || "85171300"}
                    </td>
                  )}
                  <td className="py-2 px-2 font-mono text-[9px] text-slate-700">
                    {imeis.length > 0 ? imeis.join(", ") : "—"}
                  </td>
                  <td className="py-2 px-2 text-center font-bold text-slate-800">
                    {item.qty} {item.unit || "PCS"}
                  </td>
                  <td className="py-2 px-2 text-right font-mono font-medium text-slate-800">
                    {inr2(rateIncl)}
                  </td>
                  {isGst && (
                    <td className="py-2 px-2 text-right font-mono font-medium text-slate-600">
                      {inr2(rateExcl)}
                    </td>
                  )}
                  <td className="py-2 px-2 text-right font-mono text-slate-700">
                    {item.discountPct ? `${item.discountPct}%` : "0%"}
                  </td>
                  {!isGst && (
                    <td className="py-2 px-2 text-right font-mono text-slate-700">
                      {item.discountAmount ? inr2(item.discountAmount) : "₹0.00"}
                    </td>
                  )}
                  <td className="py-2 px-2 text-right font-mono font-bold text-slate-900">
                    {inr2(item.totalAmount)}
                  </td>
                </tr>
              );
            })}

            {/* Empty filler rows to maintain clean A4 tabular height */}
            {items.length < 5 &&
              Array.from({ length: 5 - items.length }).map((_, fIdx) => (
                <tr key={`filler-${fIdx}`} className="divide-x divide-slate-200 text-transparent select-none">
                  <td className="py-2 px-2 text-center">&nbsp;</td>
                  <td className="py-2 px-2">&nbsp;</td>
                  {isGst && <td className="py-2 px-2">&nbsp;</td>}
                  <td className="py-2 px-2">&nbsp;</td>
                  <td className="py-2 px-2">&nbsp;</td>
                  <td className="py-2 px-2">&nbsp;</td>
                  {isGst && <td className="py-2 px-2">&nbsp;</td>}
                  <td className="py-2 px-2">&nbsp;</td>
                  {!isGst && <td className="py-2 px-2">&nbsp;</td>}
                  <td className="py-2 px-2">&nbsp;</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* ========================================================================= */}
      {/* 5. AMOUNT IN WORDS BAR                                                    */}
      {/* ========================================================================= */}
      <div className="border-x border-b border-black p-2 bg-slate-50 flex items-center justify-between text-[10px]">
        <div className="flex items-baseline gap-2 flex-1 mr-4">
          <span className="font-bold text-slate-700 uppercase tracking-wider shrink-0">
            Amount in Words:
          </span>
          <span className="font-semibold text-slate-900 border-b border-dotted border-slate-400 pb-0.5 flex-1 break-words">
            {words}
          </span>
        </div>
        <div className="font-bold text-slate-700 text-right shrink-0">
          Total Quantity: <span className="font-black text-slate-900">{totalQty} Units</span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. BOTTOM 3-SECTION SUMMARY (Terms, Finance/Promo, Totals Table)          */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-12 border-x border-b border-black text-[10px]">
        {/* Left Section: Terms & Conditions (5 cols) */}
        <div className="md:col-span-5 p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between">
          <div>
            <div className="font-bold text-slate-800 uppercase tracking-wider text-[9px] mb-1 border-b border-slate-200 pb-0.5 flex items-center justify-between">
              <span>Terms & Conditions :</span>
              <span className="text-[8px] text-slate-400 font-normal">Standard Store Policy</span>
            </div>
            <ol className="list-decimal list-inside space-y-0.5 text-[8.5px] text-slate-600 leading-snug">
              {termsList.slice(0, 10).map((term, tIdx) => (
                <li key={tIdx} className="break-words">
                  <span className="text-slate-800">{term}</span>
                </li>
              ))}
            </ol>
          </div>

          {/* Bank Details Snippet */}
          <div className="mt-2 pt-2 border-t border-slate-200 text-[8.5px] text-slate-600 space-y-0.5">
            <div className="font-bold text-slate-700 uppercase text-[8px] tracking-wider">Bank Payment Details:</div>
            <div>Bank: <span className="font-semibold text-slate-800">{settings.bankName || "State Bank of India"}</span></div>
            <div>A/C No: <span className="font-mono font-semibold text-slate-800">{settings.bankAccountNo || "39810293847"}</span></div>
            <div>IFSC: <span className="font-mono font-semibold text-slate-800">{settings.bankIfsc || "SBIN0000382"}</span> • Branch: {settings.bankBranch || "Harda"}</div>
          </div>
        </div>

        {/* Center Section: Finance / EMI & Promo Box (3 cols) */}
        <div className="md:col-span-3 p-2.5 border-b md:border-b-0 md:border-r border-black flex flex-col justify-between bg-slate-50/40">
          {/* Finance / EMI Details (if applicable) */}
          {payment?.isEmi || payment?.emiCompanyName ? (
            <div className="border border-orange-300 bg-orange-50/80 p-2 rounded mb-2">
              <div className="font-bold text-orange-700 text-[9px] uppercase tracking-wider mb-1">
                Finance By: {payment.emiCompanyName || "Finance Partner"}
              </div>
              <div className="space-y-0.5 text-[9px]">
                <div className="flex justify-between">
                  <span>Sale Total:</span>
                  <span className="font-bold">{inr(totals.grandTotal)}</span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Customer Down Payment:</span>
                  <span className="font-bold">{inr(payment.emiDownPayment || 0)}</span>
                </div>
                <div className="flex justify-between text-orange-800 font-bold border-t border-orange-200 pt-0.5">
                  <span>Finance Amount:</span>
                  <span>{inr(payment.emiFinancedAmount || (totals.grandTotal - (payment.emiDownPayment || 0)))}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[9px] text-slate-600 mb-1">
              <span className="font-bold text-slate-800">Finance Available:</span> Bajaj Finserv, HDB, TVS Credit, IDFC FIRST Bank
            </div>
          )}

          {/* Promo Graphic & Checklist Box */}
          <div className="border border-slate-300 bg-white p-2 rounded shadow-2xs flex items-center gap-2">
            <img
              src={settings.brandsBannerUrl || "/promo_graphic.png"}
              alt="Accessories"
              className="w-12 h-14 object-contain shrink-0"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
            <div className="text-[8px] leading-tight space-y-0.5">
              <div className="font-bold text-orange-600 uppercase tracking-wide">Mobile Accessories</div>
              <div>☑ Chargers & Cables</div>
              <div>☑ Earbuds & TWS</div>
              <div>☑ Covers & Glasses</div>
              <div>☑ Fast Repair / Exchange</div>
            </div>
          </div>
        </div>

        {/* Right Section: Totals Table (4 cols) */}
        <div className="md:col-span-4 p-0 flex flex-col justify-between">
          <table className="w-full text-[10px] divide-y divide-slate-200">
            <tbody>
              {/* Gross / Subtotal */}
              <tr className="flex justify-between py-1 px-3">
                <td className="text-slate-600">Total Amount</td>
                <td className="font-mono font-medium text-slate-900">{inr2(totals.grossAmount ?? totals.subtotal)}</td>
              </tr>
              {totals.discount !== undefined && totals.discount > 0 && (
                <tr className="flex justify-between py-1 px-3 text-emerald-700">
                  <td>Discount</td>
                  <td className="font-mono font-medium">- {inr2(totals.discount)}</td>
                </tr>
              )}
              {isGst && (
                <tr className="flex justify-between py-1 px-3 bg-slate-50">
                  <td className="font-semibold text-slate-700">Taxable Value</td>
                  <td className="font-mono font-semibold text-slate-900">
                    {inr2(totals.taxableValue ?? totals.subtotal)}
                  </td>
                </tr>
              )}

              {/* GST Breakdown (Only in GST mode) */}
              {isGst && isIntrastate && (
                <>
                  <tr className="flex justify-between py-1 px-3 text-slate-700">
                    <td>CGST @ 9%</td>
                    <td className="font-mono">{inr2(totals.cgstAmount ?? 0)}</td>
                  </tr>
                  <tr className="flex justify-between py-1 px-3 text-slate-700">
                    <td>SGST @ 9%</td>
                    <td className="font-mono">{inr2(totals.sgstAmount ?? 0)}</td>
                  </tr>
                </>
              )}

              {isGst && !isIntrastate && (
                <tr className="flex justify-between py-1 px-3 text-slate-700">
                  <td>IGST @ 18%</td>
                  <td className="font-mono">{inr2(totals.igstAmount ?? 0)}</td>
                </tr>
              )}

              {totals.otherCharges !== undefined && totals.otherCharges > 0 && (
                <tr className="flex justify-between py-1 px-3 text-slate-700">
                  <td>Other Charges</td>
                  <td className="font-mono">{inr2(totals.otherCharges)}</td>
                </tr>
              )}

              {totals.tdsAmount !== undefined && totals.tdsAmount > 0 && (
                <tr className="flex justify-between py-1 px-3 text-red-700">
                  <td>TDS (If Applicable)</td>
                  <td className="font-mono">- {inr2(totals.tdsAmount)}</td>
                </tr>
              )}

              {totals.roundOff !== undefined && totals.roundOff !== 0 && (
                <tr className="flex justify-between py-1 px-3 text-slate-500">
                  <td>Round Off</td>
                  <td className="font-mono">{inr2(totals.roundOff)}</td>
                </tr>
              )}

              {/* Solid Orange Grand Total Row */}
              <tr className="flex justify-between items-center py-2 px-3 bg-orange-500 text-white font-black text-xs md:text-sm tracking-wide">
                <span>Grand Total</span>
                <span className="font-mono">{inr2(totals.grandTotal)}</span>
              </tr>

              {/* Payment Summary */}
              {payment && (
                <tr className="flex flex-col py-1.5 px-3 bg-slate-50 text-[9px] space-y-0.5 border-t border-slate-300">
                  <div className="flex justify-between font-semibold text-slate-700">
                    <span>Payment Mode:</span>
                    <span className="uppercase text-slate-900">{payment.mode || "Cash"}</span>
                  </div>
                  {payment.paid !== undefined && (
                    <div className="flex justify-between text-emerald-700 font-semibold">
                      <span>Received:</span>
                      <span className="font-mono">{inr(payment.paid)}</span>
                    </div>
                  )}
                  {payment.due !== undefined && payment.due > 0 && (
                    <div className="flex justify-between text-red-600 font-bold">
                      <span>Balance Outstanding:</span>
                      <span className="font-mono">{inr(payment.due)}</span>
                    </div>
                  )}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 7. SIGN-OFF & SIGNATURE ROW                                               */}
      {/* ========================================================================= */}
      <div className="border-x border-b border-black p-3 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left: Thank You Callout */}
        <div className="flex items-center gap-3">
          <div className="text-2xl md:text-3xl font-serif italic font-bold text-orange-600 tracking-tight">
            Thank You!
          </div>
          <div className="border-l-2 border-orange-400 pl-2.5">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">For Choosing</div>
            <div className="text-xs font-black text-slate-900 uppercase">{shopName}</div>
            <div className="text-[9px] text-orange-600 font-bold tracking-widest uppercase">{shopTagline}</div>
          </div>
        </div>

        {/* Customer & Signatory Blocks */}
        <div className="flex items-center gap-6 sm:gap-12 text-center">
          <div>
            <div className="w-28 sm:w-36 border-b border-black h-8 mb-1"></div>
            <div className="text-[9px] font-semibold text-slate-700 uppercase tracking-wider">
              Customer's Signature
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold text-slate-600 mb-0.5">For {shopName}</div>
            <div className="w-32 sm:w-40 border-b border-black h-7 mb-1 flex items-center justify-center">
              {settings.signatureUrl && (
                <img src={settings.signatureUrl} alt="Signature" className="max-h-6 w-auto object-contain" />
              )}
            </div>
            <div className="text-[9px] font-bold text-slate-900 uppercase tracking-wider">
              {settings.signatureTitle || "Authorised Signatory"}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 8. BOTTOM CHEVRON BRAND FOOTER                                            */}
      {/* ========================================================================= */}
      <div className="bg-[#0b0f19] text-white flex items-stretch rounded-b-lg overflow-hidden border-t-2 border-orange-500 text-[9px] md:text-[10px] font-bold">
        <div className="flex-1 px-3 py-1.5 flex items-center justify-center sm:justify-start tracking-wider uppercase text-slate-300">
          {shopFooter}
        </div>
        <div className="bg-orange-500 text-black px-4 py-1.5 flex items-center justify-center font-black tracking-widest uppercase shrink-0">
          {shopTagline}
        </div>
      </div>
    </div>
  );
};
