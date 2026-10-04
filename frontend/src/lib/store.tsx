import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { seedDB } from "./seed";
import { todayISO, uid } from "./format";
import type {
  Customer,
  DB,
  Expense,
  LineItem,
  PaymentEntry,
  Product,
  Purchase,
  Repair,
  RepairStatus,
  ReturnDoc,
  Sale,
  Settings,
  Supplier,
  Unit,
} from "./types";
import {
  auditApi,
  customersApi,
  dealersApi,
  imeiApi,
  productsApi,
  purchasesApi,
  repairsApi,
  returnsApi,
  salesApi,
  settingsApi,
} from "../services/api";

const STORAGE_KEY = "retail-erp-mobile-v1";

interface StoreValue {
  db: DB;
  ready: boolean;
  refreshFromBackend: () => Promise<void>;
  // creators
  addCustomer: (c: Omit<Customer, "id" | "createdAt">) => Customer;
  updateCustomer: (id: string, patch: Partial<Customer>) => void;
  addSupplier: (s: Omit<Supplier, "id">) => Supplier;
  addProduct: (p: Omit<Product, "id">) => Product;
  updateProduct: (id: string, patch: Partial<Product>) => void;
  deleteProduct: (id: string, force?: boolean) => Promise<void>;
  addUnits: (productId: string, rows: Array<Omit<Unit, "id" | "productId" | "status">>) => void;
  setUnitStatus: (unitId: string, status: Unit["status"]) => void;
  recordSale: (input: {
    customerId: string;
    invoiceType?: "GST" | "NON_GST";
    items: LineItem[];
    discount: number;
    payments: { mode: Sale["payments"][number]["mode"]; amount: number }[];
    quotation?: boolean;
    note?: string;
    isEmi?: boolean;
    emiCompanyId?: string;
    emiDownPayment?: number;
    emiFinancedAmount?: number;
    financeReferenceNumber?: string;
    expectedPaymentDate?: string;
    interestRate?: number;
    interestType?: InterestType;
    tenureMonths?: number;
    firstEmiDate?: string;
  }) => Sale;
  recordPurchase: (input: {
    purchaseType?: "GST" | "NON_GST";
    supplierId?: string;
    dealerId?: string;
    invoiceNo?: string;
    date?: string;
    items: LineItem[];
    imeis?: Record<string, string[]>;
    discount?: number;
    paid?: number;
    mode?: Purchase["mode"];
    originalInvoiceNo?: string;
    originalInvoiceDate?: string;
    referenceNo?: string;
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
    receivedBy?: string;
    debitNoteRef?: string;
    creditNoteRef?: string;
    otherReferences?: string;
    otherCharges?: number;
    tdsApplicable?: boolean;
    tdsSection?: string;
    tdsRate?: number;
    tdsAmount?: number;
    roundOff?: number;
    paymentAccountId?: string;
    purchaseMode?: string;
    allowDuplicate?: boolean;
    attachments?: Array<{ fileName: string; fileType: string; fileSize?: number; fileData: string }>;
  }) => Promise<Purchase>;
  recordSaleReturn: (input: {
    saleId: string;
    items: LineItem[];
    reason: string;
    mode: ReturnDoc["mode"];
  }) => void;
  recordPurchaseReturn: (input: {
    purchaseId: string;
    items: LineItem[];
    reason: string;
  }) => void;
  addRepair: (r: Omit<Repair, "id" | "jobId" | "createdAt" | "status">) => Repair;
  setRepairStatus: (id: string, status: RepairStatus) => void;
  addExpense: (e: Omit<Expense, "id">) => void;
  addPayment: (p: Omit<PaymentEntry, "id">) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  resetDemo: () => void;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB>(() => seedDB());
  const [ready, setReady] = useState(false);

