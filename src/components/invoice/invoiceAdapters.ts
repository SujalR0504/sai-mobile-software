import type { AppDatabase, Sale, Purchase, DebitNote, CreditNote, ReturnDoc } from "../../lib/types";
import type { InvoiceDocumentProps } from "./InvoiceDocument";
import { numberToIndianWords } from "../../lib/format";

export function saleToInvoiceProps(sale: Sale, db: AppDatabase): InvoiceDocumentProps {
  const customer = db.customers.find((c) => c.id === sale.customerId);
  const isNonGst = sale.invoiceType === "NON_GST";

  const items = sale.items.map((it, idx) => {
    const totalAmount = it.price * it.qty;
    const gstRate = isNonGst ? 0 : (it.gst || 0);
    const taxAmount = isNonGst ? 0 : (totalAmount * gstRate) / (100 + gstRate);
    const taxableAmount = totalAmount - taxAmount;
    const halfGst = gstRate / 2;
    const halfTax = taxAmount / 2;

    return {
      srNo: idx + 1,
      name: it.name,
      hsnSac: it.hsnSac || "8517",
      imeis: it.imeis && it.imeis.length ? it.imeis : (it.imei ? [it.imei] : []),
      imei: it.imei,
      qty: it.qty,
      unit: it.unit || "NOS",
      rateExclTax: taxableAmount / (it.qty || 1),
      rateInclTax: it.price,
      taxableAmount,
      gstRate,
      cgstPct: halfGst,
      cgstAmount: halfTax,
      sgstPct: halfGst,
      sgstAmount: halfTax,
      igstPct: 0,
      igstAmount: 0,
      totalAmount,
    };
  });

  const taxableValue = isNonGst ? sale.total : (sale.total - (sale.tax || 0));
  const halfTax = isNonGst ? 0 : ((sale.tax || 0) / 2);

  const emiCompany = sale.emiCompanyId
    ? db.emiCompanies?.find((c) => c.id === sale.emiCompanyId)
    : undefined;

  return {
    type: isNonGst ? "NON_GST_SALE" : "GST_SALE",
    settings: db.settings,
    templateId: sale.selectedTemplateId || "template_modern",
    copyType: "ORIGINAL FOR RECIPIENT",
    invoiceNo: sale.invoiceNo,
    invoiceDate: sale.date,
    placeOfSupply: db.settings.state || "Madhya Pradesh",
    stateCode: db.settings.stateCode || "23",
    remarks: sale.note || (sale.quotation ? "Quotation only — not a tax invoice" : undefined),
    party: {
      name: customer?.name || "Cash Customer",
      phone: customer?.phone && customer.phone !== "—" ? customer.phone : "",
      mobile: customer?.phone && customer.phone !== "—" ? customer.phone : "",
      address: customer?.address || "",
      city: customer?.city || db.settings.city || "Harda",
      state: customer?.state || db.settings.state || "Madhya Pradesh",
      stateCode: customer?.stateCode || db.settings.stateCode || "23",
      gstin: customer?.gstin || "",
      isUnregistered: !customer?.gstin,
    },
    items,
    totals: {
      totalQty: items.reduce((s, i) => s + i.qty, 0),
      grossAmount: sale.subtotal || sale.total,
      subtotal: sale.subtotal || sale.total,
      discount: sale.discount || 0,
      taxableValue,
      cgstAmount: halfTax,
      sgstAmount: halfTax,
      igstAmount: 0,
      grandTotal: sale.total,
      amountInWords: numberToIndianWords(sale.total),
    },
    payment: {
      mode: sale.isEmi ? "EMI" : (sale.payments?.[0]?.mode || "Cash"),
      paid: sale.paid,
      due: sale.isEmi
        ? (sale.emiFinancedAmount !== undefined ? sale.emiFinancedAmount : Math.max(0, sale.total - sale.paid))
        : Math.max(0, sale.total - sale.paid),
      isEmi: sale.isEmi,
      emiCompanyName: sale.emiCompanyName || emiCompany?.companyName || "Finance Partner",
      emiDownPayment: sale.emiDownPayment,
      emiFinancedAmount: sale.emiFinancedAmount,
      paymentSplits: sale.payments?.map((p) => ({ mode: p.mode, amount: p.amount })),
    },
    watermarkEnabled: db.settings.watermarkEnabled !== false,
  };
}

