import type { DatabaseSync } from "node:sqlite";
import type { Settings } from "../../../shared/types";
import { getSettings } from "../repositories/repository";
import { resetDatabase, wipeAllData } from "../../../database/schema";
export { getSettings };

export function updateSettings(db: DatabaseSync, patch: Partial<Settings>): Settings {
  const current = getSettings(db);
  const updated: Settings = {
    ...current,
    ...patch,
  };

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO settings (
      id, shop_name, tagline, owner_name, phone, address, gstin, default_gst, invoice_prefix, opening_cash,
      shop_latitude, shop_longitude, allowed_radius_meters, logo_url, brands_banner_url, location_qr_url,
      upi_id, upi_qr_url, city, state, state_code, pincode, pan, whatsapp, email, website,
      bank_name, bank_account_no, bank_ifsc, bank_branch, terms_and_conditions,
      watermark_enabled, watermark_text, signature_url, signature_title,
      gst_invoice_prefix, nongst_invoice_prefix, purchase_invoice_prefix,
      primary_color, secondary_color, deals_in, business_services, footer_text
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    "shop",
    updated.shopName,
    updated.tagline,
    updated.ownerName,
    updated.phone,
    updated.address,
    updated.gstin,
    updated.defaultGst,
    updated.invoicePrefix,
    updated.openingCash,
    updated.shopLatitude ?? 28.5355,
    updated.shopLongitude ?? 77.3910,
    updated.allowedRadiusMeters ?? 200,
    updated.logoUrl ?? "/shri_sai_logo.png",
    updated.brandsBannerUrl ?? "/brands_banner.png",
    updated.locationQrUrl ?? "/location_qr.png",
    updated.upiId ?? "8770758326@upi",
    updated.upiQrUrl ?? null,
    updated.city ?? "Harda",
    updated.state ?? "Madhya Pradesh",
    updated.stateCode ?? "23",
    updated.pincode ?? "461331",
    updated.pan ?? "ASFPG1385D",
    updated.whatsapp ?? updated.phone,
    updated.email ?? "saimobileharda@gmail.com",
    updated.website ?? null,
    updated.bankName ?? "State Bank of India",
    updated.bankAccountNo ?? "39810293847",
    updated.bankIfsc ?? "SBIN0000382",
    updated.bankBranch ?? "Main Branch, Harda",
    updated.termsAndConditions ? JSON.stringify(updated.termsAndConditions) : null,
    updated.watermarkEnabled !== false ? 1 : 0,
    updated.watermarkText ?? "SHRI SAI MOBILE",
    updated.signatureUrl ?? null,
    updated.signatureTitle ?? "Authorised Signatory",
    updated.gstInvoicePrefix ?? "GST/2026-27/",
    updated.nongstInvoicePrefix ?? "NG/2026-27/",
    updated.purchaseInvoicePrefix ?? "PUR/2026-27/",
    updated.primaryColor ?? "#000000",
    updated.secondaryColor ?? "#f97316",
    updated.dealsIn ?? "Mobile Phones & Electronics Items",
    updated.businessServices ?? "SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE",
    updated.footerText ?? "MOBILES | ACCESSORIES | SMART DEVICES | YOUR TRUSTED MOBILE PARTNER"
  );

  return updated;
}

export function resetDemoData(db: DatabaseSync): void {
  resetDatabase(db);
}

export function wipeStoreData(db: DatabaseSync): void {
  wipeAllData(db);
}
