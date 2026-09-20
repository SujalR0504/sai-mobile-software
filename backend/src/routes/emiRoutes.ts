import { calculateEMI, validateEMIInputs } from "../../../shared/utils/emi";
import {
  createEMIAccountAndSchedule,
  createEMIReceivable,
  createFinanceCompany,
  deleteFinanceCompany,
  forecloseEMIAccount,
  getComprehensiveEMIReport,
  getEMIAccountById,
  getEMIAccounts,
  getEMIDashboardMetrics,
  getEMIReceivableById,
  getEMIReceivables,
  getEMIReceipts,
  getFinanceCompanies,
  recordEMICustomerPayment,
  recordEMIReceipt,
  updateFinanceCompany,
} from "../services/emiService";
import { errorResponse, jsonResponse, type RouteContext } from "./types";

export async function emiRoutes({ request, url, pathname, method, db }: RouteContext): Promise<Response | null> {
  // EMI & Finance Companies
  if (pathname === "/api/emi/companies" || pathname === "/api/finance-companies") {
    if (method === "GET") return jsonResponse(getFinanceCompanies(db));
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(createFinanceCompany(db, body), 201);
    }
  }

  const emiCompanyMatch = pathname.match(/^\/api\/(?:emi\/companies|finance-companies)\/([^/]+)$/);
  if (emiCompanyMatch) {
    const compId = emiCompanyMatch[1];
    if (method === "PUT" || method === "PATCH") {
      const body = await request.json();
      return jsonResponse(updateFinanceCompany(db, compId, body));
    }
    if (method === "DELETE") {
      deleteFinanceCompany(db, compId);
      return jsonResponse({ success: true });
    }
  }

  if (pathname === "/api/emi/dashboard" && method === "GET") {
    return jsonResponse(getEMIDashboardMetrics(db));
  }

  if (pathname === "/api/emi/receivables") {
    if (method === "GET") {
      const status = (url.searchParams.get("status") as any) || undefined;
      const companyId = url.searchParams.get("companyId") || undefined;
      const search = url.searchParams.get("search") || undefined;
      const fromDate = url.searchParams.get("fromDate") || undefined;
      const toDate = url.searchParams.get("toDate") || undefined;
      return jsonResponse(getEMIReceivables(db, { status, companyId, search, fromDate, toDate }));
    }
    if (method === "POST") {
      const body = await request.json();
      return jsonResponse(createEMIReceivable(db, body), 201);
    }
  }

  const emiReceivableMatch = pathname.match(/^\/api\/emi\/receivables\/([^/]+)$/);
  if (emiReceivableMatch && method === "GET") {
    const id = emiReceivableMatch[1];
    const rec = getEMIReceivableById(db, id);
    if (!rec) return errorResponse("EMI Receivable not found", 404, "NOT_FOUND");
    return jsonResponse(rec);
  }

  if (pathname === "/api/emi/receipt" && method === "POST") {
    const body = await request.json();
    return jsonResponse(recordEMIReceipt(db, body), 201);
  }

  if (pathname === "/api/emi/receipts" && method === "GET") {
    const emiReceivableId = url.searchParams.get("receivableId") || undefined;
    return jsonResponse(getEMIReceipts(db, { emiReceivableId }));
  }

  // Pure EMI calculation preview (Section 12)
  if (pathname === "/api/emi/calculate" && method === "POST") {
    const body = await request.json();
    const validation = validateEMIInputs(body);
    if (!validation.valid) {
      return errorResponse(Object.values(validation.errors).join("; "), 400, "VALIDATION_ERROR");
    }
    const result = calculateEMI(body);
    return jsonResponse(result);
  }

  // Customer EMI Accounts
  if (pathname === "/api/emi/accounts") {
    if (method === "GET") {
      const customerId = url.searchParams.get("customerId") || undefined;
      const status = url.searchParams.get("status") || undefined;
      const search = url.searchParams.get("search") || undefined;
      return jsonResponse(getEMIAccounts(db, { customerId, status, search }));
    }
    if (method === "POST") {
      const body = await request.json();
      const validation = validateEMIInputs(body);
      if (!validation.valid) {
        return errorResponse(Object.values(validation.errors).join("; "), 400, "VALIDATION_ERROR");
      }
      return jsonResponse(createEMIAccountAndSchedule(db, body), 201);
    }
  }

  const emiAccountMatch = pathname.match(/^\/api\/emi\/accounts\/([^/]+)$/);
  if (emiAccountMatch && method === "GET") {
    const id = emiAccountMatch[1];
    const acct = getEMIAccountById(db, id);
    if (!acct) return errorResponse("EMI Account not found", 404, "NOT_FOUND");
    return jsonResponse(acct);
  }

  const emiPaymentMatch = pathname.match(/^\/api\/emi\/accounts\/([^/]+)\/payment$/);
  if (emiPaymentMatch && method === "POST") {
    const id = emiPaymentMatch[1];
    const body = await request.json();
    return jsonResponse(recordEMICustomerPayment(db, { ...body, emiAccountId: id }), 201);
  }

  const emiForecloseMatch = pathname.match(/^\/api\/emi\/accounts\/([^/]+)\/foreclose$/);
  if (emiForecloseMatch && method === "POST") {
    const id = emiForecloseMatch[1];
    const body = await request.json();
    return jsonResponse(forecloseEMIAccount(db, { ...body, emiAccountId: id }), 200);
  }

  if (pathname === "/api/emi/reports/detailed" && method === "GET") {
    const filters = {
      fromDate: url.searchParams.get("fromDate") || undefined,
      toDate: url.searchParams.get("toDate") || undefined,
      customerId: url.searchParams.get("customerId") || undefined,
      companyId: url.searchParams.get("companyId") || undefined,
      status: url.searchParams.get("status") || undefined,
      salesPerson: url.searchParams.get("salesPerson") || undefined,
      productId: url.searchParams.get("productId") || undefined,
      imei: url.searchParams.get("imei") || undefined,
    };
    return jsonResponse(getComprehensiveEMIReport(db, filters));
  }

  return null;
}
