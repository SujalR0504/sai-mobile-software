import { useEffect, useMemo, useState } from "react";
import { Badge, Button, Field, Input, Modal, Select } from "../ui";
import { useStore } from "@/lib/store";
import type { Product } from "@/lib/types";

interface FastAddProductModalProps {
  open: boolean;
  onClose: () => void;
  onAddProduct: (item: {
    productId: string;
    name: string;
    qty: number;
    price: number;
    gstRate: number;
    hsnSac: string;
    tracked: boolean;
    sellingPrice?: number;
    mrp?: number;
  }) => void;
  purchaseType: "GST" | "NON_GST";
}

const DEFAULT_CATEGORIES = [
  "Mobile",
  "Mobile Accessories",
  "Earbuds",
  "Tablet",
  "Laptop",
  "Smart Watch",
  "Other",
];

const DEFAULT_SUBCATEGORIES: Record<string, string[]> = {
  Mobile: ["Smartphone", "Keypad Phone", "Feature Phone"],
  "Mobile Accessories": ["Charger & Adapter", "USB Cable", "Screen Guard / Tempered Glass", "Back Cover / Case", "Power Bank"],
  Earbuds: ["TWS Earbuds", "Wireless Neckband", "Wired Earphones"],
  Tablet: ["Android Tablet", "iPad", "Drawing Tablet"],
  Laptop: ["Windows Laptop", "MacBook", "Chromebook"],
  "Smart Watch": ["Smartwatch", "Fitness Band", "Kids Watch"],
  Other: ["General Electronics", "Spares & Parts"],
};

const DEFAULT_BRANDS: Record<string, string[]> = {
  Mobile: ["OPPO", "Vivo", "Samsung", "Realme", "Apple", "Motorola", "OnePlus", "Xiaomi", "Nothing", "Other"],
  "Mobile Accessories": ["Boat", "Noise", "MI", "Realme", "Apple", "Samsung", "Portronics", "Ambrane", "Other"],
  Earbuds: ["Boat", "Noise", "Realme", "OnePlus", "Apple", "Samsung", "JBL", "Boult", "Other"],
  Tablet: ["Apple", "Samsung", "Lenovo", "Realme", "Xiaomi", "Other"],
  Laptop: ["HP", "Dell", "Lenovo", "Asus", "Acer", "Apple", "Other"],
  "Smart Watch": ["Noise", "Fire-Boltt", "Boat", "Apple", "Samsung", "Fastrack", "Other"],
  Other: ["Generic", "Other"],
};

