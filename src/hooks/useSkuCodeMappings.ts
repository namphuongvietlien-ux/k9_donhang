/**
 * Bảng mã cũ → mã mới (public.sku_code_mappings). Dùng để:
 * - ẩn mã cũ khỏi gợi ý / quét trong form tạo phiếu và tự chuyển sang mã mới,
 * - xuất lệnh điều chuyển KiotViet/MISA bằng mã mới cho cả phiếu đã khóa
 *   (tránh "Mã hàng hóa và mã vạch không trùng khớp").
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeOrderCodeText } from "@/lib/packingWindows";

export type SkuCodeMappingRow = {
  short_slug: string;
  long_slug: string;
  barcode: string | null;
};

export type SkuCodeMap = Map<string, SkuCodeMappingRow>;

export const EMPTY_SKU_CODE_MAP: SkuCodeMap = new Map();

export async function fetchSkuCodeMappings(): Promise<SkuCodeMap> {
  const map: SkuCodeMap = new Map();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("sku_code_mappings" as never)
      .select("short_slug, long_slug, barcode")
      .range(from, from + 999);
    if (error) {
      // Bảng chưa có / chưa cấp quyền đọc → coi như không có mapping
      if (/does not exist|permission denied|schema cache|PGRST/i.test(error.message || "")) {
        return map;
      }
      throw error;
    }
    const rows = (data as SkuCodeMappingRow[] | null) || [];
    for (const r of rows) {
      const key = normalizeOrderCodeText(r.short_slug);
      if (key) map.set(key, r);
    }
    if (rows.length < 1000) break;
  }
  return map;
}

export function useSkuCodeMappings() {
  const q = useQuery({
    queryKey: ["sku-code-mappings"],
    queryFn: fetchSkuCodeMappings,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  return { mappings: q.data || EMPTY_SKU_CODE_MAP, loading: q.isLoading, refetch: q.refetch };
}

/** Mã mới cho một slug (nếu slug là mã cũ đã ánh xạ); ngược lại trả về chính nó. */
export function resolveLongSlug(mappings: SkuCodeMap, slug: string | null | undefined): string {
  const raw = String(slug || "").trim();
  const hit = mappings.get(normalizeOrderCodeText(raw));
  return hit?.long_slug || raw;
}

export function isMappedOldSlug(mappings: SkuCodeMap, slug: string | null | undefined): boolean {
  return mappings.has(normalizeOrderCodeText(String(slug || "")));
}
