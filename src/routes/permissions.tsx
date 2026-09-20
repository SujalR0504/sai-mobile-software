import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Field,
  Input,
  PageHead,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import {
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type Employee,
  type EmployeePermissionEntry,
  type PermissionAction,
  type PermissionModule,
} from "@/lib/types";

export const Route = createFileRoute("/permissions")({
  head: () => ({
    meta: [{ title: "Employee Permissions Matrix — Mobile Store ERP" }],
  }),
  component: PermissionsPage,
});

// Human-friendly labels for 21 modules
const MODULE_LABELS: Record<PermissionModule, { label: string; group: string }> = {
  Dashboard: { label: "Dashboard", group: "Overview" },
  POS: { label: "POS Billing", group: "Sales" },
  Sales: { label: "Sales & Invoices", group: "Sales" },
  Purchases: { label: "Purchases & Inward", group: "Purchases" },
  "Sale Returns": { label: "Sale Returns", group: "Sales" },
  "Purchase Returns": { label: "Purchase Returns", group: "Purchases" },
  Products: { label: "Products Catalog", group: "Inventory" },
  Stock: { label: "Stock & Inventory", group: "Inventory" },
  IMEI: { label: "IMEI & Serial Numbers", group: "Inventory" },
  Customers: { label: "Customers Master", group: "CRM" },
  Dealers: { label: "Dealers Master & Ledger", group: "CRM" },
  Repairs: { label: "Service & Repairs", group: "Service" },
  Payments: { label: "Payments (In / Out)", group: "Finance" },
  "EMI Receivables": { label: "EMI Receivables", group: "Finance" },
  Expenses: { label: "Daily Expenses", group: "Finance" },
  Cashbook: { label: "Cashbook & Drawer", group: "Finance" },
  Reports: { label: "Business Reports", group: "Reports" },
  Employees: { label: "Staff & Employees", group: "HR" },
  Attendance: { label: "Attendance & Geo-Fence", group: "HR" },
  Payroll: { label: "Payroll Processing", group: "HR" },
  Orders: { label: "Customer Orders", group: "Sales" },
  Settings: { label: "System Settings", group: "Admin" },
};

// Standard action labels
const ACTION_LABELS: Record<PermissionAction, string> = {
  VIEW: "View",
  CREATE: "Create",
  EDIT: "Edit",
  DELETE: "Delete",
  APPROVE: "Approve",
  PRINT: "Print",
  EXPORT: "Export",
  CANCEL: "Cancel",
  REFUND: "Refund",
  ADJUST: "Adjust",
  VIEW_COST: "View Cost",
  VIEW_PROFIT: "View Profit",
  RECEIVE_PAYMENT: "Receive Pmt",
  AUTHORIZE: "Authorize",
};

function PermissionsPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmpId, setSelectedEmpId] = useState<string>("");
  const [matrix, setMatrix] = useState<Map<string, boolean>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [searchModule, setSearchModule] = useState("");
  const [filterGroup, setFilterGroup] = useState("ALL");
  const [copyRoleSelected, setCopyRoleSelected] = useState("sales");
  const [copyEmpSelected, setCopyEmpSelected] = useState("");

  // Load Employees
  useEffect(() => {
    fetch("/api/employees")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setEmployees(data);
          setSelectedEmpId(data[0].id);
        } else {
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load employees:", err);
        setLoading(false);
      });
  }, []);

  // Load Permissions for selected employee
  const loadPermissions = async (empId: string) => {
    if (!empId) return;
    try {
      setLoading(true);
      setSaveSuccess(false);
      setHasUnsavedChanges(false);
      const res = await fetch(`/api/permissions/employee/${empId}`);
      const data: EmployeePermissionEntry[] = await res.json();
      const map = new Map<string, boolean>();
      for (const entry of data) {
        map.set(`${entry.module}:${entry.action}`, entry.allowed);
      }
      setMatrix(map);
    } catch (err) {
      console.error("Failed to load permissions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedEmpId) {
      loadPermissions(selectedEmpId);
    }
  }, [selectedEmpId]);

  const selectedEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedEmpId);
  }, [employees, selectedEmpId]);

  // Toggle single cell
  const togglePermission = (mod: PermissionModule, act: PermissionAction) => {
    const key = `${mod}:${act}`;
    const next = new Map(matrix);
    next.set(key, !next.get(key));
    setMatrix(next);
    setSaveSuccess(false);
    setHasUnsavedChanges(true);
  };

  // Row Bulk: Grant / Revoke all actions for a module
  const toggleRow = (mod: PermissionModule, grant: boolean) => {
    const next = new Map(matrix);
    for (const act of PERMISSION_ACTIONS) {
      next.set(`${mod}:${act}`, grant);
    }
    setMatrix(next);
    setSaveSuccess(false);
    setHasUnsavedChanges(true);
  };

  // Column Bulk: Grant / Revoke an action across all modules
  const toggleColumn = (act: PermissionAction, grant: boolean) => {
    const next = new Map(matrix);
    for (const mod of PERMISSION_MODULES) {
      next.set(`${mod}:${act}`, grant);
    }
    setMatrix(next);
    setSaveSuccess(false);
    setHasUnsavedChanges(true);
  };

  // Grant All
  const grantAll = () => {
    const next = new Map(matrix);
    for (const mod of PERMISSION_MODULES) {
      for (const act of PERMISSION_ACTIONS) {
        next.set(`${mod}:${act}`, true);
      }
    }
    setMatrix(next);
    setSaveSuccess(false);
    setHasUnsavedChanges(true);
  };

  // Revoke All
  const revokeAll = () => {
    const next = new Map(matrix);
    for (const mod of PERMISSION_MODULES) {
      for (const act of PERMISSION_ACTIONS) {
        next.set(`${mod}:${act}`, false);
      }
    }
    setMatrix(next);
    setSaveSuccess(false);
    setHasUnsavedChanges(true);
  };

  // Copy From Role
  const handleCopyFromRole = async (role: string) => {
    if (!selectedEmpId) return;
    try {
      setLoading(true);
      await fetch(`/api/permissions/employee/${selectedEmpId}/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      await loadPermissions(selectedEmpId);
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
    } catch {
      alert("Failed to copy permissions from role");
    } finally {
      setLoading(false);
    }
  };

  // Copy From Employee
  const handleCopyFromEmployee = async (sourceEmpId: string) => {
    if (!selectedEmpId || !sourceEmpId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/permissions/employee/${sourceEmpId}`);
      const data: EmployeePermissionEntry[] = await res.json();
      const map = new Map<string, boolean>();
      for (const entry of data) {
        map.set(`${entry.module}:${entry.action}`, entry.allowed);
      }
      setMatrix(map);
      setHasUnsavedChanges(true);
      setSaveSuccess(false);
    } catch {
      alert("Failed to copy permissions from employee");
    } finally {
      setLoading(false);
    }
  };

  // Reset to Role Defaults
  const resetToRoleDefaults = async () => {
    if (!selectedEmployee) return;
    await handleCopyFromRole(selectedEmployee.role);
  };

  // Save Permissions Matrix to DB
  const saveMatrix = async () => {
    if (!selectedEmpId) return;
    try {
      setSaving(true);
      const permissions: { module: PermissionModule; action: PermissionAction; allowed: boolean }[] = [];
      for (const mod of PERMISSION_MODULES) {
        for (const act of PERMISSION_ACTIONS) {
          permissions.push({
            module: mod,
            action: act,
            allowed: Boolean(matrix.get(`${mod}:${act}`)),
          });
        }
      }

      const res = await fetch(`/api/permissions/employee/${selectedEmpId}/bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });

      if (!res.ok) throw new Error("Failed to update permissions in database");
      
      // Refresh permissions from database after save
      await loadPermissions(selectedEmpId);
      setSaveSuccess(true);
      setHasUnsavedChanges(false);
    } catch (err: any) {
      alert(err.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  // Filter modules
  const filteredModules = useMemo(() => {
    return PERMISSION_MODULES.filter((mod) => {
      const meta = MODULE_LABELS[mod] || { label: mod, group: "General" };
      if (filterGroup !== "ALL" && meta.group !== filterGroup) return false;
      if (searchModule.trim()) {
        const q = searchModule.toLowerCase();
        if (!meta.label.toLowerCase().includes(q) && !mod.toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [searchModule, filterGroup]);

  // Permission Stats
  const stats = useMemo(() => {
    let allowedCount = 0;
    const total = PERMISSION_MODULES.length * PERMISSION_ACTIONS.length;
    for (const val of matrix.values()) {
      if (val) allowedCount++;
    }
    return {
      allowedCount,
      total,
      percentage: total > 0 ? Math.round((allowedCount / total) * 100) : 0,
    };
  }, [matrix]);

  const groups = ["ALL", "Overview", "Sales", "Inventory", "Purchases", "CRM", "Service", "Finance", "HR", "Reports", "Admin"];

  return (
    <div className="space-y-5 p-4 md:p-6">
      <PageHead
        title="Employee Access Control & Security Matrix"
        description="Configure granular role-based permissions across 21 ERP modules and 14 operations."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={resetToRoleDefaults} disabled={loading || !selectedEmployee}>
              Reset to Role Defaults
            </Button>
            <Button variant="default" onClick={saveMatrix} disabled={saving || loading}>
              {saving ? "Saving Matrix..." : saveSuccess ? "✓ Changes Saved" : "Save Matrix"}
            </Button>
          </div>
        }
      />

      {/* Staff Selector & Role Card */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <div className="p-4 space-y-3">
            <Field label="Select Employee / Staff Member">
              <Select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value)}
              >
                {employees.length === 0 ? (
                  <option value="">No employees found</option>
                ) : (
                  employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} — {emp.designation || emp.role.toUpperCase()}
                    </option>
                  ))
                )}
              </Select>
            </Field>

            {selectedEmployee ? (
              <div className="rounded-lg border border-border bg-foreground/2 p-3 text-[13px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground">{selectedEmployee.name}</span>
                  <Badge variant="default">{selectedEmployee.role.toUpperCase()}</Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Phone: {selectedEmployee.phone} · Branch: Store 01
                </div>
              </div>
            ) : null}
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Stat
            label="Granted Permissions"
            value={`${stats.allowedCount} / ${stats.total}`}
            hint={`${stats.percentage}% of all operations granted`}
            tone={stats.percentage > 70 ? "warn" : "good"}
          />
          <Stat
            label="Security Level"
            value={
              selectedEmployee?.role === "admin"
                ? "Full Admin"
                : stats.percentage > 50
                ? "Elevated Staff"
                : "Restricted Staff"
            }
            hint={`Preset: ${selectedEmployee?.role?.toUpperCase() || "CUSTOM"}`}
          />
        </div>
      </div>

      {/* Unsaved Changes Banner */}
      {hasUnsavedChanges ? (
        <div className="flex items-center justify-between rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-[12.5px] font-medium text-amber-900 shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>You have unsaved permission modifications. Click <strong>Save Matrix</strong> to persist them to the database.</span>
          </div>
          <Button size="sm" variant="primary" onClick={saveMatrix} disabled={saving}>
            {saving ? "Saving..." : "Save Now"}
          </Button>
        </div>
      ) : saveSuccess ? (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-[12px] font-medium text-emerald-900 shadow-sm">
          <span>✓</span>
          <span>Permissions successfully saved and refreshed from the database.</span>
        </div>
      ) : null}

      {/* Bulk Quick Actions, Copy Controls & Module Filter */}
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-border">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
              Bulk:
            </span>
            <Button size="sm" variant="outline" onClick={grantAll}>
              Allow All
            </Button>
            <Button size="sm" variant="outline" onClick={revokeAll}>
              Remove All
            </Button>

            <span className="mx-1 text-border">|</span>

            {/* Copy From Role */}
            <div className="flex items-center gap-1">
              <Select
                value={copyRoleSelected}
                onChange={(e) => setCopyRoleSelected(e.target.value)}
                className="h-8 text-[11px] w-28"
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="sales">Sales</option>
                <option value="cashier">Cashier</option>
                <option value="technician">Technician</option>
                <option value="accountant">Accountant</option>
              </Select>
              <Button size="sm" variant="ghost" onClick={() => handleCopyFromRole(copyRoleSelected)}>
                Copy Role
              </Button>
            </div>

            <span className="mx-1 text-border">|</span>

            {/* Copy From Employee */}
            <div className="flex items-center gap-1">
              <Select
                value={copyEmpSelected}
                onChange={(e) => setCopyEmpSelected(e.target.value)}
                className="h-8 text-[11px] w-36"
              >
                <option value="">Select Staff</option>
                {employees
                  .filter((e) => e.id !== selectedEmpId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </Select>
              <Button
                size="sm"
                variant="ghost"
                disabled={!copyEmpSelected}
                onClick={() => handleCopyFromEmployee(copyEmpSelected)}
              >
                Copy Staff
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Input
                value={searchModule}
                onChange={(e) => setSearchModule(e.target.value)}
                placeholder="Search modules..."
                className="h-8 text-[12px]"
              />
            </div>

            <div className="w-36">
              <Select
                value={filterGroup}
                onChange={(e) => setFilterGroup(e.target.value)}
                className="h-8 text-[12px]"
              >
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        {/* Matrix Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12px] border-collapse">
            <thead>
              <tr className="border-b border-border bg-foreground/3">
                <th className="sticky left-0 z-10 bg-background/95 backdrop-blur px-3 py-2.5 font-bold text-foreground min-w-[200px]">
                  Module Name ({filteredModules.length})
                </th>
                <th className="px-2 py-2 font-bold text-center text-muted-foreground min-w-[70px]">
                  Quick
                </th>
                {PERMISSION_ACTIONS.map((act) => (
                  <th
                    key={act}
                    className="px-2 py-2 font-bold text-center text-foreground whitespace-nowrap min-w-[75px]"
                  >
                    <div className="leading-tight">
                      <div>{ACTION_LABELS[act]}</div>
                      <div className="mt-1 flex items-center justify-center gap-1 font-normal text-[10px]">
                        <button
                          type="button"
                          className="text-primary hover:underline"
                          title={`Grant ${ACTION_LABELS[act]} to all`}
                          onClick={() => toggleColumn(act, true)}
                        >
                          +
                        </button>
                        <span>·</span>
                        <button
                          type="button"
                          className="text-danger hover:underline"
                          title={`Revoke ${ACTION_LABELS[act]} from all`}
                          onClick={() => toggleColumn(act, false)}
                        >
                          -
                        </button>
                      </div>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredModules.map((mod) => {
                const meta = MODULE_LABELS[mod] || { label: mod, group: "General" };
                const allRowAllowed = PERMISSION_ACTIONS.every((a) =>
                  matrix.get(`${mod}:${a}`)
                );
                return (
                  <tr
                    key={mod}
                    className="border-b border-border hover:bg-foreground/2 transition-colors"
                  >
                    <td className="sticky left-0 z-10 bg-background/95 backdrop-blur px-3 py-2 font-medium text-foreground">
                      <div className="font-semibold">{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {meta.group} · <span className="font-mono">{mod}</span>
                      </div>
                    </td>

                    <td className="px-2 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => toggleRow(mod, !allRowAllowed)}
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                          allRowAllowed
                            ? "border-success/30 bg-success/10 text-success"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                        title="Toggle all actions for this module"
                      >
                        {allRowAllowed ? "ALL" : "SET"}
                      </button>
                    </td>

                    {PERMISSION_ACTIONS.map((act) => {
                      const allowed = Boolean(matrix.get(`${mod}:${act}`));
                      return (
                        <td key={act} className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={allowed}
                            onChange={() => togglePermission(mod, act)}
                            className="size-4 cursor-pointer rounded border-border text-primary focus:ring-primary/20 accent-primary"
                          />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
