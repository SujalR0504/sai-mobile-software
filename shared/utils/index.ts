export function inr(val: number | string | null | undefined): string {
  const n = Number(val ?? 0);
  if (isNaN(n)) return "₹0";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
}

export * from "./format";
export * from "./emi";
