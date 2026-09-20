import { useEffect, useMemo, useState } from "react";
import { inr, todayISO } from "@/lib/format";
import { calculateEMI, round2, validateEMIInputs } from "@/lib/emi";
import { generateEMIPlanWhatsAppMessage, openWhatsAppChat } from "@/lib/whatsapp";
import type {
  EMICalculationResult,
  EMICalculatorInputs,
  FinanceCompany,
  InterestType,
} from "@/lib/types";
import { Badge, Button, Card, CardHead, Field, Input, Select, Table, Row, Td } from "./ui";
import { EMIPrintPlan } from "./EMIPrintPlan";
import { Calculator, Printer, RotateCcw, Share2, CheckCircle2, ChevronDown, ChevronUp, Lock, Unlock } from "lucide-react";

export interface EMICalculatorProps {
  initialPrice?: number;
  initialDiscount?: number;
  initialDownPayment?: number;
  initialProduct?: string;
  initialImei?: string;
  initialCustomer?: { id?: string; name?: string; phone?: string };
  isPosMode?: boolean;
  onConfirmEmiSale?: (emiData: {
    companyId: string;
    companyName: string;
    downPayment: number;
    financedAmount: number;
    interestRate: number;
    interestType: InterestType;
    tenureMonths: number;
    processingFee: number;
    otherCharges: number;
    monthlyEmi: number;
    totalInterest: number;
    totalPayable: number;
    firstEmiDate: string;
    calcResult: EMICalculationResult;
  }) => void;
  onClose?: () => void;
}

const QUICK_TENURES = [3, 6, 9, 12, 18, 24, 30, 36];