export function purchaseToInvoiceProps(purchase: Purchase, db: AppDatabase): InvoiceDocumentProps {
  const dealer = db.suppliers.find(
    (s) => s.id === (purchase.supplierId || purchase.dealerId)
  );
  const isNonGst = purchase.purchaseType === "NON_GST";

  const items = purchase.items.map((it, idx) => {
    const qty = it.qty || 1;
    const taxableAmount = it.taxableAmount || (it.costPrice * qty);
    const totalAmount = it.totalAmount || (it.costPrice * qty);
    const gstRate = isNonGst ? 0 : (it.gstRate || it.gst || 0);

    return {
      srNo: idx + 1,
      name: it.name,
      hsnSac: it.hsnSac || "8517",
      imeis: it.imeis && it.imeis.length ? it.imeis : (it.imei ? [it.imei] : []),
      imei: it.imei,
      qty,
      unit: it.unit || "NOS",
      rateExclTax: it.rateExcludingTax || (taxableAmount / qty),
      rateInclTax: it.rateIncludingTax || (totalAmount / qty),
      discountPct: it.discountPct || 0,
      discountAmount: it.discountAmount || 0,
      taxableAmount,
      gstRate,
      cgstPct: isNonGst ? 0 : (it.cgstPct || (gstRate / 2)),
      cgstAmount: isNonGst ? 0 : (it.cgstAmount || 0),
      sgstPct: isNonGst ? 0 : (it.sgstPct || (gstRate / 2)),
      sgstAmount: isNonGst ? 0 : (it.sgstAmount || 0),
      igstPct: isNonGst ? 0 : (it.igstPct || 0),
      igstAmount: isNonGst ? 0 : (it.igstAmount || 0),
      totalAmount,
    };
  });

  const taxableValue = purchase.taxableValue || (purchase.total - (purchase.tax || 0));
  const cgstAmount = isNonGst ? 0 : (purchase.cgstAmount || ((purchase.tax || 0) / 2));
  const sgstAmount = isNonGst ? 0 : (purchase.sgstAmount || ((purchase.tax || 0) / 2));
  const igstAmount = isNonGst ? 0 : (purchase.igstAmount || 0);
  const due = purchase.dueAmount !== undefined
    ? purchase.dueAmount
    : Math.max(0, purchase.total - purchase.paid);

  return {
    type: isNonGst ? "NON_GST_PURCHASE" : "GST_PURCHASE",
    settings: db.settings,
    copyType: "ORIGINAL FOR RECIPIENT",
    invoiceNo: purchase.invoiceNo,
    invoiceDate: purchase.date,
    originalInvoiceNo: purchase.originalInvoiceNo,
    originalInvoiceDate: purchase.originalInvoiceDate,
    poNumber: purchase.poNumber,
    ewayBillNo: purchase.ewayBillNo,
    deliveryNoteNo: purchase.deliveryNoteNo,
    deliveryNoteDate: purchase.deliveryNoteDate,
    dispatchDocNo: purchase.dispatchDocNo,
    dispatchDocDate: purchase.dispatchDocDate,
    dispatchedThrough: purchase.dispatchedThrough,
    destination: purchase.destination,
    termsOfDelivery: purchase.termsOfDelivery || "Door Delivery",
    paymentTerms: purchase.paymentTerms || "30 Days",
    dueDate: purchase.dueDate,
    placeOfSupply: purchase.placeOfSupply || "Madhya Pradesh",
    stateCode: purchase.stateCode || "23",
    remarks: purchase.otherReferences,
    party: {
      name: dealer?.name || "Dealer / Distributor",
      phone: dealer?.phone || "",
      mobile: dealer?.phone || "",
      email: dealer?.email || "",
      address: dealer?.address || "",
      city: dealer?.city || "Harda",
      state: dealer?.state || "Madhya Pradesh",
      stateCode: dealer?.stateCode || "23",
      gstin: dealer?.gstin || "",
      isUnregistered: !dealer?.gstin,
      contactPerson: dealer?.contactPerson || "",
    },
    items,
    totals: {
      totalQty: items.reduce((s, i) => s + i.qty, 0),
      grossAmount: purchase.subtotal || purchase.total,
      subtotal: purchase.subtotal || purchase.total,
      discount: purchase.discount || 0,
      taxableValue,
      cgstAmount,
      sgstAmount,
      igstAmount,
      otherCharges: purchase.otherCharges || 0,
      tdsAmount: purchase.tdsAmount || 0,
      roundOff: purchase.roundOff || 0,
      grandTotal: purchase.total,
      amountInWords: numberToIndianWords(purchase.total),
    },
    payment: {
      mode: purchase.mode || "Bank",
      paid: purchase.paid,
      due,
    },
    watermarkEnabled: db.settings.watermarkEnabled !== false,
  };
}

