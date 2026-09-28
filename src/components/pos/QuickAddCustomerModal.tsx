import { useState, useMemo } from "react";
import { Button, Field, Input, Modal } from "../ui";
import { useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";

interface QuickAddCustomerModalProps {
  open: boolean;
  onClose: () => void;
  onSelectCustomer: (customer: Customer) => void;
  initialPhone?: string;
  initialName?: string;
}

export function QuickAddCustomerModal({
  open,
  onClose,
  onSelectCustomer,
  initialPhone = "",
  initialName = "",
}: QuickAddCustomerModalProps) {
  const { db, addCustomer } = useStore();

  const [name, setName] = useState(initialName);
  const [mobile, setMobile] = useState(initialPhone);
  const [address, setAddress] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [city, setCity] = useState("Harda");
  const [pincode, setPincode] = useState("");
  const [ignoreDuplicate, setIgnoreDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Check duplicate mobile in existing customers
  const existingCustomerWithMobile = useMemo(() => {
    const clean = mobile.trim().replace(/\D/g, "");
    if (!clean || clean.length < 10) return null;
    return (
      db.customers.find((c) => {
        const cPhone = (c.phone || "").replace(/\D/g, "");
        const cMobile = (c.mobile || "").replace(/\D/g, "");
        return (cPhone && cPhone.endsWith(clean.slice(-10))) || (cMobile && cMobile.endsWith(clean.slice(-10)));
      }) || null
    );
  }, [mobile, db.customers]);

  const resetForm = () => {
    setName("");
    setMobile("");
    setAddress("");
    setEmail("");
    setGstin("");
    setCity("Harda");
    setPincode("");
    setShowMore(false);
    setIgnoreDuplicate(false);
    setErrorMsg("");
    setSaving(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleCreateCustomer = (autoSelect: boolean) => {
    if (!name.trim()) {
      setErrorMsg("Customer name is required.");
      return;
    }
    const cleanPhone = mobile.trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      setErrorMsg("Valid 10-digit mobile number is required.");
      return;
    }

    if (existingCustomerWithMobile && !ignoreDuplicate) {
      setErrorMsg(`Customer with mobile ${cleanPhone} already exists: ${existingCustomerWithMobile.name}`);
      return;
    }

    setSaving(true);
    setErrorMsg("");

    try {
      const fullAddress = pincode.trim() ? `${address.trim()}${address.trim() ? ", " : ""}PIN: ${pincode.trim()}` : address.trim();

      const payload: Omit<Customer, "id" | "createdAt"> = {
        name: name.trim(),
        phone: cleanPhone,
      };
      if (cleanPhone) payload.mobile = cleanPhone;
      if (fullAddress) payload.address = fullAddress;
      if (city.trim()) payload.city = city.trim();
      if (email.trim()) payload.email = email.trim();
      if (gstin.trim()) payload.gstin = gstin.trim().toUpperCase();

      const created = addCustomer(payload);

      if (autoSelect) {
        onSelectCustomer(created);
      }
      handleClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add Customer" wide={false}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleCreateCustomer(true);
        }}
        className="space-y-4"
      >
        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium animate-in-soft">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* DUPLICATE WARNING BANNER */}
        {existingCustomerWithMobile && !ignoreDuplicate && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] text-amber-900 space-y-2 animate-in-soft">
            <div className="flex items-center gap-1.5 font-bold text-amber-800">
              <span>⚠️</span> Customer already exists with this mobile number:
            </div>
            <div className="flex items-center justify-between font-semibold px-2 py-1.5 rounded-lg bg-amber-100/70">
              <span>{existingCustomerWithMobile.name}</span>
              <span className="font-mono text-amber-950">{existingCustomerWithMobile.phone}</span>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="primary"
                className="text-xs h-7.5 bg-amber-700 hover:bg-amber-800 text-white font-bold"
                onClick={() => {
                  onSelectCustomer(existingCustomerWithMobile);
                  handleClose();
                }}
              >
                ✓ Select Existing Customer
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="text-xs h-7.5 text-amber-800 underline"
                onClick={() => setIgnoreDuplicate(true)}
              >
                Create Anyway
              </Button>
            </div>
          </div>
        )}

        {/* PRIMARY FIELDS */}
        <div className="space-y-3">
          <Field label="Customer Name *">
            <Input
              autoFocus
              placeholder="e.g. Ankit Rathore"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errorMsg) setErrorMsg("");
              }}
              required
              className="h-10 text-[13px] font-medium"
            />
          </Field>

          <Field label="Mobile Number *">
            <Input
              type="tel"
              placeholder="e.g. 9876543210"
              value={mobile}
              onChange={(e) => {
                setMobile(e.target.value);
                setIgnoreDuplicate(false);
                if (errorMsg) setErrorMsg("");
              }}
              required
              className="h-10 text-[13px] font-mono"
            />
          </Field>

          <Field label="Address">
            <Input
              placeholder="e.g. Main Market, Harda"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="h-10 text-[13px]"
            />
          </Field>
        </div>

        {/* PROGRESSIVE DISCLOSURE: MORE DETAILS */}
        <div>
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="text-[12px] font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer py-1"
          >
            <span>{showMore ? "− Hide Additional Details" : "+ More Details (Email, GSTIN, City, Pincode)"}</span>
          </button>

          {showMore && (
            <div className="mt-2.5 p-3 rounded-xl border border-border/80 bg-muted/15 space-y-3 animate-in-soft">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Email">
                  <Input
                    type="email"
                    placeholder="customer@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-8.5 text-[12px]"
                  />
                </Field>

                <Field label="GSTIN (B2B Customer)">
                  <Input
                    placeholder="e.g. 23AAAPL1234A1Z5"
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    className="h-8.5 text-[12px] font-mono uppercase"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="City">
                  <Input
                    placeholder="Harda"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="h-8.5 text-[12px]"
                  />
                </Field>

                <Field label="Pincode">
                  <Input
                    placeholder="461331"
                    value={pincode}
                    onChange={(e) => setPincode(e.target.value)}
                    className="h-8.5 text-[12px] font-mono"
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* MODAL ACTIONS */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <Button type="button" variant="ghost" onClick={handleClose} disabled={saving}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCreateCustomer(false)}
              disabled={saving || !name.trim()}
              className="text-xs h-9"
            >
              Save Customer
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !name.trim()}
              className="text-xs h-9 font-bold px-4"
            >
              {saving ? "Saving..." : "Save & Select"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
