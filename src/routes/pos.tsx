import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect, useRef, useCallback } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  Select,
} from "@/components/ui";
import { stockOf, useStore } from "@/lib/store";
import { inr, inr2, maskImei } from "@/lib/format";
import { CATEGORIES, PAYMENT_MODES, type InterestType, type LineItem, type PaymentMode, type PaymentSplit, type Sale } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BarcodeScannerModal } from "@/components/BarcodeScannerModal";
import { AdminPinModal } from "@/components/AdminPinModal";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { saleToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { EMICalculator } from "@/components/EMICalculator";
import { Calculator, Plus, Trash2, Zap, Eye, FileText, TrendingUp, Sparkles } from "lucide-react";
import { PosCustomerCard } from "@/components/pos/PosCustomerCard";
import { QuickAddCustomerModal } from "@/components/pos/QuickAddCustomerModal";
import { PosSuccessModal } from "@/components/pos/PosSuccessModal";
import { NewSaleCustomerModal } from "@/components/pos/NewSaleCustomerModal";
import { QuickCollectDueModal } from "@/components/pos/QuickCollectDueModal";
import { PriceAdjustModal } from "@/components/pos/PriceAdjustModal";
import { CustomAmountModal } from "@/components/pos/CustomAmountModal";
import { DirectManualBillModal } from "@/components/pos/DirectManualBillModal";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "POS Billing — Mobile Store ERP" },
      {
        name: "description",
        content:
          "Ultra-fast counter billing: quick customer creation, instant barcode/IMEI scanning, split payments, GST/Non-GST, discounts and instant printing.",
      },
      { property: "og:title", content: "POS Billing — Mobile Store ERP" },
      {
        property: "og:description",
        content: "The fastest billing screen for a mobile shop counter, with IMEI tracking.",
      },
    ],
  }),
  component: POS,
});

interface Held {
  id: string;
  customerId: string;
  items: LineItem[];
  discount: number;
}

