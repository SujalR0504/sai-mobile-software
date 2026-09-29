import type { DatabaseSync } from "node:sqlite";
import { uid } from "../../../shared/utils/format";
import type {
  BrandEntity,
  CategoryEntity,
  ModelEntity,
  SubcategoryEntity,
} from "../../../shared/types";

export interface CreateCategoryInput {
  businessId?: string;
  name: string;
  slug?: string;
  description?: string;
  icon?: string;
  active?: boolean;
  throwOnDuplicate?: boolean;
}

export interface CreateSubcategoryInput {
  businessId?: string;
  categoryId: string;
  name: string;
  slug?: string;
  description?: string;
  active?: boolean;
  throwOnDuplicate?: boolean;
}

export interface CreateBrandInput {
  businessId?: string;
  categoryId?: string;
  subcategoryId?: string;
  name: string;
  slug?: string;
  logoUrl?: string;
  active?: boolean;
  throwOnDuplicate?: boolean;
}

export interface CreateModelInput {
  businessId?: string;
  brandId: string;
  categoryId?: string;
  subcategoryId?: string;
  name: string;
  modelNumber?: string;
  releaseYear?: number;
  active?: boolean;
  throwOnDuplicate?: boolean;
}

export function getCategories(db: DatabaseSync, businessId = "biz_default"): CategoryEntity[] {
  const rows = db
    .prepare("SELECT * FROM categories WHERE business_id = ? ORDER BY name ASC")
    .all(businessId) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? undefined,
    icon: r.icon ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));
}

export function getSubcategories(
  db: DatabaseSync,
  categoryId?: string,
  businessId = "biz_default"
): SubcategoryEntity[] {
  let query = "SELECT * FROM subcategories WHERE business_id = ?";
  const params: any[] = [businessId];
  if (categoryId) {
    query += " AND category_id = ?";
    params.push(categoryId);
  }
  query += " ORDER BY name ASC";
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    categoryId: r.category_id,
    name: r.name,
    slug: r.slug,
    description: r.description ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));
}

export function getBrands(
  db: DatabaseSync,
  subcategoryId?: string,
  categoryId?: string,
  businessId = "biz_default"
): BrandEntity[] {
  let query = "SELECT * FROM brands WHERE business_id = ?";
  const params: any[] = [businessId];
  if (subcategoryId) {
    query += " AND (subcategory_id = ? OR subcategory_id IS NULL)";
    params.push(subcategoryId);
  } else if (categoryId) {
    query += " AND (category_id = ? OR category_id IS NULL)";
    params.push(categoryId);
  }
  query += " ORDER BY name ASC";
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    categoryId: r.category_id ?? undefined,
    subcategoryId: r.subcategory_id ?? undefined,
    name: r.name,
    slug: r.slug,
    logoUrl: r.logo_url ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));
}

export function getModels(
  db: DatabaseSync,
  brandId?: string,
  categoryId?: string,
  subcategoryId?: string,
  businessId = "biz_default"
): ModelEntity[] {
  let query = "SELECT * FROM models WHERE business_id = ?";
  const params: any[] = [businessId];
  if (brandId) {
    query += " AND brand_id = ?";
    params.push(brandId);
  }
  if (categoryId) {
    query += " AND (category_id = ? OR category_id IS NULL)";
    params.push(categoryId);
  }
  if (subcategoryId) {
    query += " AND (subcategory_id = ? OR subcategory_id IS NULL)";
    params.push(subcategoryId);
  }
  query += " ORDER BY name ASC";
  const rows = db.prepare(query).all(...params) as any[];
  return rows.map((r) => ({
    id: r.id,
    businessId: r.business_id,
    brandId: r.brand_id,
    categoryId: r.category_id ?? undefined,
    subcategoryId: r.subcategory_id ?? undefined,
    name: r.name,
    modelNumber: r.model_number ?? undefined,
    releaseYear: r.release_year ?? undefined,
    active: Boolean(r.active),
    createdAt: r.created_at,
  }));
}

