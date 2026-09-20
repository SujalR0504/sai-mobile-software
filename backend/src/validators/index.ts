export function validatePhoneNumber(phone: string): boolean {
  const digits = phone.replace(/\\D/g, "");
  return digits.length >= 10 && digits.length <= 12;
}

export function validateIMEI(imei: string): { valid: boolean; error?: string } {
  const clean = imei.trim();
  if (!clean) return { valid: false, error: "IMEI cannot be empty" };
  if (clean.length < 8) return { valid: false, error: "IMEI must be at least 8 characters" };
  return { valid: true };
}
