import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Input,
  PageHead,
  Row,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, maskImei } from "@/lib/format";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/types";
import { ExcelProductImportModal } from "@/components/products/ExcelProductImportModal";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [{ title: "Stock & IMEI Tracking — Mobile Store ERP" }],
  }),
  component: StockPage,
});

function StockPage() {
  const { db, setUnitStatus, refreshFromBackend } = useStore();
  const [query, setQuery] = useState("");
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("available");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [brandFilter, setBrandFilter] = useState<string>("All");

  const productMap = useMemo(() => {
    return new Map(db.products.map((p) => [p.id, p]));
  }, [db.products]);

  const customerMap = useMemo(() => {
    return new Map(db.customers.map((c) => [c.id, c]));
  }, [db.customers]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    db.products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [db.products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    db.products.forEach((p) => {
      if (p.brand) set.add(p.brand);
    });
    return Array.from(set).sort();
  }, [db.products]);

  const filteredUnits = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.units.filter((u) => {
      if (statusFilter !== "All" && u.status !== statusFilter) return false;
      const prod = productMap.get(u.productId);
      if (categoryFilter !== "All" && prod?.category !== categoryFilter) return false;
      if (brandFilter !== "All" && prod?.brand !== brandFilter) return false;
      if (!q) return true;
      return (
        u.imei1.toLowerCase().includes(q) ||
        (u.imei2 && u.imei2.toLowerCase().includes(q)) ||
        (u.serial && u.serial.toLowerCase().includes(q)) ||
        (prod && (
          prod.name.toLowerCase().includes(q) ||
          prod.brand.toLowerCase().includes(q) ||
          prod.model.toLowerCase().includes(q) ||
          prod.category.toLowerCase().includes(q) ||
          (prod.sku && prod.sku.toLowerCase().includes(q)) ||
          (prod.barcode && prod.barcode.toLowerCase().includes(q))
        ))
      );
    });
  }, [db.units, query, statusFilter, categoryFilter, brandFilter, productMap]);

  const availableCount = db.units.filter((u) => u.status === "available").length;
  const soldCount = db.units.filter((u) => u.status === "sold").length;
  const damagedCount = db.units.filter((u) => u.status === "damaged").length;
  const stockValuation = db.units
    .filter((u) => u.status === "available")
    .reduce((sum, u) => sum + u.purchasePrice, 0);

  const statusTone = (status: UnitStatus) => {
    switch (status) {
      case "available":
        return "success";
      case "sold":
        return "neutral";
      case "damaged":
        return "danger";
      case "returned":
        return "warning";
      case "reserved":
        return "info";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <PageHead
        title="Stock & Serial Tracker"
        sub="Monitor individual IMEI lifecycles from intake to sold, damaged, or returned."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImportModalOpen(true)} className="gap-1.5 font-bold shadow-xs">
              📥 Import Excel / CSV
            </Button>
          </div>
        }
      />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Stat label="Available Units" value={String(availableCount)} tone="success" />
        <Stat label="Stock Asset Value" value={inr(stockValuation)} />
        <Stat label="Units Sold" value={String(soldCount)} />
        <Stat label="Damaged / Dead" value={String(damagedCount)} tone="danger" />
      </section>

      <Card>
        <CardHead
          title="Inventory Units"
          sub={`${filteredUnits.length} units listed`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search IMEI, model, brand, SKU..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full sm:w-52 md:w-60"
              />
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-36 text-[12px]"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
              <Select
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
                className="w-32 text-[12px]"
              >
                <option value="All">All Brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-32 text-[12px]"
              >
                <option value="All">All Statuses</option>
                {UNIT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {filteredUnits.length === 0 ? (
          <Empty text="No inventory units found matching filter criteria." />
        ) : (
          <Table head={["IMEI / Serial", "Device / Model", "Category & Brand", "Status", ">Cost Price", "Assigned Customer", "Actions"]}>
            {filteredUnits.map((u) => {
              const prod = productMap.get(u.productId);
              const cust = u.customerId ? customerMap.get(u.customerId) : null;
              return (
                <Row key={u.id}>
                  <Td mono>
                    <div className="font-semibold text-[13px]">{u.imei1}</div>
                    {u.imei2 ? (
                      <div className="text-[10.5px] text-muted-foreground">IMEI 2: {u.imei2}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <div className="font-semibold">{prod?.name || "Unknown Product"}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {prod?.model ? `Model: ${prod.model}` : ""}
                    </div>
                  </Td>
                  <Td>
                    <div className="text-[12px] font-medium text-foreground">{prod?.brand || "—"}</div>
                    <div className="text-[10.5px] text-muted-foreground">{prod?.category || "—"}</div>
                  </Td>
                  <Td>
                    <Badge tone={statusTone(u.status)}>{u.status.toUpperCase()}</Badge>
                  </Td>
                  <Td right mono>
                    {inr(u.purchasePrice)}
                  </Td>
                  <Td>
                    {cust ? (
                      <div>
                        <div className="font-medium text-[12px]">{cust.name}</div>
                        <div className="text-[10.5px] text-muted-foreground">{cust.phone}</div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">— In Counter Stock —</span>
                    )}
                  </Td>
                  <Td>
                    <Select
                      className="h-7 text-[11px] w-28"
                      value={u.status}
                      onChange={(e) => setUnitStatus(u.id, e.target.value as UnitStatus)}
                    >
                      {UNIT_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </Select>
                  </Td>
                </Row>
              );
            })}
          </Table>
        )}
      </Card>

      {/* EXCEL / CSV BULK IMPORT MODAL */}
      <ExcelProductImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          refreshFromBackend();
        }}
      />
    </div>
  );
}
