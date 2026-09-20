import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHead,
  Field,
  Input,
  PageHead,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import type { InvoiceTemplateType, Settings } from "@/lib/types";
import { InvoiceDocument } from "@/components/invoice/InvoiceDocument";
import { InvoiceModal } from "@/components/invoice/InvoiceModal";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [{ title: "Store Settings & Invoice Templates — Mobile Store ERP" }],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const { db, updateSettings, resetDemo, wipeAllData } = useStore();
  const [form, setForm] = useState<Settings>(db.settings);
  const [activeTab, setActiveTab] = useState<
    "profile" | "bank" | "invoice_config" | "terms" | "templates" | "system"
  >("profile");
  const [previewTemplate, setPreviewTemplate] = useState<InvoiceTemplateType>("GST_SALE");
  const [modalOpen, setModalOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [wipeConfirm, setWipeConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  // MongoDB Cloud Sync state
  const [cloudStatus, setCloudStatus] = useState<{
    connected: boolean;
    database?: string;
    error?: string;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/cloud/status")
      .then((res) => res.json())
      .then((data) => setCloudStatus(data))
      .catch(() => setCloudStatus({ connected: false, error: "Cloud API unreachable" }));
  }, []);

  const handleCloudSync = async () => {
    setSyncing(true);
    setSyncSuccess(null);
    try {
      const res = await fetch("/api/cloud/sync", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        const total = Object.values(data.syncedCounts || {}).reduce(
          (a: any, b: any) => a + b,
          0,
        );
        setSyncSuccess(
          `Successfully backed up ${total} records across ${Object.keys(data.syncedCounts || {}).length} collections to MongoDB Atlas!`,
        );
      } else {
        alert(data.error || "Sync failed");
      }
    } catch (err: any) {
      alert(`Sync error: ${err.message || err}`);
    } finally {
      setSyncing(false);
    }
  };

  // Term editing state
  const [newTermText, setNewTermText] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleReset = () => {
    resetDemo();
    setResetConfirm(false);
  };

  const handleWipe = () => {
    wipeAllData();
    setWipeConfirm(false);
  };

  const handleAddTerm = () => {
    if (!newTermText.trim()) return;
    const currentTerms = form.termsAndConditions || [];
    const updatedTerms = [...currentTerms, newTermText.trim()];
    const updatedForm = { ...form, termsAndConditions: updatedTerms };
    setForm(updatedForm);
    updateSettings(updatedForm);
    setNewTermText("");
  };

  const handleDeleteTerm = (index: number) => {
    const currentTerms = form.termsAndConditions || [];
    const updatedTerms = currentTerms.filter((_, i) => i !== index);
    const updatedForm = { ...form, termsAndConditions: updatedTerms };
    setForm(updatedForm);
    updateSettings(updatedForm);
  };

  const handleResetDefaultTerms = () => {
    const defaultTerms = [
      "Goods once sold will not be taken back or exchanged.",
      "Manufacturer warranty will be applicable as per company policy.",
      "Subject to Harda (M.P.) Jurisdiction only.",
      "Please verify your GST details & items before leaving.",
      "No cash refund. Exchange as per company policy.",
      "Finance/EMI is subject to company's terms & conditions.",
      "Late payment charges @ 2% per month on outstanding.",
      "Cheque bounce charges ₹500/- per cheque.",
      "All disputes subject to Harda (M.P.) jurisdiction only.",
      "Thank you for shopping with SHRI SAI MOBILE.",
    ];
    const updatedForm = { ...form, termsAndConditions: defaultTerms };
    setForm(updatedForm);
    updateSettings(updatedForm);
  };

  // Sample data generators for preview
  const getPreviewProps = (templateType: InvoiceTemplateType) => {
    if (templateType === "NON_GST_SALE") {
      return {
        type: templateType,
        settings: form,
        invoiceNo: "NG/2026-27/0104",
        invoiceDate: new Date().toISOString().slice(0, 10),
        party: {
          name: "Vikram Rathore",
          phone: "9826011223",
          mobile: "9826011223",
          address: "Civil Lines, Harda",
          city: "Harda",
          state: "Madhya Pradesh",
          stateCode: "23",
          isUnregistered: true,
        },
        items: [
          {
            name: "boAt Rockerz 255 Pro+ Wireless Earphones",
            qty: 1,
            unit: "PCS",
            rateExclTax: 1299,
            rateInclTax: 1299,
            discountPct: 8,
            discountAmount: 100,
            totalAmount: 1199,
          },
          {
            name: "Matte Silicone Shockproof Back Cover",
            qty: 2,
            unit: "PCS",
            rateExclTax: 249,
            rateInclTax: 249,
            discountPct: 0,
            discountAmount: 0,
            totalAmount: 498,
          },
          {
            name: "11D Edge-to-Edge Tempered Glass Screen Guard",
            qty: 1,
            unit: "PCS",
            rateExclTax: 199,
            rateInclTax: 199,
            discountPct: 0,
            discountAmount: 0,
            totalAmount: 199,
          },
        ],
        totals: {
          totalQty: 4,
          grossAmount: 1996,
          subtotal: 1896,
          discount: 100,
          grandTotal: 1896,
        },
        payment: {
          mode: "UPI",
          paid: 1896,
          due: 0,
        },
      };
    }

    if (templateType === "GST_PURCHASE") {
      return {
        type: templateType,
        settings: form,
        invoiceNo: "26-27/Oppo/1270",
        invoiceDate: "2026-09-15",
        originalInvoiceNo: "OPPO-IND-8812",
        ewayBillNo: "231456789012",
        deliveryNoteNo: "DN-2627-89",
        placeOfSupply: "Madhya Pradesh (23)",
        stateCode: "23",
        party: {
          name: "Ramniwas Sumit Kumar Maheshwari",
          gstin: "23ABJFR0427Q1ZW",
          address: "14 Maharani Road, Siyaganj, Indore",
          city: "Indore",
          state: "Madhya Pradesh",
          stateCode: "23",
          phone: "9425088112",
          email: "rskm.oppo@gmail.com",
          contactPerson: "Sumit Maheshwari",
        },
        items: [
          {
            name: "OPPO F33 PRO 5G (8GB/256GB Starry Black)",
            hsnSac: "85171300",
            imeis: ["864903061234501"],
            qty: 1,
            unit: "PCS",
            rateExclTax: 31440.68,
            rateInclTax: 37100.0,
            discountPct: 0,
            taxableAmount: 31440.68,
            gstRate: 18,
            cgstPct: 9,
            cgstAmount: 2829.66,
            sgstPct: 9,
            sgstAmount: 2829.66,
            totalAmount: 37100.0,
          },
          {
            name: "OPPO F33 PRO 5G (8GB/128GB Mirror Purple)",
            hsnSac: "85171300",
            imeis: ["864903061234502", "864903061234503"],
            qty: 2,
            unit: "PCS",
            rateExclTax: 28898.31,
            rateInclTax: 34100.0,
            discountPct: 0,
            taxableAmount: 57796.61,
            gstRate: 18,
            cgstPct: 9,
            cgstAmount: 5201.69,
            sgstPct: 9,
            sgstAmount: 5201.69,
            totalAmount: 68200.0,
          },
          {
            name: "OPPO A6X 5G (4GB/64GB Feather Blue)",
            hsnSac: "85171300",
            imeis: ["864903061234504", "864903061234505"],
            qty: 2,
            unit: "PCS",
            rateExclTax: 20883.47,
            rateInclTax: 24642.5,
            discountPct: 0,
            taxableAmount: 41766.95,
            gstRate: 18,
            cgstPct: 9,
            cgstAmount: 3759.03,
            sgstPct: 9,
            sgstAmount: 3759.03,
            totalAmount: 49285.0,
          },
        ],
        totals: {
          totalQty: 5,
          grossAmount: 131004.24,
          subtotal: 131004.24,
          taxableValue: 131004.24,
          cgstAmount: 11790.38,
          sgstAmount: 11790.38,
          igstAmount: 0,
          grandTotal: 154585.0,
        },
        payment: {
          mode: "Bank",
          paid: 100000,
          due: 54585,
        },
      };
    }

    if (templateType === "NON_GST_PURCHASE") {
      return {
        type: templateType,
        settings: form,
        invoiceNo: "PUR/NG/2026-27/088",
        invoiceDate: "2026-09-16",
        party: {
          name: "Metro Gadget Wholesale Agency",
          phone: "9971588120",
          address: "Gaffar Market, Karol Bagh",
          city: "Delhi",
          state: "Delhi",
          stateCode: "07",
        },
        items: [
          {
            name: "Fast Charging Type-C to Type-C Braided Cables",
            qty: 50,
            unit: "PCS",
            rateExclTax: 95,
            rateInclTax: 95,
            discountPct: 0,
            totalAmount: 4750,
          },
          {
            name: "Universal Tempered Glass Display Protectors",
            qty: 100,
            unit: "PCS",
            rateExclTax: 45,
            rateInclTax: 45,
            discountPct: 0,
            totalAmount: 4500,
          },
        ],
        totals: {
          totalQty: 150,
          grossAmount: 9250,
          subtotal: 9250,
          grandTotal: 9250,
        },
        payment: {
          mode: "Cash",
          paid: 9250,
          due: 0,
        },
      };
    }

    if (templateType === "SALE_RETURN") {
      return {
        type: templateType,
        settings: form,
        invoiceNo: "CN-2026-0042",
        invoiceDate: new Date().toISOString().slice(0, 10),
        originalInvoiceNo: "GST/2026-27/0045",
        remarks: "Customer DOA replacement exchange",
        party: {
          name: "Rahul Sharma",
          phone: "9811044521",
          address: "Main Road, Harda",
          city: "Harda",
          state: "Madhya Pradesh",
          stateCode: "23",
          isUnregistered: true,
        },
        items: [
          {
            name: "Samsung Galaxy A15 5G (8GB/128GB Blue)",
            hsnSac: "85171300",
            imeis: ["352201998811221"],
            qty: 1,
            unit: "PCS",
            rateExclTax: 15200,
            rateInclTax: 17936,
            taxableAmount: 15200,
            cgstPct: 9,
            cgstAmount: 1368,
            sgstPct: 9,
            sgstAmount: 1368,
            totalAmount: 17936,
          },
        ],
        totals: {
          totalQty: 1,
          grossAmount: 15200,
          subtotal: 15200,
          taxableValue: 15200,
          cgstAmount: 1368,
          sgstAmount: 1368,
          grandTotal: 17936,
        },
        payment: {
          mode: "Credit Note / Store Credit",
          paid: 17936,
          due: 0,
        },
      };
    }

    if (templateType === "PURCHASE_RETURN") {
      return {
        type: templateType,
        settings: form,
        invoiceNo: "DN-2026-0018",
        invoiceDate: new Date().toISOString().slice(0, 10),
        originalInvoiceNo: "2627TTRM/695",
        remarks: "TDS 194R Deduction on Quarterly Target Incentive Scheme",
        party: {
          name: "Tanay Traders",
          gstin: "23AQDPA6961H2Z2",
          address: "Shopping Complex, Harda, Madhya Pradesh",
          city: "Harda",
          state: "Madhya Pradesh",
          stateCode: "23",
          phone: "9826077889",
        },
        items: [
          {
            name: "TDS 194R Withholding on Dealer Target Scheme Voucher",
            hsnSac: "998311",
            qty: 1,
            unit: "JOB",
            rateExclTax: 2000,
            rateInclTax: 2000,
            taxableAmount: 2000,
            totalAmount: 2000,
          },
        ],
        totals: {
          totalQty: 1,
          grossAmount: 2000,
          subtotal: 2000,
          tdsAmount: 200,
          grandTotal: 2000,
        },
      };
    }

    // Default: GST_SALE
    return {
      type: "GST_SALE" as const,
      settings: form,
      invoiceNo: "GST/2026-27/0001",
      invoiceDate: new Date().toISOString().slice(0, 10),
      originalInvoiceNo: "ORD-2026-9921",
      ewayBillNo: "231908123456",
      placeOfSupply: "Madhya Pradesh (23)",
      stateCode: "23",
      party: {
        name: "Rajesh Kumar Sharma",
        phone: "9826011223",
        mobile: "9826011223",
        address: "Near Old Bus Stand, Harda (M.P.)",
        city: "Harda",
        state: "Madhya Pradesh",
        stateCode: "23",
        isUnregistered: true,
      },
      items: [
        {
          name: "OPPO F33 PRO 5G (8GB/256GB Starry Black)",
          hsnSac: "85171300",
          imeis: ["864903061234501"],
          qty: 1,
          unit: "PCS",
          rateExclTax: 31440.68,
          rateInclTax: 37100.0,
          discountPct: 0,
          taxableAmount: 31440.68,
          gstRate: 18,
          cgstPct: 9,
          cgstAmount: 2829.66,
          sgstPct: 9,
          sgstAmount: 2829.66,
          totalAmount: 37100.0,
        },
        {
          name: "Realme C83 5G (6GB/128GB Emerald Green)",
          hsnSac: "85171300",
          imeis: ["865412061234601"],
          qty: 1,
          unit: "PCS",
          rateExclTax: 15863.56,
          rateInclTax: 18719.0,
          discountPct: 0,
          taxableAmount: 15863.56,
          gstRate: 18,
          cgstPct: 9,
          cgstAmount: 1427.72,
          sgstPct: 9,
          sgstAmount: 1427.72,
          totalAmount: 18719.0,
        },
        {
          name: "33W SuperVOOC Fast Charging Adapter + Type-C Cable",
          hsnSac: "85044090",
          qty: 1,
          unit: "SET",
          rateExclTax: 287.29,
          rateInclTax: 339.0,
          discountPct: 0,
          taxableAmount: 287.29,
          gstRate: 18,
          cgstPct: 9,
          cgstAmount: 25.86,
          sgstPct: 9,
          sgstAmount: 25.86,
          totalAmount: 339.0,
        },
      ],
      totals: {
        totalQty: 3,
        grossAmount: 47591.53,
        subtotal: 47591.53,
        taxableValue: 47591.53,
        cgstAmount: 4283.24,
        sgstAmount: 4283.24,
        igstAmount: 0,
        roundOff: 0.23,
        grandTotal: 56158.0,
      },
      payment: {
        mode: "EMI",
        isEmi: true,
        emiCompanyName: "Bajaj Finserv",
        emiDownPayment: 16158,
        emiFinancedAmount: 40000,
        paid: 16158,
        due: 0,
      },
    };
  };

  const previewProps = getPreviewProps(previewTemplate);

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <PageHead
        title="Store Settings & Invoice Templates"
        sub="Configure shop identity, GST compliance, bank accounts, Terms & Conditions, and preview professional A4 invoice designs."
      />

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-700/60 pb-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("profile")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "profile"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          🏪 Shop Profile
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bank")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "bank"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          🏦 Bank & UPI
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("invoice_config")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "invoice_config"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          🧾 Invoice Numbering & Watermark
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("terms")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "terms"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          📋 Terms & Conditions ({form.termsAndConditions?.length || 10})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("templates")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "templates"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          👁️ Template Previews (A4)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`px-3 py-2 text-xs font-semibold rounded-md transition-colors ${
            activeTab === "system"
              ? "bg-orange-500 text-white shadow-sm"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          ⚙️ Geo-Fencing & Database
        </button>
      </div>

      {/* TAB 1: SHOP PROFILE */}
      {activeTab === "profile" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHead
              title="Shop Identity & Primary Branding"
              sub="Appears on invoice headers, receipts, reports, and dealer communication"
            />
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Shop Name *">
                <Input
                  required
                  value={form.shopName}
                  onChange={(e) => setForm({ ...form, shopName: e.target.value })}
                  placeholder="e.g. SHRI SAI MOBILE"
                />
              </Field>

              <Field label="Shop Tagline">
                <Input
                  value={form.tagline}
                  onChange={(e) => setForm({ ...form, tagline: e.target.value })}
                  placeholder="e.g. NO NEED TO WORRY"
                />
              </Field>

              <Field label="Owner / Proprietor Name *">
                <Input
                  required
                  value={form.ownerName}
                  onChange={(e) => setForm({ ...form, ownerName: e.target.value })}
                />
              </Field>

              <Field label="Phone / Support Mobile *">
                <Input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </Field>

              <Field label="WhatsApp Contact">
                <Input
                  value={form.whatsapp || ""}
                  onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                  placeholder="e.g. 8770758326"
                />
              </Field>

              <Field label="Official Email">
                <Input
                  type="email"
                  value={form.email || ""}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="e.g. saimobileharda@gmail.com"
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Complete Store Address">
                  <Input
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="In Front of Court, Near Prashant Restaurant..."
                  />
                </Field>
              </div>

              <Field label="City">
                <Input
                  value={form.city || ""}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>

              <Field label="State">
                <Input
                  value={form.state || ""}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </Field>

              <Field label="State Code (e.g. 23 for MP)">
                <Input
                  value={form.stateCode || ""}
                  onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                />
              </Field>

              <Field label="Pincode">
                <Input
                  value={form.pincode || ""}
                  onChange={(e) => setForm({ ...form, pincode: e.target.value })}
                />
              </Field>

              <Field label="Store GSTIN">
                <Input
                  value={form.gstin}
                  onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                  placeholder="23ASFPG1385D1Z7"
                />
              </Field>

              <Field label="Income Tax PAN">
                <Input
                  value={form.pan || ""}
                  onChange={(e) => setForm({ ...form, pan: e.target.value.toUpperCase() })}
                  placeholder="ASFPG1385D"
                />
              </Field>

              <Field label="Deals In (Header subtitle)">
                <Input
                  value={form.dealsIn || ""}
                  onChange={(e) => setForm({ ...form, dealsIn: e.target.value })}
                  placeholder="Mobile Phones & Electronics Items"
                />
              </Field>

              <Field label="Business Services (Header tag)">
                <Input
                  value={form.businessServices || ""}
                  onChange={(e) => setForm({ ...form, businessServices: e.target.value })}
                  placeholder="SALES | SERVICE | ACCESSORIES | EXCHANGE | FINANCE"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Brand Assets & Visual Images" sub="Upload or link high-resolution logos and banners" />
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Field label="Logo Image URL">
                  <Input
                    value={form.logoUrl || ""}
                    onChange={(e) => setForm({ ...form, logoUrl: e.target.value })}
                    placeholder="/shri_sai_logo.png"
                  />
                </Field>
                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 flex items-center justify-center h-16">
                  <img src={form.logoUrl || "/shri_sai_logo.png"} alt="Logo" className="max-h-12 w-auto object-contain" />
                </div>
              </div>

              <div>
                <Field label="Brands Banner URL">
                  <Input
                    value={form.brandsBannerUrl || ""}
                    onChange={(e) => setForm({ ...form, brandsBannerUrl: e.target.value })}
                    placeholder="/brands_banner.png"
                  />
                </Field>
                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 flex items-center justify-center h-16">
                  <img src={form.brandsBannerUrl || "/brands_banner.png"} alt="Brands" className="max-h-12 w-auto object-contain bg-white rounded px-1" />
                </div>
              </div>

              <div>
                <Field label="Location / UPI QR Code URL">
                  <Input
                    value={form.locationQrUrl || ""}
                    onChange={(e) => setForm({ ...form, locationQrUrl: e.target.value })}
                    placeholder="/location_qr.png"
                  />
                </Field>
                <div className="mt-2 p-2 bg-slate-900 rounded border border-slate-800 flex items-center justify-center h-16">
                  <img src={form.locationQrUrl || "/location_qr.png"} alt="QR" className="max-h-12 w-auto object-contain bg-white rounded p-0.5" />
                </div>
              </div>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            {saved && <span className="text-xs text-emerald-400 font-bold">✓ Shop Profile updated successfully!</span>}
            <Button type="submit" className="bg-orange-600 hover:bg-orange-500 font-bold">Save Shop Profile</Button>
          </div>
        </form>
      )}

      {/* TAB 2: BANK & UPI */}
      {activeTab === "bank" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHead title="Bank Account Details" sub="Appears on customer invoices for direct NEFT/RTGS/IMPS payments" />
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Bank Name">
                <Input
                  value={form.bankName || ""}
                  onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                  placeholder="State Bank of India"
                />
              </Field>

              <Field label="Account Number">
                <Input
                  value={form.bankAccountNo || ""}
                  onChange={(e) => setForm({ ...form, bankAccountNo: e.target.value })}
                  placeholder="39810293847"
                />
              </Field>

              <Field label="IFSC Code">
                <Input
                  value={form.bankIfsc || ""}
                  onChange={(e) => setForm({ ...form, bankIfsc: e.target.value.toUpperCase() })}
                  placeholder="SBIN0000382"
                />
              </Field>

              <Field label="Branch Name">
                <Input
                  value={form.bankBranch || ""}
                  onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                  placeholder="Main Branch, Harda"
                />
              </Field>

              <Field label="UPI ID (VPA)">
                <Input
                  value={form.upiId || ""}
                  onChange={(e) => setForm({ ...form, upiId: e.target.value })}
                  placeholder="8770758326@upi"
                />
              </Field>

              <Field label="Opening Cash in Counter (₹)">
                <Input
                  type="number"
                  value={form.openingCash}
                  onChange={(e) => setForm({ ...form, openingCash: Number(e.target.value) })}
                />
              </Field>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            {saved && <span className="text-xs text-emerald-400 font-bold">✓ Bank credentials saved!</span>}
            <Button type="submit" className="bg-orange-600 hover:bg-orange-500 font-bold">Save Bank Settings</Button>
          </div>
        </form>
      )}

      {/* TAB 3: INVOICE CONFIGURATION */}
      {activeTab === "invoice_config" && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <Card>
            <CardHead title="Numbering Sequence Prefixes" sub="Ensures unique commercial invoice identifiers" />
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="GST Sales Invoice Prefix">
                <Input
                  value={form.gstInvoicePrefix || "GST/2026-27/"}
                  onChange={(e) => setForm({ ...form, gstInvoicePrefix: e.target.value })}
                  placeholder="GST/2026-27/"
                />
              </Field>

              <Field label="Non-GST Sales Prefix">
                <Input
                  value={form.nongstInvoicePrefix || "NG/2026-27/"}
                  onChange={(e) => setForm({ ...form, nongstInvoicePrefix: e.target.value })}
                  placeholder="NG/2026-27/"
                />
              </Field>

              <Field label="Purchase Invoice Prefix">
                <Input
                  value={form.purchaseInvoicePrefix || "PUR/2026-27/"}
                  onChange={(e) => setForm({ ...form, purchaseInvoicePrefix: e.target.value })}
                  placeholder="PUR/2026-27/"
                />
              </Field>

              <Field label="Customer Order Prefix">
                <Input
                  value={form.orderPrefix || "ORD-"}
                  onChange={(e) => setForm({ ...form, orderPrefix: e.target.value })}
                  placeholder="ORD-"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHead title="Order Management & Stock Reservation" sub="Controls for pre-orders and advance customer bookings" />
            <div className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="reserveStockOnOrder"
                  checked={Boolean(form.reserveStockOnOrder)}
                  onChange={(e) => setForm({ ...form, reserveStockOnOrder: e.target.checked })}
                  className="mt-0.5 rounded text-primary focus:ring-primary h-4 w-4 border-slate-300"
                />
                <div>
                  <label htmlFor="reserveStockOnOrder" className="text-sm font-semibold text-foreground cursor-pointer">
                    Soft-Reserve Inventory on Confirmed Orders
                  </label>
                  <p className="text-xs text-muted-foreground">
                    When enabled, confirmed customer orders place a hold on product quantity or assigned IMEI so items are not accidentally sold at the POS counter before order pickup.
                  </p>
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Watermark & Signatory Controls" sub="Customizable security and authentication attributes" />
            <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="watermarkEnabled"
                  checked={form.watermarkEnabled !== false}
                  onChange={(e) => setForm({ ...form, watermarkEnabled: e.target.checked })}
                  className="rounded text-orange-500 focus:ring-orange-500 h-4 w-4 bg-slate-900 border-slate-700"
                />
                <label htmlFor="watermarkEnabled" className="text-xs font-semibold text-slate-200">
                  Enable Faint Center Watermark on Invoices
                </label>
              </div>

              <Field label="Watermark Brand Text">
                <Input
                  value={form.watermarkText || "SHRI SAI MOBILE"}
                  onChange={(e) => setForm({ ...form, watermarkText: e.target.value })}
                  placeholder="SHRI SAI MOBILE"
                />
              </Field>

              <Field label="Authorised Signatory Designation">
                <Input
                  value={form.signatureTitle || "Authorised Signatory"}
                  onChange={(e) => setForm({ ...form, signatureTitle: e.target.value })}
                  placeholder="Authorised Signatory"
                />
              </Field>

              <Field label="Optional Signatory Signature Image URL">
                <Input
                  value={form.signatureUrl || ""}
                  onChange={(e) => setForm({ ...form, signatureUrl: e.target.value })}
                  placeholder="https://.../signature.png"
                />
              </Field>
            </div>
          </Card>

          <div className="flex items-center justify-between">
            {saved && <span className="text-xs text-emerald-400 font-bold">✓ Numbering & watermark updated!</span>}
            <Button type="submit" className="bg-orange-600 hover:bg-orange-500 font-bold">Save Configuration</Button>
          </div>
        </form>
      )}

      {/* TAB 4: TERMS & CONDITIONS */}
      {activeTab === "terms" && (
        <div className="space-y-4">
          <Card>
            <CardHead
              title="Invoice Terms & Conditions Policy"
              sub="These numbered terms print on the bottom-left of every customer and dealer bill"
            />
            <div className="p-4 space-y-3">
              {/* Add New Term */}
              <div className="flex gap-2">
                <Input
                  value={newTermText}
                  onChange={(e) => setNewTermText(e.target.value)}
                  placeholder="Enter a new terms point (e.g. Warranty is subject to brand service center...)"
                  className="flex-1"
                />
                <Button onClick={handleAddTerm} className="bg-orange-600 hover:bg-orange-500 shrink-0">
                  + Add Term
                </Button>
              </div>

              {/* Term List */}
              <div className="divide-y divide-slate-800 border border-slate-800 rounded-md bg-slate-900/50">
                {(form.termsAndConditions || []).map((term, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-start gap-2 flex-1">
                      <span className="font-bold text-orange-400 shrink-0">{idx + 1}.</span>
                      <span className="text-slate-200">{term}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteTerm(idx)}
                      className="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" size="sm" onClick={handleResetDefaultTerms} className="text-xs">
                  Restore Default SHRI SAI MOBILE Terms
                </Button>
                <div className="text-xs text-slate-400">
                  Changes save automatically to the database.
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 5: TEMPLATE PREVIEWS (A4) */}
      {activeTab === "templates" && (
        <div className="space-y-4">
          <Card>
            <div className="p-3 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">Select Template:</span>
                <select
                  value={previewTemplate}
                  onChange={(e) => setPreviewTemplate(e.target.value as InvoiceTemplateType)}
                  className="bg-slate-800 text-white text-xs border border-slate-700 rounded px-3 py-1.5 focus:outline-none focus:border-orange-500 font-semibold"
                >
                  <option value="GST_SALE">1. GST Sales Invoice (Tax Invoice)</option>
                  <option value="NON_GST_SALE">2. Non-GST Sales Invoice (Cash / Retail)</option>
                  <option value="GST_PURCHASE">3. GST Purchase Invoice (Dealer Bill)</option>
                  <option value="NON_GST_PURCHASE">4. Non-GST Purchase Invoice</option>
                  <option value="SALE_RETURN">5. Sale Return (Credit Note)</option>
                  <option value="PURCHASE_RETURN">6. Purchase Return / Debit Note (TDS 194R)</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => setModalOpen(true)}
                  className="bg-orange-600 hover:bg-orange-500 text-white font-bold text-xs gap-1.5"
                >
                  <span>🖨️</span> Open Fullscreen Modal / Print
                </Button>
              </div>
            </div>

            {/* Embedded Live Preview */}
            <div className="p-4 bg-slate-800/40 overflow-x-auto flex justify-center">
              <div className="scale-90 md:scale-95 origin-top w-full max-w-[850px]">
                <InvoiceDocument {...previewProps} />
              </div>
            </div>
          </Card>

          {/* Modal if clicked */}
          <InvoiceModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            {...previewProps}
          />
        </div>
      )}

      {/* TAB 6: SYSTEM & GEO-FENCING */}
      {activeTab === "system" && (
        <div className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Card>
              <CardHead
                title="Shop Geo-Fencing & Attendance GPS"
                sub="Coordinates used to enforce mobile shop radius check-ins"
              />
              <div className="p-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Field label="Shop Latitude">
                  <Input
                    type="number"
                    step="any"
                    value={form.shopLatitude || 28.5355}
                    onChange={(e) => setForm({ ...form, shopLatitude: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Shop Longitude">
                  <Input
                    type="number"
                    step="any"
                    value={form.shopLongitude || 77.3910}
                    onChange={(e) => setForm({ ...form, shopLongitude: Number(e.target.value) })}
                  />
                </Field>

                <Field label="Allowed Check-In Radius (Meters)">
                  <Input
                    type="number"
                    value={form.allowedRadiusMeters || 200}
                    onChange={(e) => setForm({ ...form, allowedRadiusMeters: Number(e.target.value) })}
                  />
                </Field>
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="submit" className="bg-orange-600 hover:bg-orange-500 font-bold">
                Save Geo-Fencing Settings
              </Button>
            </div>
          </form>

          {/* MongoDB Atlas Cloud Sync */}
          <Card className="border-emerald-200/80 bg-emerald-50/20">
            <CardHead
              title="MongoDB Atlas Cloud Database & Realtime Backup"
              sub="Secure cloud data synchronization to MongoDB Atlas Cluster"
            />
            <div className="p-4 space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-border/80">
                <div className="flex items-center gap-3">
                  <div
                    className={`size-3 rounded-full ${
                      cloudStatus?.connected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"
                    }`}
                  />
                  <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>Connection Status:</span>
                      <span className={cloudStatus?.connected ? "text-emerald-700" : "text-amber-700"}>
                        {cloudStatus?.connected ? "Active & Connected" : "Connecting..."}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      Cluster: cluster0.evdf063.mongodb.net | DB:{" "}
                      {cloudStatus?.database || "mobile_shop_erp"}
                    </div>
                  </div>
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleCloudSync}
                  disabled={syncing}
                  className="gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600"
                >
                  {syncing ? "Syncing to Cloud..." : "Sync to MongoDB Atlas Now"}
                </Button>
              </div>

              {syncSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 font-semibold">
                  ✓ {syncSuccess}
                </div>
              )}

              <p className="text-[12px] text-muted-foreground">
                Your shop operates with maximum speed locally via SQLite (even during internet
                outages), while your inventory, sales, customer ledgers, and orders are continuously
                backed up to your MongoDB Atlas cloud database.
              </p>
            </div>
          </Card>

          {/* Database Reset & Wipe */}
          <Card className="border-destructive/30">
            <CardHead
              title="Database Management & Clean Slate"
              sub="Local SQLite storage located at ./data/store.sqlite"
            />
            <div className="p-4 space-y-4">
              {/* Option 1: Clean Slate (Erase All Data) */}
              <div className="p-3.5 rounded-lg border border-red-500/20 bg-red-950/10 space-y-2.5">
                <div className="font-semibold text-xs text-red-400 flex items-center gap-1.5">
                  <span>🗑️</span>
                  <span>Wipe All Store Data (Clean Slate / 0 Records)</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Permanently erase all products, IMEI stock units, customer orders, sales, purchase bills, repair jobs, customer & supplier ledgers. Your shop profile and default payment accounts remain configured with ₹0 balance.
                </p>
                {wipeConfirm ? (
                  <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 space-y-2">
                    <div className="text-[12.5px] font-semibold text-red-400">
                      ⚠️ Are you sure? All products, sales, orders, and customer records will be completely erased!
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" onClick={handleWipe}>
                        Yes, Erase All Data Completely
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setWipeConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="danger" size="sm" onClick={() => setWipeConfirm(true)}>
                    Erase All Data (Clean Slate)
                  </Button>
                )}
              </div>

              {/* Option 2: Reset Demo Sample Data */}
              <div className="p-3.5 rounded-lg border border-border bg-foreground/2 space-y-2.5">
                <div className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                  <span>🔄</span>
                  <span>Restore Demo Sample Data</span>
                </div>
                <p className="text-[12px] text-muted-foreground">
                  Reset the database back to standard sample mock data (smartphones, sample customers, mock sales & purchase bills).
                </p>
                {resetConfirm ? (
                  <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 space-y-2">
                    <div className="text-[12.5px] font-semibold text-destructive">
                      This will replace current data with default mock demo records.
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" onClick={handleReset}>
                        Yes, Restore Demo Data
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setResetConfirm(false)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setResetConfirm(true)}>
                    Restore Demo Sample Data
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
