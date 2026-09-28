import type { DatabaseSync } from "node:sqlite";

export const MOBILE_PHONE_PRODUCT_MASTER = {
  catalog_name: "Mobile Phone Product Master",
  country: "India",
  version: "1.0",
  category: "Mobile",
  subcategory: "Smartphone",
  brands: [
    {
      brand: "Apple",
      models: [
        {
          model: "iPhone 17 Pro Max",
          variants: ["12GB/256GB", "12GB/512GB", "12GB/1TB"]
        },
        {
          model: "iPhone 17 Pro",
          variants: ["12GB/256GB", "12GB/512GB"]
        },
        {
          model: "iPhone 17",
          variants: ["8GB/256GB"]
        },
        {
          model: "iPhone Air",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "Samsung",
      models: [
        {
          model: "Galaxy S26 Ultra",
          variants: ["12GB/256GB", "12GB/512GB", "16GB/1TB"]
        },
        {
          model: "Galaxy S26+",
          variants: ["12GB/256GB"]
        },
        {
          model: "Galaxy S26",
          variants: ["12GB/256GB"]
        },
        {
          model: "Galaxy S26 FE",
          variants: ["8GB/256GB"]
        },
        {
          model: "Galaxy A27 5G",
          variants: ["8GB/128GB", "8GB/256GB"]
        },
        {
          model: "Galaxy M47 5G",
          variants: ["8GB/128GB", "8GB/256GB"]
        },
        {
          model: "Galaxy F70 Pro 5G",
          variants: ["8GB/128GB", "8GB/256GB"]
        }
      ]
    },
    {
      brand: "vivo",
      models: [
        {
          model: "X300 Ultra",
          variants: ["16GB/512GB"]
        },
        {
          model: "X300 Pro",
          variants: ["16GB/512GB"]
        },
        {
          model: "V80 5G",
          variants: ["8GB/128GB", "12GB/256GB"]
        },
        {
          model: "V80 Lite 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "S2 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "T5 Pro",
          variants: ["12GB/256GB"]
        },
        {
          model: "T5 Lite 5G",
          variants: ["6GB/128GB"]
        },
        {
          model: "Y500",
          variants: ["8GB/128GB"]
        }
      ]
    },
    {
      brand: "OPPO",
      models: [
        {
          model: "Find X9 Pro",
          variants: ["16GB/512GB"]
        },
        {
          model: "Find X9 Ultra",
          variants: ["16GB/512GB"]
        },
        {
          model: "Reno16 Pro 5G",
          variants: ["12GB/256GB"]
        },
        {
          model: "Reno16 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "K15 Pro",
          variants: ["12GB/256GB"]
        },
        {
          model: "K15 5G",
          variants: ["8GB/128GB"]
        },
        {
          model: "F35 Pro 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "F35 5G",
          variants: ["8GB/128GB"]
        }
      ]
    },
    {
      brand: "realme",
      models: [
        {
          model: "16 Pro",
          variants: ["12GB/256GB"]
        },
        {
          model: "16T 5G",
          variants: ["8GB/128GB"]
        },
        {
          model: "16",
          variants: ["8GB/128GB"]
        },
        {
          model: "P4s 5G",
          variants: ["8GB/128GB", "12GB/256GB"]
        },
        {
          model: "P4R 5G",
          variants: ["8GB/128GB"]
        },
        {
          model: "C83 5G",
          variants: ["6GB/128GB"]
        }
      ]
    },
    {
      brand: "Xiaomi",
      models: [
        {
          model: "17 Ultra",
          variants: ["16GB/512GB"]
        },
        {
          model: "17T",
          variants: ["12GB/256GB", "12GB/512GB"]
        },
        {
          model: "Redmi Note 17 Pro Max",
          variants: ["12GB/256GB"]
        },
        {
          model: "Redmi Note 17 Pro 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "Redmi Note 17 5G",
          variants: ["8GB/128GB"]
        },
        {
          model: "Redmi 17 5G",
          variants: ["6GB/128GB"]
        },
        {
          model: "Redmi Turbo 5",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "OnePlus",
      models: [
        {
          model: "15R",
          variants: ["16GB/512GB"]
        },
        {
          model: "Nord 6",
          variants: ["12GB/256GB", "12GB/512GB"]
        },
        {
          model: "Nord CE 6 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "N6 5G",
          variants: ["8GB/128GB"]
        }
      ]
    },
    {
      brand: "POCO",
      models: [
        {
          model: "X8 Power 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "X8 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "M8x 5G",
          variants: ["6GB/128GB"]
        },
        {
          model: "F9 Pro 5G",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "iQOO",
      models: [
        {
          model: "15R",
          variants: ["12GB/256GB"]
        },
        {
          model: "Z11 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "Z11 Lite 5G",
          variants: ["6GB/128GB"]
        },
        {
          model: "Z11x",
          variants: ["8GB/128GB"]
        }
      ]
    },
    {
      brand: "Motorola",
      models: [
        {
          model: "Signature",
          variants: ["16GB/512GB", "16GB/1TB"]
        },
        {
          model: "Edge 70 Max",
          variants: ["12GB/256GB", "12GB/512GB"]
        },
        {
          model: "Edge 70 Fusion",
          variants: ["12GB/512GB"]
        },
        {
          model: "Edge 70 Pro 5G",
          variants: ["12GB/256GB"]
        },
        {
          model: "Moto G87 5G",
          variants: ["8GB/256GB"]
        }
      ]
    },
    {
      brand: "Nothing",
      models: [
        {
          model: "Phone 4b",
          variants: ["8GB/128GB"]
        },
        {
          model: "Phone 4a Pro",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "Infinix",
      models: [
        {
          model: "Hot 70 Pro 5G",
          variants: ["8GB/256GB"]
        },
        {
          model: "GT 50 Pro",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "Tecno",
      models: [
        {
          model: "Spark Go 3 Pro 4G",
          variants: ["4GB/128GB"]
        }
      ]
    },
    {
      brand: "Lava",
      models: [
        {
          model: "Shark 2 Pro 5G",
          variants: ["6GB/128GB"]
        }
      ]
    },
    {
      brand: "Honor",
      models: [
        {
          model: "X9e Pro 5G",
          variants: ["8GB/256GB"]
        }
      ]
    },
    {
      brand: "Google",
      models: [
        {
          model: "Pixel 11",
          variants: ["12GB/256GB"]
        }
      ]
    },
    {
      brand: "Nokia/HMD",
      models: [
        {
          model: "HMD Pulse",
          variants: ["6GB/128GB"]
        }
      ]
    },
    {
      brand: "Itel",
      models: [
        {
          model: "Zeno F30 5G",
          variants: ["4GB/128GB"]
        }
      ]
    }
  ]
};

function estimatePricing(brand: string, model: string, variant: string): { mrp: number; sellingPrice: number; purchasePrice: number } {
  const mLower = model.toLowerCase();
  const bLower = brand.toLowerCase();
  const is1TB = variant.includes("1TB");
  const is512 = variant.includes("512GB");
  const is256 = variant.includes("256GB");

  let basePrice = 25000;

  if (bLower === "apple") {
    if (mLower.includes("pro max")) basePrice = 159900;
    else if (mLower.includes("pro")) basePrice = 134900;
    else if (mLower.includes("air")) basePrice = 99900;
    else basePrice = 79900;
  } else if (bLower === "samsung") {
    if (mLower.includes("ultra")) basePrice = 134999;
    else if (mLower.includes("+")) basePrice = 99999;
    else if (mLower.includes("s26")) basePrice = 79999;
    else if (mLower.includes("fe")) basePrice = 54999;
    else if (mLower.includes("a27")) basePrice = 26999;
    else if (mLower.includes("m47") || mLower.includes("f70")) basePrice = 19999;
  } else if (bLower === "google") {
    basePrice = 79999;
  } else if (mLower.includes("ultra")) {
    basePrice = 89999;
  } else if (mLower.includes("pro max")) {
    basePrice = 32999;
  } else if (mLower.includes("pro")) {
    basePrice = 28999;
    if (bLower === "vivo" || bLower === "oppo" || bLower === "xiaomi") basePrice = 39999;
  } else if (mLower.includes("lite") || mLower.includes("go") || bLower === "itel" || bLower === "tecno") {
    basePrice = 9999;
  } else if (bLower === "lava" || bLower === "nokia/hmd") {
    basePrice = 11999;
  } else if (mLower.includes("fusion") || mLower.includes("signature")) {
    basePrice = 45999;
  } else if (mLower.includes("turbo") || mLower.includes("gt")) {
    basePrice = 27999;
  } else if (mLower.includes("nord") || mLower.includes("15r") || mLower.includes("16t")) {
    basePrice = 29999;
  } else {
    basePrice = 18999;
  }

  if (is1TB) basePrice += 30000;
  else if (is512) basePrice += 12000;
  else if (is256 && !mLower.includes("ultra") && !mLower.includes("pro max") && bLower !== "apple") basePrice += 2000;

  const mrp = Math.round(basePrice * 1.15 / 100) * 100 - 1;
  const sellingPrice = Math.round(basePrice / 100) * 100;
  const purchasePrice = Math.round((sellingPrice * 0.86) / 100) * 100;

  return { mrp, sellingPrice, purchasePrice };
}

export function seedMobileProductMaster(db: DatabaseSync): void {
  const bId = "biz_default";
  const now = new Date().toISOString();

  // 1. Ensure Category exists
  let cat = db.prepare("SELECT id, name FROM categories WHERE name = 'Mobile' OR name = 'Mobile Phones' LIMIT 1").get() as any;
  if (!cat) {
    const catId = "cat_mobile";
    db.prepare(`
      INSERT INTO categories (id, business_id, name, slug, icon, active, created_at)
      VALUES (?, ?, 'Mobile', 'mobile', '📱', 1, ?)
    `).run(catId, bId, now);
    cat = { id: catId, name: "Mobile" };
  }

  // 2. Ensure Subcategory "Smartphone" exists
  let sub = db.prepare("SELECT id, name FROM subcategories WHERE category_id = ? AND (name = 'Smartphone' OR name = 'Smartphones' OR name = 'Smart Phone') LIMIT 1").get(cat.id) as any;
  if (!sub) {
    const subId = "sub_smartphone";
    db.prepare(`
      INSERT INTO subcategories (id, business_id, category_id, name, slug, active, created_at)
      VALUES (?, ?, ?, 'Smartphone', 'smartphone', 1, ?)
    `).run(subId, bId, cat.id, now);
    sub = { id: subId, name: "Smartphone" };
  }

  const insertBrandStmt = db.prepare(`
    INSERT INTO brands (id, business_id, subcategory_id, name, slug, active, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
  `);

  const updateBrandSubcatStmt = db.prepare(`
    UPDATE brands SET subcategory_id = ? WHERE id = ?
  `);

  const insertModelStmt = db.prepare(`
    INSERT INTO models (id, business_id, brand_id, name, active, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  const insertProductStmt = db.prepare(`
    INSERT INTO products (
      id, business_id, name, brand, model, variant, ram, storage, color,
      category, category_id, subcategory_id, brand_id, model_id, tracked,
      sku, barcode, hsn, mrp, purchase_price, selling_price, minimum_selling_price,
      minimum_stock, gst, warranty_months, qty
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const updateProductStmt = db.prepare(`
    UPDATE products SET
      brand_id = ?, model_id = ?, category_id = ?, subcategory_id = ?,
      ram = ?, storage = ?, variant = ?, mrp = ?, purchase_price = ?, selling_price = ?
    WHERE id = ?
  `);

  for (const b of MOBILE_PHONE_PRODUCT_MASTER.brands) {
    const slug = b.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    let brandRecord = db.prepare("SELECT id, name FROM brands WHERE LOWER(name) = LOWER(?)").get(b.brand) as any;

    if (!brandRecord) {
      const brandId = `brd_${slug}_${Math.random().toString(36).substring(2, 7)}`;
      insertBrandStmt.run(brandId, bId, sub.id, b.brand, slug, now);
      brandRecord = { id: brandId, name: b.brand };
    } else {
      updateBrandSubcatStmt.run(sub.id, brandRecord.id);
    }

    for (const m of b.models) {
      let modelRecord = db.prepare("SELECT id, name FROM models WHERE brand_id = ? AND LOWER(name) = LOWER(?)").get(brandRecord.id, m.model) as any;

      if (!modelRecord) {
        const modelId = `mod_${Math.random().toString(36).substring(2, 10)}`;
        insertModelStmt.run(modelId, bId, brandRecord.id, m.model, now);
        modelRecord = { id: modelId, name: m.model };
      }

      for (const v of m.variants) {
        const parts = v.split("/");
        const ram = parts[0]?.trim() || "8GB";
        const storage = parts[1]?.trim() || "128GB";
        const productName = `${b.brand} ${m.model} ${v}`;

        const { mrp, sellingPrice, purchasePrice } = estimatePricing(b.brand, m.model, v);

        let prod = db.prepare(`
          SELECT id FROM products
          WHERE brand = ? AND model = ? AND (variant = ? OR name = ?)
        `).get(b.brand, m.model, v, productName) as any;

        if (!prod) {
          prod = db.prepare("SELECT id FROM products WHERE name = ?").get(productName) as any;
        }

        if (prod) {
          updateProductStmt.run(
            brandRecord.id,
            modelRecord.id,
            cat.id,
            sub.id,
            ram,
            storage,
            v,
            mrp,
            purchasePrice,
            sellingPrice,
            prod.id
          );
        } else {
          const prodId = `prod_${Math.random().toString(36).substring(2, 11)}`;
          const sku = `${slug.toUpperCase()}-${m.model.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()}-${ram}${storage}`;
          const barcode = Math.floor(100000000000 + Math.random() * 900000000000).toString();

          insertProductStmt.run(
            prodId,
            bId,
            productName,
            b.brand,
            m.model,
            v,
            ram,
            storage,
            "Standard",
            cat.name,
            cat.id,
            sub.id,
            brandRecord.id,
            modelRecord.id,
            1,
            sku,
            barcode,
            "85171300",
            mrp,
            purchasePrice,
            sellingPrice,
            sellingPrice,
            2,
            18,
            12,
            0
          );
        }
      }
    }
  }
}
