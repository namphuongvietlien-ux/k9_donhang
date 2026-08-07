import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export const NEW_PRODUCTS_DEFAULT_LIMIT = 10;

export interface NewProductCard {
  id: string;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  parentSku: string;
  ngayTao: string;
  ngayMs: number;
  isNew: boolean;
  isAdminPick: boolean;
  reasonLabel: string;
  rank: number;
}

type ProductFlagRow = {
  id: string;
  name: string;
  slug: string | null;
  barcode: string | null;
  unit: string | null;
  parent_sku?: string | null;
  is_new?: boolean;
  is_out_stock?: boolean;
  is_locked?: boolean;
  created_at?: string | null;
};

function toCard(
  p: ProductFlagRow,
  rank: number,
  adminPick: boolean,
): NewProductCard {
  const ms = p.created_at ? Date.parse(p.created_at) : 0;
  return {
    id: p.id,
    maHang: normalizeOrderCodeText(p.slug || ""),
    maVach: p.barcode || "",
    tenHang: p.name,
    dvt: p.unit || "Cái",
    parentSku: normalizeOrderCodeText(p.parent_sku || ""),
    ngayTao: p.created_at
      ? new Date(p.created_at).toLocaleString("vi-VN", {
          hour: "2-digit",
          minute: "2-digit",
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : "",
    ngayMs: Number.isFinite(ms) ? ms : 0,
    isNew: !!p.is_new,
    isAdminPick: adminPick,
    reasonLabel: adminPick ? "ADMIN CHỌN" : "THEO NGÀY TẠO",
    rank,
  };
}

/**
 * Port GAS getNewProductsList:
 * 1) Ưu tiên Admin tick is_new (loại is_out_stock)
 * 2) Thiếu slot → bổ sung theo created_at gần nhất
 */
export function useNewProducts(limit = NEW_PRODUCTS_DEFAULT_LIMIT) {
  const lim = Math.max(1, Math.min(limit, 20));

  return useQuery({
    queryKey: ["new-products-strip", lim],
    staleTime: 30_000,
    queryFn: async (): Promise<NewProductCard[]> => {
      const selectCols =
        "id, name, slug, barcode, unit, parent_sku, is_new, is_out_stock, created_at";

      let adminRows: ProductFlagRow[] = [];
      const adminQ = await supabase
        .from("products")
        .select(selectCols)
        .eq("is_active", true)
        .eq("is_new", true)
        .eq("is_out_stock", false)
        .order("created_at", { ascending: false })
        .limit(lim);

      if (adminQ.error && /parent_sku|is_new|is_out_stock/i.test(adminQ.error.message || "")) {
        const fallback = await supabase
          .from("products")
          .select("id, name, slug, barcode, unit, created_at")
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(lim);
        if (fallback.error) throw fallback.error;
        return ((fallback.data as ProductFlagRow[]) || []).map((p, i) =>
          toCard(p, i + 1, false),
        );
      }
      if (adminQ.error) throw adminQ.error;
      adminRows = (adminQ.data as ProductFlagRow[]) || [];

      const cards = adminRows.map((p, i) => toCard(p, i + 1, true));
      if (cards.length >= lim) return cards.slice(0, lim);

      const excludeIds = new Set(cards.map((c) => c.id));
      const need = lim - cards.length;
      const fillQ = await supabase
        .from("products")
        .select(selectCols)
        .eq("is_active", true)
        .eq("is_out_stock", false)
        .order("created_at", { ascending: false })
        .limit(lim + excludeIds.size + 5);

      if (!fillQ.error) {
        for (const p of (fillQ.data as ProductFlagRow[]) || []) {
          if (excludeIds.has(p.id)) continue;
          if (p.is_new) continue;
          cards.push(toCard(p, cards.length + 1, false));
          if (cards.length >= lim) break;
        }
      } else if (need > 0) {
        // ignore fill errors (thiếu cột) — vẫn trả admin picks
      }

      return cards.map((c, i) => ({ ...c, rank: i + 1 }));
    },
  });
}

export interface CatalogFlagAdminItem {
  id: string;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  parentSku: string;
  isNew: boolean;
  isLocked: boolean;
  isOutStock: boolean;
}

const FLAG_PAGE = 1000;

function foldText(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();
}

function mapFlagRow(p: ProductFlagRow): CatalogFlagAdminItem {
  return {
    id: p.id,
    maHang: normalizeOrderCodeText(p.slug || ""),
    maVach: p.barcode || "",
    tenHang: p.name,
    dvt: p.unit || "",
    parentSku: normalizeOrderCodeText(p.parent_sku || ""),
    isNew: !!p.is_new,
    isLocked: !!p.is_locked,
    isOutStock: !!p.is_out_stock,
  };
}

function matchesFlagQuery(it: CatalogFlagAdminItem, q: string) {
  const raw = q.trim();
  if (!raw) return true;
  const nq = normalizeOrderCodeText(raw);
  const qf = foldText(raw);
  const hay = `${it.maHang} ${it.maVach} ${it.tenHang} ${it.parentSku}`;
  const hayN = normalizeOrderCodeText(`${it.maHang} ${it.maVach} ${it.parentSku}`);
  const hayF = foldText(hay);
  return (
    hay.toLowerCase().includes(raw.toLowerCase()) ||
    (!!nq && hayN.includes(nq)) ||
    (!!qf && hayF.includes(qf))
  );
}

/** Tải toàn bộ SP active (phân trang 1000 — tránh mất kết quả tìm kiếm). */
async function fetchCatalogFlagRows(query: string, _limit = 8000) {
  const selectFull =
    "id, name, slug, barcode, unit, parent_sku, is_new, is_locked, is_out_stock";
  const selectFallback = "id, name, slug, barcode, unit";
  const raw: ProductFlagRow[] = [];
  let useFallback = false;

  for (let from = 0; ; from += FLAG_PAGE) {
    const to = from + FLAG_PAGE - 1;
    if (!useFallback) {
      const full = await supabase
        .from("products")
        .select(selectFull)
        .eq("is_active", true)
        .order("slug", { ascending: true })
        .range(from, to);

      if (
        full.error &&
        /parent_sku|is_new|is_locked|is_out_stock/i.test(full.error.message || "")
      ) {
        useFallback = true;
      } else if (full.error) {
        throw full.error;
      } else {
        const chunk = (full.data as ProductFlagRow[]) || [];
        raw.push(...chunk);
        if (chunk.length < FLAG_PAGE) break;
        continue;
      }
    }

    const fb = await supabase
      .from("products")
      .select(selectFallback)
      .eq("is_active", true)
      .order("slug", { ascending: true })
      .range(from, to);
    if (fb.error) throw fb.error;
    const chunk = (fb.data as ProductFlagRow[]) || [];
    raw.push(...chunk);
    if (chunk.length < FLAG_PAGE) break;
  }

  let items = raw.map(mapFlagRow);
  const q = query.trim();
  if (q) items = items.filter((it) => matchesFlagQuery(it, q));
  return items;
}

/** Lọc client-side (accent-insensitive) — dùng chung FlagManager / OutStock. */
export function filterCatalogFlagItems(
  rows: CatalogFlagAdminItem[],
  query: string,
) {
  const q = query.trim();
  if (!q) return rows;
  return rows.filter((it) => matchesFlagQuery(it, q));
}

export function useCatalogFlagAdminList(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["catalog-flag-admin", query],
    enabled,
    staleTime: 15_000,
    queryFn: () => fetchCatalogFlagRows(query),
  });
}