export function creditNoteToInvoiceProps(creditNote: CreditNote, db: AppDatabase): InvoiceDocumentProps {
  const customer = db.customers.find((c) => c.id === creditNote.customerId);
  const isNonGst = creditNote.invoiceType === "NON_GST" || (creditNote.cgst === 0 && creditNote.sgst === 0 && creditNote.igst === 0);

  const items = (creditNote.items || []).map((it, idx) => {
    const totalAmount = it.totalAmount ?? (it.rate * it.qty);
    const taxableAmount = it.taxableAmount ?? (it.rate * it.qty);
    const gstRate = isNonGst ? 0 : (it.gstRate || 0);

    return {
      srNo: idx + 1,
      name: it.productName || "Item",
      hsnSac: "8517",
      imeis: it.imei ? [it.imei] : [],
      imei: it.imei,
      qty: it.qty,
      unit: "NOS",
      rateExclTax: taxableAmount / (it.qty || 1),
      rateInclTax: it.rate,
      taxableAmount,
      gstRate,
      cgstPct: isNonGst ? 0 : (it.cgstPct || gstRate / 2),
      cgstAmount: isNonGst ? 0 : (it.cgstAmount || 0),
      sgstPct: isNonGst ? 0 : (it.sgstPct || gstRate / 2),
      sgstAmount: isNonGst ? 0 : (it.sgstAmount || 0),
      igstPct: isNonGst ? 0 : (it.igstPct || 0),
      igstAmount: isNonGst ? 0 : (it.igstAmount || 0),
      totalAmount,
    };
  });

  return {
    type: "CREDIT_NOTE",
    settings: db.settings,
    templateId: "template_modern",
    copyType: "ORIGINAL FOR RECIPIENT",
    invoiceNo: creditNote.noteNumber,
    invoiceDate: creditNote.date,
    originalInvoiceNo: creditNote.originalInvoiceNo,
    originalInvoiceDate: creditNote.originalInvoiceDate,
    placeOfSupply: db.settings.state || "Madhya Pradesh",
    stateCode: db.settings.stateCode || "23",
    remarks: creditNote.reason ? `Reason: ${creditNote.reason}${creditNote.notes ? ` (${creditNote.notes})` : ""}` : undefined,
    party: {
      name: customer?.name || "Cash Customer",
      phone: customer?.phone && customer.phone !== "—" ? customer.phone : "",
      mobile: customer?.phone && customer.phone !== "—" ? customer.phone : "",
      address: customer?.address || "",
      city: customer?.city || db.settings.city || "Harda",
      state: customer?.state || db.settings.state || "Madhya Pradesh",
      stateCode: customer?.stateCode || db.settings.stateCode || "23",
      gstin: customer?.gstin || "",
      isUnregistered: !customer?.gstin,
    },
    items: items.length > 0 ? items : [
      {
        srNo: 1,
        name: `Credit Note: ${creditNote.reason}`,
        qty: 1,
        unit: "NOS",
        rateExclTax: creditNote.subtotal,
        rateInclTax: creditNote.total,
        taxableAmount: creditNote.subtotal,
        gstRate: 0,
        totalAmount: creditNote.total,
      },
    ],
    totals: {
      totalQty: items.length > 0 ? items.reduce((s, i) => s + i.qty, 0) : 1,
      grossAmount: creditNote.subtotal,
      subtotal: creditNote.subtotal,
      taxableValue: creditNote.subtotal,
      cgstAmount: creditNote.cgst || 0,
      sgstAmount: creditNote.sgst || 0,
      igstAmount: creditNote.igst || 0,
      grandTotal: creditNote.total,
      amountInWords: numberToIndianWords(creditNote.total),
    },
    payment: {
      mode: creditNote.adjustmentType === "REFUND" ? "Refund" : creditNote.adjustmentType === "INVOICE_ADJUSTMENT" ? "Invoice Adjustment" : "Customer Credit Balance",
      paid: (creditNote.appliedAmount ?? 0) + (creditNote.refundedAmount ?? 0),
      due: creditNote.remainingAmount ?? 0,
    },
    watermarkEnabled: db.settings.watermarkEnabled !== false,
  };
}

