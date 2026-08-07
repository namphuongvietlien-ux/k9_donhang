import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, ScanLine } from "lucide-react";
import {
  useWarehouseOrder,
  useWarehouseOrderMutations,
  useWarehouseOrders,
} from "@/hooks/useWarehouseOrders";
import { useStoreScope } from "@/hooks/useStoreScope";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import {
  qtyMismatchKind,
  QTY_MISMATCH_ROW,
} from "@/lib/productFlags";
import ProductFlagBadges from "@/components/admin/ProductFlagBadges";
import QtyInput, {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

/**
 * Tab xác nhận nhận hàng — port GAS xacNhanNhanHang.
 * Quét / chọn phiếu processing|pending → đối chiếu qty_packed vs qty_received.
 */
export default function ReceiveOrdersPanel() {
  const { warehouseId: scopedWhId, isStoreScoped } = useStoreScope();
  const { data: orders, isLoading } = useWarehouseOrders({
    status: "ALL",
    limit: 100,
    warehouseId: isStoreScoped ? scopedWhId : null,
  });
  const eligible = useMemo(
    () =>
      (orders || []).filter(
        (o) => o.status === "processing" || o.status === "pending",
      ),
    [orders],
  );

  const [selectedId, setSelectedId] = useState<string>("");
  const [scanCode, setScanCode] = useState("");
  const { data: order, isLoading: detailLoading } = useWarehouseOrder(
    selectedId || null,
  );
  const { confirmReceive } = useWarehouseOrderMutations();
  const { toast } = useToast();
  const [received, setReceived] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!selectedId && eligible[0]) setSelectedId(eligible[0].id);
  }, [eligible, selectedId]);

  useEffect(() => {
    if (!order) return;
    const init: Record<string, number> = {};
    for (const it of order.order_items) {
      init[it.id] = it.qty_packed ?? it.qty_requested ?? it.quantity;
    }
    setReceived(init);
  }, [order]);

  const mismatchLines = useMemo(() => {
    if (!order) return [];
    return order.order_items.filter((it) => {
      const ship = it.qty_packed ?? it.qty_requested ?? it.quantity;
      const recv = received[it.id] ?? 0;
      return recv !== ship;
    });
  }, [order, received]);

  const handleScan = () => {
    const q = scanCode.trim().toUpperCase();
    if (!q) return;
    const hit = eligible.find((o) =>
      (o.order_code || "").toUpperCase().includes(q),
    );
    if (!hit) {
      toast({
        title: "Không tìm thấy phiếu",
        description: `Không có phiếu chờ nhận khớp “${scanCode.trim()}”.`,
        variant: "destructive",
      });
      return;
    }
    setSelectedId(hit.id);
    setScanCode("");
    toast({ title: `Đã chọn ${hit.order_code}` });
  };

  const handleConfirm = async () => {
    if (!order?.source_warehouse_id) {
      toast({
        title: "Thiếu kho xuất",
        description: "Phiếu cần có source_warehouse_id để trừ tồn.",
        variant: "destructive",
      });
      return;
    }
    try {
      await confirmReceive.mutateAsync({
        orderId: order.id,
        sourceWarehouseId: order.source_warehouse_id,
        lines: order.order_items.map((it) => ({
          itemId: it.id,
          qtyReceived: received[it.id] ?? 0,
          productSlug: it.product_slug,
          unit: it.unit,
        })),
      });
      toast({
        title: "Đã xác nhận nhận hàng",
        description: `${order.order_code} — đã trừ tồn kho xuất theo SL nhận.`,
      });
      setSelectedId("");
    } catch (e) {
      toast({
        title: "Xác nhận thất bại",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-12 justify-center text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Đang tải…
      </div>
    );
  }

  if (!eligible.length) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Không có phiếu chờ nhận (status Mới / Đã soạn).
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <ScanLine className="w-3.5 h-3.5" />
            Quét / nhập mã phiếu
          </Label>
          <div className="flex gap-2">
            <Input
              placeholder="VD: DH-100234"
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleScan();
                }
              }}
            />
            <Button type="button" variant="secondary" onClick={handleScan}>
              Chọn
            </Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Hoặc chọn từ danh sách</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn phiếu" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.order_code} · {warehouseShortLabel(o.source_warehouse)} →{" "}
                  {warehouseShortLabel(o.warehouse)} · {o.status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {detailLoading || !order ? (
        <div className="flex items-center gap-2 py-8 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Đang tải chi tiết…
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm items-center">
            <Badge variant="secondary">{order.order_code}</Badge>
            <Badge variant="outline">
              {warehouseShortLabel(order.source_warehouse)} →{" "}
              {warehouseShortLabel(order.warehouse)}
            </Badge>
            <Badge variant="outline">{order.order_items.length} dòng</Badge>
            <span className="text-xs text-muted-foreground font-medium">
              Ngày tạo:{" "}
              {format(new Date(order.created_at), "HH:mm dd/MM/yyyy", {
                locale: vi,
              })}
            </span>
          </div>

          {mismatchLines.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Cảnh báo lệch SL</AlertTitle>
              <AlertDescription>
                {mismatchLines.length} dòng có{" "}
                <strong>qty_received ≠ qty_packed</strong>. Vẫn có thể xác nhận
                — tồn kho xuất sẽ trừ theo SL nhận.
              </AlertDescription>
            </Alert>
          )}

          <div className={excelTableWrap}>
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(excelTh, "text-left")}>Hàng</TableHead>
                  <TableHead className={cn(excelTh, "text-left")}>Mã vạch</TableHead>
                  <TableHead className={excelTh}>ĐVT</TableHead>
                  <TableHead className={cn(excelTh, "text-right bg-sky-100")}>
                    Yêu cầu
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-right bg-amber-100")}>
                    Soạn
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-right bg-emerald-100")}>
                    Thực nhận
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.order_items.map((it) => {
                  const ship = it.qty_packed ?? it.qty_requested ?? it.quantity;
                  const recv = received[it.id] ?? 0;
                  const mismatchRecv = recv !== ship;
                  const packMismatch = qtyMismatchKind(
                    it.qty_requested ?? it.quantity,
                    it.qty_packed,
                  );
                  return (
                    <TableRow
                      key={it.id}
                      className={cn(
                        excelTr,
                        packMismatch && QTY_MISMATCH_ROW[packMismatch],
                        mismatchRecv && !packMismatch && "bg-destructive/5",
                      )}
                    >
                      <TableCell className={excelTd}>
                        <ProductFlagBadges
                          showSlug
                          slug={it.product_slug}
                          is_new={it.is_new}
                          is_out_stock={it.is_out_stock}
                          is_locked={it.is_locked}
                        />
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {it.product_name}
                        </div>
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono text-xs")}>
                        {it.barcode || "—"}
                      </TableCell>
                      <TableCell className={cn(excelTd, "text-xs")}>
                        {it.unit || "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums bg-sky-50/40",
                        )}
                      >
                        {it.qty_requested ?? it.quantity}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums bg-amber-50/40",
                        )}
                      >
                        {it.qty_packed ?? "—"}
                      </TableCell>
                      <TableCell
                        className={cn(excelTd, "text-right bg-emerald-50/40")}
                      >
                        <QtyInput
                          className={cn(
                            "w-16 ml-auto",
                            mismatchRecv && "border-destructive",
                          )}
                          value={recv}
                          onValueChange={(v) =>
                            setReceived((p) => ({ ...p, [it.id]: v }))
                          }
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          <Button
            onClick={() => void handleConfirm()}
            disabled={confirmReceive.isPending}
          >
            {confirmReceive.isPending && (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            )}
            Xác nhận nhận hàng &amp; trừ tồn
          </Button>
        </>
      )}
    </div>
  );
}
