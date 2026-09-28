import { useState, useMemo, useRef, useEffect } from "react";
import { Badge, Button, Input } from "../ui";
import { inr } from "@/lib/format";
import { generateDueWhatsAppMessage, generateConsolidatedDueWhatsAppMessage, openWhatsAppChat } from "@/lib/whatsapp";
import { todayISO } from "@/lib/format";
import type { Customer, Sale } from "@/lib/types";
import { QuickCollectDueModal } from "./QuickCollectDueModal";

interface PosCustomerCardProps {
  selectedCustomer: Customer | undefined;
  allCustomers: Customer[];
  allSales: Sale[];
  onSelectCustomer: (customer: Customer) => void;
  onOpenNewCustomerModal: (prefill?: { name?: string; phone?: string }) => void;
  onEditCustomer?: (customer: Customer) => void;
  isFastBillMode?: boolean;
}

export function PosCustomerCard({
  selectedCustomer,
  allCustomers,
  allSales,
  onSelectCustomer,
  onOpenNewCustomerModal,
  onEditCustomer,
  isFastBillMode = false,
}: PosCustomerCardProps) {
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [collectDueOpen, setCollectDueOpen] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Compute outstanding due for the selected customer
  const customerDue = useMemo(() => {
    if (!selectedCustomer || selectedCustomer.id === "c0" || selectedCustomer.name === "Walk-in Customer") {
      return 0;
    }
    const customerSales = allSales.filter((s) => s.customerId === selectedCustomer.id && !s.quotation);
    return customerSales.reduce((acc, s) => {
      const due = s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid);
      return acc + due;
    }, 0);
  }, [selectedCustomer, allSales]);

  // Filter customers by name or mobile
  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allCustomers.slice(0, 10);

    const cleanQ = q.replace(/\D/g, "");
    return allCustomers.filter((c) => {
      const matchName = c.name.toLowerCase().includes(q);
      const cPhone = (c.phone || "").replace(/\D/g, "");
      const cMobile = (c.mobile || "").replace(/\D/g, "");
      const matchPhone =
        (cleanQ && (cPhone.includes(cleanQ) || cMobile.includes(cleanQ))) ||
        c.phone.toLowerCase().includes(q) ||
        (c.mobile && c.mobile.toLowerCase().includes(q));

      return matchName || matchPhone;
    });
  }, [allCustomers, searchQuery]);

  // Handle WhatsApp due reminder
  const handleSendWhatsAppDue = () => {
    if (!selectedCustomer || customerDue <= 0) return;
    const phone = selectedCustomer.phone || selectedCustomer.mobile;
    if (!phone || phone === "—" || phone === "0000000000") {
      alert("Customer does not have a valid mobile number for WhatsApp.");
      return;
    }

    const customerSales = allSales.filter((s) => s.customerId === selectedCustomer.id && !s.quotation);
    const unpaidSales = customerSales.filter(
      (s) => (s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid)) > 0
    );

    let message = "";
    if (unpaidSales.length <= 1) {
      const inv = unpaidSales[0] || customerSales[customerSales.length - 1];
      message = generateDueWhatsAppMessage({
        customerName: selectedCustomer.name,
        customerPhone: phone,
        invoiceNo: inv ? inv.invoiceNo : "OUTSTANDING",
        invoiceDate: inv ? inv.date : todayISO(),
        totalAmount: inv ? inv.total : customerDue,
        paidAmount: inv ? inv.paid : 0,
        dueAmount: customerDue,
      });
    } else {
      message = generateConsolidatedDueWhatsAppMessage({
        customerName: selectedCustomer.name,
        customerPhone: phone,
        totalDue: customerDue,
        invoices: unpaidSales.map((s) => ({
          invoiceNo: s.invoiceNo,
          date: s.date,
          total: s.total,
          due: s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid),
        })),
      });
    }

    openWhatsAppChat(phone, message, {
      party: "customer",
      partyId: selectedCustomer.id,
      amount: customerDue,
    });
  };

  const walkInCustomer = useMemo(() => {
    return allCustomers.find((c) => c.id === "c0" || c.name.toLowerCase().includes("walk-in")) || allCustomers[0];
  }, [allCustomers]);

  const isWalkIn = !selectedCustomer || selectedCustomer.id === "c0" || selectedCustomer.name.toLowerCase().includes("walk-in");

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const openSearchMode = () => {
    setIsSearching(true);
    setSearchQuery("");
    setDropdownOpen(true);
    setTimeout(() => {
      searchInputRef.current?.focus();
    }, 50);
  };

  return (
    <div className="space-y-2">
      {/* Search Mode or Compact Selected Card */}
      {isSearching ? (
        <div className="relative space-y-2" ref={dropdownRef}>
          <div className="flex items-center gap-1.5">
            <div className="relative flex-1">
              <Input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setDropdownOpen(true);
                }}
                onFocus={() => setDropdownOpen(true)}
                placeholder="Search Customer by Name or Mobile... (F2)"
                className="h-9 text-[12.5px] pr-8"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
                >
                  ✕
                </button>
              )}
            </div>

            <Button
              type="button"
              size="sm"
              variant="primary"
              onClick={() => {
                const isNum = /^\d+$/.test(searchQuery.trim());
                onOpenNewCustomerModal(
                  isNum
                    ? { phone: searchQuery.trim() }
                    : { name: searchQuery.trim() }
                );
                setIsSearching(false);
                setDropdownOpen(false);
              }}
              className="h-9 text-xs px-2.5 font-bold shrink-0"
            >
              + New Customer
            </Button>

            {selectedCustomer && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsSearching(false);
                  setDropdownOpen(false);
                }}
                className="h-9 text-xs text-muted-foreground"
              >
                Cancel
              </Button>
            )}
          </div>

          {/* Quick Actions Bar under search */}
          <div className="flex items-center justify-between text-[11px] px-1">
            <button
              type="button"
              onClick={() => {
                if (walkInCustomer) {
                  onSelectCustomer(walkInCustomer);
                  setIsSearching(false);
                  setDropdownOpen(false);
                }
              }}
              className="text-primary hover:underline font-semibold flex items-center gap-1"
            >
              ⚡ Select Walk-in Customer
            </button>
            <span className="text-muted-foreground text-[10.5px]">Type 10-digit mobile or name</span>
          </div>

          {/* Dropdown Results */}
          {dropdownOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border border-border/80 bg-white shadow-lg text-[12px] divide-y divide-border/40 animate-in-soft">
              {filteredCustomers.length === 0 ? (
                <div className="p-3 text-center space-y-2">
                  <div className="text-muted-foreground">No customer found for "{searchQuery}"</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    onClick={() => {
                      const isNum = /^\d+$/.test(searchQuery.trim());
                      onOpenNewCustomerModal(
                        isNum
                          ? { phone: searchQuery.trim() }
                          : { name: searchQuery.trim() }
                      );
                      setIsSearching(false);
                      setDropdownOpen(false);
                    }}
                    className="text-xs font-bold text-primary mx-auto"
                  >
                    + Create Customer "{searchQuery}"
                  </Button>
                </div>
              ) : (
                filteredCustomers.map((c) => {
                  const isCur = selectedCustomer?.id === c.id;
                  const cDue = allSales
                    .filter((s) => s.customerId === c.id && !s.quotation)
                    .reduce((acc, s) => acc + (s.dueAmount !== undefined ? s.dueAmount : Math.max(0, s.total - s.paid)), 0);

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => {
                        onSelectCustomer(c);
                        setIsSearching(false);
                        setDropdownOpen(false);
                      }}
                      className={`w-full p-2.5 text-left flex items-center justify-between hover:bg-primary/5 transition-colors cursor-pointer ${
                        isCur ? "bg-primary/10 font-bold" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-foreground truncate flex items-center gap-1.5">
                          <span>{c.name}</span>
                          {c.id === "c0" && <Badge tone="neutral" className="text-[9.5px] py-0">Default</Badge>}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono">
                          {c.phone && c.phone !== "—" ? c.phone : "No Mobile"}
                          {c.city ? ` · ${c.city}` : ""}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        {cDue > 0 ? (
                          <span className="text-[11px] font-bold text-destructive font-mono block">
                            Due: {inr(cDue)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground font-mono">No dues</span>
                        )}
                        <span className="text-[10.5px] text-primary font-medium hover:underline">Select →</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      ) : (
        /* COMPACT SELECTED CUSTOMER CARD */
        <div className="rounded-xl border border-border/80 bg-white/80 p-3 shadow-xs space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-bold text-foreground truncate">
                  {selectedCustomer ? selectedCustomer.name : "Walk-in Customer"}
                </span>
                {isWalkIn ? (
                  <Badge tone="neutral" className="text-[10px] py-0 px-1.5 font-medium">
                    Walk-in
                  </Badge>
                ) : (
                  <Badge tone="info" className="text-[10px] py-0 px-1.5 font-medium">
                    Retail Customer
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 mt-0.5 text-[11.5px] text-muted-foreground font-mono">
                <span>{selectedCustomer?.phone && selectedCustomer.phone !== "—" ? selectedCustomer.phone : "No Phone"}</span>
                {selectedCustomer?.city && (
                  <>
                    <span>•</span>
                    <span className="font-sans text-[11px]">{selectedCustomer.city}</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Change / Add Action Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={openSearchMode}
                className="h-7 text-[11.5px] px-2 text-primary hover:bg-primary/10 font-semibold"
              >
                Change (F2)
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onOpenNewCustomerModal()}
                className="h-7 text-[11.5px] px-2 font-semibold"
              >
                + New
              </Button>
            </div>
          </div>

          {/* Customer Dues Alert & Quick Collect Button */}
          {customerDue > 0 && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 flex items-center justify-between text-[11.5px] animate-in-soft">
              <div className="flex items-center gap-1.5 text-destructive font-bold">
                <span>⚠️ Outstanding Due:</span>
                <span className="font-mono text-[12.5px]">{inr(customerDue)}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="primary"
                  onClick={() => setCollectDueOpen(true)}
                  className="h-6.5 text-[11px] px-2 font-bold bg-destructive hover:bg-destructive/90 text-white"
                >
                  Collect Due
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={handleSendWhatsAppDue}
                  className="h-6.5 text-[11px] px-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 font-semibold"
                >
                  💬 WhatsApp
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collect Due Modal */}
      {selectedCustomer && collectDueOpen && (
        <QuickCollectDueModal
          open={collectDueOpen}
          onClose={() => setCollectDueOpen(false)}
          customer={selectedCustomer}
          outstandingDue={customerDue}
        />
      )}
    </div>
  );
}