export function useSaveCatalogFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      flags: {
        id: string;
        isNew?: boolean;
        isLocked?: boolean;
        isOutStock?: boolean;
      }[];
    }) => {
      let changed = 0;
      for (let i = 0; i < input.flags.length; i += 40) {
        const slice = input.flags.slice(i, i + 40);
        await Promise.all(
          slice.map(async (f) => {
            const patch: Record<string, unknown> = {};
            if (typeof f.isNew === "boolean") patch.is_new = f.isNew;
            if (typeof f.isLocked === "boolean") patch.is_locked = f.isLocked;
            if (typeof f.isOutStock === "boolean") {
              patch.is_out_stock = f.isOutStock;
              // GAS: hết hàng → gỡ IsNew
              if (f.isOutStock) patch.is_new = false;
            }
            if (!Object.keys(patch).length) return;
            const { error } = await supabase
              .from("products")
              .update(patch as never)
              .eq("id", f.id);
            if (error) throw error;
            changed++;
          }),
        );
      }
      return { changed };
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["catalog-flag-admin"] }),
        qc.invalidateQueries({ queryKey: ["new-products-strip"] }),
        qc.invalidateQueries({ queryKey: ["packing-summary-meta"] }),
      ]);
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["catalog-for-stock-import"] });
      }, 0);
    },
  });
}

export interface VariantGroup {
  parentSku: string;
  sampleName: string;
  childCount: number;
  children: CatalogFlagAdminItem[];
}