export interface HierarchyTreeItem extends CategoryEntity {
  subcategories: (SubcategoryEntity & {
    brands: (BrandEntity & {
      models: ModelEntity[];
    })[];
  })[];
}

export function getCategoryHierarchy(db: DatabaseSync, businessId = "biz_default"): HierarchyTreeItem[] {
  const categories = getCategories(db, businessId);
  const subcategories = getSubcategories(db, undefined, businessId);
  const brands = getBrands(db, undefined, undefined, businessId);
  const models = getModels(db, undefined, undefined, undefined, businessId);

  return categories.map((cat) => {
    const catSubs = subcategories.filter((s) => s.categoryId === cat.id);
    return {
      ...cat,
      subcategories: catSubs.map((sub) => {
        // Brands linked to this subcategory or linked to this category or global
        const subBrands = brands.filter((b) =>
          (b.subcategoryId && b.subcategoryId === sub.id) ||
          (!b.subcategoryId && b.categoryId && b.categoryId === cat.id) ||
          (!b.subcategoryId && !b.categoryId)
        );
        return {
          ...sub,
          brands: subBrands.map((b) => ({
            ...b,
            models: models.filter((m) =>
              m.brandId === b.id &&
              (!m.subcategoryId || m.subcategoryId === sub.id) &&
              (!m.categoryId || m.categoryId === cat.id)
            ),
          })),
        };
      }),
    };
  });
}

export function createCategory(db: DatabaseSync, input: CreateCategoryInput): CategoryEntity {
  const businessId = input.businessId || "biz_default";
  const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const existing = db.prepare("SELECT * FROM categories WHERE (business_id = ? OR business_id = 'biz_default') AND (LOWER(name) = LOWER(?) OR slug = ?)").get(businessId, input.name.trim(), slug) as any;
  if (existing) {
    if (input.throwOnDuplicate) {
      throw new Error(`Category '${input.name.trim()}' already exists.`);
    }
    return {
      id: existing.id,
      businessId: existing.business_id,
      name: existing.name,
      slug: existing.slug,
      description: existing.description || input.description,
      icon: existing.icon || input.icon,
      active: Boolean(existing.active),
      createdAt: existing.created_at,
    };
  }

  const id = uid("cat");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO categories (id, business_id, name, slug, description, icon, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, businessId, input.name.trim(), slug, input.description ?? null, input.icon ?? null, input.active !== false ? 1 : 0, now);

  return {
    id,
    businessId,
    name: input.name.trim(),
    slug,
    description: input.description,
    icon: input.icon,
    active: input.active !== false,
    createdAt: now,
  };
}

export function createSubcategory(db: DatabaseSync, input: CreateSubcategoryInput): SubcategoryEntity {
  const businessId = input.businessId || "biz_default";
  const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const existing = db.prepare("SELECT * FROM subcategories WHERE category_id = ? AND (LOWER(name) = LOWER(?) OR slug = ?)").get(input.categoryId, input.name.trim(), slug) as any;
  if (existing) {
    if (input.throwOnDuplicate) {
      throw new Error(`Subcategory '${input.name.trim()}' already exists under this category.`);
    }
    return {
      id: existing.id,
      businessId: existing.business_id,
      categoryId: existing.category_id,
      name: existing.name,
      slug: existing.slug,
      description: existing.description || input.description,
      active: Boolean(existing.active),
      createdAt: existing.created_at,
    };
  }

  const id = uid("subcat");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO subcategories (id, business_id, category_id, name, slug, description, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, businessId, input.categoryId, input.name.trim(), slug, input.description ?? null, input.active !== false ? 1 : 0, now);

  return {
    id,
    businessId,
    categoryId: input.categoryId,
    name: input.name.trim(),
    slug,
    description: input.description,
    active: input.active !== false,
    createdAt: now,
  };
}

