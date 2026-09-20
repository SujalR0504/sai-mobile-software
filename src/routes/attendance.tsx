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
import { AdminPinModal } from "@/components/AdminPinModal";
import { useStore } from "@/lib/store";
import { todayISO } from "@/lib/format";

export const Route = createFileRoute("/attendance")({
  head: () => ({
    meta: [{ title: "Attendance & Geo-Tracking — Mobile Store ERP" }],
  }),
  component: AttendancePage,
});

function AttendancePage() {
  const { db, refreshFromBackend } = useStore();
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [checkInModalOpen, setCheckInModalOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(db.employees?.[0]?.id || "");
  const [statusMsg, setStatusMsg] = useState("");
  const [geoCoords, setGeoCoords] = useState<{ lat: number; lon: number; acc: number } | null>(null);
  const [geoError, setGeoError] = useState("");
  const [adminPinModalOpen, setAdminPinModalOpen] = useState(false);
  const [pendingOverrideInput, setPendingOverrideInput] = useState<any>(null);

  const activeEmployees = useMemo(
    () => (db.employees || []).filter((e) => e.status === "ACTIVE"),
    [db.employees],
  );

  const attendanceRecords = useMemo(() => {
    return (db.attendance || []).filter((a) => a.date === selectedDate);
  }, [db.attendance, selectedDate]);

  const presentCount = attendanceRecords.filter((a) => a.status === "PRESENT" || a.status === "LATE").length;
  const absentCount = Math.max(0, activeEmployees.length - presentCount);

  const requestLocation = () => {
    setGeoError("");
    setStatusMsg("Requesting GPS coordinates...");
    if (!navigator.geolocation) {
      setGeoError("Geolocation is not supported by your device or browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy),
        });
        setStatusMsg(`✓ GPS Acquired: ${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)} (±${Math.round(pos.coords.accuracy)}m)`);
      },
      (err) => {
        setGeoError(`Location access denied or unavailable (${err.message}). Admin override required.`);
        setStatusMsg("");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleOpenCheckIn = (empId?: string) => {
    if (empId) setSelectedEmployeeId(empId);
    setCheckInModalOpen(true);
    requestLocation();
  };

  const handlePerformCheckIn = async (override = false) => {
    try {
      const payload = {
        employeeId: selectedEmployeeId,
        latitude: geoCoords?.lat ?? 28.5355,
        longitude: geoCoords?.lon ?? 77.3910,
        accuracy: geoCoords?.acc ?? 10,
        deviceInformation: navigator.userAgent.slice(0, 80),
        adminOverride: override,
      };

      const res = await fetch("/api/attendance/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error && data.error.includes("Admin authorization override required")) {
          setPendingOverrideInput(payload);
          setAdminPinModalOpen(true);
          return;
        }
        alert(data.error || "Check-in failed");
        return;
      }

      await refreshFromBackend();
      setCheckInModalOpen(false);
    } catch {
      alert("Network error during check-in");
    }
  };

  const handlePerformCheckOut = async (employeeId: string) => {
    try {
      const res = await fetch("/api/attendance/check-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId }),
      });
      if (res.ok) {
        await refreshFromBackend();
      }
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-4 p-4 md:p-6">
      <PageHead
        title="Attendance & Geo-Tracking"
        sub="Monitor employee daily check-ins, store radius verification, and shifts."
        actions={
          <Button onClick={() => handleOpenCheckIn()}>+ Mark Check-In</Button>
        }
      />

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Present Today" value={String(presentCount)} tone="success" />
        <Stat label="Absent / Pending" value={String(absentCount)} tone={absentCount > 0 ? "warning" : "neutral"} />
        <Stat label="Store Radius Threshold" value={`${db.settings.allowedRadiusMeters || 200}m`} />
        <Stat label="Active Roster" value={`${activeEmployees.length} staff`} />
      </section>

      <Card>
        <CardHead
          title="Daily Roster"
          sub={`Date: ${selectedDate}`}
          right={
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="w-40 text-[12px]"
              />
            </div>
          }
        />

        <Table head={["Employee", "Department", "Check-In", "Check-Out", "Location Radius", "Status", "Actions"]}>
          {activeEmployees.map((emp) => {
            const att = attendanceRecords.find((a) => a.employeeId === emp.id);
            const isPresent = Boolean(att);

            return (
              <Row key={emp.id}>
                <Td>
                  <div className="font-semibold">{emp.fullName}</div>
                  <div className="text-[11px] text-muted-foreground">{emp.employeeId} · {emp.designation}</div>
                </Td>
                <Td>{emp.department}</Td>
                <Td mono>
                  {att?.checkInTime ? (
                    <span className="font-semibold text-success">{att.checkInTime}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td mono>
                  {att?.checkOutTime ? (
                    <span className="font-semibold text-primary">{att.checkOutTime}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </Td>
                <Td>
                  {att ? (
                    att.isWithinRadius ? (
                      <Badge tone="success">Within Store ({att.distanceFromShop ?? 0}m)</Badge>
                    ) : (
                      <Badge tone="danger">
                        Outside ({att.distanceFromShop ?? 0}m){att.adminOverride ? " [Override]" : ""}
                      </Badge>
                    )
                  ) : (
                    <span className="text-muted-foreground text-[11px]">Not Checked In</span>
                  )}
                </Td>
                <Td>
                  {att ? (
                    <Badge tone="success">{att.status}</Badge>
                  ) : (
                    <Badge tone="warning">ABSENT</Badge>
                  )}
                </Td>
                <Td>
                  {!isPresent ? (
                    <Button size="sm" variant="primary" onClick={() => handleOpenCheckIn(emp.id)}>
                      Check-In
                    </Button>
                  ) : !att?.checkOutTime ? (
                    <Button size="sm" variant="ghost" onClick={() => handlePerformCheckOut(emp.id)}>
                      Check-Out
                    </Button>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">Shift Ended</span>
                  )}
                </Td>
              </Row>
            );
          })}
        </Table>
      </Card>

      {/* Check-In Modal with Geolocation */}
      <Modal
        open={checkInModalOpen}
        onClose={() => setCheckInModalOpen(false)}
        title="Employee Geo Check-In"
      >
        <div className="space-y-4">
          <Field label="Select Employee *">
            <Select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
            >
              {activeEmployees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeId} - {e.department})
                </option>
              ))}
            </Select>
          </Field>

          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20">
            <div className="flex items-center justify-between text-[12px]">
              <span className="font-semibold">Shop Geolocation Verification</span>
              <Button size="sm" variant="ghost" onClick={requestLocation}>
                ↻ Refresh GPS
              </Button>
            </div>

            {statusMsg && (
              <div className="text-[12px] text-primary font-mono">{statusMsg}</div>
            )}

            {geoError && (
              <div className="text-[12px] text-destructive font-medium">{geoError}</div>
            )}

            <div className="text-[11px] text-muted-foreground">
              Configured Store Location: 28.5355° N, 77.3910° E (Max Radius: {db.settings.allowedRadiusMeters || 200}m)
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="ghost" onClick={() => setCheckInModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => handlePerformCheckIn(false)}>
              Confirm Check-In
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin PIN Override Modal for Outside-Radius */}
      <AdminPinModal
        open={adminPinModalOpen}
        onClose={() => setAdminPinModalOpen(false)}
        action="ATTENDANCE_LOCATION_OVERRIDE"
        reasonPrompt="Reason for outside-radius attendance override *"
        onAuthorized={() => {
          handlePerformCheckIn(true);
        }}
      />
    </div>
  );
}
