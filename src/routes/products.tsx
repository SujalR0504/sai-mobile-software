import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardHead,
  Empty,
  Field,
  Input,
  Modal,
  PageHead,
  Row,
  Select,
  Stat,
  Table,
  Td,
} from "@/components/ui";
import { stockOf, useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { CATEGORIES, type Category, type Product } from "@/lib/types";
import { QuickProductModal } from "@/components/QuickProductModal";
import { ExcelProductImportModal } from "@/components/products/ExcelProductImportModal";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [{ title: "Products & Hierarchy Master — Mobile Store ERP" }],
  }),
  component: ProductsPage,
});

export function ProductsPage() {
  const { db, addProduct, updateProduct, deleteProduct, addUnits, refreshFromBackend } = useStore();
  const [activeTab, setActiveTab] = useState<"catalog" | "hierarchy">("catalog");
  const [query, setQuery] = useState("");
  const [catFilter, setCatFilter] = useState("All");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  // Product Delete State
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  // Category Hierarchy State
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [selectedCatId, setSelectedCatId] = useState("");
  const [selectedSubcatId, setSelectedSubcatId] = useState("");
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  const [brandSearch, setBrandSearch] = useState("");
  const [modelSearch, setModelSearch] = useState("");

  const [quickProductModalOpen, setQuickProductModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState("");
  const [productError, setProductError] = useState("");

  const [imeiModalOpen, setImeiModalOpen] = useState(false);
  const [targetProduct, setTargetProduct] = useState<Product | null>(null);
  const [newImeis, setNewImeis] = useState("");

  // Master Management State
  const [masterLevel, setMasterLevel] = useState<"categories" | "subcategories" | "brands" | "models">("categories");
  const [masterFilterCatId, setMasterFilterCatId] = useState("");
  const [masterFilterSubcatId, setMasterFilterSubcatId] = useState("");
  const [masterFilterBrandId, setMasterFilterBrandId] = useState("");

  // Master Modals
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [subcatModalOpen, setSubcatModalOpen] = useState(false);
  const [brandModalOpen, setBrandModalOpen] = useState(false);
  const [modelModalOpen, setModelModalOpen] = useState(false);

  const [editingCat, setEditingCat] = useState<any | null>(null);
  const [editingSubcat, setEditingSubcat] = useState<any | null>(null);
  const [editingBrand, setEditingBrand] = useState<any | null>(null);
  const [editingModel, setEditingModel] = useState<any | null>(null);

  const [catName, setCatName] = useState("");
  const [catIcon, setCatIcon] = useState("");
  const [catDesc, setCatDesc] = useState("");
  const [catError, setCatError] = useState("");

  const [subcatCatId, setSubcatCatId] = useState("");
  const [subcatName, setSubcatName] = useState("");
  const [subcatDesc, setSubcatDesc] = useState("");
  const [subcatError, setSubcatError] = useState("");

  const [brandCatId, setBrandCatId] = useState("");
  const [brandSubcatId, setBrandSubcatId] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [brandError, setBrandError] = useState("");

  const [modelCatId, setModelCatId] = useState("");
  const [modelSubcatId, setModelSubcatId] = useState("");
  const [modelBrandId, setModelBrandId] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelNumber, setModelNumber] = useState("");
  const [modelYear, setModelYear] = useState<number | undefined>(new Date().getFullYear());
  const [modelError, setModelError] = useState("");

  const loadHierarchy = () => {
    fetch("/api/categories/hierarchy")
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setHierarchy(data);
      })
      .catch((err) => console.error("Failed to load category hierarchy:", err));
  };

  useEffect(() => {
    loadHierarchy();
  }, []);

  const currentSubcategories = useMemo(() => {
    const cat = hierarchy.find((c) => c.id === selectedCatId);
    return cat?.subcategories || [];
  }, [hierarchy, selectedCatId]);

  const currentBrands = useMemo(() => {
    const sub = currentSubcategories.find((s: any) => s.id === selectedSubcatId);
    return sub?.brands || [];
  }, [currentSubcategories, selectedSubcatId]);

  const currentModels = useMemo(() => {
    const b = currentBrands.find((br: any) => br.id === selectedBrandId);
    return b?.models || [];
  }, [currentBrands, selectedBrandId]);

  const filteredCurrentBrands = useMemo(() => {
    if (!brandSearch.trim()) return currentBrands;
    const q = brandSearch.trim().toLowerCase();
    return currentBrands.filter((b: any) => b.name.toLowerCase().includes(q));
  }, [currentBrands, brandSearch]);

  const filteredCurrentModels = useMemo(() => {
    if (!modelSearch.trim()) return currentModels;
    const q = modelSearch.trim().toLowerCase();
    return currentModels.filter((m: any) => m.name.toLowerCase().includes(q));
  }, [currentModels, modelSearch]);

  // Master flat lists
  const allCategories = useMemo(() => {
    return hierarchy.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      icon: c.icon,
      active: c.active !== false,
      subcategoriesCount: c.subcategories?.length || 0,
    }));
  }, [hierarchy]);

  const allSubcategories = useMemo(() => {
    const list: any[] = [];
    hierarchy.forEach((c) => {
      (c.subcategories || []).forEach((s: any) => {
        list.push({
          id: s.id,
          categoryId: c.id,
          categoryName: c.name,
          name: s.name,
          slug: s.slug,
          active: s.active !== false,
          brandsCount: s.brands?.length || 0,
        });
      });
    });
    return list;
  }, [hierarchy]);

  const allBrands = useMemo(() => {
    const list: any[] = [];
    hierarchy.forEach((c) => {
      (c.subcategories || []).forEach((s: any) => {
        (s.brands || []).forEach((b: any) => {
          if (!list.some((item) => item.id === b.id)) {
            list.push({
              id: b.id,
              subcategoryId: s.id,
              subcategoryName: s.name,
              categoryName: c.name,
              name: b.name,
              slug: b.slug,
              logoUrl: b.logoUrl,
              active: b.active !== false,
              modelsCount: b.models?.length || 0,
            });
          }
        });
      });
    });
    return list;
  }, [hierarchy]);

  const allModels = useMemo(() => {
    const list: any[] = [];
    hierarchy.forEach((c) => {
      (c.subcategories || []).forEach((s: any) => {
        (s.brands || []).forEach((b: any) => {
          (b.models || []).forEach((m: any) => {
            if (!list.some((item) => item.id === m.id)) {
              list.push({
                id: m.id,
                brandId: b.id,
                brandName: b.name,
                categoryName: c.name,
                name: m.name,
                modelNumber: m.modelNumber,
                releaseYear: m.releaseYear,
                active: m.active !== false,
              });
            }
          });
        });
      });
    });
    return list;
  }, [hierarchy]);

  const [form, setForm] = useState<Omit<Product, "id">>({
    name: "",
    brand: "",
    model: "",
    variant: "",
    ram: "",
    storage: "",
    color: "",
    category: "Mobile Phones",
    tracked: true,
    mrp: 0,
    purchasePrice: 0,
    sellingPrice: 0,
    gst: 18,
    warrantyMonths: 12,
    qty: 0,
    reorderLevel: 2,
    barcode: "",
    hsn: "85171300",
    openingStock: 0,
  });

  const selectedModelObj = useMemo(() => {
    return currentModels.find((m: any) => m.id === selectedModelId);
  }, [currentModels, selectedModelId]);

  const existingVariants = useMemo(() => {
    if (!selectedModelId && !form.model) return [];
    return (db.products || []).filter((p) => {
      if (selectedModelId && p.modelId === selectedModelId) return true;
      if (form.model && p.model?.toLowerCase() === form.model.toLowerCase()) {
        if (!form.brand || p.brand?.toLowerCase() === form.brand.toLowerCase()) return true;
      }
      return false;
    });
  }, [db.products, selectedModelId, form.model, form.brand]);

  const isDuplicateVariant = useMemo(() => {
    if (!selectedModelId && !form.model) return false;
    return (db.products || []).some((p) => {
      if (editingProduct && p.id === editingProduct.id) return false;
      const sameModel =
        (selectedModelId && p.modelId === selectedModelId) ||
        (form.model && p.model?.toLowerCase() === form.model.toLowerCase() && p.brand?.toLowerCase() === form.brand.toLowerCase());
      if (!sameModel) return false;
      const sameRam = (p.ram || "").trim().toLowerCase() === (form.ram || "").trim().toLowerCase();
      const sameStorage = (p.storage || "").trim().toLowerCase() === (form.storage || "").trim().toLowerCase();
      const sameColor = (p.color || "").trim().toLowerCase() === (form.color || "").trim().toLowerCase();
      return sameRam && sameStorage && sameColor;
    });
  }, [db.products, selectedModelId, form.model, form.brand, form.ram, form.storage, form.color, editingProduct]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (db.products || []).filter((p) => {
      if (catFilter !== "All" && p.category !== catFilter) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.model.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q))
      );
    });
  }, [db.products, query, catFilter]);

  const openAddModal = () => {
    setEditingProduct(null);
    setSelectedCatId("");
    setSelectedSubcatId("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setBrandSearch("");
    setModelSearch("");
    setProductError("");
    setForm({
      name: "",
      brand: "",
      model: "",
      variant: "",
      ram: "",
      storage: "",
      color: "",
      category: "Mobile Phones",
      tracked: true,
      mrp: 0,
      purchasePrice: 0,
      sellingPrice: 0,
      gst: 18,
      warrantyMonths: 12,
      qty: 0,
      reorderLevel: 2,
      barcode: "",
      hsn: "85171300",
      openingStock: 0,
    });
    setModalOpen(true);
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setSelectedCatId(p.categoryId || "");
    setSelectedSubcatId(p.subcategoryId || "");
    setSelectedBrandId(p.brandId || "");
    setSelectedModelId(p.modelId || "");
    setBrandSearch("");
    setModelSearch("");
    setProductError("");
    setForm({
      name: p.name,
      brand: p.brand,
      model: p.model,
      variant: p.variant || "",
      ram: p.ram || "",
      storage: p.storage || "",
      color: p.color || "",
      category: p.category,
      categoryId: p.categoryId,
      subcategoryId: p.subcategoryId,
      brandId: p.brandId,
      modelId: p.modelId,
      tracked: p.tracked,
      mrp: p.mrp,
      purchasePrice: p.purchasePrice,
      sellingPrice: p.sellingPrice,
      gst: p.gst,
      warrantyMonths: p.warrantyMonths,
      qty: p.qty,
      reorderLevel: p.reorderLevel,
      barcode: p.barcode || "",
      hsn: p.hsn || (p.tracked ? "85171300" : "85177900"),
      openingStock: p.openingStock || 0,
    });
    setModalOpen(true);
  };

  const openDeleteModal = (p: Product) => {
    setProductToDelete(p);
    setDeleteError("");
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async (force = false) => {
    if (!productToDelete) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deleteProduct(productToDelete.id, force);
      setToastMsg(`Product "${productToDelete.name}" deleted successfully.`);
      setDeleteModalOpen(false);
      setProductToDelete(null);
      if (modalOpen && editingProduct?.id === productToDelete.id) {
        setModalOpen(false);
        setEditingProduct(null);
      }
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete product");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCategoryChange = (catId: string) => {
    setSelectedCatId(catId);
    setSelectedSubcatId("");
    setSelectedBrandId("");
    setSelectedModelId("");
    setBrandSearch("");
    setModelSearch("");
    const catObj = hierarchy.find((c) => c.id === catId);
    if (catObj) {
      const isMobile = /mobile|phone|tablet|smartphone/i.test(catObj.name);
      setForm((f) => ({
        ...f,
        category: catObj.name as any,
        categoryId: catId,
        subcategoryId: undefined,
        brandId: undefined,
        modelId: undefined,
        tracked: isMobile,
        hsn: isMobile ? "85171300" : "85177900",
      }));
    } else {
      setForm((f) => ({
        ...f,
        categoryId: undefined,
        subcategoryId: undefined,
        brandId: undefined,
        modelId: undefined,
      }));
    }
  };

  const handleSubcategoryChange = (subId: string) => {
    setSelectedSubcatId(subId);
    setSelectedBrandId("");
    setSelectedModelId("");
    setBrandSearch("");
    setModelSearch("");
    setForm((f) => ({
      ...f,
      subcategoryId: subId || undefined,
      brandId: undefined,
      modelId: undefined,
    }));
  };

  const handleBrandChange = (bId: string) => {
    setSelectedBrandId(bId);
    setSelectedModelId("");
    setModelSearch("");
    const bObj = currentBrands.find((b: any) => b.id === bId);
    if (bObj) {
      setForm((f) => ({
        ...f,
        brand: bObj.name,
        brandId: bId,
        modelId: undefined,
        name: `${bObj.name} ${f.model || ""}`.trim(),
      }));
    } else {
      setForm((f) => ({
        ...f,
        brandId: undefined,
        modelId: undefined,
      }));
    }
  };

  const handleModelChange = (mId: string) => {
    setSelectedModelId(mId);
    const mObj = currentModels.find((m: any) => m.id === mId);
    if (mObj) {
      setForm((f) => {
        const specs = [f.ram && `${f.ram} RAM`, f.storage, f.color].filter(Boolean).join(" ");
        const autoName = `${f.brand || ""} ${mObj.name} ${specs}`.trim();
        return {
          ...f,
          model: mObj.name,
          modelId: mId,
          name: autoName || `${f.brand || ""} ${mObj.name}`.trim(),
        };
      });
    } else {
      setForm((f) => ({ ...f, modelId: undefined }));
    }
  };

  const updateSpecAndName = (field: "ram" | "storage" | "color", value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      const specs = [next.ram && `${next.ram} RAM`, next.storage, next.color].filter(Boolean).join(" ");
      const autoName = `${next.brand || ""} ${next.model || ""} ${specs}`.trim();
      return {
        ...next,
        name: autoName || next.name,
      };
    });
  };

  const openAddCatModal = () => {
    setEditingCat(null);
    setCatName("");
    setCatIcon("");
    setCatDesc("");
    setCatError("");
    setCatModalOpen(true);
  };

  const openAddSubcatModal = () => {
    setEditingSubcat(null);
    setSubcatCatId(selectedCatId || (hierarchy[0]?.id ?? ""));
    setSubcatName("");
    setSubcatDesc("");
    setSubcatError("");
    setSubcatModalOpen(true);
  };

  const openAddBrandModal = () => {
    setEditingBrand(null);
    setBrandCatId(selectedCatId || (hierarchy[0]?.id ?? ""));
    setBrandSubcatId(selectedSubcatId || "");
    setBrandName("");
    setBrandLogo("");
    setBrandError("");
    setBrandModalOpen(true);
  };

  const openAddModelModal = () => {
    setEditingModel(null);
    setModelCatId(selectedCatId || "");
    setModelSubcatId(selectedSubcatId || "");
    setModelBrandId(selectedBrandId || "");
    setModelName(modelSearch.trim() || "");
    setModelNumber("");
    setModelYear(new Date().getFullYear());
    setModelError("");
    setModelModalOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.brand) {
      setProductError("Product Name and Brand are required.");
      return;
    }
    if (isDuplicateVariant) {
      setProductError("Cannot save: A variant with this Model, RAM, Storage, and Color already exists.");
      return;
    }

    const payload: any = {
      ...form,
      categoryId: selectedCatId || form.categoryId || undefined,
      subcategoryId: selectedSubcatId || form.subcategoryId || undefined,
      brandId: selectedBrandId || form.brandId || undefined,
      modelId: selectedModelId || form.modelId || undefined,
      barcode: form.barcode?.trim() || undefined,
      hsn: form.hsn?.trim() || undefined,
      openingStock: form.openingStock ? Number(form.openingStock) : undefined,
    };

    try {
      if (editingProduct) {
        updateProduct(editingProduct.id, payload);
        await fetch(`/api/products/${editingProduct.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }).catch(() => {});
      } else {
        const created = addProduct(payload);
        await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, id: created.id }),
        }).catch(() => {});
      }
      setModalOpen(false);
      setToastMsg(editingProduct ? "Product updated successfully!" : "Product created successfully!");
      setTimeout(() => setToastMsg(""), 3500);
    } catch (err: any) {
      setProductError(err.message || "Failed to save product");
    }
  };

  const handleAddImeis = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetProduct) return;
    const lines = newImeis
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;

    const rows = lines.map((imei) => ({
      imei1: imei,
      purchasePrice: targetProduct.purchasePrice,
    }));
    addUnits(targetProduct.id, rows);
    setImeiModalOpen(false);
    setNewImeis("");
  };

  // Master Actions (CRUD)
  const saveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setCatError("");
    try {
      if (editingCat) {
        const res = await fetch(`/api/categories/${editingCat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: catName.trim(), icon: catIcon || undefined, description: catDesc || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update category");
        }
      } else {
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: catName.trim(), icon: catIcon || undefined, description: catDesc || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create category");
        }
        const created = await res.json();
        if (created && created.id) {
          setSelectedCatId(created.id);
          setSelectedSubcatId("");
          setSelectedBrandId("");
          setSelectedModelId("");
          const isMobile = /mobile|phone|tablet|smartphone/i.test(created.name);
          setForm((f) => ({
            ...f,
            category: created.name as any,
            categoryId: created.id,
            subcategoryId: undefined,
            brandId: undefined,
            modelId: undefined,
            tracked: isMobile,
            hsn: isMobile ? "85171300" : "85177900",
          }));
        }
      }
      loadHierarchy();
      setCatModalOpen(false);
      setEditingCat(null);
    } catch (err: any) {
      setCatError(err.message || "Failed to save category");
    }
  };

  const toggleCategoryActive = async (c: any) => {
    await fetch(`/api/categories/${c.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !c.active }),
    });
    loadHierarchy();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete or deactivate this category?")) return;
    await fetch(`/api/categories/${id}`, { method: "DELETE" });
    loadHierarchy();
  };

  const saveSubcategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subcatName.trim() || !subcatCatId) return;
    setSubcatError("");
    try {
      if (editingSubcat) {
        const res = await fetch(`/api/subcategories/${editingSubcat.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: subcatCatId, name: subcatName.trim(), description: subcatDesc || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update subcategory");
        }
      } else {
        const res = await fetch("/api/subcategories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ categoryId: subcatCatId, name: subcatName.trim(), description: subcatDesc || undefined }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create subcategory");
        }
        const created = await res.json();
        if (created && created.id) {
          setSelectedSubcatId(created.id);
          setSelectedBrandId("");
          setSelectedModelId("");
          setForm((f) => ({
            ...f,
            subcategoryId: created.id,
            brandId: undefined,
            modelId: undefined,
          }));
        }
      }
      loadHierarchy();
      setSubcatModalOpen(false);
      setEditingSubcat(null);
    } catch (err: any) {
      setSubcatError(err.message || "Failed to save subcategory");
    }
  };

  const toggleSubcategoryActive = async (s: any) => {
    await fetch(`/api/subcategories/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !s.active }),
    });
    loadHierarchy();
  };

  const deleteSubcategory = async (id: string) => {
    if (!confirm("Are you sure you want to delete this subcategory?")) return;
    await fetch(`/api/subcategories/${id}`, { method: "DELETE" });
    loadHierarchy();
  };

  const saveBrand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!brandName.trim()) return;
    setBrandError("");
    try {
      if (editingBrand) {
        const res = await fetch(`/api/brands/${editingBrand.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subcategoryId: brandSubcatId || undefined,
            categoryId: brandCatId || selectedCatId || undefined,
            name: brandName.trim(),
            logoUrl: brandLogo || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update brand");
        }
      } else {
        const res = await fetch("/api/brands", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subcategoryId: brandSubcatId || selectedSubcatId || undefined,
            categoryId: brandCatId || selectedCatId || undefined,
            name: brandName.trim(),
            logoUrl: brandLogo || undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create brand");
        }
        const created = await res.json();
        if (created && created.id) {
          setSelectedBrandId(created.id);
          setSelectedModelId("");
          setForm((f) => ({
            ...f,
            brand: created.name,
            brandId: created.id,
            modelId: undefined,
            name: `${created.name} ${f.model || ""}`.trim(),
          }));
        }
      }
      loadHierarchy();
      setBrandModalOpen(false);
      setEditingBrand(null);
    } catch (err: any) {
      setBrandError(err.message || "Failed to save brand");
    }
  };

  const toggleBrandActive = async (b: any) => {
    await fetch(`/api/brands/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !b.active }),
    });
    loadHierarchy();
  };

  const deleteBrand = async (id: string) => {
    if (!confirm("Are you sure you want to delete this brand?")) return;
    await fetch(`/api/brands/${id}`, { method: "DELETE" });
    loadHierarchy();
  };

  const saveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelName.trim() || !modelBrandId) return;
    setModelError("");
    try {
      if (editingModel) {
        const res = await fetch(`/api/models/${editingModel.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: modelBrandId,
            categoryId: modelCatId || selectedCatId || undefined,
            subcategoryId: modelSubcatId || selectedSubcatId || undefined,
            name: modelName.trim(),
            modelNumber: modelNumber || undefined,
            releaseYear: modelYear ? Number(modelYear) : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to update model");
        }
      } else {
        const res = await fetch("/api/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            brandId: modelBrandId,
            categoryId: modelCatId || selectedCatId || undefined,
            subcategoryId: modelSubcatId || selectedSubcatId || undefined,
            name: modelName.trim(),
            modelNumber: modelNumber || undefined,
            releaseYear: modelYear ? Number(modelYear) : undefined,
          }),
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "Failed to create model");
        }
        const created = await res.json();
        if (created && created.id) {
          setSelectedModelId(created.id);
          setForm((f) => {
            const specs = [f.ram && `${f.ram} RAM`, f.storage, f.color].filter(Boolean).join(" ");
            const autoName = `${f.brand || ""} ${created.name} ${specs}`.trim();
            return {
              ...f,
              model: created.name,
              modelId: created.id,
              name: autoName || `${f.brand || ""} ${created.name}`.trim(),
            };
          });
        }
      }
      loadHierarchy();
      setModelModalOpen(false);
      setEditingModel(null);
    } catch (err: any) {
      setModelError(err.message || "Failed to save model");
    }
  };

  const toggleModelActive = async (m: any) => {
    await fetch(`/api/models/${m.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !m.active }),
    });
    loadHierarchy();
  };

  const deleteModel = async (id: string) => {
    if (!confirm("Are you sure you want to delete this model?")) return;
    await fetch(`/api/models/${id}`, { method: "DELETE" });
    loadHierarchy();
  };

  // Summary Metrics
  const totalStockUnits = useMemo(() => {
    return (db.products || []).reduce((acc, p) => acc + stockOf(db, p.id), 0);
  }, [db]);

  const totalInventoryValuation = useMemo(() => {
    return (db.products || []).reduce((acc, p) => acc + stockOf(db, p.id) * p.purchasePrice, 0);
  }, [db]);

  const lowStockCount = useMemo(() => {
    return (db.products || []).filter((p) => stockOf(db, p.id) <= p.reorderLevel).length;
  }, [db]);

  return (
    <div className="space-y-5">
      <PageHead
        title="Product Inventory & Hierarchy"
        sub="Manage phone models, specifications, category-to-model hierarchy, selling prices, and serial IMEIs."
        actions={
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border bg-card p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("catalog")}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  activeTab === "catalog"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                📦 Products Catalog
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("hierarchy")}
                className={`px-3 py-1.5 rounded-md text-[12px] font-semibold transition-all ${
                  activeTab === "hierarchy"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                ⚡ Hierarchy Masters
              </button>
            </div>
            {activeTab === "catalog" && (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => setImportModalOpen(true)} className="shadow-xs gap-1.5 font-bold" variant="outline">
                  📥 Import Excel / CSV
                </Button>
                <Button onClick={() => setQuickProductModalOpen(true)} className="shadow-md" variant="soft">
                  ⚡ + Quick Add Product
                </Button>
                <Button onClick={openAddModal} className="shadow-md">
                  + Add Product
                </Button>
              </div>
            )}
            {activeTab === "hierarchy" && (
              <Button onClick={() => setImportModalOpen(true)} className="shadow-xs gap-1.5 font-bold" variant="outline">
                📥 Bulk Import (Excel)
              </Button>
            )}
          </div>
        }
      />

      {activeTab === "catalog" ? (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            <Stat
              label="Total Catalog Items"
              value={`${(db.products || []).length} Models`}
              hint="Active product catalog"
              tone="info"
            />
            <Stat
              label="Total Available Units"
              value={`${totalStockUnits} Units`}
              hint="In stock across models"
              tone="success"
            />
            <Stat
              label="Stock Valuation"
              value={inr(totalInventoryValuation)}
              hint="Calculated at purchase cost"
              tone="neutral"
            />
            <Stat
              label="Low Stock Alerts"
              value={`${lowStockCount} Items`}
              hint={lowStockCount > 0 ? "Requires reorder" : "Healthy stock levels"}
              tone={lowStockCount > 0 ? "warning" : "neutral"}
            />
          </div>

          <Card>
            <CardHead
              title="Catalog & Pricing"
              sub={`${filtered.length} products found`}
              right={
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="relative">
                    <Input
                      placeholder="Search brand, model, specs..."
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      className="w-48 sm:w-64 pl-3"
                    />
                  </div>
                  <Select
                    value={catFilter}
                    onChange={(e) => setCatFilter(e.target.value)}
                    className="w-40"
                  >
                    <option value="All">All Categories</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </div>
              }
            />

            {filtered.length === 0 ? (
              <Empty text="No products found matching your filter criteria." />
            ) : (
              <Table
                head={[
                  "Device / Model",
                  "Category",
                  "Specifications",
                  ">Purchase",
                  ">Selling & Margin",
                  ">MRP",
                  "Stock",
                  "Actions",
                ]}
              >
                {filtered.map((p) => {
                  const stock = stockOf(db, p.id);
                  const isLow = stock <= p.reorderLevel;
                  const margin =
                    p.sellingPrice > p.purchasePrice
                      ? Math.round(((p.sellingPrice - p.purchasePrice) / p.sellingPrice) * 100)
                      : 0;

                  return (
                    <Row key={p.id}>
                      <Td>
                        <div className="font-bold text-foreground text-[13.5px]">{p.name}</div>
                        <div className="text-[11.5px] text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <span className="font-semibold text-slate-700">{p.brand}</span>
                          <span>·</span>
                          <span>{p.model}</span>
                          {p.tracked && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold border border-indigo-200">
                              IMEI Tracked
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone="neutral">{p.category}</Badge>
                      </Td>
                      <Td>
                        <div className="text-[11.5px] text-muted-foreground">
                          {[p.ram && `${p.ram} RAM`, p.storage, p.color].filter(Boolean).join(" · ") ||
                            "—"}
                        </div>
                      </Td>
                      <Td right mono className="text-slate-600 font-medium">
                        {inr(p.purchasePrice)}
                      </Td>
                      <Td right mono>
                        <div className="font-bold text-primary text-[13.5px]">
                          {inr(p.sellingPrice)}
                        </div>
                        {margin > 0 && (
                          <span className="inline-block text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.2 rounded mt-0.5 border border-emerald-200/60">
                            +{margin}% margin
                          </span>
                        )}
                      </Td>
                      <Td right mono className="text-muted-foreground line-through text-[12px]">
                        {inr(p.mrp)}
                      </Td>
                      <Td>
                        <Badge tone={stock === 0 ? "danger" : isLow ? "warning" : "success"}>
                          {stock === 0 ? "Out of Stock" : `${stock} ${p.tracked ? "units" : "pcs"}`}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="ghost" onClick={() => openEditModal(p)}>
                            Edit
                          </Button>
                          {p.tracked && (
                            <Button
                              size="sm"
                              variant="soft"
                              onClick={() => {
                                setTargetProduct(p);
                                setNewImeis("");
                                setImeiModalOpen(true);
                              }}
                            >
                              + IMEIs
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                            onClick={() => openDeleteModal(p)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  );
                })}
              </Table>
            )}
          </Card>
        </>
      ) : (
        /* Hierarchy Masters Management Tab */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              type="button"
              onClick={() => setMasterLevel("categories")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                masterLevel === "categories"
                  ? "bg-primary/10 border-primary shadow-sm"
                  : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <div className="text-[12px] font-bold text-primary">1. Categories</div>
              <div className="text-[18px] font-extrabold text-foreground mt-1">
                {allCategories.length} Categories
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Top-level device domains</div>
            </button>

            <button
              type="button"
              onClick={() => setMasterLevel("subcategories")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                masterLevel === "subcategories"
                  ? "bg-primary/10 border-primary shadow-sm"
                  : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <div className="text-[12px] font-bold text-primary">2. Subcategories</div>
              <div className="text-[18px] font-extrabold text-foreground mt-1">
                {allSubcategories.length} Subcategories
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Under Category</div>
            </button>

            <button
              type="button"
              onClick={() => setMasterLevel("brands")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                masterLevel === "brands"
                  ? "bg-primary/10 border-primary shadow-sm"
                  : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <div className="text-[12px] font-bold text-primary">3. Brands / Makes</div>
              <div className="text-[18px] font-extrabold text-foreground mt-1">
                {allBrands.length} Brands
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Under Subcategory</div>
            </button>

            <button
              type="button"
              onClick={() => setMasterLevel("models")}
              className={`p-3.5 rounded-xl border text-left transition-all ${
                masterLevel === "models"
                  ? "bg-primary/10 border-primary shadow-sm"
                  : "bg-card border-border hover:border-primary/40"
              }`}
            >
              <div className="text-[12px] font-bold text-primary">4. Models</div>
              <div className="text-[18px] font-extrabold text-foreground mt-1">
                {allModels.length} Models
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">Under Brand</div>
            </button>
          </div>

          {/* Level 1: Categories */}
          {masterLevel === "categories" && (
            <Card>
              <CardHead
                title="Categories Master Management"
                sub="Manage master categories (Mobile, Tablet, Earbuds, Laptop, Mobile Accessories)"
                right={
                  <Button
                    onClick={() => {
                      setEditingCat(null);
                      setCatName("");
                      setCatIcon("📱");
                      setCatModalOpen(true);
                    }}
                  >
                    + Add Category
                  </Button>
                }
              />
              <Table head={["Category Name", "Slug", "Subcategories", "Status", "Actions"]}>
                {allCategories.map((c) => (
                  <Row key={c.id}>
                    <Td>
                      <div className="font-bold text-foreground flex items-center gap-2">
                        <span>{c.icon || "📁"}</span>
                        <span>{c.name}</span>
                      </div>
                    </Td>
                    <Td mono className="text-muted-foreground text-[12px]">
                      {c.slug}
                    </Td>
                    <Td>
                      <span className="text-[12px] font-semibold text-slate-700">
                        {c.subcategoriesCount} subcategories
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={c.active ? "success" : "danger"}>
                        {c.active ? "ACTIVE" : "INACTIVE"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingCat(c);
                            setCatName(c.name);
                            setCatIcon(c.icon || "");
                            setCatModalOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => toggleCategoryActive(c)}
                        >
                          {c.active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => deleteCategory(c.id)}
                        >
                          Delete
                        </Button>
                      </div>
                    </Td>
                  </Row>
                ))}
              </Table>
            </Card>
          )}

          {/* Level 2: Subcategories */}
          {masterLevel === "subcategories" && (
            <Card>
              <CardHead
                title="Subcategories Master Management"
                sub="Subcategories strictly belong to a Category (e.g. Smart Phone, Keypad Phone under Mobile)"
                right={
                  <div className="flex items-center gap-2">
                    <Select
                      value={masterFilterCatId}
                      onChange={(e) => setMasterFilterCatId(e.target.value)}
                      className="w-48 text-[12px]"
                    >
                      <option value="">All Categories</option>
                      {allCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      onClick={() => {
                        setEditingSubcat(null);
                        setSubcatCatId(masterFilterCatId || (allCategories[0]?.id ?? ""));
                        setSubcatName("");
                        setSubcatModalOpen(true);
                      }}
                    >
                      + Add Subcategory
                    </Button>
                  </div>
                }
              />
              <Table head={["Category", "Subcategory Name", "Slug", "Brands", "Status", "Actions"]}>
                {allSubcategories
                  .filter((s) => !masterFilterCatId || s.categoryId === masterFilterCatId)
                  .map((s) => (
                    <Row key={s.id}>
                      <Td>
                        <Badge tone="neutral">{s.categoryName}</Badge>
                      </Td>
                      <Td>
                        <span className="font-bold text-foreground text-[13px]">{s.name}</span>
                      </Td>
                      <Td mono className="text-muted-foreground text-[12px]">
                        {s.slug}
                      </Td>
                      <Td>
                        <span className="text-[12px] font-semibold text-slate-700">
                          {s.brandsCount} brands
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={s.active ? "success" : "danger"}>
                          {s.active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingSubcat(s);
                              setSubcatCatId(s.categoryId);
                              setSubcatName(s.name);
                              setSubcatModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => toggleSubcategoryActive(s)}
                          >
                            {s.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteSubcategory(s.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  ))}
              </Table>
            </Card>
          )}

          {/* Level 3: Brands */}
          {masterLevel === "brands" && (
            <Card>
              <CardHead
                title="Brands Master Management"
                sub="Brands strictly belong to a Subcategory (e.g. OPPO under Smart Phone)"
                right={
                  <div className="flex items-center gap-2">
                    <Select
                      value={masterFilterSubcatId}
                      onChange={(e) => setMasterFilterSubcatId(e.target.value)}
                      className="w-48 text-[12px]"
                    >
                      <option value="">All Subcategories</option>
                      {allSubcategories.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.categoryName} → {s.name}
                        </option>
                      ))}
                    </Select>
                    <Button
                      onClick={() => {
                        setEditingBrand(null);
                        setBrandSubcatId(masterFilterSubcatId || (allSubcategories[0]?.id ?? ""));
                        setBrandName("");
                        setBrandLogo("");
                        setBrandModalOpen(true);
                      }}
                    >
                      + Add Brand
                    </Button>
                  </div>
                }
              />
              <Table head={["Hierarchy (Cat → Subcat)", "Brand Name", "Models", "Status", "Actions"]}>
                {allBrands
                  .filter((b) => !masterFilterSubcatId || b.subcategoryId === masterFilterSubcatId)
                  .map((b) => (
                    <Row key={b.id}>
                      <Td>
                        <span className="text-[12px] text-muted-foreground font-medium">
                          {b.categoryName} →{" "}
                          <span className="font-semibold text-foreground">{b.subcategoryName}</span>
                        </span>
                      </Td>
                      <Td>
                        <span className="font-bold text-foreground text-[13.5px]">{b.name}</span>
                      </Td>
                      <Td>
                        <span className="text-[12px] font-semibold text-slate-700">
                          {b.modelsCount} models
                        </span>
                      </Td>
                      <Td>
                        <Badge tone={b.active ? "success" : "danger"}>
                          {b.active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingBrand(b);
                              setBrandSubcatId(b.subcategoryId);
                              setBrandName(b.name);
                              setBrandLogo(b.logoUrl || "");
                              setBrandModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => toggleBrandActive(b)}
                          >
                            {b.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteBrand(b.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  ))}
              </Table>
            </Card>
          )}

          {/* Level 4: Models */}
          {masterLevel === "models" && (
            <Card>
              <CardHead
                title="Models Master Management"
                sub="Models strictly belong to a Brand (e.g. OPPO A5 under OPPO)"
                right={
                  <div className="flex items-center gap-2">
                    <Select
                      value={masterFilterBrandId}
                      onChange={(e) => setMasterFilterBrandId(e.target.value)}
                      className="w-48 text-[12px]"
                    >
                      <option value="">All Brands</option>
                      {allBrands.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.subcategoryName})
                        </option>
                      ))}
                    </Select>
                    <Button
                      onClick={() => {
                        setEditingModel(null);
                        setModelBrandId(masterFilterBrandId || (allBrands[0]?.id ?? ""));
                        setModelName("");
                        setModelNumber("");
                        setModelYear(new Date().getFullYear());
                        setModelModalOpen(true);
                      }}
                    >
                      + Add Model
                    </Button>
                  </div>
                }
              />
              <Table head={["Brand Name", "Model Name", "Model Number", "Release Year", "Status", "Actions"]}>
                {allModels
                  .filter((m) => !masterFilterBrandId || m.brandId === masterFilterBrandId)
                  .map((m) => (
                    <Row key={m.id}>
                      <Td>
                        <Badge tone="info">{m.brandName}</Badge>
                      </Td>
                      <Td>
                        <span className="font-bold text-foreground text-[13.5px]">{m.name}</span>
                      </Td>
                      <Td mono className="text-muted-foreground text-[12px]">
                        {m.modelNumber || "—"}
                      </Td>
                      <Td className="text-slate-600 font-medium text-[12px]">
                        {m.releaseYear || "—"}
                      </Td>
                      <Td>
                        <Badge tone={m.active ? "success" : "danger"}>
                          {m.active ? "ACTIVE" : "INACTIVE"}
                        </Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingModel(m);
                              setModelBrandId(m.brandId);
                              setModelName(m.name);
                              setModelNumber(m.modelNumber || "");
                              setModelYear(m.releaseYear || new Date().getFullYear());
                              setModelModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="soft"
                            onClick={() => toggleModelActive(m)}
                          >
                            {m.active ? "Deactivate" : "Activate"}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => deleteModel(m.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Td>
                    </Row>
                  ))}
              </Table>
            </Card>
          )}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingProduct ? "Edit Product" : "Add New Product"}
        wide
      >
        <form onSubmit={handleSaveProduct} className="space-y-3">
          {hierarchy.length > 0 ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-semibold text-primary">
                  ⚡ Dynamic Hierarchy Flow (Category → Subcategory → Brand → Model)
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Parent selection clears and validates children
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                <Field label="1. Category">
                  <Select
                    value={selectedCatId}
                    onChange={(e) => {
                      const catId = e.target.value;
                      setSelectedCatId(catId);
                      setSelectedSubcatId("");
                      setSelectedBrandId("");
                      setSelectedModelId("");
                      const catObj = hierarchy.find((c) => c.id === catId);
                      if (catObj) {
                        setForm((f) => ({
                          ...f,
                          category: catObj.name as any,
                          categoryId: catId,
                          subcategoryId: undefined,
                          brandId: undefined,
                          modelId: undefined,
                        }));
                      } else {
                        setForm((f) => ({
                          ...f,
                          categoryId: undefined,
                          subcategoryId: undefined,
                          brandId: undefined,
                          modelId: undefined,
                        }));
                      }
                    }}
                  >
                    <option value="">Select Category</option>
                    {hierarchy.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="2. Subcategory">
                  <Select
                    value={selectedSubcatId}
                    disabled={!selectedCatId}
                    onChange={(e) => {
                      const subId = e.target.value;
                      setSelectedSubcatId(subId);
                      setSelectedBrandId("");
                      setSelectedModelId("");
                      setForm((f) => ({
                        ...f,
                        subcategoryId: subId || undefined,
                        brandId: undefined,
                        modelId: undefined,
                      }));
                    }}
                  >
                    <option value="">Select Subcategory</option>
                    {currentSubcategories.map((s: any) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="3. Brand">
                  <Select
                    value={selectedBrandId}
                    disabled={!selectedSubcatId}
                    onChange={(e) => {
                      const bId = e.target.value;
                      setSelectedBrandId(bId);
                      setSelectedModelId("");
                      const bObj = currentBrands.find((b: any) => b.id === bId);
                      if (bObj) {
                        setForm((f) => ({
                          ...f,
                          brand: bObj.name,
                          brandId: bId,
                          modelId: undefined,
                        }));
                      } else {
                        setForm((f) => ({
                          ...f,
                          brandId: undefined,
                          modelId: undefined,
                        }));
                      }
                    }}
                  >
                    <option value="">Select Brand</option>
                    {currentBrands.map((b: any) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </Field>

                <Field label="4. Model">
                  <Select
                    value={selectedModelId}
                    disabled={!selectedBrandId}
                    onChange={(e) => {
                      const mId = e.target.value;
                      setSelectedModelId(mId);
                      const mObj = currentModels.find((m: any) => m.id === mId);
                      if (mObj) {
                        setForm((f) => ({
                          ...f,
                          model: mObj.name,
                          modelId: mId,
                          name: `${f.brand || ""} ${mObj.name}`.trim(),
                        }));
                      } else {
                        setForm((f) => ({ ...f, modelId: undefined }));
                      }
                    }}
                  >
                    <option value="">Select Model</option>
                    {currentModels.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Product Name *">
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Samsung Galaxy A15 5G"
              />
            </Field>
            <Field label="Brand *">
              <Input
                required
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="e.g. Samsung"
              />
            </Field>
            <Field label="Model">
              <Input
                value={form.model}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. A15 5G"
              />
            </Field>
            <Field label="Category">
              <Select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as Category })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="RAM">
              <Input
                value={form.ram}
                onChange={(e) => setForm({ ...form, ram: e.target.value })}
                placeholder="e.g. 8GB"
              />
            </Field>
            <Field label="Storage">
              <Input
                value={form.storage}
                onChange={(e) => setForm({ ...form, storage: e.target.value })}
                placeholder="e.g. 128GB"
              />
            </Field>
            <Field label="Color">
              <Input
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="e.g. Midnight Black"
              />
            </Field>
            <Field label="Tracking Mode">
              <Select
                value={form.tracked ? "tracked" : "bulk"}
                onChange={(e) => setForm({ ...form, tracked: e.target.value === "tracked" })}
              >
                <option value="tracked">Tracked by IMEI / Serial (Mobiles, Tablets)</option>
                <option value="bulk">Quantity / Non-tracked (Accessories, Cables)</option>
              </Select>
            </Field>
            <Field label="Purchase Cost (₹)">
              <Input
                type="number"
                value={form.purchasePrice}
                onChange={(e) => setForm({ ...form, purchasePrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="Selling Price (₹)">
              <Input
                type="number"
                value={form.sellingPrice}
                onChange={(e) => setForm({ ...form, sellingPrice: Number(e.target.value) })}
              />
            </Field>
            <Field label="MRP (₹)">
              <Input
                type="number"
                value={form.mrp}
                onChange={(e) => setForm({ ...form, mrp: Number(e.target.value) })}
              />
            </Field>
            <Field label="GST (%)">
              <Input
                type="number"
                value={form.gst}
                onChange={(e) => setForm({ ...form, gst: Number(e.target.value) })}
              />
            </Field>
            {!form.tracked && (
              <Field label="Current Quantity">
                <Input
                  type="number"
                  value={form.qty}
                  onChange={(e) => setForm({ ...form, qty: Number(e.target.value) })}
                />
              </Field>
            )}
            <Field label="Reorder Alert Level">
              <Input
                type="number"
                value={form.reorderLevel}
                onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-border">
            {editingProduct ? (
              <Button
                type="button"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200"
                onClick={() => openDeleteModal(editingProduct)}
              >
                Delete Product
              </Button>
            ) : (
              <div />
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">
                {editingProduct ? "Save Changes" : "Create Product"}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Delete Product Confirmation Modal */}
      <Modal
        open={deleteModalOpen}
        onClose={() => {
          if (!isDeleting) {
            setDeleteModalOpen(false);
            setProductToDelete(null);
            setDeleteError("");
          }
        }}
        title="Delete Product"
      >
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[13px] flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-semibold">Are you sure you want to delete this product?</p>
              <p className="text-[12px] text-rose-700 mt-0.5">
                This will permanently remove the product from your catalog.
              </p>
            </div>
          </div>

          {productToDelete && (
            <div className="rounded-lg border border-border bg-slate-50/50 p-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Product Name:</span>
                <span className="font-semibold text-foreground">{productToDelete.name}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Brand & Model:</span>
                <span className="font-medium text-foreground">{productToDelete.brand} — {productToDelete.model}</span>
              </div>
              {(productToDelete.ram || productToDelete.storage || productToDelete.color) && (
                <div className="flex justify-between items-center py-1 border-b border-border/50">
                  <span className="text-muted-foreground">Variant:</span>
                  <span className="font-medium text-foreground">
                    {[productToDelete.ram && `${productToDelete.ram} RAM`, productToDelete.storage, productToDelete.color].filter(Boolean).join(" · ")}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center py-1 border-b border-border/50">
                <span className="text-muted-foreground">Category:</span>
                <span className="font-medium text-foreground">{productToDelete.category}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-muted-foreground">Current Stock:</span>
                <span className="font-bold text-foreground">
                  {stockOf(db, productToDelete.id)} {productToDelete.tracked ? "units (IMEI tracked)" : "pcs"}
                </span>
              </div>
            </div>
          )}

          {deleteError && (
            <div className="p-3 rounded-md bg-rose-100 border border-rose-300 text-rose-900 text-[12px] space-y-2">
              <p className="font-semibold">{deleteError}</p>
              {deleteError.includes("transaction history") && (
                <div className="pt-2 border-t border-rose-200 flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="danger"
                    disabled={isDeleting}
                    onClick={() => handleConfirmDelete(true)}
                  >
                    {isDeleting ? "Force Deleting..." : "Force Delete Anyway"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="ghost"
              disabled={isDeleting}
              onClick={() => {
                setDeleteModalOpen(false);
                setProductToDelete(null);
                setDeleteError("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={isDeleting}
              onClick={() => handleConfirmDelete(false)}
            >
              {isDeleting ? "Deleting..." : "Delete Product"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add IMEIs Modal */}
      <Modal
        open={imeiModalOpen}
        onClose={() => setImeiModalOpen(false)}
        title={`Add IMEIs — ${targetProduct?.name}`}
      >
        <form onSubmit={handleAddImeis} className="space-y-3">
          <Field label="Paste IMEIs (one per line)">
            <textarea
              className="w-full h-32 rounded-md border border-border bg-[var(--surface-glass-strong)] p-2 text-[12px] font-mono outline-none focus:border-primary"
              placeholder="354012000158380&#10;354012000158381"
              value={newImeis}
              onChange={(e) => setNewImeis(e.target.value)}
              required
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setImeiModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Add to Inventory</Button>
          </div>
        </form>
      </Modal>

      {/* Category Modal */}
      <Modal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={editingCat ? "Edit Category" : "Add New Category"}
      >
        <form onSubmit={saveCategory} className="space-y-3">
          <Field label="Category Name *">
            <Input
              required
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="e.g. Mobile Phones, Tablets"
            />
          </Field>
          <Field label="Icon / Emoji">
            <Input
              value={catIcon}
              onChange={(e) => setCatIcon(e.target.value)}
              placeholder="e.g. 📱"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setCatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingCat ? "Update Category" : "Create Category"}</Button>
          </div>
        </form>
      </Modal>

      {/* Subcategory Modal */}
      <Modal
        open={subcatModalOpen}
        onClose={() => setSubcatModalOpen(false)}
        title={editingSubcat ? "Edit Subcategory" : "Add New Subcategory"}
      >
        <form onSubmit={saveSubcategory} className="space-y-3">
          <Field label="Belongs to Category *">
            <Select
              required
              value={subcatCatId}
              onChange={(e) => setSubcatCatId(e.target.value)}
            >
              <option value="">Select Category</option>
              {allCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Subcategory Name *">
            <Input
              required
              value={subcatName}
              onChange={(e) => setSubcatName(e.target.value)}
              placeholder="e.g. Smart Phone, Keypad Phone"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setSubcatModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingSubcat ? "Update Subcategory" : "Create Subcategory"}</Button>
          </div>
        </form>
      </Modal>

      {/* Brand Modal */}
      <Modal
        open={brandModalOpen}
        onClose={() => setBrandModalOpen(false)}
        title={editingBrand ? "Edit Brand" : "Add New Brand"}
      >
        <form onSubmit={saveBrand} className="space-y-3">
          <Field label="Belongs to Subcategory *">
            <Select
              required
              value={brandSubcatId}
              onChange={(e) => setBrandSubcatId(e.target.value)}
            >
              <option value="">Select Subcategory</option>
              {allSubcategories.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.categoryName} → {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand Name *">
            <Input
              required
              value={brandName}
              onChange={(e) => setBrandName(e.target.value)}
              placeholder="e.g. OPPO, Apple, Samsung, Vivo"
            />
          </Field>
          <Field label="Logo URL (Optional)">
            <Input
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              placeholder="https://..."
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setBrandModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingBrand ? "Update Brand" : "Create Brand"}</Button>
          </div>
        </form>
      </Modal>

      {/* Model Modal */}
      <Modal
        open={modelModalOpen}
        onClose={() => setModelModalOpen(false)}
        title={editingModel ? "Edit Model" : "Add New Model"}
      >
        <form onSubmit={saveModel} className="space-y-3">
          <Field label="Belongs to Brand *">
            <Select
              required
              value={modelBrandId}
              onChange={(e) => setModelBrandId(e.target.value)}
            >
              <option value="">Select Brand</option>
              {allBrands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.subcategoryName})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Model Name *">
            <Input
              required
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. OPPO A5, iPhone 15"
            />
          </Field>
          <Field label="Model Number (Optional)">
            <Input
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              placeholder="e.g. CPH1931"
            />
          </Field>
          <Field label="Release Year">
            <Input
              type="number"
              value={modelYear ?? ""}
              onChange={(e) => setModelYear(Number(e.target.value) || undefined)}
              placeholder="e.g. 2024"
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button type="button" variant="ghost" onClick={() => setModelModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">{editingModel ? "Update Model" : "Create Model"}</Button>
          </div>
        </form>
      </Modal>

      {/* EXCEL / CSV BULK IMPORT MODAL */}
      <ExcelProductImportModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={() => {
          loadHierarchy();
          refreshFromBackend();
        }}
      />
    </div>
  );
}