export function useVariantGroups(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["variant-groups", query],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<VariantGroup[]> => {
      const items = await fetchCatalogFlagRows(query, 8000);
      const byParent = new Map<string, CatalogFlagAdminItem[]>();
      for (const it of items) {
        const parent = normalizeOrderCodeText(it.parentSku || it.maHang);
        if (!parent) continue;
        // Chỉ nhóm khi có parent_sku thật, hoặc slug có dạng PARENT-xx
        const hasParentCol = !!normalizeOrderCodeText(it.parentSku);
        const looksChild =
          hasParentCol ||
          (it.maHang.includes("-") &&
            normalizeOrderCodeText(it.parentSku || "") !== "");
        if (!hasParentCol && !looksChild) continue;
        const key = hasParentCol
          ? normalizeOrderCodeText(it.parentSku)
          : parent;
        if (!key) continue;
        const list = byParent.get(key) || [];
        list.push(it);
        byParent.set(key, list);
      }

      // Thêm parent rows nếu có trong catalog
      const bySlug = new Map(
        items.map((i) => [normalizeOrderCodeText(i.maHang), i]),
      );

      const groups: VariantGroup[] = [];
      for (const [parentSku, children] of byParent) {
        if (children.length < 1) continue;
        // Chỉ hiện nhóm có ≥1 con gắn parent_sku
        const realChildren = children.filter(
          (c) =>
            normalizeOrderCodeText(c.parentSku) === parentSku &&
            normalizeOrderCodeText(c.maHang) !== parentSku,
        );
        if (!realChildren.length) continue;
        const parentRow = bySlug.get(parentSku);
        groups.push({
          parentSku,
          sampleName:
            parentRow?.tenHang || realChildren[0]?.tenHang || parentSku,
          childCount: realChildren.length + (parentRow ? 1 : 0),
          children: parentRow
            ? [parentRow, ...realChildren]
            : realChildren,
        });
      }

      groups.sort((a, b) => a.parentSku.localeCompare(b.parentSku, "vi"));
      return groups;
    },
  });
}

export function useUpdateVariantProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      barcode?: string | null;
      unit?: string;
      parentSku?: string | null;
      slug?: string;
    }) => {
      const patch: Record<string, unknown> = {};
      if (input.name != null) patch.name = input.name;
      if (input.barcode !== undefined) patch.barcode = input.barcode;
      if (input.unit != null) patch.unit = input.unit;
      if (input.parentSku !== undefined) {
        patch.parent_sku = input.parentSku
          ? normalizeOrderCodeText(input.parentSku)
          : null;
      }
      if (input.slug != null) patch.slug = normalizeOrderCodeText(input.slug);
      const { error } = await supabase
        .from("products")
        .update(patch as never)
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["variant-groups"] });
      void qc.invalidateQueries({ queryKey: ["catalog-flag-admin"] });
      void qc.invalidateQueries({ queryKey: ["new-products-strip"] });
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["catalog-for-stock-import"] });
      }, 0);
    },
  });
}

export type ChildVariantDraft = {
  /** Có id = cập nhật; không = tạo mới */
  id?: string;
  maHang: string;
  tenHang: string;
  maVach: string;
  dvt: string;
};

