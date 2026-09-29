import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { Modal, Button, Badge } from "@/components/ui";
import { inr } from "@/lib/format";
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

interface ExcelProductImportModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParsedRow {
  index: number;
  category: string;
  subcategory: string;
  brand: string;
  model: string;
  sellingPrice: number;
  purchasePrice: number;
  gst: number;
  ram?: string;
  storage?: string;
  color?: string;
  barcode?: string;
  hsn?: string;
  tracked?: boolean;
  valid: boolean;
  error?: string;
}

export function ExcelProductImportModal({
  open,
  onClose,
  onSuccess,
}: ExcelProductImportModalProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = () => {
    setRows([]);
    setFileName("");
    setLoading(false);
    setImportResult(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleModalClose = () => {
    resetState();
    onClose();
  };

  // Download Sample Excel Template
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        Category: "Smartphones",
        Subcategory: "5G Phones",
        Brand: "Samsung",
        Model: "Galaxy A15 5G",
        SellingPrice: 15000,
        PurchasePrice: 13500,
        GST: 18,
        RAM: "8GB",
        Storage: "128GB",
        Color: "Blue",
        Tracked: "Yes",
      },
      {
        Category: "Smartphones",
        Subcategory: "5G Phones",
        Brand: "iQOO",
        Model: "Z9x 5G",
        SellingPrice: 12400,
        PurchasePrice: 11000,
        GST: 18,
        RAM: "6GB",
        Storage: "128GB",
        Color: "Storm Grey",
        Tracked: "Yes",
      },
      {
        Category: "Smartphones",
        Subcategory: "Flagship",
        Brand: "Apple",
        Model: "iPhone 15",
        SellingPrice: 69900,
        PurchasePrice: 64000,
        GST: 18,
        RAM: "6GB",
        Storage: "128GB",
        Color: "Black",
        Tracked: "Yes",
      },
      {
        Category: "Accessories",
        Subcategory: "Cases & Covers",
        Brand: "Samsung",
        Model: "Galaxy A15 Clear Case",
        SellingPrice: 499,
        PurchasePrice: 150,
        GST: 18,
        RAM: "",
        Storage: "",
        Color: "Transparent",
        Tracked: "No",
      },
      {
        Category: "Accessories",
        Subcategory: "Chargers",
        Brand: "Xiaomi",
        Model: "33W SonicCharge 2.0",
        SellingPrice: 999,
        PurchasePrice: 550,
        GST: 18,
        RAM: "",
        Storage: "",
        Color: "White",
        Tracked: "No",
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Products & Models");

    // Auto column width
    const colWidths = [
      { wch: 15 }, // Category
      { wch: 16 }, // Subcategory
      { wch: 14 }, // Brand
      { wch: 24 }, // Model
      { wch: 13 }, // SellingPrice
      { wch: 13 }, // PurchasePrice
      { wch: 8 },  // GST
      { wch: 8 },  // RAM
      { wch: 10 }, // Storage
      { wch: 12 }, // Color
      { wch: 10 }, // Tracked
    ];
    worksheet["!cols"] = colWidths;

    XLSX.writeFile(workbook, "Products_Hierarchy_Import_Template.xlsx");
  };

  // Helper to normalize keys from user Excel header names
  const normalizeKey = (key: string): string => {
    return key.toLowerCase().replace(/[^a-z0-9]/g, "");
  };

  // File Upload and Parse
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setErrorMsg("");
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!rawJson || rawJson.length === 0) {
          setErrorMsg("The selected Excel/CSV file is empty.");
          setRows([]);
          return;
        }

        const parsed: ParsedRow[] = rawJson.map((row, idx) => {
          // Flexible key lookup
          const rowMap: Record<string, any> = {};
          Object.keys(row).forEach((k) => {
            rowMap[normalizeKey(k)] = row[k];
          });

          const category = String(rowMap.category || rowMap.categories || "Smartphones").trim();
          const subcategory = String(rowMap.subcategory || rowMap.subcat || "").trim();
          const brand = String(rowMap.brand || rowMap.make || rowMap.company || "").trim();
          const model = String(rowMap.model || rowMap.modelname || rowMap.device || rowMap.product || "").trim();

          const sellingPrice = Number(rowMap.sellingprice || rowMap.price || rowMap.rate || rowMap.mrp || 0) || 0;
          const purchasePrice = Number(rowMap.purchaseprice || rowMap.costprice || rowMap.cost || 0) || 0;
          const gst = rowMap.gst !== undefined && rowMap.gst !== "" ? Number(rowMap.gst) : 18;

          const ram = String(rowMap.ram || "").trim();
          const storage = String(rowMap.storage || rowMap.rom || "").trim();
          const color = String(rowMap.color || rowMap.colour || "").trim();
          const barcode = String(rowMap.barcode || rowMap.sku || "").trim();
          const hsn = String(rowMap.hsn || "").trim();

          const trackedStr = String(rowMap.tracked || "").toLowerCase();
          const tracked =
            trackedStr === "yes" || trackedStr === "true" || trackedStr === "1"
              ? true
              : trackedStr === "no" || trackedStr === "false" || trackedStr === "0"
              ? false
              : /mobile|phone|tablet|smartphone/i.test(category);

          const valid = Boolean(brand && model);
          const error = !brand ? "Brand missing" : !model ? "Model missing" : undefined;

          return {
            index: idx + 1,
            category,
            subcategory,
            brand,
            model,
            sellingPrice,
            purchasePrice,
            gst,
            ram: ram || undefined,
            storage: storage || undefined,
            color: color || undefined,
            barcode: barcode || undefined,
            hsn: hsn || undefined,
            tracked,
            valid,
            error,
          };
        });

        setRows(parsed);
      } catch (err: any) {
        setErrorMsg("Failed to read Excel file: " + (err.message || "Invalid format"));
        setRows([]);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Submit Bulk Import to API
  const handleImportSubmit = async () => {
    const validRows = rows.filter((r) => r.valid);
    if (!validRows.length) {
      alert("No valid rows found to import. Please check Brand and Model columns.");
      return;
    }

    setLoading(true);
    setErrorMsg("");

    try {
      const payload = validRows.map((r) => ({
        category: r.category,
        subcategory: r.subcategory,
        brand: r.brand,
        model: r.model,
        sellingPrice: r.sellingPrice,
        purchasePrice: r.purchasePrice,
        gst: r.gst,
        ram: r.ram,
        storage: r.storage,
        color: r.color,
        barcode: r.barcode,
        hsn: r.hsn,
        tracked: r.tracked,
      }));

      const res = await fetch("/api/products/bulk-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Bulk import failed");
      }

      const result = await res.json();
      setImportResult(result);
      if (onSuccess) {
        onSuccess();
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to import rows");
    } finally {
      setLoading(false);
    }
  };

  const validCount = rows.filter((r) => r.valid).length;
  const invalidCount = rows.filter((r) => !r.valid).length;
  const uniqueCategories = new Set(rows.map((r) => r.category).filter(Boolean)).size;
  const uniqueBrands = new Set(rows.map((r) => r.brand).filter(Boolean)).size;
  const uniqueModels = new Set(rows.map((r) => `${r.brand}-${r.model}`).filter(Boolean)).size;

  return (
    <Modal
      open={open}
      onClose={handleModalClose}
      title="Bulk Import Products & Models (एक्सेल से बल्क इम्पोर्ट)"
      wide
    >
      <div className="space-y-4">
        {/* Dynamic Hierarchy Banner */}
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 font-bold text-[13px] text-primary">
              <Layers className="size-4" />
              <span>Dynamic Hierarchy Flow (Category → Subcategory → Brand → Model)</span>
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              Upload an Excel (.xlsx / .xls) or CSV sheet with the 4 hierarchy columns to automatically generate all categories, brands, phone models, and catalog products in bulk.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleDownloadTemplate}
            className="gap-1.5 font-bold bg-white hover:bg-slate-50 border-primary/30 text-primary shadow-2xs shrink-0 cursor-pointer"
          >
            <Download className="size-3.5" />
            <span>Download Sample Template (.xlsx)</span>
          </Button>
        </div>

        {/* Success View */}
        {importResult ? (
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-50/50 p-6 text-center space-y-4 animate-in-soft">
            <div className="size-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-emerald-900">
                Bulk Import Completed Successfully!
              </h3>
              <p className="text-[12.5px] text-emerald-700 mt-1">
                All models and products have been verified, linked in hierarchy, and added to the store catalog.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-w-xl mx-auto pt-1">
              <div className="bg-white/80 rounded-xl p-3 border border-emerald-200 shadow-2xs">
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">
                  Categories
                </span>
                <span className="text-xl font-bold font-mono text-foreground">
                  +{importResult.categoriesCreated || 0}
                </span>
              </div>
              <div className="bg-white/80 rounded-xl p-3 border border-emerald-200 shadow-2xs">
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">
                  Brands
                </span>
                <span className="text-xl font-bold font-mono text-foreground">
                  +{importResult.brandsCreated || 0}
                </span>
              </div>
              <div className="bg-white/80 rounded-xl p-3 border border-emerald-200 shadow-2xs">
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">
                  Models
                </span>
                <span className="text-xl font-bold font-mono text-foreground">
                  +{importResult.modelsCreated || 0}
                </span>
              </div>
              <div className="bg-white/80 rounded-xl p-3 border border-emerald-200 shadow-2xs">
                <span className="text-[10.5px] uppercase font-bold text-muted-foreground block">
                  Catalog Products
                </span>
                <span className="text-xl font-bold font-mono text-emerald-700">
                  +{importResult.productsCreated || 0}
                </span>
              </div>
            </div>

            <div className="pt-2">
              <Button variant="primary" onClick={handleModalClose}>
                Done & View Products
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* File Upload Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border/80 hover:border-primary/60 bg-muted/10 hover:bg-primary/[0.02] rounded-2xl p-6 text-center transition-all cursor-pointer space-y-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="size-11 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto group-hover:scale-105 transition-transform">
                <Upload className="size-5" />
              </div>
              <div>
                <span className="font-bold text-[13.5px] text-foreground block">
                  {fileName ? fileName : "Click or drag & drop Excel / CSV file here"}
                </span>
                <span className="text-[11.5px] text-muted-foreground block mt-0.5">
                  Supported formats: .xlsx, .xls, .csv (Must contain Category, Subcategory, Brand, Model columns)
                </span>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-[12px] text-destructive flex items-center gap-2">
                <AlertTriangle className="size-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Parsed Preview Table */}
            {rows.length > 0 && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[13px] text-foreground">
                      Parsed Preview ({rows.length} rows)
                    </span>
                    <Badge tone="success">{validCount} Valid</Badge>
                    {invalidCount > 0 && <Badge tone="danger">{invalidCount} Missing Fields</Badge>}
                  </div>

                  <div className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                    <span>{uniqueCategories} Categories</span>
                    <span>·</span>
                    <span>{uniqueBrands} Brands</span>
                    <span>·</span>
                    <span className="text-primary font-bold">{uniqueModels} Models</span>
                  </div>
                </div>

                <div className="rounded-xl border border-border/70 overflow-x-auto max-h-60 overflow-y-auto">
                  <table className="w-full min-w-[660px] text-left text-[11.5px]">
                    <thead className="bg-muted/50 text-muted-foreground text-[10.5px] uppercase font-bold sticky top-0 border-b border-border/70">
                      <tr>
                        <th className="py-2 px-2.5 w-10 text-center">#</th>
                        <th className="py-2 px-2.5">1. Category</th>
                        <th className="py-2 px-2.5">2. Subcategory</th>
                        <th className="py-2 px-2.5">3. Brand</th>
                        <th className="py-2 px-2.5">4. Model</th>
                        <th className="py-2 px-2.5 text-right">Selling Price</th>
                        <th className="py-2 px-2.5 text-right">Cost Price</th>
                        <th className="py-2 px-2.5 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {rows.map((r) => (
                        <tr
                          key={r.index}
                          className={`hover:bg-muted/20 transition-colors ${
                            !r.valid ? "bg-rose-50/40" : ""
                          }`}
                        >
                          <td className="py-1.5 px-2.5 text-center font-mono text-muted-foreground">
                            {r.index}
                          </td>
                          <td className="py-1.5 px-2.5 font-medium">{r.category || "—"}</td>
                          <td className="py-1.5 px-2.5 text-muted-foreground">{r.subcategory || "—"}</td>
                          <td className="py-1.5 px-2.5 font-bold text-foreground">{r.brand}</td>
                          <td className="py-1.5 px-2.5 font-semibold text-primary">
                            {r.model}
                            {(r.ram || r.storage || r.color) && (
                              <span className="text-muted-foreground font-normal text-[10px] ml-1">
                                ({[r.ram, r.storage, r.color].filter(Boolean).join("/")})
                              </span>
                            )}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono font-bold">
                            {inr(r.sellingPrice)}
                          </td>
                          <td className="py-1.5 px-2.5 text-right font-mono text-muted-foreground">
                            {inr(r.purchasePrice)}
                          </td>
                          <td className="py-1.5 px-2.5 text-center">
                            {r.valid ? (
                              <Badge tone="success" className="text-[9px] py-0 px-1">
                                Ready
                              </Badge>
                            ) : (
                              <Badge tone="danger" className="text-[9px] py-0 px-1">
                                {r.error}
                              </Badge>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Bottom Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
              <Button type="button" variant="ghost" size="sm" onClick={handleModalClose}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={loading || rows.length === 0 || validCount === 0}
                onClick={handleImportSubmit}
                className="gap-2 font-bold cursor-pointer w-full sm:w-auto"
              >
                {loading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin" />
                    <span>Importing {validCount} rows...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-3.5" />
                    <span>Import {validCount} Products & Models</span>
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
