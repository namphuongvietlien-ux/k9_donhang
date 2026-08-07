import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { cn } from "@/lib/utils";

export type CatalogSuggestRow = {
  id: string;
  name: string;
  slug: string;
  barcode?: string | null;
  barcode_2?: string | null;
  unit?: string | null;
  unit_2?: string | null;
  is_locked?: boolean;
  is_out_stock?: boolean;
  is_new?: boolean;
  parent_sku?: string | null;
};

type CatalogSuggestItemProps = {
  product: CatalogSuggestRow;
  /** Dòng phụ thêm (vd Tồn) */
  extraMeta?: ReactNode;
  unitLabel?: string;
  barcodeLabel?: string;
  onSelect: () => void;
};

/** 1 dòng gợi ý — tên wrap, badge khóa/hết hàng, làm mờ nếu blocked. */
export function CatalogSuggestItem({
  product: p,
  extraMeta,
  unitLabel,
  barcodeLabel,
  onSelect,
}: CatalogSuggestItemProps) {
  const blocked = !!(p.is_locked || p.is_out_stock);
  const units =
    unitLabel ||
    [p.unit, p.unit_2].filter(Boolean).join("/") ||
    "cái";
  const barcodes =
    barcodeLabel ||
    [p.barcode, p.barcode_2].filter(Boolean).join(" · ") ||
    "—";

  return (
    <button
      type="button"
      className={cn(
        "w-full text-left px-3 py-2 hover:bg-accent border-b last:border-0",
        blocked && "opacity-50 cursor-not-allowed",
        p.is_new && !blocked && "bg-emerald-50/80",
      )}
      onMouseDown={(e) => {
        // Tránh blur ô tìm trước khi click → mất sự kiện chọn
        e.preventDefault();
        onSelect();
      }}
    >
      <div className="text-sm font-bold whitespace-normal break-words text-left leading-snug">
        {p.is_locked ? (
          <span className="inline-flex items-center gap-0.5 mr-1.5 text-red-700 font-extrabold text-[11px] uppercase tracking-wide">
            <Lock className="w-3 h-3 shrink-0" aria-hidden />
            ĐÃ KHÓA
          </span>
        ) : null}
        {p.is_out_stock ? (
          <span className="inline-flex mr-1.5 rounded px-1 py-0.5 text-[10px] font-extrabold uppercase tracking-wide bg-slate-200 text-red-700 border border-red-200">
            HẾT HÀNG
          </span>
        ) : null}
        {p.is_new && !blocked ? (
          <span className="inline-flex mr-1.5 text-[10px] text-emerald-700 font-bold uppercase">
            MỚI
          </span>
        ) : null}
        <span className="font-mono text-teal-800 uppercase">
          {normalizeOrderCodeText(p.slug)}
        </span>
        {" — "}
        <span className="font-semibold text-foreground">{p.name}</span>
      </div>
      <div className="text-xs text-muted-foreground whitespace-normal break-words text-left mt-0.5">
        ĐVT: {units} • Mã vạch: {barcodes}
        {extraMeta}
        {p.parent_sku
          ? ` • Parent: ${normalizeOrderCodeText(p.parent_sku)}`
          : ""}
      </div>
    </button>
  );
}

type CatalogSuggestListProps = {
  className?: string;
  children: ReactNode;
};

/** Popup gợi ý: min-width đủ rộng, scroll max 350px, chữ không cắt. */
export function CatalogSuggestList({
  className,
  children,
}: CatalogSuggestListProps) {
  return (
    <div
      className={cn(
        "absolute z-[200] left-0 right-0 top-full mt-1",
        "w-full min-w-[min(100%,500px)] sm:min-w-[500px]",
        "max-h-[350px] overflow-y-auto",
        "rounded-md border bg-popover shadow-lg",
        className,
      )}
    >
      {children}
    </div>
  );
}
