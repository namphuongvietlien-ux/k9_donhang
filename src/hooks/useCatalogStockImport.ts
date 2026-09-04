import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  slugFromMaHang,
  type CatalogStockLine,
  type ParsedCatalogStockImport,
} from "@/lib/catalogStockImport";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import {
  displayStockUnit,
  normalizeUnitKey,
  toStockUnitKey,
} from "@/lib/stockKeys";

const PAGE = 1000;

const EXTRA_PRODUCT_COLUMNS = [
  "price_2",
  "unit_2_ratio",
  "unit_2",
  "barcode_2",
  "parent_sku",
  "is_new",
] as const;

function isSchemaColumnError(message?: string | null) {
  return /schema cache|Could not find the|column .* does not exist|PGRST204/i.test(
    message || "",
  );
}

function omitProductExtras(row: Record<string, unknown>) {
  const next = { ...row };
  for (const key of EXTRA_PRODUCT_COLUMNS) delete next[key];
  return next;
}

export type CatalogProductRowLite = {
  id: string;
  name: string;
  slug: string | null;
  unit: string | null;
  barcode: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  price: number | null;
  parent_sku?: string | null;
  is_new?: boolean;
  is_locked?: boolean;
  is_out_stock?: boolean;
  category_group?: string | null;
};

type BySlugEntry = {
  id: string;
  name: string;
  unit: string | null;
  slug?: string | null;
  barcode: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  price: number;
  parent_sku: string | null;
  is_new: boolean;
  is_locked: boolean;
  is_out_stock: boolean;
  category_group?: string | null;
};

async function fetchAllActiveProducts(): Promise<CatalogProductRowLite[]> {
  const all: CatalogProductRowLite[] = [];
  const selectFull =
    "id, name, slug, unit, barcode, unit_2, barcode_2, price, parent_sku, is_new, is_locked, is_out_stock, category_group";
  const selectFallback = "id, name, slug, unit, barcode, price";

  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const full = await supabase
      .from("products")
      .select(selectFull)
      .eq("is_active", true)
      // Khóa phụ duy nhất — tránh lệch trang khi slug rỗng/trùng
      .order("slug", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to);

    if (
      full.error &&
      /unit_2|barcode_2|is_new|is_locked|parent_sku|is_out_stock|category_group/i.test(
        full.error.message || "",
      )
    ) {
      const fallback = await supabase
        .from("products")
        .select(selectFallback)
        .eq("is_active", true)
        .order("slug", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to);
      if (fallback.error) throw fallback.error;
      const chunk = (fallback.data as CatalogProductRowLite[] | null) || [];
      all.push(...chunk);
      if (chunk.length < PAGE) break;
      continue;
    }

    if (full.error) throw full.error;
    const chunk = (full.data as CatalogProductRowLite[] | null) || [];
    all.push(...chunk);
    if (chunk.length < PAGE) break;
  }

  return all;
}

