/**
 * Auto-upsert mã ngoài (SKU chưa có trong `products`) trước khi ghi order_items.
 * Gắn is_new = true để AdminProducts hiện badge MỚI.
 */
import { supabase } from "@/integrations/supabase/client";
import { isLoiMaSku } from "@/lib/catalogUnitBarcode";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export type OrderLineProductSeed = {
  productSlug: string | null | undefined;
  productName: string;
  barcode?: string | null;
  unit?: string | null;
  productId?: string | null;
};

/**
 * Đảm bảo mỗi SKU hợp lệ có `products.id`.
 * @returns Map slug chuẩn hóa → product_id
 */
export async function ensureProductsForOrderLines(
  lines: OrderLineProductSeed[],
): Promise<Map<string, string>> {
  const slugToId = new Map<string, string>();

  const seeds = new Map<
    string,
    { slug: string; name: string; barcode: string | null; unit: string }
  >();

  for (const l of lines) {
    const slug = normalizeOrderCodeText(l.productSlug || "");
    if (!slug || isLoiMaSku(slug)) continue;

    if (l.productId) {
      slugToId.set(slug, l.productId);
      continue;
    }

    if (!seeds.has(slug)) {
      seeds.set(slug, {
        slug,
        name: String(l.productName || "").trim() || slug,
        barcode: l.barcode ? String(l.barcode).trim() || null : null,
        unit: String(l.unit || "").trim() || "cái",
      });
    }
  }

  if (!seeds.size && !slugToId.size) return slugToId;

  const slugs = [...seeds.keys()].filter((s) => !slugToId.has(s));
  for (let i = 0; i < slugs.length; i += 200) {
    const slice = slugs.slice(i, i + 200);
    const { data } = await supabase
      .from("products")
      .select("id, slug")
      .in("slug", slice);
    for (const row of (data as { id: string; slug: string }[] | null) || []) {
      slugToId.set(normalizeOrderCodeText(row.slug), row.id);
    }
  }

  const missing = [...seeds.values()].filter(
    (s) => !slugToId.has(normalizeOrderCodeText(s.slug)),
  );

  for (const c of missing) {
    const payload = {
      name: c.name,
      slug: c.slug,
      price: 0,
      is_active: true,
      unit: c.unit,
      barcode: c.barcode,
      is_new: true,
      stock_quantity: 0,
      description: "Tạo tự động từ phiếu kho (mã ngoài / hàng mới)",
    };

    const { data, error } = await supabase
      .from("products")
      .insert(payload as never)
      .select("id, slug")
      .single();

    if (!error && data) {
      const row = data as { id: string; slug: string };
      slugToId.set(normalizeOrderCodeText(row.slug), row.id);
      continue;
    }

    // Race / slug đã tồn tại → lấy lại
    const { data: found } = await supabase
      .from("products")
      .select("id, slug")
      .eq("slug", c.slug)
      .maybeSingle();

    if (found) {
      const row = found as { id: string; slug: string };
      slugToId.set(normalizeOrderCodeText(row.slug), row.id);
      continue;
    }

    throw new Error(
      `Không tạo được mã hàng ${c.slug}: ${error?.message || "unknown"}`,
    );
  }

  return slugToId;
}
