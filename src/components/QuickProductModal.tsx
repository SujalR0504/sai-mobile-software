import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Row,
  Select,
} from "./ui";
import { useStore } from "@/lib/store";
import type { CategoryEntity, Product, SubcategoryEntity, BrandEntity, ModelEntity } from "@/lib/types";

interface QuickProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (product: Product) => void;
  currentEmployeeId?: string;
}

export function QuickProductModal({
  open,
  onClose,
  onSuccess,
  currentEmployeeId,
}: QuickProductModalProps) {
  const { db, addProduct } = useStore();

  // Hierarchy Data
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [loadingHierarchy, setLoadingHierarchy] = useState(false);

  // Selected IDs
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedSubcatId, setSelectedSubcatId] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  // Product Fields
  const [productName, setProductName] = useState("");
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [variant, setVariant] = useState("");
  const [color, setColor] = useState("");
  const [ram, setRam] = useState("");
  const [storage, setStorage] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [hsn, setHsn] = useState("85171300");
  const [warrantyMonths, setWarrantyMonths] = useState(12);
  const [tracked, setTracked] = useState(true);
  const [serialTracking, setSerialTracking] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState<number | "">("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [mrp, setMrp] = useState<number | "">("");
  const [gstRate, setGstRate] = useState(18);
  const [minimumStock, setMinimumStock] = useState(2);

  // Inline Master Modals
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [addSubcatModalOpen, setAddSubcatModalOpen] = useState(false);
  const [addBrandModalOpen, setAddBrandModalOpen] = useState(false);
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);

  // Inline Master Fields
  const [newCatName, setNewCatName] = useState("");
  const [newSubcatName, setNewSubcatName] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newModelName, setNewModelName] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const loadHierarchy = () => {
    setLoadingHierarchy(true);
    fetch("/api/categories/hierarchy")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setHierarchy(data);
        }
      })
      .catch((err) => console.error("Failed to load hierarchy:", err))
      .finally(() => setLoadingHierarchy(false));
  };

  useEffect(() => {
    if (open) {
      loadHierarchy();
      setErrorMsg("");
    }
  }, [open]);

  // Derived subcategories for selected category
  const availableSubcategories = useMemo(() => {
    if (!selectedCatId) return [];
    const cat = hierarchy.find((c) => c.id === selectedCatId);
    return (cat?.subcategories || []) as (SubcategoryEntity & { brands: any[] })[];
  }, [hierarchy, selectedCatId]);

  // Derived brands for selected subcategory
  const availableBrands = useMemo(() => {
    if (!selectedSubcatId) return [];
    const sub = availableSubcategories.find((s) => s.id === selectedSubcatId);
    return (sub?.brands || []) as (BrandEntity & { models: any[] })[];
  }, [availableSubcategories, selectedSubcatId]);

  // Derived models for selected brand
  const availableModels = useMemo(() => {
    if (!selectedBrandId) return [];
    const brand = availableBrands.find((b) => b.id === selectedBrandId);
    return (brand?.models || []) as ModelEntity[];
  }, [availableBrands, selectedBrandId]);

  // Auto-compose product name when brand, model, or variant changes (if user hasn't typed custom name)
  useEffect(() => {
    if (nameManuallyEdited) return;

    const brand = availableBrands.find((b) => b.id === selectedBrandId)?.name || "";
    const model = availableModels.find((m) => m.id === selectedModelId)?.name || "";
    const varPart = variant.trim() ? ` ${variant.trim()}` : "";

    if (brand || model) {
      setProductName(`${brand} ${model}${varPart}`.trim());
    }
  }, [selectedBrandId, selectedModelId, variant, availableBrands, availableModels, nameManuallyEdited]);

  // Auto-enable IMEI tracking for mobile/phone categories
  const handleCategoryChange = (catId: string) => {
    setSelectedCatId(catId);
    setSelectedSubcatId("");
    setSelectedBrandId("");
    setSelectedModelId("");

    const cat = hierarchy.find((c) => c.id === catId);
    const catNameLower = (cat?.name || "").toLowerCase();
    const isMobileCat =
      catNameLower.includes("mobile") ||
      catNameLower.includes("phone") ||
      catNameLower.includes("tablet") ||
      catNameLower.includes("smart");

    if (isMobileCat) {
      setTracked(true);
      setHsn("85171300");
    } else {
      setTracked(false);
      setHsn("85177900");
    }
  };

  // Inline Category Save
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCatName.trim(), employeeId: currentEmployeeId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create category");
      }
      const created = await res.json();
      setNewCatName("");
      setAddCatModalOpen(false);
      loadHierarchy();
      setSelectedCatId(created.id);
      setSelectedSubcatId("");
      setSelectedBrandId("");
      setSelectedModelId("");
    } catch (err: any) {
      alert(err.message || "Failed to create category");
    }
  };

  // Inline Subcategory Save
  const handleCreateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubcatName.trim() || !selectedCatId) return;

    try {
      const res = await fetch("/api/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: selectedCatId,
          name: newSubcatName.trim(),
          employeeId: currentEmployeeId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create subcategory");
      }
      const created = await res.json();
      setNewSubcatName("");
      setAddSubcatModalOpen(false);
      loadHierarchy();
      setSelectedSubcatId(created.id);
      setSelectedBrandId("");
      setSelectedModelId("");
    } catch (err: any) {
      alert(err.message || "Failed to create subcategory");
    }
  };

  // Inline Brand Save
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subcategoryId: selectedSubcatId || undefined,
          name: newBrandName.trim(),
          employeeId: currentEmployeeId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create brand");
      }
      const created = await res.json();
      setNewBrandName("");
      setAddBrandModalOpen(false);
      loadHierarchy();
      setSelectedBrandId(created.id);
      setSelectedModelId("");
    } catch (err: any) {
      alert(err.message || "Failed to create brand");
    }
  };

  // Inline Model Save
  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModelName.trim() || !selectedBrandId) return;

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: selectedBrandId,
          name: newModelName.trim(),
          employeeId: currentEmployeeId,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create model");
      }
      const created = await res.json();
      setNewModelName("");
      setAddModelModalOpen(false);
      loadHierarchy();
      setSelectedModelId(created.id);
    } catch (err: any) {
      alert(err.message || "Failed to create model");
    }
  };

  // Master Save Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedCatId) {
      setErrorMsg("Category is required.");
      return;
    }
    if (!selectedSubcatId) {
      setErrorMsg("Subcategory is required.");
      return;
    }
    if (!productName.trim()) {
      setErrorMsg("Product Name is required.");
      return;
    }

    // Duplicate SKU check
    if (sku.trim()) {
      const existingSku = db.products.find((p) => p.sku && p.sku.toLowerCase() === sku.trim().toLowerCase());
      if (existingSku) {
        setErrorMsg(`SKU '${sku.trim()}' is already used by product '${existingSku.name}'`);
        return;
      }
    }

    // Duplicate Barcode check
    if (barcode.trim()) {
      const existingBarcode = db.products.find((p) => p.barcode && p.barcode.toLowerCase() === barcode.trim().toLowerCase());
      if (existingBarcode) {
        setErrorMsg(`Barcode '${barcode.trim()}' is already used by product '${existingBarcode.name}'`);
        return;
      }
    }

    setSaving(true);
    try {
      const cat = hierarchy.find((c) => c.id === selectedCatId);
      const brand = availableBrands.find((b) => b.id === selectedBrandId);
      const model = availableModels.find((m) => m.id === selectedModelId);

      const pPrice = typeof purchasePrice === "number" ? purchasePrice : 0;
      const sPrice = typeof sellingPrice === "number" ? sellingPrice : pPrice;
      const mPrice = typeof mrp === "number" ? mrp : sPrice;

      const payload: Omit<Product, "id"> = {
        name: productName.trim(),
        brand: brand?.name || "Generic",
        model: model?.name || productName.trim(),
        category: (cat?.name as any) || "Mobile",
        categoryId: selectedCatId,
        subcategoryId: selectedSubcatId || undefined,
        brandId: selectedBrandId || undefined,
        modelId: selectedModelId || undefined,
        variant: variant.trim() || undefined,
        ram: ram.trim() || undefined,
        storage: storage.trim() || undefined,
        color: color.trim() || undefined,
        tracked,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        hsn: hsn.trim() || "85171300",
        purchasePrice: pPrice,
        sellingPrice: sPrice,
        mrp: mPrice,
        gst: Number(gstRate) || 18,
        warrantyMonths: Number(warrantyMonths) || 12,
        minimumStock: Number(minimumStock) || 2,
        reorderLevel: Number(minimumStock) || 2,
        qty: 0, // IMPORTANT: Product creation creates zero stock!
      };

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, employeeId: currentEmployeeId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save product");
      }

      const savedProduct: Product = await res.json();

      // Update store state with newly saved product
      addProduct(payload);

      // Auto return to inward items
      onSuccess(savedProduct);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title="Add New Product (Quick Inward Master)" wide>
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* STEP 1: CATEGORY & SUBCATEGORY */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
            <div className="text-[12px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <span>1. Hierarchy: Category & Subcategory</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Category */}
              <Field label="Category *">
                <div className="flex gap-1.5">
                  <Select
                    value={selectedCatId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="flex-1 text-[12.5px]"
                    required
                  >
                    <option value="" disabled>
                      {loadingHierarchy ? "Loading categories..." : "Select Category..."}
                    </option>
                    {hierarchy.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="whitespace-nowrap text-[11px] h-9 px-2.5"
                    onClick={() => setAddCatModalOpen(true)}
                  >
                    + Add Cat
                  </Button>
                </div>
              </Field>

              {/* Subcategory */}
              <Field label="Subcategory *">
                <div className="flex gap-1.5">
                  <Select
                    value={selectedSubcatId}
                    onChange={(e) => {
                      setSelectedSubcatId(e.target.value);
                      setSelectedBrandId("");
                      setSelectedModelId("");
                    }}
                    disabled={!selectedCatId}
                    className="flex-1 text-[12.5px]"
                    required
                  >
                    <option value="" disabled>
                      {!selectedCatId
                        ? "Select Category First"
                        : availableSubcategories.length === 0
                        ? "No Subcategories (Click + Add)"
                        : "Select Subcategory..."}
                    </option>
                    {availableSubcategories.map((sub) => (
                      <option key={sub.id} value={sub.id}>
                        {sub.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedCatId}
                    className="whitespace-nowrap text-[11px] h-9 px-2.5"
                    onClick={() => setAddSubcatModalOpen(true)}
                  >
                    + Add Subcat
                  </Button>
                </div>
              </Field>
            </div>
          </div>

          {/* STEP 2: BRAND & MODEL */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
            <div className="text-[12px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <span>2. Hierarchy: Brand & Model</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Brand */}
              <Field label="Brand">
                <div className="flex gap-1.5">
                  <Select
                    value={selectedBrandId}
                    onChange={(e) => {
                      setSelectedBrandId(e.target.value);
                      setSelectedModelId("");
                    }}
                    disabled={!selectedSubcatId}
                    className="flex-1 text-[12.5px]"
                  >
                    <option value="">Select Brand (Optional)...</option>
                    {availableBrands.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedSubcatId}
                    className="whitespace-nowrap text-[11px] h-9 px-2.5"
                    onClick={() => setAddBrandModalOpen(true)}
                  >
                    + Add Brand
                  </Button>
                </div>
              </Field>

              {/* Model */}
              <Field label="Model">
                <div className="flex gap-1.5">
                  <Select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={!selectedBrandId}
                    className="flex-1 text-[12.5px]"
                  >
                    <option value="">Select Model (Optional)...</option>
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedBrandId}
                    className="whitespace-nowrap text-[11px] h-9 px-2.5"
                    onClick={() => setAddModelModalOpen(true)}
                  >
                    + Add Model
                  </Button>
                </div>
              </Field>
            </div>
          </div>

          {/* STEP 3: PRODUCT SPECS & VARIANT */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
            <div className="text-[12px] font-bold text-foreground flex items-center gap-1.5 uppercase tracking-wide">
              <span>3. Product Details & Variants</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <Field label="Product Name *">
                  <Input
                    value={productName}
                    onChange={(e) => {
                      setProductName(e.target.value);
                      setNameManuallyEdited(true);
                    }}
                    placeholder="e.g. OPPO F33 Pro 8GB/256GB"
                    className="h-9 text-[12.5px] font-medium"
                    required
                  />
                </Field>
              </div>

              <Field label="Variant">
                <Input
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  placeholder="e.g. 8GB/256GB"
                  className="h-9 text-[12.5px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="RAM">
                <Input
                  value={ram}
                  onChange={(e) => setRam(e.target.value)}
                  placeholder="e.g. 8GB"
                  className="h-8 text-[12px]"
                />
              </Field>
              <Field label="Storage">
                <Input
                  value={storage}
                  onChange={(e) => setStorage(e.target.value)}
                  placeholder="e.g. 256GB"
                  className="h-8 text-[12px]"
                />
              </Field>
              <Field label="Color">
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Midnight Black"
                  className="h-8 text-[12px]"
                />
              </Field>
              <Field label="Warranty (Months)">
                <Input
                  type="number"
                  min="0"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(Number(e.target.value))}
                  className="h-8 text-[12px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="SKU">
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Auto or Custom SKU"
                  className="h-8 text-[12px] font-mono"
                />
              </Field>
              <Field label="Barcode">
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scanned UPC / EAN"
                  className="h-8 text-[12px] font-mono"
                />
              </Field>
              <Field label="HSN/SAC">
                <Input
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  placeholder="85171300"
                  className="h-8 text-[12px] font-mono"
                />
              </Field>
            </div>
          </div>

          {/* STEP 4: PRICING & TRACKING */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-muted/20 space-y-3">
            <div className="text-[12px] font-bold text-foreground flex items-center justify-between uppercase tracking-wide">
              <span>4. Pricing & Stock Tracking</span>
              <div className="flex items-center gap-4 lowercase font-normal">
                <label className="flex items-center gap-1.5 cursor-pointer text-[12px] font-medium text-foreground">
                  <input
                    type="checkbox"
                    checked={tracked}
                    onChange={(e) => setTracked(e.target.checked)}
                    className="size-4 rounded text-primary border-border focus:ring-primary"
                  />
                  <span>IMEI Tracking (Mobile / Serialized)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-[12px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={serialTracking}
                    onChange={(e) => setSerialTracking(e.target.checked)}
                    className="size-4 rounded text-primary border-border focus:ring-primary"
                  />
                  <span>Serial Track</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Field label="Purchase Price (₹)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="h-8 text-[12px] font-mono"
                />
              </Field>
              <Field label="Selling Price (₹)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="h-8 text-[12px] font-mono"
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
                  className="h-8 text-[12px] font-mono"
                />
              </Field>
              <Field label="GST Rate (%)">
                <Select
                  value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="h-8 text-[12px]"
                >
                  <option value={0}>0% (Exempt)</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18% (Standard Mobile)</option>
                  <option value={28}>28%</option>
                </Select>
              </Field>
              <Field label="Min Stock Alert">
                <Input
                  type="number"
                  min="0"
                  value={minimumStock}
                  onChange={(e) => setMinimumStock(Number(e.target.value))}
                  className="h-8 text-[12px]"
                />
              </Field>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[11.5px] text-muted-foreground">
              ℹ️ Saving creates the master product. Stock will only increase after the purchase is confirmed.
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving}>
                {saving ? "Saving Product..." : "Save Product & Return to Inward"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MINI MODAL: ADD CATEGORY */}
      {addCatModalOpen && (
        <Modal open={addCatModalOpen} onClose={() => setAddCatModalOpen(false)} title="+ Add New Category">
          <form onSubmit={handleCreateCategory} className="space-y-4">
            <Field label="Category Name *">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Mobile, Earbuds, Smart Watch"
                autoFocus
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddCatModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create & Select Category
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD SUBCATEGORY */}
      {addSubcatModalOpen && (
        <Modal open={addSubcatModalOpen} onClose={() => setAddSubcatModalOpen(false)} title="+ Add New Subcategory">
          <form onSubmit={handleCreateSubcategory} className="space-y-4">
            <div className="text-[12px] text-muted-foreground">
              Parent Category:{" "}
              <strong className="text-foreground">
                {hierarchy.find((c) => c.id === selectedCatId)?.name || "Selected"}
              </strong>
            </div>
            <Field label="Subcategory Name *">
              <Input
                value={newSubcatName}
                onChange={(e) => setNewSubcatName(e.target.value)}
                placeholder="e.g. Smart Phone, Feature Phone"
                autoFocus
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddSubcatModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create & Select Subcategory
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD BRAND */}
      {addBrandModalOpen && (
        <Modal open={addBrandModalOpen} onClose={() => setAddBrandModalOpen(false)} title="+ Add New Brand">
          <form onSubmit={handleCreateBrand} className="space-y-4">
            <div className="text-[12px] text-muted-foreground">
              Subcategory:{" "}
              <strong className="text-foreground">
                {availableSubcategories.find((s) => s.id === selectedSubcatId)?.name || "Selected"}
              </strong>
            </div>
            <Field label="Brand Name *">
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="e.g. OPPO, Vivo, Samsung, Apple"
                autoFocus
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddBrandModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create & Select Brand
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD MODEL */}
      {addModelModalOpen && (
        <Modal open={addModelModalOpen} onClose={() => setAddModelModalOpen(false)} title="+ Add New Model">
          <form onSubmit={handleCreateModel} className="space-y-4">
            <div className="text-[12px] text-muted-foreground">
              Brand:{" "}
              <strong className="text-foreground">
                {availableBrands.find((b) => b.id === selectedBrandId)?.name || "Selected"}
              </strong>
            </div>
            <Field label="Model Name *">
              <Input
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="e.g. OPPO F33 Pro, Galaxy S24"
                autoFocus
                required
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setAddModelModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Create & Select Model
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
