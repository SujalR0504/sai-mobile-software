import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHead,
  Row,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import {
  PAYMENT_MODES,
  type LineItem,
  type PaymentEntry,
  type PaymentMode,
  type Purchase,
  type DebitNote,
  type Supplier,
} from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { purchaseToInvoiceProps, debitNoteToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { ImeiScannerModal } from "@/components/ImeiScannerModal";
import { QuickProductModal } from "@/components/QuickProductModal";

export const Route = createFileRoute("/purchase")({
  head: () => ({
    meta: [{ title: "NEW PURCHASE - DEALER BILL — Mobile Store ERP" }],
  }),
  component: PurchasePage,
});

export function PurchasePage() {
  const { db, recordPurchase, addSupplier, refreshFromBackend } = useStore();
  const [activeTab, setActiveTab] = useState<"BILLS" | "NEW_PURCHASE" | "DEBIT_NOTES">("BILLS");
  const [query, setQuery] = useState("");
  const [selectedBill, setSelectedBill] = useState<Purchase | null>(null);
  const [selectedPurchaseInvoice, setSelectedPurchaseInvoice] = useState<Purchase | null>(null);
  const [selectedDebitNoteInvoice, setSelectedDebitNoteInvoice] = useState<DebitNote | null>(null);

  // Inward IMEI Scanner & Payment Lifecycle State
  const [activeScannerProduct, setActiveScannerProduct] = useState<{ id: string; name: string; qty: number } | null>(null);
  const [quickProductModalOpen, setQuickProductModalOpen] = useState(false);
  const [billPayments, setBillPayments] = useState<PaymentEntry[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [paymentBill, setPaymentBill] = useState<Purchase | null>(null);
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payDate, setPayDate] = useState<string>(todayISO());
  const [payMode, setPayMode] = useState<PaymentMode>("Bank");
  const [payReferenceNo, setPayReferenceNo] = useState<string>("");
  const [payChequeNo, setPayChequeNo] = useState<string>("");
  const [payBankName, setPayBankName] = useState<string>("");
  const [payRemarks, setPayRemarks] = useState<string>("");
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);
  const [paymentError, setPaymentError] = useState<string>("");

  const loadPaymentsForBill = async (billId: string) => {
    setLoadingPayments(true);
    try {
      const res = await fetch(`/api/purchases/${billId}/payments`);
      if (res.ok) {
        const data = await res.json();
        setBillPayments(data);
      }
    } catch (e) {
      console.error("Failed to load payments", e);
    } finally {
      setLoadingPayments(false);
    }
  };

  useEffect(() => {
    if (selectedBill) {
      loadPaymentsForBill(selectedBill.id);
    } else {
      setBillPayments([]);
    }
  }, [selectedBill]);

  const openAddPaymentModal = (bill: Purchase) => {
    const outstanding = bill.dueAmount !== undefined ? bill.dueAmount : Math.max(0, bill.total - bill.paid);
    setPaymentBill(bill);
    setPayAmount(outstanding);
    setPayDate(todayISO());
    setPayMode("Bank");
    setPayReferenceNo("");
    setPayChequeNo("");
    setPayBankName("");
    setPayRemarks("");
    setPaymentError("");
    setPayModalOpen(true);
  };

  const handleSubmitPurchasePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentBill) return;
    const outstanding = paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid);
    if (payAmount <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }
    if (payAmount > outstanding) {
      setPaymentError(`Payment amount cannot exceed outstanding balance of ₹${outstanding.toLocaleString('en-IN')}.`);
      return;
    }

    setIsRecordingPayment(true);
    setPaymentError("");
    try {
      const res = await fetch(`/api/purchases/${paymentBill.id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(payAmount),
          date: payDate,
          mode: payMode,
          referenceNo: payReferenceNo.trim() || undefined,
          chequeNo: payChequeNo.trim() || undefined,
          bankName: payBankName.trim() || undefined,
          remarks: payRemarks.trim() || undefined,
          user_name: "Admin",
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to record payment");
      }

      const data = await res.json();
      await refreshFromBackend();
      if (selectedBill && selectedBill.id === paymentBill.id) {
        setSelectedBill(data.purchase);
        loadPaymentsForBill(paymentBill.id);
      }
      setPayModalOpen(false);
    } catch (err: any) {
      setPaymentError(err.message || "Error recording payment.");
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleDeletePurchasePayment = async (paymentId: string) => {
    if (!selectedBill) return;
    if (!confirm("Are you sure you want to delete this payment record? This will reverse the ledger entry.")) return;

    try {
      const res = await fetch(`/api/purchases/${selectedBill.id}/payments/${paymentId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        const data = await res.json();
        await refreshFromBackend();
        setSelectedBill(data.purchase);
        loadPaymentsForBill(selectedBill.id);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to delete payment");
      }
    } catch {
      alert("Network error deleting payment");
    }
  };

  // Form State: Mode
  const [purchaseType, setPurchaseType] = useState<"GST" | "NON_GST">("GST");

  // Dealer Details
  const [selectedDealerId, setSelectedDealerId] = useState<string>(db.suppliers[0]?.id || "");
  const [newDealerModalOpen, setNewDealerModalOpen] = useState(false);
  const [newDealerForm, setNewDealerForm] = useState({
    name: "",
    company: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    city: "Harda",
    state: "Madhya Pradesh",
    stateCode: "23",
    contactPerson: "",
  });

  // Invoice Metadata
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());
  const [originalInvoiceNo, setOriginalInvoiceNo] = useState("");
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [poNumber, setPoNumber] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [deliveryNoteDate, setDeliveryNoteDate] = useState("");
  const [dispatchDocNo, setDispatchDocNo] = useState("");
  const [dispatchDocDate, setDispatchDocDate] = useState("");
  const [dispatchedThrough, setDispatchedThrough] = useState("");
  const [destination, setDestination] = useState("");
  const [termsOfDelivery, setTermsOfDelivery] = useState("Door Delivery");
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [dueDate, setDueDate] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("Madhya Pradesh");
  const [stateCode, setStateCode] = useState("23");
  const [receivedBy, setReceivedBy] = useState("Store Manager");
  const [debitNoteRef, setDebitNoteRef] = useState("");
  const [creditNoteRef, setCreditNoteRef] = useState("");
  const [otherReferences, setOtherReferences] = useState("");

  // Line items
  const [items, setItems] = useState<LineItem[]>([]);
  const [imeisByProduct, setImeisByProduct] = useState<Record<string, string[]>>({});
  const [activeImeiInput, setActiveImeiInput] = useState<{ productId: string; text: string }>({ productId: "", text: "" });

  // Totals & Financials
  const [otherCharges, setOtherCharges] = useState(0);
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [tdsSection, setTdsSection] = useState("TDS 194R Payable @ 10%");
  const [tdsRate, setTdsRate] = useState(10);
  const [roundOff, setRoundOff] = useState(0);
  const [paid, setPaid] = useState(0);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("Bank");
  const [attachments, setAttachments] = useState<Array<{ fileName: string; fileType: string; fileSize?: number; fileData: string }>>([]);

  // OCR Extraction State
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Debit Note Modal State
  const [debitNoteModalOpen, setDebitNoteModalOpen] = useState(false);
  const [debitNoteForm, setDebitNoteForm] = useState({
    dealerId: db.suppliers[0]?.id || "",
    noteNumber: "",
    date: todayISO(),
    reason: "TDS 194R Payable @ 10%",
    amount: 3664,
    originalInvoiceNo: "2627TTRM/695",
    tdsApplicable: true,
    tdsSection: "TDS 194R",
    tdsRate: 10,
    remarks: "TDS 194R on Dealer Sales Promotion / Incentives",
  });

  const selectedDealer = useMemo(() => {
    return db.suppliers.find((s) => s.id === selectedDealerId);
  }, [db.suppliers, selectedDealerId]);

  const dealerMap = useMemo(() => {
    return new Map(db.suppliers.map((s) => [s.id, s]));
  }, [db.suppliers]);

  // When dealer changes, auto-fill State Code and Place of Supply
  const handleSelectDealer = (id: string) => {
    setSelectedDealerId(id);
    const d = db.suppliers.find((s) => s.id === id);
    if (d) {
      const sc = d.stateCode || (d.gstin ? d.gstin.substring(0, 2) : "23");
      setStateCode(sc);
      setPlaceOfSupply(sc === "23" ? "Madhya Pradesh" : d.state || "Other State");
    }
  };

  const isIntrastate = stateCode === "23";

  // Financial calculations
  const calculatedItems = useMemo(() => {
    return items.map((item) => {
      const qty = Math.max(1, item.qty || 1);
      const gstRate = purchaseType === "NON_GST" ? 0 : (item.gstRate !== undefined ? item.gstRate : item.gst || 18);
      let rateExcl = item.rateExcludingTax !== undefined ? item.rateExcludingTax : item.price;
      let rateIncl = item.rateIncludingTax;

      if (rateExcl === undefined && rateIncl !== undefined) {
        rateExcl = gstRate > 0 ? rateIncl / (1 + gstRate / 100) : rateIncl;
      } else if (rateIncl === undefined && rateExcl !== undefined) {
        rateIncl = gstRate > 0 ? rateExcl * (1 + gstRate / 100) : rateExcl;
      }

      rateExcl = Math.round(rateExcl * 100) / 100;
      rateIncl = Math.round((rateIncl || rateExcl) * 100) / 100;

      const gross = rateExcl * qty;
      const discountPct = item.discountPct || 0;
      const discountAmount = item.discountAmount || Math.round((gross * discountPct) / 100 * 100) / 100;
      const taxable = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);

      let cgstPct = 0;
      let cgstAmount = 0;
      let sgstPct = 0;
      let sgstAmount = 0;
      let igstPct = 0;
      let igstAmount = 0;

      if (purchaseType === "GST" && gstRate > 0) {
        if (isIntrastate) {
          cgstPct = gstRate / 2;
          sgstPct = gstRate / 2;
          cgstAmount = Math.round(taxable * (cgstPct / 100) * 100) / 100;
          sgstAmount = Math.round(taxable * (sgstPct / 100) * 100) / 100;
        } else {
          igstPct = gstRate;
          igstAmount = Math.round(taxable * (igstPct / 100) * 100) / 100;
        }
      }

      const totalAmount = Math.round((taxable + cgstAmount + sgstAmount + igstAmount) * 100) / 100;

      return {
        ...item,
        qty,
        rateExcludingTax: rateExcl,
        rateIncludingTax: rateIncl,
        discountPct,
        discountAmount,
        taxableAmount: taxable,
        gstRate,
        cgstPct,
        cgstAmount,
        sgstPct,
        sgstAmount,
        igstPct,
        igstAmount,
        totalAmount,
      };
    });
  }, [items, purchaseType, isIntrastate]);

  const totalTaxable = useMemo(() => {
    return calculatedItems.reduce((sum, i) => sum + (i.taxableAmount || 0), 0);
  }, [calculatedItems]);

  const totalCgst = useMemo(() => {
    return calculatedItems.reduce((sum, i) => sum + (i.cgstAmount || 0), 0);
  }, [calculatedItems]);

  const totalSgst = useMemo(() => {
    return calculatedItems.reduce((sum, i) => sum + (i.sgstAmount || 0), 0);
  }, [calculatedItems]);

  const totalIgst = useMemo(() => {
    return calculatedItems.reduce((sum, i) => sum + (i.igstAmount || 0), 0);
  }, [calculatedItems]);

  const totalTax = totalCgst + totalSgst + totalIgst;

  const tdsAmount = useMemo(() => {
    if (!tdsApplicable) return 0;
    return Math.round(((totalTaxable * tdsRate) / 100) * 100) / 100;
  }, [tdsApplicable, totalTaxable, tdsRate]);

  const grandTotal = useMemo(() => {
    const raw = totalTaxable + totalTax + otherCharges - tdsAmount + roundOff;
    return Math.max(0, Math.round(raw * 100) / 100);
  }, [totalTaxable, totalTax, otherCharges, tdsAmount, roundOff]);

  const dueAmount = useMemo(() => {
    return Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
  }, [grandTotal, paid]);

  // Add Item to table
  const handleAddProduct = (prodId: string) => {
    const prod = db.products.find((p) => p.id === prodId);
    if (!prod) return;

    const gstRate = purchaseType === "NON_GST" ? 0 : prod.gst || 18;
    const rateExcl = prod.purchasePrice || 1000;
    const rateIncl = gstRate > 0 ? Math.round(rateExcl * (1 + gstRate / 100) * 100) / 100 : rateExcl;

    setItems((curr) => [
      ...curr,
      {
        productId: prod.id,
        name: prod.name,
        hsnSac: prod.hsn || "85171300",
        qty: 1,
        unit: "pcs",
        price: rateExcl,
        costPrice: rateExcl,
        rateExcludingTax: rateExcl,
        rateIncludingTax: rateIncl,
        discountPct: 0,
        discountAmount: 0,
        taxableAmount: rateExcl,
        gst: gstRate,
        gstRate,
        cgstPct: isIntrastate ? gstRate / 2 : 0,
        cgstAmount: isIntrastate ? Math.round(rateExcl * (gstRate / 200) * 100) / 100 : 0,
        sgstPct: isIntrastate ? gstRate / 2 : 0,
        sgstAmount: isIntrastate ? Math.round(rateExcl * (gstRate / 200) * 100) / 100 : 0,
        igstPct: !isIntrastate ? gstRate : 0,
        igstAmount: !isIntrastate ? Math.round(rateExcl * (gstRate / 100) * 100) / 100 : 0,
        totalAmount: rateIncl,
      },
    ]);
  };

  const updateItem = (index: number, patch: Partial<LineItem>) => {
    setItems((curr) => {
      const copy = [...curr];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });
  };

  const removeItem = (index: number) => {
    setItems((curr) => curr.filter((_, i) => i !== index));
  };

  // Add IMEI to item with in-bill and inventory duplicate checks
  const handleAddImei = (productId: string, imei: string): boolean | { error?: string } => {
    const trimmed = imei.trim();
    if (!trimmed) {
      setErrorMessage("IMEI cannot be empty.");
      return { error: "IMEI cannot be empty." };
    }

    if (!/^\d{14,16}$/.test(trimmed)) {
      const err = `Invalid IMEI '${trimmed}'. Standard mobile phone IMEIs contain 14–16 digits.`;
      setErrorMessage(err);
      return { error: err };
    }

    // Check duplicate in bill
    const all = Object.values(imeisByProduct).flat();
    if (all.includes(trimmed)) {
      const err = `IMEI ${trimmed} is already entered in this bill.`;
      setErrorMessage(err);
      return { error: err };
    }

    // Check duplicate in existing database inventory
    const existingUnit = db.units.find((u) => u.imei1 === trimmed || u.imei2 === trimmed);
    if (existingUnit) {
      const err = "IMEI already exists in inventory.";
      setErrorMessage(err);
      return { error: err };
    }

    // Check quantity limit
    const item = items.find((i) => i.productId === productId);
    const currentImeis = imeisByProduct[productId] || [];
    if (item && currentImeis.length >= item.qty) {
      const err = `Required quantity of ${item.qty} IMEIs already reached.`;
      setErrorMessage(err);
      return { error: err };
    }

    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: [...(prev[productId] || []), trimmed],
    }));
    setActiveImeiInput({ productId: "", text: "" });
    setErrorMessage("");
    return true;
  };

  const handleRemoveImei = (productId: string, imeiToRemove: string) => {
    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: (prev[productId] || []).filter((im) => im !== imeiToRemove),
    }));
  };

  // OCR Invoice Extraction Execution
  const triggerExtraction = async (payload: { text?: string; fileName?: string; mimeType?: string; base64?: string }) => {
    setExtracting(true);
    setErrorMessage("");
    try {
      const res = await fetch("/api/purchases/extract-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setExtractionResult(data);
        setOcrModalOpen(true);
      } else {
        setErrorMessage("Failed to extract invoice data. You can enter details manually.");
      }
    } catch {
      setErrorMessage("Error connecting to extraction service.");
    } finally {
      setExtracting(false);
    }
  };

  // Apply OCR Result to form
  const applyExtractionToBill = () => {
    if (!extractionResult) return;
    const { dealer, invoice, items: extItems, totals } = extractionResult;

    // Dealer
    if (dealer.id) {
      setSelectedDealerId(dealer.id);
    } else if (dealer.name) {
      // Find by GSTIN or name
      const found = db.suppliers.find(
        (s) => s.gstin === dealer.gstin || s.name.toLowerCase() === dealer.name.toLowerCase()
      );
      if (found) {
        setSelectedDealerId(found.id);
      } else {
        // Auto create dealer
        const created = addSupplier({
          name: dealer.name,
          company: dealer.name,
          gstin: dealer.gstin,
          phone: "9876500000",
          address: dealer.address || "Main Road",
          city: "Harda",
          state: dealer.state || "Madhya Pradesh",
          stateCode: dealer.stateCode || "23",
        });
        setSelectedDealerId(created.id);
      }
    }

    // Invoice Metadata
    if (invoice.invoiceNo) setInvoiceNo(invoice.invoiceNo);
    if (invoice.date) setInvoiceDate(invoice.date);
    if (invoice.originalInvoiceNo) setOriginalInvoiceNo(invoice.originalInvoiceNo);
    if (invoice.originalInvoiceDate) setOriginalInvoiceDate(invoice.originalInvoiceDate);
    if (invoice.placeOfSupply) setPlaceOfSupply(invoice.placeOfSupply);
    if (invoice.stateCode) setStateCode(invoice.stateCode);
    if (invoice.termsOfDelivery) setTermsOfDelivery(invoice.termsOfDelivery);

    // Items & IMEIs
    const newItems: LineItem[] = [];
    const newImeis: Record<string, string[]> = {};

    extItems.forEach((ei: any) => {
      let prodId = ei.matchedProductId;
      // If not matched, fallback or find closest
      if (!prodId) {
        const found = db.products.find((p) => p.name.toLowerCase().includes("oppo") || p.name.toLowerCase().includes("realme"));
        prodId = found?.id || db.products[0]?.id || "p1";
      }

      newItems.push({
        productId: prodId,
        name: ei.name,
        hsnSac: ei.hsnSac || "85171300",
        qty: ei.qty,
        unit: ei.unit || "pcs",
        price: ei.rateExcludingTax,
        costPrice: ei.rateExcludingTax,
        rateExcludingTax: ei.rateExcludingTax,
        rateIncludingTax: ei.rateIncludingTax,
        discountPct: ei.discountPct || 0,
        discountAmount: ei.discountAmount || 0,
        taxableAmount: ei.taxableAmount,
        gst: ei.gstRate,
        gstRate: ei.gstRate,
        cgstPct: ei.cgstPct,
        cgstAmount: ei.cgstAmount,
        sgstPct: ei.sgstPct,
        sgstAmount: ei.sgstAmount,
        igstPct: ei.igstPct,
        igstAmount: ei.igstAmount,
        totalAmount: ei.totalAmount,
      });

      if (ei.imeis && ei.imeis.length > 0) {
        newImeis[prodId] = ei.imeis;
      }
    });

    setItems(newItems);
    setImeisByProduct(newImeis);
    setOcrModalOpen(false);
  };

  // Handle Bill Submission
  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (!selectedDealerId) {
      setErrorMessage("Please select a Dealer.");
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Please add at least one product to the purchase bill.");
      return;
    }

    // Validate IMEIs for tracked products
    for (const item of calculatedItems) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod?.tracked) {
        const entered = (imeisByProduct[item.productId] || []).length;
        if (entered !== item.qty) {
          setErrorMessage(
            `Product '${item.name}' requires ${item.qty} IMEI(s), but ${entered} entered. Please provide all IMEIs.`
          );
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const created = await recordPurchase({
        purchaseType,
        dealerId: selectedDealerId,
        supplierId: selectedDealerId,
        invoiceNo: invoiceNo.trim() || undefined,
        date: invoiceDate,
        originalInvoiceNo: originalInvoiceNo || undefined,
        originalInvoiceDate: originalInvoiceDate || undefined,
        referenceNo: referenceNo || undefined,
        poNumber: poNumber || undefined,
        ewayBillNo: ewayBillNo || undefined,
        deliveryNoteNo: deliveryNoteNo || undefined,
        deliveryNoteDate: deliveryNoteDate || undefined,
        dispatchDocNo: dispatchDocNo || undefined,
        dispatchDocDate: dispatchDocDate || undefined,
        dispatchedThrough: dispatchedThrough || undefined,
        destination: destination || undefined,
        termsOfDelivery: termsOfDelivery || undefined,
        paymentTerms: paymentTerms || undefined,
        dueDate: dueDate || undefined,
        placeOfSupply,
        stateCode,
        receivedBy,
        debitNoteRef: debitNoteRef || undefined,
        creditNoteRef: creditNoteRef || undefined,
        otherReferences: otherReferences || undefined,
        items: calculatedItems,
        imeis: imeisByProduct,
        otherCharges,
        tdsApplicable,
        tdsSection: tdsApplicable ? tdsSection : undefined,
        tdsRate: tdsApplicable ? tdsRate : 0,
        tdsAmount,
        roundOff,
        paid: Number(paid) || 0,
        mode: paymentMode,
        attachments,
      });

      // Reset form
      setItems([]);
      setImeisByProduct({});
      setInvoiceNo("");
      setPaid(0);
      setOtherCharges(0);
      setTdsApplicable(false);
      setRoundOff(0);
      setAttachments([]);
      setActiveTab("BILLS");
      if (created) {
        setSelectedPurchaseInvoice(created);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to record purchase bill.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Inline Dealer Creation
  const handleCreateNewDealer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDealerForm.name || !newDealerForm.phone) return;
    const created = addSupplier(newDealerForm);
    setSelectedDealerId(created.id);
    setNewDealerModalOpen(false);
    setNewDealerForm({
      name: "",
      company: "",
      phone: "",
      email: "",
      gstin: "",
      address: "",
      city: "Harda",
      state: "Madhya Pradesh",
      stateCode: "23",
      contactPerson: "",
    });
  };

  // Submit Debit Note
  const handleSubmitDebitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/debit-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(debitNoteForm),
      });
      if (res.ok) {
        setDebitNoteModalOpen(false);
        await refreshFromBackend();
      }
    } catch {
      alert("Failed to create debit note");
    }
  };

  const filteredPurchases = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.purchases.filter((p) => {
      const dealer = dealerMap.get(p.supplierId || p.dealerId || "");
      if (!q) return true;
      return (
        p.invoiceNo.toLowerCase().includes(q) ||
        (dealer && dealer.name.toLowerCase().includes(q)) ||
        (dealer && dealer.company && dealer.company.toLowerCase().includes(q))
      );
    });
  }, [db.purchases, query, dealerMap]);

  const totalOutstandingToDealers = useMemo(() => {
    return db.purchases.reduce((sum, p) => sum + (p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.total - p.paid)), 0);
  }, [db.purchases]);

  return (
    <div className="space-y-5 p-4 md:p-6 max-w-7xl mx-auto">
      {/* Page Header */}
      <PageHead
        title="NEW PURCHASE - DEALER BILL"
        sub="Inward mobile phones, tablets and accessories with GST/Non-GST calculation, OCR auto-extraction, serial IMEI tracking, and Dealer ledger updates."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={activeTab === "NEW_PURCHASE" ? "primary" : "outline"}
              onClick={() => setActiveTab("NEW_PURCHASE")}
            >
              + New Purchase Bill
            </Button>
            <Button
              variant={activeTab === "BILLS" ? "primary" : "outline"}
              onClick={() => setActiveTab("BILLS")}
            >
              Purchase Bills ({db.purchases.length})
            </Button>
            <Button
              variant={activeTab === "DEBIT_NOTES" ? "primary" : "outline"}
              onClick={() => setActiveTab("DEBIT_NOTES")}
            >
              Debit Notes & TDS ({db.debitNotes?.length || 0})
            </Button>
          </div>
        }
      />

      {/* KPI Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total Inward Bills" value={String(db.purchases.length)} tone="info" />
        <Stat
          label="Total Purchases"
          value={inr(db.purchases.reduce((sum, p) => sum + p.total, 0))}
          tone="neutral"
        />
        <Stat
          label="Paid to Dealers"
          value={inr(db.purchases.reduce((sum, p) => sum + p.paid, 0))}
          tone="success"
        />
        <Stat
          label="Outstanding Payable"
          value={inr(totalOutstandingToDealers)}
          tone={totalOutstandingToDealers > 0 ? "danger" : "success"}
        />
      </div>

      {/* TAB 1: NEW PURCHASE - DEALER BILL */}
      {activeTab === "NEW_PURCHASE" && (
        <form onSubmit={handleSubmitBill} className="space-y-5">
          {errorMessage && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3.5 text-[13px] text-destructive font-medium flex items-center justify-between">
              <span>⚠️ {errorMessage}</span>
              <button type="button" onClick={() => setErrorMessage("")} className="text-[12px] underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Top Bar: Purchase Mode & OCR Extraction Trigger */}
          <div className="glass rounded-2xl border border-border/80 p-4 flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-glass)]">
            <div className="flex items-center gap-3">
              <span className="text-[13px] font-bold tracking-tight text-foreground">BILL MODE:</span>
              <div className="inline-flex rounded-xl p-1 bg-muted/60 border border-border/60">
                <button
                  type="button"
                  onClick={() => setPurchaseType("GST")}
                  className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    purchaseType === "GST"
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  GST PURCHASE
                </button>
                <button
                  type="button"
                  onClick={() => setPurchaseType("NON_GST")}
                  className={`px-4 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    purchaseType === "NON_GST"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  NON-GST PURCHASE
                </button>
              </div>
            </div>

            {/* OCR Invoice Extraction Section */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] text-muted-foreground font-medium">Invoice Upload & AI / OCR:</span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extracting}
                onClick={() => triggerExtraction({ fileName: "oppo_1270.jpg", text: "Ramniwas Sumit Kumar Maheshwari 23ABJFR0427Q1ZW Inv 26-27/Oppo/1270" })}
                className="bg-indigo-50/50 hover:bg-indigo-100/60 text-indigo-700 border-indigo-200"
              >
                {extracting ? "Extracting..." : "⚡ Test OPPO (Ramniwas)"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={extracting}
                onClick={() => triggerExtraction({ fileName: "realme_695.jpg", text: "Tanay Traders 23AQDPA6961H2Z2 Inv 2627TTRM/695 Realme C 83 5g" })}
                className="bg-purple-50/50 hover:bg-purple-100/60 text-purple-700 border-purple-200"
              >
                {extracting ? "Extracting..." : "⚡ Test Realme (Tanay)"}
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        triggerExtraction({
                          fileName: file.name,
                          mimeType: file.type,
                          base64: reader.result as string,
                          text: file.name,
                        });
                        setAttachments((curr) => [
                          ...curr,
                          {
                            fileName: file.name,
                            fileType: file.type,
                            fileSize: file.size,
                            fileData: reader.result as string,
                          },
                        ]);
                      };
                      reader.readAsDataURL(file);
                    }
                  }}
                />
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary text-[12px] font-semibold transition-all">
                  📎 Upload Bill (Image/PDF)
                </span>
              </label>
            </div>
          </div>

          {/* Dealer Details Card */}
          <Card>
            <CardHead
              title="1. Dealer Details"
              sub="Select existing distributor or add new dealer with GSTIN, State Code, and Contact Details."
              right={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewDealerModalOpen(true)}
                >
                  + Add New Dealer
                </Button>
              }
            />
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Search / Select Dealer *">
                  <Select
                    value={selectedDealerId}
                    onChange={(e) => handleSelectDealer(e.target.value)}
                    required
                  >
                    {db.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.company && s.company !== s.name ? `(${s.company})` : ""} — {s.city || "Harda"}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Dealer GSTIN">
                  <Input
                    value={selectedDealer?.gstin || ""}
                    readOnly
                    placeholder="e.g. 23AQDPA6961H2Z2"
                    className="bg-muted/30 font-mono"
                  />
                </Field>

                <Field label="Dealer Phone / Mobile">
                  <Input
                    value={selectedDealer?.phone || selectedDealer?.mobile || ""}
                    readOnly
                    className="bg-muted/30"
                  />
                </Field>
              </div>

              {selectedDealer && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Dealer Address</span>
                    <span className="font-medium text-foreground">{selectedDealer.address || "Main Road, Harda"}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">State & Code</span>
                    <span className="font-semibold text-foreground">
                      {selectedDealer.state || "Madhya Pradesh"} (Code: {selectedDealer.stateCode || "23"})
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Contact Person</span>
                    <span className="font-medium text-foreground">{selectedDealer.contactPerson || selectedDealer.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[11px]">Tax Supply Type</span>
                    <Badge tone={isIntrastate ? "info" : "warning"}>
                      {isIntrastate ? "INTRASTATE (CGST + SGST)" : "INTERSTATE (IGST)"}
                    </Badge>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Invoice Metadata (20+ ERP Fields) */}
          <Card>
            <CardHead
              title="2. Invoice Details & Dispatch Metadata"
              sub="Record Dealer Bill Number, PO, e-Way Bill, Delivery notes, and terms."
            />
            <div className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Invoice No *">
                  <Input
                    placeholder="e.g. 2627TTRM/695"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Invoice Date *">
                  <Input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    required
                  />
                </Field>
                <Field label="Original Inv No">
                  <Input
                    placeholder="e.g. 26-27/Oppo/1270"
                    value={originalInvoiceNo}
                    onChange={(e) => setOriginalInvoiceNo(e.target.value)}
                  />
                </Field>
                <Field label="Original Inv Date">
                  <Input
                    type="date"
                    value={originalInvoiceDate}
                    onChange={(e) => setOriginalInvoiceDate(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="PO Number">
                  <Input
                    placeholder="PO-2026-001"
                    value={poNumber}
                    onChange={(e) => setPoNumber(e.target.value)}
                  />
                </Field>
                <Field label="e-Way Bill No">
                  <Input
                    placeholder="12-digit e-way bill"
                    value={ewayBillNo}
                    onChange={(e) => setEwayBillNo(e.target.value)}
                  />
                </Field>
                <Field label="Delivery Note No">
                  <Input
                    placeholder="DN-8812"
                    value={deliveryNoteNo}
                    onChange={(e) => setDeliveryNoteNo(e.target.value)}
                  />
                </Field>
                <Field label="Delivery Note Date">
                  <Input
                    type="date"
                    value={deliveryNoteDate}
                    onChange={(e) => setDeliveryNoteDate(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Dispatch Doc No">
                  <Input
                    placeholder="LR/RR/Airway Bill"
                    value={dispatchDocNo}
                    onChange={(e) => setDispatchDocNo(e.target.value)}
                  />
                </Field>
                <Field label="Dispatched Through">
                  <Input
                    placeholder="Courier / Direct Van"
                    value={dispatchedThrough}
                    onChange={(e) => setDispatchedThrough(e.target.value)}
                  />
                </Field>
                <Field label="Destination">
                  <Input
                    placeholder="Harda Shop"
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                  />
                </Field>
                <Field label="Terms of Delivery">
                  <Input
                    placeholder="Door Delivery / Ex-Godown"
                    value={termsOfDelivery}
                    onChange={(e) => setTermsOfDelivery(e.target.value)}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field label="Payment Terms">
                  <Input
                    placeholder="30 Days / Immediate"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                  />
                </Field>
                <Field label="Due Date">
                  <Input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </Field>
                <Field label="Place of Supply">
                  <Input
                    value={placeOfSupply}
                    onChange={(e) => setPlaceOfSupply(e.target.value)}
                  />
                </Field>
                <Field label="Received By">
                  <Input
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                  />
                </Field>
              </div>
            </div>
          </Card>

          {/* 18-Column Items Table */}
          <Card>
            <CardHead
              title="3. Inward Items Table (18 Columns)"
              sub="Accurate GST line calculations, tax breakdown, discount %, and unique IMEI validation."
              right={
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="gap-1.5 text-[12px] h-8 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-xs"
                    onClick={() => setQuickProductModalOpen(true)}
                  >
                    + ADD PRODUCT
                  </Button>
                  <Select
                    className="w-64 text-[12px]"
                    onChange={(e) => {
                      if (e.target.value) {
                        handleAddProduct(e.target.value);
                        e.target.value = "";
                      }
                    }}
                    defaultValue=""
                  >
                    <option value="" disabled>
                      Select Existing Product...
                    </option>
                    {db.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.brand} ({p.tracked ? "Tracked" : "Qty"})
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />

            <div className="p-3 overflow-x-auto">
              {calculatedItems.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground text-[13px]">
                  No products added yet. Use the dropdown above or "Upload Bill" to extract automatically.
                </div>
              ) : (
                <div className="space-y-4">
                  <table className="w-full text-[11.5px] border-collapse min-w-[1100px]">
                    <thead>
                      <tr className="border-b border-border/80 bg-muted/40 text-muted-foreground font-semibold text-left">
                        <th className="p-2 w-8">#</th>
                        <th className="p-2 min-w-[180px]">Product / Model</th>
                        <th className="p-2 w-24">HSN/SAC</th>
                        <th className="p-2 w-16 text-center">Qty</th>
                        <th className="p-2 w-14">Unit</th>
                        <th className="p-2 w-24 text-right">Rate Excl.</th>
                        <th className="p-2 w-24 text-right">Rate Incl.</th>
                        <th className="p-2 w-16 text-right">Disc %</th>
                        <th className="p-2 w-24 text-right">Taxable</th>
                        {purchaseType === "GST" && (
                          <>
                            <th className="p-2 w-14 text-center">GST %</th>
                            {isIntrastate ? (
                              <>
                                <th className="p-2 w-20 text-right">CGST (9%)</th>
                                <th className="p-2 w-20 text-right">SGST (9%)</th>
                              </>
                            ) : (
                              <th className="p-2 w-24 text-right">IGST (18%)</th>
                            )}
                          </>
                        )}
                        <th className="p-2 w-28 text-right font-bold">Total (₹)</th>
                        <th className="p-2 w-10 text-center">Act</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {calculatedItems.map((item, idx) => {
                        const prod = db.products.find((p) => p.id === item.productId);
                        const itemImeis = imeisByProduct[item.productId] || [];
                        const isSerialized = Boolean(prod?.tracked);

                        return (
                          <tr key={idx} className="hover:bg-muted/20 transition-colors">
                            <td className="p-2 text-muted-foreground font-mono">{idx + 1}</td>
                            <td className="p-2">
                              <div className="font-bold text-foreground text-[12px]">{item.name}</div>
                              <div className="text-[10.5px] text-muted-foreground">
                                {prod?.brand} {prod?.model} {isSerialized ? "• IMEI Required" : "• Bulk Qty"}
                              </div>
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.hsnSac || "85171300"}
                                onChange={(e) => updateItem(idx, { hsnSac: e.target.value })}
                                className="h-7 text-[11px] font-mono"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="1"
                                value={item.qty}
                                onChange={(e) => updateItem(idx, { qty: Math.max(1, Number(e.target.value)) })}
                                className="h-7 text-[11px] text-center"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                value={item.unit || "pcs"}
                                onChange={(e) => updateItem(idx, { unit: e.target.value })}
                                className="h-7 text-[11px]"
                              />
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={item.rateExcludingTax}
                                onChange={(e) => updateItem(idx, { rateExcludingTax: Number(e.target.value) })}
                                className="h-7 text-[11px] text-right font-mono"
                              />
                            </td>
                            <td className="p-2 text-right font-mono text-muted-foreground">
                              {inr(item.rateIncludingTax || 0)}
                            </td>
                            <td className="p-2">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={item.discountPct || 0}
                                onChange={(e) => updateItem(idx, { discountPct: Number(e.target.value) })}
                                className="h-7 text-[11px] text-right"
                              />
                            </td>
                            <td className="p-2 text-right font-mono font-medium">
                              {inr(item.taxableAmount || 0)}
                            </td>
                            {purchaseType === "GST" && (
                              <>
                                <td className="p-2 text-center font-mono">
                                  {item.gstRate}%
                                </td>
                                {isIntrastate ? (
                                  <>
                                    <td className="p-2 text-right font-mono text-indigo-600">
                                      {inr(item.cgstAmount || 0)}
                                    </td>
                                    <td className="p-2 text-right font-mono text-indigo-600">
                                      {inr(item.sgstAmount || 0)}
                                    </td>
                                  </>
                                ) : (
                                  <td className="p-2 text-right font-mono text-amber-600">
                                    {inr(item.igstAmount || 0)}
                                  </td>
                                )}
                              </>
                            )}
                            <td className="p-2 text-right font-mono font-bold text-foreground">
                              {inr(item.totalAmount || 0)}
                            </td>
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                className="text-destructive hover:opacity-75 font-bold text-sm"
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Serial IMEI Tags Management for Tracked Products */}
                  {calculatedItems.some((i) => db.products.find((p) => p.id === i.productId)?.tracked) && (
                    <div className="rounded-xl border border-border/80 bg-muted/10 p-4 space-y-3">
                      <div className="text-[12.5px] font-bold text-foreground">
                        📱 Serialized Phone IMEIs (Must match quantity exactly)
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {calculatedItems.map((item, idx) => {
                          const prod = db.products.find((p) => p.id === item.productId);
                          if (!prod?.tracked) return null;

                          const enteredImeis = imeisByProduct[item.productId] || [];
                          const isComplete = enteredImeis.length === item.qty;

                          return (
                            <div
                              key={idx}
                              className={`rounded-xl border p-3 space-y-2.5 transition-all ${
                                isComplete
                                  ? "border-emerald-300 bg-emerald-50/20"
                                  : "border-amber-300 bg-amber-50/20"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-[12px] text-foreground">
                                  {item.name}
                                </span>
                                <Badge tone={isComplete ? "success" : "warning"}>
                                  Scanned: {enteredImeis.length} / {item.qty}
                                </Badge>
                              </div>

                              {/* Entered Tags */}
                              <div className="flex flex-wrap gap-1.5 min-h-[30px]">
                                {enteredImeis.map((imei) => (
                                  <span
                                    key={imei}
                                    className="inline-flex items-center gap-1 rounded-md bg-background px-2 py-0.5 text-[11px] font-mono border border-border/80 shadow-xs"
                                  >
                                    {imei}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveImei(item.productId, imei)}
                                      className="text-muted-foreground hover:text-destructive text-xs ml-0.5"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>

                              {/* Input to add IMEI */}
                              {!isComplete ? (
                                <div className="flex gap-2 items-center">
                                  <Input
                                    placeholder="Enter or scan 15-digit IMEI..."
                                    className="h-8 text-[11.5px] font-mono flex-1"
                                    value={
                                      activeImeiInput.productId === item.productId
                                        ? activeImeiInput.text
                                        : ""
                                    }
                                    onChange={(e) =>
                                      setActiveImeiInput({
                                        productId: item.productId,
                                        text: e.target.value,
                                      })
                                    }
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleAddImei(item.productId, activeImeiInput.text);
                                      }
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    onClick={() =>
                                      handleAddImei(item.productId, activeImeiInput.text)
                                    }
                                  >
                                    Add
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="gap-1 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20 whitespace-nowrap"
                                    onClick={() =>
                                      setActiveScannerProduct({
                                        id: item.productId,
                                        name: item.name,
                                        qty: item.qty,
                                      })
                                    }
                                  >
                                    📷 Scan IMEI
                                  </Button>
                                </div>
                              ) : (
                                <div className="pt-0.5 flex justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-[11px] h-7 gap-1 text-primary hover:bg-primary/10"
                                    onClick={() =>
                                      setActiveScannerProduct({
                                        id: item.productId,
                                        name: item.name,
                                        qty: item.qty,
                                      })
                                    }
                                  >
                                    📷 Re-scan / Edit IMEIs
                                  </Button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Attachments Section */}
          <Card>
            <CardHead
              title="4. Invoice Attachments"
              sub="Store multiple invoice scans, receipts, and e-way bills with this purchase bill."
            />
            <div className="p-4 sm:p-5 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      files.forEach((file) => {
                        const reader = new FileReader();
                        reader.onload = () => {
                          setAttachments((curr) => [
                            ...curr,
                            {
                              fileName: file.name,
                              fileType: file.type,
                              fileSize: file.size,
                              fileData: reader.result as string,
                            },
                          ]);
                        };
                        reader.readAsDataURL(file);
                      });
                    }}
                  />
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/40 text-[12px] font-medium transition-all shadow-xs">
                    + Add More Documents
                  </span>
                </label>
                <span className="text-[12px] text-muted-foreground">
                  {attachments.length} attachment(s) selected
                </span>
              </div>

              {attachments.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {attachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="rounded-xl border border-border/80 p-2.5 bg-muted/20 flex items-center justify-between text-[11.5px]"
                    >
                      <div className="truncate mr-2">
                        <div className="font-semibold truncate">{att.fileName}</div>
                        <div className="text-[10px] text-muted-foreground">{att.fileType}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachments((curr) => curr.filter((_, i) => i !== idx))}
                        className="text-destructive font-bold hover:opacity-75"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Financial Summary & Payment */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            {/* Left: Charges & TDS 194R */}
            <Card>
              <CardHead title="5. Additional Charges & TDS" />
              <div className="p-4 sm:p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Other Charges / Freight (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={otherCharges}
                      onChange={(e) => setOtherCharges(Number(e.target.value))}
                    />
                  </Field>

                  <Field label="Round Off (+/- ₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={roundOff}
                      onChange={(e) => setRoundOff(Number(e.target.value))}
                    />
                  </Field>
                </div>

                {/* TDS 194R Section */}
                <div className="rounded-xl border border-border/70 p-3.5 bg-muted/20 space-y-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tdsApplicable}
                      onChange={(e) => setTdsApplicable(e.target.checked)}
                      className="rounded text-primary h-4 w-4"
                    />
                    <span className="text-[12.5px] font-bold text-foreground">
                      TDS 194R Applicable (@ 10% on Taxable Value)
                    </span>
                  </label>

                  {tdsApplicable && (
                    <div className="grid grid-cols-2 gap-2.5 pt-1 text-[12px]">
                      <Field label="TDS Section">
                        <Input
                          value={tdsSection}
                          onChange={(e) => setTdsSection(e.target.value)}
                        />
                      </Field>
                      <Field label="TDS Deducted (₹)">
                        <Input
                          value={inr(tdsAmount)}
                          readOnly
                          className="bg-muted/40 font-mono text-rose-600 font-bold"
                        />
                      </Field>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            {/* Right: Payment & Inward Action */}
            <Card>
              <CardHead title="6. Bill Summary & Dealer Payment" />
              <div className="p-4 sm:p-5 space-y-4">
                <div className="space-y-2 text-[12.5px] border-b border-border/70 pb-3">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Taxable Amount:</span>
                    <span className="font-mono">{inr(totalTaxable)}</span>
                  </div>

                  {purchaseType === "GST" && (
                    <>
                      {isIntrastate ? (
                        <>
                          <div className="flex justify-between text-muted-foreground">
                            <span>Central GST (9%):</span>
                            <span className="font-mono text-indigo-600">{inr(totalCgst)}</span>
                          </div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>State GST (9%):</span>
                            <span className="font-mono text-indigo-600">{inr(totalSgst)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Integrated GST (18%):</span>
                          <span className="font-mono text-amber-600">{inr(totalIgst)}</span>
                        </div>
                      )}
                    </>
                  )}

                  {otherCharges > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Other Charges:</span>
                      <span className="font-mono">{inr(otherCharges)}</span>
                    </div>
                  )}

                  {tdsApplicable && (
                    <div className="flex justify-between text-rose-600">
                      <span>TDS 194R Payable (-):</span>
                      <span className="font-mono font-bold">-{inr(tdsAmount)}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-[15px] font-bold text-foreground pt-1 border-t border-border/40">
                    <span>Grand Total:</span>
                    <span className="font-mono text-primary">{inr(grandTotal)}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Initial Paid Amount (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={paid}
                      onChange={(e) => setPaid(Number(e.target.value))}
                    />
                  </Field>

                  <Field label="Payment Mode">
                    <Select
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                    >
                      {PAYMENT_MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <div className="rounded-xl border border-border/60 p-3 bg-muted/20 flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold text-muted-foreground">
                    Balance Due to Dealer:
                  </span>
                  <span
                    className={`font-mono text-[14px] font-bold ${
                      dueAmount > 0 ? "text-destructive" : "text-emerald-600"
                    }`}
                  >
                    {inr(dueAmount)}
                  </span>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => setActiveTab("BILLS")}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={isSubmitting || calculatedItems.length === 0}
                    className="px-6"
                  >
                    {isSubmitting ? "Processing..." : "Confirm & Inward Dealer Bill"}
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        </form>
      )}

      {/* TAB 2: PURCHASE BILLS HISTORY */}
      {activeTab === "BILLS" && (
        <Card>
          <CardHead
            title="Dealer Purchase Bills"
            sub={`${filteredPurchases.length} total dealer bills recorded.`}
            right={
              <Input
                placeholder="Search invoice or dealer..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-56 sm:w-72"
              />
            }
          />

          {filteredPurchases.length === 0 ? (
            <Empty text="No dealer purchase bills found." />
          ) : (
            <Table
              head={[
                "Invoice #",
                "Date",
                "Mode",
                "Dealer",
                "Status",
                "Place of Supply",
                "Items",
                ">Taxable",
                ">Total",
                ">Paid",
                ">Due",
                "Actions",
              ]}
            >
              {filteredPurchases.map((p) => {
                const dealer = dealerMap.get(p.supplierId || p.dealerId || "");
                const due = p.dueAmount !== undefined ? p.dueAmount : Math.max(0, p.total - p.paid);

                return (
                  <Row key={p.id}>
                    <Td mono className="font-semibold text-primary">
                      {p.invoiceNo}
                    </Td>
                    <Td>{p.date}</Td>
                    <Td>
                      <Badge tone={p.purchaseType === "NON_GST" ? "neutral" : "info"}>
                        {p.purchaseType || "GST"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="font-semibold">{dealer?.name || "Unknown"}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">{dealer?.gstin}</div>
                    </Td>
                    <Td>
                      <Badge
                        tone={
                          due === 0
                            ? "success"
                            : p.paid > 0
                            ? "warning"
                            : "danger"
                        }
                      >
                        {due === 0 ? "PAID" : p.paid > 0 ? "PARTIAL" : "UNPAID"}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="text-[11px] font-medium">
                        {p.placeOfSupply || "MP"} (Code: {p.stateCode || "23"})
                      </span>
                    </Td>
                    <Td>
                      <div className="text-[11px] max-w-xs truncate">
                        {p.items.map((i) => `${i.name} (×${i.qty})`).join(", ")}
                      </div>
                    </Td>
                    <Td right mono className="text-muted-foreground">
                      {inr(p.subtotal || p.taxableValue || 0)}
                    </Td>
                    <Td right mono className="font-bold text-foreground">
                      {inr(p.total)}
                    </Td>
                    <Td right mono className="text-emerald-600 font-medium">
                      {inr(p.paid)}
                    </Td>
                    <Td
                      right
                      mono
                      className={due > 0 ? "text-destructive font-bold" : "text-muted-foreground"}
                    >
                      {inr(due)}
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {due > 0 && (
                          <Button
                            size="sm"
                            variant="soft"
                            className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                            onClick={() => openAddPaymentModal(p)}
                          >
                            + Pay
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedBill(p)}
                        >
                          View Bill
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium"
                          onClick={() => setSelectedPurchaseInvoice(p)}
                          title="Print / View Official A4 Invoice"
                        >
                          🖨️ Invoice
                        </Button>
                      </div>
                    </Td>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: DEBIT NOTES & TDS */}
      {activeTab === "DEBIT_NOTES" && (
        <Card>
          <CardHead
            title="Debit Notes & TDS 194R"
            sub="Issued debit notes to dealers (e.g. TDS 194R Payable @ 10%, rate revisions, or claims). Automatically debits Dealer Ledger."
            right={
              <Button
                variant="primary"
                size="sm"
                onClick={() => setDebitNoteModalOpen(true)}
              >
                + Issue Debit Note
              </Button>
            }
          />

          {!db.debitNotes || db.debitNotes.length === 0 ? (
            <Empty text="No debit notes recorded yet. Click '+ Issue Debit Note' to record TDS 194R or price differences." />
          ) : (
            <Table head={["Debit Note #", "Date", "Dealer", "Reason / Section", "Orig. Invoice", ">Amount (₹)", "Status", "Actions"]}>
              {db.debitNotes.map((dn) => {
                const dealer = dealerMap.get(dn.dealerId || dn.supplierId || "");
                return (
                  <Row key={dn.id}>
                    <Td mono className="font-bold text-primary">
                      {dn.noteNumber}
                    </Td>
                    <Td>{dn.date}</Td>
                    <Td>
                      <div className="font-semibold">{dealer?.name || "Dealer"}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{dealer?.gstin}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-[12px]">{dn.reason}</div>
                      {dn.section && (
                        <div className="text-[10.5px] text-indigo-600">{dn.section}</div>
                      )}
                    </Td>
                    <Td mono className="text-[11px]">
                      {dn.originalInvoiceNo || "—"}
                    </Td>
                    <Td right mono className="font-bold text-rose-600">
                      {inr(dn.amount)}
                    </Td>
                    <Td>
                      <Badge tone="success">{dn.status}</Badge>
                    </Td>
                    <Td>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium"
                        onClick={() => setSelectedDebitNoteInvoice(dn)}
                        title="Print / View Official Debit Note"
                      >
                        🖨️ View Note
                      </Button>
                    </Td>
                  </Row>
                );
              })}
            </Table>
          )}
        </Card>
      )}

      {/* OCR EXTRACTION PREVIEW MODAL */}
      <Modal
        open={ocrModalOpen}
        onClose={() => setOcrModalOpen(false)}
        title="AI Invoice Extraction Preview"
        wide
      >
        {extractionResult && (
          <div className="space-y-4">
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 flex items-center justify-between text-[12.5px]">
              <div>
                <span className="font-bold text-indigo-900 block">Extracted Dealer:</span>
                <span className="text-indigo-800">{extractionResult.dealer.name} ({extractionResult.dealer.gstin || "No GSTIN"})</span>
              </div>
              <div className="text-right">
                <span className="font-bold text-indigo-900 block">Extracted Invoice:</span>
                <span className="font-mono text-indigo-800">{extractionResult.invoice.invoiceNo} • {extractionResult.invoice.date}</span>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] font-bold text-foreground">Extracted Line Items:</div>
              <div className="rounded-xl border border-border/70 overflow-x-auto">
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="border-b bg-muted/40 font-semibold text-left">
                      <th className="p-2">Item Name</th>
                      <th className="p-2">Catalog Match</th>
                      <th className="p-2 text-center">Qty</th>
                      <th className="p-2 text-right">Taxable (₹)</th>
                      <th className="p-2 text-right">Total (₹)</th>
                      <th className="p-2">Extracted IMEIs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {extractionResult.items.map((it: any, idx: number) => (
                      <tr key={idx}>
                        <td className="p-2 font-medium">{it.name}</td>
                        <td className="p-2">
                          {it.isMatched ? (
                            <Badge tone="success">Matched: {it.matchedProductName}</Badge>
                          ) : (
                            <Badge tone="warning">Unmatched</Badge>
                          )}
                        </td>
                        <td className="p-2 text-center">{it.qty}</td>
                        <td className="p-2 text-right font-mono">{inr(it.taxableAmount)}</td>
                        <td className="p-2 text-right font-mono font-bold">{inr(it.totalAmount)}</td>
                        <td className="p-2 font-mono text-[10.5px] text-muted-foreground">
                          {it.imeis?.length ? it.imeis.join(", ") : "None"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-3">
              <div className="text-[13px] font-bold text-foreground">
                Total Extracted Amount: <span className="font-mono text-primary">{inr(extractionResult.totals.totalAmount)}</span>
              </div>
              <div className="flex gap-2">
                <Button variant="ghost" onClick={() => setOcrModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={applyExtractionToBill}>
                  Apply Extracted Data to Purchase Bill
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* VIEW BILL DETAILS MODAL */}
      <Modal
        open={Boolean(selectedBill)}
        onClose={() => setSelectedBill(null)}
        title={`Dealer Bill — ${selectedBill?.invoiceNo}`}
        wide
      >
        {selectedBill && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Dealer</span>
                <span className="font-bold text-foreground">
                  {dealerMap.get(selectedBill.supplierId || selectedBill.dealerId || "")?.name || "Dealer"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Bill Date</span>
                <span className="font-medium text-foreground">{selectedBill.date}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Bill Mode & Status</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <Badge tone={selectedBill.purchaseType === "NON_GST" ? "neutral" : "info"}>
                    {selectedBill.purchaseType || "GST"}
                  </Badge>
                  <Badge
                    tone={
                      (selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) === 0
                        ? "success"
                        : selectedBill.paid > 0
                        ? "warning"
                        : "danger"
                    }
                  >
                    {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) === 0
                      ? "PAID"
                      : selectedBill.paid > 0
                      ? "PARTIALLY PAID"
                      : "UNPAID"}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Place of Supply</span>
                <span className="font-medium text-foreground">
                  {selectedBill.placeOfSupply || "MP"} (Code: {selectedBill.stateCode || "23"})
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="rounded-xl border border-border/80 overflow-x-auto">
              <table className="w-full text-[11.5px]">
                <thead>
                  <tr className="border-b bg-muted/40 font-semibold text-left">
                    <th className="p-2">Item</th>
                    <th className="p-2 text-center">Qty</th>
                    <th className="p-2 text-right">Taxable</th>
                    <th className="p-2 text-right">CGST</th>
                    <th className="p-2 text-right">SGST</th>
                    <th className="p-2 text-right">IGST</th>
                    <th className="p-2 text-right font-bold">Total</th>
                    <th className="p-2">IMEIs</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {selectedBill.items.map((i, idx) => (
                    <tr key={idx}>
                      <td className="p-2 font-medium">{i.name}</td>
                      <td className="p-2 text-center">{i.qty}</td>
                      <td className="p-2 text-right font-mono">{inr(i.taxableAmount || i.costPrice * i.qty)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.cgstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.sgstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono">{inr(i.igstAmount || 0)}</td>
                      <td className="p-2 text-right font-mono font-bold">{inr(i.totalAmount || i.price * i.qty)}</td>
                      <td className="p-2 font-mono text-[10.5px] text-muted-foreground">
                        {i.imeis?.length ? i.imeis.join(", ") : i.imei || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Bill Summary */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-xl border border-border/60 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[11px]">Grand Total</span>
                <span className="font-bold text-[14px] font-mono text-primary">{inr(selectedBill.total)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Paid</span>
                <span className="font-bold text-[14px] font-mono text-emerald-600">{inr(selectedBill.paid)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Balance Due</span>
                <span className="font-bold text-[14px] font-mono text-destructive">
                  {inr(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid))}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[11px]">Payment Mode</span>
                <span className="font-semibold text-foreground">{selectedBill.mode}</span>
              </div>
            </div>

            {/* Payment History Section */}
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[12.5px] font-bold text-foreground">
                  💳 Payment History ({billPayments.length})
                </span>
                {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) > 0 && (
                  <Button
                    size="sm"
                    variant="soft"
                    className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-medium"
                    onClick={() => openAddPaymentModal(selectedBill)}
                  >
                    + Add Payment
                  </Button>
                )}
              </div>

              {loadingPayments ? (
                <div className="text-[12px] text-muted-foreground py-2">Loading payment records...</div>
              ) : billPayments.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic py-1">
                  No additional payment transactions recorded for this bill.
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-[11px] text-left">
                    <thead className="bg-muted/40 font-semibold text-muted-foreground">
                      <tr>
                        <th className="p-2">Date</th>
                        <th className="p-2">Mode</th>
                        <th className="p-2">Reference / UTR</th>
                        <th className="p-2">Bank / Cheque</th>
                        <th className="p-2 text-right">Amount (₹)</th>
                        <th className="p-2">User</th>
                        <th className="p-2 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {billPayments.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="p-2">{p.date}</td>
                          <td className="p-2">
                            <Badge tone="neutral">{p.mode}</Badge>
                          </td>
                          <td className="p-2 font-mono text-muted-foreground">{p.referenceNo || p.note || "—"}</td>
                          <td className="p-2">
                            {p.chequeNo ? `Cheque #${p.chequeNo}` : ""}
                            {p.bankName ? ` (${p.bankName})` : ""}
                            {!p.chequeNo && !p.bankName ? "—" : ""}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-600">
                            {inr(p.amount)}
                          </td>
                          <td className="p-2 text-muted-foreground">{p.userName || "Admin"}</td>
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeletePurchasePayment(p.id)}
                              className="text-destructive font-bold hover:opacity-75 text-xs px-1"
                              title="Delete payment"
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2">
              <Button
                variant="outline"
                className="text-orange-600 border-orange-200 hover:bg-orange-50 gap-1.5"
                onClick={() => {
                  const bill = selectedBill;
                  setSelectedBill(null);
                  setSelectedPurchaseInvoice(bill);
                }}
              >
                🖨️ Print Official Invoice (A4)
              </Button>
              <div className="flex items-center gap-2">
                {(selectedBill.dueAmount !== undefined ? selectedBill.dueAmount : Math.max(0, selectedBill.total - selectedBill.paid)) > 0 && (
                  <Button
                    variant="primary"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={() => openAddPaymentModal(selectedBill)}
                  >
                    + Receive / Add Payment
                  </Button>
                )}
                <Button onClick={() => setSelectedBill(null)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ADD NEW DEALER MODAL */}
      <Modal
        open={newDealerModalOpen}
        onClose={() => setNewDealerModalOpen(false)}
        title="Add New Dealer / Distributor"
      >
        <form onSubmit={handleCreateNewDealer} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Dealer / Firm Name *">
              <Input
                placeholder="e.g. Tanay Traders"
                value={newDealerForm.name}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, name: e.target.value })}
                required
              />
            </Field>
            <Field label="Company / Brand">
              <Input
                placeholder="e.g. Realme Distributor"
                value={newDealerForm.company}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, company: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone / Mobile *">
              <Input
                placeholder="9876543210"
                value={newDealerForm.phone}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, phone: e.target.value })}
                required
              />
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                placeholder="dealer@trade.com"
                value={newDealerForm.email}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, email: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="GSTIN">
              <Input
                placeholder="23AQDPA6961H2Z2"
                value={newDealerForm.gstin}
                onChange={(e) => {
                  const gstin = e.target.value.toUpperCase();
                  const code = gstin.length >= 2 ? gstin.substring(0, 2) : "23";
                  setNewDealerForm({ ...newDealerForm, gstin, stateCode: code });
                }}
              />
            </Field>
            <Field label="State">
              <Input
                value={newDealerForm.state}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, state: e.target.value })}
              />
            </Field>
            <Field label="State Code">
              <Input
                value={newDealerForm.stateCode}
                onChange={(e) => setNewDealerForm({ ...newDealerForm, stateCode: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Address">
            <Input
              placeholder="Shop / Complex Address"
              value={newDealerForm.address}
              onChange={(e) => setNewDealerForm({ ...newDealerForm, address: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setNewDealerModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Dealer</Button>
          </div>
        </form>
      </Modal>

      {/* ISSUE DEBIT NOTE MODAL */}
      <Modal
        open={debitNoteModalOpen}
        onClose={() => setDebitNoteModalOpen(false)}
        title="Issue Debit Note (TDS 194R / Revisions)"
      >
        <form onSubmit={handleSubmitDebitNote} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Select Dealer *">
              <Select
                value={debitNoteForm.dealerId}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, dealerId: e.target.value })}
                required
              >
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.city || "Harda"})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Debit Note #">
              <Input
                placeholder="e.g. 2627DNTDS/65"
                value={debitNoteForm.noteNumber}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, noteNumber: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Date *">
              <Input
                type="date"
                value={debitNoteForm.date}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, date: e.target.value })}
                required
              />
            </Field>
            <Field label="Debit Amount (₹) *">
              <Input
                type="number"
                step="0.01"
                value={debitNoteForm.amount}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, amount: Number(e.target.value) })}
                required
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Reason / Section *">
              <Input
                value={debitNoteForm.reason}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, reason: e.target.value })}
                required
              />
            </Field>
            <Field label="Original Invoice Ref">
              <Input
                placeholder="2627TTRM/695"
                value={debitNoteForm.originalInvoiceNo}
                onChange={(e) => setDebitNoteForm({ ...debitNoteForm, originalInvoiceNo: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Remarks / Details">
            <Input
              value={debitNoteForm.remarks}
              onChange={(e) => setDebitNoteForm({ ...debitNoteForm, remarks: e.target.value })}
            />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setDebitNoteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Confirm & Issue Debit Note</Button>
          </div>
        </form>
      </Modal>

      {/* RECORD PURCHASE PAYMENT MODAL */}
      <Modal
        open={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        title={`Receive / Add Payment — ${paymentBill?.invoiceNo}`}
      >
        {paymentBill && (
          <form onSubmit={handleSubmitPurchasePayment} className="space-y-4">
            {paymentError && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-[12px] text-destructive font-medium">
                ⚠️ {paymentError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Dealer</span>
                <span className="font-bold text-foreground">
                  {dealerMap.get(paymentBill.supplierId || paymentBill.dealerId || "")?.name || "Dealer"}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Bill Invoice #</span>
                <span className="font-mono font-bold text-primary">{paymentBill.invoiceNo}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Total Bill Amount</span>
                <span className="font-mono font-medium">{inr(paymentBill.total)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Previously Paid</span>
                <span className="font-mono font-medium text-emerald-600">{inr(paymentBill.paid)}</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-border/40 flex items-center justify-between">
                <span className="font-bold text-[12.5px] text-foreground">Outstanding Payable:</span>
                <span className="font-mono font-bold text-[14px] text-destructive">
                  {inr(paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid))}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Payment Amount (₹) *">
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={paymentBill.dueAmount !== undefined ? paymentBill.dueAmount : Math.max(0, paymentBill.total - paymentBill.paid)}
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  required
                  className="font-bold font-mono text-[14px]"
                />
              </Field>

              <Field label="Payment Date *">
                <Input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Payment Mode *">
                <Select
                  value={payMode}
                  onChange={(e) => setPayMode(e.target.value as PaymentMode)}
                  required
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Reference No / UTR / Txn ID">
                <Input
                  placeholder="e.g. UTR / IMPS / Bank Ref"
                  value={payReferenceNo}
                  onChange={(e) => setPayReferenceNo(e.target.value)}
                />
              </Field>
            </div>

            {(payMode === "Cheque" || payMode === "Bank") && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Cheque Number">
                  <Input
                    placeholder="e.g. 104523"
                    value={payChequeNo}
                    onChange={(e) => setPayChequeNo(e.target.value)}
                  />
                </Field>

                <Field label="Bank Name">
                  <Input
                    placeholder="e.g. HDFC / SBI Bank"
                    value={payBankName}
                    onChange={(e) => setPayBankName(e.target.value)}
                  />
                </Field>
              </div>
            )}

            <Field label="Remarks / Notes">
              <Input
                placeholder="e.g. Part payment via RTGS"
                value={payRemarks}
                onChange={(e) => setPayRemarks(e.target.value)}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setPayModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={isRecordingPayment}>
                {isRecordingPayment ? "Recording Payment..." : "Record & Post Payment"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* CONTINUOUS CAMERA INWARD IMEI SCANNER MODAL */}
      {activeScannerProduct && (
        <ImeiScannerModal
          open={Boolean(activeScannerProduct)}
          onClose={() => setActiveScannerProduct(null)}
          productId={activeScannerProduct.id}
          productName={activeScannerProduct.name}
          requiredQty={activeScannerProduct.qty}
          currentImeis={imeisByProduct[activeScannerProduct.id] || []}
          existingPurchaseImeis={Object.entries(imeisByProduct)
            .filter(([id]) => id !== activeScannerProduct.id)
            .flatMap(([, arr]) => arr)}
          dbUnits={db.units}
          onAddImei={(imei) => handleAddImei(activeScannerProduct.id, imei)}
          onRemoveImei={(imei) => handleRemoveImei(activeScannerProduct.id, imei)}
          onSave={(imeis) => {
            if (activeScannerProduct) {
              setImeisByProduct((prev) => ({
                ...prev,
                [activeScannerProduct.id]: imeis,
              }));
            }
          }}
        />
      )}

      {/* QUICK PRODUCT CREATION MODAL */}
      {quickProductModalOpen && (
        <QuickProductModal
          open={quickProductModalOpen}
          onClose={() => setQuickProductModalOpen(false)}
          onSuccess={(newProduct) => {
            handleAddProduct(newProduct.id);
            setQuickProductModalOpen(false);
          }}
        />
      )}

      {/* UNIVERSAL INVOICE MODALS FOR REAL PURCHASE & DEBIT NOTE DATA */}
      {selectedPurchaseInvoice && (
        <InvoiceModal
          open={Boolean(selectedPurchaseInvoice)}
          onClose={() => setSelectedPurchaseInvoice(null)}
          {...purchaseToInvoiceProps(selectedPurchaseInvoice, db)}
        />
      )}

      {selectedDebitNoteInvoice && (
        <InvoiceModal
          open={Boolean(selectedDebitNoteInvoice)}
          onClose={() => setSelectedDebitNoteInvoice(null)}
          {...debitNoteToInvoiceProps(selectedDebitNoteInvoice, db)}
        />
      )}
    </div>
  );
}
