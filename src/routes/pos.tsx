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
import { Calculator, Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/pos")({
  head: () => ({
    meta: [
      { title: "POS Billing — Mobile Store ERP" },
      {
        name: "description",
        content:
          "Fast counter billing: search by name, model or IMEI, split payments, GST, discounts and instant invoice printing.",
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
  const [newCust, setNewCust] = useState(false);
  const [custForm, setCustForm] = useState({ name: "", phone: "", address: "" });
  const [invoice, setInvoice] = useState<Sale | null>(null);
  const [invoiceType, setInvoiceType] = useState<"GST" | "NON_GST">("GST");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("template_modern");

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

  // New features: Shortcuts, Barcode Scanner & Admin PIN Modals
  const [scannerOpen, setScannerOpen] = useState(false);
  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinAction, setPinAction] = useState("");
  const [pinReasonPrompt, setPinReasonPrompt] = useState("Reason for privileged action *");
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [discountAuthorized, setDiscountAuthorized] = useState(false);
  const [scanStatus, setScanStatus] = useState<string | null>(null);

  const queryInputRef = useRef<HTMLInputElement>(null);
  const discountInputRef = useRef<HTMLInputElement>(null);
  const customerSelectRef = useRef<HTMLSelectElement>(null);
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

    return [{
      mode,
      amount: total,
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
            return;
          } else if (data.product) {
            addProduct(data.product.id);
            setScanStatus(`Added: ${data.product.name}`);
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
        setInvoice(sale);
        clearBill();
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
    setInvoice(sale);
    clearBill();
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

  const saveCustomer = () => {
    if (!custForm.name.trim()) return;
    const c = addCustomer({
      name: custForm.name.trim(),
      phone: custForm.phone.trim(),
      address: custForm.address.trim(),
    });
    setCustomerId(c.id);
    setCustForm({ name: "", phone: "", address: "" });
    setNewCust(false);
  };

  // Keyboard Shortcuts (F1 - F7, ESC, USB Barcode scanner)
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
        } else if (newCust) {
          setNewCust(false);
          e.preventDefault();
        } else if (invoice) {
          setInvoice(null);
          e.preventDefault();
        }
        return;
      }

      // POS function key shortcuts
      if (e.key === "F1") {
        e.preventDefault();
        if (items.length > 0) {
          if (window.confirm("Start a new sale? Current bill will be cleared.")) {
            clearBill();
          }
        } else {
          clearBill();
        }
      } else if (e.key === "F2") {
        e.preventDefault();
        setNewCust(true);
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
        if (invoice) {
          window.print();
        } else if (items.length > 0) {
          complete(false);
          setTimeout(() => window.print(), 350);
        }
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
      } else if (e.key.length === 1) {
        scanBufferRef.current += e.key;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items, invoice, scannerOpen, newCust, pinModalOpen, discount, customerId, discountAuthorized]);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* POS Top Shortcuts & Scanner Bar */}
      <div className="lg:col-span-5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border glass-strong px-4 py-2 text-[12px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-bold text-primary mr-1">⚡ Hotkeys:</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F1 New</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F2 Customer</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F3 Search</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F4 Hold</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F5 Pay</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F6 Discount</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-foreground">F7 Print</span>
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-[10.5px] font-semibold text-muted-foreground">Esc Close</span>
        </div>
        <div className="flex items-center gap-2">
          {scanStatus && (
            <span className="text-[11px] font-medium text-primary animate-pulse">{scanStatus}</span>
          )}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setScannerOpen(true)}
            className="h-7 text-[11.5px] gap-1.5 font-semibold"
          >
            <span>📷</span> Scan Barcode / IMEI
          </Button>
        </div>
      </div>

      {/* catalogue */}
      <Card className="lg:col-span-3">
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <Input
              ref={queryInputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, model, brand or IMEI (F3)…"
              className="flex-1"
            />
            <Button
              variant="secondary"
              onClick={() => setScannerOpen(true)}
              className="hidden sm:inline-flex"
            >
              Scan
            </Button>
            <Button variant="ghost" onClick={() => setQuery("")}>
              Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["All", ...CATEGORIES].map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[11.5px] font-medium",

                  category === c
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-foreground/5",
                )}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {results.map((p) => {
              const stock = stockOf(db, p.id);
              return (
                <button
                  key={p.id}
                  disabled={stock <= 0}
                  onClick={() => addProduct(p.id)}
                  className="glass-strong rounded-xl border border-border p-3 text-left transition-colors hover:border-primary/40 disabled:opacity-45"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[13px] font-semibold tracking-tight">{p.name}</span>
                    <Badge tone={stock <= 0 ? "danger" : stock <= p.reorderLevel ? "warning" : "success"}>
                      {stock <= 0 ? "Out" : `${stock} in stock`}
                    </Badge>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground">
                    {[p.variant, p.color, p.category].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-2.5 flex items-end justify-between">
                    <span className="num text-[15px] font-semibold">{inr(p.sellingPrice)}</span>
                    <span className="num text-[10px] text-muted-foreground">GST {p.gst}%</span>
                  </div>
                </button>
              );
            })}
            {results.length === 0 ? (
              <div className="sm:col-span-2">
                <Empty text="No product matches that search." />
              </div>
            ) : null}
          </div>
        </div>
      </Card>

      {/* cart */}
      <Card className="lg:col-span-2">
        <CardHead
          title="Current Bill"
          sub={`${items.length} line${items.length === 1 ? "" : "s"}`}
          right={
            <div className="flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={hold}>
                Hold
              </Button>
              <Button size="sm" variant="ghost" onClick={clearBill}>
                Clear
              </Button>
            </div>
          }
        />
        <div className="space-y-3 p-4">
          {/* GST / NON-GST BILLING MODE SELECTOR */}
          <div className="flex items-center justify-between rounded-xl bg-muted/40 p-1.5 border border-border/60">
            <span className="text-[11px] font-bold tracking-wider text-muted-foreground uppercase px-1">
              SALE MODE:
            </span>
            <div className="inline-flex rounded-lg p-0.5 bg-background border border-border/50">
              <button
                type="button"
                onClick={() => setInvoiceType("GST")}
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
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
                className={`px-3 py-1 rounded-md text-[11px] font-bold transition-all ${
                  invoiceType === "NON_GST"
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                NON-GST
              </button>
            </div>

            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                TEMPLATE:
              </span>
              <select
                value={selectedTemplateId}
                onChange={(e) => setSelectedTemplateId(e.target.value)}
                className="h-7 rounded-md border border-border/80 bg-background px-2 text-[11px] font-semibold"
              >
                <option value="template_modern">Modern</option>
                <option value="template_classic">Classic</option>
                <option value="template_compact">Compact</option>
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <Select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="flex-1"
            >
              {db.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.phone !== "—" ? `· ${c.phone}` : ""}
                </option>
              ))}
            </Select>
            <Button variant="ghost" onClick={() => setNewCust(true)}>
              + New
            </Button>
          </div>

          {held.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {held.map((h, n) => (
                <button
                  key={h.id}
                  onClick={() => resume(h)}
                  className="rounded-md bg-warning/12 px-2 py-1 text-[11px] font-semibold text-warning"
                >
                  Resume held #{n + 1} ({h.items.length})
                </button>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            {items.length === 0 ? <Empty text="Tap a product to start billing." /> : null}
            {items.map((i, idx) => {
              const product = db.products.find((p) => p.id === i.productId);
              const options = db.units.filter(
                (u) => u.productId === i.productId && (u.status === "available" || u.id === i.unitId),
              );
              return (
                <div key={idx} className="glass-strong rounded-lg border border-border p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium">{i.name}</div>
                      {product?.tracked ? (
                        <Select
                          value={i.unitId ?? ""}
                          onChange={(e) => {
                            const u = db.units.find((x) => x.id === e.target.value);
                            patchItem(idx, { unitId: u?.id, imei: u?.imei1 });
                          }}
                          className="mt-1 h-7 text-[11px]"
                        >
                          {options.map((u) => (
                            <option key={u.id} value={u.id}>
                              IMEI {u.imei1}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <div className="num mt-1 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                          <button
                            className="rounded bg-muted px-1.5"
                            onClick={() => patchItem(idx, { qty: Math.max(1, i.qty - 1) })}
                          >
                            −
                          </button>
                          Qty {i.qty}
                          <button
                            className="rounded bg-muted px-1.5"
                            onClick={() => patchItem(idx, { qty: i.qty + 1 })}
                          >
                            +
                          </button>
                        </div>
                      )}
                      {i.warrantyMonths ? (
                        <div className="mt-1 text-[10px] text-muted-foreground">
                          Warranty {i.warrantyMonths} months
                        </div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="num text-[12.5px] font-semibold">{inr(i.price * i.qty)}</div>
                      <div className="flex items-center gap-1 mt-1 justify-end">
                        <span className="text-[10px] text-muted-foreground">Rate:</span>
                        <input
                          type="number"
                          value={i.price}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            requestPriceOverride(idx, val);
                          }}
                          className="h-6 w-20 rounded border border-border bg-background px-1.5 text-right font-mono text-[11px] font-semibold"
                        />
                      </div>
                      {i.price < i.costPrice && (
                        <div className="mt-0.5">
                          <Badge tone="danger" className="text-[9px] py-0 px-1">Below Cost</Badge>
                        </div>
                      )}
                      <button
                        onClick={() => removeItem(idx)}
                        className="mt-1 text-[10.5px] text-destructive"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Discount (₹) — F6">
              <Input
                ref={discountInputRef}
                type="number"
                value={discount || ""}
                onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                placeholder="0"
              />
            </Field>
            <Field label="Payment mode">
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
              >
                {PAYMENT_MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </Select>
            </Field>
          </div>

          {/* Account Selector for Single Payment Mode */}
          {!splitOpen && mode === "Cash" && (
            <Field label="Cash Drawer / Account">
              <Select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
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
              <Field label="Select UPI Account *">
                <Select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  {upiAccounts.length === 0 ? (
                    <option value="">No UPI accounts configured</option>
                  ) : (
                    upiAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} {a.upiId ? `(${a.upiId})` : ""} · Bal: {inr(a.currentBalance || 0)}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
              <Field label="UPI Reference / Txn ID">
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. UPI/123456789"
                />
              </Field>
            </div>
          )}

          {!splitOpen && mode === "Bank" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Select Bank Account *">
                <Select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  {bankAccounts.length === 0 ? (
                    <option value="">No bank accounts configured</option>
                  ) : (
                    bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} {a.accountNumber ? `(A/C: ${a.accountNumber.slice(-4)})` : ""} · Bal: {inr(a.currentBalance || 0)}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
              <Field label="Cheque / NEFT / UTR Ref">
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. UTR12345678"
                />
              </Field>
            </div>
          )}

          {!splitOpen && mode === "Card" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Card Machine / Settlement A/C *">
                <Select
                  value={selectedAccountId}
                  onChange={(e) => setSelectedAccountId(e.target.value)}
                >
                  {cardAccounts.length === 0 ? (
                    <option value="">No card accounts configured</option>
                  ) : (
                    cardAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} · Bal: {inr(a.currentBalance || 0)}
                      </option>
                    ))
                  )}
                </Select>
              </Field>
              <Field label="Card Auth / Slip Ref">
                <Input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="e.g. AUTH/98214"
                />
              </Field>
            </div>
          )}

          {!splitOpen && mode === "Credit" && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[11px] text-amber-800">
              ℹ️ Sale will be charged to customer due ledger. No payment account will be credited immediately.
            </div>
          )}

          {mode === "EMI" && !splitOpen ? (
            <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-3.5 space-y-3 text-[12px]">
              <div className="flex items-center justify-between font-bold text-primary">
                <span className="flex items-center gap-1.5">💳 EMI / Consumer Finance</span>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => setEmiCalculatorOpen(true)}
                  className="h-7 text-[11px] gap-1 font-bold bg-primary/15 text-primary border-primary/30 hover:bg-primary/25"
                >
                  <Calculator className="size-3.5" />
                  Open EMI Calculator
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Finance Partner *">
                  <Select
                    value={selectedEmiCompany}
                    onChange={(e) => setSelectedEmiCompany(e.target.value)}
                  >
                    {emiCompanies.length === 0 ? (
                      <option value="">No finance partners</option>
                    ) : (
                      emiCompanies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.companyName}
                        </option>
                      ))
                    )}
                  </Select>
                </Field>

                <Field label="Customer Down Payment (₹)">
                  <Input
                    type="number"
                    min="0"
                    max={total}
                    value={emiDownPayment || ""}
                    onChange={(e) => setEmiDownPayment(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <Field label="Down Payment Mode">
                  <Select
                    value={emiDownPaymentMode}
                    onChange={(e) => setEmiDownPaymentMode(e.target.value as any)}
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Card">Debit/Credit Card</option>
                  </Select>
                </Field>

                <Field label="Down Payment Account *">
                  <Select
                    value={emiDownPaymentAccountId}
                    onChange={(e) => setEmiDownPaymentAccountId(e.target.value)}
                  >
                    {(emiDownPaymentMode === "Cash"
                      ? cashAccounts
                      : emiDownPaymentMode === "UPI"
                      ? upiAccounts
                      : cardAccounts
                    ).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.accountName} · Bal: {inr(a.currentBalance || 0)}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="Down Payment Ref">
                  <Input
                    value={emiDownPaymentRef}
                    onChange={(e) => setEmiDownPaymentRef(e.target.value)}
                    placeholder="e.g. Txn / Slip #"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Field label="Finance / Loan Ref #">
                  <Input
                    value={emiReference}
                    onChange={(e) => setEmiReference(e.target.value)}
                    placeholder="e.g. BAJ-49821"
                  />
                </Field>

                <Field label="Expected Settlement Date">
                  <Input
                    type="date"
                    value={emiExpectedDate}
                    onChange={(e) => setEmiExpectedDate(e.target.value)}
                  />
                </Field>
              </div>

              {/* EMI Receivable Summary Card */}
              <div className="rounded-lg border border-primary/20 bg-white/90 p-2.5 space-y-1.5 shadow-sm text-[11.5px]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-primary">EMI Receivable Summary</div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Total Sale Amount:</span>
                  <span className="font-semibold text-foreground num">{inr(total)}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Customer Paid (Down Payment):</span>
                  <span className="font-semibold text-emerald-600 num">{inr(Math.min(total, emiDownPayment))}</span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Finance Company Receivable:</span>
                  <span className="font-bold text-primary num">{inr(Math.max(0, total - emiDownPayment))}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/80 pt-1 font-bold text-foreground">
                  <span>Remaining Financed Amount:</span>
                  <span className="num text-primary font-extrabold">{inr(Math.max(0, total - emiDownPayment))}</span>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex items-center justify-between">
            <button
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
              className="text-[11.5px] font-bold text-primary hover:underline flex items-center gap-1"
            >
              {splitOpen ? "← Back to single payment" : "🔀 Mixed / Split Payment"}
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

          {splitOpen ? (
            <div className="space-y-2 rounded-xl border border-primary/30 bg-muted/30 p-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Split Payments (Total must equal {inr(total)})
              </div>

              <div className="space-y-2">
                {mixedRows.map((r, rIdx) => {
                  const availableAccounts =
                    r.mode === "Cash"
                      ? cashAccounts
                      : r.mode === "UPI"
                      ? upiAccounts
                      : r.mode === "Bank"
                      ? bankAccounts
                      : r.mode === "Card"
                      ? cardAccounts
                      : [];

                  return (
                    <div
                      key={r.id}
                      className="grid grid-cols-12 gap-1.5 items-center bg-background p-2 rounded-lg border border-border text-[11px]"
                    >
                      <div className="col-span-3">
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
                          className="h-7 w-full rounded border border-border bg-background px-1.5 text-[11px] font-medium"
                        >
                          {PAYMENT_MODES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="col-span-4">
                        {r.mode === "Credit" ? (
                          <div className="text-[10px] text-muted-foreground italic px-1">
                            Customer Credit Ledger
                          </div>
                        ) : (
                          <select
                            value={r.paymentAccountId}
                            onChange={(e) => {
                              const accId = e.target.value;
                              setMixedRows((rows) =>
                                rows.map((row) =>
                                  row.id === r.id ? { ...row, paymentAccountId: accId } : row,
                                ),
                              );
                            }}
                            className="h-7 w-full rounded border border-border bg-background px-1.5 text-[11px]"
                          >
                            <option value="">Default Account</option>
                            {availableAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.accountName} ({inr(a.currentBalance || 0)})
                              </option>
                            ))}
                          </select>
                        )}
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          value={r.referenceNumber}
                          onChange={(e) => {
                            const val = e.target.value;
                            setMixedRows((rows) =>
                              rows.map((row) =>
                                row.id === r.id ? { ...row, referenceNumber: val } : row,
                              ),
                            );
                          }}
                          placeholder="Ref / Txn"
                          className="h-7 w-full rounded border border-border bg-background px-1.5 text-[10.5px]"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="number"
                          value={r.amount || ""}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 0;
                            setMixedRows((rows) =>
                              rows.map((row) =>
                                row.id === r.id ? { ...row, amount: val } : row,
                              ),
                            );
                          }}
                          placeholder="0"
                          className="h-7 w-full rounded border border-border bg-background px-1.5 text-right font-mono font-bold text-[11px]"
                        />
                      </div>

                      <div className="col-span-1 text-center">
                        {mixedRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMixedRows((rows) => rows.filter((row) => row.id !== r.id));
                            }}
                            className="text-destructive hover:opacity-80"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Sum & Difference Validation Display */}
              {(() => {
                const sumSplits = mixedRows.reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
                const diff = total - sumSplits;
                const isMatched = Math.abs(diff) < 0.01;

                return (
                  <div
                    className={`rounded-lg p-2 text-[11px] font-semibold flex items-center justify-between border ${
                      isMatched
                        ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700"
                        : "bg-destructive/10 border-destructive/30 text-destructive"
                    }`}
                  >
                    <span>
                      Allocated: {inr(sumSplits)} / {inr(total)}
                    </span>
                    <span>
                      {isMatched
                        ? "✓ Payments match total"
                        : `⚠️ Difference: ${diff > 0 ? `Unallocated ${inr(diff)}` : `Over-allocated ${inr(Math.abs(diff))}`}`}
                    </span>
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div className="glass-strong space-y-1.5 rounded-lg border border-border p-3 text-[12px]">
            <div className="flex justify-between text-muted-foreground">
              <span>Taxable value</span>
              <span className="num">{inr2(gross - tax)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>GST</span>
              <span className="num">{inr2(tax)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span className="num text-destructive">−{inr(discount)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-2 text-[15px] font-bold">
              <span>Total</span>
              <span className="num">{inr(total)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              size="lg"
              className="col-span-2 font-semibold"
              disabled={splitOpen && Math.abs(total - mixedRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)) > 0.01}
              onClick={() => complete(false)}
            >
              Charge {inr(total)} (F5)
            </Button>
            <Button size="lg" variant="ghost" onClick={() => complete(true)}>
              Quotation
            </Button>
          </div>
        </div>
      </Card>

      <Modal open={newCust} onClose={() => setNewCust(false)} title="Quick customer (F2)">
        <div className="space-y-3">
          <Field label="Name">
            <Input
              value={custForm.name}
              onChange={(e) => setCustForm({ ...custForm, name: e.target.value })}
            />
          </Field>
          <Field label="Mobile number">
            <Input
              value={custForm.phone}
              onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })}
            />
          </Field>
          <Field label="Address">
            <Input
              value={custForm.address}
              onChange={(e) => setCustForm({ ...custForm, address: e.target.value })}
            />
          </Field>
          <Button onClick={saveCustomer}>Save & select</Button>
        </div>
      </Modal>
      {invoice && (
        <InvoiceModal
          open={Boolean(invoice)}
          onClose={() => setInvoice(null)}
          {...saleToInvoiceProps(invoice, db)}
        />
      )}

      <BarcodeScannerModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onDetected={handleScanDetected}
      />

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
      {/* POS EMI Calculator Modal */}
      {emiCalculatorOpen ? (
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
      ) : null}
    </div>
  );
}

