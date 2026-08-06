import { AlertTriangle, Loader2 } from "lucide-react";
import { usePackingOrders, useOrderMutations } from "@/hooks/useOrders";
import { toDateKey } from "@/lib/packingWindows";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface DuplicateAlertBannerProps {
  warehouseId?: string | null;
  packingDateYYYYMMDD?: string;
  className?: string;
  orderId?: string;
}

/**
 * Port of GAS attachDuplicateSuspects_ + acknowledgeDuplicateOrder_
 */
export default function DuplicateAlertBanner({
  warehouseId,
  packingDateYYYYMMDD,
  className,
  orderId,
}: DuplicateAlertBannerProps) {
  const dateKey = packingDateYYYYMMDD || toDateKey(new Date());
  const { orders, loading } = usePackingOrders({
    packingDateYYYYMMDD: dateKey,
    mode: "total",
    warehouseId,
  });
  const { acknowledgeDuplicate, cancelOrder } = useOrderMutations();
  const { toast } = useToast();

  const suspects = orders.filter((o) => o.isDuplicateSuspect);
  const visible = orderId
    ? suspects.filter(
        (a) => a.id === orderId || a.duplicateSuspect?.peerId === orderId,
      )
    : suspects;

  if (loading && visible.length === 0) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang kiểm tra đơn trùng…
        </div>
      </div>
    );
  }

  if (visible.length === 0) return null;

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {visible.map((alert) => (
        <Alert
          key={alert.id}
          variant="destructive"
          className="border-amber-500 bg-amber-50 text-amber-950 [&>svg]:text-amber-600"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="flex flex-wrap items-center gap-2">
            Cảnh báo đơn trùng
            <Badge variant="outline" className="border-amber-400 bg-amber-100 text-amber-900">
              {alert.order_code || alert.id.slice(0, 8)}
            </Badge>
            <span className="font-normal text-sm">— {alert.customer_name}</span>
          </AlertTitle>
          <AlertDescription className="mt-2 space-y-3">
            {alert.duplicateSuspect && (
              <p className="text-sm">
                Nghi trùng với{" "}
                <span className="font-mono font-medium">
                  {alert.duplicateSuspect.peerSoPhieu}
                </span>{" "}
                ({alert.duplicateSuspect.peerCreatedUi}) — {alert.duplicateSuspect.reason}.
                Cùng chi nhánh, cùng ngày hoặc ≤60 phút.
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                className="bg-amber-700 hover:bg-amber-800"
                disabled={acknowledgeDuplicate.isPending}
                onClick={async () => {
                  try {
                    await acknowledgeDuplicate.mutateAsync(alert.id);
                    toast({ title: "Đã chấp nhận đơn trùng" });
                  } catch (e) {
                    toast({
                      title: "Lỗi",
                      description: e instanceof Error ? e.message : "Không thể cập nhật",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Chấp nhận đơn trùng
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={cancelOrder.isPending}
                onClick={async () => {
                  try {
                    await cancelOrder.mutateAsync(alert.id);
                    toast({ title: "Đã hủy đơn" });
                  } catch (e) {
                    toast({
                      title: "Lỗi",
                      description: e instanceof Error ? e.message : "Không thể hủy",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Hủy đơn
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}