function POS() {
  const { db, recordSale, addCustomer } = useStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [items, setItems] = useState<LineItem[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState("c0");
  const customer = useMemo(
    () => db.customers.find((c) => c.id === customerId),
    [db.customers, customerId]
  );
  const [splitOpen, setSplitOpen] = useState(false);
  const [mode, setMode] = useState<PaymentMode>("Cash");
  const [splits, setSplits] = useState<Record<string, number>>({});
  const [held, setHeld] = useState<Held[]>([]);
  const [invoice, setInvoice] = useState<Sale | null>(null);
  const [invoiceType, setInvoiceType] = useState<"GST" | "NON_GST">("GST");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("template_modern");

  // Fast Bill mode state
  const [isFastBillMode, setIsFastBillMode] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      try {
        return localStorage.getItem("pos_fast_bill_mode") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  // POS Sale Flow Step: "customer" (First step) -> "billing" (Product selection & payment)
  const [saleStep, setSaleStep] = useState<"customer" | "billing">(() => {
    if (typeof window !== "undefined") {
      try {
        const isFast = localStorage.getItem("pos_fast_bill_mode") === "true";
        return isFast ? "billing" : "customer";
      } catch {
        return "customer";
      }
    }
    return "customer";
  });
  const [changeCustomerModalOpen, setChangeCustomerModalOpen] = useState(false);
  const [collectDueOpen, setCollectDueOpen] = useState(false);
  // Adjust Price modal state for cart items
  const [adjustPriceItemIndex, setAdjustPriceItemIndex] = useState<number | null>(null);
  // Custom Amount / Extra Charge modal state
  const [customAmountModalOpen, setCustomAmountModalOpen] = useState(false);
  // Direct Bill / Manual Item modal state
  const [directBillModalOpen, setDirectBillModalOpen] = useState(false);
  const [directBillPrefill, setDirectBillPrefill] = useState<{
    name?: string;
    price?: number;
    gst?: number;
  }>({});

  // Customer outstanding balance due
  const customerDue = useMemo(() => {
    if (!customer || customer.id === "c0" || customer.name === "Walk-in Customer") {
      return 0;
    }
    const customerSales = db.sales.filter((s) => s.customerId === customer.id && !s.quotation);
    return customerSales.reduce((acc, s) => {
      const due = s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid);
      return acc + due;
    }, 0);
  }, [customer, db.sales]);

  // Quick Customer modal state
  const [quickCustModalOpen, setQuickCustModalOpen] = useState(false);
  const [quickCustPrefill, setQuickCustPrefill] = useState<{ name?: string; phone?: string }>({});

  // Success modal state
  const [successModalOpen, setSuccessModalOpen] = useState(false);
  const [lastCompletedSale, setLastCompletedSale] = useState<Sale | null>(null);

  // Recent Bills modal state
  const [recentBillsModalOpen, setRecentBillsModalOpen] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");

  const recentSales = useMemo(() => {
    const list = (db.sales || []).filter((s) => !s.quotation && s.status !== "VOID");
    return list.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [db.sales]);

  const filteredBills = useMemo(() => {
    if (!billSearchQuery.trim()) return recentSales.slice(0, 30);
    const q = billSearchQuery.toLowerCase().trim();
    return recentSales
      .filter((s) => {
        const cust = db.customers.find((c) => c.id === s.customerId);
        const custName = (cust?.name || "").toLowerCase();
        const custPhone = (cust?.phone || cust?.mobile || "").toLowerCase();
        const invNo = (s.invoiceNo || "").toLowerCase();
        const itemsMatch = (s.items || []).some(
          (it) => it.name.toLowerCase().includes(q) || (it.imei && it.imei.toLowerCase().includes(q)),
        );
        return invNo.includes(q) || custName.includes(q) || custPhone.includes(q) || itemsMatch;
      })
      .slice(0, 30);
  }, [recentSales, billSearchQuery, db.customers]);

  // Custom Paid amount (allows partial payments)
  const [customPaidAmount, setCustomPaidAmount] = useState<number | null>(null);

  // Payment Account & Reference state
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [paymentReference, setPaymentReference] = useState<string>("");
  const [emiDownPaymentAccountId, setEmiDownPaymentAccountId] = useState<string>("");
  const [emiDownPaymentRef, setEmiDownPaymentRef] = useState<string>("");

  interface SplitRow {
    id: string;
    mode: PaymentMode;
    paymentAccountId: string;
    amount: number;
    referenceNumber: string;
  }

  const [mixedRows, setMixedRows] = useState<SplitRow[]>([
    { id: "1", mode: "Cash", paymentAccountId: "", amount: 0, referenceNumber: "" },
    { id: "2", mode: "UPI", paymentAccountId: "", amount: 0, referenceNumber: "" },
  ]);

  // Predefined default finance partners so POS EMI is always ready without delay
  const DEFAULT_EMI_COMPANIES = [
    { id: "fc_bajaj", companyName: "Bajaj Finserv" },
    { id: "fc_hdb", companyName: "HDB Financial Services" },
    { id: "fc_idfc", companyName: "IDFC First Bank" },
  ];

  // EMI Finance State
  const [emiCompanies, setEmiCompanies] = useState<Array<{ id: string; companyName: string }>>(DEFAULT_EMI_COMPANIES);
  const [selectedEmiCompany, setSelectedEmiCompany] = useState<string>("fc_bajaj");
  const [emiDownPayment, setEmiDownPayment] = useState<number>(0);
  const [emiDownPaymentMode, setEmiDownPaymentMode] = useState<"Cash" | "UPI" | "Card">("Cash");
  const [emiReference, setEmiReference] = useState<string>("");
  const [emiExpectedDate, setEmiExpectedDate] = useState<string>("");
  const [emiCalculatorOpen, setEmiCalculatorOpen] = useState(false);
  const [emiInterestRate, setEmiInterestRate] = useState<number>(12);
  const [emiInterestType, setEmiInterestType] = useState<InterestType>("ANNUAL_REDUCING");
  const [emiTenureMonths, setEmiTenureMonths] = useState<number>(12);
  const [emiProcessingFee, setEmiProcessingFee] = useState<number>(500);
  const [emiOtherCharges, setEmiOtherCharges] = useState<number>(0);
  const [emiMonthly, setEmiMonthly] = useState<number>(0);
  const [emiTotalInterest, setEmiTotalInterest] = useState<number>(0);
  const [emiTotalPayable, setEmiTotalPayable] = useState<number>(0);

  const paymentAccounts = useMemo(() => db.paymentAccounts || [], [db.paymentAccounts]);
  const cashAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "CASH" && a.status === "ACTIVE"), [paymentAccounts]);
  const upiAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "UPI" && a.status === "ACTIVE"), [paymentAccounts]);
  const bankAccounts = useMemo(() => paymentAccounts.filter((a) => a.accountType === "BANK" && a.status === "ACTIVE"), [paymentAccounts]);
  const cardAccounts = useMemo(() => paymentAccounts.filter((a) => (a.accountType === "CARD" || a.accountType === "BANK") && a.status === "ACTIVE"), [paymentAccounts]);

  const getDefaultAccountForMode = useCallback(
    (m: string) => {
      if (m === "Cash") return cashAccounts.find((a) => a.isDefault) || cashAccounts[0];
      if (m === "UPI") return upiAccounts.find((a) => a.isDefault) || upiAccounts[0];
      if (m === "Bank") return bankAccounts.find((a) => a.isDefault) || bankAccounts[0];
      if (m === "Card") return cardAccounts.find((a) => a.isDefault) || cardAccounts[0];
      return undefined;
    },
    [cashAccounts, upiAccounts, bankAccounts, cardAccounts],
  );

  useEffect(() => {
    const def = getDefaultAccountForMode(mode);
    if (def) setSelectedAccountId(def.id);
  }, [mode, getDefaultAccountForMode]);

  useEffect(() => {
    const def = getDefaultAccountForMode(emiDownPaymentMode);
    if (def) setEmiDownPaymentAccountId(def.id);
  }, [emiDownPaymentMode, getDefaultAccountForMode]);

  useEffect(() => {
    fetch("/api/emi/companies")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEmiCompanies(data);
          setSelectedEmiCompany((prev) => prev || data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  // Shortcuts, Barcode Scanner & Admin PIN Modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState("");
  const [pinReasonPrompt, setPinReasonPrompt] = useState("Reason for privileged action *");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [discountAuthorized, setDiscountAuthorized] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const queryInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const scanBufferRef = useRef<string>("");
  const lastKeyTimeRef = useRef<number>(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.products.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      if (!q) return true;
      const unitMatch = db.units.some(
        (u) =>
          u.productId === p.id &&
          u.status === "available" &&
          (u.imei1.toLowerCase().includes(q) || (u.imei2 && u.imei2.toLowerCase().includes(q))),
      );
      return (
        p.name.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q)) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        unitMatch
      );
    });
  }, [db.products, db.units, query, category]);

  const gross = items.reduce((a, i) => a + i.price * i.qty, 0);
  const tax = invoiceType === "NON_GST"
    ? 0
    : items.reduce((a, i) => a + (i.price * i.qty * i.gst) / (100 + i.gst), 0);
  const total = Math.max(0, gross - discount);

  // Partial / Custom Paid calculation
  const effectivePaidAmount =
    mode === "Credit"
      ? 0
      : mode === "EMI"
      ? Math.min(total, emiDownPayment)
      : splitOpen
      ? mixedRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0)
      : customPaidAmount !== null
      ? customPaidAmount
      : total;

  const dueAmount = Math.max(0, Math.round((total - effectivePaidAmount) * 100) / 100);

  const handleNewSale = () => {
    if (items.length > 0) {
      if (!window.confirm("Start a new sale? Current bill will be cleared.")) {
        return;
      }
    }
    clearBill();
    if (isFastBillMode) {
      setCustomerId("c0");
      setSaleStep("billing");
      setTimeout(() => queryInputRef.current?.focus(), 50);
    } else {
      setSaleStep("customer");
    }
  };

  const toggleFastBillMode = () => {
    setIsFastBillMode((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("pos_fast_bill_mode", String(next));
        } catch {}
      }
      if (next) {
        setCustomerId("c0");
        setSaleStep("billing");
        setMode("Cash");
        queryInputRef.current?.focus();
      }
      return next;
    });
  };

  const addProduct = (productId: string) => {
    const p = db.products.find((x) => x.id === productId);
    if (!p) return;
    if (p.tracked) {
      const used = items.map((i) => i.unitId);
      const unit = db.units.find(
        (u) => u.productId === p.id && u.status === "available" && !used.includes(u.id),
      );
      if (!unit) return;
      setItems((c) => [
        ...c,
        {
          productId: p.id,
          name: p.name,
          unitId: unit.id,
          imei: unit.imei1,
          qty: 1,
          price: p.sellingPrice,
          gst: p.gst,
          costPrice: p.purchasePrice,
          warrantyMonths: p.warrantyMonths,
        },
      ]);
      return;
    }
    setItems((c) => {
      const idx = c.findIndex((i) => i.productId === p.id);
      if (idx >= 0) {
        const copy = [...c];
        copy[idx] = { ...copy[idx]!, qty: copy[idx]!.qty + 1 };
        return copy;
      }
      return [
        ...c,
        {
          productId: p.id,
          name: p.name,
          qty: 1,
          price: p.sellingPrice,
          gst: p.gst,
          costPrice: p.purchasePrice,
          warrantyMonths: p.warrantyMonths,
        },
      ];
    });
  };

  const patchItem = (idx: number, patch: Partial<LineItem>) =>
    setItems((c) => c.map((i, n) => (n === idx ? { ...i, ...patch } : i)));

  const removeItem = (idx: number) => setItems((c) => c.filter((_, n) => n !== idx));

  const clearBill = () => {
    setItems([]);
    setDiscount(0);
    setDiscountAuthorized(false);
    setCustomerId("c0");
    setCustomPaidAmount(null);
    setSplits({});
    setSplitOpen(false);
    setMode("Cash");
    setPaymentReference("");
    setEmiDownPayment(0);
    setEmiReference("");
    setEmiDownPaymentRef("");
    setMixedRows([
      { id: "1", mode: "Cash", paymentAccountId: "", amount: 0, referenceNumber: "" },
      { id: "2", mode: "UPI", paymentAccountId: "", amount: 0, referenceNumber: "" },
    ]);
  };

  const buildPayments = (): PaymentSplit[] => {
    if (mode === "Credit") {
      return [{
        mode: "Credit",
        amount: 0,
      }];
    }

    if (mode === "EMI") {
      const down = Math.min(total, Math.max(0, emiDownPayment));
      const financed = Math.max(0, total - down);
      const rows: PaymentSplit[] = [];
      if (down > 0) {
        rows.push({
          mode: emiDownPaymentMode as PaymentMode,
          amount: down,
          paymentAccountId: emiDownPaymentAccountId || getDefaultAccountForMode(emiDownPaymentMode)?.id,
          referenceNumber: emiDownPaymentRef || undefined,
        });
      }
      if (financed > 0) {
        rows.push({
          mode: "EMI" as PaymentMode,
          amount: financed,
          referenceNumber: emiReference || undefined,
        });
      }
      return rows.length ? rows : [{
        mode: "Cash",
        amount: total,
        paymentAccountId: selectedAccountId || cashAccounts[0]?.id,
      }];
    }

    if (splitOpen) {
      return mixedRows
        .filter((r) => Number(r.amount) > 0)
        .map((r) => ({
          mode: r.mode,
          amount: Number(r.amount),
          paymentAccountId: r.paymentAccountId || getDefaultAccountForMode(r.mode)?.id,
          referenceNumber: r.referenceNumber || undefined,
        }));
    }

    // Single payment mode (supports partial payment)
    const payAmt = customPaidAmount !== null ? customPaidAmount : total;
    return [{
      mode,
      amount: payAmt,
      paymentAccountId: selectedAccountId || getDefaultAccountForMode(mode)?.id,
      referenceNumber: paymentReference || undefined,
    }];
  };

  const handleScanDetected = async (code: string) => {
    setScannerOpen(false);
    const trimmed = code.trim();
    if (!trimmed) return;

    setScanStatus(`Scanning: ${trimmed}...`);
    setTimeout(() => setScanStatus(null), 3500);

    // 1. Check local units for exact IMEI match
    const unitMatch = db.units.find(
      (u) => (u.imei1 === trimmed || u.imei2 === trimmed) && u.status === "available"
    );
    if (unitMatch) {
      const prod = db.products.find((p) => p.id === unitMatch.productId);
      if (prod) {
        if (items.some((i) => i.unitId === unitMatch.id)) {
          setScanStatus(`IMEI ${trimmed} already in current bill`);
          return;
        }
        setItems((c) => [
          ...c,
          {
            productId: prod.id,
            name: prod.name,
            unitId: unitMatch.id,
            imei: unitMatch.imei1,
            qty: 1,
            price: prod.sellingPrice,
            gst: prod.gst,
            costPrice: prod.purchasePrice,
            warrantyMonths: prod.warrantyMonths,
          },
        ]);
        setScanStatus(`Added: ${prod.name} (${trimmed})`);
        queryInputRef.current?.focus();
        return;
      }
    }

    // 2. Check local product barcode / SKU / Model
    const prodMatch = db.products.find(
      (p) => p.barcode === trimmed || p.model.toLowerCase() === trimmed.toLowerCase() || p.id === trimmed
    );
    if (prodMatch) {
      addProduct(prodMatch.id);
      setScanStatus(`Added: ${prodMatch.name}`);
      queryInputRef.current?.focus();
      return;
    }

    // 3. Fallback to API barcode lookup
    try {
      const res = await fetch(`/api/barcode/lookup?code=${encodeURIComponent(trimmed)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.found) {
          if (data.type === "IMEI" && data.unit && data.product) {
            if (items.some((i) => i.unitId === data.unit.id)) {
              setScanStatus(`IMEI ${trimmed} already in bill`);
              return;
            }
            setItems((c) => [
              ...c,
              {
                productId: data.product.id,
                name: data.product.name,
                unitId: data.unit.id,
                imei: data.unit.imei1,
                qty: 1,
                price: data.product.selling_price || data.product.sellingPrice,
                gst: data.product.gst,
                costPrice: data.product.purchase_price || data.product.purchasePrice,
                warrantyMonths: data.product.warranty_months || data.product.warrantyMonths,
              },
            ]);
            setScanStatus(`Added: ${data.product.name} (${trimmed})`);
            queryInputRef.current?.focus();
            return;
          } else if (data.product) {
            addProduct(data.product.id);
            setScanStatus(`Added: ${data.product.name}`);
            queryInputRef.current?.focus();
            return;
          }
        }
      }
    } catch (err) {
      console.warn("Barcode lookup failed", err);
    }

    // Fallback: put in search query box
    setQuery(trimmed);
    queryInputRef.current?.focus();
  };

  const requestPriceOverride = (idx: number, newPrice: number) => {
    const item = items[idx];
    if (!item) return;
    if (newPrice < item.costPrice) {
      setPinAction("PRICE_OVERRIDE_BELOW_COST");
      setPinReasonPrompt(`Authorizing rate ₹${newPrice} below cost ₹${item.costPrice} for ${item.name} *`);
      setPendingAction(() => () => {
        patchItem(idx, { price: newPrice });
      });
      setPinModalOpen(true);
    } else {
      patchItem(idx, { price: newPrice });
    }
  };

  const complete = (quotation = false) => {
    if (!items.length) return;

    const isEmiSale = mode === "EMI";
    const down = Math.min(total, Math.max(0, emiDownPayment));
    const financed = Math.max(0, total - down);

    if (isEmiSale && !quotation) {
      if (emiDownPayment < 0) {
        alert("Down payment cannot be negative.");
        return;
      }
      if (emiDownPayment > total) {
        alert("Down payment cannot be greater than total sale amount.");
        return;
      }
      if (financed < 0) {
        alert("Financed amount cannot be negative.");
        return;
      }
      if (financed > 0 && !selectedEmiCompany) {
        alert("Please select a Finance Company for the EMI sale.");
        return;
      }
    }

    // Validate Mixed / Split Payments
    if (splitOpen && !quotation) {
      const sumSplits = mixedRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      if (Math.abs(sumSplits - total) > 0.01) {
        alert(
          `Total of split payments (₹${sumSplits}) must equal bill total (₹${total}). Difference: ₹${total - sumSplits}`
        );
        return;
      }
    }

    // Check high discount authorization (> ₹1000 or > 20% of gross)
    if (!quotation && discount > 1000 && !discountAuthorized) {
      setPinAction("HIGH_DISCOUNT_AUTHORIZATION");
      setPinReasonPrompt(`Authorizing special counter discount of ₹${discount} *`);
      setPendingAction(() => () => {
        setDiscountAuthorized(true);
        const sale = recordSale({
          customerId,
          invoiceType,
          selectedTemplateId,
          items,
          discount,
          payments: buildPayments(),
          quotation: false,
          isEmi: isEmiSale,
          emiCompanyId: isEmiSale ? selectedEmiCompany : undefined,
          emiDownPayment: isEmiSale ? down : undefined,
          emiFinancedAmount: isEmiSale ? financed : undefined,
          financeReferenceNumber: isEmiSale ? emiReference : undefined,
          expectedPaymentDate: isEmiSale ? (emiExpectedDate || undefined) : undefined,
          interestRate: isEmiSale ? emiInterestRate : undefined,
          interestType: isEmiSale ? emiInterestType : undefined,
          tenureMonths: isEmiSale ? emiTenureMonths : undefined,
          firstEmiDate: isEmiSale ? (emiExpectedDate || undefined) : undefined,
        });
        setLastCompletedSale(sale);
        setSuccessModalOpen(true);
        clearBill();
        if (isFastBillMode) {
          queryInputRef.current?.focus();
        }
      });
      setPinModalOpen(true);
      return;
    }

    const sale = recordSale({
      customerId,
      invoiceType,
      selectedTemplateId,
      items,
      discount,
      payments: quotation ? [] : buildPayments(),
      quotation,
      isEmi: isEmiSale,
      emiCompanyId: isEmiSale ? selectedEmiCompany : undefined,
      emiDownPayment: isEmiSale ? down : undefined,
      emiFinancedAmount: isEmiSale ? financed : undefined,
      financeReferenceNumber: isEmiSale ? emiReference : undefined,
      expectedPaymentDate: isEmiSale ? (emiExpectedDate || undefined) : undefined,
      interestRate: isEmiSale ? emiInterestRate : undefined,
      interestType: isEmiSale ? emiInterestType : undefined,
      tenureMonths: isEmiSale ? emiTenureMonths : undefined,
      firstEmiDate: isEmiSale ? (emiExpectedDate || undefined) : undefined,
    });

    if (quotation) {
      setInvoice(sale);
      clearBill();
    } else {
      setLastCompletedSale(sale);
      setSuccessModalOpen(true);
      clearBill();
      if (isFastBillMode) {
        queryInputRef.current?.focus();
      }
    }
  };

  const hold = () => {
    if (!items.length) return;
    setHeld((h) => [...h, { id: String(Date.now()), customerId, items, discount }]);
    clearBill();
  };

  const resume = (h: Held) => {
    setItems(h.items);
    setDiscount(h.discount);
    setCustomerId(h.customerId);
    setHeld((list) => list.filter((x) => x.id !== h.id));
  };

  // Keyboard Shortcuts (F1 - F9, ESC, Ctrl+Enter, USB Barcode scanner)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // ESC closes open modals
      if (e.key === "Escape") {
        if (scannerOpen) {
          setScannerOpen(false);
          e.preventDefault();
        } else if (pinModalOpen) {
          setPinModalOpen(false);
          e.preventDefault();
        } else if (changeCustomerModalOpen) {
          setChangeCustomerModalOpen(false);
          e.preventDefault();
        } else if (recentBillsModalOpen) {
          setRecentBillsModalOpen(false);
          e.preventDefault();
        } else if (collectDueOpen) {
          setCollectDueOpen(false);
          e.preventDefault();
        } else if (quickCustModalOpen) {
          setQuickCustModalOpen(false);
          e.preventDefault();
        } else if (successModalOpen) {
          setSuccessModalOpen(false);
          e.preventDefault();
        } else if (invoice) {
          setInvoice(null);
          e.preventDefault();
        }
        return;
      }

      // Ctrl + Enter = Instant Generate Bill
      if (e.ctrlKey && e.key === "Enter") {
        e.preventDefault();
        if (items.length > 0) complete(false);
        return;
      }

      // POS function key shortcuts
      if (e.key === "F1") {
        e.preventDefault();
        handleNewSale();
      } else if (e.key === "F2") {
        e.preventDefault();
        setChangeCustomerModalOpen(true);
      } else if (e.key === "F3") {
        e.preventDefault();
        queryInputRef.current?.focus();
        queryInputRef.current?.select();
      } else if (e.key === "F4") {
        e.preventDefault();
        if (items.length > 0) hold();
      } else if (e.key === "F5") {
        e.preventDefault();
        if (items.length > 0) complete(false);
      } else if (e.key === "F6") {
        e.preventDefault();
        discountInputRef.current?.focus();
        discountInputRef.current?.select();
      } else if (e.key === "F7") {
        e.preventDefault();
        if (invoice || lastCompletedSale) {
          window.print();
        } else if (items.length > 0) {
          complete(false);
          setTimeout(() => window.print(), 350);
        }
      } else if (e.key === "F8") {
        e.preventDefault();
        setRecentBillsModalOpen(true);
      } else if (e.key === "F9") {
        e.preventDefault();
        setScannerOpen(true);
      }

      // Hardware USB Barcode Scanner buffer capture
      const now = Date.now();
      if (now - lastKeyTimeRef.current > 120) {
        scanBufferRef.current = "";
      }
      lastKeyTimeRef.current = now;

      if (e.key === "Enter" && scanBufferRef.current.length >= 6) {
        const scanned = scanBufferRef.current;
        scanBufferRef.current = "";
        handleScanDetected(scanned);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        scanBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, invoice, scannerOpen, changeCustomerModalOpen, collectDueOpen, quickCustModalOpen, successModalOpen, pinModalOpen, discount, customerId, discountAuthorized, lastCompletedSale]);

  // STEP 1: CUSTOMER DETAILS (Rendered first on New Sale before product billing screen)
  if (saleStep === "customer") {
    return (
      <div className="space-y-4">
        {/* Simple top bar with fast bill mode */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/80 bg-white/80 glass-strong px-4 py-2.5 text-[12px] shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-primary text-sm tracking-wide flex items-center gap-1.5">
              <Zap className="size-4 fill-primary" /> POS BILLING
            </span>
            <span className="text-xs text-muted-foreground hidden sm:inline">· Step 1: Customer Details</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleFastBillMode}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11.5px] font-bold transition-all border cursor-pointer ${
                isFastBillMode
                  ? "bg-amber-500 text-white border-amber-600 shadow-xs animate-pulse"
                  : "bg-muted/60 text-muted-foreground border-border/80 hover:text-foreground"
              }`}
              title="Fast Bill Mode: Auto Walk-in customer, Cash payment, and continuous billing"
            >
              <span>⚡ FAST BILL:</span>
              <span>{isFastBillMode ? "ON" : "OFF"}</span>
            </button>
          </div>
        </div>

        {/* Centered NEW SALE - Customer Details Card */}
        <NewSaleCustomerModal
          variant="page"
          open={true}
          onClose={() => {
            setCustomerId("c0");
            setSaleStep("billing");
            setTimeout(() => queryInputRef.current?.focus(), 50);
          }}
          onContinue={(cust) => {
            setCustomerId(cust.id);
            setSaleStep("billing");
            setTimeout(() => {
              queryInputRef.current?.focus();
              queryInputRef.current?.select();
            }, 50);
          }}
          onSelectWalkIn={() => {
            const walkIn = db.customers.find((c) => c.id === "c0" || c.name === "Walk-in Customer");
            setCustomerId(walkIn ? walkIn.id : "c0");
            setSaleStep("billing");
            setTimeout(() => {
              queryInputRef.current?.focus();
              queryInputRef.current?.select();
            }, 50);
          }}
          currentCustomer={customer}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* POS Top Bar: Hotkeys, Scanner, Fast Bill Mode */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-border/80 bg-white/80 glass-strong px-4 py-2.5 text-[12px] shadow-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            onClick={handleNewSale}
            className="h-7 text-xs font-bold gap-1 bg-primary text-primary-foreground shadow-xs mr-1"
          >
            <Plus className="size-3.5" /> + NEW SALE (F1)
          </Button>
          <span className="font-bold text-primary mr-1 flex items-center gap-1 hidden sm:flex">
            <Zap className="size-3.5 fill-primary" /> Hotkeys:
          </span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F2 Customer</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F3 Search</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F4 Hold</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F5 Pay</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F6 Disc</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F7 Print</span>
          <span className="rounded bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 font-mono text-[10.5px] font-bold">F8 Bills</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F9 Scan</span>
          <span className="rounded bg-primary/10 text-primary px-2 py-0.5 font-mono text-[10.5px] font-bold">Ctrl+Enter Bill</span>
        </div>

        <div className="flex items-center gap-2">
          {scanStatus && (
            <span className="text-[11px] font-medium text-primary animate-pulse">{scanStatus}</span>
          )}

          {/* VIEW RECENT BILLS BUTTON */}
          {/* DIRECT BILL / MANUAL SALE BUTTON */}
          <Button
            size="sm"
            variant="soft"
            onClick={() => {
              setDirectBillPrefill({});
              setDirectBillModalOpen(true);
            }}
            className="h-7.5 text-[11.5px] gap-1.5 font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/35 shadow-2xs"
            title="Create direct bill for un-inventoried items or manual sale"
          >
            <Zap className="size-3.5 text-amber-600 dark:text-amber-400" />
            <span>⚡ Direct Bill (Manual)</span>
          </Button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRecentBillsModalOpen(true)}
            className="h-7.5 text-[11.5px] gap-1.5 font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
            title="View & Reprint past sales bills (F8)"
          >
            <FileText className="size-3.5" /> Recent Bills (F8)
          </Button>

          {/* FAST BILL MODE TOGGLE */}
          <button
            type="button"
            onClick={toggleFastBillMode}
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[11.5px] font-bold transition-all border cursor-pointer ${
              isFastBillMode
                ? "bg-amber-500 text-white border-amber-600 shadow-xs animate-pulse"
                : "bg-muted/60 text-muted-foreground border-border/80 hover:text-foreground"
            }`}
            title="Fast Bill Mode: Auto Walk-in customer, Cash payment, and continuous billing"
          >
            <span>⚡ FAST BILL:</span>
            <span>{isFastBillMode ? "ON" : "OFF"}</span>
          </button>

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setScannerOpen(true)}
            className="h-7.5 text-[11.5px] gap-1.5 font-semibold bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20"
          >
            <span>📷</span> Scan (F9)
          </Button>
        </div>
      </div>

      {/* TOP CUSTOMER BANNER */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/[0.08] via-primary/[0.02] to-white p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-sm shadow-xs">
            👤
          </div>
          <div>
            <div className="text-[10px] font-extrabold tracking-wider uppercase text-primary">CUSTOMER</div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[14px] font-extrabold text-foreground">{customer?.name || "Walk-in Customer"}</span>
              {(customer?.phone || customer?.mobile) && customer.phone !== "—" && (
                <span className="text-[12px] font-mono text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md font-semibold">
                  {customer.phone || customer.mobile}
                </span>
              )}
              {customer?.address && (
                <span className="text-[11px] text-muted-foreground hidden md:inline truncate max-w-xs">
                  📍 {customer.address}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {customerDue > 0 && (
            <button
              type="button"
              onClick={() => setCollectDueOpen(true)}
              className="px-2.5 py-1 rounded-xl bg-destructive/10 text-destructive border border-destructive/30 text-xs font-bold hover:bg-destructive/20 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span>⚠️ Due:</span>
              <span className="font-mono">{inr(customerDue)}</span>
              <span className="underline ml-0.5">Collect Due</span>
            </button>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => setChangeCustomerModalOpen(true)}
            className="h-8 text-xs font-bold gap-1 bg-white hover:bg-muted border-border/80"
          >
            <span>⇄</span> Change Customer (F2)
          </Button>
        </div>
      </div>

      {/* MAIN 65% / 35% POS LAYOUT */}
      <div className="grid gap-4 lg:grid-cols-12 items-start">
        {/* LEFT 65%: PRODUCT CATALOG & SEARCH */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-3">
          <Card className="p-4 space-y-3">
            <div className="flex gap-2">
              <Input
                ref={queryInputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results.length > 0) {
                    addProduct(results[0].id);
                    setQuery("");
                  }
                }}
                placeholder="Search Product by Name, Model, Brand, Barcode or IMEI (F3)…"
                className="flex-1 h-10 text-[13px]"
              />
              <Button
                variant="secondary"
                onClick={() => setScannerOpen(true)}
                className="hidden sm:inline-flex h-10 gap-1.5 font-medium"
              >
                <span>📷</span> Scan
              </Button>
              <Button variant="ghost" onClick={() => setQuery("")} className="h-10 text-xs text-muted-foreground">
                Clear
              </Button>
            </div>

            {/* Categories */}
            <div className="flex flex-wrap gap-1.5 pb-1">
              {["All", ...CATEGORIES].map((c) => (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  className={cn(
                    "h-7 rounded-lg px-2.5 text-[11.5px] font-semibold transition-all cursor-pointer",
                    category === c
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted/40 text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Product Cards Grid */}
            <div className="grid gap-2.5 sm:grid-cols-2 md:grid-cols-3">
              {results.map((p) => {
                const stock = stockOf(db, p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (stock <= 0) {
                        setDirectBillPrefill({
                          name: p.name,
                          price: p.sellingPrice,
                          gst: p.gst,
                        });
                        setDirectBillModalOpen(true);
                        return;
                      }
                      addProduct(p.id);
                      if (isFastBillMode) {
                        queryInputRef.current?.focus();
                      }
                    }}
                    className={`glass-strong rounded-xl border p-3 text-left transition-all cursor-pointer flex flex-col justify-between bg-white/70 group ${
                      stock <= 0
                        ? "border-amber-500/40 hover:border-amber-500 hover:bg-amber-50/50"
                        : "border-border/80 hover:border-primary/50 hover:shadow-xs"
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1.5">
                        <span className="text-[12.5px] font-bold tracking-tight text-foreground line-clamp-1">
                          {p.name}
                        </span>
                        <Badge
                          tone={stock <= 0 ? "danger" : stock <= p.reorderLevel ? "warning" : "success"}
                          className="shrink-0 text-[9.5px] py-0 px-1"
                        >
                          {stock <= 0 ? "Out" : `${stock} in stock`}
                        </Badge>
                      </div>

                      <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                        {[p.model, p.brand, p.color].filter(Boolean).join(" · ")}
                      </div>
                    </div>

                    <div className="mt-2.5 flex items-end justify-between border-t border-border/40 pt-1.5">
                      <span className="num text-[14px] font-bold text-primary">{inr(p.sellingPrice)}</span>
                      <span className="num text-[10px] text-muted-foreground font-mono">
                        {p.tracked ? "IMEI Serial" : `GST ${p.gst}%`}
                      </span>
                    </div>
                  </button>
                );
              })}
              {results.length === 0 ? (
                <div className="sm:col-span-3 py-6 text-center space-y-2">
                  <Empty text={`No product matches "${query}".`} />
                  {query.trim() && (
                    <Button
                      type="button"
                      size="sm"
                      variant="soft"
                      onClick={() => {
                        setDirectBillPrefill({ name: query.trim() });
                        setDirectBillModalOpen(true);
                      }}
                      className="text-xs gap-1.5 bg-amber-500/15 border-amber-500/40 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25"
                    >
                      <Zap className="w-3.5 h-3.5 text-amber-600" />
                      ⚡ Add &quot;{query.trim()}&quot; to Direct Bill (Manual)
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </Card>
        </div>

        {/* RIGHT 35%: STICKY BILLING & PAYMENT PANEL */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-3 self-start max-h-[calc(100vh-1.5rem)] overflow-y-auto pr-0.5 space-y-3">
          <Card className="p-3.5 space-y-3 shadow-sm border-border/90">
            {/* Header: Title + Sale Mode + Template */}
            <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-[13px] tracking-wider text-foreground uppercase">Current Bill</span>
                <Badge tone="info" className="text-[10px] py-0 px-1.5">
                  {items.length} item{items.length === 1 ? "" : "s"}
                </Badge>
              </div>

              <div className="flex items-center gap-1.5">
                {/* GST / NON-GST TOGGLE */}
                <div className="inline-flex rounded-lg p-0.5 bg-muted/70 border border-border/60">
                  <button
                    type="button"
                    onClick={() => setInvoiceType("GST")}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                      invoiceType === "GST"
                        ? "bg-primary text-primary-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    GST
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceType("NON_GST")}
                    className={`px-2 py-0.5 rounded-md text-[10.5px] font-bold transition-all cursor-pointer ${
                      invoiceType === "NON_GST"
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Non-GST
                  </button>
                </div>

                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={hold} disabled={!items.length} className="h-6.5 text-[10.5px] px-1.5">
                    Hold
                  </Button>
                  <Button size="sm" variant="ghost" onClick={clearBill} className="h-6.5 text-[10.5px] px-1.5 text-destructive">
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            {/* Held Bills Bar */}
            {held.length > 0 && (
              <div className="flex flex-wrap gap-1 p-1.5 rounded-lg bg-warning/10 border border-warning/30">
                <span className="text-[10.5px] font-bold text-warning-foreground self-center mr-1">Held:</span>
                {held.map((h, n) => (
                  <button
                    key={h.id}
                    onClick={() => resume(h)}
                    className="rounded bg-white px-2 py-0.5 text-[10.5px] font-semibold text-warning-foreground border border-warning/40 hover:bg-warning/20 transition-colors"
                  >
                    Resume #{n + 1} ({h.items.length})
                  </button>
                ))}
              </div>
            )}

            {/* 1. COMPACT CUSTOMER HEADER */}
            <div className="rounded-xl border border-border/80 bg-muted/15 p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">CUSTOMER</span>
                <button
                  type="button"
                  data-action="change-customer"
                  onClick={() => setChangeCustomerModalOpen(true)}
                  className="text-[11px] font-bold text-primary hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>[ Change Customer ]</span>
                </button>
              </div>

              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-extrabold text-[13.5px] text-foreground">{customer?.name || "Walk-in Customer"}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    {(customer?.phone || customer?.mobile) && customer.phone !== "—"
                      ? (customer.phone || customer.mobile)
                      : "Walk-in Customer"}
                  </div>
                  {customer?.address && (
                    <div className="text-[10.5px] text-muted-foreground mt-0.5 truncate max-w-[200px]">
                      📍 {customer.address}
                    </div>
                  )}
                </div>

                <div className="text-right shrink-0">
                  {customerDue > 0 ? (
                    <div className="space-y-1">
                      <Badge tone="danger" className="text-[9.5px] py-0 px-1.5 block">
                        Due: {inr(customerDue)}
                      </Badge>
                      <button
                        type="button"
                        onClick={() => setCollectDueOpen(true)}
                        className="text-[10px] font-bold text-destructive hover:underline block"
                      >
                        Collect Due
                      </button>
                    </div>
                  ) : (
                    <Badge tone="success" className="text-[9px] py-0 px-1">
                      Active
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            {/* 2. CART LINE ITEMS TABLE */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Bill Items ({items.length})
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setDirectBillPrefill({});
                      setDirectBillModalOpen(true);
                    }}
                    className="text-[10px] font-bold text-amber-700 dark:text-amber-300 hover:text-amber-800 flex items-center gap-1 cursor-pointer bg-amber-500/15 hover:bg-amber-500/25 px-2 py-0.5 rounded-lg border border-amber-500/30 transition-all shadow-2xs"
                    title="Directly add items that are not in inventory to this bill"
                  >
                    <Zap className="size-3 text-amber-600" />
                    <span>⚡ + Manual Item</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCustomAmountModalOpen(true)}
                    className="text-[10px] font-bold text-primary hover:text-primary/80 flex items-center gap-1 cursor-pointer bg-primary/10 hover:bg-primary/15 px-2 py-0.5 rounded-lg border border-primary/20 transition-all shadow-2xs"
                    title="Add extra charge, accessory, service charge or custom amount"
                  >
                    <Plus className="size-3" />
                    <span>+ Extra</span>
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="py-6 border border-dashed border-border/70 rounded-xl">
                  <Empty text="Tap a product or scan barcode to add to bill." />
                </div>
              ) : (
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {items.map((i, idx) => {
                    const product = db.products.find((p) => p.id === i.productId);
                    const options = db.units.filter(
                      (u) => u.productId === i.productId && (u.status === "available" || u.id === i.unitId),
                    );
                    return (
                      <div key={idx} className="rounded-xl border border-border/80 bg-muted/15 p-2.5 text-[12px] space-y-1.5">
                        <div className="flex items-start justify-between gap-1.5">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              {i.isManual && (
                                <span className="inline-block text-[9px] font-extrabold text-amber-700 dark:text-amber-300 bg-amber-500/15 px-1.5 py-0.5 rounded border border-amber-500/30 shrink-0">
                                  ⚡ MANUAL
                                </span>
                              )}
                              <span className="font-semibold text-foreground truncate block text-[12.5px]">{i.name}</span>
                            </div>
                            {i.imei && !product?.tracked && (
                              <div className="text-[10px] font-mono font-semibold text-primary mt-0.5">
                                IMEI: {i.imei}
                              </div>
                            )}
                            {product?.tracked ? (
                              <Select
                                value={i.unitId ?? ""}
                                onChange={(e) => {
                                  const u = db.units.find((x) => x.id === e.target.value);
                                  patchItem(idx, { unitId: u?.id, imei: u?.imei1 });
                                }}
                                className="mt-1 h-6.5 text-[10.5px] font-mono"
                              >
                                {options.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    IMEI {u.imei1}
                                  </option>
                                ))}
                              </Select>
                            ) : (
                              <div className="flex items-center gap-1.5 mt-1 text-[11px]">
                                <button
                                  type="button"
                                  className="size-5 rounded bg-muted flex items-center justify-center font-bold text-foreground hover:bg-muted/80 cursor-pointer"
                                  onClick={() => patchItem(idx, { qty: Math.max(1, i.qty - 1) })}
                                >
                                  −
                                </button>
                                <span className="font-mono font-bold px-1">{i.qty}</span>
                                <button
                                  type="button"
                                  className="size-5 rounded bg-muted flex items-center justify-center font-bold text-foreground hover:bg-muted/80 cursor-pointer"
                                  onClick={() => patchItem(idx, { qty: i.qty + 1 })}
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-bold font-mono text-[13px] text-foreground block">
                              {inr(i.price * i.qty)}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {i.qty > 1 ? `(${inr(i.price)} × ${i.qty})` : "Total"}
                            </span>
                          </div>
                        </div>

                        {/* Rate / Selling Price Controls & Badges */}
                        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1.5 border-t border-border/40 text-[11px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-muted-foreground">Rate:</span>
                            <input
                              type="number"
                              defaultValue={i.price}
                              key={`${idx}-${i.price}`}
                              onBlur={(e) => {
                                const val = Number(e.target.value);
                                if (!isNaN(val) && val >= 0 && val !== i.price) {
                                  requestPriceOverride(idx, val);
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const val = Number((e.target as HTMLInputElement).value);
                                  if (!isNaN(val) && val >= 0 && val !== i.price) {
                                    requestPriceOverride(idx, val);
                                  }
                                  (e.target as HTMLInputElement).blur();
                                }
                              }}
                              className="h-6 w-20 rounded border border-border bg-background px-1.5 text-right font-mono text-[11px] font-bold text-foreground focus:border-primary focus:outline-none"
                              title="Click to edit selling price. Press Enter or click outside to apply."
                            />
                            <button
                              type="button"
                              onClick={() => setAdjustPriceItemIndex(idx)}
                              className="h-6 px-1.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary border border-primary/25 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                              title="Adjust or increase selling price"
                            >
                              <TrendingUp className="size-2.5" />
                              <span>बढ़ाएं</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => patchItem(idx, { price: i.price + 100 })}
                              className="h-5 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300/60 text-[9.5px] font-mono font-bold cursor-pointer transition-all active:scale-95"
                              title="Add ₹100 to rate"
                            >
                              +100
                            </button>
                            <button
                              type="button"
                              onClick={() => patchItem(idx, { price: i.price + 500 })}
                              className="h-5 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300/60 text-[9.5px] font-mono font-bold cursor-pointer transition-all active:scale-95"
                              title="Add ₹500 to rate"
                            >
                              +500
                            </button>
                            <button
                              type="button"
                              onClick={() => patchItem(idx, { price: i.price + 1000 })}
                              className="h-5 px-1.5 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300/60 text-[9.5px] font-mono font-bold cursor-pointer transition-all active:scale-95"
                              title="Add ₹1,000 to rate"
                            >
                              +1k
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] text-muted-foreground pt-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{i.gst > 0 && invoiceType === "GST" ? `GST ${i.gst}%` : "0% GST"}</span>
                            {i.price < i.costPrice && (
                              <Badge tone="danger" className="text-[8.5px] py-0 px-1">
                                Below Cost
                              </Badge>
                            )}
                            {product && i.price > product.sellingPrice && (
                              <Badge tone="success" className="text-[8.5px] py-0 px-1">
                                +{inr(i.price - product.sellingPrice)} Extra Profit
                              </Badge>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            className="text-destructive hover:underline text-[10.5px] font-semibold flex items-center gap-0.5 cursor-pointer"
                          >
                            <Trash2 className="size-3" /> Remove
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 3. DISCOUNT & PAYMENT MODE */}
            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Discount (₹) — F6">
                  <Input
                    ref={discountInputRef}
                    type="number"
                    value={discount || ""}
                    onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                    placeholder="0"
                    className="h-9 text-[12.5px] font-mono"
                  />
                </Field>
                <Field label="Payment Mode">
                  <Select
                    value={mode}
                    onChange={(e) => {
                      const m = e.target.value as PaymentMode;
                      setMode(m);
                      if (m === "EMI") {
                        setEmiCalculatorOpen(true);
                      }
                    }}
                    disabled={splitOpen}
                    className="h-9 text-[12.5px] font-semibold"
                  >
                    {PAYMENT_MODES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
              </div>

              {/* Payment Account Selectors */}
              {!splitOpen && mode === "Cash" && (
                <Field label="Cash Drawer / Account">
                  <Select
                    value={selectedAccountId}
                    onChange={(e) => setSelectedAccountId(e.target.value)}
                    className="h-8.5 text-[12px]"
                  >
                    {cashAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} {a.isDefault ? "(Default)" : ""} · Bal: {inr(a.currentBalance || 0)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              {!splitOpen && mode === "UPI" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="UPI Account *">
                    <Select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="h-8.5 text-[12px]"
                    >
                      {upiAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountName} {a.upiId ? `(${a.upiId})` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="UPI Ref / Txn ID">
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. UPI/12345"
                      className="h-8.5 text-[12px]"
                    />
                  </Field>
                </div>
              )}

              {!splitOpen && mode === "Bank" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Bank Account *">
                    <Select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="h-8.5 text-[12px]"
                    >
                      {bankAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountName} {a.accountNumber ? `(${a.accountNumber.slice(-4)})` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="NEFT / UTR Ref">
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. UTR8912"
                      className="h-8.5 text-[12px]"
                    />
                  </Field>
                </div>
              )}

              {!splitOpen && mode === "Card" && (
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Card Machine A/C *">
                    <Select
                      value={selectedAccountId}
                      onChange={(e) => setSelectedAccountId(e.target.value)}
                      className="h-8.5 text-[12px]"
                    >
                      {cardAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.accountName}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Card Slip / Auth Ref">
                    <Input
                      value={paymentReference}
                      onChange={(e) => setPaymentReference(e.target.value)}
                      placeholder="e.g. AUTH/9981"
                      className="h-8.5 text-[12px]"
                    />
                  </Field>
                </div>
              )}

              {!splitOpen && mode === "Credit" && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11.5px] text-amber-900 font-medium">
                  ℹ️ Full amount {inr(total)} will be debited to customer's ledger as outstanding due.
                </div>
              )}

              {/* Partial Payment: Paid Amount & Balance Due Inputs */}
              {!splitOpen && mode !== "Credit" && mode !== "EMI" && (
                <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/60">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Paid Amount (₹)">
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={customPaidAmount !== null ? customPaidAmount : total}
                        onChange={(e) => {
                          const val = e.target.value === "" ? null : Number(e.target.value);
                          setCustomPaidAmount(val);
                        }}
                        className="h-8.5 font-mono font-bold text-[13px] text-emerald-700"
                        title="Enter amount paid by customer (supports full, partial, or higher with change return)"
                      />
                    </Field>
                    <Field label={effectivePaidAmount > total ? "Change to Return" : "Due Balance (₹)"}>
                      <div
                        className={`h-8.5 rounded-lg border px-2.5 flex items-center justify-between text-[12px] font-mono font-bold ${
                          effectivePaidAmount > total
                            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700"
                            : dueAmount > 0
                            ? "border-destructive/40 bg-destructive/10 text-destructive"
                            : "border-border/60 bg-white text-muted-foreground"
                        }`}
                      >
                        <span>
                          {effectivePaidAmount > total
                            ? "Change:"
                            : dueAmount > 0
                            ? "Due:"
                            : "Fully Paid"}
                        </span>
                        <span>
                          {effectivePaidAmount > total
                            ? inr(effectivePaidAmount - total)
                            : inr(dueAmount)}
                        </span>
                      </div>
                    </Field>
                  </div>
                  {effectivePaidAmount > total && (
                    <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-lg flex items-center justify-between">
                      <span>💵 Return to Customer (वापसी राशि):</span>
                      <span className="font-mono font-extrabold text-[12px]">{inr(effectivePaidAmount - total)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* EMI Mode Configuration */}
              {mode === "EMI" && !splitOpen && (
                <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3 space-y-2.5 text-[12px]">
                  <div className="flex items-center justify-between font-bold text-primary">
                    <span>💳 EMI Financing</span>
                    <Button
                      type="button"
                      variant="soft"
                      size="sm"
                      onClick={() => setEmiCalculatorOpen(true)}
                      className="h-6.5 text-[10.5px] gap-1 font-bold bg-primary/15 text-primary border-primary/30"
                    >
                      <Calculator className="size-3" /> Calculator
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Finance Partner *">
                      <Select
                        value={selectedEmiCompany}
                        onChange={(e) => setSelectedEmiCompany(e.target.value)}
                        className="h-8 text-[11.5px]"
                      >
                        {emiCompanies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.companyName}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Down Payment (₹)">
                      <Input
                        type="number"
                        min="0"
                        max={total}
                        value={emiDownPayment || ""}
                        onChange={(e) => setEmiDownPayment(Math.max(0, Number(e.target.value) || 0))}
                        placeholder="0"
                        className="h-8 text-[11.5px] font-mono"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Down Payment Mode">
                      <Select
                        value={emiDownPaymentMode}
                        onChange={(e) => setEmiDownPaymentMode(e.target.value as any)}
                        className="h-8 text-[11.5px]"
                      >
                        <option value="Cash">Cash</option>
                        <option value="UPI">UPI</option>
                        <option value="Card">Card</option>
                      </Select>
                    </Field>
                    <Field label="Loan / Ref #">
                      <Input
                        value={emiReference}
                        onChange={(e) => setEmiReference(e.target.value)}
                        placeholder="e.g. BAJ-1029"
                        className="h-8 text-[11.5px]"
                      />
                    </Field>
                  </div>
                </div>
              )}

              {/* Mixed Payment Toggle */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const next = !splitOpen;
                    setSplitOpen(next);
                    if (next && mixedRows.every((r) => r.amount === 0)) {
                      setMixedRows([
                        { id: "1", mode: "Cash", paymentAccountId: cashAccounts[0]?.id || "", amount: Math.round(total / 2), referenceNumber: "" },
                        { id: "2", mode: "UPI", paymentAccountId: upiAccounts[0]?.id || "", amount: Math.round(total - Math.round(total / 2)), referenceNumber: "" },
                      ]);
                    }
                  }}
                  className="text-[11.5px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {splitOpen ? "← Single Payment Mode" : "🔀 Mixed / Split Payment"}
                </button>
                {splitOpen && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMixedRows((rows) => [
                        ...rows,
                        {
                          id: String(Date.now()),
                          mode: "Bank",
                          paymentAccountId: bankAccounts[0]?.id || "",
                          amount: 0,
                          referenceNumber: "",
                        },
                      ]);
                    }}
                    className="h-6 text-[10.5px] px-2 gap-1 font-semibold"
                  >
                    <Plus className="size-3" /> Add Mode
                  </Button>
                )}
              </div>

              {/* Mixed Payments Table */}
              {splitOpen && (
                <div className="space-y-2 rounded-xl border border-primary/30 bg-muted/20 p-2.5">
                  <div className="space-y-1.5">
                    {mixedRows.map((r) => (
                      <div key={r.id} className="grid grid-cols-12 gap-1 items-center bg-white p-1.5 rounded-lg border border-border text-[11px]">
                        <div className="col-span-4">
                          <select
                            value={r.mode}
                            onChange={(e) => {
                              const newMode = e.target.value as PaymentMode;
                              const defAcc = getDefaultAccountForMode(newMode);
                              setMixedRows((rows) =>
                                rows.map((row) =>
                                  row.id === r.id
                                    ? { ...row, mode: newMode, paymentAccountId: defAcc?.id || "" }
                                    : row,
                                ),
                              );
                            }}
                            className="h-6.5 w-full rounded border border-border bg-background px-1 text-[10.5px] font-medium"
                          >
                            {PAYMENT_MODES.map((m) => (
                              <option key={m} value={m}>
                                {m}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="col-span-4">
                          <input
                            type="text"
                            value={r.referenceNumber}
                            onChange={(e) => {
                              const val = e.target.value;
                              setMixedRows((rows) =>
                                rows.map((row) => (row.id === r.id ? { ...row, referenceNumber: val } : row)),
                              );
                            }}
                            placeholder="Ref #"
                            className="h-6.5 w-full rounded border border-border bg-background px-1 text-[10px]"
                          />
                        </div>

                        <div className="col-span-3">
                          <input
                            type="number"
                            value={r.amount || ""}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setMixedRows((rows) =>
                                rows.map((row) => (row.id === r.id ? { ...row, amount: val } : row)),
                              );
                            }}
                            placeholder="0"
                            className="h-6.5 w-full rounded border border-border bg-background px-1 text-right font-mono font-bold text-[10.5px]"
                          />
                        </div>

                        <div className="col-span-1 text-center">
                          {mixedRows.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setMixedRows((rows) => rows.filter((row) => row.id !== r.id))}
                              className="text-destructive hover:opacity-80"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const sumSplits = mixedRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
                    const diff = total - sumSplits;
                    const isMatched = Math.abs(diff) < 0.01;
                    return (
                      <div
                        className={`rounded-lg p-1.5 text-[10.5px] font-semibold flex items-center justify-between border ${
                          isMatched
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                            : "bg-destructive/10 border-destructive/30 text-destructive"
                        }`}
                      >
                        <span>Allocated: {inr(sumSplits)} / {inr(total)}</span>
                        <span>{isMatched ? "✓ Matched" : `Diff: ${inr(diff)}`}</span>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* 4. LIVE SUMMARY BOX */}
            <div className="glass-strong space-y-1.5 rounded-xl border border-border/80 p-3 text-[12px] bg-white/70">
              <div className="flex justify-between text-muted-foreground">
                <span>Taxable Value</span>
                <span className="num">{inr2(gross - tax)}</span>
              </div>
              {invoiceType === "GST" && (
                <div className="flex justify-between text-muted-foreground">
                  <span>GST Total</span>
                  <span className="num">{inr2(tax)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span className="num text-destructive">−{inr(discount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-1.5 text-[15px] font-extrabold text-foreground">
                <span>Grand Total</span>
                <span className="num text-primary">{inr(total)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-semibold text-[12px]">
                <span>Paid</span>
                <span className="num font-bold">{inr(effectivePaidAmount)}</span>
              </div>
              {dueAmount > 0 && (
                <div className="flex items-center justify-between text-destructive font-bold text-[13px] border-t border-destructive/20 pt-1">
                  <span>Balance Due</span>
                  <span className="num">{inr(dueAmount)}</span>
                </div>
              )}
            </div>

            {/* 5. PRIMARY ACTION: GENERATE BILL */}
            <div className="space-y-2 pt-1">
              <Button
                size="lg"
                className="w-full text-[13.5px] font-extrabold h-12 bg-primary hover:bg-primary/90 text-primary-foreground shadow-md gap-2"
                disabled={
                  !items.length ||
                  (splitOpen && Math.abs(total - mixedRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)) > 0.01)
                }
                onClick={() => complete(false)}
              >
                <span>⚡</span> GENERATE BILL • {inr(total)} (Ctrl + Enter)
              </Button>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => complete(true)}
                  disabled={!items.length}
                  className="text-xs h-8 text-muted-foreground"
                >
                  📄 Quotation (F5)
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearBill}
                  className="text-xs h-8 text-muted-foreground hover:text-destructive"
                >
                  ✕ Clear (F1)
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* MODAL VERSION FOR CHANGE CUSTOMER DURING ACTIVE BILL */}
      <NewSaleCustomerModal
        variant="modal"
        open={changeCustomerModalOpen}
        onClose={() => setChangeCustomerModalOpen(false)}
        onContinue={(cust) => {
          setCustomerId(cust.id);
          setChangeCustomerModalOpen(false);
          setTimeout(() => {
            queryInputRef.current?.focus();
            queryInputRef.current?.select();
          }, 50);
        }}
        onSelectWalkIn={() => {
          const walkIn = db.customers.find((c) => c.id === "c0" || c.name === "Walk-in Customer");
          setCustomerId(walkIn ? walkIn.id : "c0");
          setChangeCustomerModalOpen(false);
          setTimeout(() => {
            queryInputRef.current?.focus();
            queryInputRef.current?.select();
          }, 50);
        }}
        currentCustomer={customer}
      />

      {/* QUICK COLLECT DUE MODAL */}
      <QuickCollectDueModal
        open={collectDueOpen}
        onClose={() => setCollectDueOpen(false)}
        customer={customer || null}
        outstandingDue={customerDue}
        onSuccess={() => {
          setCollectDueOpen(false);
        }}
      />

      {/* QUICK ADD CUSTOMER MODAL (F8 / + New Customer) */}
      <QuickAddCustomerModal
        open={quickCustModalOpen}
        onClose={() => setQuickCustModalOpen(false)}
        onSelectCustomer={(c) => {
          setCustomerId(c.id);
          queryInputRef.current?.focus();
        }}
        initialName={quickCustPrefill.name}
        initialPhone={quickCustPrefill.phone}
      />

      {/* POST-SALE SUCCESS DIALOG (Print, WhatsApp, New Sale) */}
      <PosSuccessModal
        open={successModalOpen}
        onClose={() => {
          setSuccessModalOpen(false);
          clearBill();
          if (!isFastBillMode) {
            setSaleStep("customer");
          }
        }}
        sale={lastCompletedSale}
        customer={db.customers.find((c) => c.id === lastCompletedSale?.customerId)}
        onPrint={() => {
          if (lastCompletedSale) {
            setInvoice(lastCompletedSale);
            setSuccessModalOpen(false);
            setTimeout(() => window.print(), 300);
          }
        }}
        onNewSale={() => {
          setSuccessModalOpen(false);
          clearBill();
          if (isFastBillMode) {
            setCustomerId("c0");
            setSaleStep("billing");
            queryInputRef.current?.focus();
          } else {
            setSaleStep("customer");
          }
        }}
        onViewInvoice={() => {
          if (lastCompletedSale) {
            setInvoice(lastCompletedSale);
            setSuccessModalOpen(false);
          }
        }}
      />

      {/* INVOICE MODAL FOR DETAILED PRINT / PREVIEW */}
      {invoice && (
        <InvoiceModal
          open={Boolean(invoice)}
          onClose={() => setInvoice(null)}
          {...saleToInvoiceProps(invoice, db)}
        />
      )}

      {/* BARCODE / IMEI CONTINUOUS SCANNER */}
      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScanDetected}
      />

      {/* ADMIN PIN MODAL */}
      <AdminPinModal
        open={pinModalOpen}
        onClose={() => {
          setPinModalOpen(false);
          setPendingAction(null);
        }}
        action={pinAction}
        reasonPrompt={pinReasonPrompt}
        onAuthorized={() => {
          if (pendingAction) {
            pendingAction();
            setPendingAction(null);
          }
        }}
      />

      {/* PRICE ADJUST MODAL */}
      <PriceAdjustModal
        open={adjustPriceItemIndex !== null}
        onClose={() => setAdjustPriceItemIndex(null)}
        item={adjustPriceItemIndex !== null ? items[adjustPriceItemIndex] || null : null}
        product={
          adjustPriceItemIndex !== null && items[adjustPriceItemIndex]
            ? db.products.find((p) => p.id === items[adjustPriceItemIndex]?.productId)
            : undefined
        }
        onSave={(newPrice) => {
          if (adjustPriceItemIndex !== null) {
            requestPriceOverride(adjustPriceItemIndex, newPrice);
          }
        }}
      />

      {/* DIRECT BILL / MANUAL ITEM MODAL */}
      <DirectManualBillModal
        open={directBillModalOpen}
        onClose={() => setDirectBillModalOpen(false)}
        invoiceType={invoiceType}
        initialItemName={directBillPrefill.name}
        initialPrice={directBillPrefill.price}
        initialGst={directBillPrefill.gst}
        onAddManualItem={(item) => {
          setItems((c) => [...c, item]);
        }}
      />

      {/* CUSTOM AMOUNT / EXTRA CHARGE MODAL */}
      <CustomAmountModal
        open={customAmountModalOpen}
        onClose={() => setCustomAmountModalOpen(false)}
        invoiceType={invoiceType}
        onAdd={({ name, amount, gst }) => {
          setItems((c) => [
            ...c,
            {
              productId: `custom_${Date.now()}`,
              name,
              qty: 1,
              price: amount,
              gst,
              costPrice: 0,
              warrantyMonths: 0,
            },
          ]);
        }}
      />

      {/* POS EMI FINANCING MODAL */}
      {emiCalculatorOpen && (
        <Modal
          open={emiCalculatorOpen}
          title="POS EMI Financing Calculator"
          onClose={() => setEmiCalculatorOpen(false)}
          wide
        >
          <EMICalculator
            initialPrice={gross}
            initialDiscount={discount}
            initialDownPayment={emiDownPayment || 0}
            initialProduct={items[0]?.name || "Mobile Phone"}
            initialImei={items[0]?.imei || ""}
            initialCustomer={{
              id: customerId,
              name: customer?.id === "c0" ? "" : (customer?.name || ""),
              phone:
                customer?.phone && customer.phone !== "—"
                  ? customer.phone
                  : (customer?.mobile || ""),
            }}
            isPosMode={true}
            onConfirmEmiSale={(data) => {
              setSelectedEmiCompany(data.companyId);
              setEmiDownPayment(data.downPayment);
              setEmiInterestRate(data.interestRate);
              setEmiInterestType(data.interestType);
              setEmiTenureMonths(data.tenureMonths);
              setEmiProcessingFee(data.processingFee);
              setEmiOtherCharges(data.otherCharges);
              setEmiMonthly(data.monthlyEmi);
              setEmiTotalInterest(data.totalInterest);
              setEmiTotalPayable(data.totalPayable);
              if (data.firstEmiDate) setEmiExpectedDate(data.firstEmiDate);
              setEmiCalculatorOpen(false);
            }}
            onClose={() => setEmiCalculatorOpen(false)}
          />
        </Modal>
      )}
      {/* RECENT BILLS / VIEW BILL MODAL */}
      {recentBillsModalOpen && (
        <Modal
          open={recentBillsModalOpen}
          title="Recent Bills & Invoices — View / Print"
          onClose={() => setRecentBillsModalOpen(false)}
          wide
        >
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[240px]">
                <Input
                  placeholder="Search by Invoice #, Customer name, Mobile or IMEI..."
                  value={billSearchQuery}
                  onChange={(e) => setBillSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="text-xs text-muted-foreground">
                Showing <span className="font-bold text-foreground">{filteredBills.length}</span> bills
              </div>
            </div>

            {filteredBills.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No matching sales bills found.
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto rounded-xl border border-border/70 divide-y divide-border/60">
                {filteredBills.map((s) => {
                  const cust = db.customers.find((c) => c.id === s.customerId);
                  const isPaid = s.paid >= s.total - 0.01;
                  const isPartial = s.paid > 0 && !isPaid;
                  return (
                    <div
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-primary text-[13px]">{s.invoiceNo}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {new Date(s.date).toLocaleDateString("en-IN", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          <Badge
                            tone={isPaid ? "success" : isPartial ? "warning" : "danger"}
                            className="text-[10px]"
                          >
                            {isPaid ? "Paid" : isPartial ? "Partial" : "Due"}
                          </Badge>
                          {s.invoiceType && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {s.invoiceType}
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-semibold text-foreground mt-0.5">
                          👤 {cust?.name || "Walk-in Customer"}
                          {(cust?.phone || cust?.mobile) && cust.phone !== "—" && (
                            <span className="ml-2 font-mono text-muted-foreground font-normal">
                              ({cust.phone || cust.mobile})
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate max-w-lg mt-0.5">
                          {(s.items || []).map((it) => `${it.name} (x${it.qty})`).join(", ")}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-mono font-black text-[14px] text-foreground">{inr(s.total)}</div>
                          <div className="text-[10.5px] text-muted-foreground">
                            Paid: {inr(s.paid)} {s.total > s.paid && `· Due: ${inr(s.total - s.paid)}`}
                          </div>
                        </div>

                        <Button
                          size="sm"
                          onClick={() => {
                            setInvoice(s);
                            setRecentBillsModalOpen(false);
                          }}
                          className="gap-1.5 h-8 text-xs font-bold bg-primary text-primary-foreground shadow-xs"
                        >
                          <Eye className="size-3.5" /> View / Print Bill
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
