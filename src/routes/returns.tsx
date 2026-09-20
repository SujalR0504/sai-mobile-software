import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  const [selectedItems, setSelectedItems] = useState<LineItem[]>([]);
  const [purchaseSelectedItems, setPurchaseSelectedItems] = useState<LineItem[]>([]);
  const [selectedReturnInvoice, setSelectedReturnInvoice] = useState<ReturnDoc | null>(null);

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

  const handleOpenSaleReturn = () => {
    if (db.sales.length > 0) {
      const first = db.sales[0]!;
      setSelectedSaleId(first.id);
      setSelectedItems(first.items);
    }
    setReturnReason("Customer changed mind / defective");
    setReturnMode("Credit Note");
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

  const handleConfirmSaleReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleId || selectedItems.length === 0) return;

    recordSaleReturn({
      saleId: selectedSaleId,
      items: selectedItems,
      reason: returnReason,
      mode: returnMode,
    });

    setSaleReturnModal(false);
  };

  const handleConfirmPurchaseReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchaseId || purchaseSelectedItems.length === 0) return;

    recordPurchaseReturn({
      purchaseId: selectedPurchaseId,
      items: purchaseSelectedItems,
      reason: purchaseReturnReason,
    });

    setPurchaseReturnModal(false);
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
                    <Badge tone={r.type === "sale" ? "warning" : "info"}>
                      {r.type === "sale" ? "Customer Return" : "Dealer Return"}
                    </Badge>
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

          {selectedSale && (
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
              <div className="text-[12px] font-semibold">Items in Bill {selectedSale.invoiceNo}</div>
              <div className="text-[11px] text-muted-foreground">
                All items below will be returned to store inventory.
              </div>
              <div className="space-y-1.5">
                {selectedSale.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-[12px] p-2 rounded bg-[var(--surface-glass-strong)] border border-border"
                  >
                    <div>
                      <span className="font-semibold">{item.name}</span>
                      {item.imei && <span className="ml-2 font-mono text-[11px] text-primary">(IMEI: {item.imei})</span>}
                    </div>
                    <div className="num font-semibold">{inr(item.price * item.qty)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setSaleReturnModal(false)}>
              Cancel
            </Button>
            <Button type="submit">Confirm Return & Restock</Button>
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
            <Button type="submit" variant="primary">
              Confirm Dealer Return & Debit Ledger
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
