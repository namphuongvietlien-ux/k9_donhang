/**
 * Slide-over chi tiết phiếu xuất nội bộ (AppSheet Master–Detail).
 * Giữ nguyên props/logic duyệt — chỉ đổi Dialog → Sheet + Card sections.
 */
import { Check, Loader2, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type DispatchDetailLine = {
  id?: string;
  line_no: number;
  product_code: string;
  product_name: string;
  unit: string | null;
  quantity: number;
  notes: string | null;
};

export type DispatchDetailView = {
  id: string;
  dispatch_code: string;
  status: string;
  requested_at: string;
  notes: string | null;
  internal_dispatch_items: DispatchDetailLine[];
};

export type InternalDispatchDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dispatch: DispatchDetailView | null;
  branchLabel: string;
  statusText: string;
  /** Quản lý + phiếu đang chờ duyệt mới hiện 2 nút quyết định */
  canDecide: boolean;
  isBusy?: boolean;
  /** Optimistic: đang đồng bộ trạng thái */
  isSyncing?: boolean;
  onApprove: () => void;
  onReject: () => void;
};

const qty = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("vi-VN", {
    maximumFractionDigits: 3,
  });

export default function InternalDispatchDetailDialog({
  open,
  onOpenChange,
  dispatch,
  branchLabel,
  statusText,
  canDecide,
  isBusy = false,
  isSyncing = false,
  onApprove,
  onReject,
}: InternalDispatchDetailDialogProps) {
  const items = dispatch?.internal_dispatch_items || [];
  const totalQty = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {!dispatch ? null : (
          <>
            <SheetHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
              <SheetTitle className="flex flex-wrap items-center gap-2 pr-8">
                <span className="font-mono text-base">{dispatch.dispatch_code}</span>
                {isSyncing ? (
                  <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Đang đồng bộ...
                  </Badge>
                ) : (
                  <Badge variant="secondary">{statusText}</Badge>
                )}
              </SheetTitle>
              <SheetDescription>
                Xem phiếu bên phải — danh sách vẫn hiện bên trái.
              </SheetDescription>
            </SheetHeader>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
              {/* Cụm 1: Thông tin chung */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    Thông tin chung
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Mã phiếu</div>
                    <div className="mt-0.5 font-mono text-sm font-medium">
                      {dispatch.dispatch_code}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Ngày gửi</div>
                    <div className="mt-0.5 text-sm font-medium">
                      {dispatch.requested_at
                        ? new Date(dispatch.requested_at).toLocaleString("vi-VN")
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Chi nhánh nhận</div>
                    <div className="mt-0.5 text-sm font-medium">{branchLabel}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Trạng thái</div>
                    <div className="mt-0.5 text-sm font-medium">
                      {isSyncing ? "Đang đồng bộ..." : statusText}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cụm 2: Bảng mặt hàng */}
              <Card className="shadow-sm">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    Mặt hàng ({items.length} dòng · tổng SL {qty(totalQty)})
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12 pl-4">STT</TableHead>
                          <TableHead>Mã hàng</TableHead>
                          <TableHead>Tên hàng</TableHead>
                          <TableHead className="w-20">ĐVT</TableHead>
                          <TableHead className="pr-4 text-right w-20">SL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {!items.length ? (
                          <TableRow>
                            <TableCell
                              colSpan={5}
                              className="py-8 text-center text-muted-foreground"
                            >
                              Phiếu chưa có dòng hàng.
                            </TableCell>
                          </TableRow>
                        ) : (
                          items.map((item, index) => (
                            <TableRow key={item.id || `${item.product_code}-${index}`}>
                              <TableCell className="pl-4">{index + 1}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {item.product_code}
                              </TableCell>
                              <TableCell className="text-sm">{item.product_name}</TableCell>
                              <TableCell>{item.unit || "—"}</TableCell>
                              <TableCell className="pr-4 text-right tabular-nums font-medium">
                                {qty(Number(item.quantity) || 0)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={4} className="pl-4 font-semibold">
                            TỔNG CỘNG
                          </TableCell>
                          <TableCell className="pr-4 text-right tabular-nums font-bold">
                            {qty(totalQty)}
                          </TableCell>
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Cụm 3: Hành động */}
              <Card className="shadow-sm sticky bottom-0 mt-auto border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground">
                    Hành động
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4">
                  {dispatch.notes ? (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Ghi chú phiếu</div>
                      <div className="rounded-md bg-muted/60 p-2.5 text-sm whitespace-pre-line">
                        {dispatch.notes}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Không có ghi chú.</p>
                  )}

                  <div className="flex flex-wrap gap-2 justify-end pt-1">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Đóng
                    </Button>
                    {canDecide || isSyncing ? (
                      <>
                        <Button
                          variant="destructive"
                          onClick={onReject}
                          disabled={isBusy || isSyncing}
                        >
                          {isBusy || isSyncing ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <X className="mr-1 h-4 w-4" />
                          )}
                          {isSyncing ? "Đang đồng bộ..." : "Không duyệt"}
                        </Button>
                        <Button onClick={onApprove} disabled={isBusy || isSyncing}>
                          {isBusy || isSyncing ? (
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="mr-1 h-4 w-4" />
                          )}
                          {isSyncing ? "Đang đồng bộ..." : "Duyệt phiếu"}
                        </Button>
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground self-center">
                        Phiếu {statusText.toLowerCase()} — không còn chờ quyết định.
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