export function EMICalculator({
  initialPrice = 15000,
  initialDiscount = 0,
  initialDownPayment = 5000,
  initialProduct = "OPPO F33 PRO",
  initialImei = "",
  initialCustomer,
  isPosMode = false,
  onConfirmEmiSale,
  onClose,
}: EMICalculatorProps) {
  // Input states
  const [productName, setProductName] = useState(initialProduct);
  const [imei, setImei] = useState(initialImei);
  const [customerName, setCustomerName] = useState(initialCustomer?.name || "");
  const [customerMobile, setCustomerMobile] = useState(initialCustomer?.phone || "");

  const [productPrice, setProductPrice] = useState<number>(initialPrice);
  const [discount, setDiscount] = useState<number>(initialDiscount);
  const [downPayment, setDownPayment] = useState<number>(initialDownPayment);

  // Manual finance override option
  const [allowManualFinance, setAllowManualFinance] = useState(false);
  const [manualFinanceAmount, setManualFinanceAmount] = useState<number>(
    Math.max(0, initialPrice - initialDiscount - initialDownPayment)
  );

  const [interestRate, setInterestRate] = useState<number>(12);
  const [interestType, setInterestType] = useState<InterestType>("ANNUAL_REDUCING");
  const [tenureMonths, setTenureMonths] = useState<number>(12);
  const [processingFee, setProcessingFee] = useState<number>(500);
  const [otherCharges, setOtherCharges] = useState<number>(0);

  // Default first EMI date = 1 month from today
  const defaultFirstEmiDate = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }, []);
  const [firstEmiDate, setFirstEmiDate] = useState<string>(defaultFirstEmiDate);

  // Finance companies from API
  const [companies, setCompanies] = useState<FinanceCompany[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");

  // UI state
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [calcResult, setCalcResult] = useState<EMICalculationResult | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Fetch finance companies
  useEffect(() => {
    fetch("/api/emi/companies")
      .then((r) => r.json())
      .then((data: FinanceCompany[]) => {
        if (Array.isArray(data) && data.length > 0) {
          setCompanies(data);
          const first = data[0];
          setSelectedCompanyId(first.id);
          if (first.defaultInterestRate !== undefined && first.defaultInterestRate > 0) {
            setInterestRate(first.defaultInterestRate);
          }
          if (first.defaultTenure) {
            setTenureMonths(first.defaultTenure);
          }
          if (first.processingFee !== undefined) {
            setProcessingFee(first.processingFee);
          }
        }
      })
      .catch((err) => console.error("Failed to fetch finance companies:", err));
  }, []);

  // Handle finance company selection
  const handleCompanyChange = (companyId: string) => {
    setSelectedCompanyId(companyId);
    const comp = companies.find((c) => c.id === companyId);
    if (comp) {
      if (comp.defaultInterestRate !== undefined && comp.defaultInterestRate > 0) {
        setInterestRate(comp.defaultInterestRate);
      }
      if (comp.defaultTenure) {
        setTenureMonths(comp.defaultTenure);
      }
      if (comp.processingFee !== undefined) {
        setProcessingFee(comp.processingFee);
      }
    }
  };

  // Automatic calculations
  const finalSaleAmount = useMemo(() => {
    return round2(Math.max(0, productPrice - discount));
  }, [productPrice, discount]);

  const automaticFinanceAmount = useMemo(() => {
    return round2(Math.max(0, finalSaleAmount - downPayment));
  }, [finalSaleAmount, downPayment]);

  const effectiveFinanceAmount = allowManualFinance ? manualFinanceAmount : automaticFinanceAmount;

  // Run calculation dynamically
  const runCalculation = () => {
    const inputs: EMICalculatorInputs = {
      productPrice,
      discount,
      downPayment,
      interestRate,
      interestType,
      tenureMonths,
      processingFee,
      otherCharges,
      firstEmiDate,
      productId: undefined,
      productName,
      imei,
      customerName,
      customerMobile,
    };

    const validation = validateEMIInputs(inputs);
    setValidationErrors(validation.errors);

    if (!validation.valid) {
      return;
    }

    const result = calculateEMI(inputs);
    setCalcResult(result);
  };

  // Recalculate whenever inputs change
  useEffect(() => {
    runCalculation();
  }, [
    productPrice,
    discount,
    downPayment,
    effectiveFinanceAmount,
    interestRate,
    interestType,
    tenureMonths,
    processingFee,
    otherCharges,
    firstEmiDate,
  ]);

  // Reset to default values
  const handleReset = () => {
    setProductPrice(initialPrice);
    setDiscount(initialDiscount);
    setDownPayment(initialDownPayment);
    setAllowManualFinance(false);
    setInterestRate(12);
    setInterestType("ANNUAL_REDUCING");
    setTenureMonths(12);
    setProcessingFee(500);
    setOtherCharges(0);
    setFirstEmiDate(defaultFirstEmiDate);
    setValidationErrors({});
    if (companies.length > 0) {
      setSelectedCompanyId(companies[0].id);
    }
  };

  // Pre-filled WhatsApp message
  const handleWhatsAppShare = () => {
    if (!calcResult) return;
    const comp = companies.find((c) => c.id === selectedCompanyId);
    const scheduleSummary = calcResult.schedule
      .slice(0, 4)
      .map((r) => `  • Month ${r.installmentNo} (${r.dueDate}): ${inr(r.emi)}`)
      .join("\n") + (calcResult.schedule.length > 4 ? `\n  ... (+${calcResult.schedule.length - 4} more installments)` : "");

    const message = generateEMIPlanWhatsAppMessage({
      shopName: "SHRI SAI MOBILE",
      shopPhone: "8817740040",
      customerName: customerName || "Customer",
      customerPhone: customerMobile,
      productName: productName || "Mobile Device",
      imei: imei || undefined,
      saleAmount: calcResult.finalSaleAmount,
      downPayment: calcResult.downPayment,
      financeAmount: calcResult.financeAmount,
      financeCompany: comp?.companyName || "Finance Partner",
      interestRate: calcResult.interestRate,
      interestType: calcResult.interestType,
      tenureMonths: calcResult.tenureMonths,
      monthlyEmi: calcResult.monthlyEmi,
      totalInterest: calcResult.totalInterest,
      processingFee: calcResult.processingFee,
      totalPayable: calcResult.totalPayable,
      firstEmiDate: calcResult.firstEmiDate,
      scheduleSummary,
    });

    openWhatsAppChat({
      phone: customerMobile,
      message,
      actionName: "SHARE_EMI_PLAN",
      recordId: `emi_quote_${Date.now()}`,
    });
  };

  // Confirm EMI Sale (in POS mode)
  const handleConfirmSale = () => {
    if (!calcResult) {
      alert("Please calculate the EMI plan before confirming the sale.");
      return;
    }

    const validation = validateEMIInputs({
      productPrice,
      discount,
      downPayment,
      interestRate,
      tenureMonths,
      processingFee,
    });

    if (!validation.valid) {
      alert(Object.values(validation.errors).join("\n"));
      return;
    }

    if (!selectedCompanyId) {
      alert("Please select an approved Finance Company.");
      return;
    }

    const comp = companies.find((c) => c.id === selectedCompanyId);
    if (onConfirmEmiSale) {
      onConfirmEmiSale({
        companyId: selectedCompanyId,
        companyName: comp?.companyName || "Finance Partner",
        downPayment,
        financedAmount: calcResult.financeAmount,
        interestRate,
        interestType,
        tenureMonths,
        processingFee,
        otherCharges,
        monthlyEmi: calcResult.monthlyEmi,
        totalInterest: calcResult.totalInterest,
        totalPayable: calcResult.totalPayable,
        firstEmiDate,
        calcResult,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-gradient-to-r from-primary/10 via-indigo-50/50 to-white p-4 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-xl bg-primary text-white shadow-md shadow-primary/20">
            <Calculator className="size-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight text-foreground flex items-center gap-2">
              EMI Calculator
              <Badge tone="info" className="text-[10px]">
                {interestType.replace("_", " ")}
              </Badge>
            </h2>
            <p className="text-[11.5px] text-muted-foreground">
              Calculate reducing balance, flat-rate, or zero-interest smartphone loans with safe decimal rounding.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={handleReset} title="Reset to defaults">
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          {onClose ? (
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Column: Input Form (7 cols) */}
        <div className="lg:col-span-7 space-y-3">
          <Card className="p-4 space-y-3.5">
            <div className="text-[12.5px] font-bold text-foreground flex items-center justify-between border-b border-border/80 pb-2">
              <span>Loan & Product Configuration</span>
              <span className="text-[11px] font-normal text-muted-foreground">All amounts in INR (₹)</span>
            </div>

            {/* Product & Customer Details */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label="Product / Smartphone Model">
                <Input
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="e.g. OPPO F33 PRO 5G"
                />
              </Field>

              <Field label="Device IMEI / Serial (Optional)">
                <Input
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  placeholder="e.g. 864201048291039"
                  className="font-mono text-[12px]"
                />
              </Field>
            </div>

            {/* Price, Discount & Final Amount */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Field label="Product Price (₹) *">
                <Input
                  type="number"
                  min="1"
                  value={productPrice || ""}
                  onChange={(e) => setProductPrice(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="15000"
                  className="font-semibold num"
                />
                {validationErrors.productPrice ? (
                  <span className="text-[10px] text-rose-600 font-medium">{validationErrors.productPrice}</span>
                ) : null}
              </Field>

              <Field label="Discount (₹)">
                <Input
                  type="number"
                  min="0"
                  value={discount || ""}
                  onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="num"
                />
              </Field>

              <Field label="Final Sale Amount (₹)">
                <div className="flex h-9.5 items-center rounded-xl border border-border/80 bg-slate-100/80 px-3 font-mono font-bold text-foreground num text-[13px]">
                  {inr(finalSaleAmount)}
                </div>
              </Field>
            </div>

            {/* Down Payment & Finance Amount */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Field label="Customer Down Payment (₹) *">
                <Input
                  type="number"
                  min="0"
                  max={finalSaleAmount}
                  value={downPayment || ""}
                  onChange={(e) => setDownPayment(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="5000"
                  className="font-semibold text-emerald-600 num"
                />
                {validationErrors.downPayment ? (
                  <span className="text-[10px] text-rose-600 font-medium">{validationErrors.downPayment}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Paid upfront by customer at store</span>
                )}
              </Field>

              <Field label="Finance Amount (Loan Principal)">
                <div className="relative">
                  <Input
                    type="number"
                    disabled={!allowManualFinance}
                    value={effectiveFinanceAmount || ""}
                    onChange={(e) => setManualFinanceAmount(Math.max(0, Number(e.target.value) || 0))}
                    className={`font-bold num ${allowManualFinance ? "bg-white text-primary border-primary" : "bg-slate-100/80 text-primary"}`}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setAllowManualFinance(!allowManualFinance);
                      if (!allowManualFinance) setManualFinanceAmount(automaticFinanceAmount);
                    }}
                    className="absolute right-2 top-2 text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                    title={allowManualFinance ? "Lock automatic calculation" : "Unlock to manually adjust finance amount"}
                  >
                    {allowManualFinance ? <Unlock className="size-4 text-amber-600" /> : <Lock className="size-4" />}
                  </button>
                </div>
                {validationErrors.financeAmount ? (
                  <span className="text-[10px] text-rose-600 font-medium">{validationErrors.financeAmount}</span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    {allowManualFinance ? "Manual override active" : "Auto: Final Amount − Down Payment"}
                  </span>
                )}
              </Field>
            </div>

            {/* Finance Company, Interest Type & Rate */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Field label="Finance Company *">
                <Select value={selectedCompanyId} onChange={(e) => handleCompanyChange(e.target.value)}>
                  {companies.length === 0 ? (
                    <option value="">No Finance Partners Configured</option>
                  ) : (
                    companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))
                  )}
                </Select>
              </Field>

              <Field label="Interest Type">
                <Select value={interestType} onChange={(e) => setInterestType(e.target.value as any)}>
                  <option value="ANNUAL_REDUCING">Annual Reducing</option>
                  <option value="MONTHLY_REDUCING">Monthly Reducing</option>
                  <option value="FLAT_RATE">Flat Rate</option>
                  <option value="ZERO_INTEREST">Zero Interest (0%)</option>
                </Select>
              </Field>

              <Field label="Interest Rate (%) *">
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  disabled={interestType === "ZERO_INTEREST"}
                  value={interestType === "ZERO_INTEREST" ? 0 : interestRate}
                  onChange={(e) => setInterestRate(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="12"
                  className="num font-semibold"
                />
                {validationErrors.interestRate ? (
                  <span className="text-[10px] text-rose-600 font-medium">{validationErrors.interestRate}</span>
                ) : null}
              </Field>
            </div>

            {/* Tenure with quick chips */}
            <div>
              <Field label="Loan Tenure (Months) *">
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="60"
                    value={tenureMonths || ""}
                    onChange={(e) => setTenureMonths(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
                    className="w-28 font-semibold num"
                  />
                  <span className="text-[12px] font-semibold text-muted-foreground">Months</span>

                  {/* Quick selection chips */}
                  <div className="flex flex-wrap gap-1 ml-auto">
                    {QUICK_TENURES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setTenureMonths(m)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-all cursor-pointer ${
                          tenureMonths === m
                            ? "bg-primary text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {m}M
                      </button>
                    ))}
                  </div>
                </div>
              </Field>
              {validationErrors.tenureMonths ? (
                <span className="text-[10px] text-rose-600 font-medium">{validationErrors.tenureMonths}</span>
              ) : null}
            </div>

            {/* Fees & First EMI Date */}
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <Field label="Processing Fee (₹)">
                <Input
                  type="number"
                  min="0"
                  value={processingFee || ""}
                  onChange={(e) => setProcessingFee(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="500"
                  className="num"
                />
              </Field>

              <Field label="Other Charges (₹)">
                <Input
                  type="number"
                  min="0"
                  value={otherCharges || ""}
                  onChange={(e) => setOtherCharges(Math.max(0, Number(e.target.value) || 0))}
                  placeholder="0"
                  className="num"
                />
              </Field>

              <Field label="First EMI Due Date *">
                <Input
                  type="date"
                  value={firstEmiDate}
                  onChange={(e) => setFirstEmiDate(e.target.value)}
                  className="text-[12px]"
                />
              </Field>
            </div>
          </Card>
        </div>

        {/* Right Column: Calculation Summary Card (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <Card className="overflow-hidden border-primary/30 shadow-md">
            <div className="bg-gradient-to-r from-primary to-indigo-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-100">
                  Calculation Summary
                </span>
                <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10.5px] font-semibold text-white">
                  {tenureMonths} Installments
                </span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <div className="text-[11px] text-indigo-200 font-medium">Monthly Installment</div>
                  <div className="text-3xl font-black tracking-tight num">
                    {calcResult ? inr(calcResult.monthlyEmi) : "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-indigo-200 font-medium">Interest Type</div>
                  <div className="text-[12px] font-bold">{interestType.replace("_", " ")}</div>
                </div>
              </div>
            </div>

            {/* Summary details table */}
            <div className="p-4 space-y-2 text-[12.5px] divide-y divide-border/60">
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Product Price</span>
                <span className="font-semibold text-foreground num">{inr(productPrice)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Discount</span>
                <span className="font-semibold text-rose-600 num">−{inr(discount)}</span>
              </div>

              <div className="flex justify-between py-1 bg-slate-50/50 -mx-4 px-4">
                <span className="font-semibold text-foreground uppercase text-[11px]">Final Sale Value</span>
                <span className="font-bold text-foreground num">{inr(finalSaleAmount)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Customer Down Payment</span>
                <span className="font-bold text-emerald-600 num">{inr(downPayment)}</span>
              </div>

              <div className="flex justify-between py-1 bg-primary/5 -mx-4 px-4 font-semibold">
                <span className="text-primary uppercase text-[11px]">Finance Amount (Principal)</span>
                <span className="font-extrabold text-primary num">{inr(effectiveFinanceAmount)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Interest Rate & Tenure</span>
                <span className="font-medium text-foreground">
                  {interestRate}% • {tenureMonths} Months
                </span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Processing Fee</span>
                <span className="font-medium text-foreground num">{inr(processingFee)}</span>
              </div>

              <div className="flex justify-between py-1">
                <span className="text-muted-foreground uppercase font-semibold text-[11px]">Total Interest</span>
                <span className="font-bold text-amber-600 num">
                  {calcResult ? inr(calcResult.totalInterest) : "—"}
                </span>
              </div>

              <div className="flex justify-between py-2 -mx-4 px-4 bg-slate-900 text-white rounded-b-xl">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-slate-300 font-semibold">
                    Total Finance Payable
                  </div>
                  <div className="text-[10px] text-slate-400">Principal + Interest + Fees</div>
                </div>
                <div className="text-right font-black text-xl num text-emerald-400">
                  {calcResult ? inr(calcResult.totalPayable) : "—"}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="p-3.5 bg-slate-50 border-t border-border space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScheduleOpen(!scheduleOpen)}
                  className="w-full text-[11.5px]"
                >
                  {scheduleOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {scheduleOpen ? "Hide Schedule" : "View Schedule"}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPrintModalOpen(true)}
                  disabled={!calcResult}
                  className="w-full text-[11.5px]"
                >
                  <Printer className="size-3.5" />
                  Print Plan
                </Button>
              </div>

              <Button
                variant="soft"
                size="sm"
                onClick={handleWhatsAppShare}
                disabled={!calcResult}
                className="w-full text-[12px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200"
              >
                <Share2 className="size-3.5" />
                WhatsApp EMI Plan
              </Button>

              {isPosMode && onConfirmEmiSale ? (
                <Button
                  variant="primary"
                  size="lg"
                  onClick={handleConfirmSale}
                  className="w-full text-[13.5px] font-bold shadow-md"
                >
                  <CheckCircle2 className="size-4" />
                  Confirm EMI Sale ({calcResult ? inr(calcResult.monthlyEmi) : ""} / mo)
                </Button>
              ) : null}
            </div>
          </Card>
        </div>
      </div>

      {/* Collapsible EMI Repayment Schedule Table */}
      {scheduleOpen && calcResult && calcResult.schedule.length > 0 ? (
        <Card className="overflow-hidden animate-in-soft">
          <CardHead
            title={`EMI Repayment Schedule (${calcResult.schedule.length} Installments)`}
            sub="Mathematical amortization schedule with safe 2-decimal rounding. Final closing balance is guaranteed ₹0.00."
            right={
              <span className="text-[12px] font-bold text-emerald-600">
                Final Closing Principal: ₹0.00
              </span>
            }
          />
          <Table
            head={[
              "EMI No.",
              "Due Date",
              ">Opening Principal",
              ">Monthly EMI",
              ">Interest",
              ">Principal Repaid",
              ">Closing Principal",
              "Status",
            ]}
          >
            {calcResult.schedule.map((row) => (
              <Row key={row.installmentNo}>
                <Td className="font-semibold text-center">{row.installmentNo}</Td>
                <Td className="font-medium text-foreground">{row.dueDate}</Td>
                <Td right mono className="text-muted-foreground">
                  {inr(row.openingPrincipal)}
                </Td>
                <Td right mono className="font-bold text-slate-900">
                  {inr(row.emi)}
                </Td>
                <Td right mono className="text-amber-600 font-medium">
                  {inr(row.interest)}
                </Td>
                <Td right mono className="text-emerald-600 font-medium">
                  {inr(row.principal)}
                </Td>
                <Td right mono className="font-extrabold text-foreground">
                  {row.closingPrincipal === 0 ? (
                    <span className="text-emerald-600">₹0.00</span>
                  ) : (
                    inr(row.closingPrincipal)
                  )}
                </Td>
                <Td>
                  <Badge tone={row.status === "PAID" ? "success" : "neutral"}>
                    {row.status}
                  </Badge>
                </Td>
              </Row>
            ))}
          </Table>
        </Card>
      ) : null}

      {/* Print Plan Modal */}
      {printModalOpen && calcResult ? (
        <EMIPrintPlan
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          calc={calcResult}
          customerName={customerName}
          customerMobile={customerMobile}
          productName={productName}
          imei={imei}
          financeCompany={companies.find((c) => c.id === selectedCompanyId)?.companyName}
        />
      ) : null}
    </div>
  );
}