function preferRicher(a: CatalogProductRowLite, b: CatalogProductRowLite) {
  const score = (p: CatalogProductRowLite) =>
    (p.barcode ? 4 : 0) +
    (p.barcode_2 ? 2 : 0) +
    (p.parent_sku ? 1 : 0) +
    (/[A-Z]/.test(p.slug || "") ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

export function useCatalogForImport() {
  return useQuery({
    queryKey: ["catalog-for-stock-import"],
    queryFn: async () => {
      const data = await fetchAllActiveProducts();

      const bySlug = new Map<string, BySlugEntry>();
      const byBarcode = new Map<string, BySlugEntry>();
      const bestByNorm = new Map<string, CatalogProductRowLite>();

      for (const p of data) {
        if (!p.slug) continue;
        const key = normalizeOrderCodeText(p.slug);
        const prev = bestByNorm.get(key);
        bestByNorm.set(key, prev ? preferRicher(prev, p) : p);
      }

      for (const [key, p] of bestByNorm) {
        const entry: BySlugEntry = {
          id: p.id,
          name: p.name,
          unit: p.unit,
          slug: p.slug,
          barcode: p.barcode,
          unit_2: p.unit_2 || null,
          barcode_2: p.barcode_2 || null,
          price: Number(p.price) || 0,
          parent_sku: p.parent_sku || null,
          is_new: !!p.is_new,
          is_locked: !!p.is_locked,
          is_out_stock: !!p.is_out_stock,
          category_group: p.category_group || null,
        };
        bySlug.set(key, entry);
        for (const code of [p.barcode, p.barcode_2]) {
          const bk = normalizeOrderCodeText(code || "");
          if (bk && !byBarcode.has(bk)) byBarcode.set(bk, entry);
        }
      }

      return { products: data, bySlug, byBarcode };
    },
    staleTime: 1000 * 60 * 5,
  });
}

/** Dòng đã gộp ĐVT cơ sở + ĐVT quy đổi của cùng một mã hàng. */
type MergedCatalogLine = CatalogStockLine & {
  unit2?: string | null;
  barcode2?: string | null;
  price2?: number | null;
  unit2Ratio?: number | null;
};

/**
 * Gộp các dòng cùng mã hàng: dòng KHÔNG có tỷ lệ quy đổi là ĐVT cơ sở,
 * dòng CÓ tỷ lệ là ĐVT phụ (unit_2 + barcode_2 + price_2 + unit_2_ratio).
 */
export function mergeConversionLines(lines: CatalogStockLine[]): MergedCatalogLine[] {
  const groups = new Map<string, CatalogStockLine[]>();
  const order: string[] = [];
  for (const line of lines) {
    const key = normalizeOrderCodeText(line.productSlug || line.maHang);
    if (!key) continue;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(line);
  }

  return order.map((key) => {
    const group = groups.get(key)!;
    const base = group.find((l) => l.tyLeQuyDoi == null) || group[0];
    const merged: MergedCatalogLine = { ...base };

    if (merged.tonKho == null) {
      const withStock = group.find((l) => l.tonKho != null);
      if (withStock) merged.tonKho = withStock.tonKho;
    }

    const conversion = group.find((l) => l !== base && l.tyLeQuyDoi != null);
    if (conversion) {
      merged.unit2 = conversion.dvt || null;
      merged.barcode2 = conversion.maVach || null;
      merged.price2 = conversion.price ?? null;
      merged.unit2Ratio = conversion.tyLeQuyDoi ?? null;
    } else if (base.tyLeQuyDoi != null) {
      // File chỉ có dòng quy đổi — giữ làm ĐVT chính, vẫn lưu tỷ lệ.
      merged.unit2Ratio = base.tyLeQuyDoi;
    }
    return merged;
  });
}

/** Upsert products in batches — tránh await từng dòng (chậm) */
async function ensureProducts(
  parsed: ParsedCatalogStockImport,
  options?: { newProductSelection?: Record<string, boolean> },
): Promise<{ created: number; updated: number; slugToId: Map<string, string> }> {
  const slugToId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  const rawValidLines = parsed.lines.filter((l) => !l.errorNote);
  /**
   * KiotViet xuất 1 mã hàng thành 2 dòng: dòng gốc (ĐVT cơ sở) + dòng quy đổi
   * (ĐVT lớn, có Tỷ lệ quy đổi). Không gộp thì dòng sau ghi đè dòng trước và
   * products.unit thành "Lọ"/"Hộp", mất luôn ĐVT cơ sở.
   */
  const validLines = mergeConversionLines(rawValidLines);
  const requestedCodes = [...new Set(validLines.map((l) => (l.productSlug || "").trim()).filter(Boolean))];

  // Load existing in chunks of 200 (.in limit)
  for (let i = 0; i < requestedCodes.length; i += 200) {
    const slice = requestedCodes.slice(i, i + 200);
    const { data: existing } = await supabase
      .from("products")
      .select("id, slug")
      .in("slug", slice);
    for (const p of (existing as { id: string; slug: string }[] | null) || []) {
      slugToId.set(normalizeOrderCodeText(p.slug), p.id);
    }
  }

  const toUpdate: {
    id: string;
    name: string;
    unit: string;
    barcode: string | null;
    price: number | null;
    parentSku: string | null;
    /** stockQ7: không ghi đè products.unit */
    skipUnitPatch?: boolean;
    /** ĐVT trên dòng file (để gắn barcode / unit_2) */
    lineDvt?: string;
    /** ĐVT quy đổi từ dòng thứ 2 của cùng mã hàng */
    unit2?: string | null;
    barcode2?: string | null;
    price2?: number | null;
    unit2Ratio?: number | null;
  }[] = [];
  const toCreateMap = new Map<
    string,
    {
      slug: string;
      name: string;
      unit: string;
      barcode: string | null;
      price: number | null;
      parentSku: string;
      isNew: boolean;
      unit2?: string | null;
      barcode2?: string | null;
      price2?: number | null;
      unit2Ratio?: number | null;
    }
  >();

  const newProductSelection = options?.newProductSelection || {};

  for (const line of validLines) {
    const rawCode = String(line.productSlug || "").trim();
    const key = normalizeOrderCodeText(rawCode);
    const existingId = slugToId.get(key) || slugToId.get(rawCode);
    if (existingId) {
      if (parsed.mode === "catalogFast") {
        toUpdate.push({
          id: existingId,
          name: line.tenHang,
          unit: line.dvt || "cái",
          barcode: line.maVach ? line.maVach : null,
          price: line.price ?? null,
          parentSku: line.parentSku || null,
          unit2: line.unit2 ?? null,
          barcode2: line.barcode2 ?? null,
          price2: line.price2 ?? null,
          unit2Ratio: line.unit2Ratio ?? null,
        });
      } else if (parsed.mode === "stockQ7") {
        if (parsed.layout === "misaSummary") continue;
        if (line.maVach || line.tenHang) {
          toUpdate.push({
            id: existingId,
            name: line.tenHang || "",
            unit: line.dvt || "cái",
            barcode: line.maVach || null,
            price: line.price ?? null,
            parentSku: null,
            skipUnitPatch: true,
            lineDvt: line.dvt || "",
          });
        }
      }
      continue;
    }
    if (!toCreateMap.has(key)) {
      const createSlug = rawCode || slugFromMaHang(line.maHang, line.tenHang);
      const normalizedKey = normalizeOrderCodeText(rawCode);
      const isNew = !!newProductSelection[normalizedKey] || !!newProductSelection[key] || !!newProductSelection[rawCode];
      toCreateMap.set(key, {
        slug: createSlug,
        name: line.tenHang || line.maHang,
        unit: line.dvt || "cái",
        barcode: line.maVach || null,
        price: line.price ?? null,
        parentSku: line.parentSku,
        isNew,
        unit2: line.unit2 ?? null,
        barcode2: line.barcode2 ?? null,
        price2: line.price2 ?? null,
        unit2Ratio: line.unit2Ratio ?? null,
      });
    }
  }

  // Parallel updates in chunks — GIỮ is_new / is_locked / is_out_stock (rule GAS)
  for (let i = 0; i < toUpdate.length; i += 40) {
    const slice = toUpdate.slice(i, i + 40);
    await Promise.all(
      slice.map(async (u) => {
        const patch: Record<string, unknown> = {};
        if (u.name) patch.name = u.name;
        if (u.unit && !u.skipUnitPatch) patch.unit = u.unit;
        if (u.parentSku) patch.parent_sku = u.parentSku;
        if (u.price != null) patch.price = u.price;
        // ĐVT quy đổi: chỉ ghi khi file có dòng quy đổi, không xóa dữ liệu cũ.
        if (u.unit2) patch.unit_2 = u.unit2;
        if (u.barcode2) patch.barcode_2 = u.barcode2;
        if (u.price2 != null) patch.price_2 = u.price2;
        if (u.unit2Ratio != null) patch.unit_2_ratio = u.unit2Ratio;

        if (u.barcode) {
          const { data: prod } = await supabase
            .from("products")
            .select("unit, unit_2, barcode, barcode_2")
            .eq("id", u.id)
            .maybeSingle();
          const p = prod as {
            unit: string | null;
            unit_2: string | null;
            barcode: string | null;
            barcode_2: string | null;
          } | null;
          const lineUnit = normalizeUnitKey(u.lineDvt || u.unit);
          const u2 = normalizeUnitKey(p?.unit_2);
          if (lineUnit && u2 && lineUnit === u2) {
            patch.barcode_2 = u.barcode;
          } else if (
            !p?.barcode ||
            !lineUnit ||
            lineUnit === normalizeUnitKey(p.unit)
          ) {
            patch.barcode = u.barcode;
          } else if (!p?.unit_2) {
            patch.unit_2 = displayStockUnit(u.lineDvt || u.unit);
            patch.barcode_2 = u.barcode;
          } else {
            patch.barcode = u.barcode;
          }
        }

        if (!Object.keys(patch).length) return;
        let { error } = await supabase
          .from("products")
          .update(patch as never)
          .eq("id", u.id);
        if (error && isSchemaColumnError(error.message)) {
          const stripped = omitProductExtras(patch);
          if (!Object.keys(stripped).length) return;
          const retry = await supabase
            .from("products")
            .update(stripped as never)
            .eq("id", u.id);
          error = retry.error;
        }
        if (error) {
          throw new Error(`Không cập nhật SP: ${error.message}`);
        }
      }),
    );
    updated += slice.length;
  }

  // Batch insert — mã mới gắn is_new = true
  const toCreate = [...toCreateMap.values()];
  for (let i = 0; i < toCreate.length; i += 100) {
    const slice = toCreate.slice(i, i + 100);
    const payload = slice.map((c) => ({
      name: c.name,
      slug: c.slug,
      price: c.price ?? 0,
      is_active: true,
      unit: c.unit,
      barcode: c.barcode,
      is_new: c.isNew,
      stock_quantity: 0,
      parent_sku: c.parentSku || null,
      unit_2: c.unit2 || null,
      barcode_2: c.barcode2 || null,
      price_2: c.price2 ?? null,
      unit_2_ratio: c.unit2Ratio ?? null,
      description: c.parentSku
        ? `Import danh mục (Parent: ${c.parentSku})`
        : "Import danh mục từ Excel (GAS catalogFast)",
    }));

    let { data, error } = await supabase
      .from("products")
      .insert(payload as never)
      .select("id, slug");

    if (error && isSchemaColumnError(error.message)) {
      const stripped = payload.map((row) => omitProductExtras(row as Record<string, unknown>));
      const retry = await supabase
        .from("products")
        .insert(stripped as never)
        .select("id, slug");
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      for (const c of slice) {
        const slug = c.slug;
        const { data: one, error: oneErr } = await supabase
          .from("products")
          .insert({
            name: c.name,
            slug,
            price: c.price ?? 0,
            is_active: true,
            unit: c.unit,
            barcode: c.barcode,
            stock_quantity: 0,
          } as never)
          .select("id, slug")
          .single();
        if (oneErr) {
          const { data: found } = await supabase
            .from("products")
            .select("id, slug")
            .eq("slug", slug)
            .maybeSingle();
          if (found) {
            const row = found as { id: string; slug: string };
            slugToId.set(normalizeOrderCodeText(row.slug), row.id);
            if (c.barcode) {
              await supabase
                .from("products")
                .update({
                  barcode: c.barcode,
                  name: c.name,
                  unit: c.unit,
                } as never)
                .eq("id", row.id);
            }
          } else {
            throw new Error(`Không tạo SP ${slug}: ${oneErr.message}`);
          }
        } else if (one) {
          const row = one as { id: string; slug: string };
          slugToId.set(normalizeOrderCodeText(row.slug), row.id);
          created++;
        }
      }
    } else {
      for (const row of (data as { id: string; slug: string }[]) || []) {
        slugToId.set(normalizeOrderCodeText(row.slug), row.id);
        created++;
      }
    }
  }

  return { created, updated, slugToId };
}

async function upsertStockOnHand(
  parsed: ParsedCatalogStockImport,
  warehouseId: string,
  slugToId: Map<string, string>,
  warehouseIdByCode?: Map<string, string>,
): Promise<{ upserted: number }> {
  /** Key = warehouse + productId + unit_key */
  const byProductUnit = new Map<
    string,
    {
      warehouse_id: string;
      product_id: string;
      unit: string;
      unit_key: string;
      quantity: number;
    }
  >();
  const replaceQty = parsed.layout === "misaSummary";

  for (const line of parsed.lines) {
    if (line.errorNote || line.tonKho == null || line.tonKho < 0) continue;
    const pid = slugToId.get(normalizeOrderCodeText(line.productSlug));
    if (!pid) continue;
    const whId =
      (line.warehouseCode && warehouseIdByCode?.get(line.warehouseCode)) ||
      warehouseId;
    if (!whId) continue;
    const unit = displayStockUnit(line.dvt);
    const unit_key = toStockUnitKey(unit);
    const mapKey = `${whId}::${pid}::${unit_key}`;
    const prev = byProductUnit.get(mapKey);
    const qty = Math.max(0, Math.round(line.tonKho));
    if (prev) {
      prev.quantity = replaceQty ? qty : Math.max(0, prev.quantity + qty);
    } else {
      byProductUnit.set(mapKey, {
        warehouse_id: whId,
        product_id: pid,
        unit,
        unit_key,
        quantity: qty,
      });
    }
  }

  const rows = [...byProductUnit.values()];

  if (!rows.length) {
    throw new Error("Không có dòng tồn hợp lệ để ghi stock_on_hand.");
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const slice = rows.slice(i, i + 250);
    let { error } = await supabase
      .from("stock_on_hand" as never)
      .upsert(slice as never, {
        onConflict: "warehouse_id,product_id,unit_key",
      });

    // Chưa chạy migration unit_key → fallback unique cũ (mất ĐVT — cảnh báo)
    if (error && /unit_key|no unique|ON CONFLICT/i.test(error.message || "")) {
      const collapsed = new Map<string, (typeof slice)[0]>();
      for (const r of slice) {
        collapsed.set(`${r.warehouse_id}::${r.product_id}`, {
          warehouse_id: r.warehouse_id,
          product_id: r.product_id,
          quantity: r.quantity,
          unit: r.unit,
          unit_key: r.unit_key,
        });
      }
      const legacy = [...collapsed.values()].map((r) => ({
        warehouse_id: r.warehouse_id,
        product_id: r.product_id,
        quantity: r.quantity,
      }));
      const fb = await supabase
        .from("stock_on_hand" as never)
        .upsert(legacy as never, { onConflict: "warehouse_id,product_id" });
      error = fb.error;
      if (!error) {
        console.warn(
          "[stockQ7] DB chưa có unit_key — đã ghi theo mã hàng (thiếu tách ĐVT). Chạy scripts/sql-fix-stock-unit-key.sql",
        );
      }
    }

    if (error) throw new Error(`Ghi tồn kho thất bại: ${error.message}`);
    upserted += slice.length;
  }

  // Đồng bộ products.stock_quantity (Q7): tổng mọi ĐVT của mã (fallback ecommerce)
  const q7Id =
    [...(warehouseIdByCode?.entries() || [])].find(([code]) => code === "Q7")?.[1] ||
    null;
  const { data: wh } = q7Id
    ? { data: { code: "Q7", id: q7Id } }
    : await supabase
        .from("warehouses" as never)
        .select("id, code")
        .eq("id", warehouseId)
        .maybeSingle();

  const q7WarehouseId =
    (wh as { code?: string; id?: string } | null)?.code === "Q7"
      ? (wh as { id: string }).id || warehouseId
      : q7Id;

  if (q7WarehouseId) {
    const sumByProduct = new Map<string, number>();
    for (const r of rows) {
      if (r.warehouse_id !== q7WarehouseId) continue;
      sumByProduct.set(
        r.product_id,
        (sumByProduct.get(r.product_id) || 0) + r.quantity,
      );
    }
    const syncRows = [...sumByProduct.entries()];
    for (let i = 0; i < syncRows.length; i += 80) {
      const slice = syncRows.slice(i, i + 80);
      await Promise.all(
        slice.map(([product_id, quantity]) =>
          supabase
            .from("products")
            .update({ stock_quantity: quantity } as never)
            .eq("id", product_id),
        ),
      );
    }
  }

  return { upserted };
}

export interface CatalogStockImportResult {
  mode: ParsedCatalogStockImport["mode"];
  productsCreated: number;
  productsUpdated: number;
  stockUpserted: number;
}

export function useCommitCatalogStockImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      parsed: ParsedCatalogStockImport;
      warehouseId: string;
      newProductSelection?: Record<string, boolean>;
    }): Promise<CatalogStockImportResult> => {
      const { parsed, warehouseId } = input;
      if (!parsed.validCount) {
        throw new Error("Không có dòng hợp lệ để import.");
      }

      const { created, updated, slugToId } = await ensureProducts(parsed, {
        newProductSelection: input.newProductSelection,
      });

      let stockUpserted = 0;
      if (parsed.mode === "stockQ7") {
        if (!warehouseId && parsed.layout !== "misaSummary") {
          throw new Error("Chưa chọn kho để ghi tồn.");
        }
        const { data: whs, error: whErr } = await supabase
          .from("warehouses" as never)
          .select("id, code");
        if (whErr) throw new Error(`Không tải danh sách kho: ${whErr.message}`);
        const warehouseIdByCode = new Map<string, string>();
        for (const w of (whs as { id: string; code: string }[] | null) || []) {
          if (w.code) warehouseIdByCode.set(w.code, w.id);
        }
        const stock = await upsertStockOnHand(
          parsed,
          warehouseId,
          slugToId,
          warehouseIdByCode,
        );
        stockUpserted = stock.upserted;
      }

      return {
        mode: parsed.mode,
        productsCreated: created,
        productsUpdated: updated,
        stockUpserted,
      };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog-for-stock-import"] }),
        queryClient.invalidateQueries({ queryKey: ["shared-products-list"] }),
        queryClient.invalidateQueries({ queryKey: ["shared-products-list", "sku-groups"] }),
        queryClient.invalidateQueries({ queryKey: ["import-catalog-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
  });
}
