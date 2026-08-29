/**
 * Xem lại 1 phiếu xuất nội bộ như xem lại hóa đơn dịch vụ: đủ thông tin phiếu +
 * dòng hàng + tổng cộng, và duyệt / không duyệt ngay trên phiếu.
 */
import { Check, Loader2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  onApprove,
  onReject,
}: InternalDispatchDetailDialogProps) {
  if (!dispatch) return null;

  const items = dispatch.internal_dispatch_items || [];
  const totalQty = items.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0),
    0,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{dispatch.dispatch_code}</span>
            <Badge variant="secondary">{statusText}</Badge>
          </DialogTitle>
          <DialogDescription>
            Xem lại phiếu xuất nội bộ và duyệt trực tiếp trên phiếu.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">Chi nhánh nhận</div>
            <div className="mt-0.5 font-medium">{branchLabel}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Ngày gửi</div>
            <div className="mt-0.5 font-medium">
              {dispatch.requested_at
                ? new Date(dispatch.requested_at).toLocaleString("vi-VN")
                : "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Số dòng hàng</div>
            <div className="mt-0.5 font-medium">
              {items.length} dòng · tổng SL {qty(totalQty)}
            </div>
          </div>
        </div>

        {dispatch.notes ? (
          <div>
            <div className="text-xs text-muted-foreground">Ghi chú phiếu</div>
            <div className="mt-1 rounded-md bg-muted p-3 text-sm whitespace-pre-line">
              {dispatch.notes}
            </div>
          </div>
        ) : null}

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">STT</TableHead>
                <TableHead>Mã hàng</TableHead>
                <TableHead>Tên hàng</TableHead>
                <TableHead className="w-24">ĐVT</TableHead>
                <TableHead className="text-right w-24">SL</TableHead>
                <TableHead>Ghi chú</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!items.length ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="py-8 text-center text-muted-foreground"
                  >
                    Phiếu chưa có dòng hàng.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item, index) => (
                  <TableRow key={item.id || `${item.product_code}-${index}`}>
                    <TableCell>{index + 1}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {item.product_code}
                    </TableCell>
                    <TableCell>{item.product_name}</TableCell>
                    <TableCell>{item.unit || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {qty(Number(item.quantity) || 0)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {item.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4} className="font-semibold">
                  TỔNG CỘNG: {items.length} dòng hàng
                </TableCell>
                <TableCell className="text-right tabular-nums text-[15px] font-bold">
                  {qty(totalQty)}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          {canDecide ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="destructive"
                onClick={onReject}
                disabled={isBusy}
              >
                {isBusy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <X className="mr-1 h-4 w-4" />
                )}
                Không duyệt
              </Button>
              <Button onClick={onApprove} disabled={isBusy}>
                {isBusy ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-1 h-4 w-4" />
                )}
                Duyệt phiếu này
              </Button>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground self-center">
              Phiếu {statusText.toLowerCase()} — không còn chờ quyết định.
            </span>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
