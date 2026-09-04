import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type GiftLimitKind = "long_term" | "timeline" | "qty_limit";

export type ProductGiftRule = {
  id: string;
  main_product_id: string;
  gift_product_id: string;
  quantity: number;
  is_active: boolean;
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
  "id, main_product_id, gift_product_id, quantity, is_active, notes, limit_kind, starts_on, ends_on, max_total_qty, used_qty, main:main_product_id(id, slug, name, unit), gift:gift_product_id(id, slug, name, unit)";

const GIFT_SELECT_BASIC =
  "id, main_product_id, gift_product_id, quantity, is_active, notes, main:main_product_id(id, slug, name, unit), gift:gift_product_id(id, slug, name, unit)";

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
      if (error && /limit_kind|starts_on|ends_on|max_total_qty|used_qty/i.test(error.message || "")) {
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
      return (data || []) as unknown as ProductGiftRule[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: SaveProductGiftInput) => {
      const payload: Record<string, unknown> = {
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
      const { error } = await supabase.from("product_gifts" as never).upsert(
        payload as never,
        { onConflict: "main_product_id,gift_product_id" },
      );
      if (error) throw error;
      await supabase
        .from("products")
        .update({ has_gift: true } as never)
        .eq("id", input.mainProductId);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-gifts"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("product_gifts" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["product-gifts"] }),
  });

  return { ...query, save, remove };
}