  // Fetch authoritative DB from backend API
  const refreshFromBackend = useCallback(async () => {
    try {
      const data = await settingsApi.getDB();
      if (data) {
        setDb(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        return;
      }
    } catch {
      // Offline fallback
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setDb(JSON.parse(raw) as DB);
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  useEffect(() => {
    refreshFromBackend().finally(() => {
      setReady(true);
    });
  }, [refreshFromBackend]);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* quota */
    }
  }, [db, ready]);

  const nextNo = useCallback((prefix: string, existing: string[]) => {
    const nums = existing
      .map((v) => Number(v.replace(/\D/g, "")))
      .filter((n) => !Number.isNaN(n));
    const next = (nums.length ? Math.max(...nums) : 2040) + 1;
    return `${prefix}${next}`;
  }, []);

  const addCustomer: StoreValue["addCustomer"] = useCallback((c) => {
    const created: Customer = { ...c, id: uid("c"), createdAt: todayISO() };
    setDb((d) => ({ ...d, customers: [created, ...d.customers] }));

    customersApi
      .addCustomer(c)
      .then((saved) => {
        if (saved) {
          setDb((d) => ({
            ...d,
            customers: d.customers.map((item) => (item.id === created.id ? saved : item)),
          }));
        }
      })
      .catch(() => {});

    return created;
  }, []);

  const updateCustomer: StoreValue["updateCustomer"] = useCallback((id, patch) => {
    setDb((d) => ({
      ...d,
      customers: d.customers.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));

    customersApi.updateCustomer(id, patch).catch(() => {});
  }, []);

  const addSupplier: StoreValue["addSupplier"] = useCallback((s) => {
    const created: Supplier = { ...s, id: (s as any).id || uid("sup") };
    setDb((d) => ({ ...d, suppliers: [...d.suppliers, created] }));

    dealersApi
      .addDealer(created as any)
      .then((saved) => {
        if (saved) {
          setDb((d) => ({
            ...d,
            suppliers: d.suppliers.map((item) => (item.id === created.id ? saved : item)),
          }));
        }
      })
      .catch((err) => console.error("Error adding supplier to backend:", err));

    return created;
  }, []);

  const addProduct: StoreValue["addProduct"] = useCallback((p) => {
    const created: Product = { ...p, id: (p as any).id || uid("p") };
    setDb((d) => ({ ...d, products: [...d.products, created] }));

    productsApi
      .addProduct(created as any)
      .then((saved) => {
        if (saved) {
          setDb((d) => ({
            ...d,
            products: d.products.map((item) => (item.id === created.id ? saved : item)),
          }));
        }
      })
      .catch((err) => console.error("Error adding product to backend:", err));

    return created;
  }, []);

  const updateProduct: StoreValue["updateProduct"] = useCallback((id, patch) => {
    setDb((d) => ({
      ...d,
      products: d.products.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));

    productsApi.updateProduct(id, patch).catch(() => {});
  }, []);

  const deleteProduct: StoreValue["deleteProduct"] = useCallback(async (id, force = false) => {
    await productsApi.deleteProduct(id, force);
    setDb((d) => ({
      ...d,
      products: d.products.filter((p) => p.id !== id),
      units: d.units.filter((u) => u.productId !== id),
    }));
  }, []);

  const addUnits: StoreValue["addUnits"] = useCallback((productId, rows) => {
    const newUnits: Unit[] = rows.map((r) => ({
      ...r,
      id: uid("u"),
      productId,
      status: "available" as const,
    }));
    setDb((d) => ({
      ...d,
      units: [...d.units, ...newUnits],
    }));

    productsApi.addUnits(productId, rows).catch(() => {});
  }, []);

  const setUnitStatus: StoreValue["setUnitStatus"] = useCallback((unitId, status) => {
    setDb((d) => ({
      ...d,
      units: d.units.map((u) => (u.id === unitId ? { ...u, status } : u)),
    }));

    imeiApi.setUnitStatus(unitId, status).catch(() => {});
  }, []);

  const recordSale: StoreValue["recordSale"] = useCallback(
    ({ customerId, invoiceType, items, discount, payments, quotation, note, isEmi, emiCompanyId, emiDownPayment, emiFinancedAmount, financeReferenceNumber, expectedPaymentDate, interestRate, interestType, tenureMonths, firstEmiDate }) => {
      const invType = invoiceType || "GST";
      const gross = items.reduce((s, i) => s + i.price * i.qty, 0);
      const total = Math.max(0, gross - discount);
      const tax = invType === "NON_GST" ? 0 : items.reduce((s, i) => s + (i.price * i.qty * i.gst) / (100 + i.gst), 0);
      const paid = payments
        .filter((p) => p.mode !== "Credit" && p.mode !== "EMI")
        .reduce((s, p) => s + p.amount, 0);

      const sale: Sale = {
        id: uid("s"),
        invoiceNo: "",
        invoiceType: invType,
        date: todayISO(),
        customerId,
        items,
        discount,
        subtotal: Math.round(total - tax),
        tax: Math.round(tax),
        total,
        paid,
        payments,
        ...(quotation !== undefined ? { quotation } : {}),
        ...(note !== undefined ? { note } : {}),
        ...(isEmi !== undefined ? { isEmi } : {}),
        ...(emiCompanyId !== undefined ? { emiCompanyId } : {}),
        ...(emiDownPayment !== undefined ? { emiDownPayment } : {}),
        ...(emiFinancedAmount !== undefined ? { emiFinancedAmount } : {}),
        ...(financeReferenceNumber !== undefined ? { financeReferenceNumber } : {}),
        ...(expectedPaymentDate !== undefined ? { expectedPaymentDate } : {}),
      };

      setDb((d) => {
        sale.invoiceNo = nextNo(d.settings.invoicePrefix, d.sales.map((s) => s.invoiceNo));
        const units = d.units.map((u) =>
          items.some((i) => i.unitId === u.id) && !quotation
            ? { ...u, status: "sold" as const, saleId: sale.id, customerId }
            : u,
        );
        const products = quotation
          ? d.products
          : d.products.map((p) => {
              const item = items.find((i) => i.productId === p.id);
              return item && !p.tracked ? { ...p, qty: Math.max(0, p.qty - item.qty) } : p;
            });
        const newPayments: PaymentEntry[] = quotation
          ? []
          : payments
              .filter((p) => p.mode !== "Credit" && p.mode !== "EMI" && p.amount > 0)
              .map((p) => ({
                id: uid("pay"),
                date: sale.date,
                party: "customer" as const,
                partyId: customerId,
                refId: sale.id,
                amount: p.amount,
                mode: p.mode,
                note: `Invoice ${sale.invoiceNo}`,
              }));
        return quotation
          ? { ...d, quotations: [sale, ...(d.quotations || [])] }
          : {
              ...d,
              sales: [sale, ...d.sales],
              units,
              products,
              payments: [...d.payments, ...newPayments],
            };
      });

      // Synchronize with backend API
      salesApi
        .createSale({
          customerId,
          invoiceType: invType,
          items,
          discount,
          payments,
          quotation,
          note,
          customInvoiceNo: sale.invoiceNo,
          isEmi,
          emiCompanyId,
          emiDownPayment,
          emiFinancedAmount,
          financeReferenceNumber,
          expectedPaymentDate,
          interestRate,
          interestType,
          tenureMonths,
          firstEmiDate,
        })
        .then((savedSale) => {
          if (savedSale) {
            setDb((d) => ({
              ...d,
              sales: d.sales.map((s) => (s.id === sale.id ? savedSale : s)),
            }));
          }
        })
        .catch(() => {});

      return sale;
    },
    [nextNo],
  );

  const recordPurchase: StoreValue["recordPurchase"] = useCallback(
    async (input) => {
      const savedPurchase = await purchasesApi.recordPurchase(input);
      // Refresh DB state from backend to synchronize units, stock movements, and ledger
      await refreshFromBackend();
      return savedPurchase;
    },
    [refreshFromBackend],
  );

  const recordSaleReturn: StoreValue["recordSaleReturn"] = useCallback(
    ({ saleId, items, reason, mode }) => {
      setDb((d) => {
        const sale = d.sales.find((s) => s.id === saleId);
        if (!sale) return d;
        const amount = items.reduce((s, i) => s + i.price * i.qty, 0);
        const doc: ReturnDoc = {
          id: uid("ret"),
          type: "sale",
          refId: saleId,
          refNo: sale.invoiceNo,
          date: todayISO(),
          partyId: sale.customerId,
          items,
          amount,
          reason,
          mode,
        };
        const units = d.units.map((u) =>
          items.some((i) => i.unitId === u.id)
            ? { ...u, status: "returned" as const, saleId: undefined, customerId: undefined }
            : u,
        );
        const products = d.products.map((p) => {
          const line = items.filter((i) => i.productId === p.id && !i.unitId);
          if (!line.length || p.tracked) return p;
          return { ...p, qty: p.qty + line.reduce((s, i) => s + i.qty, 0) };
        });
        return { ...d, returns: [doc, ...d.returns], units, products };
      });

      returnsApi.recordSaleReturn({ saleId, items, reason, mode }).catch(() => {});
    },
    [],
  );

  const recordPurchaseReturn: StoreValue["recordPurchaseReturn"] = useCallback(
    ({ purchaseId, items, reason }) => {
      setDb((d) => {
        const pur = d.purchases.find((p) => p.id === purchaseId);
        if (!pur) return d;
        const amount = items.reduce((s, i) => s + i.price * i.qty, 0);
        const doc: ReturnDoc = {
          id: uid("ret"),
          type: "purchase",
          refId: purchaseId,
          refNo: pur.invoiceNo,
          date: todayISO(),
          partyId: pur.supplierId,
          items,
          amount,
          reason,
          mode: "Credit Note",
        };
        const units = d.units.map((u) =>
          items.some((i) => i.unitId === u.id) ? { ...u, status: "damaged" as const } : u,
        );
        const products = d.products.map((p) => {
          const line = items.filter((i) => i.productId === p.id && !i.unitId);
          if (!line.length || p.tracked) return p;
          return { ...p, qty: Math.max(0, p.qty - line.reduce((s, i) => s + i.qty, 0)) };
        });
        return { ...d, returns: [doc, ...d.returns], units, products };
      });

      returnsApi.recordPurchaseReturn({ purchaseId, items, reason }).catch(() => {});
    },
    [],
  );

  const addRepair: StoreValue["addRepair"] = useCallback(
    (r) => {
      const created: Repair = {
        ...r,
        id: uid("r"),
        jobId: "",
        status: "Received",
        createdAt: todayISO(),
      };
      setDb((d) => {
        created.jobId = nextNo("REP-", d.repairs.map((x) => x.jobId));
        return { ...d, repairs: [created, ...d.repairs] };
      });

      repairsApi
        .addRepair(r)
        .then((saved) => {
          if (saved) {
            setDb((d) => ({
              ...d,
              repairs: d.repairs.map((item) => (item.id === created.id ? saved : item)),
            }));
          }
        })
        .catch(() => {});

      return created;
    },
    [nextNo],
  );

  const setRepairStatus: StoreValue["setRepairStatus"] = useCallback((id, status) => {
    setDb((d) => ({
      ...d,
      repairs: d.repairs.map((r) => (r.id === id ? { ...r, status } : r)),
    }));

    repairsApi.setStatus(id, status).catch(() => {});
  }, []);

  const addExpense: StoreValue["addExpense"] = useCallback((e) => {
    const created: Expense = { ...e, id: uid("e") };
    setDb((d) => ({ ...d, expenses: [created, ...d.expenses] }));

    auditApi.addExpense(e).catch(() => {});
  }, []);

  const addPayment: StoreValue["addPayment"] = useCallback((p) => {
    const created: PaymentEntry = { ...p, id: uid("pay") };
    setDb((d) => ({ ...d, payments: [created, ...d.payments] }));

    auditApi.addPayment(p).catch(() => {});
  }, []);

  const updateSettings: StoreValue["updateSettings"] = useCallback((patch) => {
    setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } }));

    settingsApi.updateSettings(patch).catch(() => {});
  }, []);

  const resetDemo = useCallback(() => {
    setDb(seedDB());
    settingsApi
      .resetDemo()
      .then((data) => {
        if (data?.db) setDb(data.db);
      })
      .catch(() => {});
  }, []);

  const value = useMemo<StoreValue>(
    () => ({
      db,
      ready,
      refreshFromBackend,
      addCustomer,
      updateCustomer,
      addSupplier,
      addProduct,
      updateProduct,
      deleteProduct,
      addUnits,
      setUnitStatus,
      recordSale,
      recordPurchase,
      recordSaleReturn,
      recordPurchaseReturn,
      addRepair,
      setRepairStatus,
      addExpense,
      addPayment,
      updateSettings,
      resetDemo,
    }),
    [
      db,
      ready,
      refreshFromBackend,
      addCustomer,
      updateCustomer,
      addSupplier,
      addProduct,
      updateProduct,
      deleteProduct,
      addUnits,
      setUnitStatus,
      recordSale,
      recordPurchase,
      recordSaleReturn,
      recordPurchaseReturn,
      addRepair,
      setRepairStatus,
      addExpense,
      addPayment,
      updateSettings,
      resetDemo,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

/* ---------- derived helpers ---------- */

export const stockOf = (db: DB, productId: string) => {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return 0;
  if (!p.tracked) return p.qty;
  return db.units.filter((u) => u.productId === productId && u.status === "available").length;
};

export const customerDue = (db: DB, customerId: string) => {
  const customerSales = (db.sales || []).filter((s) => s.customerId === customerId && !s.quotation);
  const totalBilled = customerSales.reduce((sum, s) => {
    // For EMI sales, customer only owes the down payment to the shop, not the financed amount
    const liability = s.isEmi
      ? (s.emiDownPayment !== undefined ? s.emiDownPayment : Math.max(0, s.total - (s.emiFinancedAmount || 0)))
      : s.total;
    return sum + liability;
  }, 0);

  const customerPayments = (db.payments || []).filter(
    (p) => p.party === "customer" && p.partyId === customerId
  );
  const totalPaid = customerPayments.reduce((sum, p) => sum + p.amount, 0);
  const computedBalance = Math.max(0, totalBilled - totalPaid);

  // 1. Authoritative Customer Ledger Balance if ledger entries exist
  if (db.customerLedger && db.customerLedger.length > 0) {
    const entries = db.customerLedger.filter((e) => e.customerId === customerId);
    if (entries.length > 0) {
      const latest = entries[0];
      if (latest && typeof latest.balance === "number") {
        return Math.max(0, Math.min(latest.balance, computedBalance));
      }
    }
  }

  return computedBalance;
};

export const saleDue = (db: DB, saleId: string) => {
  const s = (db.sales || []).find((x) => x.id === saleId);
  if (!s) return 0;
  const billed = s.isEmi
    ? (s.emiDownPayment !== undefined ? s.emiDownPayment : Math.max(0, s.total - (s.emiFinancedAmount || 0)))
    : s.total;
  const invoicePayments = (db.payments || [])
    .filter((p) => p.party === "customer" && p.refId === s.id)
    .reduce((a, p) => a + p.amount, 0);
  return Math.max(0, billed - Math.max(s.paid, invoicePayments));
};

export const supplierDue = (db: DB, supplierId: string) => {
  const supplierPurchases = (db.purchases || []).filter((p) => p.supplierId === supplierId);
  const totalPurchases = supplierPurchases.reduce((sum, p) => sum + p.total, 0);

  const supplierPayments = (db.payments || []).filter(
    (p) => (p.party === "supplier" || (p.party as any) === "dealer") && p.partyId === supplierId
  );
  const totalPaid = supplierPayments.reduce((sum, p) => sum + p.amount, 0);
  const computedBalance = Math.max(0, totalPurchases - totalPaid);

  // 1. Authoritative Supplier Ledger Balance if ledger entries exist
  if (db.supplierLedger && db.supplierLedger.length > 0) {
    const entries = db.supplierLedger.filter((e) => e.supplierId === supplierId);
    if (entries.length > 0) {
      const latest = entries[0];
      if (latest && typeof latest.balance === "number") {
        return Math.max(0, Math.min(latest.balance, computedBalance));
      }
    }
  }

  return computedBalance;
};

export const saleProfit = (s: Sale) =>
  s.items.reduce((a, i) => a + (i.price - i.costPrice) * i.qty, 0) - s.discount;

export const lowStockProducts = (db: DB) =>
  db.products
    .map((p) => ({ product: p, stock: stockOf(db, p.id) }))
    .filter((r) => r.stock <= r.product.reorderLevel)
    .sort((a, b) => a.stock - b.stock);
