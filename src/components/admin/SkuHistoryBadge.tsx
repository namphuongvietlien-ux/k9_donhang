import { Info, Loader2 } from "lucide-react";
import { useBranchSkuHistory } from "@/hooks/useBranchSkuHistory";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface SkuHistoryBadgeProps {
  productSlug: string | null | undefined;
  warehouseId?: string | null;
  excludeOrderId?: string | null;
  className?: string;
}

/**
 * Port of GAS getBranchSkuHistory_ badge:
 * "Mã đã xuất tới..." / lần trước tại chi nhánh trong 7 ngày.
 */
export default function SkuHistoryBadge({
  productSlug,
  warehouseId,
  excludeOrderId,
  className,
}: SkuHistoryBadgeProps) {
  const { data, isLoading } = useBranchSkuHistory({
    warehouseId,
    excludeOrderId,
    daysBack: 7,
    enabled: !!productSlug && !!warehouseId,
  });

  if (!productSlug) return null;

  if (!warehouseId) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Info className="h-3.5 w-3.5" />
        Chọn kho để xem lịch sử SKU
      </span>
    );
  }

  if (isLoading) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Loader2 className="h-3 w-3 animate-spin" />
        Đang tải lịch sử SKU…
      </span>
    );
  }

  const key = normalizeOrderCodeText(productSlug);
  const entry = data?.bySku?.[key];

  if (!entry) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}>
        <Info className="h-3.5 w-3.5" />
        Chưa xuất trong 7 ngày
      </span>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              "mt-1 max-w-full font-normal text-xs text-sky-800 border-sky-200 bg-sky-50 hover:bg-sky-100 cursor-default gap-1",
              className,
            )}
          >
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Mã đã xuất tới {entry.storeLabel || "chi nhánh"} · lần trước {entry.dateLabel} (
              {entry.soPhieu})
            </span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="font-medium mb-1">Lịch sử SKU 7 ngày (GAS)</p>
          <ul className="text-xs space-y-1">
            <li>
              Chi nhánh: <strong>{entry.storeLabel}</strong>
            </li>
            <li>
              SL lần trước: <strong>{entry.qty}</strong>
            </li>
            <li>
              Phiếu: <strong>{entry.soPhieu}</strong>
            </li>
            <li>{entry.createdUi}</li>
          </ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
