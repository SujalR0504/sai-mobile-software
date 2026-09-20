import { getSettings } from "../repositories/repository";
import { getCustomerDue } from "../services/duesAndPaymentsService";
import { getPurchaseById } from "../services/purchaseService";
import { getSaleById } from "../services/salesService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function invoiceRoutes({ pathname, method, db }: RouteContext): Promise<Response | null> {
  const invoiceMatch = pathname.match(/^\/api\/invoices\/([^/]+)$/);
  if (invoiceMatch && method === "GET") {
    const id = invoiceMatch[1];
    const settings = getSettings(db);

    // Try finding sale first
    const sale = getSaleById(db, id) || db.prepare("SELECT * FROM sales WHERE invoice_no = ?").get(id) as any;
    if (sale) {
      const fullSale = getSaleById(db, sale.id);
      const customer = db.prepare("SELECT * FROM customers WHERE id = ?").get(fullSale?.customerId) as any;
      const customerDue = fullSale?.customerId ? getCustomerDue(db, fullSale.customerId) : 0;

      return jsonResponse({
        success: true,
        type: "SALE",
        shop: {
          name: settings.shopName,
          tagline: settings.tagline,
          owner: settings.ownerName,
          phone: settings.phone,
          address: settings.address,
          gstin: settings.gstin,
        },
        transaction: fullSale,
        customer: customer || { name: "Cash Customer", phone: "" },
        customerDue,
      });
    }

    // Try finding purchase
    const purchase = getPurchaseById(db, id) || db.prepare("SELECT * FROM purchases WHERE invoice_no = ?").get(id) as any;
    if (purchase) {
      const fullPurchase = getPurchaseById(db, purchase.id);
      const supplier = db.prepare("SELECT * FROM suppliers WHERE id = ?").get(fullPurchase?.supplierId) as any;

      return jsonResponse({
        success: true,
        type: "PURCHASE",
        shop: {
          name: settings.shopName,
          address: settings.address,
          gstin: settings.gstin,
          phone: settings.phone,
        },
        transaction: fullPurchase,
        supplier: supplier || { name: "Supplier", phone: "" },
      });
    }

    return errorResponse("Invoice not found", 404, "NOT_FOUND");
  }

  return null;
}
