import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  slugFromMaHang,
  type ParsedCatalogStockImport,
} from "@/lib/catalogStockImport";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

const PAGE = 1000;

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
};

type BySlugEntry = {
  id: string;
  name: string;
  unit: string | null;
  barcode: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  price: number;
  parent_sku: string | null;
  is_new: boolean;
  is_locked: boolean;
  is_out_stock: boolean;
};

async function fetchAllActiveProducts(): Promise<CatalogProductRowLite[]> {
  const all: CatalogProductRowLite[] = [];
  const selectFull =
    "id, name, slug, unit, barcode, unit_2, barcode_2, price, parent_sku, is_new, is_locked, is_out_stock";
  const selectFallback = "id, name, slug, unit, barcode, price";

  for (let from = 0; ; from += PAGE) {
    const to = from + PAGE - 1;
    const full = await supabase
      .from("products")
      .select(selectFull)
      .eq("is_active", true)
      .order("slug", { ascending: true })
      .range(from, to);

    if (
      full.error &&
      /unit_2|barcode_2|is_new|is_locked|parent_sku|is_out_stock/i.test(
        full.error.message || "",
      )
    ) {
      const fallback = await supabase
        .from("products")
        .select(selectFallback)
        .eq("is_active", true)
        .order("slug", { ascending: true })
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
      const bestByNorm = new Map<string, CatalogProductRowLite>();

      for (const p of data) {
        if (!p.slug) continue;
        const key = normalizeOrderCodeText(p.slug);
        const prev = bestByNorm.get(key);
        bestByNorm.set(key, prev ? preferRicher(prev, p) : p);
      }

      for (const [key, p] of bestByNorm) {
        bySlug.set(key, {
          id: p.id,
          name: p.name,
          unit: p.unit,
          barcode: p.barcode,
          unit_2: p.unit_2 || null,
          barcode_2: p.barcode_2 || null,
          price: Number(p.price) || 0,
          parent_sku: p.parent_sku || null,
          is_new: !!p.is_new,
          is_locked: !!p.is_locked,
          is_out_stock: !!p.is_out_stock,
        });
      }

      return { products: data, bySlug };
    },
    staleTime: 60_000,
  });
}

