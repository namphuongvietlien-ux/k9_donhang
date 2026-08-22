/**
 * Lưới dòng hàng — form Tạo đơn (DH/DC).
 * ĐVT Select chỉ gọi onUnit; sync barcode nằm ở parent / useVariantSync.
 */
import { Minus, Plus, Trash2 } from "lucide-react";
import {
  getSkuUnitOptions,
  isLoiMaSku,
  resolveUnitOption,
  type SkuUnitOption,
} from "@/lib/catalogUnitBarcode";
import { normalizeOrderCodeText } from "@/lib/packingWindows";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import QtyInput, {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";
import { cn } from "@/lib/utils";

export type OrderGridLine = {
  key: string;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  unitOptions: SkuUnitOption[];
  quantity: number;
  productId: string | null;
  stockQty: number | null;
  /** Đơn giá theo ĐVT đang chọn — đổi ĐVT là syncDraftLineUnit cập nhật lại */
  price?: number;
  isCustomSku?: boolean;
};

const vnd = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
    Number.isFinite(n) ? n : 0,
  );

export type OrderItemsGridProps = {
  lines: OrderGridLine[];
  skuUnitIndex: Map<string, SkuUnitOption[]>;
  getQty: (code: string, unit?: string | null) => number | null | undefined;
  onQty: (key: string, qty: number) => void;
  onUnit: (key: string, dvt: string) => void;
  onBarcode: (key: string, barcode: string) => void;
  onName: (key: string, name: string) => void;
  onRemove: (key: string) => void;
  className?: string;
};

