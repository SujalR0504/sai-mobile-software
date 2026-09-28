import { useState, useMemo, useRef, useEffect } from "react";
import { Badge, Button } from "../ui";
import { useStore } from "@/lib/store";
import type { Customer } from "@/lib/types";
import { User, Phone, MapPin, Mail, FileText, Search, UserCheck, AlertCircle } from "lucide-react";

interface NewSaleCustomerModalProps {
  open?: boolean;
  variant?: "modal" | "page";
  onClose?: () => void;
  onContinue: (customer: Customer) => void;
  onSelectWalkIn: () => void;
  currentCustomer?: Customer;
}

export function NewSaleCustomerModal({
  open = true,
  variant = "modal",
  onClose,
  onContinue,
  onSelectWalkIn,
  currentCustomer,
}: NewSaleCustomerModalProps) {
  const { db, addCustomer } = useStore();

  const [mode, setMode] = useState<"new" | "existing">("new");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExistingCustomer, setSelectedExistingCustomer] = useState<Customer | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [gstin, setGstin] = useState("");
  const [allowDuplicate, setAllowDuplicate] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState<{ name?: string; mobile?: string; address?: string }>({});

  const nameInputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Prefill or reset whenever opened or when current customer changes
  useEffect(() => {
    if (open) {
      setErrors({});
      setAllowDuplicate(false);
      if (currentCustomer && currentCustomer.id !== "c0" && currentCustomer.name !== "Walk-in Customer") {
        setName(currentCustomer.name || "");
        setMobile(currentCustomer.phone && currentCustomer.phone !== "—" ? currentCustomer.phone : (currentCustomer.mobile || ""));
        setAddress(currentCustomer.address || "");
        setEmail(currentCustomer.email || "");
        setGstin(currentCustomer.gstin || "");
        setSelectedExistingCustomer(currentCustomer);
      } else {
        setName("");
        setMobile("");
        setAddress("");
        setEmail("");
        setGstin("");
        setSelectedExistingCustomer(null);
        setSearchQuery("");
      }

      // Auto-focus name or search after opening
      setTimeout(() => {
        if (mode === "existing") {
          searchInputRef.current?.focus();
        } else {
          nameInputRef.current?.focus();
        }
      }, 100);
    }
  }, [open, currentCustomer]);

  // Clean mobile number (numbers only)
  const cleanMobile = useMemo(() => {
    return mobile.trim().replace(/\D/g, "");
  }, [mobile]);

  // Duplicate mobile check across existing customers
  const existingDuplicate = useMemo(() => {
    if (cleanMobile.length < 10) return null;
    return (
      db.customers.find((c) => {
        if (c.id === "c0" || c.name === "Walk-in Customer") return false;
        if (selectedExistingCustomer && c.id === selectedExistingCustomer.id) return false;
        const cPhone = (c.phone || "").replace(/\D/g, "");
        const cMobile = (c.mobile || "").replace(/\D/g, "");
        return (cPhone && cPhone.endsWith(cleanMobile.slice(-10))) || (cMobile && cMobile.endsWith(cleanMobile.slice(-10)));
      }) || null
    );
  }, [cleanMobile, db.customers, selectedExistingCustomer]);

  // Search results for Existing Customer tab
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return db.customers.filter((c) => c.id !== "c0").slice(0, 8);
    const cleanQ = q.replace(/\D/g, "");

    return db.customers.filter((c) => {
      if (c.id === "c0" || c.name === "Walk-in Customer") return false;
      const matchName = c.name.toLowerCase().includes(q);
      const cPhone = (c.phone || "").replace(/\D/g, "");
      const cMobile = (c.mobile || "").replace(/\D/g, "");
      const matchPhone =
        (cleanQ && (cPhone.includes(cleanQ) || cMobile.includes(cleanQ))) ||
        (c.phone && c.phone.toLowerCase().includes(q)) ||
        (c.mobile && c.mobile.toLowerCase().includes(q));
      return matchName || matchPhone;
    });
  }, [searchQuery, db.customers]);

  if (variant === "modal" && !open) return null;

  const handleSelectExisting = (cust: Customer) => {
    setSelectedExistingCustomer(cust);
    setName(cust.name || "");
    setMobile(cust.phone && cust.phone !== "—" ? cust.phone : (cust.mobile || ""));
    setAddress(cust.address || "");
    setEmail(cust.email || "");
    setGstin(cust.gstin || "");
    setErrors({});
    setAllowDuplicate(false);
  };

  const handleContinue = () => {
    const errs: { name?: string; mobile?: string; address?: string } = {};

    if (!name.trim()) {
      errs.name = "Customer Name is required.";
    }

    const clean = mobile.trim().replace(/\D/g, "");
    if (!clean || clean.length < 10) {
      errs.mobile = "10-digit mobile number is required.";
    }

    if (!address.trim()) {
      errs.address = "Address is required for billing.";
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    // Duplicate check warning block
    if (existingDuplicate && !allowDuplicate && !selectedExistingCustomer) {
      return;
    }

    // If an existing customer was selected and details not altered to a new identity
    if (selectedExistingCustomer) {
      onContinue(selectedExistingCustomer);
      return;
    }

    // If matching customer exists with same mobile, reuse them unless explicitly requested
    if (existingDuplicate && !allowDuplicate) {
      onContinue(existingDuplicate);
      return;
    }

    // Create new customer
    const phoneVal = cleanMobile;
    const payload: Omit<Customer, "id" | "createdAt"> = {
      name: name.trim(),
      phone: phoneVal,
    };
    if (phoneVal) payload.mobile = phoneVal;
    if (address.trim()) payload.address = address.trim();
    if (email.trim()) payload.email = email.trim();
    if (gstin.trim()) payload.gstin = gstin.trim().toUpperCase();

    const created = addCustomer(payload);
    onContinue(created);
  };

  const handleWalkIn = () => {
    onSelectWalkIn();
  };

  const cardContent = (
    <div
      className="w-full max-w-xl rounded-3xl bg-white shadow-2xl border border-border/80 overflow-hidden flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* HEADER */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 py-4.5 border-b border-border/80 text-center sm:text-left">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <span className="inline-flex items-center justify-center size-7 rounded-xl bg-primary text-white text-[12px] font-black tracking-wider shadow-xs">
                POS
              </span>
              <h2 className="text-xl font-black tracking-tight text-foreground">NEW SALE</h2>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 font-medium">Customer Details · Complete in 30-60 Seconds</p>
          </div>

          {/* Quick Walk-in shortcut at top right */}
          <button
            type="button"
            onClick={handleWalkIn}
            className="self-center sm:self-auto text-xs font-bold px-3 py-1.5 rounded-xl bg-muted/80 hover:bg-muted text-foreground border border-border/80 cursor-pointer transition-all flex items-center gap-1.5 shadow-xs"
          >
            <span>🚶</span> Walk-in Customer
          </button>
        </div>

        {/* MODE TABS: New Customer vs Existing Customer */}
        <div className="flex gap-2 mt-3.5">
          <button
            type="button"
            onClick={() => {
              setMode("new");
              setTimeout(() => nameInputRef.current?.focus(), 50);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
              mode === "new"
                ? "bg-white text-primary border-primary/30 shadow-xs"
                : "bg-muted/40 text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <User className="size-3.5" />
            <span>+ New Customer</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("existing");
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 border ${
              mode === "existing"
                ? "bg-white text-primary border-primary/30 shadow-xs"
                : "bg-muted/40 text-muted-foreground border-transparent hover:text-foreground"
            }`}
          >
            <Search className="size-3.5" />
            <span>Search Existing Customer</span>
          </button>
        </div>
      </div>

      {/* MODAL BODY */}
      <div className="p-6 overflow-y-auto space-y-4 max-h-[60vh]">
        {/* SEARCH EXISTING CUSTOMER TAB */}
        {mode === "existing" && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search customer by Name or 10-digit Mobile Number…"
                className="w-full h-11 pl-9 pr-3 rounded-xl border border-border bg-muted/20 text-sm font-medium focus:bg-white focus:border-primary focus:outline-none transition-all"
              />
            </div>

            {selectedExistingCustomer && (
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="size-5 text-emerald-600" />
                  <div>
                    <div className="text-xs font-bold text-emerald-950">{selectedExistingCustomer.name}</div>
                    <div className="text-[11px] font-mono text-emerald-800">
                      {selectedExistingCustomer.phone || selectedExistingCustomer.mobile || ""} · {selectedExistingCustomer.address || "No address"}
                    </div>
                  </div>
                </div>
                <Badge tone="success" className="text-[10px]">Selected</Badge>
              </div>
            )}

            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
              {searchResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    handleSelectExisting(c);
                    setMode("new"); // Switch to form so user sees loaded details and can hit continue
                  }}
                  className={`w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedExistingCustomer?.id === c.id
                      ? "bg-primary/10 border-primary/40 shadow-xs"
                      : "bg-white hover:bg-muted/40 border-border/70"
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-foreground">{c.name}</div>
                    <div className="text-[11px] font-mono text-muted-foreground">
                      {c.phone || c.mobile || "—"} {c.address ? `· ${c.address}` : ""}
                    </div>
                  </div>
                  <span className="text-[11px] font-bold text-primary">Select →</span>
                </button>
              ))}

              {searchResults.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground">
                  No customer found matching "{searchQuery}".
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setMode("new");
                        if (/^\d+$/.test(searchQuery)) setMobile(searchQuery);
                        else setName(searchQuery);
                      }}
                      className="text-xs"
                    >
                      + Create Customer with this info
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* NEW / EDIT CUSTOMER FORM */}
        {mode === "new" && (
          <div className="space-y-3.5">
            {selectedExistingCustomer && (
              <div className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-primary/10 border border-primary/20 text-xs">
                <span className="font-semibold text-primary">
                  ✓ Existing Customer: <b>{selectedExistingCustomer.name}</b>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedExistingCustomer(null);
                    setName("");
                    setMobile("");
                    setAddress("");
                  }}
                  className="text-[11px] text-muted-foreground hover:text-destructive underline cursor-pointer"
                >
                  Clear & New
                </button>
              </div>
            )}

            {/* Customer Name * */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Customer Name <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <User className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  ref={nameInputRef}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="e.g. Ankit Rathore"
                  className={`w-full h-11 pl-9 pr-3 rounded-xl border text-sm font-semibold focus:outline-none transition-all ${
                    errors.name
                      ? "border-destructive bg-destructive/5 text-destructive focus:border-destructive"
                      : "border-border bg-white focus:border-primary focus:ring-1 focus:ring-primary/20"
                  }`}
                />
              </div>
              {errors.name && <p className="mt-1 text-[11px] text-destructive font-medium">{errors.name}</p>}
            </div>

            {/* Mobile Number * */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Mobile Number <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-3.5 size-4 text-muted-foreground" />
                <input
                  type="tel"
                  maxLength={13}
                  value={mobile}
                  onChange={(e) => {
                    setMobile(e.target.value);
                    setAllowDuplicate(false);
                    if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: undefined }));
                  }}
                  placeholder="e.g. 9876543210"
                  className={`w-full h-11 pl-9 pr-3 rounded-xl border text-sm font-mono font-semibold focus:outline-none transition-all ${
                    errors.mobile
                      ? "border-destructive bg-destructive/5 text-destructive focus:border-destructive"
                      : "border-border bg-white focus:border-primary focus:ring-1 focus:ring-primary/20"
                  }`}
                />
              </div>
              {errors.mobile && <p className="mt-1 text-[11px] text-destructive font-medium">{errors.mobile}</p>}
            </div>

            {/* DUPLICATE MOBILE CHECK ALERT */}
            {existingDuplicate && !allowDuplicate && (
              <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs space-y-2">
                <div className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertCircle className="size-4 text-amber-600 shrink-0" />
                  <span>Customer already exists with this mobile number:</span>
                </div>
                <div className="bg-white/80 rounded-xl p-2.5 border border-amber-300/50 space-y-0.5">
                  <div className="font-bold text-foreground text-xs">{existingDuplicate.name}</div>
                  <div className="text-[11px] font-mono text-muted-foreground">
                    Mobile: {existingDuplicate.phone || existingDuplicate.mobile}
                  </div>
                  {existingDuplicate.address && (
                    <div className="text-[11px] text-muted-foreground">Address: {existingDuplicate.address}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => {
                      handleSelectExisting(existingDuplicate);
                      onContinue(existingDuplicate);
                    }}
                    className="h-8 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex-1"
                  >
                    ✓ Select Existing Customer
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setAllowDuplicate(true)}
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Create New Anyway
                  </Button>
                </div>
              </div>
            )}

            {/* Address * */}
            <div>
              <label className="block text-xs font-bold text-foreground mb-1">
                Address <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
                  }}
                  placeholder="Shop # / Colony / Street / City"
                  className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs focus:outline-none transition-all ${
                    errors.address
                      ? "border-destructive bg-destructive/5 text-destructive focus:border-destructive"
                      : "border-border bg-white focus:border-primary focus:ring-1 focus:ring-primary/20"
                  }`}
                />
              </div>
              {errors.address && <p className="mt-1 text-[11px] text-destructive font-medium">{errors.address}</p>}
            </div>

            {/* Optional Fields: Email & GSTIN */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  Email (Optional)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 size-3.5 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@email.com"
                    className="w-full h-9 pl-8.5 pr-2.5 rounded-xl border border-border bg-white text-xs focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                  GSTIN (Optional)
                </label>
                <div className="relative">
                  <FileText className="absolute left-3 top-3 size-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    maxLength={15}
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 23AAAAA0000A1Z5"
                    className="w-full h-9 pl-8.5 pr-2.5 rounded-xl border border-border bg-white text-xs font-mono uppercase focus:border-primary focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ACTIONS BAR */}
      <div className="bg-muted/30 px-6 py-4 border-t border-border/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          type="button"
          onClick={handleWalkIn}
          className="w-full sm:w-auto h-11 px-4 rounded-xl text-xs font-bold bg-white hover:bg-muted text-foreground border border-border/80 shadow-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
        >
          <span>🚶</span> WALK-IN CUSTOMER
        </button>

        <div className="w-full sm:w-auto flex items-center gap-2">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none h-11 px-4 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-all"
            >
              CANCEL
            </button>
          )}

          <button
            type="button"
            onClick={handleContinue}
            className="flex-1 sm:flex-none h-11 px-6 rounded-xl text-xs font-black bg-primary hover:bg-primary/90 text-primary-foreground shadow-md cursor-pointer transition-all flex items-center justify-center gap-2 tracking-wide"
          >
            <span>CONTINUE</span>
            <span>→</span>
          </button>
        </div>
      </div>
    </div>
  );

  if (variant === "page") {
    return (
      <div className="flex items-center justify-center py-6 px-3 sm:px-4 animate-in fade-in duration-150">
        {cardContent}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      {cardContent}
    </div>
  );
}