/** Upsert products in batches — tránh await từng dòng (chậm) */
async function ensureProducts(
  parsed: ParsedCatalogStockImport,
): Promise<{ created: number; updated: number; slugToId: Map<string, string> }> {
  const slugToId = new Map<string, string>();
  let created = 0;
  let updated = 0;

  const validLines = parsed.lines.filter((l) => !l.errorNote);
  const slugs = [...new Set(validLines.map((l) => l.productSlug).filter(Boolean))];

  // Load existing in chunks of 200 (.in limit)
  for (let i = 0; i < slugs.length; i += 200) {
    const slice = slugs.slice(i, i + 200);
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
    parentSku: string | null;
  }[] = [];
  const toCreateMap = new Map<
    string,
    {
      slug: string;
      name: string;
      unit: string;
      barcode: string | null;
      parentSku: string;
    }
  >();

  for (const line of validLines) {
    const key = normalizeOrderCodeText(line.productSlug);
    const existingId = slugToId.get(key);
    if (existingId) {
      if (parsed.mode === "catalogFast") {
        toUpdate.push({
          id: existingId,
          name: line.tenHang,
          unit: line.dvt || "cái",
          // Không ghi đè barcode bằng rỗng — tránh mất MV đã có
          barcode: line.maVach ? line.maVach : null,
          parentSku: line.parentSku || null,
        });
      } else if (parsed.mode === "stockQ7" && line.maVach) {
        toUpdate.push({
          id: existingId,
          name: line.tenHang || "",
          unit: line.dvt || "cái",
          barcode: line.maVach,
          parentSku: null,
        });
      }
      continue;
    }
    if (!toCreateMap.has(key)) {
      toCreateMap.set(key, {
        slug: line.productSlug || slugFromMaHang(line.maHang, line.tenHang),
        name: line.tenHang || line.maHang,
        unit: line.dvt || "cái",
        barcode: line.maVach || null,
        parentSku: line.parentSku,
      });
    }
  }

  // Parallel updates in chunks — GIỮ is_new / is_locked / is_out_stock (rule GAS)
  for (let i = 0; i < toUpdate.length; i += 40) {
    const slice = toUpdate.slice(i, i + 40);
    await Promise.all(
      slice.map((u) => {
        const patch: Record<string, unknown> = {};
        if (u.name) patch.name = u.name;
        if (u.unit) patch.unit = u.unit;
        if (u.barcode) patch.barcode = u.barcode;
        if (u.parentSku) patch.parent_sku = u.parentSku;
        if (!Object.keys(patch).length) return Promise.resolve();
        return supabase
          .from("products")
          .update(patch as never)
          .eq("id", u.id);
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
      price: 0,
      is_active: true,
      unit: c.unit,
      barcode: c.barcode,
      is_new: true,
      stock_quantity: 0,
      parent_sku: c.parentSku || null,
      description: c.parentSku
        ? `Import danh mục (Parent: ${c.parentSku})`
        : "Import danh mục từ Excel (GAS catalogFast)",
    }));

    const { data, error } = await supabase
      .from("products")
      .insert(payload as never)
      .select("id, slug");

    if (error) {
      for (const c of slice) {
        const slug = c.slug;
        const { data: one, error: oneErr } = await supabase
          .from("products")
          .insert({
            name: c.name,
            slug,
            price: 0,
            is_active: true,
            unit: c.unit,
            barcode: c.barcode,
            is_new: true,
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
): Promise<{ upserted: number }> {
  const byProduct = new Map<string, number>();

  for (const line of parsed.lines) {
    if (line.errorNote || line.tonKho == null || line.tonKho < 0) continue;
    const pid = slugToId.get(normalizeOrderCodeText(line.productSlug));
    if (!pid) continue;
    // Gộp nếu trùng mã
    byProduct.set(pid, Math.round(line.tonKho));
  }

  const rows = [...byProduct.entries()].map(([product_id, quantity]) => ({
    warehouse_id: warehouseId,
    product_id,
    quantity: Math.max(0, Math.round(quantity)),
  }));

  if (!rows.length) {
    throw new Error("Không có dòng tồn hợp lệ để ghi stock_on_hand.");
  }

  let upserted = 0;
  for (let i = 0; i < rows.length; i += 250) {
    const slice = rows.slice(i, i + 250);
    const { error } = await supabase
      .from("stock_on_hand" as never)
      .upsert(slice as never, { onConflict: "warehouse_id,product_id" });
    if (error) throw new Error(`Ghi tồn kho thất bại: ${error.message}`);
    upserted += slice.length;
  }

  // Đồng bộ products.stock_quantity chỉ khi kho Q7 — batch song song lớn hơn
  const { data: wh } = await supabase
    .from("warehouses" as never)
    .select("code")
    .eq("id", warehouseId)
    .maybeSingle();

  if ((wh as { code: string } | null)?.code === "Q7") {
    for (let i = 0; i < rows.length; i += 80) {
      const slice = rows.slice(i, i + 80);
      await Promise.all(
        slice.map((r) =>
          supabase
            .from("products")
            .update({ stock_quantity: r.quantity } as never)
            .eq("id", r.product_id),
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
    }): Promise<CatalogStockImportResult> => {
      const { parsed, warehouseId } = input;
      if (!parsed.validCount) {
        throw new Error("Không có dòng hợp lệ để import.");
      }

      const { created, updated, slugToId } = await ensureProducts(parsed);

      let stockUpserted = 0;
      if (parsed.mode === "stockQ7") {
        if (!warehouseId) throw new Error("Chưa chọn kho để ghi tồn.");
        const stock = await upsertStockOnHand(parsed, warehouseId, slugToId);
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
        queryClient.invalidateQueries({ queryKey: ["import-catalog-stock"] }),
        queryClient.invalidateQueries({ queryKey: ["stock-on-hand"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] }),
      ]);
    },
  });
}