export function debitNoteToInvoiceProps(debitNote: DebitNote, db: AppDatabase): InvoiceDocumentProps {
  const dealer = db.suppliers.find(
    (s) => s.id === (debitNote.dealerId || debitNote.supplierId)
  );
  const isNonGst = debitNote.invoiceType === "NON_GST" || (debitNote.cgst === 0 && debitNote.sgst === 0 && debitNote.igst === 0);
  const total = debitNote.total ?? debitNote.amount;
  const subtotal = debitNote.subtotal ?? debitNote.amount;

  const items = (debitNote.items || []).map((it, idx) => {
    const totalAmount = it.totalAmount ?? (it.rate * it.qty);
    const taxableAmount = it.taxableAmount ?? (it.rate * it.qty);
    const gstRate = isNonGst ? 0 : (it.gstRate || 0);

    return {
      srNo: idx + 1,
      name: it.productName || "Item",
      hsnSac: "8517",
      imeis: it.imei ? [it.imei] : [],
      imei: it.imei,
      qty: it.qty,
      unit: "NOS",
      rateExclTax: taxableAmount / (it.qty || 1),
      rateInclTax: it.rate,
      taxableAmount,
      gstRate,
      cgstPct: isNonGst ? 0 : (it.cgstPct || gstRate / 2),
      cgstAmount: isNonGst ? 0 : (it.cgstAmount || 0),
      sgstPct: isNonGst ? 0 : (it.sgstPct || gstRate / 2),
      sgstAmount: isNonGst ? 0 : (it.sgstAmount || 0),
      igstPct: isNonGst ? 0 : (it.igstPct || 0),
      igstAmount: isNonGst ? 0 : (it.igstAmount || 0),
      totalAmount,
    };
  });

  return {
    type: "DEBIT_NOTE",
    settings: db.settings,
    copyType: "ORIGINAL FOR RECIPIENT",
    invoiceNo: debitNote.noteNumber,
    invoiceDate: debitNote.date,
    originalInvoiceNo: debitNote.originalInvoiceNo,
    originalInvoiceDate: debitNote.originalInvoiceDate,
    placeOfSupply: dealer?.state || db.settings.state || "Madhya Pradesh",
    stateCode: dealer?.stateCode || db.settings.stateCode || "23",
    remarks: debitNote.notes ? `${debitNote.reason}: ${debitNote.notes}` : debitNote.reason,
    party: {
      name: dealer?.name || "Dealer / Distributor",
      phone: dealer?.phone || "",
      mobile: dealer?.phone || "",
      address: dealer?.address || "",
      city: dealer?.city || "Harda",
      state: dealer?.state || "Madhya Pradesh",
      stateCode: dealer?.stateCode || "23",
      gstin: dealer?.gstin || "",
      isUnregistered: !dealer?.gstin,
    },
    items: items.length > 0 ? items : [
      {
        srNo: 1,
        name: `Debit Note: ${debitNote.reason}${debitNote.section ? ` (${debitNote.section})` : ""}`,
        hsnSac: "9983",
        qty: 1,
        unit: "NOS",
        rateExclTax: subtotal,
        rateInclTax: total,
        taxableAmount: debitNote.taxableValue || subtotal,
        gstRate: debitNote.ratePct || debitNote.tdsRate || 0,
        totalAmount: total,
      },
    ],
    totals: {
      totalQty: items.length > 0 ? items.reduce((s, i) => s + i.qty, 0) : 1,
      subtotal,
      taxableValue: debitNote.taxableValue || subtotal,
      cgstAmount: debitNote.cgst || 0,
      sgstAmount: debitNote.sgst || 0,
      igstAmount: debitNote.igst || 0,
      grandTotal: total,
      tdsAmount: debitNote.tdsAmount || 0,
      amountInWords: numberToIndianWords(total),
    },
    payment: {
      mode: debitNote.adjustmentType === "REFUND" ? "Refund Inflow" : debitNote.adjustmentType === "PURCHASE_ADJUSTMENT" ? "Purchase Bill Adjustment" : "Dealer Credit Balance",
      paid: (debitNote.appliedAmount ?? 0) + (debitNote.refundedAmount ?? 0),
      due: debitNote.remainingAmount ?? 0,
    },
    watermarkEnabled: db.settings.watermarkEnabled !== false,
  };
}

