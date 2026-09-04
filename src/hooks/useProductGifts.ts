import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ProductGiftRule = {
  id: string;
  main_product_id: string;
  gift_product_id: string;
  quantity: number;
  is_active: boolean;
  notes: string | null;
  main?: { id: string; slug: string; name: string; unit: string | null } | null;
  gift?: { id: string; slug: string; name: string; unit: string | null } | null;
};

export function useProductGifts() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["product-gifts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_gifts" as never)
        .select(
          "id, main_product_id, gift_product_id, quantity, is_active, notes, main:main_product_id(id, slug, name, unit), gift:gift_product_id(id, slug, name, unit)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ProductGiftRule[];
    },
  });

  const save = useMutation({
    mutationFn: async (input: {
      mainProductId: string;
      giftProductId: string;
      quantity: number;
    }) => {
      const { error } = await supabase.from("product_gifts" as never).upsert(
        {
          main_product_id: input.mainProductId,
          gift_product_id: input.giftProductId,
          quantity: input.quantity,
          is_active: true,
        } as never,
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
