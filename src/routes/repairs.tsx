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
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";
import { REPAIR_STATUSES, type Repair, type RepairStatus, type Customer } from "@/lib/types";
import { generateRepairWhatsAppMessage, openWhatsAppChat } from "@/lib/whatsapp";

export const Route = createFileRoute("/repairs")({
  head: () => ({
    meta: [{ title: "Repairs & Service Center — Mobile Store ERP" }],
  }),
  component: RepairsPage,
});

function RepairsPage() {
  const { db, addRepair, setRepairStatus, addPayment } = useStore();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [whatsAppModalData, setWhatsAppModalData] = useState<{
    repair: Repair;
    customer: Customer;
    template: "Received" | "Diagnosing" | "Repairing" | "Ready" | "Delivered";
    customMessage: string;
  } | null>(null);

  const [form, setForm] = useState({
    customerId: db.customers[0]?.id || "",
    device: "",
    imei: "",
    problem: "",
    estimate: 1500,
    advance: 0,
    technician: "Ramesh",
  });

  const customerMap = useMemo(() => new Map(db.customers.map((c) => [c.id, c])), [db.customers]);

  const openRepairWhatsApp = (r: Repair, cust: Customer) => {
    const statusTemplate = (["Received", "Diagnosing", "Repairing", "Ready", "Delivered"].includes(r.status)
      ? r.status
      : "Received") as any;
    const msg = generateRepairWhatsAppMessage({
      customerName: cust.name,
      customerPhone: cust.phone,
      jobId: r.jobId,
      device: r.device,
      problem: r.problem,
      status: statusTemplate,
      estimate: r.estimate,
      advance: r.advance,
      balanceDue: Math.max(0, r.estimate - r.advance),
    });
    setWhatsAppModalData({
      repair: r,
      customer: cust,
      template: statusTemplate,
      customMessage: msg,
    });
  };

  const handleTemplateChange = (template: any) => {
    if (!whatsAppModalData) return;
    const { repair, customer } = whatsAppModalData;
    const msg = generateRepairWhatsAppMessage({
      customerName: customer.name,
      customerPhone: customer.phone,
      jobId: repair.jobId,
      device: repair.device,
      problem: repair.problem,
      status: template,
      estimate: repair.estimate,
      advance: repair.advance,
      balanceDue: Math.max(0, repair.estimate - repair.advance),
    });
    setWhatsAppModalData({
      ...whatsAppModalData,
      template,
      customMessage: msg,
    });
  };

  const filteredRepairs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.repairs.filter((r) => {
      if (statusFilter !== "All" && r.status !== statusFilter) return false;
      if (!q) return true;
      const cust = customerMap.get(r.customerId);
      return (
        r.jobId.toLowerCase().includes(q) ||
        r.device.toLowerCase().includes(q) ||
        (r.imei && r.imei.toLowerCase().includes(q)) ||
        (cust && cust.name.toLowerCase().includes(q))
      );
    });
  }, [db.repairs, query, statusFilter, customerMap]);

  const activeCount = db.repairs.filter((r) => r.status !== "Delivered").length;
  const readyCount = db.repairs.filter((r) => r.status === "Ready").length;
  const deliveredCount = db.repairs.filter((r) => r.status === "Delivered").length;

  const statusTone = (status: RepairStatus) => {
    switch (status) {
      case "Received":
        return "neutral";
      case "Diagnosing":
        return "info";
      case "Repairing":
        return "warning";
      case "Ready":
        return "success";
      case "Delivered":
        return "neutral";
      default:
        return "neutral";
    }
  };

  const handleCreateRepair = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.customerId || !form.device || !form.problem) return;

    addRepair({
      customerId: form.customerId,
      device: form.device,
      imei: form.imei.trim() || undefined,
      problem: form.problem,
      estimate: Number(form.estimate) || 0,
      advance: Number(form.advance) || 0,
      technician: form.technician,
    });

    setModalOpen(false);
    setForm({
      customerId: db.customers[0]?.id || "",
      device: "",
      imei: "",
      problem: "",
      estimate: 1500,
      advance: 0,
      technician: "Ramesh",
    });
  };

  const handleDeliver = (r: Repair) => {
    setRepairStatus(r.id, "Delivered");
    const due = Math.max(0, r.estimate - r.advance);
    if (due > 0) {
      addPayment({
        date: todayISO(),
        party: "customer",
        partyId: r.customerId,
        refId: r.id,
        amount: due,
        mode: "Cash",
        note: `Final settlement on delivery for ${r.jobId}`,
      });
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Repairs & Service Center"
        sub="Track device intake, diagnostics, technician assignments, repair job cards and pickups."
        actions={
          <Button
            onClick={() => {
              setForm({ ...form, customerId: db.customers[0]?.id || "" });
              setModalOpen(true);
            }}
          >
            + New Repair Job Card
          </Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active Repairs" value={String(activeCount)} tone={activeCount > 0 ? "warning" : "neutral"} />
        <Stat label="Ready for Pickup" value={String(readyCount)} tone={readyCount > 0 ? "success" : "neutral"} />
        <Stat label="Delivered" value={String(deliveredCount)} />
        <Stat
          label="Estimated Revenue"
          value={inr(db.repairs.filter((r) => r.status !== "Delivered").reduce((s, r) => s + r.estimate, 0))}
        />
      </section>

      <Card>
        <CardHead
          title="Job Cards"
          sub={`${filteredRepairs.length} repair cards`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search job card or customer..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-48 sm:w-64"
              />
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-36"
              >
                <option value="All">All Statuses</option>
                {REPAIR_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {filteredRepairs.length === 0 ? (
          <Empty text="No repair job cards found." />
        ) : (
          <Table head={["Job ID", "Customer", "Device & Problem", "Technician", ">Estimate", ">Advance", "Status", "Actions"]}>
            {filteredRepairs.map((r) => {
              const cust = customerMap.get(r.customerId);
              return (
                <Row key={r.id}>
                  <Td mono className="font-semibold">
                    {r.jobId}
                  </Td>
                  <Td>
                    <div className="font-semibold">{cust?.name || "Customer"}</div>
                    <div className="text-[10.5px] text-muted-foreground">{cust?.phone}</div>
                  </Td>
                  <Td>
                    <div className="font-medium">{r.device}</div>
                    <div className="text-[11px] text-muted-foreground line-clamp-1">{r.problem}</div>
                    {r.imei && <div className="num text-[10px] text-muted-foreground">IMEI: {r.imei}</div>}
                  </Td>
                  <Td>{r.technician}</Td>
                  <Td right mono className="font-semibold">
                    {inr(r.estimate)}
                  </Td>
                  <Td right mono className="text-success font-medium">
                    {inr(r.advance)}
                  </Td>
                  <Td>
                    <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                  </Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      <Select
                        className="h-7 text-[11px] w-32"
                        value={r.status}
                        onChange={(e) => setRepairStatus(r.id, e.target.value as RepairStatus)}
                      >
                        {REPAIR_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-300 gap-1 font-medium text-[11px] h-7"
                        onClick={() => cust && openRepairWhatsApp(r, cust)}
                        title="Send WhatsApp Update to Customer"
                      >
                        💬 WhatsApp
                      </Button>
                      {r.status === "Ready" && (
                        <Button size="sm" variant="success" className="h-7 text-[11px]" onClick={() => handleDeliver(r)}>
                          Deliver
                        </Button>
                      )}
                    </div>
                  </Td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {/* New Repair Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create Repair Job Card"
        wide
      >
        <form onSubmit={handleCreateRepair} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Customer *">
              <Select
                value={form.customerId}
                onChange={(e) => setForm({ ...form, customerId: e.target.value })}
                required
              >
                {db.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.phone})
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Device Model *">
              <Input
                required
                value={form.device}
                onChange={(e) => setForm({ ...form, device: e.target.value })}
                placeholder="e.g. iPhone 12 Pro Max"
              />
            </Field>

            <Field label="Device IMEI (Optional)">
              <Input
                value={form.imei}
                onChange={(e) => setForm({ ...form, imei: e.target.value })}
                placeholder="e.g. 354012000000000"
              />
            </Field>

            <Field label="Assigned Technician">
              <Input
                value={form.technician}
                onChange={(e) => setForm({ ...form, technician: e.target.value })}
                placeholder="e.g. Ramesh"
              />
            </Field>

            <Field label="Estimated Total (₹)">
              <Input
                type="number"
                value={form.estimate}
                onChange={(e) => setForm({ ...form, estimate: Number(e.target.value) })}
              />
            </Field>

            <Field label="Advance Received (₹)">
              <Input
                type="number"
                value={form.advance}
                onChange={(e) => setForm({ ...form, advance: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="Reported Problem / Symptoms *">
            <textarea
              className="w-full h-20 rounded-md border border-border bg-[var(--surface-glass-strong)] p-2 text-[12.5px] outline-none focus:border-primary"
              value={form.problem}
              onChange={(e) => setForm({ ...form, problem: e.target.value })}
              placeholder="e.g. Water damage, screen flickering, power button unresponsive"
              required
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Job Card</Button>
          </div>
        </form>
      </Modal>

      {/* WHATSAPP REPAIR MESSAGE MODAL */}
      <Modal
        open={Boolean(whatsAppModalData)}
        onClose={() => setWhatsAppModalData(null)}
        title={`WhatsApp Repair Card — ${whatsAppModalData?.repair.jobId}`}
      >
        {whatsAppModalData && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-border/60 bg-muted/20 p-3 text-[12px]">
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Customer Name</span>
                <span className="font-bold text-foreground">{whatsAppModalData.customer.name}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Phone Number</span>
                <span className="font-mono font-medium">{whatsAppModalData.customer.phone}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Device & Job</span>
                <span className="font-medium text-foreground">
                  {whatsAppModalData.repair.device} ({whatsAppModalData.repair.jobId})
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10.5px]">Pending Balance</span>
                <span className="font-mono font-bold text-destructive">
                  {inr(Math.max(0, whatsAppModalData.repair.estimate - whatsAppModalData.repair.advance))}
                </span>
              </div>
            </div>

            <Field label="Choose Message Template">
              <Select
                value={whatsAppModalData.template}
                onChange={(e) => handleTemplateChange(e.target.value)}
              >
                <option value="Received">1. Device Received / Job Card Created</option>
                <option value="Diagnosing">2. Diagnostics In Progress</option>
                <option value="Repairing">3. Repair In Progress</option>
                <option value="Ready">4. Ready for Pickup & Payment</option>
                <option value="Delivered">5. Device Delivered / Thank You</option>
              </Select>
            </Field>

            <Field label="Message Text (Editable Preview)">
              <textarea
                className="w-full h-44 rounded-xl border border-border bg-[var(--surface-glass-strong)] p-3 text-[12px] font-mono leading-relaxed outline-none focus:border-primary"
                value={whatsAppModalData.customMessage}
                onChange={(e) =>
                  setWhatsAppModalData({
                    ...whatsAppModalData,
                    customMessage: e.target.value,
                  })
                }
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" onClick={() => setWhatsAppModalData(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                onClick={() => {
                  openWhatsAppChat(
                    whatsAppModalData.customer.phone,
                    whatsAppModalData.customMessage,
                    {
                      party: "customer",
                      partyId: whatsAppModalData.customer.id,
                      refId: whatsAppModalData.repair.id,
                      reason: "repair_update",
                    }
                  );
                  setWhatsAppModalData(null);
                }}
              >
                📲 Open WhatsApp Chat
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
