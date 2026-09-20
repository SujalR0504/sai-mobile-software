import { inr } from "@/lib/format";
import type { EMICalculationResult } from "@/lib/types";
import { Button, Modal } from "./ui";

interface EMIPrintPlanProps {
  open: boolean;
  onClose: () => void;
  calc: EMICalculationResult;
  customerName?: string;
  customerMobile?: string;
  productName?: string;
  imei?: string;
  financeCompany?: string;
  shopName?: string;
  shopPhone?: string;
  shopAddress?: string;
  shopGstin?: string;
}

export function EMIPrintPlan({
  open,
  onClose,
  calc,
  customerName = "Valued Customer",
  customerMobile,
  productName = "Mobile Phone / Device",
  imei,
  financeCompany = "Direct / Partner NBFC",
  shopName = "SHRI SAI MOBILE",
  shopPhone = "8817740040",
  shopAddress = "Bus Stand, Near Over Bridge, Harda (M.P.)",
  shopGstin,
}: EMIPrintPlanProps) {
  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal open={open} onClose={onClose} title="EMI Financing Plan — Print Preview" wide>
      <div className="space-y-4">
        {/* Printable Paper Document */}
        <div
          id="emi-printable-voucher"
          className="rounded-xl border border-slate-300 bg-white p-6 text-slate-800 shadow-sm print:m-0 print:border-none print:p-0"
        >
          {/* Header */}
          <div className="border-b-2 border-slate-900 pb-3">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900">{shopName}</h1>
                <p className="text-[12px] font-medium text-slate-600">{shopAddress}</p>
                <p className="text-[11px] text-slate-500">
                  Tel: {shopPhone} {shopGstin ? `| GSTIN: ${shopGstin}` : ""}
                </p>
              </div>
              <div className="text-right">
                <span className="inline-block rounded bg-slate-900 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-white">
                  EMI Financing Plan
                </span>
                <p className="mt-1 text-[11px] text-slate-500 font-mono">
                  Date: {new Date().toLocaleDateString("en-IN")}
                </p>
              </div>
            </div>
          </div>

          {/* Customer & Product Information */}
          <div className="mt-3 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 text-[12px] border border-slate-200">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer Details</div>
              <div className="mt-0.5 font-bold text-slate-900">{customerName}</div>
              <div className="font-mono text-slate-600">{customerMobile || "No mobile provided"}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Product & Finance Partner</div>
              <div className="mt-0.5 font-bold text-slate-900">{productName}</div>
              <div className="flex items-center gap-2 font-mono text-[11px] text-slate-600">
                <span>IMEI: {imei || "Standard Device"}</span>
                <span>•</span>
                <span className="font-semibold text-primary">{financeCompany}</span>
              </div>
            </div>
          </div>

          {/* Key Loan Financial Metrics */}
          <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[12px]">
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
              <div className="text-[10px] font-semibold text-slate-500 uppercase">Product Price</div>
              <div className="mt-0.5 font-bold text-slate-900 num">{inr(calc.productPrice)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
              <div className="text-[10px] font-semibold text-emerald-700 uppercase">Down Payment</div>
              <div className="mt-0.5 font-bold text-emerald-700 num">{inr(calc.downPayment)}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
              <div className="text-[10px] font-semibold text-primary uppercase">Loan Principal</div>
              <div className="mt-0.5 font-bold text-primary num">{inr(calc.financeAmount)}</div>
            </div>
            <div className="rounded-lg border border-slate-900 bg-slate-900 p-2 text-white">
              <div className="text-[10px] font-semibold uppercase text-slate-300">Monthly EMI</div>
              <div className="mt-0.5 text-base font-extrabold num text-emerald-400">
                {inr(calc.monthlyEmi)}
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-4 gap-2 text-center text-[11px] text-slate-600">
            <div className="p-1.5 rounded border border-slate-100">
              Interest: <strong>{calc.interestRate}% ({calc.interestType.replace("_", " ")})</strong>
            </div>
            <div className="p-1.5 rounded border border-slate-100">
              Tenure: <strong>{calc.tenureMonths} Months</strong>
            </div>
            <div className="p-1.5 rounded border border-slate-100">
              Total Interest: <strong>{inr(calc.totalInterest)}</strong>
            </div>
            <div className="p-1.5 rounded border border-slate-100 font-semibold text-slate-900">
              Total Payable: <strong>{inr(calc.totalPayable)}</strong>
            </div>
          </div>

          {/* Repayment Amortization Schedule */}
          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-700">
              <span>Repayment Schedule ({calc.schedule.length} Installments)</span>
              <span className="text-[10px] text-slate-500 font-normal">
                Final Closing Balance: <strong className="text-emerald-600">₹0.00</strong>
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-100 font-semibold text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="p-1.5 text-center">#</th>
                    <th className="p-1.5">Due Date</th>
                    <th className="p-1.5 text-right">Opening (₹)</th>
                    <th className="p-1.5 text-right font-bold">EMI (₹)</th>
                    <th className="p-1.5 text-right">Interest (₹)</th>
                    <th className="p-1.5 text-right">Principal (₹)</th>
                    <th className="p-1.5 text-right">Closing (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[10.5px]">
                  {calc.schedule.map((row) => (
                    <tr key={row.installmentNo} className={row.installmentNo % 2 === 0 ? "bg-slate-50/40" : ""}>
                      <td className="p-1.5 text-center font-sans font-medium">{row.installmentNo}</td>
                      <td className="p-1.5 font-sans">{row.dueDate}</td>
                      <td className="p-1.5 text-right">{inr(row.openingPrincipal)}</td>
                      <td className="p-1.5 text-right font-bold text-slate-900">{inr(row.emi)}</td>
                      <td className="p-1.5 text-right text-slate-600">{inr(row.interest)}</td>
                      <td className="p-1.5 text-right text-slate-700">{inr(row.principal)}</td>
                      <td className="p-1.5 text-right font-bold text-slate-900">
                        {row.closingPrincipal === 0 ? "₹0.00" : inr(row.closingPrincipal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Terms & Signatures */}
          <div className="mt-6 border-t border-slate-200 pt-4 text-[10px] text-slate-500">
            <p>
              * This EMI schedule represents the planned installment amortization based on agreed loan terms.
              Late payment penalty or foreclosure charges may apply as per partner finance company guidelines.
            </p>
            <div className="mt-8 flex justify-between px-4 text-center">
              <div className="border-t border-slate-400 pt-1 w-44">
                <span className="font-semibold text-slate-700">Customer Signature</span>
              </div>
              <div className="border-t border-slate-400 pt-1 w-44">
                <span className="font-semibold text-slate-700">Store Seal & Signature</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Controls */}
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            🖨️ Print / Save PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}
