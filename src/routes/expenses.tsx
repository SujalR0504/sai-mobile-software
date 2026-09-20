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
import { EXPENSE_CATEGORIES, type ExpenseCategory } from "@/lib/types";

export const Route = createFileRoute("/expenses")({
  head: () => ({
    meta: [{ title: "Shop Expenses & Overhead — Mobile Store ERP" }],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { db, addExpense } = useStore();
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState({
    date: todayISO(),
    category: "Miscellaneous" as ExpenseCategory,
    amount: 500,
    note: "",
  });

  const filteredExpenses = useMemo(() => {
    return db.expenses.filter((e) => {
      if (categoryFilter !== "All" && e.category !== categoryFilter) return false;
      return true;
    });
  }, [db.expenses, categoryFilter]);

  const totalExpense = useMemo(() => {
    return db.expenses.reduce((sum, e) => sum + e.amount, 0);
  }, [db.expenses]);

  const todayExpense = useMemo(() => {
    const today = todayISO();
    return db.expenses.filter((e) => e.date === today).reduce((sum, e) => sum + e.amount, 0);
  }, [db.expenses]);

  const handleCreateExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.amount <= 0) return;

    addExpense(form);
    setModalOpen(false);
    setForm({
      date: todayISO(),
      category: "Miscellaneous",
      amount: 500,
      note: "",
    });
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Store Expenses & Overheads"
        sub="Record day-to-day shop operational expenses, rent, utilities, and salaries."
        actions={<Button onClick={() => setModalOpen(true)}>+ Add Expense</Button>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Expenses Recorded" value={inr(totalExpense)} tone="danger" />
        <Stat label="Today's Expenses" value={inr(todayExpense)} />
        <Stat label="Expense Entries" value={String(db.expenses.length)} />
      </section>

      <Card>
        <CardHead
          title="Expense Log"
          sub={`${filteredExpenses.length} entries`}
          right={
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-40"
            >
              <option value="All">All Categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          }
        />

        {filteredExpenses.length === 0 ? (
          <Empty text="No expenses recorded." />
        ) : (
          <Table head={["Date", "Category", ">Amount", "Description / Note"]}>
            {filteredExpenses.map((e) => (
              <Row key={e.id}>
                <Td>{e.date}</Td>
                <Td>
                  <Badge tone="neutral">{e.category}</Badge>
                </Td>
                <Td right mono className="font-bold text-destructive">
                  {inr(e.amount)}
                </Td>
                <Td className="text-muted-foreground">{e.note || "—"}</Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* Add Expense Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Expense">
        <form onSubmit={handleCreateExpense} className="space-y-3">
          <Field label="Date">
            <Input
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              required
            />
          </Field>

          <Field label="Category">
            <Select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Amount (₹) *">
            <Input
              type="number"
              min="1"
              required
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </Field>

          <Field label="Description / Note">
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="e.g. Fiber broadband bill payment"
            />
          </Field>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Save Expense</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
