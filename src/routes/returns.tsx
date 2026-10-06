import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
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
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import type { LineItem, ReturnDoc } from "@/lib/types";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";
import { returnDocToInvoiceProps } from "@/components/invoice/invoiceAdapters";
import { Package, Truck, Info } from "lucide-react";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [{ title: "Returns & Credit Notes — Mobile Store ERP" }],
  }),
  component: ReturnsPage,
});

function ReturnsPage() {
  const { db, recordSaleReturn, recordPurchaseReturn } = useStore();
  const [saleReturnModal, setSaleReturnModal] = useState(false);
  const [purchaseReturnModal, setPurchaseReturnModal] = useState(false);
  const [selectedSaleId, setSelectedSaleId] = useState("");
  const [selectedPurchaseId, setSelectedPurchaseId] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [purchaseReturnReason, setPurchaseReturnReason] = useState("");
  const [returnMode, setReturnMode] = useState<"Refund" | "Credit Note">("Credit Note");
  const [returnDestination, setReturnDestination] = useState<"INVENTORY" | "DEALER">("INVENTORY");
  const [selectedDealerId, setSelectedDealerId] = useState("");
  const [selectedItems, setSelectedItems] = useState<LineItem[]>([]);
  const [purchaseSelectedItems, setPurchaseSelectedItems] = useState<LineItem[]>([]);
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<ReturnDoc | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const customerMap = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);
  const supplierMap = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers]);

  const selectedSale = useMemo(
    () => db.sales.find((s) => s.id === selectedSaleId),
    [db.sales, selectedSaleId],
  );

  const selectedPurchase = useMemo(
    () => db.purchases.find((p) => p.id === selectedPurchaseId),
    [db.purchases, selectedPurchaseId],
  );

  // Auto-detect supplier from original purchase of returned units
  const autoDetectedSupplierId = useMemo(() => {
    if (!selectedSale) return db.suppliers[0]?.id || "";
    for (const item of selectedSale.items) {
      if (item.unitId) {
        const u = db.units.find((x) => x.id === item.unitId);
        if (u?.purchaseId) {
          const pur = db.purchases.find((p) => p.id === u.purchaseId);
          if (pur?.supplierId) return pur.supplierId;
        }
      }
    }
    return db.suppliers[0]?.id || "";
  }, [selectedSale, db.units, db.purchases, db.suppliers]);

  useEffect(() => {
    if (autoDetectedSupplierId) {
      setSelectedDealerId(autoDetectedSupplierId);
    }
  }, [autoDetectedSupplierId]);

  const handleOpenSaleReturn = () => {
    if (db.sales.length > 0) {
      const first = db.sales[0]!;
      setSelectedSaleId(first.id);
      setSelectedItems(first.items);
    }
    setReturnReason("Customer changed mind / defective");
    setReturnMode("Credit Note");
    setReturnDestination("INVENTORY");
    setSaleReturnModal(true);
  };

  const handleOpenPurchaseReturn = () => {
    if (db.purchases.length > 0) {
      const first = db.purchases[0]!;
      setSelectedPurchaseId(first.id);
      setPurchaseSelectedItems(first.items);
    }
    setPurchaseReturnReason("Defective unit / Warranty claim with Dealer");
    setPurchaseReturnModal(true);
  };

  const handleSaleSelectChange = (saleId: string) => {
    setSelectedSaleId(saleId);
    const s = db.sales.find((x) => x.id === saleId);
    if (s) {
      setSelectedItems(s.items);
    }
  };

  const handlePurchaseSelectChange = (purchaseId: string) => {
    setSelectedPurchaseId(purchaseId);
    const p = db.purchases.find((x) => x.id === purchaseId);
    if (p) {
      setPurchaseSelectedItems(p.items);
    }
  };

  const handleConfirmSaleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleId || selectedItems.length === 0 || isSubmitting) return;
    if (returnDestination === "DEALER" && !selectedDealerId) {
      alert("Please select a Dealer / Supplier to return the item to.");
      return;
    }

    setIsSubmitting(true);
    try {
      await recordSaleReturn({
        saleId: selectedSaleId,
        items: selectedItems,
        reason: returnReason,
        mode: returnMode,
        destination: returnDestination,
        dealerId: returnDestination === "DEALER" ? selectedDealerId : undefined,
      });

      setSaleReturnModal(false);
      setReturnReason("");
    } catch (err: any) {
      alert(err?.message || "Failed to process sale return");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPurchaseReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchaseId || purchaseSelectedItems.length === 0 || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await recordPurchaseReturn({
        purchaseId: selectedPurchaseId,
        items: purchaseSelectedItems,
        reason: purchaseReturnReason,
      });

      setPurchaseReturnModal(false);
      setPurchaseReturnReason("");
    } catch (err: any) {
      alert(err?.message || "Failed to process purchase return");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Returns & Credit Notes"
        sub="Process customer returns and dealer warranty purchase returns."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleOpenPurchaseReturn}>
              + Process Dealer Return
            </Button>
            <Button onClick={handleOpenSaleReturn}>
              + Process Sale Return
            </Button>
          </div>
        }
      />

      <Card>
        <CardHead
          title="Return Documents"
          sub={`${db.returns.length} returns registered`}
        />

        {db.returns.length === 0 ? (
          <Empty text="No returns recorded yet." />
        ) : (
          <Table head={["Type", "Date", "Original Ref #", "Party", "Items Returned", ">Amount", "Reason", "Mode", "Actions"]}>
            {db.returns.map((r) => {
              const party =
                r.type === "sale"
                  ? customerMap.get(r.partyId)?.name || "Customer"
                  : supplierMap.get(r.partyId)?.name || "Dealer";
              return (
                <Row key={r.id}>
                  <Td>
                    <div className="space-y-1">
                      <Badge tone={r.type === "sale" ? "warning" : "info"}>
                        {r.type === "sale" ? "Customer Return" : "Dealer Return"}
                      </Badge>
                      {r.destination && (
                        <div className="text-[10px] font-semibold">
                          {r.destination === "DEALER" ? (
                            <span className="text-indigo-600 flex items-center gap-0.5">
                              <Truck className="size-2.5 inline" /> To Dealer: {supplierMap.get(r.dealerId || "")?.name || "Dealer"}
                            </span>
                          ) : (
                            <span className="text-emerald-600 flex items-center gap-0.5">
                              <Package className="size-2.5 inline" /> Restocked
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </Td>
                  <Td>{r.date}</Td>
                  <Td mono className="font-semibold">{r.refNo}</Td>
                  <Td>{party}</Td>
                  <Td>
                    <div className="text-[11px] max-w-xs truncate">
                      {r.items.map((i) => `${i.name} (×${i.qty})`).join(", ")}
                    </div>
                  </Td>
                  <Td right mono className="font-bold text-destructive">
                    {inr(r.amount)}
                  </Td>
                  <Td>{r.reason}</Td>
                  <Td>
                    <Badge tone={r.mode === "Refund" ? "danger" : "neutral"}>{r.mode}</Badge>
                  </Td>
                  <Td>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 font-medium"
                      onClick={() => setSelectedReturnInvoice(r)}
                      title="Print / View Official Return Note"
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

      {/* Sale Return Modal */}
      <Modal
        open={saleReturnModal}
        onClose={() => setSaleReturnModal(false)}
        title="Process Sale Return"
        wide
      >
        <form onSubmit={handleConfirmSaleReturn} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Select Sale Bill *">
              <Select
                value={selectedSaleId}
                onChange={(e) => handleSaleSelectChange(e.target.value)}
                required
              >
                {db.sales
                  .filter((s) => !s.quotation)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.invoiceNo} — {customerMap.get(s.customerId)?.name || "Customer"} ({inr(s.total)})
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Return Settlement Mode">
              <Select
                value={returnMode}
                onChange={(e) => setReturnMode(e.target.value as "Refund" | "Credit Note")}
              >
                <option value="Credit Note">Store Credit Note (Balances customer ledger)</option>
                <option value="Refund">Cash / UPI Refund</option>
              </Select>
            </Field>
          </div>

          <Field label="Reason for Return">
            <Input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g. Defective camera / Customer exchange"
              required
            />
          </Field>

          {/* 2 OPTIONS: RESTOCK TO INVENTORY vs RETURN TO DEALER */}
          <div className="space-y-2 pt-1">
            <label className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block">
              Return Destination (वस्तु कहाँ जाएगी?) *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Option 1: Wapas Inventory me add ho jaye */}
              <div
                onClick={() => setReturnDestination("INVENTORY")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  returnDestination === "INVENTORY"
                    ? "border-emerald-500 bg-emerald-50/50 ring-2 ring-emerald-500/20 shadow-xs"
                    : "border-border/80 bg-muted/10 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    id="dest_inventory"
                    name="returnDestination"
                    checked={returnDestination === "INVENTORY"}
                    onChange={() => setReturnDestination("INVENTORY")}
                    className="mt-0.5 accent-emerald-600 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="dest_inventory" className="font-bold text-[13px] text-foreground flex items-center gap-1.5 cursor-pointer">
                      <Package className="size-4 text-emerald-600" />
                      <span>Restock to Inventory</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      आइटम दुकान की <strong>उपलब्ध इन्वेंटरी</strong> में वापस जुड़ जाएगा और POS में तुरंत बिक्री हेतु उपलब्ध रहेगा।
                    </p>
                    <Badge tone="success" className="text-[9px] py-0 px-1.5 mt-2">
                      +1 Qty / Available in POS
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Option 2: Dealer ko return karne ka option */}
              <div
                onClick={() => setReturnDestination("DEALER")}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                  returnDestination === "DEALER"
                    ? "border-indigo-500 bg-indigo-50/50 ring-2 ring-indigo-500/20 shadow-xs"
                    : "border-border/80 bg-muted/10 hover:bg-muted/20"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <input
                    type="radio"
                    id="dest_dealer"
                    name="returnDestination"
                    checked={returnDestination === "DEALER"}
                    onChange={() => setReturnDestination("DEALER")}
                    className="mt-0.5 accent-indigo-600 cursor-pointer"
                  />
                  <div>
                    <label htmlFor="dest_dealer" className="font-bold text-[13px] text-foreground flex items-center gap-1.5 cursor-pointer">
                      <Truck className="size-4 text-indigo-600" />
                      <span>Return to Dealer / Supplier</span>
                    </label>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                      आइटम <strong>डीलर / सप्लायर</strong> को रिप्लेसमेंट / क्लेम हेतु भेजा जाएगा। यह दुकान के एक्टिव स्टॉक में नहीं जुड़ेगा।
                    </p>
                    <Badge tone="info" className="text-[9px] py-0 px-1.5 mt-2">
                      Dealer Warranty / Debit Note
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* If Return to Dealer is selected, show Dealer Selector */}
          {returnDestination === "DEALER" && (
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/30 p-3.5 space-y-2 animate-in-soft">
              <Field label="Select Dealer / Supplier to Return * (डीलर / सप्लायर चुनें)">
                <Select
                  value={selectedDealerId}
                  onChange={(e) => setSelectedDealerId(e.target.value)}
                  required
                  className="bg-white border-indigo-300 font-semibold"
                >
                  <option value="">-- Choose Dealer / Supplier --</option>
                  {db.suppliers.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.name} {sup.phone ? `(${sup.phone})` : ""}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="text-[11px] text-indigo-900 font-medium flex items-start gap-1.5 pt-0.5">
                <Info className="size-3.5 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  इस आइटम के लिए डीलर के खाते (Ledger) में परचेज रिटर्न / डेबिट एंट्री दर्ज की जाएगी और आइटम स्टॉक से हटा दिया जाएगा।
                </span>
              </div>
            </div>
          )}

          {selectedSale && (
            <div className="rounded-xl border border-border p-3 space-y-2 bg-muted/20">
              <div className="text-[12px] font-bold text-foreground">Items in Bill {selectedSale.invoiceNo}</div>
              <div className="text-[11px] text-muted-foreground">
                {returnDestination === "INVENTORY" ? (
                  <span className="text-emerald-700 font-medium">
                    📦 All items below will be returned to store inventory and made available for sale in POS.
                  </span>
                ) : (
                  <span className="text-indigo-700 font-medium">
                    🚚 All items below will be returned to Dealer ({supplierMap.get(selectedDealerId)?.name || "Dealer"}) and marked as 'PURCHASE_RETURNED'.
                  </span>
                )}
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {selectedSale.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[12px] p-2.5 rounded-lg bg-[var(--surface-glass-strong)] border border-border"
                  >
                    <div>
                      <span className="font-semibold text-foreground">{item.name}</span>
                      {item.imei && <span className="ml-2 font-mono text-[11px] text-primary">(IMEI: {item.imei})</span>}
                    </div>
                    <div className="num font-bold text-foreground">{inr(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setSaleReturnModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : returnDestination === "INVENTORY"
                ? "Confirm Return & Restock to Inventory"
                : "Confirm Return & Send to Dealer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Dealer Purchase Return Modal */}
      <Modal
        open={purchaseReturnModal}
        onClose={() => setPurchaseReturnModal(false)}
        title="Process Dealer Purchase Return"
        wide
      >
        <form onSubmit={handleConfirmPurchaseReturn} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Select Dealer Purchase Bill *">
              <Select
                value={selectedPurchaseId}
                onChange={(e) => handlePurchaseSelectChange(e.target.value)}
                required
              >
                {db.purchases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.invoiceNo} — {supplierMap.get(p.supplierId || p.dealerId || "")?.name || "Dealer"} ({inr(p.total)})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Reason for Dealer Return *">
              <Input
                value={purchaseReturnReason}
                onChange={(e) => setPurchaseReturnReason(e.target.value)}
                placeholder="e.g. DOA / Dead on arrival / Warranty replacement"
                required
              />
            </Field>
          </div>

          {selectedPurchase && (
            <div className="rounded-xl border border-border p-3 space-y-2.5 bg-muted/20">
              <div className="text-[12px] font-bold text-foreground">
                Select Items to Return from Bill {selectedPurchase.invoiceNo}
              </div>
              <div className="text-[11px] text-muted-foreground">
                Items returned will be removed from available stock and marked as 'PURCHASE_RETURNED'. A debit entry will be recorded in the Dealer Ledger.
              </div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {selectedPurchase.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[12px] p-2.5 rounded-lg bg-[var(--surface-glass-strong)] border border-border"
                  >
                    <div>
                      <span className="font-semibold">{item.name}</span>
                      <span className="ml-2 text-muted-foreground">Qty: {item.qty}</span>
                      {item.imei && <span className="ml-2 font-mono text-[11px] text-primary">(IMEI: {item.imei})</span>}
                    </div>
                    <div className="num font-bold text-rose-600">{inr(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setPurchaseReturnModal(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Confirm Dealer Return & Debit Ledger"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* UNIVERSAL INVOICE MODAL FOR SALE & PURCHASE RETURNS */}
      {selectedReturnInvoice && (
        <InvoiceModal
          open={Boolean(selectedReturnInvoice)}
          onClose={() => setSelectedReturnInvoice(null)}
          {...returnDocToInvoiceProps(selectedReturnInvoice, db)}
        />
      )}
    </div>
  );
}
