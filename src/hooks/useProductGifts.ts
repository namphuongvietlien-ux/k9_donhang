import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GiftLimitKind = "long_term" | "timeline" | "qty_limit";

export type ProductGiftRule = {
  id: string;
  main_product_id: string;
  gift_product_id: string;
  quantity: number;
  is_active: boolean;
  is_deleted?: boolean | null;
  notes: string | null;
  limit_kind?: GiftLimitKind | null;
  starts_on?: string | null;
  ends_on?: string | null;
  max_total_qty?: number | null;
  used_qty?: number | null;
  main?: { id: string; slug: string; name: string; unit: string | null } | null;
  gift?: { id: string; slug: string; name: string; unit: string | null } | null;
};

const GIFT_SELECT =
  "id, main_product_id, gift_product_id, quantity, is_active, is_deleted, notes, limit_kind, starts_on, ends_on, max_total_qty, used_qty, main:main_product_id(id, slug, name, unit), gift:gift_product_id(id, slug, name, unit)";

const GIFT_SELECT_BASIC =
  "id, main_product_id, gift_product_id, quantity, is_active, notes, main:main_product_id(id, slug, name, unit), gift:gift_product_id(id, slug, name, unit)";

/** Cột chưa có trong schema (cần chạy DDL) → nhận diện để fallback êm. */
const MISSING_COLUMN_RE =
  /is_deleted|limit_kind|starts_on|ends_on|max_total_qty|used_qty|column|does not exist|schema cache|PGRST/i;

export type SaveProductGiftInput = {
  mainProductId: string;
  giftProductId: string;
  quantity: number;
  limitKind: GiftLimitKind;
  startsOn?: string | null;
  endsOn?: string | null;
  maxTotalQty?: number | null;
};

export function useProductGifts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["product-gifts"],
    queryFn: async () => {
      const first = await supabase
        .from("product_gifts" as never)
        .select(GIFT_SELECT)
        .order("created_at", { ascending: false });
      let data = first.data;
      let error = first.error;
      if (error && MISSING_COLUMN_RE.test(error.message || "")) {
        const retry = await supabase
          .from("product_gifts" as never)
          .select(GIFT_SELECT_BASIC)
          .order("created_at", { ascending: false });
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        if (/does not exist|schema cache|PGRST/i.test(error.message || "")) {
          return [];
        }
        throw error;
      }
      const rows = (data || []) as unknown as ProductGiftRule[];
      // Ẩn quy tắc đã xóa mềm (is_deleted). Trước khi có cột thì undefined → vẫn hiện.
      return rows.filter((rule) => rule.is_deleted !== true);
    },
  });

  const save = useMutation({
    mutationFn: async (input: SaveProductGiftInput) => {
      const base: Record<string, unknown> = {
        main_product_id: input.mainProductId,
        gift_product_id: input.giftProductId,
        quantity: input.quantity,
        is_active: true,
        limit_kind: input.limitKind,
        starts_on: input.limitKind === "timeline" ? input.startsOn || null : null,
        ends_on: input.limitKind === "timeline" ? input.endsOn || null : null,
        max_total_qty:
          input.limitKind === "qty_limit" ? Number(input.maxTotalQty) || null : null,
      };
      // Reset is_deleted để "hồi sinh" đúng khi thêm lại cặp đã xóa mềm.
      let res = await supabase.from("product_gifts" as never).upsert(
        { ...base, is_deleted: false } as never,
        { onConflict: "main_product_id,gift_product_id" },
      );
      if (res.error && /is_deleted/i.test(res.error.message || "")) {
        // Chưa chạy DDL thêm cột → upsert không kèm is_deleted.
        res = await supabase.from("product_gifts" as never).upsert(
          base as never,
          { onConflict: "main_product_id,gift_product_id" },
        );
      }
      if (res.error) throw res.error;
      await supabase
        .from("products")
        .update({ has_gift: true } as never)
        .eq("id", input.mainProductId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-gifts"] }),
  });

  const remove = useMutation({
    // Lỗi xóa mang tính xác định (RLS / phiếu đã khóa) — không retry để tránh gọi 400 hai lần.
    retry: 0,
    mutationFn: async (id: string) => {
      // Xóa mềm: chỉ UPDATE product_gifts, KHÔNG delete cứng nên không kích hoạt
      // cascade ON DELETE SET NULL xuống order_items (tránh trigger khóa phiếu P0001).
      const soft = await supabase
        .from("product_gifts" as never)
        .update({ is_deleted: true, is_active: false } as never)
        .eq("id", id);
      if (!soft.error) return;
      // Cột is_deleted chưa tồn tại (chưa chạy DDL) → fallback xóa cứng (best-effort).
      if (/is_deleted|column|does not exist|schema cache|PGRST/i.test(soft.error.message || "")) {
        const hard = await supabase.from("product_gifts" as never).delete().eq("id", id);
        if (hard.error) throw hard.error;
        return;
      }
      throw soft.error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-gifts"] }),
  });

  return { ...query, save, remove };
}
