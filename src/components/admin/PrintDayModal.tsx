import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  openMultiOrderPdfWindow,
  resolvePrintQty,
  type PrintOrderDetail,
} from "@/lib/orderPrint";
import {
  fetchProductMetaBySlugs,
  getMeta,
  resolveLineUnitBarcode,
} from "@/lib/productCatalogMeta";
import { enrichWarehouseMeta } from "@/lib/warehouseMeta";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useToast } from "@/hooks/use-toast";

export interface PrintDayOrderRow {
  id: string;
  order_code: string | null;
  status: string;
  warehouse_id: string | null;
  warehouse_code?: string;
  created_at: string;
  totalQty: number;
}

interface PrintDayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD */
  dateKey: string;
  dateLabel: string;
  orders: PrintDayOrderRow[];
  warehouses: { id: string; code: string; name: string }[];
  defaultWarehouseId?: string | null;
}

async function fetchPrintDetails(
  orderIds: string[],
): Promise<PrintOrderDetail[]> {
  // Select cơ bản trước — tránh 400 khi chưa migration address
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      id, order_code, status, created_at, updated_at,
      source_warehouse:source_warehouse_id ( code, name ),
      warehouse:warehouse_id ( code, name ),
      order_items ( product_name, product_slug, quantity, qty_requested, qty_packed, barcode, unit )
    `,
    )
    .in("id", orderIds);

  if (error) throw error;

  type Raw = {
    order_code: string | null;
    status: string;
    created_at: string;
    updated_at?: string | null;
    source_warehouse: {
      code: string;
      name: string;
      address?: string | null;
      short_name?: string | null;
      print_name?: string | null;
    } | null;
    warehouse: {
      code: string;
      name: string;
      address?: string | null;
      short_name?: string | null;
      print_name?: string | null;
    } | null;
    order_items: {
      product_name: string;
      product_slug: string | null;
      quantity: number;
      qty_requested: number | null;
      qty_packed: number | null;
      barcode: string | null;
      unit: string | null;
    }[] | null;
  };

  const raws = (data as unknown as Raw[]) || [];
  const slugs = raws.flatMap((o) =>
    (o.order_items || [])
      .map((it) => it.product_slug)
      .filter((s): s is string => !!s),
  );
  const metaIndex = await fetchProductMetaBySlugs(slugs);

  const whLabel = (w: Raw["warehouse"] | Raw["source_warehouse"]) => {
    const e = enrichWarehouseMeta(w);
    return (
      String(e?.short_name || e?.print_name || e?.code || "—").trim() || "—"
    );
  };

  return raws.map((o) => {
    const sx = enrichWarehouseMeta(o.source_warehouse);
    const sn = enrichWarehouseMeta(o.warehouse);
    return {
      soPhieu: o.order_code || "—",
      khoXuat: whLabel(sx),
      khoNhan: whLabel(sn),
      diaChiXuat: sx?.address || null,
      diaChiNhan: sn?.address || null,
      thoiGianTao: o.created_at,
      thoiGianCapNhat: o.updated_at || o.created_at,
      status: o.status,
      items: (o.order_items || []).map((it) => {
        const meta = getMeta(metaIndex, it.product_slug);
        const resolved = resolveLineUnitBarcode(meta, it.unit, it.barcode);
        return {
          maHang: it.product_slug || "",
          tenHang: it.product_name,
          dvt: resolved.unit || "",
          maVach: resolved.barcode || "",
          parentSku: it.product_slug || "",
          sl: resolvePrintQty({
            status: o.status,
            qtyPacked: it.qty_packed,
            qtyRequested: it.qty_requested,
            quantity: it.quantity,
          }),
          isNew: !!meta?.is_new,
          isLocked: !!meta?.is_locked,
        };
      }),
    };
  });
}

/**
 * GAS In Đơn Ngày — lọc kho, tick đơn, ghép PDF 1 cửa sổ.
 */
export default function PrintDayModal({
  open,
  onOpenChange,
  dateKey,
  dateLabel,
  orders,
  warehouses,
  defaultWarehouseId,
}: PrintDayModalProps) {
  const { toast } = useToast();
  const [whFilter, setWhFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setWhFilter(defaultWarehouseId || "all");
    setSelected(new Set(orders.map((o) => o.id)));
  }, [open, dateKey, orders, defaultWarehouseId]);

  const visible = useMemo(() => {
    if (whFilter === "all") return orders;
    return orders.filter((o) => o.warehouse_id === whFilter);
  }, [orders, whFilter]);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set(visible.map((o) => o.id)));
  }, [whFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handlePrint = async () => {
    const ids = visible.filter((o) => selected.has(o.id)).map((o) => o.id);
    if (!ids.length) {
      toast({
        title: "Chưa chọn đơn",
        description: "Tick ít nhất 1 phiếu để in.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const details = await fetchPrintDetails(ids);
      if (!details.length) throw new Error("Không tải được chi tiết đơn.");
      openMultiOrderPdfWindow(details, `In ${details.length} đơn — ${dateLabel}`);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: "Lỗi ghép PDF",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>In Đơn Ngày {dateLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Chọn kho + tick đơn cần in → ghép 1 PDF liên tục (SL = số lượng soạn
          nếu đã soạn).
        </p>

        <div className="space-y-1.5">
          <Label>Bộ lọc theo kho nhận</Label>
          <Select value={whFilter} onValueChange={setWhFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả kho</SelectItem>
              {warehouses.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.code} — {w.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="print-day-all"
            checked={
              visible.length > 0 && visible.every((o) => selected.has(o.id))
            }
            onCheckedChange={(v) => {
              if (v === true) setSelected(new Set(visible.map((o) => o.id)));
              else setSelected(new Set());
            }}
          />
          <Label htmlFor="print-day-all" className="cursor-pointer">
            Chọn tất cả ({visible.length})
          </Label>
        </div>

        <div className="rounded-md border max-h-72 overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>Mã đơn</TableHead>
                <TableHead>Kho</TableHead>
                <TableHead>TT</TableHead>
                <TableHead className="text-right">SL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    Không có đơn trong ngày / bộ lọc này.
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(o.id)}
                        onCheckedChange={(v) => toggle(o.id, v === true)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {o.order_code}
                    </TableCell>
                    <TableCell>{o.warehouse_code || "—"}</TableCell>
                    <TableCell className="text-xs">{o.status}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {o.totalQty}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
          <Button onClick={() => void handlePrint()} disabled={busy}>
            {busy ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Printer className="w-4 h-4 mr-2" />
            )}
            In PDF ({selected.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
