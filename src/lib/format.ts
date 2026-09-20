export const inr = (n: number) =>
  "₹" +
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );

export const inr2 = (n: number) =>
  "₹" +
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    n || 0,
  );

export const num = (n: number) => new Intl.NumberFormat("en-IN").format(n || 0);

export const todayISO = () => new Date().toISOString().slice(0, 10);

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
};

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const maskImei = (imei?: string) =>
  !imei ? "—" : imei.length > 10 ? `${imei.slice(0, 6)}…${imei.slice(-4)}` : imei;

export const uid = (prefix = "id") =>
  `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"
];

function convertBelowThousand(n: number): string {
  let str = "";
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + " Hundred ";
    n %= 100;
  }
  if (n >= 20) {
    str += TENS[Math.floor(n / 10)] + " ";
    n %= 10;
  }
  if (n > 0) {
    str += ONES[n] + " ";
  }
  return str.trim();
}

/**
 * Converts numbers into standard Indian Currency words
 * e.g., 56157 -> "INR Fifty Six Thousand One Hundred Fifty Seven Only"
 */
export function numberToIndianWords(amount: number): string {
  if (!amount || amount <= 0 || isNaN(amount)) return "INR Zero Only";

  const rounded = Math.round(amount * 100) / 100;
  let integerPart = Math.floor(rounded);
  const decimalPart = Math.round((rounded - integerPart) * 100);

  if (integerPart === 0 && decimalPart === 0) return "INR Zero Only";

  let words = "";

  // Crores (1,00,00,000)
  if (integerPart >= 10000000) {
    const crores = Math.floor(integerPart / 10000000);
    words += convertBelowThousand(crores) + " Crore ";
    integerPart %= 10000000;
  }

  // Lakhs (1,00,000)
  if (integerPart >= 100000) {
    const lakhs = Math.floor(integerPart / 100000);
    words += convertBelowThousand(lakhs) + " Lakh ";
    integerPart %= 100000;
  }

  // Thousands (1,000)
  if (integerPart >= 1000) {
    const thousands = Math.floor(integerPart / 1000);
    words += convertBelowThousand(thousands) + " Thousand ";
    integerPart %= 1000;
  }

  // Hundreds & Units
  if (integerPart > 0) {
    words += convertBelowThousand(integerPart) + " ";
  }

  words = words.trim();

  let result = `INR ${words}`;
  if (decimalPart > 0) {
    result += ` and ${convertBelowThousand(decimalPart)} Paise`;
  }
  result += " Only";

  return result.replace(/\s+/g, " ");
}