/** Port GAS saveChildVariants — cập nhật / thêm mã con theo Parent_SKU */
export function useSaveChildVariants() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      parentSku: string;
      variants: ChildVariantDraft[];
    }) => {
      const parentSku = normalizeOrderCodeText(input.parentSku);
      if (!parentSku) throw new Error("Thiếu Parent_SKU");

      const rows = input.variants
        .map((v) => ({
          id: v.id,
          maHang: normalizeOrderCodeText(v.maHang),
          tenHang: String(v.tenHang || "").trim(),
          maVach: String(v.maVach || "").trim(),
          dvt: String(v.dvt || "").trim() || "Cái",
        }))
        .filter((v) => v.maHang);

      if (!rows.length) throw new Error("Cần ít nhất 1 mã con (Mã hàng)");

      let updated = 0;
      let created = 0;

      for (const r of rows) {
        if (r.id) {
          const { error } = await supabase
            .from("products")
            .update({
              slug: r.maHang,
              name: r.tenHang || r.maHang,
              barcode: r.maVach || null,
              unit: r.dvt,
              parent_sku: parentSku,
            } as never)
            .eq("id", r.id);
          if (error) throw error;
          updated++;
          continue;
        }

        // Trùng slug đã có → cập nhật gán parent
        const existing = await supabase
          .from("products")
          .select("id")
          .eq("slug", r.maHang)
          .maybeSingle();
        if (existing.data?.id) {
          const { error } = await supabase
            .from("products")
            .update({
              name: r.tenHang || r.maHang,
              barcode: r.maVach || null,
              unit: r.dvt,
              parent_sku: parentSku,
              is_active: true,
            } as never)
            .eq("id", existing.data.id);
          if (error) throw error;
          updated++;
          continue;
        }

        // Thử slug lowercase cũ (DB trước đây)
        const lower = r.maHang.toLowerCase();
        if (lower !== r.maHang) {
          const byLower = await supabase
            .from("products")
            .select("id")
            .eq("slug", lower)
            .maybeSingle();
          if (byLower.data?.id) {
            const { error } = await supabase
              .from("products")
              .update({
                slug: r.maHang,
                name: r.tenHang || r.maHang,
                barcode: r.maVach || null,
                unit: r.dvt,
                parent_sku: parentSku,
                is_active: true,
              } as never)
              .eq("id", byLower.data.id);
            if (error) throw error;
            updated++;
            continue;
          }
        }

        const { error } = await supabase.from("products").insert({
          name: r.tenHang || r.maHang,
          slug: r.maHang,
          price: 0,
          is_active: true,
          unit: r.dvt,
          barcode: r.maVach || null,
          is_new: true,
          stock_quantity: 0,
          parent_sku: parentSku,
          description: `Thêm mã con (Parent: ${parentSku})`,
        } as never);
        if (error) throw new Error(`Không tạo ${r.maHang}: ${error.message}`);
        created++;
      }

      return { updated, created, parentSku };
    },
    onSuccess: () => {
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["variant-groups"] });
        void qc.invalidateQueries({ queryKey: ["catalog-flag-admin"] });
        void qc.invalidateQueries({ queryKey: ["new-products-strip"] });
        void qc.invalidateQueries({ queryKey: ["catalog-for-stock-import"] });
      }, 150);
    },
  });
}

/** Thêm 1 mã hàng mới (có hoặc không Parent_SKU) — như GAS thêm vào danh mục */
export function useCreateCatalogSku() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      maHang: string;
      tenHang: string;
      maVach?: string;
      dvt?: string;
      parentSku?: string;
    }) => {
      const maHang = normalizeOrderCodeText(input.maHang);
      if (!maHang) throw new Error("Nhập mã hàng");
      const parentSku = input.parentSku
        ? normalizeOrderCodeText(input.parentSku)
        : null;
      const name = String(input.tenHang || "").trim() || maHang;
      const unit = String(input.dvt || "").trim() || "Cái";
      const barcode = String(input.maVach || "").trim() || null;

      // BẮT BUỘC await mọi thao tác Supabase — không fire-and-forget
      const tryFind = async (slug: string) => {
        const { data, error } = await supabase
          .from("products")
          .select("id, slug")
          .eq("slug", slug)
          .maybeSingle();
        if (error) throw new Error(error.message);
        return data as { id: string; slug: string } | null;
      };

      let found = await tryFind(maHang);
      if (!found) found = await tryFind(maHang.toLowerCase());

      if (found) {
        const { data: updated, error } = await supabase
          .from("products")
          .update({
            slug: maHang,
            name,
            barcode,
            unit,
            parent_sku: parentSku,
            is_active: true,
          } as never)
          .eq("id", found.id)
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        if (!updated) throw new Error("Cập nhật mã thất bại (không có id).");
        return {
          id: (updated as { id: string }).id,
          created: false,
          maHang,
        };
      }

      const { data, error } = await supabase
        .from("products")
        .insert({
          name,
          slug: maHang,
          price: 0,
          is_active: true,
          unit,
          barcode,
          is_new: true,
          stock_quantity: 0,
          parent_sku: parentSku,
          description: parentSku
            ? `Thêm mã mới (Parent: ${parentSku})`
            : "Thêm mã mới từ Quản lý danh mục",
        } as never)
        .select("id, slug")
        .single();

      if (error) throw new Error(error.message);
      const row = data as { id: string; slug: string } | null;
      if (!row?.id) {
        throw new Error("Thêm mã thất bại — Supabase không trả về id.");
      }
      return { id: row.id, created: true, maHang };
    },
    onSuccess: () => {
      // Invalidate chạy nền — KHÔNG await (tránh treo UI / race đóng form)
      window.setTimeout(() => {
        void qc.invalidateQueries({ queryKey: ["new-products-strip"] });
        void qc.invalidateQueries({ queryKey: ["variant-groups"] });
        void qc.invalidateQueries({ queryKey: ["catalog-flag-admin"] });
        void qc.invalidateQueries({ queryKey: ["catalog-for-stock-import"] });
        void qc.invalidateQueries({ queryKey: ["products"] });
      }, 150);
    },
  });
}
