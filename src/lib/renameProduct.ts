import { supabase } from "@/integrations/supabase/client";

export type RenameProductResult = {
  slug: string;
  old_name: string;
  new_name: string;
  order_items: number;
  dispatch_items: number;
  weekly_items: number;
  voucher_items: number;
};

export function formatRenameCounts(r: RenameProductResult): string {
  const bits = [
    `${r.order_items} dòng đơn`,
    r.dispatch_items ? `${r.dispatch_items} điều chuyển` : "",
    r.weekly_items ? `${r.weekly_items} phiếu tuần` : "",
    r.voucher_items ? `${r.voucher_items} phiếu XB` : "",
  ].filter(Boolean);
  return `Catalog + ${bits.join(", ")}.`;
}

function isMissingRpc(message?: string | null) {
  return /does not exist|schema cache|PGRST202|Could not find the function/i.test(
    message || "",
  );
}

async function updateSnapshotName(options: {
  table: string;
  name: string;
  productId?: string;
  slug?: string;
  slugColumn: string;
}): Promise<number> {
  const { table, name, productId, slug, slugColumn } = options;
  const parts: string[] = [];
  if (productId) parts.push(`product_id.eq.${productId}`);
  if (slug) parts.push(`${slugColumn}.ilike.${slug}`);
  if (!parts.length) return 0;

  const { count, error } = await supabase
    .from(table as never)
    .update({ product_name: name } as never, { count: "exact" })
    .or(parts.join(","));

  if (!error) return count ?? 0;

  if (slug) {
    const retry = await supabase
      .from(table as never)
      .update({ product_name: name } as never, { count: "exact" })
      .ilike(slugColumn, slug);
    if (!retry.error) return retry.count ?? 0;
  }
  return 0;
}

async function renameViaTables(
  productId: string,
  name: string,
): Promise<RenameProductResult> {
  const { data: product, error: pErr } = await supabase
    .from("products")
    .select("id, slug, name")
    .eq("id", productId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!product) throw new Error("Không tìm thấy sản phẩm");

  const slug = String(product.slug || "").trim();
  const oldName = String(product.name || "");

  const { error: uErr } = await supabase
    .from("products")
    .update({ name } as never)
    .eq("id", productId);
  if (uErr) throw uErr;

  return {
    slug,
    old_name: oldName,
    new_name: name,
    order_items: await updateSnapshotName({
      table: "order_items",
      name,
      productId,
      slug,
      slugColumn: "product_slug",
    }),
    dispatch_items: await updateSnapshotName({
      table: "internal_dispatch_items",
      name,
      productId,
      slug,
      slugColumn: "product_code",
    }),
    weekly_items: await updateSnapshotName({
      table: "weekly_order_items",
      name,
      productId,
      slug,
      slugColumn: "product_code",
    }),
    voucher_items: await updateSnapshotName({
      table: "sales_voucher_items",
      name,
      slug,
      slugColumn: "product_slug",
    }),
  };
}

export async function renameProductEverywhere(
  productId: string,
  newName: string,
): Promise<RenameProductResult> {
  const name = newName.trim();
  if (!name) throw new Error("Tên sản phẩm không được trống");
  if (name.length > 200) throw new Error("Tên sản phẩm tối đa 200 ký tự");

  const { data, error } = await supabase.rpc(
    "rename_product_everywhere" as never,
    {
      p_product_id: productId,
      p_new_name: name,
    } as never,
  );

  if (!error) {
    const row = (data || {}) as Partial<RenameProductResult>;
    return {
      slug: String(row.slug || ""),
      old_name: String(row.old_name || ""),
      new_name: String(row.new_name || name),
      order_items: Number(row.order_items || 0),
      dispatch_items: Number(row.dispatch_items || 0),
      weekly_items: Number(row.weekly_items || 0),
      voucher_items: Number(row.voucher_items || 0),
    };
  }

  if (!isMissingRpc(error.message)) throw error;
  return renameViaTables(productId, name);
}
