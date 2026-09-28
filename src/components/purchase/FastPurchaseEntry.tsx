import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Field, Input, Modal, Select } from "../ui";
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import type { LineItem, PaymentMode, Purchase, Supplier } from "@/lib/types";
import { ImeiScannerModal } from "../ImeiScannerModal";
import { QuickAddDealerModal } from "./QuickAddDealerModal";
import { FastAddProductModal } from "./FastAddProductModal";
import { BulkImeiModal } from "./BulkImeiModal";
import { QuickProductModal } from "../QuickProductModal";

interface FastPurchaseEntryProps {
  onSavedPurchase: (purchase: Purchase) => void;
  onViewInvoice?: (purchase: Purchase) => void;
  onOpenAddPayment?: (purchase: Purchase) => void;
}

export function FastPurchaseEntry({
  onSavedPurchase,
  onViewInvoice,
  onOpenAddPayment,
}: FastPurchaseEntryProps) {
  const { db, recordPurchase, refreshFromBackend } = useStore();

  // Mobile active step: 1 (Dealer+Bill), 2 (Products), 3 (Payment)
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1);

  // STEP 1: DEALER + BILL
  const [purchaseType, setPurchaseType] = useState<"GST" | "NON_GST">("GST");
  const [purchaseMode, setPurchaseMode] = useState<"Regular Purchase" | "Opening Purchase" | "Other">("Regular Purchase");
  const [selectedDealerId, setSelectedDealerId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("last_selected_dealer_id") || db.suppliers[0]?.id || "";
      } catch {
        // fallback
      }
    }
    return db.suppliers[0]?.id || "";
  });
  const [dealerSearchQuery, setDealerSearchQuery] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayISO());

  // Progressive Disclosure: "More Bill Details"
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [referenceNo, setReferenceNo] = useState("");
  const [referenceDate, setReferenceDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [transport, setTransport] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [deliveryNoteNo, setDeliveryNoteNo] = useState("");
  const [deliveryNoteDate, setDeliveryNoteDate] = useState("");
  const [dispatchDocNo, setDispatchDocNo] = useState("");
  const [dispatchDocDate, setDispatchDocDate] = useState("");
  const [destination, setDestination] = useState("");
  const [termsOfDelivery, setTermsOfDelivery] = useState("Door Delivery");
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [otherReferences, setOtherReferences] = useState("");
  const [placeOfSupply, setPlaceOfSupply] = useState("Madhya Pradesh");
  const [stateCode, setStateCode] = useState("23");
  const [notes, setNotes] = useState("");

  // Attachments & OCR
  const [attachments, setAttachments] = useState<
    Array<{ fileName: string; fileType: string; fileSize?: number; fileData: string }>
  >([]);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [ocrConfirmModalOpen, setOcrConfirmModalOpen] = useState(false);

  // STEP 2: PRODUCTS / INWARD ITEMS
  const [items, setItems] = useState<LineItem[]>([]);
  const [imeisByProduct, setImeisByProduct] = useState<Record<string, string[]>>({});
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline single IMEI input state: { [productId]: text }
  const [inlineImeiInputs, setInlineImeiInputs] = useState<Record<string, string>>({});

  // Modals
  const [addDealerModalOpen, setAddDealerModalOpen] = useState(false);
  const [addProductModalOpen, setAddProductModalOpen] = useState(false);
  const [quickProductHierarchyOpen, setQuickProductHierarchyOpen] = useState(false);
  const [scannerProduct, setScannerProduct] = useState<{ id: string; name: string; qty: number } | null>(null);
  const [bulkImeiProduct, setBulkImeiProduct] = useState<{ id: string; name: string; qty: number } | null>(null);

  // STEP 3: PAYMENT
  const [paid, setPaid] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMode>("Cash");
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentAccounts, setPaymentAccounts] = useState<any[]>([]);

  // Additional Charges & TDS inside progressive disclosure
  const [showAdditionalFinancials, setShowAdditionalFinancials] = useState(false);
  const [otherCharges, setOtherCharges] = useState(0);
  const [roundOff, setRoundOff] = useState(0);
  const [tdsApplicable, setTdsApplicable] = useState(false);
  const [tdsRate, setTdsRate] = useState(10);
  const [tdsSection, setTdsSection] = useState("TDS 194R Payable @ 10%");

  // Save State & Modals
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [successSavedPurchase, setSuccessSavedPurchase] = useState<Purchase | null>(null);

  // Fetch payment accounts
  useEffect(() => {
    fetch("/api/payment-accounts")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setPaymentAccounts(data);
        }
      })
      .catch(() => {});
  }, []);

  // Update default account when payment method changes
  useEffect(() => {
    if (paymentMethod === "UPI") {
      const upiAccounts = paymentAccounts.filter((a) => a.accountType === "UPI" && a.status === "ACTIVE");
      const defaultUpi = upiAccounts.find((a) => a.isDefault) || upiAccounts[0];
      setSelectedAccountId(defaultUpi?.id || "");
    } else if (paymentMethod === "Bank") {
      const bankAccounts = paymentAccounts.filter((a) => a.accountType === "BANK" && a.status === "ACTIVE");
      const defaultBank = bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
      setSelectedAccountId(defaultBank?.id || "");
    } else {
      setSelectedAccountId("");
    }
  }, [paymentMethod, paymentAccounts]);

  // Selected Dealer details
  const selectedDealer = useMemo(() => {
    return db.suppliers.find((s) => s.id === selectedDealerId);
  }, [db.suppliers, selectedDealerId]);

  // Sync state code from dealer
  useEffect(() => {
    if (selectedDealer) {
      const sc = selectedDealer.stateCode || (selectedDealer.gstin ? selectedDealer.gstin.substring(0, 2) : "23");
      setStateCode(sc);
      setPlaceOfSupply(sc === "23" ? "Madhya Pradesh" : selectedDealer.state || "Other State");
      localStorage.setItem("last_selected_dealer_id", selectedDealer.id);
    }
  }, [selectedDealer]);

  const isIntrastate = stateCode === "23";

  // Filtered dealers for search
  const filteredDealers = useMemo(() => {
    const q = dealerSearchQuery.trim().toLowerCase();
    if (!q) return db.suppliers;
    return db.suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.phone && s.phone.includes(q)) ||
        (s.gstin && s.gstin.toLowerCase().includes(q))
    );
  }, [db.suppliers, dealerSearchQuery]);

  // Check duplicate invoice live
  useEffect(() => {
    if (!selectedDealerId || !invoiceNo.trim()) {
      setDuplicateWarning(null);
      return;
    }

    const trimmedInv = invoiceNo.trim().toLowerCase();
    const existing = db.purchases.find(
      (p) =>
        (p.supplierId === selectedDealerId || p.dealerId === selectedDealerId) &&
        p.invoiceNo.trim().toLowerCase() === trimmedInv
    );

    if (existing) {
      setDuplicateWarning(existing);
    } else {
      setDuplicateWarning(null);
    }
  }, [selectedDealerId, invoiceNo, db.purchases]);

  // Quick Product Search Matches
  const productSearchResults = useMemo(() => {
    const q = productSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return db.products
      .filter((p) => {
        return (
          p.name.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.model?.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.sku && p.sku.toLowerCase().includes(q))
        );
      })
      .slice(0, 8);
  }, [db.products, productSearchQuery]);

  // Fast add product from quick search selection
  const handleSelectProductFromSearch = (prod: any) => {
    const gst = purchaseType === "NON_GST" ? 0 : prod.gst || 18;
    const rate = prod.purchasePrice || 1000;
    const rateIncl = gst > 0 ? Math.round(rate * (1 + gst / 100) * 100) / 100 : rate;

    // Check if already in items
    const existingIdx = items.findIndex((i) => i.productId === prod.id);
    if (existingIdx >= 0) {
      // Increment qty
      setItems((curr) => {
        const copy = [...curr];
        const prev = copy[existingIdx]!;
        copy[existingIdx] = { ...prev, qty: prev.qty + 1 };
        return copy;
      });
    } else {
      setItems((curr) => [
        ...curr,
        {
          productId: prod.id,
          name: prod.name,
          hsnSac: prod.hsn || "85171300",
          qty: 1,
          unit: "pcs",
          price: rate,
          costPrice: rate,
          rateExcludingTax: rate,
          rateIncludingTax: rateIncl,
          discountPct: 0,
          discountAmount: 0,
          taxableAmount: rate,
          gst,
          gstRate: gst,
          cgstPct: isIntrastate ? gst / 2 : 0,
          cgstAmount: isIntrastate ? Math.round(rate * (gst / 200) * 100) / 100 : 0,
          sgstPct: isIntrastate ? gst / 2 : 0,
          sgstAmount: isIntrastate ? Math.round(rate * (gst / 200) * 100) / 100 : 0,
          igstPct: !isIntrastate ? gst : 0,
          igstAmount: !isIntrastate ? Math.round(rate * (gst / 100) * 100) / 100 : 0,
          totalAmount: rateIncl,
        },
      ]);
    }

    setProductSearchQuery("");
    setSearchFocused(false);
  };

  // Add product from FastAddProductModal
  const handleAddProductFromModal = (newItem: {
    productId: string;
    name: string;
    qty: number;
    price: number;
    gstRate: number;
    hsnSac: string;
    tracked: boolean;
    sellingPrice?: number;
    mrp?: number;
  }) => {
    const rate = newItem.price;
    const gst = purchaseType === "NON_GST" ? 0 : newItem.gstRate;
    const rateIncl = gst > 0 ? Math.round(rate * (1 + gst / 100) * 100) / 100 : rate;

    setItems((curr) => [
      ...curr,
      {
        productId: newItem.productId,
        name: newItem.name,
        hsnSac: newItem.hsnSac || "85171300",
        qty: newItem.qty,
        unit: "pcs",
        price: rate,
        costPrice: rate,
        rateExcludingTax: rate,
        rateIncludingTax: rateIncl,
        discountPct: 0,
        discountAmount: 0,
        taxableAmount: rate * newItem.qty,
        gst,
        gstRate: gst,
        cgstPct: isIntrastate ? gst / 2 : 0,
        cgstAmount: isIntrastate ? Math.round(rate * newItem.qty * (gst / 200) * 100) / 100 : 0,
        sgstPct: isIntrastate ? gst / 2 : 0,
        sgstAmount: isIntrastate ? Math.round(rate * newItem.qty * (gst / 200) * 100) / 100 : 0,
        igstPct: !isIntrastate ? gst : 0,
        igstAmount: !isIntrastate ? Math.round(rate * newItem.qty * (gst / 100) * 100) / 100 : 0,
        totalAmount: rateIncl * newItem.qty,
      },
    ]);

    // Focus search input for rapid consecutive additions
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 100);
  };

  // Remove item row
  const handleRemoveItem = (index: number) => {
    const item = items[index];
    if (item) {
      setImeisByProduct((prev) => {
        const copy = { ...prev };
        delete copy[item.productId];
        return copy;
      });
    }
    setItems((curr) => curr.filter((_, i) => i !== index));
  };

  // Update item field
  const handleUpdateItem = (index: number, patch: Partial<LineItem>) => {
    setItems((curr) => {
      const copy = [...curr];
      copy[index] = { ...copy[index]!, ...patch };
      return copy;
    });
  };

  // Calculated Items
  const calculatedItems = useMemo(() => {
    return items.map((item) => {
      const qty = Math.max(1, item.qty || 1);
      const gstRate = purchaseType === "NON_GST" ? 0 : item.gstRate !== undefined ? item.gstRate : item.gst || 18;
      const rateExcl = item.rateExcludingTax !== undefined ? item.rateExcludingTax : item.price;
      const rateIncl = gstRate > 0 ? Math.round(rateExcl * (1 + gstRate / 100) * 100) / 100 : rateExcl;

      const gross = rateExcl * qty;
      const discountPct = item.discountPct || 0;
      const discountAmount = item.discountAmount || Math.round(((gross * discountPct) / 100) * 100) / 100;
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
        price: rateExcl,
        costPrice: rateExcl,
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

  // Financial totals
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

  // IMEI manual inline add
  const handleAddInlineImei = (productId: string) => {
    const text = (inlineImeiInputs[productId] || "").trim();
    if (!text) return;

    if (!/^\d{14,16}$/.test(text)) {
      setErrorMessage(`Invalid IMEI '${text}'. Standard mobile IMEIs contain 14–16 digits.`);
      return;
    }

    // Check duplicate in bill
    const allBillImeis = Object.values(imeisByProduct).flat();
    if (allBillImeis.includes(text)) {
      setErrorMessage(`IMEI ${text} is already entered in this purchase.`);
      return;
    }

    // Check duplicate in inventory
    const existingUnit = db.units.find((u) => u.imei1 === text || u.imei2 === text);
    if (existingUnit) {
      setErrorMessage(`IMEI ${text} already exists in store inventory stock.`);
      return;
    }

    const currentList = imeisByProduct[productId] || [];
    const item = items.find((i) => i.productId === productId);
    if (item && currentList.length >= item.qty) {
      setErrorMessage(`Required quantity of ${item.qty} IMEI(s) already reached.`);
      return;
    }

    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: [...currentList, text],
    }));

    setInlineImeiInputs((prev) => ({ ...prev, [productId]: "" }));
    setErrorMessage("");
  };

  const handleRemoveImei = (productId: string, imeiToRemove: string) => {
    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: (prev[productId] || []).filter((im) => im !== imeiToRemove),
    }));
  };

  // REPEAT LAST PURCHASE MODE
  const handleRepeatLastPurchase = () => {
    // Find most recent purchase from this dealer, or most recent overall
    let candidate = db.purchases.find(
      (p) => p.supplierId === selectedDealerId || p.dealerId === selectedDealerId
    );
    if (!candidate && db.purchases.length > 0) {
      candidate = db.purchases[0];
    }

    if (!candidate || !candidate.items || candidate.items.length === 0) {
      alert("No previous purchase record found to repeat.");
      return;
    }

    // Load items but clear IMEIs and reset invoice number
    setPurchaseType(candidate.purchaseType || "GST");
    if (candidate.supplierId) {
      setSelectedDealerId(candidate.supplierId);
    }

    const repeatedItems: LineItem[] = candidate.items.map((i) => ({
      ...i,
      imeis: [],
      imei: undefined,
    }));

    setItems(repeatedItems);
    setImeisByProduct({});
    setInvoiceNo(""); // Empty so user inputs new invoice number
    setPaid(0);

    alert(
      `Loaded ${candidate.items.length} product(s) from previous bill (${candidate.invoiceNo}). Please enter new Invoice Number & IMEIs.`
    );
  };

  // OCR Invoice Extraction
  const triggerExtraction = async (payload: { fileName?: string; text?: string; base64?: string; mimeType?: string }) => {
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
        setOcrConfirmModalOpen(true);
      } else {
        setErrorMessage("Could not extract invoice details automatically. You can enter details manually.");
      }
    } catch {
      setErrorMessage("Extraction service unreachable. Proceeding manually.");
    } finally {
      setExtracting(false);
    }
  };

  // Apply OCR Result
  const handleApplyOcrResult = () => {
    if (!extractionResult) return;
    const { dealer, invoice, items: extItems } = extractionResult;

    if (dealer?.id) {
      setSelectedDealerId(dealer.id);
    } else if (dealer?.name) {
      const found = db.suppliers.find(
        (s) => s.name.toLowerCase() === dealer.name.toLowerCase() || (s.gstin && s.gstin === dealer.gstin)
      );
      if (found) {
        setSelectedDealerId(found.id);
      }
    }

    if (invoice?.invoiceNo) setInvoiceNo(invoice.invoiceNo);
    if (invoice?.date) setInvoiceDate(invoice.date);

    if (Array.isArray(extItems) && extItems.length > 0) {
      const newItems: LineItem[] = [];
      const newImeis: Record<string, string[]> = {};

      extItems.forEach((ei: any) => {
        let prodId = ei.matchedProductId;
        if (!prodId) {
          const match = db.products.find(
            (p) => p.name.toLowerCase().includes((ei.name || "").toLowerCase().slice(0, 8))
          );
          prodId = match?.id || db.products[0]?.id || "p1";
        }

        const qty = ei.qty || 1;
        const rate = ei.rateExcludingTax || 1000;
        const gst = ei.gstRate || 18;

        newItems.push({
          productId: prodId,
          name: ei.name || "Purchased Phone",
          hsnSac: ei.hsnSac || "85171300",
          qty,
          unit: "pcs",
          price: rate,
          costPrice: rate,
          rateExcludingTax: rate,
          rateIncludingTax: ei.rateIncludingTax || rate * (1 + gst / 100),
          discountPct: 0,
          discountAmount: 0,
          taxableAmount: rate * qty,
          gst,
          gstRate: gst,
          cgstPct: isIntrastate ? gst / 2 : 0,
          cgstAmount: isIntrastate ? Math.round(rate * qty * (gst / 200) * 100) / 100 : 0,
          sgstPct: isIntrastate ? gst / 2 : 0,
          sgstAmount: isIntrastate ? Math.round(rate * qty * (gst / 200) * 100) / 100 : 0,
          igstPct: !isIntrastate ? gst : 0,
          igstAmount: !isIntrastate ? Math.round(rate * qty * (gst / 100) * 100) / 100 : 0,
          totalAmount: (ei.rateIncludingTax || rate * (1 + gst / 100)) * qty,
        });

        if (ei.imeis && ei.imeis.length > 0) {
          newImeis[prodId] = ei.imeis;
        }
      });

      setItems(newItems);
      setImeisByProduct(newImeis);
    }

    setOcrConfirmModalOpen(false);
  };

  // Keyboard Shortcuts: Ctrl + Enter to Save, ESC to close modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSavePurchase();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDealerId, invoiceNo, calculatedItems, paid, grandTotal]);

  // FINAL SAVE PURCHASE
  const handleSavePurchase = async (allowDuplicate = false) => {
    setErrorMessage("");

    if (!selectedDealerId) {
      setErrorMessage("Please select a Dealer.");
      setMobileStep(1);
      return;
    }

    if (!invoiceNo.trim()) {
      setErrorMessage("Invoice Number is required.");
      setMobileStep(1);
      return;
    }

    if (items.length === 0) {
      setErrorMessage("Please add at least one product to the purchase.");
      setMobileStep(2);
      return;
    }

    // Check duplicate invoice if not overriding
    if (duplicateWarning && !allowDuplicate) {
      return; // Handled by duplicate warning UI modal
    }

    // Validate IMEIs for tracked products
    for (const item of calculatedItems) {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod?.tracked) {
        const entered = (imeisByProduct[item.productId] || []).length;
        if (entered !== item.qty) {
          setErrorMessage(
            `Product '${item.name}' requires ${item.qty} IMEI(s), but only ${entered} entered. Please scan or enter all IMEIs.`
          );
          setMobileStep(2);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const created = await recordPurchase({
        purchaseType,
        purchaseMode,
        dealerId: selectedDealerId,
        supplierId: selectedDealerId,
        invoiceNo: invoiceNo.trim(),
        date: invoiceDate,
        originalInvoiceNo: referenceNo || undefined,
        referenceNo: referenceNo || undefined,
        dueDate: dueDate || undefined,
        dispatchedThrough: transport || undefined,
        destination: destination || undefined,
        termsOfDelivery: termsOfDelivery || undefined,
        paymentTerms: paymentTerms || undefined,
        deliveryNoteNo: deliveryNoteNo || undefined,
        deliveryNoteDate: deliveryNoteDate || undefined,
        dispatchDocNo: dispatchDocNo || undefined,
        dispatchDocDate: dispatchDocDate || undefined,
        otherReferences: vehicleNo ? `Vehicle: ${vehicleNo}` : otherReferences || undefined,
        placeOfSupply,
        stateCode,
        items: calculatedItems,
        imeis: imeisByProduct,
        otherCharges,
        roundOff,
        tdsApplicable,
        tdsSection: tdsApplicable ? tdsSection : undefined,
        tdsRate: tdsApplicable ? tdsRate : 0,
        tdsAmount,
        paid: Number(paid) || 0,
        mode: paymentMethod,
        paymentAccountId: selectedAccountId || undefined,
        allowDuplicate,
        attachments,
      });

      // Show success modal
      setSuccessSavedPurchase(created);
      onSavedPurchase(created);

      // Reset form state for fast next entry
      setItems([]);
      setImeisByProduct({});
      setInvoiceNo("");
      setPaid(0);
      setOtherCharges(0);
      setAttachments([]);
      setDuplicateWarning(null);
      setMobileStep(1);
    } catch (err: any) {
      setErrorMessage(
        err.message || "Purchase could not be saved. No stock or payment changes were made."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border border-border/80 bg-white/70 shadow-xs">
        <div className="flex items-center gap-3">
          <span className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">
            PURCHASE TYPE:
          </span>
          <div className="inline-flex rounded-xl p-1 bg-muted/60 border border-border/60">
            <button
              type="button"
              onClick={() => setPurchaseType("GST")}
              className={`px-3.5 py-1 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                purchaseType === "GST"
                  ? "bg-primary text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              GST PURCHASE
            </button>
            <button
              type="button"
              onClick={() => setPurchaseType("NON_GST")}
              className={`px-3.5 py-1 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                purchaseType === "NON_GST"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              NON-GST PURCHASE
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Repeat Last Purchase */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRepeatLastPurchase}
            title="Load products from previous purchase to quickly re-order"
            className="text-[11.5px] h-8.5 gap-1.5"
          >
            <span>🔁</span> Repeat Last Purchase
          </Button>

          {/* Quick OCR / Bill Upload */}
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary text-[11.5px] font-semibold transition-all h-8.5">
              📎 Upload Bill (PDF/Img)
            </span>
          </label>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-destructive font-medium flex items-center justify-between animate-in-soft">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage("")}
            className="text-xs font-bold underline ml-2 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Duplicate Invoice Warning Alert */}
      {duplicateWarning && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-amber-900 flex flex-wrap items-center justify-between gap-2 shadow-xs animate-in-soft">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠️</span>
            <div>
              <span className="font-bold text-[12.5px]">Purchase invoice already exists for this dealer: </span>
              <span className="text-[12px] font-mono">Invoice #{duplicateWarning.invoiceNo} (₹{duplicateWarning.total})</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onViewInvoice && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px] bg-white"
                onClick={() => onViewInvoice(duplicateWarning)}
              >
                View Existing Purchase
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="danger"
              className="h-7 text-[11px]"
              onClick={() => handleSavePurchase(true)}
              disabled={isSubmitting}
            >
              Proceed Anyway (Override)
            </Button>
          </div>
        </div>
      )}

      {/* Mobile Step Stepper Navigation (hidden on desktop) */}
      <div className="lg:hidden flex rounded-xl border border-border/80 bg-white p-1 gap-1 text-[12px] font-semibold">
        <button
          type="button"
          onClick={() => setMobileStep(1)}
          className={`flex-1 py-1.5 rounded-lg text-center ${
            mobileStep === 1 ? "bg-primary text-white" : "text-muted-foreground"
          }`}
        >
          1. Dealer & Bill
        </button>
        <button
          type="button"
          onClick={() => setMobileStep(2)}
          className={`flex-1 py-1.5 rounded-lg text-center ${
            mobileStep === 2 ? "bg-primary text-white" : "text-muted-foreground"
          }`}
        >
          2. Products ({items.length})
        </button>
        <button
          type="button"
          onClick={() => setMobileStep(3)}
          className={`flex-1 py-1.5 rounded-lg text-center ${
            mobileStep === 3 ? "bg-primary text-white" : "text-muted-foreground"
          }`}
        >
          3. Payment
        </button>
      </div>

      {/* MAIN TWO-COLUMN DESKTOP LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: Dealer + Bill, Products, Payment (8 of 12 cols on desktop) */}
        <div className="lg:col-span-8 space-y-4">
          {/* ================================================== */}
          {/* STEP 1: DEALER + BILL (Compact 2-column horizontal) */}
          {/* ================================================== */}
          <div className={`${mobileStep === 1 ? "block" : "hidden lg:block"} p-4 rounded-2xl border border-border/80 bg-white/80 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between pb-1 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  1
                </span>
                <span className="text-[13px] font-bold tracking-tight text-foreground uppercase">
                  DEALER & BILL DETAILS
                </span>
              </div>
              <span className="text-[11px] text-muted-foreground">Required *</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Dealer Select with Search & + Add Dealer */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Dealer / Supplier *
                </label>
                <div className="flex gap-1.5">
                  <Select
                    value={selectedDealerId}
                    onChange={(e) => setSelectedDealerId(e.target.value)}
                    className="flex-1 h-9 text-[12.5px] font-medium"
                    required
                  >
                    <option value="" disabled>
                      Select Dealer...
                    </option>
                    {filteredDealers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} {d.gstin ? `(${d.gstin})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 px-2.5 text-[11px] whitespace-nowrap text-primary border-primary/30 hover:bg-primary/5"
                    onClick={() => setAddDealerModalOpen(true)}
                  >
                    + Add Dealer
                  </Button>
                </div>
              </div>

              {/* Invoice Number */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Invoice Number *
                </label>
                <Input
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  placeholder="e.g. 12345 or INV-098"
                  className="h-9 text-[12.5px] font-semibold font-mono"
                  required
                />
              </div>

              {/* Invoice Date */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Invoice Date *
                </label>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-9 text-[12.5px]"
                  required
                />
              </div>

              {/* Purchase Mode */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Purchase Mode
                </label>
                <Select
                  value={purchaseMode}
                  onChange={(e) => setPurchaseMode(e.target.value as any)}
                  className="h-9 text-[12.5px]"
                >
                  <option value="Regular Purchase">Regular Purchase</option>
                  <option value="Opening Purchase">Opening Purchase</option>
                  <option value="Other">Other</option>
                </Select>
              </div>
            </div>

            {/* Progressive Disclosure: More Bill Details */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowMoreDetails(!showMoreDetails)}
                className="text-[11.5px] text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{showMoreDetails ? "− Hide Extra Bill Details" : "+ More Bill Details (Transport, Due Date, Delivery Note)"}</span>
              </button>

              {showMoreDetails && (
                <div className="mt-2.5 p-3 rounded-xl border border-border/80 bg-muted/15 grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-in-soft">
                  <Field label="Reference No">
                    <Input
                      value={referenceNo}
                      onChange={(e) => setReferenceNo(e.target.value)}
                      placeholder="PO / Ref"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Reference Date">
                    <Input
                      type="date"
                      value={referenceDate}
                      onChange={(e) => setReferenceDate(e.target.value)}
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Due Date">
                    <Input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Payment Terms">
                    <Input
                      value={paymentTerms}
                      onChange={(e) => setPaymentTerms(e.target.value)}
                      placeholder="e.g. 30 Days"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>

                  <Field label="Transport (Dispatched Through)">
                    <Input
                      value={transport}
                      onChange={(e) => setTransport(e.target.value)}
                      placeholder="e.g. V-Trans / Courier"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Vehicle No">
                    <Input
                      value={vehicleNo}
                      onChange={(e) => setVehicleNo(e.target.value)}
                      placeholder="e.g. MP-09-AB-1234"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Delivery Note No">
                    <Input
                      value={deliveryNoteNo}
                      onChange={(e) => setDeliveryNoteNo(e.target.value)}
                      placeholder="DN Number"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>
                  <Field label="Dispatch Doc No">
                    <Input
                      value={dispatchDocNo}
                      onChange={(e) => setDispatchDocNo(e.target.value)}
                      placeholder="LR / Doc No"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>

                  <div className="col-span-2 sm:col-span-4">
                    <Field label="Notes / Other References">
                      <Input
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Additional notes for purchase entry..."
                        className="h-8 text-[11.5px]"
                      />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile next step button */}
            <div className="lg:hidden flex justify-end pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setMobileStep(2)}
              >
                Next: Add Products →
              </Button>
            </div>
          </div>

          {/* ================================================== */}
          {/* STEP 2: PRODUCTS / INWARD ITEMS (Compact Table) */}
          {/* ================================================== */}
          <div className={`${mobileStep === 2 ? "block" : "hidden lg:block"} p-4 rounded-2xl border border-border/80 bg-white/80 shadow-xs space-y-3`}>
            {/* Header + Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  2
                </span>
                <span className="text-[13px] font-bold tracking-tight text-foreground uppercase">
                  PRODUCTS / INWARD ITEMS ({items.length})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="h-8 px-3 text-[11.5px] gap-1 shadow-xs"
                  onClick={() => setAddProductModalOpen(true)}
                >
                  <span>+</span> ADD PRODUCT
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-[11px] gap-1"
                  onClick={() => setQuickProductHierarchyOpen(true)}
                  title="Create brand new product in master hierarchy"
                >
                  + Add New Master Product
                </Button>
              </div>
            </div>

            {/* QUICK PRODUCT SEARCH BAR (supports Product Name, Brand, Model, Barcode, IMEI) */}
            <div className="relative">
              <div className="relative flex items-center">
                <span className="absolute left-3 text-muted-foreground text-sm">🔍</span>
                <input
                  ref={searchInputRef}
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  placeholder="Quick Product Search by Name, Brand, Model, Barcode, or IMEI (e.g. OPPO F33, Vivo V30)..."
                  className="w-full h-9.5 pl-8.5 pr-4 rounded-xl border border-border/90 bg-white text-[12.5px] font-medium placeholder:text-muted-foreground/60 outline-none focus:border-primary focus:ring-3 focus:ring-primary/10 transition-all shadow-2xs"
                />
                {productSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setProductSearchQuery("")}
                    className="absolute right-3 text-xs text-muted-foreground hover:text-foreground font-bold"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Quick Search Dropdown Menu */}
              {searchFocused && productSearchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded-xl border border-border/90 bg-white/95 backdrop-blur-md shadow-xl overflow-hidden divide-y divide-border/60 max-h-64 overflow-y-auto">
                  {productSearchResults.map((prod) => (
                    <button
                      key={prod.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectProductFromSearch(prod);
                      }}
                      className="w-full px-3.5 py-2.5 text-left flex items-center justify-between hover:bg-primary/5 transition-colors cursor-pointer group"
                    >
                      <div>
                        <div className="text-[12.5px] font-bold text-foreground group-hover:text-primary">
                          {prod.name}
                        </div>
                        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
                          <span>{prod.brand}</span>
                          <span>•</span>
                          <span>{prod.category}</span>
                          {prod.tracked && <Badge tone="info">IMEI Required</Badge>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[12.5px] font-mono font-bold text-foreground">
                          ₹{prod.purchasePrice?.toLocaleString("en-IN") || "0"}
                        </div>
                        <div className="text-[10.5px] text-muted-foreground">
                          GST: {purchaseType === "NON_GST" ? "0%" : `${prod.gst || 18}%`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* COMPACT EDITABLE PRODUCT TABLE */}
            {items.length === 0 ? (
              <div className="p-8 text-center rounded-xl border border-dashed border-border/80 bg-muted/10 space-y-2">
                <div className="text-3xl opacity-40">📱</div>
                <div className="text-[13px] font-semibold text-foreground">No products added yet</div>
                <div className="text-[11.5px] text-muted-foreground max-w-sm mx-auto">
                  Search product name above or click <strong>+ ADD PRODUCT</strong> to select from Category & Brand cascade.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border/80">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border/80">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3 min-w-[180px]">IMEI / Serial</th>
                      <th className="py-2.5 px-3 w-16 text-center">Qty</th>
                      <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                      {purchaseType === "GST" && (
                        <th className="py-2.5 px-3 w-16 text-center">GST %</th>
                      )}
                      <th className="py-2.5 px-3 w-28 text-right">Amount (₹)</th>
                      <th className="py-2.5 px-2 w-10 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {calculatedItems.map((item, idx) => {
                      const prod = db.products.find((p) => p.id === item.productId);
                      const isTracked = Boolean(prod?.tracked || item.gstRate !== undefined);
                      const itemImeis = imeisByProduct[item.productId] || [];
                      const isComplete = itemImeis.length >= item.qty;

                      return (
                        <tr key={`${item.productId}_${idx}`} className="hover:bg-muted/10 transition-colors">
                          {/* Product Name */}
                          <td className="py-2 px-3 align-top">
                            <div className="font-semibold text-foreground text-[12.5px]">
                              {item.name}
                            </div>
                            <div className="text-[10.5px] text-muted-foreground font-mono">
                              HSN: {item.hsnSac || "85171300"}
                            </div>
                          </td>

                          {/* IMEI / Serial Details */}
                          <td className="py-2 px-3 align-top space-y-1.5">
                            {prod?.tracked ? (
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <Badge tone={isComplete ? "success" : "warning"}>
                                    {isComplete ? `✓ ${itemImeis.length}/${item.qty}` : `${itemImeis.length}/${item.qty} IMEIs`}
                                  </Badge>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setScannerProduct({
                                        id: item.productId,
                                        name: item.name,
                                        qty: item.qty,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-primary/10 text-primary hover:bg-primary/20 transition-all cursor-pointer flex items-center gap-1"
                                    title="Open camera barcode / QR scanner"
                                  >
                                    <span>📷</span> SCAN
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setBulkImeiProduct({
                                        id: item.productId,
                                        name: item.name,
                                        qty: item.qty,
                                      })
                                    }
                                    className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-muted hover:bg-muted/80 text-foreground transition-all cursor-pointer"
                                    title="Paste multiple IMEIs at once"
                                  >
                                    📋 Bulk Paste
                                  </button>
                                </div>

                                {/* Scanned IMEIs chips */}
                                {itemImeis.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1 max-h-16 overflow-y-auto">
                                    {itemImeis.map((im, i) => (
                                      <span
                                        key={im}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white border border-border/80 font-mono text-[10px] text-foreground"
                                      >
                                        <span className="text-muted-foreground">#{i + 1}</span>
                                        <strong>{im}</strong>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveImei(item.productId, im)}
                                          className="text-muted-foreground hover:text-destructive text-xs font-bold leading-none"
                                        >
                                          ×
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Quick inline single IMEI input if not reached qty */}
                                {!isComplete && (
                                  <div className="flex gap-1 mt-1">
                                    <input
                                      value={inlineImeiInputs[item.productId] || ""}
                                      onChange={(e) =>
                                        setInlineImeiInputs((prev) => ({
                                          ...prev,
                                          [item.productId]: e.target.value,
                                        }))
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleAddInlineImei(item.productId);
                                        }
                                      }}
                                      placeholder="Type / scan IMEI & hit Enter"
                                      className="h-6.5 w-full rounded border border-border/80 px-2 text-[10.5px] font-mono outline-none focus:border-primary"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleAddInlineImei(item.productId)}
                                      className="px-1.5 py-0.5 rounded bg-primary text-white text-[10px] font-bold"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-[11px] text-muted-foreground italic">
                                Non-IMEI (Qty Tracked)
                              </span>
                            )}
                          </td>

                          {/* Editable Qty */}
                          <td className="py-2 px-3 align-top text-center">
                            <input
                              type="number"
                              min="1"
                              value={item.qty}
                              onChange={(e) =>
                                handleUpdateItem(idx, { qty: Math.max(1, Number(e.target.value)) })
                              }
                              className="h-7 w-14 rounded-lg border border-border/80 px-1 text-center font-mono font-bold text-[12px] outline-none focus:border-primary"
                            />
                          </td>

                          {/* Editable Rate */}
                          <td className="py-2 px-3 align-top text-right">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.rateExcludingTax}
                              onChange={(e) =>
                                handleUpdateItem(idx, {
                                  rateExcludingTax: Number(e.target.value),
                                  price: Number(e.target.value),
                                })
                              }
                              className="h-7 w-24 rounded-lg border border-border/80 px-2 text-right font-mono font-semibold text-[12px] outline-none focus:border-primary text-emerald-700"
                            />
                          </td>

                          {/* GST % (hidden for Non-GST) */}
                          {purchaseType === "GST" && (
                            <td className="py-2 px-3 align-top text-center font-mono text-[11.5px]">
                              {item.gstRate}%
                            </td>
                          )}

                          {/* Total Amount */}
                          <td className="py-2 px-3 align-top text-right font-mono font-bold text-[12.5px] text-foreground">
                            ₹{item.totalAmount?.toLocaleString("en-IN") || "0"}
                          </td>

                          {/* Delete row */}
                          <td className="py-2 px-2 align-top text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(idx)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors text-sm cursor-pointer"
                              title="Delete Item"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Mobile stepper buttons */}
            <div className="lg:hidden flex justify-between pt-2 border-t border-border/60">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setMobileStep(1)}
              >
                ← Back
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setMobileStep(3)}
              >
                Next: Payment →
              </Button>
            </div>
          </div>

          {/* ================================================== */}
          {/* STEP 3: PAYMENT + ACCOUNTS (Compact Payment Form) */}
          {/* ================================================== */}
          <div className={`${mobileStep === 3 ? "block" : "hidden lg:block"} p-4 rounded-2xl border border-border/80 bg-white/80 shadow-xs space-y-3`}>
            <div className="flex items-center justify-between pb-1 border-b border-border/60">
              <div className="flex items-center gap-2">
                <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[11px] font-bold">
                  3
                </span>
                <span className="text-[13px] font-bold tracking-tight text-foreground uppercase">
                  PAYMENT DETAILS
                </span>
              </div>
              <span className="text-[11.5px] font-mono text-muted-foreground">
                Bill Total: <strong>₹{grandTotal.toLocaleString("en-IN")}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Paid Amount */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Paid Amount (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={grandTotal}
                  value={paid}
                  onChange={(e) => setPaid(Math.max(0, Number(e.target.value)))}
                  placeholder="0.00"
                  className="h-9.5 text-[13px] font-mono font-bold text-primary"
                />
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {paid === 0 ? "Credit Purchase (Full Due)" : paid >= grandTotal ? "Full Payment" : "Partial Payment"}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  Payment Method
                </label>
                <Select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMode)}
                  className="h-9.5 text-[12.5px] font-medium"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI (Google Pay, PhonePe, etc.)</option>
                  <option value="Bank">Bank Account (NEFT/RTGS/IMPS/Cheque)</option>
                  <option value="Card">Card</option>
                  <option value="Credit">Credit (No Payment Now)</option>
                </Select>
              </div>

              {/* Account Selection if UPI or Bank */}
              <div>
                <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                  {paymentMethod === "UPI"
                    ? "UPI Account *"
                    : paymentMethod === "Bank"
                    ? "Bank Account *"
                    : "Payment Account"}
                </label>
                {paymentMethod === "UPI" ? (
                  <Select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-9.5 text-[12px] font-medium"
                    required={paid > 0}
                  >
                    <option value="">Select UPI Account...</option>
                    {paymentAccounts
                      .filter((a) => a.accountType === "UPI" && a.status === "ACTIVE")
                      .map((acct) => (
                        <option key={acct.id} value={acct.id}>
                          {acct.accountName} {acct.upiId ? `(${acct.upiId})` : ""}
                        </option>
                      ))}
                  </Select>
                ) : paymentMethod === "Bank" ? (
                  <Select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-9.5 text-[12px] font-medium"
                    required={paid > 0}
                  >
                    <option value="">Select Bank Account...</option>
                    {paymentAccounts
                      .filter((a) => a.accountType === "BANK" && a.status === "ACTIVE")
                      .map((acct) => (
                        <option key={acct.id} value={acct.id}>
                          {acct.accountName} {acct.bankName ? `(${acct.bankName})` : ""}
                        </option>
                      ))}
                  </Select>
                ) : (
                  <div className="h-9.5 flex items-center px-3 rounded-xl border border-border/60 bg-muted/20 text-[11.5px] text-muted-foreground">
                    Store Cash Drawer (Auto)
                  </div>
                )}
              </div>
            </div>

            {/* Collapsible Additional Charges & TDS */}
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowAdditionalFinancials(!showAdditionalFinancials)}
                className="text-[11.5px] text-muted-foreground font-semibold hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                <span>{showAdditionalFinancials ? "− Hide Charges & TDS" : "+ Additional Charges, Round-Off & TDS 194R"}</span>
              </button>

              {showAdditionalFinancials && (
                <div className="mt-2 p-3 rounded-xl border border-border/80 bg-muted/15 grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-in-soft">
                  <Field label="Other Charges (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={otherCharges}
                      onChange={(e) => setOtherCharges(Number(e.target.value))}
                      placeholder="0.00"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>

                  <Field label="Round Off (₹)">
                    <Input
                      type="number"
                      step="0.01"
                      value={roundOff}
                      onChange={(e) => setRoundOff(Number(e.target.value))}
                      placeholder="0.00"
                      className="h-8 text-[11.5px]"
                    />
                  </Field>

                  <div className="col-span-2 flex items-center gap-3 pt-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-[12px] font-semibold text-foreground">
                      <input
                        type="checkbox"
                        checked={tdsApplicable}
                        onChange={(e) => setTdsApplicable(e.target.checked)}
                        className="size-4 rounded text-primary border-border"
                      />
                      <span>TDS 194R Applicable (10%)</span>
                    </label>
                    {tdsApplicable && (
                      <span className="text-[11px] font-mono text-muted-foreground">
                        −₹{tdsAmount.toFixed(2)}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: STICKY PURCHASE SUMMARY (4 of 12 cols on desktop) */}
        <div className="lg:col-span-4 lg:sticky lg:top-4 space-y-3">
          <div className="p-4.5 rounded-2xl border border-border/80 bg-white shadow-md space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-border/70">
              <span className="text-[13px] font-bold text-foreground uppercase tracking-wider">
                Purchase Summary
              </span>
              <Badge tone={purchaseType === "GST" ? "info" : "success"}>
                {purchaseType}
              </Badge>
            </div>

            <div className="space-y-2 text-[12.5px]">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Total Items:</span>
                <strong className="text-foreground font-mono">{calculatedItems.length}</strong>
              </div>

              <div className="flex items-center justify-between text-muted-foreground">
                <span>Taxable Amount:</span>
                <strong className="text-foreground font-mono">₹{totalTaxable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
              </div>

              {purchaseType === "GST" && (
                <>
                  {isIntrastate ? (
                    <>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>CGST:</span>
                        <strong className="text-foreground font-mono">₹{totalCgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                      </div>
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>SGST:</span>
                        <strong className="text-foreground font-mono">₹{totalSgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>IGST:</span>
                      <strong className="text-foreground font-mono">₹{totalIgst.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
                    </div>
                  )}
                </>
              )}

              {otherCharges > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Other Charges:</span>
                  <strong className="text-foreground font-mono">+₹{otherCharges.toFixed(2)}</strong>
                </div>
              )}

              {tdsApplicable && tdsAmount > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>TDS 194R:</span>
                  <strong className="text-rose-600 font-mono">−₹{tdsAmount.toFixed(2)}</strong>
                </div>
              )}

              <div className="pt-2 border-t border-border/80 flex items-center justify-between">
                <span className="text-[14px] font-bold text-foreground">Grand Total:</span>
                <span className="text-xl font-bold font-mono text-foreground">
                  ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between text-emerald-700 font-medium">
                <span>Paid Amount:</span>
                <span className="font-mono font-bold">₹{paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>

              <div className="flex items-center justify-between text-rose-600 font-bold text-[13px] pt-1 border-t border-dashed border-border/70">
                <span>Due Balance:</span>
                <span className="font-mono">₹{dueAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            {/* SAVE PURCHASE BUTTON */}
            <div className="pt-2">
              <Button
                type="button"
                variant="primary"
                size="lg"
                onClick={() => handleSavePurchase(false)}
                disabled={isSubmitting || items.length === 0}
                className="w-full text-[13.5px] font-bold h-11 tracking-wide shadow-md"
              >
                {isSubmitting ? "Saving Purchase Bill..." : "✓ SAVE PURCHASE (Ctrl+Enter)"}
              </Button>
            </div>

            <div className="text-center text-[10.5px] text-muted-foreground">
              Instant stock inward, dealer ledger debit & payment account synchronization.
            </div>
          </div>
        </div>
      </div>

      {/* MOBILE STICKY BOTTOM BAR */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-3 bg-white/95 border-t border-border/80 backdrop-blur-md flex items-center justify-between gap-3 shadow-lg">
        <div>
          <div className="text-[10px] text-muted-foreground uppercase font-bold">Total / Due</div>
          <div className="text-[14px] font-bold font-mono text-foreground">
            ₹{grandTotal.toLocaleString("en-IN")} / <span className="text-rose-600">₹{dueAmount.toLocaleString("en-IN")}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mobileStep < 3 ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setMobileStep((s) => (s + 1) as any)}
            >
              Next Step →
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => handleSavePurchase(false)}
              disabled={isSubmitting || items.length === 0}
            >
              {isSubmitting ? "Saving..." : "✓ Save Purchase"}
            </Button>
          )}
        </div>
      </div>

      {/* MODAL: QUICK ADD DEALER */}
      {addDealerModalOpen && (
        <QuickAddDealerModal
          open={addDealerModalOpen}
          onClose={() => setAddDealerModalOpen(false)}
          onSuccess={(dealer) => {
            setSelectedDealerId(dealer.id);
            setAddDealerModalOpen(false);
          }}
        />
      )}

      {/* MODAL: FAST ADD PRODUCT (Cascade Category -> Subcategory -> Brand -> Model) */}
      {addProductModalOpen && (
        <FastAddProductModal
          open={addProductModalOpen}
          onClose={() => setAddProductModalOpen(false)}
          onAddProduct={handleAddProductFromModal}
          purchaseType={purchaseType}
        />
      )}

      {/* MODAL: MASTER PRODUCT HIERARCHY CREATOR */}
      {quickProductHierarchyOpen && (
        <QuickProductModal
          open={quickProductHierarchyOpen}
          onClose={() => setQuickProductHierarchyOpen(false)}
          onSuccess={(prod) => {
            handleSelectProductFromSearch(prod);
            setQuickProductHierarchyOpen(false);
          }}
        />
      )}

      {/* MODAL: LIVE CAMERA IMEI SCANNER */}
      {scannerProduct && (
        <ImeiScannerModal
          open={Boolean(scannerProduct)}
          onClose={() => setScannerProduct(null)}
          productName={scannerProduct.name}
          requiredQty={scannerProduct.qty}
          currentImeis={imeisByProduct[scannerProduct.id] || []}
          existingPurchaseImeis={Object.entries(imeisByProduct)
            .filter(([k]) => k !== scannerProduct.id)
            .flatMap(([, v]) => v)}
          dbUnits={db.units}
          onSave={(scanned) => {
            setImeisByProduct((prev) => ({
              ...prev,
              [scannerProduct.id]: scanned,
            }));
          }}
        />
      )}

      {/* MODAL: BULK IMEI PASTE */}
      {bulkImeiProduct && (
        <BulkImeiModal
          open={Boolean(bulkImeiProduct)}
          onClose={() => setBulkImeiProduct(null)}
          productName={bulkImeiProduct.name}
          requiredQty={bulkImeiProduct.qty}
          currentImeis={imeisByProduct[bulkImeiProduct.id] || []}
          otherBillImeis={Object.entries(imeisByProduct)
            .filter(([k]) => k !== bulkImeiProduct.id)
            .flatMap(([, v]) => v)}
          dbUnits={db.units}
          onSave={(pasted) => {
            setImeisByProduct((prev) => ({
              ...prev,
              [bulkImeiProduct.id]: pasted,
            }));
          }}
        />
      )}

      {/* MODAL: OCR EXTRACTED CONFIRMATION */}
      {ocrConfirmModalOpen && extractionResult && (
        <Modal
          open={ocrConfirmModalOpen}
          onClose={() => setOcrConfirmModalOpen(false)}
          title="Review & Confirm Extracted Bill Data"
          wide
        >
          <div className="space-y-4 text-[12.5px]">
            <div className="p-3 rounded-xl border border-indigo-200 bg-indigo-50/70 text-indigo-900">
              Please review the extracted invoice information before applying it to the purchase form.
            </div>

            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl border border-border/80 bg-muted/20">
              <div>
                <span className="text-muted-foreground text-[11px] block">Extracted Dealer:</span>
                <strong className="text-foreground">{extractionResult.dealer?.name || "Unknown"}</strong>
                <div className="text-[11px] font-mono text-muted-foreground">{extractionResult.dealer?.gstin}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-[11px] block">Extracted Invoice:</span>
                <strong className="text-foreground font-mono">{extractionResult.invoice?.invoiceNo}</strong>
                <div className="text-[11px] text-muted-foreground">Date: {extractionResult.invoice?.date}</div>
              </div>
            </div>

            <div>
              <span className="font-semibold text-foreground mb-1 block">Extracted Items ({extractionResult.items?.length || 0}):</span>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-border/80 divide-y divide-border/60">
                {extractionResult.items?.map((item: any, i: number) => (
                  <div key={i} className="p-2 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-foreground">{item.name}</div>
                      <div className="text-[10.5px] text-muted-foreground font-mono">
                        Qty: {item.qty} | Rate: ₹{item.rateExcludingTax} | GST: {item.gstRate}%
                      </div>
                    </div>
                    <div className="font-mono font-bold">₹{item.totalAmount}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setOcrConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" variant="primary" onClick={handleApplyOcrResult}>
                ✓ CONFIRM & APPLY TO BILL
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: PURCHASE SAVED SUCCESSFULLY */}
      {successSavedPurchase && (
        <Modal
          open={Boolean(successSavedPurchase)}
          onClose={() => setSuccessSavedPurchase(null)}
          title="Purchase Saved Successfully"
        >
          <div className="space-y-4 text-center py-2">
            <div className="size-14 mx-auto rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-2xl shadow-inner">
              ✓
            </div>

            <div>
              <h3 className="text-lg font-bold text-foreground">Purchase Recorded</h3>
              <p className="text-[12px] text-muted-foreground mt-0.5 font-mono">
                Invoice #{successSavedPurchase.invoiceNo} • {successSavedPurchase.date}
              </p>
            </div>

            <div className="p-3 rounded-xl border border-border/80 bg-muted/20 grid grid-cols-3 gap-2 text-left">
              <div>
                <span className="text-[10.5px] text-muted-foreground block">Total</span>
                <strong className="text-[13px] font-mono text-foreground">₹{successSavedPurchase.total.toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-muted-foreground block">Paid</span>
                <strong className="text-[13px] font-mono text-emerald-600">₹{successSavedPurchase.paid.toLocaleString("en-IN")}</strong>
              </div>
              <div>
                <span className="text-[10.5px] text-muted-foreground block">Due Balance</span>
                <strong className="text-[13px] font-mono text-rose-600">
                  ₹{(successSavedPurchase.dueAmount ?? (successSavedPurchase.total - successSavedPurchase.paid)).toLocaleString("en-IN")}
                </strong>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
              {onViewInvoice && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => {
                    const p = successSavedPurchase;
                    setSuccessSavedPurchase(null);
                    onViewInvoice(p);
                  }}
                  className="w-full text-xs"
                >
                  👁️ VIEW PURCHASE
                </Button>
              )}

              {onOpenAddPayment && (
                <Button
                  type="button"
                  variant="soft"
                  onClick={() => {
                    const p = successSavedPurchase;
                    setSuccessSavedPurchase(null);
                    onOpenAddPayment(p);
                  }}
                  className="w-full text-xs"
                >
                  💳 ADD PAYMENT
                </Button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  if (onViewInvoice) {
                    const p = successSavedPurchase;
                    setSuccessSavedPurchase(null);
                    onViewInvoice(p);
                    setTimeout(() => window.print(), 500);
                  }
                }}
                className="w-full text-xs"
              >
                🖨️ PRINT
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const dealer = db.suppliers.find((s) => s.id === successSavedPurchase.supplierId);
                  const text = `Purchase Invoice ${successSavedPurchase.invoiceNo} recorded for ₹${successSavedPurchase.total}. Paid: ₹${successSavedPurchase.paid}, Due: ₹${successSavedPurchase.dueAmount}.`;
                  window.open(`https://wa.me/${dealer?.phone?.replace(/\D/g, "") || ""}?text=${encodeURIComponent(text)}`, "_blank");
                }}
                className="w-full text-xs text-emerald-700"
              >
                📱 WHATSAPP
              </Button>
            </div>

            <div className="pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSuccessSavedPurchase(null)}
                className="w-full text-xs"
              >
                Close & Enter Next Purchase Bill
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
