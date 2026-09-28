import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Modal,
  Select,
} from "./ui";
import { useStore } from "@/lib/store";
import type { CategoryEntity, Product, SubcategoryEntity, BrandEntity, ModelEntity } from "@/lib/types";

interface QuickProductModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (product: Product) => void;
  currentEmployeeId?: string;
  initialCategory?: string;
}

export function QuickProductModal({
  open,
  onClose,
  onSuccess,
  currentEmployeeId,
  initialCategory,
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

  // Search filters for searchable dropdowns
  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");

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
  const [purchasePrice, setPurchasePrice] = useState<number | "">("");
  const [sellingPrice, setSellingPrice] = useState<number | "">("");
  const [mrp, setMrp] = useState<number | "">("");
  const [gstRate, setGstRate] = useState(18);
  const [openingStock, setOpeningStock] = useState<number | "">("");
  const [reorderLevel, setReorderLevel] = useState(2);

  // Inline Master Modals
  const [addCatModalOpen, setAddCatModalOpen] = useState(false);
  const [addSubcatModalOpen, setAddSubcatModalOpen] = useState(false);
  const [addBrandModalOpen, setAddBrandModalOpen] = useState(false);
  const [addModelModalOpen, setAddModelModalOpen] = useState(false);

  // Inline Master Fields
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");

  const [newSubcatCatId, setNewSubcatCatId] = useState("");
  const [newSubcatName, setNewSubcatName] = useState("");
  const [newSubcatDesc, setNewSubcatDesc] = useState("");

  const [newBrandCatId, setNewBrandCatId] = useState("");
  const [newBrandSubcatId, setNewBrandSubcatId] = useState("");
  const [newBrandName, setNewBrandName] = useState("");
  const [newBrandLogo, setNewBrandLogo] = useState("");

  const [newModelBrandId, setNewModelBrandId] = useState("");
  const [newModelCatId, setNewModelCatId] = useState("");
  const [newModelSubcatId, setNewModelSubcatId] = useState("");
  const [newModelName, setNewModelName] = useState("");
  const [newModelNumber, setNewModelNumber] = useState("");
  const [newModelYear, setNewModelYear] = useState<number | undefined>(new Date().getFullYear());

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [inlineError, setInlineError] = useState("");

  const loadHierarchy = async () => {
    setLoadingHierarchy(true);
    try {
      const res = await fetch("/api/categories/hierarchy");
      const data = await res.json();
      if (Array.isArray(data)) {
        setHierarchy(data);
        return data;
      }
    } catch (err) {
      console.error("Failed to load hierarchy:", err);
    } finally {
      setLoadingHierarchy(false);
    }
    return [];
  };

  useEffect(() => {
    if (open) {
      loadHierarchy().then((data) => {
        if (initialCategory && Array.isArray(data)) {
          const found = data.find(
            (c) => c.name.toLowerCase() === initialCategory.toLowerCase()
          );
          if (found) {
            handleCategoryChange(found.id, data);
          }
        }
      });
      setErrorMsg("");
      setInlineError("");
    }
  }, [open, initialCategory]);

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

  // Filtered brands based on search input
  const filteredBrands = useMemo(() => {
    if (!brandSearch.trim()) return availableBrands;
    const q = brandSearch.trim().toLowerCase();
    return availableBrands.filter((b) => b.name.toLowerCase().includes(q));
  }, [availableBrands, brandSearch]);

  // Derived models for selected brand
  const availableModels = useMemo(() => {
    if (!selectedBrandId) return [];
    const brand = availableBrands.find((b) => b.id === selectedBrandId);
    return (brand?.models || []) as ModelEntity[];
  }, [availableBrands, selectedBrandId]);

  // Filtered models based on search input
  const filteredModels = useMemo(() => {
    if (!modelSearch.trim()) return availableModels;
    const q = modelSearch.trim().toLowerCase();
    return availableModels.filter((m) => m.name.toLowerCase().includes(q));
  }, [availableModels, modelSearch]);

  // Existing variants for selected model
  const existingVariantsForModel = useMemo(() => {
    if (!selectedModelId) return [];
    return (db.products || []).filter((p) => p.modelId === selectedModelId);
  }, [db.products, selectedModelId]);

  // Duplicate variant check
  const duplicateVariant = useMemo(() => {
    if (!selectedModelId || (!ram && !storage && !color)) return null;
    return existingVariantsForModel.find(
      (p) =>
        (p.ram || "").trim().toLowerCase() === (ram || "").trim().toLowerCase() &&
        (p.storage || "").trim().toLowerCase() === (storage || "").trim().toLowerCase() &&
        (p.color || "").trim().toLowerCase() === (color || "").trim().toLowerCase()
    );
  }, [existingVariantsForModel, ram, storage, color, selectedModelId]);

  // Auto-compose product name
  useEffect(() => {
    if (nameManuallyEdited) return;

    const brand = availableBrands.find((b) => b.id === selectedBrandId)?.name || "";
    const model = availableModels.find((m) => m.id === selectedModelId)?.name || "";
    const specs = [ram.trim(), storage.trim()].filter(Boolean).join("/");
    const colorPart = color.trim() ? ` ${color.trim()}` : "";
    const specPart = specs ? ` (${specs}${colorPart})` : colorPart;

    if (brand || model) {
      setProductName(`${brand} ${model}${specPart}`.trim());
    }
  }, [selectedBrandId, selectedModelId, ram, storage, color, availableBrands, availableModels, nameManuallyEdited]);

  // Handle Category Change
  const handleCategoryChange = (catId: string, currentTree = hierarchy) => {
    setSelectedCatId(catId);
    setSelectedSubcatId("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setBrandSearch("");
    setModelSearch("");

    const cat = currentTree.find((c) => c.id === catId);
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
    setInlineError("");

    // Check duplicate locally
    if (hierarchy.some((c) => c.name.toLowerCase() === newCatName.trim().toLowerCase())) {
      setInlineError(`Category '${newCatName.trim()}' already exists.`);
      return;
    }

    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCatName.trim(),
          description: newCatDesc.trim() || undefined,
          employeeId: currentEmployeeId,
          throwOnDuplicate: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create category");
      }
      const created = await res.json();
      setNewCatName("");
      setNewCatDesc("");
      setAddCatModalOpen(false);
      const updated = await loadHierarchy();
      handleCategoryChange(created.id, updated);
    } catch (err: any) {
      setInlineError(err.message || "Failed to create category");
    }
  };

  // Inline Subcategory Save
  const handleCreateSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetCatId = newSubcatCatId || selectedCatId;
    if (!newSubcatName.trim() || !targetCatId) return;
    setInlineError("");

    // Check duplicate locally
    const cat = hierarchy.find((c) => c.id === targetCatId);
    if ((cat?.subcategories || []).some((s: any) => s.name.toLowerCase() === newSubcatName.trim().toLowerCase())) {
      setInlineError(`Subcategory '${newSubcatName.trim()}' already exists under this category.`);
      return;
    }

    try {
      const res = await fetch("/api/subcategories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: targetCatId,
          name: newSubcatName.trim(),
          description: newSubcatDesc.trim() || undefined,
          employeeId: currentEmployeeId,
          throwOnDuplicate: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create subcategory");
      }
      const created = await res.json();
      setNewSubcatName("");
      setNewSubcatDesc("");
      setAddSubcatModalOpen(false);
      await loadHierarchy();
      setSelectedCatId(targetCatId);
      setSelectedSubcatId(created.id);
      setSelectedBrandId("");
      setSelectedModelId("");
    } catch (err: any) {
      setInlineError(err.message || "Failed to create subcategory");
    }
  };

  // Inline Brand Save
  const handleCreateBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBrandName.trim()) return;
    setInlineError("");

    const targetSubcatId = newBrandSubcatId || selectedSubcatId;
    const targetCatId = newBrandCatId || selectedCatId;

    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: targetCatId || undefined,
          subcategoryId: targetSubcatId || undefined,
          name: newBrandName.trim(),
          logoUrl: newBrandLogo.trim() || undefined,
          employeeId: currentEmployeeId,
          throwOnDuplicate: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create brand");
      }
      const created = await res.json();
      setNewBrandName("");
      setNewBrandLogo("");
      setAddBrandModalOpen(false);
      await loadHierarchy();
      if (targetCatId) setSelectedCatId(targetCatId);
      if (targetSubcatId) setSelectedSubcatId(targetSubcatId);
      setSelectedBrandId(created.id);
      setSelectedModelId("");
    } catch (err: any) {
      setInlineError(err.message || "Failed to create brand");
    }
  };

  // Inline Model Save
  const handleCreateModel = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBrandId = newModelBrandId || selectedBrandId;
    if (!newModelName.trim() || !targetBrandId) return;
    setInlineError("");

    try {
      const res = await fetch("/api/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brandId: targetBrandId,
          categoryId: newModelCatId || selectedCatId || undefined,
          subcategoryId: newModelSubcatId || selectedSubcatId || undefined,
          name: newModelName.trim(),
          modelNumber: newModelNumber.trim() || undefined,
          releaseYear: newModelYear ? Number(newModelYear) : undefined,
          employeeId: currentEmployeeId,
          throwOnDuplicate: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create model");
      }
      const created = await res.json();
      setNewModelName("");
      setNewModelNumber("");
      setAddModelModalOpen(false);
      await loadHierarchy();
      setSelectedBrandId(targetBrandId);
      setSelectedModelId(created.id);
    } catch (err: any) {
      setInlineError(err.message || "Failed to create model");
    }
  };

  // Master Save Product
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    if (!selectedCatId) {
      setErrorMsg("Category is required. Please select or add one.");
      return;
    }
    if (!selectedSubcatId) {
      setErrorMsg("Subcategory is required. Please select or add one.");
      return;
    }
    if (!selectedBrandId) {
      setErrorMsg("Brand is required. Please select or add one.");
      return;
    }
    if (!selectedModelId) {
      setErrorMsg("Model is required. Please select or add one.");
      return;
    }
    if (!productName.trim()) {
      setErrorMsg("Product Name is required.");
      return;
    }

    // Check duplicate variant
    if (duplicateVariant) {
      setErrorMsg(`Variant with Model '${availableModels.find((m) => m.id === selectedModelId)?.name}', RAM '${ram}', Storage '${storage}', and Color '${color}' already exists as '${duplicateVariant.name}'.`);
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
      const initStock = typeof openingStock === "number" ? openingStock : 0;

      const payload: Omit<Product, "id"> & { openingStock?: number } = {
        name: productName.trim(),
        brand: brand?.name || "Generic",
        model: model?.name || productName.trim(),
        category: (cat?.name as any) || "Mobile",
        categoryId: selectedCatId,
        subcategoryId: selectedSubcatId || undefined,
        brandId: selectedBrandId || undefined,
        modelId: selectedModelId || undefined,
        variant: variant.trim() || [ram.trim(), storage.trim(), color.trim()].filter(Boolean).join(" / ") || undefined,
        ram: ram.trim() || undefined,
        storage: storage.trim() || undefined,
        color: color.trim() || undefined,
        tracked,
        sku: sku.trim() || undefined,
        barcode: barcode.trim() || undefined,
        hsn: hsn.trim() || (tracked ? "85171300" : "85177900"),
        purchasePrice: pPrice,
        sellingPrice: sPrice,
        mrp: mPrice,
        gst: Number(gstRate) || 18,
        warrantyMonths: Number(warrantyMonths) || 12,
        minimumStock: Number(reorderLevel) || 2,
        reorderLevel: Number(reorderLevel) || 2,
        qty: initStock,
        openingStock: initStock,
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
      addProduct(savedProduct);

      // Return newly created product
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
      <Modal open={open} onClose={onClose} title="Add New Product (Master Hierarchy)" wide>
        <form onSubmit={handleSaveProduct} className="space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-[12.5px] font-medium animate-in-soft">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* 1. DYNAMIC HIERARCHY SELECTOR WITH COMPACT [+] BUTTONS */}
          <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-primary flex items-center gap-1.5 uppercase tracking-wide">
                <span>⚡ Dynamic Hierarchy (Category → Subcategory → Brand → Model)</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                Click [+] to quickly create missing records
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {/* Category Dropdown + [+] */}
              <div>
                <label className="text-[11px] font-semibold text-foreground/80 block mb-1">
                  1. Category *
                </label>
                <div className="flex gap-1 items-center">
                  <Select
                    value={selectedCatId}
                    onChange={(e) => handleCategoryChange(e.target.value)}
                    className="flex-1 text-[12.5px] h-9"
                    required
                  >
                    <option value="" disabled>
                      {loadingHierarchy ? "Loading..." : "Select Category..."}
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
                    className="h-9 px-2.5 font-bold text-sm leading-none bg-background shrink-0"
                    onClick={() => {
                      setInlineError("");
                      setNewCatName("");
                      setNewCatDesc("");
                      setAddCatModalOpen(true);
                    }}
                    title="Add Category"
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Subcategory Dropdown + [+] */}
              <div>
                <label className="text-[11px] font-semibold text-foreground/80 block mb-1">
                  2. Subcategory *
                </label>
                <div className="flex gap-1 items-center">
                  <Select
                    value={selectedSubcatId}
                    onChange={(e) => {
                      setSelectedSubcatId(e.target.value);
                      setSelectedBrandId("");
                      setSelectedModelId("");
                      setBrandSearch("");
                      setModelSearch("");
                    }}
                    disabled={!selectedCatId}
                    className="flex-1 text-[12.5px] h-9"
                    required
                  >
                    <option value="" disabled>
                      {!selectedCatId
                        ? "Select Category First"
                        : availableSubcategories.length === 0
                        ? "No Subcategories ([+] to add)"
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
                    className="h-9 px-2.5 font-bold text-sm leading-none bg-background shrink-0"
                    onClick={() => {
                      setInlineError("");
                      setNewSubcatCatId(selectedCatId);
                      setNewSubcatName("");
                      setNewSubcatDesc("");
                      setAddSubcatModalOpen(true);
                    }}
                    title="Add Subcategory"
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Brand Dropdown + [+] */}
              <div>
                <label className="text-[11px] font-semibold text-foreground/80 block mb-1">
                  3. Brand *
                </label>
                <div className="flex gap-1 items-center">
                  <Select
                    value={selectedBrandId}
                    onChange={(e) => {
                      setSelectedBrandId(e.target.value);
                      setSelectedModelId("");
                      setModelSearch("");
                    }}
                    disabled={!selectedSubcatId}
                    className="flex-1 text-[12.5px] h-9"
                    required
                  >
                    <option value="" disabled>
                      {!selectedSubcatId
                        ? "Select Subcat First"
                        : availableBrands.length === 0
                        ? "No Brands ([+] to add)"
                        : "Select Brand..."}
                    </option>
                    {filteredBrands.map((b) => (
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
                    className="h-9 px-2.5 font-bold text-sm leading-none bg-background shrink-0"
                    onClick={() => {
                      setInlineError("");
                      setNewBrandCatId(selectedCatId);
                      setNewBrandSubcatId(selectedSubcatId);
                      setNewBrandName("");
                      setNewBrandLogo("");
                      setAddBrandModalOpen(true);
                    }}
                    title="Add Brand"
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Model Dropdown + [+] */}
              <div>
                <label className="text-[11px] font-semibold text-foreground/80 block mb-1">
                  4. Model *
                </label>
                <div className="flex gap-1 items-center">
                  <Select
                    value={selectedModelId}
                    onChange={(e) => setSelectedModelId(e.target.value)}
                    disabled={!selectedBrandId}
                    className="flex-1 text-[12.5px] h-9"
                    required
                  >
                    <option value="" disabled>
                      {!selectedBrandId
                        ? "Select Brand First"
                        : availableModels.length === 0
                        ? "No Models ([+] to add)"
                        : "Select Model..."}
                    </option>
                    {filteredModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.modelNumber ? `(${m.modelNumber})` : ""}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!selectedBrandId}
                    className="h-9 px-2.5 font-bold text-sm leading-none bg-background shrink-0"
                    onClick={() => {
                      setInlineError("");
                      setNewModelBrandId(selectedBrandId);
                      setNewModelCatId(selectedCatId);
                      setNewModelSubcatId(selectedSubcatId);
                      setNewModelName("");
                      setNewModelNumber("");
                      setAddModelModalOpen(true);
                    }}
                    title="Add Model"
                  >
                    +
                  </Button>
                </div>
              </div>
            </div>

            {/* Quick Helper Button: + Add New Model button if brand is chosen */}
            {selectedBrandId && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/40 text-[11.5px]">
                <span className="text-muted-foreground">
                  Can't find your model?
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11.5px] text-primary hover:text-primary font-semibold"
                  onClick={() => {
                    setInlineError("");
                    setNewModelBrandId(selectedBrandId);
                    setNewModelCatId(selectedCatId);
                    setNewModelSubcatId(selectedSubcatId);
                    setNewModelName("");
                    setNewModelNumber("");
                    setAddModelModalOpen(true);
                  }}
                >
                  + Add New Model
                </Button>
              </div>
            )}
          </div>

          {/* EXISTING VARIANTS VIEWER FOR SELECTED MODEL */}
          {selectedModelId && (
            <div className="p-3 rounded-xl border border-border/80 bg-muted/15 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold text-foreground">
                  📦 Existing Variants for this Model ({existingVariantsForModel.length}):
                </span>
                <span className="text-[11px] text-muted-foreground">
                  One model can have multiple RAM / Storage / Color combinations
                </span>
              </div>
              {existingVariantsForModel.length === 0 ? (
                <div className="text-[12px] text-muted-foreground italic">
                  No variants exist yet. Fill the specifications below to create the first variant.
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {existingVariantsForModel.map((v) => (
                    <Badge key={v.id} tone="info" className="text-[11px] py-1 px-2.5">
                      {v.ram || "-"} / {v.storage || "-"} / {v.color || "-"} • ₹{v.sellingPrice} • Stock: {v.qty}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* DUPLICATE VARIANT ALERT */}
          {duplicateVariant && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-medium animate-in-soft">
              ⚠️ A variant with RAM: {ram || "-"}, Storage: {storage || "-"}, and Color: {color || "-"} already exists ({duplicateVariant.name}). Please use a different combination.
            </div>
          )}

          {/* 2. PRODUCT DETAILS & VARIANT FIELDS */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-card space-y-3 shadow-xs">
            <div className="text-[12px] font-bold text-foreground flex items-center justify-between uppercase tracking-wide">
              <span>Product Specifications & Variant Details</span>
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
                    placeholder="e.g. Apple iPhone 16 (8GB/128GB Black)"
                    className="h-9.5 text-[12.5px] font-medium"
                    required
                  />
                </Field>
              </div>

              <Field label="Variant Label (Optional)">
                <Input
                  value={variant}
                  onChange={(e) => setVariant(e.target.value)}
                  placeholder="e.g. 8GB / 128GB / Black"
                  className="h-9.5 text-[12.5px]"
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Field label="RAM">
                <Input
                  value={ram}
                  onChange={(e) => setRam(e.target.value)}
                  placeholder="e.g. 8GB"
                  className="h-9 text-[12px]"
                />
              </Field>
              <Field label="Storage">
                <Input
                  value={storage}
                  onChange={(e) => setStorage(e.target.value)}
                  placeholder="e.g. 128GB"
                  className="h-9 text-[12px]"
                />
              </Field>
              <Field label="Color">
                <Input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Midnight Black"
                  className="h-9 text-[12px]"
                />
              </Field>
              <Field label="Tracking Mode">
                <Select
                  value={tracked ? "tracked" : "bulk"}
                  onChange={(e) => setTracked(e.target.value === "tracked")}
                  className="h-9 text-[12px]"
                >
                  <option value="tracked">IMEI / Serial (Mobile & Tablets)</option>
                  <option value="bulk">Quantity (Accessories & Spares)</option>
                </Select>
              </Field>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="SKU (Auto-generated if empty)">
                <Input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="e.g. APP-IPH16-8128-BLK"
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
              <Field label="Barcode (Optional)">
                <Input
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  placeholder="Scanned UPC / EAN"
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
              <Field label="HSN/SAC">
                <Input
                  value={hsn}
                  onChange={(e) => setHsn(e.target.value)}
                  placeholder="85171300"
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
            </div>
          </div>

          {/* 3. PRICING & STOCK SETTINGS */}
          <div className="p-3.5 rounded-xl border border-border/70 bg-card space-y-3 shadow-xs">
            <div className="text-[12px] font-bold text-foreground uppercase tracking-wide">
              Pricing, Taxes & Inventory
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              <Field label="Purchase Price (₹)">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="h-9 text-[12px] font-mono"
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
                  className="h-9 text-[12px] font-mono"
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
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
              <Field label="GST Rate (%)">
                <Select
                  value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="h-9 text-[12px]"
                >
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={12}>12%</option>
                  <option value={18}>18% (Standard)</option>
                  <option value={28}>28%</option>
                </Select>
              </Field>
              <Field label="Opening Stock">
                <Input
                  type="number"
                  min="0"
                  value={openingStock}
                  onChange={(e) => setOpeningStock(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0"
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
              <Field label="Reorder Alert Level">
                <Input
                  type="number"
                  min="0"
                  value={reorderLevel}
                  onChange={(e) => setReorderLevel(Number(e.target.value))}
                  className="h-9 text-[12px] font-mono"
                />
              </Field>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-[11.5px] text-muted-foreground">
              ⚡ Product variant will be saved to inventory and immediately available for Inward & POS.
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving || Boolean(duplicateVariant)}>
                {saving ? "Saving Product..." : "Save Product"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* MINI MODAL: ADD CATEGORY */}
      {addCatModalOpen && (
        <Modal open={addCatModalOpen} onClose={() => setAddCatModalOpen(false)} title="+ Add New Category">
          <form onSubmit={handleCreateCategory} className="space-y-3.5">
            {inlineError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-[12px] font-medium">
                ⚠️ {inlineError}
              </div>
            )}
            <Field label="Category Name *">
              <Input
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="e.g. Mobile, Tablets, Accessories"
                autoFocus
                required
              />
            </Field>
            <Field label="Description (Optional)">
              <Input
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                placeholder="Short description of this category"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setAddCatModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Category
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD SUBCATEGORY */}
      {addSubcatModalOpen && (
        <Modal open={addSubcatModalOpen} onClose={() => setAddSubcatModalOpen(false)} title="+ Add New Subcategory">
          <form onSubmit={handleCreateSubcategory} className="space-y-3.5">
            {inlineError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-[12px] font-medium">
                ⚠️ {inlineError}
              </div>
            )}
            <Field label="Belongs to Category *">
              <Select
                value={newSubcatCatId}
                onChange={(e) => setNewSubcatCatId(e.target.value)}
                required
              >
                <option value="">Select Category</option>
                {hierarchy.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory Name *">
              <Input
                value={newSubcatName}
                onChange={(e) => setNewSubcatName(e.target.value)}
                placeholder="e.g. Smart Phone, Feature Phone, Charger"
                autoFocus
                required
              />
            </Field>
            <Field label="Description (Optional)">
              <Input
                value={newSubcatDesc}
                onChange={(e) => setNewSubcatDesc(e.target.value)}
                placeholder="Short description"
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setAddSubcatModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Subcategory
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD BRAND */}
      {addBrandModalOpen && (
        <Modal open={addBrandModalOpen} onClose={() => setAddBrandModalOpen(false)} title="+ Add New Brand">
          <form onSubmit={handleCreateBrand} className="space-y-3.5">
            {inlineError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-[12px] font-medium">
                ⚠️ {inlineError}
              </div>
            )}
            <Field label="Brand Name *">
              <Input
                value={newBrandName}
                onChange={(e) => setNewBrandName(e.target.value)}
                placeholder="e.g. Apple, Samsung, Vivo, OPPO"
                autoFocus
                required
              />
            </Field>
            <Field label="Category (Optional)">
              <Select
                value={newBrandCatId}
                onChange={(e) => setNewBrandCatId(e.target.value)}
              >
                <option value="">Global / Select Category</option>
                {hierarchy.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Subcategory (Optional)">
              <Select
                value={newBrandSubcatId}
                onChange={(e) => setNewBrandSubcatId(e.target.value)}
              >
                <option value="">Global / Select Subcategory</option>
                {availableSubcategories.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Logo URL (Optional)">
              <Input
                value={newBrandLogo}
                onChange={(e) => setNewBrandLogo(e.target.value)}
                placeholder="https://..."
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setAddBrandModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Brand
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* MINI MODAL: ADD MODEL */}
      {addModelModalOpen && (
        <Modal open={addModelModalOpen} onClose={() => setAddModelModalOpen(false)} title="+ Add New Model">
          <form onSubmit={handleCreateModel} className="space-y-3.5">
            {inlineError && (
              <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive text-[12px] font-medium">
                ⚠️ {inlineError}
              </div>
            )}
            <Field label="Belongs to Brand *">
              <Select
                value={newModelBrandId}
                onChange={(e) => setNewModelBrandId(e.target.value)}
                required
              >
                <option value="">Select Brand</option>
                {availableBrands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model Name *">
              <Input
                value={newModelName}
                onChange={(e) => setNewModelName(e.target.value)}
                placeholder="e.g. iPhone 16, Galaxy S24 Ultra, Reno 12"
                autoFocus
                required
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Model Number (Optional)">
                <Input
                  value={newModelNumber}
                  onChange={(e) => setNewModelNumber(e.target.value)}
                  placeholder="e.g. A3089"
                />
              </Field>
              <Field label="Release Year">
                <Input
                  type="number"
                  value={newModelYear ?? ""}
                  onChange={(e) => setNewModelYear(Number(e.target.value) || undefined)}
                  placeholder="2026"
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="ghost" onClick={() => setAddModelModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary">
                Save Model
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
