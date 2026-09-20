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
import type { Employee, Role } from "@/lib/types";

export const Route = createFileRoute("/employees")({
  head: () => ({
    meta: [{ title: "Employees & Staff Directory — Mobile Store ERP" }],
  }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const { db, refreshFromBackend } = useStore();
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState<Omit<Employee, "id">>({
    employeeId: `EMP-00${db.employees.length + 1}`,
    fullName: "",
    mobile: "",
    email: "",
    address: "",
    joiningDate: todayISO(),
    department: "Sales",
    designation: "Counter Sales Executive",
    salaryType: "MONTHLY",
    basicSalary: 20000,
    bankDetails: "",
    emergencyContact: "",
    status: "ACTIVE",
    role: "SALES",
  });

  const filteredEmployees = useMemo(() => {
    const q = query.trim().toLowerCase();
    return db.employees.filter((emp) => {
      if (deptFilter !== "All" && emp.department !== deptFilter) return false;
      if (!q) return true;
      return (
        emp.fullName.toLowerCase().includes(q) ||
        emp.employeeId.toLowerCase().includes(q) ||
        emp.mobile.includes(q) ||
        emp.designation.toLowerCase().includes(q)
      );
    });
  }, [db.employees, query, deptFilter]);

  const departments = useMemo(() => {
    const set = new Set(db.employees.map((e) => e.department));
    return Array.from(set);
  }, [db.employees]);

  const activeCount = db.employees.filter((e) => e.status === "ACTIVE").length;

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName || !form.mobile) return;

    try {
      const res = await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        await refreshFromBackend();
        setModalOpen(false);
        setForm({
          employeeId: `EMP-00${db.employees.length + 2}`,
          fullName: "",
          mobile: "",
          email: "",
          address: "",
          joiningDate: todayISO(),
          department: "Sales",
          designation: "Counter Sales Executive",
          salaryType: "MONTHLY",
          basicSalary: 20000,
          bankDetails: "",
          emergencyContact: "",
          status: "ACTIVE",
          role: "SALES",
        });
      }
    } catch {
      // ignore
    }
  };

  const statusTone = (status: string) => {
    switch (status) {
      case "ACTIVE":
        return "success";
      case "INACTIVE":
        return "neutral";
      case "SUSPENDED":
        return "danger";
      case "LEFT":
        return "warning";
      default:
        return "neutral";
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Employee Directory & HR"
        sub="Manage staff profiles, departmental roles, salary configurations, and permissions."
        actions={<Button onClick={() => setModalOpen(true)}>+ Onboard Employee</Button>}
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Staff" value={String(db.employees.length)} />
        <Stat label="Active Employees" value={String(activeCount)} tone="success" />
        <Stat label="Departments" value={String(departments.length)} />
        <Stat
          label="Monthly Payroll Base"
          value={inr(db.employees.filter((e) => e.status === "ACTIVE").reduce((s, e) => s + e.basicSalary, 0))}
        />
      </section>

      <Card>
        <CardHead
          title="Staff Members"
          sub={`${filteredEmployees.length} employees listed`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Search staff by name, ID or mobile..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-48 sm:w-64"
              />
              <Select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-36"
              >
                <option value="All">All Departments</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </Select>
            </div>
          }
        />

        {filteredEmployees.length === 0 ? (
          <Empty text="No employees found." />
        ) : (
          <Table head={["Employee ID", "Full Name", "Department & Role", "Contact", "Salary Type", ">Basic Salary", "Status"]}>
            {filteredEmployees.map((emp) => (
              <Row key={emp.id}>
                <Td mono className="font-semibold text-primary">
                  {emp.employeeId}
                </Td>
                <Td>
                  <div className="font-semibold">{emp.fullName}</div>
                  <div className="text-[11px] text-muted-foreground">{emp.designation}</div>
                </Td>
                <Td>
                  <div>{emp.department}</div>
                  <Badge tone="neutral" className="mt-0.5 text-[9.5px]">
                    {emp.role}
                  </Badge>
                </Td>
                <Td>
                  <div className="font-mono text-[12px]">{emp.mobile}</div>
                  {emp.email && <div className="text-[10.5px] text-muted-foreground">{emp.email}</div>}
                </Td>
                <Td>
                  <Badge tone="neutral">{emp.salaryType}</Badge>
                </Td>
                <Td right mono className="font-semibold">
                  {inr(emp.basicSalary)}
                </Td>
                <Td>
                  <Badge tone={statusTone(emp.status)}>{emp.status}</Badge>
                </Td>
              </Row>
            ))}
          </Table>
        )}
      </Card>

      {/* Onboard Employee Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Onboard New Employee"
        wide
      >
        <form onSubmit={handleCreateEmployee} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Employee ID Code *">
              <Input
                required
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              />
            </Field>

            <Field label="Full Name *">
              <Input
                required
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="e.g. Vikram Sharma"
              />
            </Field>

            <Field label="Mobile Number *">
              <Input
                required
                value={form.mobile}
                onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                placeholder="e.g. 9876543210"
              />
            </Field>

            <Field label="Email Address">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="e.g. vikram@store.com"
              />
            </Field>

            <Field label="Department *">
              <Select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
              >
                <option value="Sales">Sales & POS</option>
                <option value="Service Center">Service & Repairs</option>
                <option value="Accounts & Billing">Accounts & Billing</option>
                <option value="Inventory & Warehouse">Inventory & Warehouse</option>
                <option value="Management">Management</option>
              </Select>
            </Field>

            <Field label="Designation *">
              <Input
                required
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
                placeholder="e.g. Senior Counter Executive"
              />
            </Field>

            <Field label="Role & Permissions *">
              <Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              >
                <option value="SALES">SALES (POS, Invoices, Customer Lookup)</option>
                <option value="TECHNICIAN">TECHNICIAN (Repairs & Job Cards)</option>
                <option value="ACCOUNTANT">ACCOUNTANT (Purchases, Ledgers, Expenses)</option>
                <option value="MANAGER">MANAGER (Inventory, Stock Adjustments, Reports)</option>
                <option value="ADMIN">ADMIN (Full Access with Overrides)</option>
              </Select>
            </Field>

            <Field label="Salary Calculation Type">
              <Select
                value={form.salaryType}
                onChange={(e) =>
                  setForm({
                    ...form,
                    salaryType: e.target.value as Employee["salaryType"],
                  })
                }
              >
                <option value="MONTHLY">Fixed Monthly</option>
                <option value="DAILY">Daily Wage</option>
                <option value="COMMISSION">Commission Based</option>
                <option value="MIXED">Fixed + Commission</option>
              </Select>
            </Field>

            <Field label="Basic Salary / Rate (₹) *">
              <Input
                type="number"
                required
                value={form.basicSalary}
                onChange={(e) => setForm({ ...form, basicSalary: Number(e.target.value) })}
              />
            </Field>

            <Field label="Date of Joining">
              <Input
                type="date"
                value={form.joiningDate}
                onChange={(e) => setForm({ ...form, joiningDate: e.target.value })}
              />
            </Field>

            <Field label="Bank Account Details">
              <Input
                value={form.bankDetails}
                onChange={(e) => setForm({ ...form, bankDetails: e.target.value })}
                placeholder="e.g. HDFC Bank A/C: 50100..."
              />
            </Field>

            <Field label="Emergency Contact Phone">
              <Input
                value={form.emergencyContact}
                onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })}
                placeholder="e.g. 9876543211 (Brother)"
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Onboard Employee</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