export function createBrand(db: DatabaseSync, input: CreateBrandInput): BrandEntity {
  const businessId = input.businessId || "biz_default";
  const slug = input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  const existing = db.prepare("SELECT * FROM brands WHERE (business_id = ? OR business_id = 'biz_default') AND (LOWER(name) = LOWER(?) OR slug = ?)").get(businessId, input.name.trim(), slug) as any;
  if (existing) {
    if (input.throwOnDuplicate) {
      throw new Error(`Brand '${input.name.trim()}' already exists.`);
    }
    if (input.subcategoryId && existing.subcategory_id !== input.subcategoryId) {
      db.prepare("UPDATE brands SET subcategory_id = ? WHERE id = ?").run(input.subcategoryId, existing.id);
      existing.subcategory_id = input.subcategoryId;
    }
    if (input.categoryId && existing.category_id !== input.categoryId) {
      db.prepare("UPDATE brands SET category_id = ? WHERE id = ?").run(input.categoryId, existing.id);
      existing.category_id = input.categoryId;
    }
    return {
      id: existing.id,
      businessId: existing.business_id,
      categoryId: existing.category_id,
      subcategoryId: existing.subcategory_id,
      name: existing.name,
      slug: existing.slug,
      logoUrl: existing.logo_url,
      active: Boolean(existing.active),
      createdAt: existing.created_at,
    };
  }

  const id = uid("brd");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO brands (id, business_id, category_id, subcategory_id, name, slug, logo_url, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, businessId, input.categoryId ?? null, input.subcategoryId ?? null, input.name.trim(), slug, input.logoUrl ?? null, input.active !== false ? 1 : 0, now);

  return {
    id,
    businessId,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    name: input.name.trim(),
    slug,
    logoUrl: input.logoUrl,
    active: input.active !== false,
    createdAt: now,
  };
}

export function createModel(db: DatabaseSync, input: CreateModelInput): ModelEntity {
  const businessId = input.businessId || "biz_default";
  const existing = db.prepare("SELECT * FROM models WHERE brand_id = ? AND LOWER(name) = LOWER(?)").get(input.brandId, input.name.trim()) as any;
  if (existing) {
    if (input.throwOnDuplicate) {
      throw new Error(`Model '${input.name.trim()}' already exists under this brand.`);
    }
    return {
      id: existing.id,
      businessId: existing.business_id,
      brandId: existing.brand_id,
      categoryId: existing.category_id,
      subcategoryId: existing.subcategory_id,
      name: existing.name,
      modelNumber: existing.model_number,
      releaseYear: existing.release_year,
      active: Boolean(existing.active),
      createdAt: existing.created_at,
    };
  }

  const id = uid("mdl");
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO models (id, business_id, brand_id, category_id, subcategory_id, name, model_number, release_year, active, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, businessId, input.brandId, input.categoryId ?? null, input.subcategoryId ?? null, input.name.trim(), input.modelNumber ?? null, input.releaseYear ?? null, input.active !== false ? 1 : 0, now);

  return {
    id,
    businessId,
    brandId: input.brandId,
    categoryId: input.categoryId,
    subcategoryId: input.subcategoryId,
    name: input.name.trim(),
    modelNumber: input.modelNumber,
    releaseYear: input.releaseYear,
    active: input.active !== false,
    createdAt: now,
  };
}

