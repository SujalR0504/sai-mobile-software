import type {
  EMICalculatorInputs,
  EMICalculationResult,
  EMIScheduleRow,
  InterestType,
} from "../types";

/**
 * Safe currency rounding to 2 decimal places.
 */
export function round2(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Validates EMI calculator inputs against retail business rules.
 */
export function validateEMIInputs(inputs: Partial<EMICalculatorInputs>): {
  valid: boolean;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const productPrice = Number(inputs.productPrice) || 0;
  const discount = Math.max(0, Number(inputs.discount) || 0);
  const finalSaleAmount = round2(Math.max(0, productPrice - discount));
  const downPayment = Number(inputs.downPayment) || 0;
  const financeAmount = round2(finalSaleAmount - downPayment);
  const interestRate = Number(inputs.interestRate);
  const tenureMonths = Number(inputs.tenureMonths);
  const processingFee = Number(inputs.processingFee) || 0;
  const otherCharges = Number(inputs.otherCharges) || 0;

  if (productPrice <= 0) {
    errors.productPrice = "Product price must be greater than zero.";
  }

  if (discount < 0) {
    errors.discount = "Discount cannot be negative.";
  }

  if (finalSaleAmount <= 0) {
    errors.finalSaleAmount = "Final sale amount must be greater than zero.";
  }

  if (downPayment < 0) {
    errors.downPayment = "Down payment cannot be negative.";
  }

  if (downPayment > finalSaleAmount) {
    errors.downPayment = `Down payment (₹${downPayment}) cannot be greater than Final Sale Amount (₹${finalSaleAmount}).`;
  }

  if (financeAmount < 0) {
    errors.financeAmount = "Finance amount cannot be negative.";
  }

  if (financeAmount <= 0) {
    errors.financeAmount = "Finance amount must be greater than zero for an EMI sale.";
  }

  if (isNaN(interestRate) || interestRate < 0) {
    errors.interestRate = "Interest rate cannot be negative.";
  }

  if (!tenureMonths || tenureMonths <= 0 || !Number.isInteger(tenureMonths)) {
    errors.tenureMonths = "Tenure must be an integer greater than zero.";
  }

  if (processingFee < 0) {
    errors.processingFee = "Processing fee cannot be negative.";
  }

  if (otherCharges < 0) {
    errors.otherCharges = "Other charges cannot be negative.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Calculates due date for installment i given a starting date.
 */
export function calculateDueDate(firstEmiDateStr: string, monthOffset: number): string {
  if (!firstEmiDateStr) {
    const d = new Date();
    d.setMonth(d.getMonth() + 1 + monthOffset);
    return d.toISOString().slice(0, 10);
  }

  // Parse YYYY-MM-DD safely without timezone shift
  const [yearStr, monthStr, dayStr] = firstEmiDateStr.split("-");
  const baseYear = parseInt(yearStr, 10);
  const baseMonth = parseInt(monthStr, 10) - 1; // 0-indexed
  const baseDay = parseInt(dayStr, 10);

  // Target year and month
  const targetDate = new Date(baseYear, baseMonth + monthOffset, 1);
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth();

  // Handle month end overflow (e.g. Feb 30 -> Feb 28/29)
  const maxDaysInTargetMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const actualDay = Math.min(baseDay, maxDaysInTargetMonth);

  const finalDate = new Date(targetYear, targetMonth, actualDay);
  const y = finalDate.getFullYear();
  const m = String(finalDate.getMonth() + 1).padStart(2, "0");
  const d = String(finalDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Core EMI Calculation Engine.
 * Supports:
 * - ANNUAL_REDUCING: Annual interest reducing monthly
 * - MONTHLY_REDUCING: Monthly flat-rate applied on reducing balance
 * - FLAT_RATE: Simple interest on full principal divided across tenure
 * - ZERO_INTEREST: 0% interest loan
 *
 * Implements strict amortization schedule and safe decimal rounding
 * where the final installment absorbs rounding discrepancy so that
 * the total principal repaid equals exactly the financed amount and
 * the closing principal is guaranteed to be ₹0.00.
 */
export function calculateEMI(inputs: EMICalculatorInputs): EMICalculationResult {
  const productPrice = round2(Number(inputs.productPrice) || 0);
  const discount = round2(Math.max(0, Number(inputs.discount) || 0));
  const finalSaleAmount = round2(Math.max(0, productPrice - discount));
  const downPayment = round2(Math.max(0, Number(inputs.downPayment) || 0));
  const financeAmount = round2(Math.max(0, finalSaleAmount - downPayment));
  const interestRate = Math.max(0, Number(inputs.interestRate) || 0);
  const tenureMonths = Math.max(1, Math.floor(Number(inputs.tenureMonths) || 1));
  const processingFee = round2(Math.max(0, Number(inputs.processingFee) || 0));
  const otherCharges = round2(Math.max(0, Number(inputs.otherCharges) || 0));
  const interestType: InterestType = inputs.interestType || "ANNUAL_REDUCING";
  const firstEmiDate = inputs.firstEmiDate || new Date().toISOString().slice(0, 10);

  // If no finance amount, return empty/zero result
  if (financeAmount <= 0) {
    return {
      productPrice,
      discount,
      finalSaleAmount,
      downPayment,
      financeAmount: 0,
      interestRate,
      interestType,
      tenureMonths,
      processingFee,
      otherCharges,
      firstEmiDate,
      monthlyEmi: 0,
      totalInterest: 0,
      totalPayable: processingFee + otherCharges,
      totalPrincipalRepayment: 0,
      roundingAdjustment: 0,
      schedule: [],
    };
  }

  let monthlyEmi = 0;
  let totalInterest = 0;
  let totalPayable = 0;
  const schedule: EMIScheduleRow[] = [];

  // =========================================================================
  // Case 1: ZERO_INTEREST or interestRate === 0
  // =========================================================================
  if (interestType === "ZERO_INTEREST" || interestRate === 0) {
    monthlyEmi = round2(financeAmount / tenureMonths);
    totalInterest = 0;
    totalPayable = round2(financeAmount + processingFee + otherCharges);

    let openingPrincipal = financeAmount;
    let totalPrincipalRepaid = 0;

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      const dueDate = calculateDueDate(firstEmiDate, i - 1);
      const interestAmount = 0;

      let principalAmount: number;
      let emiAmount: number;
      let closingPrincipal: number;

      if (isFinal) {
        // Safe adjustment on final installment
        principalAmount = openingPrincipal;
        closingPrincipal = 0;
        emiAmount = principalAmount;
      } else {
        principalAmount = Math.min(openingPrincipal, monthlyEmi);
        closingPrincipal = round2(openingPrincipal - principalAmount);
        emiAmount = principalAmount;
      }

      totalPrincipalRepaid = round2(totalPrincipalRepaid + principalAmount);

      schedule.push({
        installmentNo: i,
        dueDate,
        openingPrincipal: round2(openingPrincipal),
        emi: round2(emiAmount),
        interest: 0,
        principal: round2(principalAmount),
        closingPrincipal: round2(closingPrincipal),
        status: "PENDING",
      });

      openingPrincipal = closingPrincipal;
    }

    const roundingAdjustment = round2(financeAmount - totalPrincipalRepaid);

    return {
      productPrice,
      discount,
      finalSaleAmount,
      downPayment,
      financeAmount,
      interestRate: 0,
      interestType: "ZERO_INTEREST",
      tenureMonths,
      processingFee,
      otherCharges,
      firstEmiDate,
      monthlyEmi,
      totalInterest: 0,
      totalPayable,
      totalPrincipalRepayment: totalPrincipalRepaid,
      roundingAdjustment,
      schedule,
    };
  }

  // =========================================================================
  // Case 2: FLAT_RATE EMI
  // Formula:
  // Interest = Principal × Annual Interest Rate × Tenure Years
  // Total Payable = Principal + Interest + Processing Fee + Other Charges
  // EMI = Total Payable / Number of Months
  // =========================================================================
  if (interestType === "FLAT_RATE") {
    const tenureYears = tenureMonths / 12;
    totalInterest = round2(financeAmount * (interestRate / 100) * tenureYears);
    totalPayable = round2(financeAmount + totalInterest + processingFee + otherCharges);
    monthlyEmi = round2(totalPayable / tenureMonths);

    const monthlyInterestNominal = round2(totalInterest / tenureMonths);
    let openingPrincipal = financeAmount;
    let accumulatedPrincipalRepaid = 0;
    let accumulatedInterestCharged = 0;

    for (let i = 1; i <= tenureMonths; i++) {
      const isFinal = i === tenureMonths;
      const dueDate = calculateDueDate(firstEmiDate, i - 1);

      let interestAmount: number;
      let principalAmount: number;
      let emiAmount: number;
      let closingPrincipal: number;

      if (isFinal) {
        // Absorb rounding on final installment
        principalAmount = openingPrincipal;
        closingPrincipal = 0;
        interestAmount = round2(totalInterest - accumulatedInterestCharged);
        emiAmount = round2(
          principalAmount +
            interestAmount +
            round2((processingFee + otherCharges) - round2((processingFee + otherCharges) / tenureMonths * (tenureMonths - 1)))
        );
      } else {
        interestAmount = monthlyInterestNominal;
        principalAmount = round2(financeAmount / tenureMonths);
        closingPrincipal = round2(openingPrincipal - principalAmount);
        emiAmount = monthlyEmi;
      }

      accumulatedPrincipalRepaid = round2(accumulatedPrincipalRepaid + principalAmount);
      accumulatedInterestCharged = round2(accumulatedInterestCharged + interestAmount);

      schedule.push({
        installmentNo: i,
        dueDate,
        openingPrincipal: round2(openingPrincipal),
        emi: round2(emiAmount),
        interest: round2(interestAmount),
        principal: round2(principalAmount),
        closingPrincipal: round2(closingPrincipal),
        status: "PENDING",
      });

      openingPrincipal = closingPrincipal;
    }

    const roundingAdjustment = round2(financeAmount - accumulatedPrincipalRepaid);

    return {
      productPrice,
      discount,
      finalSaleAmount,
      downPayment,
      financeAmount,
      interestRate,
      interestType: "FLAT_RATE",
      tenureMonths,
      processingFee,
      otherCharges,
      firstEmiDate,
      monthlyEmi,
      totalInterest,
      totalPayable,
      totalPrincipalRepayment: accumulatedPrincipalRepaid,
      roundingAdjustment,
      schedule,
    };
  }

  // =========================================================================
  // Case 3: REDUCING BALANCE (ANNUAL_REDUCING or MONTHLY_REDUCING)
  // Monthly rate:
  // If ANNUAL_REDUCING: r = Annual Rate / 12 / 100
  // If MONTHLY_REDUCING: r = Monthly Rate / 100
  // EMI formula:
  // EMI = [P × r × (1+r)^n] / [(1+r)^n - 1]
  // =========================================================================
  const monthlyRate =
    interestType === "MONTHLY_REDUCING"
      ? interestRate / 100
      : interestRate / 12 / 100;

  const rateFactor = Math.pow(1 + monthlyRate, tenureMonths);
  const rawEmi = (financeAmount * monthlyRate * rateFactor) / (rateFactor - 1);
  monthlyEmi = round2(rawEmi);

  let openingPrincipal = financeAmount;
  let totalPrincipalRepaid = 0;
  let accumulatedInterest = 0;

  for (let i = 1; i <= tenureMonths; i++) {
    const isFinal = i === tenureMonths;
    const dueDate = calculateDueDate(firstEmiDate, i - 1);

    // Interest for this month based on opening principal
    const interestAmount = round2(openingPrincipal * monthlyRate);

    let principalAmount: number;
    let emiAmount: number;
    let closingPrincipal: number;

    if (isFinal) {
      // EXACT FINAL ROUNDING RULE:
      // The final outstanding principal must become ₹0.00.
      // Final Principal = entire opening principal.
      // Final EMI = Final Principal + Final Interest.
      principalAmount = openingPrincipal;
      closingPrincipal = 0.0;
      emiAmount = round2(principalAmount + interestAmount);
    } else {
      principalAmount = round2(monthlyEmi - interestAmount);
      closingPrincipal = round2(openingPrincipal - principalAmount);
      emiAmount = monthlyEmi;
    }

    totalPrincipalRepaid = round2(totalPrincipalRepaid + principalAmount);
    accumulatedInterest = round2(accumulatedInterest + interestAmount);

    schedule.push({
      installmentNo: i,
      dueDate,
      openingPrincipal: round2(openingPrincipal),
      emi: round2(emiAmount),
      interest: round2(interestAmount),
      principal: round2(principalAmount),
      closingPrincipal: round2(closingPrincipal),
      status: "PENDING",
    });

    openingPrincipal = closingPrincipal;
  }

  totalInterest = accumulatedInterest;
  totalPayable = round2(financeAmount + totalInterest + processingFee + otherCharges);
  const roundingAdjustment = round2(financeAmount - totalPrincipalRepaid);

  return {
    productPrice,
    discount,
    finalSaleAmount,
    downPayment,
    financeAmount,
    interestRate,
    interestType,
    tenureMonths,
    processingFee,
    otherCharges,
    firstEmiDate,
    monthlyEmi,
    totalInterest,
    totalPayable,
    totalPrincipalRepayment: totalPrincipalRepaid,
    roundingAdjustment,
    schedule,
  };
}
