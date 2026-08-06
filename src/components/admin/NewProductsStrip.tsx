import { Loader2, Sparkles } from "lucide-react";
import {
  useNewProducts,
  type NewProductCard,
} from "@/hooks/useCatalogFlags";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface NewProductsStripProps {
  onAdd: (item: NewProductCard) => void;
  className?: string;
  limit?: number;
}

/**
 * Port GAS #new-products-strip — Admin chọn ưu tiên · thiếu thì theo ngày tạo.
 */
export default function NewProductsStrip({
  onAdd,
  className,
  limit = 10,
}: NewProductsStripProps) {
  const { data, isLoading, error } = useNewProducts(limit);
  const items = data || [];

  if (isLoading) {
    return (
      <Card className={cn("border-orange-200 bg-orange-50/40", className)}>
        <CardContent className="py-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang tải sản phẩm mới…
        </CardContent>
      </Card>
    );
  }

  if (error || !items.length) return null;

  return (
    <Card className={cn("border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50/60", className)}>
      <CardHeader className="py-3 flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-lg text-orange-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Sản phẩm mới
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Admin chọn ưu tiên · thiếu thì lấy theo ngày tạo — bấm để thêm nhanh
            vào đơn.
          </p>
        </div>
        <Badge className="bg-orange-600 hover:bg-orange-600 shrink-0">NEW</Badge>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onAdd(item)}
              className={cn(
                "text-left rounded-lg border border-orange-200/80 bg-white p-2.5",
                "hover:border-orange-400 hover:shadow-sm transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400",
              )}
            >
              <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                <Badge className="h-5 px-1.5 text-[10px] bg-orange-600 hover:bg-orange-600">
                  MỚI #{item.rank}
                </Badge>
                <span
                  className={cn(
                    "inline-block rounded-full px-1.5 py-0.5 text-[10px] font-extrabold",
                    item.isAdminPick
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600",
                  )}
                >
                  {item.reasonLabel}
                </span>
              </div>
              <div className="text-sm font-semibold leading-snug line-clamp-2 text-slate-900">
                {item.tenHang}
              </div>
              <div className="mt-1 text-[11px] text-slate-500 font-mono leading-relaxed uppercase">
                MH: {item.maHang || "—"} · MV: {item.maVach || "—"} · ĐVT:{" "}
                {item.dvt}
                {item.ngayTao ? ` · ${item.ngayTao}` : ""}
              </div>
              <div className="mt-2">
                <span className="inline-flex items-center text-xs font-semibold text-orange-700">
                  ➕ Thêm vào đơn
                </span>
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => items.forEach((it) => onAdd(it))}
          >
            Thêm tất cả ({items.length})
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
