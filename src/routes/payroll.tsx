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
import { inr } from "@/lib/format";
import type { PayrollRecord } from "@/lib/types";

export const Route = createFileRoute("/payroll")({
  head: () => ({
    meta: [{ title: "Staff Payroll & Salary — Mobile Store ERP" }],
  }),
  component: PayrollPage,
});

function PayrollPage() {
  const { db, refreshFromBackend } = useStore();
  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [disburseModalOpen, setDisburseModalOpen] = useState(false);
  const [targetPayroll, setTargetPayroll] = useState<PayrollRecord | null>(null);
  const [disburseMethod, setDisburseMethod] = useState("Bank");

  const [calcForm, setCalcForm] = useState({
    employeeId: db.employees?.[0]?.id || "",
    allowances: 2000,
    overtime: 1500,
    commission: 3000,
    bonus: 0,
    deductions: 500,
    advances: 0,
  });

  const payrollList = useMemo(() => {
    return (db.payroll || []).filter((p) => p.month === selectedMonth && p.year === selectedYear);
  }, [db.payroll, selectedMonth, selectedYear]);

  const totalPayrollOutlay = useMemo(() => {
    return payrollList.reduce((sum, p) => sum + p.netSalary, 0);
  }, [payrollList]);

  const totalPaid = useMemo(() => {
    return payrollList.filter((p) => p.status === "PAID").reduce((sum, p) => sum + p.netSalary, 0);
  }, [payrollList]);

  const handleCalculate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calcForm.employeeId) return;

    try {
      const res = await fetch("/api/payroll/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...calcForm,
          month: selectedMonth,
          year: selectedYear,
        }),
      });

      if (res.ok) {
        await refreshFromBackend();
        setCalcModalOpen(false);
      }
    } catch {
      alert("Error calculating payroll");
    }
  };

  const handleConfirmDisburse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetPayroll) return;

    try {
      const res = await fetch("/api/payroll/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payrollId: targetPayroll.id,
          paymentMethod: disburseMethod,
        }),
      });

      if (res.ok) {
        await refreshFromBackend();
        setDisburseModalOpen(false);
      }
    } catch {
      alert("Error disbursing payroll");
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Payroll & Salary Disbursal"
        sub="Calculate gross/net salaries, commissions, advances, and attendance deductions."
        actions={
          <Button onClick={() => setCalcModalOpen(true)}>+ Calculate Salary</Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Monthly Outlay" value={inr(totalPayrollOutlay)} />
        <Stat label="Disbursed (Paid)" value={inr(totalPaid)} tone="success" />
        <Stat label="Pending Payment" value={inr(totalPayrollOutlay - totalPaid)} tone={totalPayrollOutlay > totalPaid ? "warning" : "neutral"} />
        <Stat label="Processed Staff" value={`${payrollList.length} of ${db.employees.length}`} />
      </section>

      <Card>
        <CardHead
          title="Payroll Sheet"
          sub={`Period: ${selectedMonth}/${selectedYear}`}
          right={
            <div className="flex items-center gap-2">
              <Select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="w-32"
              >
                {Array.from({ length: 12 }).map((_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Month {i + 1}
                  </option>
                ))}
              </Select>
              <Select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="w-28"
              >
                <option value={2026}>2026</option>
                <option value={2025}>2025</option>
              </Select>
            </div>
          }
        />

        {payrollList.length === 0 ? (
          <Empty text="No payroll calculated for this month yet. Click '+ Calculate Salary' to generate slips." />
        ) : (
          <Table head={["Employee", ">Basic", ">Allowances", ">Commission", ">Deductions", ">Net Salary", "Status", "Action"]}>
            {payrollList.map((p) => (
              <Row key={p.id}>
                <Td>
                  <div className="font-semibold">{p.employeeName}</div>
                  <div className="text-[11px] text-muted-foreground">{p.employeeId}</div>
                </Td>
                <Td right mono>{inr(p.basicSalary)}</Td>
                <Td right mono>+{inr(p.allowances + p.overtime)}</Td>
                <Td right mono className="text-success">+{inr(p.commission + p.bonus)}</Td>
                <Td right mono className="text-destructive">-{inr(p.deductions + p.advances + p.attendanceDeductions)}</Td>
                <Td right mono className="font-bold text-[14px] text-primary">{inr(p.netSalary)}</Td>
                <Td>
                  <Badge tone={p.status === "PAID" ? "success" : "warning"}>{p.status}</Badge>
                </Td>
                <Td>
                  {p.status !== "PAID" ? (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => {
                        setTargetPayroll(p);
                        setDisburseModalOpen(true);
                      }}
                    >
                      Disburse
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      Paid via {p.paymentMethod}
                    </span>
                  )}
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* Calculate Salary Modal */}
      <Modal
        open={calcModalOpen}
        onClose={() => setCalcModalOpen(false)}
        title="Calculate Monthly Salary"
        wide
      >
        <form onSubmit={handleCalculate} className="space-y-4">
          <Field label="Select Employee *">
            <Select
              value={calcForm.employeeId}
              onChange={(e) => setCalcForm({ ...calcForm, employeeId: e.target.value })}
            >
              {db.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeId} — Basic: {inr(e.basicSalary)})
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-border p-3 bg-muted/10">
            <Field label="Allowances (HRA / Food / Travel) (₹)">
              <Input
                type="number"
                value={calcForm.allowances}
                onChange={(e) => setCalcForm({ ...calcForm, allowances: Number(e.target.value) })}
              />
            </Field>

            <Field label="Sales Commission / Incentive (₹)">
              <Input
                type="number"
                value={calcForm.commission}
                onChange={(e) => setCalcForm({ ...calcForm, commission: Number(e.target.value) })}
              />
            </Field>

            <Field label="Overtime (₹)">
              <Input
                type="number"
                value={calcForm.overtime}
                onChange={(e) => setCalcForm({ ...calcForm, overtime: Number(e.target.value) })}
              />
            </Field>

            <Field label="Bonus (₹)">
              <Input
                type="number"
                value={calcForm.bonus}
                onChange={(e) => setCalcForm({ ...calcForm, bonus: Number(e.target.value) })}
              />
            </Field>

            <Field label="Salary Advances to Deduct (₹)">
              <Input
                type="number"
                value={calcForm.advances}
                onChange={(e) => setCalcForm({ ...calcForm, advances: Number(e.target.value) })}
              />
            </Field>

            <Field label="Other Deductions / TDS (₹)">
              <Input
                type="number"
                value={calcForm.deductions}
                onChange={(e) => setCalcForm({ ...calcForm, deductions: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="text-[11px] text-muted-foreground">
            Attendance absences will be automatically deducted based on daily wage calculations from attendance records.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setCalcModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Compute Slip</Button>
          </div>
        </form>
      </Modal>

      {/* Disburse Modal */}
      <Modal
        open={disburseModalOpen}
        onClose={() => setDisburseModalOpen(false)}
        title={`Disburse Salary — ${targetPayroll?.employeeName}`}
      >
        <form onSubmit={handleConfirmDisburse} className="space-y-4">
          <div className="p-3 rounded-lg border border-success/30 bg-success/10 text-[13px]">
            <div>Net Payable Salary: <strong className="num text-success text-[15px]">{inr(targetPayroll?.netSalary || 0)}</strong></div>
            <div className="text-[11px] text-muted-foreground mt-1">Period: Month {targetPayroll?.month}/{targetPayroll?.year}</div>
          </div>

          <Field label="Disbursal Payment Method">
            <Select
              value={disburseMethod}
              onChange={(e) => setDisburseMethod(e.target.value)}
            >
              <option value="Bank">Bank Transfer / NEFT</option>
              <option value="Cash">Cash (Updates Shop Cashbook)</option>
              <option value="UPI">UPI / Google Pay</option>
            </Select>
          </Field>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setDisburseModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="success">
              Confirm & Mark Paid
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
