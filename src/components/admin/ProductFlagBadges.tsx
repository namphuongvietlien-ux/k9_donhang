import { Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ProductVisualFlags } from "@/lib/productFlags";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { cn } from "@/lib/utils";

interface ProductFlagBadgesProps extends ProductVisualFlags {
  className?: string;
  /** Hiện slug kèm ổ khóa nếu locked */
  slug?: string | null;
  showSlug?: boolean;
}

/**
 * Badge MỚI / HẾT HÀNG / 🔒 — y hệt chỉ báo GAS Data_Excel + TON_VARIANT.
 */
export default function ProductFlagBadges({
  is_new,
  is_out_stock,
  is_locked,
  slug,
  showSlug = false,
  className,
}: ProductFlagBadgesProps) {
  const maHang = slug ? normalizeOrderCodeText(slug) || slug : "—";
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {showSlug && (
        <span
          className={cn(
            "font-mono text-sm inline-flex items-center gap-1 uppercase",
            is_locked && "text-red-700 font-semibold",
          )}
        >
          {is_locked ? (
            <Lock
              className="w-3.5 h-3.5 text-red-600 shrink-0"
              aria-label="Khóa mã"
            />
          ) : null}
          {maHang}
        </span>
      )}
      {is_new ? (
        <Badge className="border-0 bg-gradient-to-r from-emerald-100 to-lime-100 text-emerald-900 font-bold text-[10px] px-1.5 py-0 h-5">
          MỚI
        </Badge>
      ) : null}
      {is_out_stock ? (
        <Badge
          variant="secondary"
          className="bg-slate-200/80 text-slate-600 line-through decoration-slate-500 text-[10px] px-1.5 py-0 h-5 font-medium"
        >
          HẾT HÀNG
        </Badge>
      ) : null}
      {!showSlug && is_locked ? (
        <span
          className="inline-flex items-center gap-0.5 text-red-600 text-[10px] font-semibold"
          title="Mã bị khóa / ngừng giao dịch"
        >
          <Lock className="w-3.5 h-3.5" />
          KHÓA
        </span>
      ) : null}
    </div>
  );
}