export function FastAddProductModal({
  open,
  onClose,
  onAddProduct,
  purchaseType,
}: FastAddProductModalProps) {
  const { db, addProduct } = useStore();

  const [category, setCategory] = useState("Mobile");
  const [subCategory, setSubCategory] = useState("Smartphone");
  const [brand, setBrand] = useState("OPPO");
  const [model, setModel] = useState("");
  const [productName, setProductName] = useState("");
  const [hsn, setHsn] = useState("85171300");
  const [qty, setQty] = useState<number>(1);
  const [purchaseRate, setPurchaseRate] = useState<number>(20000);
  const [gstRate, setGstRate] = useState<number>(purchaseType === "NON_GST" ? 0 : 18);

  // Optional Fields Toggle
  const [showOptional, setShowOptional] = useState(false);
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [mrp, setMrp] = useState<number | "">("");
  const [imeiRequired, setImeiRequired] = useState(true);
  const [warranty, setWarranty] = useState(12);
  const [color, setColor] = useState("");
  const [storage, setStorage] = useState("");
  const [ram, setRam] = useState("");

  const [errorMsg, setErrorMsg] = useState("");
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Reset or preset on open
  useEffect(() => {
    if (open) {
      setCategory("Mobile");
      setSubCategory("Smartphone");
      setBrand("OPPO");
      setModel("");
      setProductName("");
      setHsn("85171300");
      setQty(1);
      setPurchaseRate(20000);
      setGstRate(purchaseType === "NON_GST" ? 0 : 18);
      setImeiRequired(true);
      setShowOptional(false);
      setErrorMsg("");
      setIsCreatingNew(false);
    }
  }, [open, purchaseType]);

  // Subcategory options based on category
  const subCategoryOptions = useMemo(() => {
    const list = DEFAULT_SUBCATEGORIES[category] || ["General"];
    // Also include any matching subcategories from existing products
    const dbSubcats = db.products
      .filter((p) => (p.category || "").toLowerCase() === category.toLowerCase() && (p as any).subcategory)
      .map((p) => (p as any).subcategory as string);
    return Array.from(new Set([...list, ...dbSubcats]));
  }, [category, db.products]);

  // Brand options based on category
  const brandOptions = useMemo(() => {
    const list = DEFAULT_BRANDS[category] || ["Other"];
    const dbBrands = db.products
      .filter((p) => (p.category || "").toLowerCase() === category.toLowerCase() && p.brand)
      .map((p) => p.brand);
    return Array.from(new Set([...list, ...dbBrands]));
  }, [category, db.products]);

  // Existing products filtered by Category + SubCategory + Brand
  const matchingExistingProducts = useMemo(() => {
    return db.products.filter((p) => {
      const matchCat = (p.category || "").toLowerCase() === category.toLowerCase();
      const matchBrand = (p.brand || "").toLowerCase() === brand.toLowerCase();
      return matchCat && matchBrand;
    });
  }, [db.products, category, brand]);

  // Model options from existing products of this brand/category
  const existingModels: string[] = useMemo(() => {
    return Array.from(
      new Set(matchingExistingProducts.map((p) => p.model).filter(Boolean))
    ) as string[];
  }, [matchingExistingProducts]);

  // Update HSN & IMEI requirement when category changes
  const handleCategoryChange = (val: string) => {
    setCategory(val);
    const subcats = DEFAULT_SUBCATEGORIES[val] || ["General"];
    setSubCategory(subcats[0] || "");
    const brands = DEFAULT_BRANDS[val] || ["Other"];
    setBrand(brands[0] || "");
    setModel("");
    setProductName("");

    const isSerialized = ["Mobile", "Tablet", "Laptop", "Smart Watch"].includes(val);
    setImeiRequired(isSerialized);
    setHsn(isSerialized ? "85171300" : "85177900");
  };

  // Auto-fill Product Name if model is typed
  const handleModelChange = (val: string) => {
    setModel(val);
    if (!productName || productName.startsWith(brand)) {
      setProductName(`${brand} ${val}`.trim());
    }
    // Check if product exists with this model
    const existing = matchingExistingProducts.find(
      (p) => p.model.toLowerCase() === val.trim().toLowerCase()
    );
    if (existing) {
      setProductName(existing.name);
      if (existing.purchasePrice) setPurchaseRate(existing.purchasePrice);
      if (existing.sellingPrice) setSellingPrice(existing.sellingPrice);
      if (existing.mrp) setMrp(existing.mrp);
      if (existing.gst !== undefined && purchaseType !== "NON_GST") setGstRate(existing.gst);
      if (existing.hsn) setHsn(existing.hsn);
      setImeiRequired(Boolean(existing.tracked));
    }
  };

  // When user selects an existing product from dropdown
  const handleSelectExistingProduct = (prodId: string) => {
    const existing = db.products.find((p) => p.id === prodId);
    if (!existing) return;
    setModel(existing.model || "");
    setProductName(existing.name);
    setHsn(existing.hsn || "85171300");
    setPurchaseRate(existing.purchasePrice || 1000);
    setSellingPrice(existing.sellingPrice || "");
    setMrp(existing.mrp || "");
    setGstRate(purchaseType === "NON_GST" ? 0 : existing.gst || 18);
    setImeiRequired(Boolean(existing.tracked));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!category.trim()) {
      setErrorMsg("Please select a Category.");
      return;
    }
    if (!productName.trim()) {
      setErrorMsg("Product Name is required.");
      return;
    }
    if (qty <= 0) {
      setErrorMsg("Quantity must be at least 1.");
      return;
    }
    if (purchaseRate < 0) {
      setErrorMsg("Purchase Rate cannot be negative.");
      return;
    }

    // Check if product exists in db
    let targetProduct = db.products.find(
      (p) =>
        p.name.trim().toLowerCase() === productName.trim().toLowerCase() ||
        (p.brand.toLowerCase() === brand.toLowerCase() &&
          p.model.toLowerCase() === model.trim().toLowerCase() &&
          model.trim() !== "")
    );

    // If not found, create new product directly
    if (!targetProduct) {
      try {
        const pPrice = Number(purchaseRate) || 0;
        const sPrice = typeof sellingPrice === "number" ? sellingPrice : pPrice;
        const mPrice = typeof mrp === "number" ? mrp : sPrice;

        const newProd = addProduct({
          name: productName.trim(),
          brand: brand.trim() || "Generic",
          model: model.trim() || productName.trim(),
          category: category as any,
          subcategory: subCategory.trim() || undefined,
          tracked: imeiRequired,
          hsn: hsn.trim() || "85171300",
          purchasePrice: pPrice,
          sellingPrice: sPrice,
          mrp: mPrice,
          gst: Number(gstRate) || 0,
          warrantyMonths: warranty,
          color: color.trim() || undefined,
          storage: storage.trim() || undefined,
          ram: ram.trim() || undefined,
          qty: 0,
        });

        targetProduct = newProd;
      } catch (err: any) {
        setErrorMsg(err.message || "Failed to create product");
        return;
      }
    }

    // Add to purchase line items
    onAddProduct({
      productId: targetProduct.id,
      name: targetProduct.name,
      qty: Number(qty) || 1,
      price: Number(purchaseRate) || 0,
      gstRate: purchaseType === "NON_GST" ? 0 : Number(gstRate) || 0,
      hsnSac: hsn.trim() || targetProduct.hsn || "85171300",
      tracked: Boolean(targetProduct.tracked || imeiRequired),
      sellingPrice: typeof sellingPrice === "number" ? sellingPrice : targetProduct.sellingPrice,
      mrp: typeof mrp === "number" ? mrp : targetProduct.mrp,
    });

    onClose();
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose} title="+ ADD PRODUCT TO PURCHASE" wide>
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMsg && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Step 1: Category -> Sub Category -> Brand -> Model */}
        <div className="p-3.5 rounded-xl border border-border/80 bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold text-foreground uppercase tracking-wider">
              Category Flow Filtering
            </span>
            <span className="text-[11px] text-muted-foreground">
              Select hierarchy to filter products
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <Field label="Category *">
              <Select
                value={category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="h-9 text-[12.5px] font-medium"
                required
              >
                {DEFAULT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Sub Category *">
              <Select
                value={subCategory}
                onChange={(e) => setSubCategory(e.target.value)}
                className="h-9 text-[12.5px]"
                required
              >
                {subCategoryOptions.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Brand">
              <Select
                value={brand}
                onChange={(e) => {
                  setBrand(e.target.value);
                  setModel("");
                }}
                className="h-9 text-[12.5px] font-medium"
              >
                {brandOptions.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Model *">
              <div className="relative">
                <input
                  list="model-options"
                  value={model}
                  onChange={(e) => handleModelChange(e.target.value)}
                  placeholder="e.g. F33 PRO 5G"
                  className="h-9 w-full rounded-xl border border-border/90 bg-white/95 px-3 text-[12.5px] font-medium outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/10 transition-all"
                  required
                />
                <datalist id="model-options">
                  {existingModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </Field>
          </div>

          {/* Quick Select existing product matching filter */}
          {matchingExistingProducts.length > 0 && (
            <div className="pt-1">
              <span className="text-[11px] text-muted-foreground mr-2">
                Existing {brand} Products ({matchingExistingProducts.length}):
              </span>
              <div className="flex flex-wrap gap-1.5 mt-1.5 max-h-24 overflow-y-auto">
                {matchingExistingProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleSelectExistingProduct(p.id)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border/70 bg-white hover:bg-primary/10 hover:border-primary/50 text-[11.5px] font-medium transition-all cursor-pointer"
                  >
                    <span>{p.name}</span>
                    <span className="text-[10px] text-muted-foreground">₹{p.purchasePrice}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Product Name & Essential Purchase Details */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="Product Name *">
              <Input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="e.g. OPPO F33 PRO 5G (8GB/256GB)"
                className="h-9.5 text-[13px] font-semibold"
                required
              />
            </Field>
          </div>

          <Field label="HSN / SAC Code">
            <Input
              value={hsn}
              onChange={(e) => setHsn(e.target.value)}
              placeholder="85171300"
              className="h-9.5 text-[12.5px] font-mono"
            />
          </Field>
        </div>

        {/* Qty, Rate, GST */}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Quantity *">
            <Input
              type="number"
              min="1"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
              className="h-9.5 text-[13px] font-bold font-mono"
              required
            />
          </Field>

          <Field label="Purchase Rate (₹) *">
            <Input
              type="number"
              step="0.01"
              min="0"
              value={purchaseRate}
              onChange={(e) => setPurchaseRate(Number(e.target.value))}
              placeholder="0.00"
              className="h-9.5 text-[13px] font-bold font-mono text-emerald-700"
              required
            />
          </Field>

          {purchaseType === "GST" ? (
            <Field label="GST Rate (%)">
              <Select
                value={gstRate}
                onChange={(e) => setGstRate(Number(e.target.value))}
                className="h-9.5 text-[12.5px] font-medium"
              >
                <option value={0}>0% (Nil / Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18% (Standard Mobile)</option>
                <option value={28}>28%</option>
              </Select>
            </Field>
          ) : (
            <div className="flex flex-col justify-center text-[12px] text-muted-foreground p-2 rounded-xl bg-muted/20 border border-border/60">
              <span className="font-semibold text-foreground">Non-GST Bill</span>
              <span className="text-[11px]">GST is 0%</span>
            </div>
          )}
        </div>

        {/* Serialized IMEI Tracking Toggle */}
        <div className="flex items-center justify-between p-3 rounded-xl border border-border/80 bg-muted/15">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={imeiRequired}
              onChange={(e) => setImeiRequired(e.target.checked)}
              className="size-4.5 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-[12.5px] font-semibold text-foreground">
              Require IMEI / Serial Tracking for this item
            </span>
          </label>
          <Badge tone={imeiRequired ? "info" : "neutral"}>
            {imeiRequired ? "Serial Tracking ON" : "Qty Based"}
          </Badge>
        </div>

        {/* Expandable Optional Details */}
        <div>
          <button
            type="button"
            onClick={() => setShowOptional(!showOptional)}
            className="text-[12px] text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>{showOptional ? "− Hide Optional Details" : "+ More Product Details (Selling Price, MRP, Specs)"}</span>
          </button>

          {showOptional && (
            <div className="mt-2.5 p-3.5 rounded-xl border border-border/80 bg-muted/10 space-y-3 animate-in-soft">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Field label="Selling Price (₹)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className="h-8.5 text-[12px] font-mono"
                  />
                </Field>
                <Field label="MRP (₹)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={mrp}
                    onChange={(e) => setMrp(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className="h-8.5 text-[12px] font-mono"
                  />
                </Field>
                <Field label="Warranty (Months)">
                  <Input
                    type="number"
                    min="0"
                    value={warranty}
                    onChange={(e) => setWarranty(Number(e.target.value))}
                    className="h-8.5 text-[12px]"
                  />
                </Field>
                <Field label="Color">
                  <Input
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Black"
                    className="h-8.5 text-[12px]"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Storage">
                  <Input
                    value={storage}
                    onChange={(e) => setStorage(e.target.value)}
                    placeholder="e.g. 128GB / 256GB"
                    className="h-8.5 text-[12px]"
                  />
                </Field>
                <Field label="RAM">
                  <Input
                    value={ram}
                    onChange={(e) => setRam(e.target.value)}
                    placeholder="e.g. 8GB"
                    className="h-8.5 text-[12px]"
                  />
                </Field>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="text-[11.5px] text-muted-foreground">
            Total Item Amount: <strong>₹{((qty * purchaseRate) * (purchaseType === "GST" ? 1 + gstRate / 100 : 1)).toFixed(2)}</strong>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add to Inward Bill
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
