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
import { cleanBarcodeImei, playScanBeep } from "@/lib/barcodeScannerHelper";

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

  // PURCHASE TYPE: GST vs Non-GST
  const [purchaseType, setPurchaseType] = useState<"GST" | "NON_GST">("GST");
  // RATE MODE: INCLUSIVE (Price includes GST) vs EXCLUSIVE (Price excludes GST)
  const [rateMode, setRateMode] = useState<"INCLUSIVE" | "EXCLUSIVE">("INCLUSIVE");

  const [purchaseMode, setPurchaseMode] = useState<"Regular Purchase" | "Opening Purchase" | "Other">("Regular Purchase");

  // DEALER & BILL DETAILS
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

  // Attachments & OCR
  const [attachments, setAttachments] = useState<
    Array<{ fileName: string; fileType: string; fileSize?: number; fileData: string }>
  >([]);
  const [extracting, setExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<any>(null);
  const [ocrConfirmModalOpen, setOcrConfirmModalOpen] = useState(false);

  // PRODUCTS / INWARD ITEMS
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

  // Missing IMEI Confirmation Modal
  const [missingImeiModalOpen, setMissingImeiModalOpen] = useState(false);

  // PAYMENT DETAILS
  const [paid, setPaid] = useState<number>(0);
  const [isManualPaidEdited, setIsManualPaidEdited] = useState(false);
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
  const [allowDuplicateOverride, setAllowDuplicateOverride] = useState(false);
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
      try {
        localStorage.setItem("last_selected_dealer_id", selectedDealer.id);
      } catch {}
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

  // Auto Generate Invoice Number
  const handleAutoGenerateInvoiceNo = async () => {
    try {
      const res = await fetch("/api/purchases/next-invoice-no");
      if (res.ok) {
        const data = await res.json();
        if (data.invoiceNo) {
          setInvoiceNo(data.invoiceNo);
          return;
        }
      }
    } catch {}
    const autoNo = `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
    setInvoiceNo(autoNo);
  };

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

  // Helper to generate a valid unique 15-digit dummy IMEI
  const generateUniqueImei = (existingImeis: Set<string>): string => {
    while (true) {
      const part1 = "86" + Math.floor(100000 + Math.random() * 900000);
      const part2 = Math.floor(1000000 + Math.random() * 9000000);
      const candidate = `${part1}${part2}`.slice(0, 15);
      const existsInDb = db.units.some((u) => u.imei1 === candidate || u.imei2 === candidate);
      if (!existingImeis.has(candidate) && !existsInDb) {
        existingImeis.add(candidate);
        return candidate;
      }
    }
  };

  // Auto-fill dummy IMEIs for a product
  const handleAutoFillImeisForProduct = (productId: string, targetQty: number) => {
    const currentList = imeisByProduct[productId] || [];
    const needed = targetQty - currentList.length;
    if (needed <= 0) return;

    const allUsedImeis = new Set<string>();
    Object.values(imeisByProduct).forEach((list) => list.forEach((im) => allUsedImeis.add(im)));

    const generated: string[] = [];
    for (let i = 0; i < needed; i++) {
      generated.push(generateUniqueImei(allUsedImeis));
    }

    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: [...currentList, ...generated],
    }));

    playScanBeep(true);
    setErrorMessage("");
  };

  // Fast add product from quick search selection
  const handleSelectProductFromSearch = (prod: any) => {
    const gst = purchaseType === "NON_GST" ? 0 : prod.gst !== undefined ? prod.gst : 18;
    const rate = prod.purchasePrice || 1000;

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
          rateIncludingTax: rate,
          discountPct: 0,
          discountAmount: 0,
          taxableAmount: rate,
          gst,
          gstRate: gst,
          cgstPct: isIntrastate ? gst / 2 : 0,
          cgstAmount: 0,
          sgstPct: isIntrastate ? gst / 2 : 0,
          sgstAmount: 0,
          igstPct: !isIntrastate ? gst : 0,
          igstAmount: 0,
          totalAmount: rate,
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
        rateIncludingTax: rate,
        discountPct: 0,
        discountAmount: 0,
        taxableAmount: rate * newItem.qty,
        gst,
        gstRate: gst,
        cgstPct: isIntrastate ? gst / 2 : 0,
        cgstAmount: 0,
        sgstPct: isIntrastate ? gst / 2 : 0,
        sgstAmount: 0,
        igstPct: !isIntrastate ? gst : 0,
        igstAmount: 0,
        totalAmount: rate * newItem.qty,
      },
    ]);

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

  // Calculated Items taking Rate Mode (Inclusive vs Exclusive) into account
  const calculatedItems = useMemo(() => {
    return items.map((item) => {
      const qty = Math.max(1, item.qty || 1);
      const gstRate = purchaseType === "NON_GST" ? 0 : item.gstRate !== undefined ? item.gstRate : item.gst !== undefined ? item.gst : 18;

      // The entered rate
      const rawEnteredRate = item.rateExcludingTax !== undefined ? item.rateExcludingTax : item.price;
      const discountPct = Math.max(0, item.discountPct || 0);

      let rateExcl = 0;
      let rateIncl = 0;
      let taxable = 0;
      let cgstPct = 0;
      let cgstAmount = 0;
      let sgstPct = 0;
      let sgstAmount = 0;
      let igstPct = 0;
      let igstAmount = 0;
      let totalAmount = 0;
      let discountAmount = 0;

      if (purchaseType === "NON_GST" || gstRate === 0) {
        // NON-GST: Rate is strictly without tax, Tax is 0%
        rateExcl = rawEnteredRate;
        rateIncl = rawEnteredRate;
        const gross = rateExcl * qty;
        discountAmount = item.discountAmount || Math.round(((gross * discountPct) / 100) * 100) / 100;
        taxable = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);
        totalAmount = taxable;
      } else if (rateMode === "INCLUSIVE") {
        // TAX INCLUSIVE: User entered the Net Rate (Includes GST). DO NOT ADD GST AGAIN!
        rateIncl = rawEnteredRate;
        rateExcl = Math.round((rateIncl / (1 + gstRate / 100)) * 100) / 100;

        const grossTotal = rateIncl * qty;
        discountAmount = item.discountAmount || Math.round(((grossTotal * discountPct) / 100) * 100) / 100;
        totalAmount = Math.max(0, Math.round((grossTotal - discountAmount) * 100) / 100);

        // Back-calculate taxable and tax amounts
        taxable = Math.round((totalAmount / (1 + gstRate / 100)) * 100) / 100;
        const lineTax = Math.round((totalAmount - taxable) * 100) / 100;

        if (isIntrastate) {
          cgstPct = gstRate / 2;
          sgstPct = gstRate / 2;
          cgstAmount = Math.round((lineTax / 2) * 100) / 100;
          sgstAmount = Math.round((lineTax - cgstAmount) * 100) / 100;
        } else {
          igstPct = gstRate;
          igstAmount = lineTax;
        }
      } else {
        // TAX EXCLUSIVE: User entered Base Rate (Excludes GST). GST is added on top.
        rateExcl = rawEnteredRate;
        rateIncl = Math.round(rateExcl * (1 + gstRate / 100) * 100) / 100;

        const gross = rateExcl * qty;
        discountAmount = item.discountAmount || Math.round(((gross * discountPct) / 100) * 100) / 100;
        taxable = Math.max(0, Math.round((gross - discountAmount) * 100) / 100);

        if (isIntrastate) {
          cgstPct = gstRate / 2;
          sgstPct = gstRate / 2;
          cgstAmount = Math.round(taxable * (cgstPct / 100) * 100) / 100;
          sgstAmount = Math.round(taxable * (sgstPct / 100) * 100) / 100;
        } else {
          igstPct = gstRate;
          igstAmount = Math.round(taxable * (igstPct / 100) * 100) / 100;
        }

        totalAmount = Math.round((taxable + cgstAmount + sgstAmount + igstAmount) * 100) / 100;
      }

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
  }, [items, purchaseType, rateMode, isIntrastate]);

  // Financial totals
  const totalTaxable = useMemo(() => {
    return Math.round(calculatedItems.reduce((sum, i) => sum + (i.taxableAmount || 0), 0) * 100) / 100;
  }, [calculatedItems]);

  const totalCgst = useMemo(() => {
    return Math.round(calculatedItems.reduce((sum, i) => sum + (i.cgstAmount || 0), 0) * 100) / 100;
  }, [calculatedItems]);

  const totalSgst = useMemo(() => {
    return Math.round(calculatedItems.reduce((sum, i) => sum + (i.sgstAmount || 0), 0) * 100) / 100;
  }, [calculatedItems]);

  const totalIgst = useMemo(() => {
    return Math.round(calculatedItems.reduce((sum, i) => sum + (i.igstAmount || 0), 0) * 100) / 100;
  }, [calculatedItems]);

  const totalTax = Math.round((totalCgst + totalSgst + totalIgst) * 100) / 100;

  const tdsAmount = useMemo(() => {
    if (!tdsApplicable) return 0;
    return Math.round(((totalTaxable * tdsRate) / 100) * 100) / 100;
  }, [tdsApplicable, totalTaxable, tdsRate]);

  const grandTotal = useMemo(() => {
    const raw = totalTaxable + totalTax + otherCharges - tdsAmount + roundOff;
    return Math.max(0, Math.round(raw * 100) / 100);
  }, [totalTaxable, totalTax, otherCharges, tdsAmount, roundOff]);

  // Auto-set paid to grandTotal if user hasn't manually edited paid
  useEffect(() => {
    if (!isManualPaidEdited) {
      setPaid(grandTotal);
    }
  }, [grandTotal, isManualPaidEdited]);

  const dueAmount = useMemo(() => {
    return Math.max(0, Math.round((grandTotal - paid) * 100) / 100);
  }, [grandTotal, paid]);

  // Quick Payment buttons
  const handleSetFullPaid = () => {
    setPaid(grandTotal);
    setIsManualPaidEdited(true);
  };

  const handleSetUnpaidCredit = () => {
    setPaid(0);
    setIsManualPaidEdited(true);
  };

  // IMEI manual inline add
  const handleAddInlineImei = (productId: string) => {
    const raw = inlineImeiInputs[productId] || "";
    const text = cleanBarcodeImei(raw);
    if (!text) return;

    if (!/^\d{14,16}$/.test(text)) {
      setErrorMessage(`Invalid IMEI '${text}'. Mobile IMEIs contain 14–16 digits.`);
      playScanBeep(false);
      return;
    }

    // Check duplicate in bill
    const allBillImeis = Object.values(imeisByProduct).flat();
    if (allBillImeis.includes(text)) {
      setErrorMessage(`IMEI ${text} is already entered in this purchase.`);
      playScanBeep(false);
      return;
    }

    // Check duplicate in inventory
    const existingUnit = db.units.find((u) => u.imei1 === text || u.imei2 === text);
    if (existingUnit) {
      setErrorMessage(`IMEI ${text} already exists in store inventory.`);
      playScanBeep(false);
      return;
    }

    const currentList = imeisByProduct[productId] || [];
    const item = items.find((i) => i.productId === productId);
    if (item && currentList.length >= item.qty) {
      setErrorMessage(`Required quantity of ${item.qty} IMEI(s) already reached.`);
      playScanBeep(false);
      return;
    }

    setImeisByProduct((prev) => ({
      ...prev,
      [productId]: [...currentList, text],
    }));

    playScanBeep(true);
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
    let candidate = db.purchases.find(
      (p) => p.supplierId === selectedDealerId || p.dealerId === selectedDealerId
    );
    if (!candidate && db.purchases.length > 0) {
      candidate = db.purchases[0];
    }

    if (!candidate || !candidate.items || candidate.items.length === 0) {
      alert("No previous purchase bill found to repeat.");
      return;
    }

    setPurchaseType(candidate.purchaseType || "GST");
    if (candidate.supplierId) {
      setSelectedDealerId(candidate.supplierId);
    }

    const repeatedItems: LineItem[] = candidate.items.map((i) => ({
      ...i,
      imeis: [] as string[],
      imei: undefined,
    }));

    setItems(repeatedItems);
    setImeisByProduct({});
    handleAutoGenerateInvoiceNo();
    setPaid(candidate.total || 0);

    alert(`Loaded ${candidate.items.length} product(s) from previous bill (${candidate.invoiceNo}).`);
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
        const rate = ei.rateExcludingTax || ei.rateIncludingTax || 1000;
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
          rateIncludingTax: rate,
          discountPct: 0,
          discountAmount: 0,
          taxableAmount: rate * qty,
          gst,
          gstRate: gst,
          cgstPct: isIntrastate ? gst / 2 : 0,
          cgstAmount: 0,
          sgstPct: isIntrastate ? gst / 2 : 0,
          sgstAmount: 0,
          igstPct: !isIntrastate ? gst : 0,
          igstAmount: 0,
          totalAmount: rate * qty,
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

  // Keyboard Shortcuts: Ctrl + Enter to Save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        handleSavePurchase();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedDealerId, invoiceNo, calculatedItems, paid, grandTotal, allowDuplicateOverride]);

  // Check if any tracked items are missing IMEIs
  const getMissingImeiItems = () => {
    return calculatedItems.filter((item) => {
      const prod = db.products.find((p) => p.id === item.productId);
      if (!prod?.tracked) return false;
      const entered = (imeisByProduct[item.productId] || []).length;
      return entered < item.qty;
    });
  };

  // Auto-Fill all missing IMEIs across all products
  const handleAutoFillAllMissingImeis = () => {
    const allUsedImeis = new Set<string>();
    Object.values(imeisByProduct).forEach((list) => list.forEach((im) => allUsedImeis.add(im)));

    const updatedImeis = { ...imeisByProduct };
    calculatedItems.forEach((item) => {
      const prod = db.products.find((p) => p.id === item.productId);
      if (prod?.tracked) {
        const currentList = updatedImeis[item.productId] || [];
        const needed = item.qty - currentList.length;
        if (needed > 0) {
          const generated: string[] = [];
          for (let i = 0; i < needed; i++) {
            generated.push(generateUniqueImei(allUsedImeis));
          }
          updatedImeis[item.productId] = [...currentList, ...generated];
        }
      }
    });

    setImeisByProduct(updatedImeis);
    setMissingImeiModalOpen(false);
    return updatedImeis;
  };

  // FINAL SAVE PURCHASE
  const handleSavePurchase = async (forceAllowDuplicate = false) => {
    setErrorMessage("");

    if (!selectedDealerId) {
      setErrorMessage("Please select a Dealer / Supplier.");
      return;
    }

    // Auto-generate invoice number if empty
    let finalInvoiceNo = invoiceNo.trim();
    if (!finalInvoiceNo) {
      finalInvoiceNo = `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
      setInvoiceNo(finalInvoiceNo);
    }

    if (items.length === 0) {
      setErrorMessage("Please add at least one product to the purchase bill.");
      return;
    }

    // Check duplicate invoice warning
    if (duplicateWarning && !forceAllowDuplicate && !allowDuplicateOverride) {
      setErrorMessage(`Invoice #${finalInvoiceNo} already exists for this dealer. Check 'Allow Duplicate' or enter a new number.`);
      return;
    }

    // Check missing IMEIs for tracked products
    const missing = getMissingImeiItems();
    if (missing.length > 0) {
      setMissingImeiModalOpen(true);
      return;
    }

    await executePurchaseSave(finalInvoiceNo, imeisByProduct, forceAllowDuplicate || allowDuplicateOverride);
  };

  const executePurchaseSave = async (
    finalInvoiceNo: string,
    finalImeis: Record<string, string[]>,
    allowDuplicate: boolean
  ) => {
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const payload: any = {
        purchaseType,
        purchaseMode,
        dealerId: selectedDealerId,
        supplierId: selectedDealerId,
        invoiceNo: finalInvoiceNo,
        date: invoiceDate,
        placeOfSupply,
        stateCode,
        items: calculatedItems,
        imeis: finalImeis,
        otherCharges,
        roundOff,
        tdsApplicable,
        tdsRate: tdsApplicable ? tdsRate : 0,
        tdsAmount,
        paid: Number(paid) || 0,
        mode: paymentMethod,
        allowDuplicate,
        attachments,
      };
      if (referenceNo) {
        payload.referenceNo = referenceNo;
        payload.originalInvoiceNo = referenceNo;
      }
      if (dueDate) payload.dueDate = dueDate;
      if (transport) payload.dispatchedThrough = transport;
      if (destination) payload.destination = destination;
      if (termsOfDelivery) payload.termsOfDelivery = termsOfDelivery;
      if (paymentTerms) payload.paymentTerms = paymentTerms;
      if (deliveryNoteNo) payload.deliveryNoteNo = deliveryNoteNo;
      if (deliveryNoteDate) payload.deliveryNoteDate = deliveryNoteDate;
      if (dispatchDocNo) payload.dispatchDocNo = dispatchDocNo;
      if (dispatchDocDate) payload.dispatchDocDate = dispatchDocDate;
      if (vehicleNo) payload.otherReferences = `Vehicle: ${vehicleNo}`;
      else if (otherReferences) payload.otherReferences = otherReferences;
      if (tdsApplicable && tdsSection) payload.tdsSection = tdsSection;
      if (selectedAccountId) payload.paymentAccountId = selectedAccountId;

      const created = await recordPurchase(payload);

      // Show success modal
      setSuccessSavedPurchase(created);
      onSavedPurchase(created);

      // Reset form state for next entry
      setItems([]);
      setImeisByProduct({});
      setInvoiceNo("");
      setPaid(0);
      setIsManualPaidEdited(false);
      setOtherCharges(0);
      setAttachments([]);
      setDuplicateWarning(null);
      setAllowDuplicateOverride(false);
    } catch (err: any) {
      console.error("Purchase save error:", err);
      setErrorMessage(
        err.message || "Purchase bill could not be saved. Please check details and try again."
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Banner: Quick Controls & Rate Mode */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl border border-border/80 bg-white shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Purchase Type */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Bill Type:
            </span>
            <div className="inline-flex rounded-xl p-0.5 bg-muted/70 border border-border/60">
              <button
                type="button"
                onClick={() => setPurchaseType("GST")}
                className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
                  purchaseType === "GST"
                    ? "bg-primary text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                GST Bill
              </button>
              <button
                type="button"
                onClick={() => setPurchaseType("NON_GST")}
                className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer ${
                  purchaseType === "NON_GST"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Non-GST (Cash Memo)
              </button>
            </div>
          </div>

          {/* Rate Mode: Inclusive vs Exclusive */}
          {purchaseType === "GST" && (
            <div className="flex items-center gap-2 pl-2 border-l border-border/80">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Rate Mode:
              </span>
              <div className="inline-flex rounded-xl p-0.5 bg-muted/70 border border-border/60">
                <button
                  type="button"
                  onClick={() => setRateMode("INCLUSIVE")}
                  title="Entered rate includes GST. Final item amount matches entered rate (no extra GST added)."
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    rateMode === "INCLUSIVE"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>✓ Net Rate (Includes GST)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRateMode("EXCLUSIVE")}
                  title="Entered rate excludes GST. GST will be added on top of the rate."
                  className={`px-3 py-1 rounded-lg text-[11.5px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    rateMode === "EXCLUSIVE"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>+ Base Rate (+ GST Extra)</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Repeat Last Purchase */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleRepeatLastPurchase}
            title="Load products from previous purchase bill"
            className="text-[11px] h-8 gap-1"
          >
            <span>🔁</span> Repeat Bill
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
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl border border-dashed border-primary/60 bg-primary/5 hover:bg-primary/10 text-primary text-[11px] font-semibold transition-all h-8">
              📎 Upload Bill (PDF/Img)
            </span>
          </label>
        </div>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-[12.5px] text-destructive font-medium flex items-center justify-between animate-in-soft shadow-xs">
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
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-900 flex flex-wrap items-center justify-between gap-2 shadow-xs animate-in-soft">
          <div className="flex items-center gap-2">
            <span className="text-base">⚠️</span>
            <div>
              <span className="font-bold text-[12px]">Invoice #{duplicateWarning.invoiceNo} already exists for this dealer (₹{duplicateWarning.total})!</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11.5px] font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={allowDuplicateOverride}
                onChange={(e) => setAllowDuplicateOverride(e.target.checked)}
                className="size-4 rounded text-amber-600"
              />
              <span>Allow Duplicate & Save</span>
            </label>
            {onViewInvoice && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[10.5px] bg-white"
                onClick={() => onViewInvoice(duplicateWarning)}
              >
                View Existing
              </Button>
            )}
          </div>
        </div>
      )}

      {/* SECTION 1: DEALER & BILL DETAILS (Compact Single-Row Card) */}
      <div className="p-3.5 rounded-2xl border border-border/80 bg-white shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-1.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[10.5px] font-bold">
              1
            </span>
            <span className="text-[12.5px] font-bold text-foreground uppercase tracking-tight">
              Dealer & Invoice Info
            </span>
          </div>
          <button
            type="button"
            onClick={() => setShowMoreDetails(!showMoreDetails)}
            className="text-[11px] font-semibold text-primary hover:underline cursor-pointer"
          >
            {showMoreDetails ? "− Hide Transport & Due Date" : "+ Transport, Due Date & Delivery"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Dealer Select with Search & + Add Dealer */}
          <div className="sm:col-span-2">
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

          {/* Invoice Number + Auto Generate Button */}
          <div>
            <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
              Invoice Number *
            </label>
            <div className="flex gap-1">
              <Input
                value={invoiceNo}
                onChange={(e) => setInvoiceNo(e.target.value)}
                placeholder="e.g. INV-101"
                className="h-9 text-[12px] font-semibold font-mono"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAutoGenerateInvoiceNo}
                title="Auto generate invoice number"
                className="h-9 px-2 text-[10.5px] whitespace-nowrap"
              >
                Auto #
              </Button>
            </div>
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
              className="h-9 text-[12px]"
              required
            />
          </div>
        </div>

        {/* Collapsible Transport & Due Date */}
        {showMoreDetails && (
          <div className="pt-2 border-t border-border/60 grid grid-cols-2 sm:grid-cols-4 gap-2.5 animate-in-soft">
            <Field label="Due Date">
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-8 text-[11.5px]"
              />
            </Field>

            <Field label="Place of Supply">
              <Input
                value={placeOfSupply}
                onChange={(e) => setPlaceOfSupply(e.target.value)}
                placeholder="e.g. Madhya Pradesh"
                className="h-8 text-[11.5px]"
              />
            </Field>

            <Field label="Transport / Courier">
              <Input
                value={transport}
                onChange={(e) => setTransport(e.target.value)}
                placeholder="e.g. VRL Logistics"
                className="h-8 text-[11.5px]"
              />
            </Field>

            <Field label="Vehicle / LR No">
              <Input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="e.g. MP09-AB-1234"
                className="h-8 text-[11.5px]"
              />
            </Field>
          </div>
        )}
      </div>

      {/* SECTION 2: PRODUCTS & ITEMS TABLE */}
      <div className="p-3.5 rounded-2xl border border-border/80 bg-white shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-border/60">
          <div className="flex items-center gap-2">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[10.5px] font-bold">
              2
            </span>
            <span className="text-[12.5px] font-bold text-foreground uppercase tracking-tight">
              Products ({items.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Mode: <strong className="text-foreground">{purchaseType === "NON_GST" ? "Non-GST" : rateMode === "INCLUSIVE" ? "Rate Includes GST (Net)" : "Rate + GST Extra"}</strong>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAddProductModalOpen(true)}
              className="h-8 text-[11.5px] gap-1 text-primary border-primary/30 hover:bg-primary/5 font-semibold"
            >
              + Add New Product
            </Button>
          </div>
        </div>

        {/* Quick Search & Auto-complete Bar */}
        <div className="relative">
          <input
            ref={searchInputRef}
            type="text"
            value={productSearchQuery}
            onChange={(e) => {
              setProductSearchQuery(e.target.value);
              setSearchFocused(true);
            }}
            onFocus={() => setSearchFocused(true)}
            placeholder="🔍 Type product name, brand, model or barcode to add..."
            className="w-full rounded-xl border border-border/80 bg-white px-3 h-9.5 text-[13px] outline-none focus:border-primary pr-10 shadow-xs"
          />

          {searchFocused && productSearchResults.length > 0 && (
            <div className="absolute z-30 left-0 right-0 top-full mt-1 rounded-xl border border-border/80 bg-white shadow-lg overflow-hidden divide-y divide-border/60">
              {productSearchResults.map((prod) => (
                <div
                  key={prod.id}
                  onClick={() => handleSelectProductFromSearch(prod)}
                  className="p-2.5 hover:bg-primary/5 cursor-pointer flex items-center justify-between transition-colors"
                >
                  <div>
                    <div className="font-semibold text-foreground text-[12.5px]">
                      {prod.name}
                    </div>
                    <div className="text-[10.5px] text-muted-foreground flex items-center gap-2">
                      <span>Brand: {prod.brand || "—"}</span>
                      <span>•</span>
                      <span>Model: {prod.model || "—"}</span>
                      {prod.tracked && (
                        <>
                          <span>•</span>
                          <span className="text-primary font-medium">IMEI Tracked</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-foreground text-[12.5px]">
                      ₹{prod.purchasePrice?.toLocaleString("en-IN") || "0"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      GST: {purchaseType === "NON_GST" ? "0%" : `${prod.gst || 18}%`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* PRODUCTS TABLE */}
        {items.length === 0 ? (
          <div className="p-8 text-center rounded-xl border border-dashed border-border/80 bg-muted/10 space-y-2">
            <div className="text-3xl opacity-40">📱</div>
            <div className="text-[13px] font-semibold text-foreground">No products added to bill yet</div>
            <div className="text-[11.5px] text-muted-foreground max-w-sm mx-auto">
              Type product name above or click <strong>+ Add New Product</strong> to add mobile phones or accessories.
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border/80">
            <table className="w-full text-left text-[12px]">
              <thead className="bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase border-b border-border/80">
                <tr>
                  <th className="py-2.5 px-3">Product</th>
                  <th className="py-2.5 px-3 min-w-[200px]">IMEI / Serial</th>
                  <th className="py-2.5 px-3 w-16 text-center">Qty</th>
                  <th className="py-2.5 px-3 w-28 text-right">
                    Rate (₹) {rateMode === "INCLUSIVE" && purchaseType === "GST" ? "[Net]" : "[Base]"}
                  </th>
                  {purchaseType === "GST" && (
                    <>
                      <th className="py-2.5 px-3 w-24 text-right">Taxable (₹)</th>
                      <th className="py-2.5 px-3 w-20 text-center">GST %</th>
                    </>
                  )}
                  <th className="py-2.5 px-3 w-28 text-right font-bold">Total (₹)</th>
                  <th className="py-2.5 px-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {calculatedItems.map((item, idx) => {
                  const prod = db.products.find((p) => p.id === item.productId);
                  const isTracked = Boolean(prod?.tracked);
                  const itemImeis = imeisByProduct[item.productId] || [];
                  const isComplete = itemImeis.length >= item.qty;

                  return (
                    <tr key={`${item.productId}_${idx}`} className="hover:bg-muted/10 transition-colors">
                      {/* Product Name */}
                      <td className="py-2 px-3 align-top">
                        <div className="font-semibold text-foreground text-[12.5px]">
                          {item.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          HSN: {item.hsnSac || "85171300"}
                        </div>
                      </td>

                      {/* IMEI / Serial Details */}
                      <td className="py-2 px-3 align-top space-y-1.5">
                        {isTracked ? (
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
                                title="Open camera scanner"
                              >
                                <span>📷</span> Scan
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
                                title="Paste multiple IMEIs"
                              >
                                📋 Paste
                              </button>

                              {!isComplete && (
                                <button
                                  type="button"
                                  onClick={() => handleAutoFillImeisForProduct(item.productId, item.qty)}
                                  className="px-2 py-0.5 rounded text-[10.5px] font-bold bg-amber-100 text-amber-900 hover:bg-amber-200 transition-all cursor-pointer"
                                  title="Auto fill remaining IMEIs"
                                >
                                  ⚡ Auto-Fill
                                </button>
                              )}
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
                                      className="text-muted-foreground hover:text-destructive text-xs font-bold leading-none cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Single inline IMEI input if not completed */}
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
                                  className="px-1.5 py-0.5 rounded bg-primary text-white text-[10px] font-bold cursor-pointer"
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
                          value={rateMode === "INCLUSIVE" ? item.rateIncludingTax : item.rateExcludingTax}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            handleUpdateItem(idx, {
                              rateExcludingTax: val,
                              rateIncludingTax: val,
                              price: val,
                            });
                          }}
                          className="h-7 w-24 rounded-lg border border-border/80 px-2 text-right font-mono font-semibold text-[12px] outline-none focus:border-primary text-foreground"
                        />
                      </td>

                      {/* Taxable Amount (GST Mode) */}
                      {purchaseType === "GST" && (
                        <td className="py-2 px-3 align-top text-right font-mono text-[11.5px] text-muted-foreground">
                          ₹{item.taxableAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      )}

                      {/* GST % */}
                      {purchaseType === "GST" && (
                        <td className="py-2 px-3 align-top text-center">
                          <select
                            value={item.gstRate}
                            onChange={(e) => handleUpdateItem(idx, { gstRate: Number(e.target.value), gst: Number(e.target.value) })}
                            className="h-7 rounded border border-border/80 text-[11px] font-mono px-1"
                          >
                            <option value="0">0%</option>
                            <option value="5">5%</option>
                            <option value="12">12%</option>
                            <option value="18">18%</option>
                            <option value="28">28%</option>
                          </select>
                        </td>
                      )}

                      {/* Total Amount */}
                      <td className="py-2 px-3 align-top text-right font-mono font-bold text-[12.5px] text-foreground">
                        ₹{item.totalAmount?.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
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
      </div>

      {/* SECTION 3: PAYMENT & SUMMARY (Two Columns) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
        {/* Payment Details (7 Cols) */}
        <div className="md:col-span-7 p-3.5 rounded-2xl border border-border/80 bg-white shadow-xs space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-border/60">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-white text-[10.5px] font-bold">
              3
            </span>
            <span className="text-[12.5px] font-bold text-foreground uppercase tracking-tight">
              Payment & Settlement
            </span>
          </div>

          {/* Quick Payment Buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={paid === grandTotal && paid > 0 ? "primary" : "outline"}
              onClick={handleSetFullPaid}
              className="text-[11.5px] h-8 font-semibold"
            >
              ✓ Full Paid (₹{grandTotal.toLocaleString("en-IN")})
            </Button>
            <Button
              type="button"
              size="sm"
              variant={paid === 0 ? "danger" : "outline"}
              onClick={handleSetUnpaidCredit}
              className="text-[11.5px] h-8 font-semibold"
            >
              Credit / Unpaid (Udhaar)
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
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
                onChange={(e) => {
                  setPaid(Number(e.target.value) || 0);
                  setIsManualPaidEdited(true);
                }}
                className="h-9 font-mono font-bold text-[13px] text-emerald-700"
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                Payment Method
              </label>
              <Select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMode)}
                className="h-9 text-[12.5px]"
              >
                <option value="Cash">Cash Drawer</option>
                <option value="UPI">UPI / QR</option>
                <option value="Bank">Bank Transfer / NEFT</option>
                <option value="Credit">Credit (Udhaar)</option>
              </Select>
            </div>
          </div>

          {/* Account selector for Bank/UPI */}
          {(paymentMethod === "UPI" || paymentMethod === "Bank") && (
            <div>
              <label className="block text-[11px] font-semibold text-foreground/80 mb-1">
                Deposit Account
              </label>
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="h-9 text-[12px]"
              >
                <option value="">Select Account...</option>
                {paymentAccounts
                  .filter((a) => (paymentMethod === "UPI" ? a.accountType === "UPI" : a.accountType === "BANK"))
                  .map((acct) => (
                    <option key={acct.id} value={acct.id}>
                      {acct.accountName} {acct.bankName ? `(${acct.bankName})` : ""}
                    </option>
                  ))}
              </Select>
            </div>
          )}

          {/* Additional Financials Toggle */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdditionalFinancials(!showAdditionalFinancials)}
              className="text-[11px] text-muted-foreground font-semibold hover:text-foreground cursor-pointer"
            >
              {showAdditionalFinancials ? "− Hide Charges & TDS" : "+ Other Charges, Round Off & TDS 194R"}
            </button>

            {showAdditionalFinancials && (
              <div className="mt-2 p-2.5 rounded-xl border border-border/80 bg-muted/15 grid grid-cols-2 gap-2 animate-in-soft">
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
              </div>
            )}
          </div>
        </div>

        {/* Purchase Summary (5 Cols) */}
        <div className="md:col-span-5 p-4 rounded-2xl border border-border/80 bg-white shadow-md space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-border/70">
            <span className="text-[12.5px] font-bold text-foreground uppercase tracking-wider">
              Purchase Summary
            </span>
            <Badge tone={purchaseType === "GST" ? "info" : "neutral"}>
              {purchaseType}
            </Badge>
          </div>

          <div className="space-y-1.5 text-[12px]">
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

            <div className="pt-2 border-t border-border/80 flex items-center justify-between">
              <span className="text-[13.5px] font-bold text-foreground">Grand Total:</span>
              <span className="text-xl font-bold font-mono text-foreground">
                ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>

            <div className="flex items-center justify-between text-emerald-700 font-medium">
              <span>Paid Amount:</span>
              <span className="font-mono font-bold">₹{paid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
            </div>

            <div className="flex items-center justify-between text-rose-600 font-bold text-[12.5px] pt-1 border-t border-dashed border-border/70">
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
              className="w-full text-[13.5px] font-bold h-11 tracking-wide shadow-md cursor-pointer"
            >
              {isSubmitting ? "Saving Purchase Bill..." : "✓ SAVE PURCHASE (Ctrl+Enter)"}
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL: MISSING IMEIs CONFIRMATION */}
      {missingImeiModalOpen && (
        <Modal
          open={missingImeiModalOpen}
          onClose={() => setMissingImeiModalOpen(false)}
          title="⚡ Missing IMEIs - Auto-Fill & Save?"
        >
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[12.5px]">
              <div className="font-bold mb-1">Some products do not have all IMEIs entered:</div>
              <ul className="list-disc list-inside space-y-0.5 font-medium">
                {getMissingImeiItems().map((item) => {
                  const entered = (imeisByProduct[item.productId] || []).length;
                  return (
                    <li key={item.productId}>
                      {item.name}: {entered} of {item.qty} IMEIs entered (Missing {item.qty - entered})
                    </li>
                  );
                })}
              </ul>
            </div>

            <p className="text-[12px] text-muted-foreground">
              Would you like to auto-generate unique 15-digit serial IMEIs for the missing slots and complete saving the bill now?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setMissingImeiModalOpen(false)}
              >
                Enter IMEIs Manually
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={async () => {
                  const updatedImeis = handleAutoFillAllMissingImeis();
                  const finalInvoiceNo = invoiceNo.trim() || `PUR-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`;
                  await executePurchaseSave(finalInvoiceNo, updatedImeis, allowDuplicateOverride);
                }}
              >
                ⚡ Auto-Fill IMEIs & Save Now
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* MODAL: SUCCESS SAVED PURCHASE */}
      {successSavedPurchase && (
        <Modal
          open={Boolean(successSavedPurchase)}
          onClose={() => setSuccessSavedPurchase(null)}
          title="🎉 Purchase Bill Saved Successfully!"
        >
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-medium text-emerald-700">Invoice Number:</span>
                <span className="font-mono font-bold">{successSavedPurchase.invoiceNo}</span>
              </div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-medium text-emerald-700">Dealer:</span>
                <span className="font-bold">{selectedDealer?.name || "Dealer"}</span>
              </div>
              <div className="flex justify-between items-center text-[13px]">
                <span className="font-medium text-emerald-700">Total Items:</span>
                <span className="font-mono font-bold">{successSavedPurchase.items.length} Units</span>
              </div>
              <div className="flex justify-between items-center text-[13px] pt-1 border-t border-emerald-200">
                <span className="font-bold text-emerald-800">Grand Total:</span>
                <span className="font-mono font-black text-emerald-800 text-[15px]">
                  ₹{successSavedPurchase.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSuccessSavedPurchase(null)}
              >
                + Enter Next Bill
              </Button>

              <div className="flex items-center gap-2">
                {onViewInvoice && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const p = successSavedPurchase;
                      setSuccessSavedPurchase(null);
                      onViewInvoice(p);
                    }}
                  >
                    🖨️ View & Print Bill
                  </Button>
                )}
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setSuccessSavedPurchase(null)}
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

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

      {/* MODAL: FAST ADD PRODUCT */}
      {addProductModalOpen && (
        <FastAddProductModal
          open={addProductModalOpen}
          onClose={() => setAddProductModalOpen(false)}
          onAddProduct={handleAddProductFromModal}
          purchaseType={purchaseType}
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
            setScannerProduct(null);
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
            setBulkImeiProduct(null);
          }}
        />
      )}

      {/* MODAL: OCR EXTRACT CONFIRMATION */}
      {ocrConfirmModalOpen && extractionResult && (
        <Modal
          open={ocrConfirmModalOpen}
          onClose={() => setOcrConfirmModalOpen(false)}
          title="Extracted Purchase Invoice Details"
        >
          <div className="space-y-4">
            <div className="text-[12.5px] text-muted-foreground">
              Please review the auto-extracted invoice fields:
            </div>
            <div className="p-3 rounded-xl border border-border/80 bg-muted/20 space-y-2 text-[12px]">
              <div>
                <strong>Dealer:</strong> {extractionResult.dealer?.name || "Unknown"}
              </div>
              <div>
                <strong>Invoice #:</strong> {extractionResult.invoice?.invoiceNo || "—"}
              </div>
              <div>
                <strong>Date:</strong> {extractionResult.invoice?.date || "—"}
              </div>
              <div>
                <strong>Items Extracted:</strong> {extractionResult.items?.length || 0}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOcrConfirmModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={handleApplyOcrResult}
              >
                Apply Details to Bill
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
