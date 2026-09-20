import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Badge,
  Card,
  CardHead,
  Empty,
  Input,
  PageHead,
  Row,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { inr, todayISO } from "@/lib/format";

export const Route = createFileRoute("/cashbook")({
  head: () => ({
    meta: [{ title: "Daily Cashbook & Counter Reconciliation — Mobile Store ERP" }],
  }),
  component: CashbookPage,
});

function CashbookPage() {
  const { db } = useStore();
  const [filterDate, setFilterDate] = useState("");

  const filteredEntries = useMemo(() => {
    if (!filterDate) return db.cashbook;
    return db.cashbook.filter((c) => c.date === filterDate);
  }, [db.cashbook, filterDate]);

  const totalInflow = useMemo(
    () => filteredEntries.reduce((sum, c) => sum + c.inflow, 0),
    [filteredEntries],
  );

  const totalOutflow = useMemo(
    () => filteredEntries.reduce((sum, c) => sum + c.outflow, 0),
    [filteredEntries],
  );

  const currentBalance = useMemo(() => {
    if (db.cashbook.length === 0) return db.settings.openingCash;
    return db.cashbook[0]?.balance ?? db.settings.openingCash;
  }, [db.cashbook, db.settings.openingCash]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Cashbook & Counter Reconciliation"
        sub="Automated double-entry cash ledger: Closing Cash = Opening Cash + Cash Sales + Receipts - Outflows."
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Current Cash in Drawer" value={inr(currentBalance)} tone="success" />
        <Stat label="Opening Float Balance" value={inr(db.settings.openingCash)} />
        <Stat label="Cash Inflow" value={`+${inr(totalInflow)}`} tone="success" />
        <Stat label="Cash Outflow" value={`-${inr(totalOutflow)}`} tone="danger" />
      </section>

      <Card>
        <CardHead
          title="Cash Register Transactions"
          sub={`${filteredEntries.length} entries recorded`}
          right={
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="w-40 text-[12px]"
                placeholder="Filter date..."
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-[11px] text-muted-foreground underline"
                >
                  Clear
                </button>
              )}
            </div>
          }
        />

        {filteredEntries.length === 0 ? (
          <Empty text="No cash transactions recorded for this period." />
        ) : (
          <Table head={["Date", "Transaction Type", "Category", ">Inflow (+)", ">Outflow (-)", ">Drawer Balance", "Notes"]}>
            {filteredEntries.map((c) => (
              <Row key={c.id}>
                <Td>{c.date}</Td>
                <Td>
                  <Badge tone={c.inflow > 0 ? "success" : "warning"}>
                    {c.type.replace(/_/g, " ")}
                  </Badge>
                </Td>
                <Td>{c.category || "General"}</Td>
                <Td right mono className="font-semibold text-success">
                  {c.inflow > 0 ? `+${inr(c.inflow)}` : "—"}
                </Td>
                <Td right mono className="font-semibold text-destructive">
                  {c.outflow > 0 ? `-${inr(c.outflow)}` : "—"}
                </Td>
                <Td right mono className="font-bold text-primary">
                  {inr(c.balance)}
                </Td>
                <Td className="text-[11px] text-muted-foreground">{c.notes || "—"}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}