export function updateCategory(
  db: DatabaseSync,
  id: string,
  input: Partial<CreateCategoryInput>
): CategoryEntity {
  const current = db.prepare("SELECT * FROM categories WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Category '${id}' not found`);

  const name = input.name ?? current.name;
  const slug = input.slug ?? current.slug;
  const icon = input.icon !== undefined ? input.icon : current.icon;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : current.active;

  db.prepare("UPDATE categories SET name = ?, slug = ?, icon = ?, active = ? WHERE id = ?").run(
    name,
    slug,
    icon ?? null,
    active,
    id
  );

  return {
    id,
    businessId: current.business_id,
    name,
    slug,
    icon: icon ?? undefined,
    active: Boolean(active),
    createdAt: current.created_at,
  };
}

export function deleteCategory(db: DatabaseSync, id: string): boolean {
  const subCount = db.prepare("SELECT COUNT(*) as cnt FROM subcategories WHERE category_id = ?").get(id) as any;
  if (subCount && subCount.cnt > 0) {
    db.prepare("UPDATE categories SET active = 0 WHERE id = ?").run(id);
    return true;
  }
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
  return true;
}

export function updateSubcategory(
  db: DatabaseSync,
  id: string,
  input: Partial<CreateSubcategoryInput>
): SubcategoryEntity {
  const current = db.prepare("SELECT * FROM subcategories WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Subcategory '${id}' not found`);

  const categoryId = input.categoryId ?? current.category_id;
  const name = input.name ?? current.name;
  const slug = input.slug ?? current.slug;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : current.active;

  db.prepare("UPDATE subcategories SET category_id = ?, name = ?, slug = ?, active = ? WHERE id = ?").run(
    categoryId,
    name,
    slug,
    active,
    id
  );

  return {
    id,
    businessId: current.business_id,
    categoryId,
    name,
    slug,
    active: Boolean(active),
    createdAt: current.created_at,
  };
}

export function deleteSubcategory(db: DatabaseSync, id: string): boolean {
  const brandCount = db.prepare("SELECT COUNT(*) as cnt FROM brands WHERE subcategory_id = ?").get(id) as any;
  if (brandCount && brandCount.cnt > 0) {
    db.prepare("UPDATE subcategories SET active = 0 WHERE id = ?").run(id);
    return true;
  }
  db.prepare("DELETE FROM subcategories WHERE id = ?").run(id);
  return true;
}

export function updateBrand(
  db: DatabaseSync,
  id: string,
  input: Partial<CreateBrandInput>
): BrandEntity {
  const current = db.prepare("SELECT * FROM brands WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Brand '${id}' not found`);

  const subcategoryId = input.subcategoryId !== undefined ? input.subcategoryId : current.subcategory_id;
  const name = input.name ?? current.name;
  const slug = input.slug ?? current.slug;
  const logoUrl = input.logoUrl !== undefined ? input.logoUrl : current.logo_url;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : current.active;

  db.prepare("UPDATE brands SET subcategory_id = ?, name = ?, slug = ?, logo_url = ?, active = ? WHERE id = ?").run(
    subcategoryId ?? null,
    name,
    slug,
    logoUrl ?? null,
    active,
    id
  );

  return {
    id,
    businessId: current.business_id,
    subcategoryId: subcategoryId ?? undefined,
    name,
    slug,
    logoUrl: logoUrl ?? undefined,
    active: Boolean(active),
    createdAt: current.created_at,
  };
}

export function deleteBrand(db: DatabaseSync, id: string): boolean {
  const modelCount = db.prepare("SELECT COUNT(*) as cnt FROM models WHERE brand_id = ?").get(id) as any;
  if (modelCount && modelCount.cnt > 0) {
    db.prepare("UPDATE brands SET active = 0 WHERE id = ?").run(id);
    return true;
  }
  db.prepare("DELETE FROM brands WHERE id = ?").run(id);
  return true;
}

export function updateModel(
  db: DatabaseSync,
  id: string,
  input: Partial<CreateModelInput>
): ModelEntity {
  const current = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as any;
  if (!current) throw new Error(`Model '${id}' not found`);

  const brandId = input.brandId ?? current.brand_id;
  const name = input.name ?? current.name;
  const modelNumber = input.modelNumber !== undefined ? input.modelNumber : current.model_number;
  const releaseYear = input.releaseYear !== undefined ? input.releaseYear : current.release_year;
  const active = input.active !== undefined ? (input.active ? 1 : 0) : current.active;

  db.prepare("UPDATE models SET brand_id = ?, name = ?, model_number = ?, release_year = ?, active = ? WHERE id = ?").run(
    brandId,
    name,
    modelNumber ?? null,
    releaseYear ?? null,
    active,
    id
  );

  return {
    id,
    businessId: current.business_id,
    brandId,
    name,
    modelNumber: modelNumber ?? undefined,
    releaseYear: releaseYear ?? undefined,
    active: Boolean(active),
    createdAt: current.created_at,
  };
}

export function deleteModel(db: DatabaseSync, id: string): boolean {
  const prodCount = db.prepare("SELECT COUNT(*) as cnt FROM products WHERE model_id = ?").get(id) as any;
  if (prodCount && prodCount.cnt > 0) {
    db.prepare("UPDATE models SET active = 0 WHERE id = ?").run(id);
    return true;
  }
  db.prepare("DELETE FROM models WHERE id = ?").run(id);
  return true;
}

export function validateHierarchyRelationships(
  db: DatabaseSync,
  relationships: {
    categoryId?: string;
    subcategoryId?: string;
    brandId?: string;
    modelId?: string;
  }
): void {
  const { categoryId, subcategoryId, brandId, modelId } = relationships;

  if (modelId) {
    const model = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId) as any;
    if (!model) throw new Error(`Invalid Model: Model '${modelId}' does not exist.`);
    if (brandId && model.brand_id !== brandId) {
      throw new Error(`Hierarchy validation failed: Model '${model.name}' does not belong to the selected Brand.`);
    }
  }

  if (brandId && subcategoryId) {
    const brand = db.prepare("SELECT * FROM brands WHERE id = ?").get(brandId) as any;
    if (!brand) throw new Error(`Invalid Brand: Brand '${brandId}' does not exist.`);
    if (brand.subcategory_id && brand.subcategory_id !== subcategoryId) {
      throw new Error(`Hierarchy validation failed: Brand '${brand.name}' does not belong to the selected Subcategory.`);
    }
  }

  if (subcategoryId && categoryId) {
    const subcat = db.prepare("SELECT * FROM subcategories WHERE id = ?").get(subcategoryId) as any;
    if (!subcat) throw new Error(`Invalid Subcategory: Subcategory '${subcategoryId}' does not exist.`);
    if (subcat.category_id !== categoryId) {
      throw new Error(`Hierarchy validation failed: Subcategory '${subcat.name}' does not belong to the selected Category.`);
    }
  }
}

export interface BulkImportProductRow {
  category?: string;
  subcategory?: string;
  brand: string;
  model: string;
  sellingPrice?: number;
  purchasePrice?: number;
  costPrice?: number;
  mrp?: number;
  gst?: number;
  ram?: string;
  storage?: string;
  color?: string;
  barcode?: string;
  hsn?: string;
  tracked?: boolean | string;
  openingStock?: number;
}

export function bulkImportHierarchyAndProducts(
  db: DatabaseSync,
  rows: BulkImportProductRow[],
  businessId = "biz_default"
) {
  let categoriesCreated = 0;
  let subcategoriesCreated = 0;
  let brandsCreated = 0;
  let modelsCreated = 0;
  let productsCreated = 0;
  let productsUpdated = 0;
  const errors: string[] = [];

  db.exec("BEGIN TRANSACTION;");
  try {
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!r.brand || !r.brand.trim() || !r.model || !r.model.trim()) {
        errors.push(`Row ${i + 1}: Brand and Model are required.`);
        continue;
      }

      // 1. Category
      let catId: string | undefined = undefined;
      const catName = r.category?.trim();
      if (catName) {
        const cat = createCategory(db, { name: catName, businessId, throwOnDuplicate: false });
        catId = cat.id;
        if (cat.createdAt && new Date(cat.createdAt).getTime() > Date.now() - 5000) {
          categoriesCreated++;
        }
      }

      // 2. Subcategory
      let subcatId: string | undefined = undefined;
      const subcatName = r.subcategory?.trim();
      if (subcatName && catId) {
        const sub = createSubcategory(db, { categoryId: catId, name: subcatName, businessId, throwOnDuplicate: false });
        subcatId = sub.id;
        if (sub.createdAt && new Date(sub.createdAt).getTime() > Date.now() - 5000) {
          subcategoriesCreated++;
        }
      }

      // 3. Brand
      const brandName = r.brand.trim();
      const brand = createBrand(db, { name: brandName, categoryId: catId, subcategoryId: subcatId, businessId, throwOnDuplicate: false });
      if (brand.createdAt && new Date(brand.createdAt).getTime() > Date.now() - 5000) {
        brandsCreated++;
      }

      // 4. Model
      const modelName = r.model.trim();
      const model = createModel(db, { brandId: brand.id, categoryId: catId, subcategoryId: subcatId, name: modelName, businessId, throwOnDuplicate: false });
      if (model.createdAt && new Date(model.createdAt).getTime() > Date.now() - 5000) {
        modelsCreated++;
      }

      // 5. Product in Catalog
      const isMobile = !r.category || /mobile|phone|tablet|smartphone/i.test(r.category);
      const isTracked = r.tracked !== undefined
        ? (typeof r.tracked === "string" ? r.tracked.toLowerCase() === "true" || r.tracked === "1" || r.tracked.toLowerCase() === "yes" : Boolean(r.tracked))
        : isMobile;

      const pPrice = Number(r.purchasePrice ?? r.costPrice ?? 0) || 0;
      const sPrice = Number(r.sellingPrice ?? r.mrp ?? pPrice) || pPrice;
      const mrp = Number(r.mrp ?? sPrice) || sPrice;
      const gst = r.gst !== undefined && !isNaN(Number(r.gst)) ? Number(r.gst) : 18;

      const ram = r.ram?.trim() || "";
      const storage = r.storage?.trim() || "";
      const color = r.color?.trim() || "";
      const specs = [ram && `${ram} RAM`, storage, color].filter(Boolean).join(" ");
      const fullName = `${brandName} ${modelName}${specs ? ` ${specs}` : ""}`.trim();

      // Check if product already exists with this model and specs
      const existingProduct = db.prepare(`
        SELECT * FROM products
        WHERE model_id = ?
          AND LOWER(TRIM(COALESCE(ram, ''))) = LOWER(TRIM(?))
          AND LOWER(TRIM(COALESCE(storage, ''))) = LOWER(TRIM(?))
          AND LOWER(TRIM(COALESCE(color, ''))) = LOWER(TRIM(?))
      `).get(model.id, ram, storage, color) as any;

      if (existingProduct) {
        db.prepare(`
          UPDATE products
          SET purchase_price = COALESCE(NULLIF(?, 0), purchase_price),
              selling_price = COALESCE(NULLIF(?, 0), selling_price),
              mrp = COALESCE(NULLIF(?, 0), mrp),
              category_id = COALESCE(?, category_id),
              subcategory_id = COALESCE(?, subcategory_id),
              brand_id = COALESCE(?, brand_id)
          WHERE id = ?
        `).run(pPrice, sPrice, mrp, catId ?? null, subcatId ?? null, brand.id, existingProduct.id);
        productsUpdated++;
      } else {
        const prodId = uid("p");
        const defaultHsn = isTracked ? "85171300" : "85177900";
        const hsn = r.hsn?.trim() || defaultHsn;
        const barcode = r.barcode?.trim() || null;
        const initialQty = (!isTracked && r.openingStock) ? Number(r.openingStock) : 0;

        db.prepare(`
          INSERT INTO products (
            id, business_id, category_id, subcategory_id, brand_id, model_id,
            name, category, brand, model, ram, storage, color,
            purchase_price, selling_price, mrp, gst, tracked, hsn, barcode, qty, reorder_level
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          prodId,
          businessId,
          catId ?? null,
          subcatId ?? null,
          brand.id,
          model.id,
          fullName,
          catName || "Smartphones",
          brandName,
          modelName,
          ram || null,
          storage || null,
          color || null,
          pPrice,
          sPrice,
          mrp,
          gst,
          isTracked ? 1 : 0,
          hsn,
          barcode,
          initialQty,
          5
        );
        productsCreated++;
      }
    }

    db.exec("COMMIT;");
    return {
      success: true,
      totalRows: rows.length,
      categoriesCreated,
      subcategoriesCreated,
      brandsCreated,
      modelsCreated,
      productsCreated,
      productsUpdated,
      errors,
    };
  } catch (err: any) {
    db.exec("ROLLBACK;");
    throw err;
  }
}