export function OrderItemsGrid({
  lines,
  skuUnitIndex,
  getQty,
  onQty,
  onUnit,
  onBarcode,
  onName,
  onRemove,
  className,
}: OrderItemsGridProps) {
  return (
    <div
      className={cn(
        excelTableWrap,
        "mt-1 max-h-[min(65vh,640px)] border-teal-200/80",
        className,
      )}
    >
      <Table stickyHeader>
        <TableHeader>
          <TableRow>
            <TableHead className={cn(excelTh, "w-10")}>STT</TableHead>
            <TableHead className={cn(excelTh, "text-left min-w-[100px]")}>
              Mã hàng
            </TableHead>
            <TableHead className={cn(excelTh, "text-left min-w-[120px]")}>
              Mã vạch
            </TableHead>
            <TableHead className={cn(excelTh, "text-left")}>Tên hàng</TableHead>
            <TableHead className={cn(excelTh, "w-32")}>ĐVT</TableHead>
            <TableHead className={cn(excelTh, "text-right w-20 bg-emerald-100")}>
              Tồn
            </TableHead>
            <TableHead className={cn(excelTh, "text-center w-32")}>SL</TableHead>
            <TableHead className={cn(excelTh, "text-right w-24")}>
              Đơn giá
            </TableHead>
            <TableHead className={cn(excelTh, "text-right w-28 bg-amber-50")}>
              Thành tiền
            </TableHead>
            <TableHead className={cn(excelTh, "w-10")} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={10}
                className={cn(
                  excelTd,
                  "text-center text-muted-foreground py-8 h-auto",
                )}
              >
                Chưa có mặt hàng. Quét mã vạch / tìm SKU rồi Enter.
              </TableCell>
            </TableRow>
          ) : (
            lines.map((l, idx) => {
              const loi = isLoiMaSku(l.maHang);
              const liveOpts = getSkuUnitOptions(skuUnitIndex, l.maHang);
              const unitOpts =
                liveOpts.length > 0 ? liveOpts : l.unitOptions;
              const isCustom =
                !!l.isCustomSku || (!l.productId && !unitOpts.length);
              const hasUnits = unitOpts.length > 0 && !isCustom;
              const unitLocked = unitOpts.length === 1 && !isCustom;
              const tonLive =
                getQty(l.maHang, l.dvt) ??
                getQty(l.maVach, l.dvt) ??
                l.stockQty;
              return (
                <TableRow
                  key={l.key}
                  className={cn(
                    excelTr,
                    (loi || isCustom) && "bg-emerald-50/70",
                    !loi && !isCustom && idx % 2 === 1 && "bg-slate-50/70",
                  )}
                >
                  <TableCell
                    className={cn(excelTd, "text-muted-foreground text-center")}
                  >
                    {lines.length - idx}
                  </TableCell>
                  <TableCell className={excelTd}>
                    <div
                      className={cn(
                        "font-mono text-[13px] font-bold leading-tight uppercase",
                        loi && "text-red-700",
                        isCustom && "text-emerald-800",
                      )}
                      title={
                        isCustom
                          ? "Hàng mới — sẽ upsert vào danh mục khi lưu"
                          : undefined
                      }
                    >
                      {normalizeOrderCodeText(l.maHang) || l.maHang}
                      {isCustom ? (
                        <span className="ml-1 text-[10px] font-semibold text-emerald-700">
                          MỚI
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className={excelTd}>
                    <Input
                      className={cn(
                        "h-7 text-sm font-mono p-1",
                        hasUnits && !loi && "bg-muted",
                      )}
                      value={l.maVach}
                      readOnly={hasUnits && !loi && !isCustom}
                      onChange={(e) => onBarcode(l.key, e.target.value)}
                      placeholder="Mã vạch"
                      title={
                        hasUnits && !loi && !isCustom
                          ? "Đổi ĐVT để đổi mã vạch theo catalog"
                          : undefined
                      }
                    />
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "font-medium text-[13px]",
                      loi && "text-red-700",
                    )}
                  >
                    {isCustom || loi ? (
                      <Input
                        className="h-7 text-sm p-1"
                        value={l.tenHang}
                        onChange={(e) => onName(l.key, e.target.value)}
                        placeholder="Tên hàng *"
                      />
                    ) : (
                      l.tenHang
                    )}
                  </TableCell>
                  <TableCell className={excelTd}>
                    {!hasUnits || loi || isCustom ? (
                      <Input
                        className="h-7 text-sm p-1"
                        value={l.dvt}
                        onChange={(e) => onUnit(l.key, e.target.value)}
                        placeholder="ĐVT"
                      />
                    ) : (
                      <Select
                        value={
                          resolveUnitOption(unitOpts, l.dvt)?.unit ||
                          unitOpts[0]?.unit ||
                          l.dvt
                        }
                        onValueChange={(v) => onUnit(l.key, v)}
                        disabled={unitLocked}
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 text-[13px]",
                            unitLocked && "opacity-80",
                          )}
                        >
                          <SelectValue placeholder="Chọn ĐVT" />
                        </SelectTrigger>
                        <SelectContent>
                          {unitOpts.map((u) => (
                            <SelectItem
                              key={`${u.unit}-${u.barcode}`}
                              value={u.unit}
                            >
                              {u.unit}
                              {u.barcode ? ` · ${u.barcode}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums bg-emerald-50/60 font-semibold",
                      tonLive != null &&
                        tonLive < l.quantity &&
                        "text-red-700",
                    )}
                  >
                    {loi ? "—" : tonLive != null ? tonLive : "—"}
                  </TableCell>
                  <TableCell className={excelTd}>
                    <div className="flex items-center justify-center gap-0.5">
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 shrink-0"
                        onClick={() => onQty(l.key, l.quantity - 1)}
                      >
                        <Minus className="w-3 h-3" />
                      </Button>
                      <QtyInput
                        className="w-12 text-center h-7 p-1"
                        value={l.quantity}
                        onValueChange={(v) => onQty(l.key, v)}
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="outline"
                        className="h-7 w-7 shrink-0"
                        onClick={() => onQty(l.key, l.quantity + 1)}
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell
                    className={cn(excelTd, "text-right tabular-nums text-[13px]")}
                  >
                    {Number(l.price) > 0 ? vnd(Number(l.price)) : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums font-semibold bg-amber-50/60",
                    )}
                  >
                    {Number(l.price) > 0
                      ? vnd(Number(l.price) * (Number(l.quantity) || 0))
                      : "—"}
                  </TableCell>
                  <TableCell className={excelTd}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => onRemove(l.key)}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}

export default OrderItemsGrid;