export function returnDocToInvoiceProps(ret: ReturnDoc, db: AppDatabase): InvoiceDocumentProps {
  const isSaleReturn = ret.type === "sale";
  const customer = isSaleReturn ? db.customers.find((c) => c.id === ret.partyId) : undefined;
  const dealer = !isSaleReturn ? db.suppliers.find((s) => s.id === ret.partyId) : undefined;

  const items = ret.items.map((it, idx) => ({
    srNo: idx + 1,
    name: it.name,
    hsnSac: it.hsnSac || "8517",
    imeis: it.imeis && it.imeis.length ? it.imeis : (it.imei ? [it.imei] : []),
    imei: it.imei,
    qty: it.qty,
    unit: it.unit || "NOS",
    rateExclTax: it.price,
    rateInclTax: it.price,
    taxableAmount: it.price * it.qty,
    totalAmount: it.price * it.qty,
    gstRate: 0,
  }));

  const partyName = isSaleReturn ? (customer?.name || "Customer") : (dealer?.name || "Dealer");
  const partyPhone = isSaleReturn ? customer?.phone : dealer?.phone;
  const partyAddress = isSaleReturn ? customer?.address : dealer?.address;
  const partyGstin = isSaleReturn ? customer?.gstin : dealer?.gstin;

  return {
    type: isSaleReturn ? "SALE_RETURN" : "PURCHASE_RETURN",
    settings: db.settings,
    copyType: "ORIGINAL FOR RECIPIENT",
    invoiceNo: ret.refNo,
    invoiceDate: ret.date,
    originalInvoiceNo: ret.refId || ret.refNo,
    placeOfSupply: db.settings.state || "Madhya Pradesh",
    stateCode: db.settings.stateCode || "23",
    remarks: `Reason: ${ret.reason} (Settlement: ${ret.mode})`,
    party: {
      name: partyName,
      phone: partyPhone || "",
      mobile: partyPhone || "",
      address: partyAddress || "",
      gstin: partyGstin || "",
      isUnregistered: !partyGstin,
    },
    items,
    totals: {
      totalQty: items.reduce((s, i) => s + i.qty, 0),
      subtotal: ret.amount,
      taxableValue: ret.amount,
      grandTotal: ret.amount,
      amountInWords: numberToIndianWords(ret.amount),
    },
    payment: {
      mode: ret.mode === "Credit Note" ? "Credit Note" : "Refund",
      paid: ret.amount,
      due: 0,
    },
    watermarkEnabled: db.settings.watermarkEnabled !== false,
  };
}
