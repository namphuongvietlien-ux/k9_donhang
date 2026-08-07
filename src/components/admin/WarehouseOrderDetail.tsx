import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  FileSpreadsheet,
  Loader2,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
} from "lucide-react";
import {
  useWarehouseOrder,
  useWarehouseOrderMutations,
} from "@/hooks/useWarehouseOrders";
import { useCatalogForImport } from "@/hooks/useCatalogStockImport";
import {
  usePackingSourceWarehouse,
  useStock,
} from "@/hooks/useStock";
import { useAuth } from "@/contexts/AuthContext";
import {
  ORDER_KIND_LABELS,
  WAREHOUSE_STATUS_BADGE,
  WAREHOUSE_STATUS_LABELS,
} from "@/lib/warehouseOrders";
import {
  exportOrderExcel,
  openOrderPdfWindow,
  printOrderViaIframe,
  warehouseOrderToPrintDetail,
} from "@/lib/orderPrint";
import {
  hasLoiNote,
  qtyMismatchKind,
  QTY_MISMATCH_HINT,
  QTY_MISMATCH_ROW,
} from "@/lib/productFlags";
import {
  buildSkuUnitIndex,
  expandProductUnitOptions,
  getSkuUnitOptions,
  resolveUnitOption,
  type CatalogProductRow,
} from "@/lib/catalogUnitBarcode";
import { filterCatalogSuggestions } from "@/lib/catalogSearch";
import { checkCatalogAddBlocked } from "@/lib/catalogAddGuards";
import {
  CatalogSuggestItem,
  CatalogSuggestList,
} from "@/components/admin/CatalogSuggestDropdown";
import {
  getPackingSaveBanner,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import { notifyWarehouseEvent } from "@/lib/telegramNotify";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import ProductFlagBadges from "@/components/admin/ProductFlagBadges";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import QtyInput, {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";

type CatalogHit = {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  barcode_2?: string | null;
  unit: string | null;
  unit_2?: string | null;
  price?: number;
  parent_sku?: string | null;
  is_new?: boolean;
  is_locked?: boolean;
  is_out_stock?: boolean;
};

interface WarehouseOrderDetailProps {
  orderId: string;
  onClose?: () => void;
  /**
   * manage = Quản Lý (thêm mã, sửa SL yêu cầu) — không hiện Lưu soạn hàng
   * packing = Soạn Hàng (chỉnh SL soạn + Lưu soạn hàng)
   */
  variant?: "manage" | "packing";
}

export default function WarehouseOrderDetail({
  orderId,
  onClose,
  variant = "manage",
}: WarehouseOrderDetailProps) {
  const { data: order, isLoading } = useWarehouseOrder(orderId);
  const {
    updateItemQty,
    addItem,
    removeItem,
    cancelOrder,
    restoreOrder,
    setOrderStatus,
    savePacking,
  } = useWarehouseOrderMutations();
  const { role } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const { data: catalog } = useCatalogForImport();
  const { data: q7 } = usePackingSourceWarehouse();
  const stockWhId =
    order?.source_warehouse_id || order?.source_warehouse?.id || q7?.id || null;
  const { getQty } = useStock(stockWhId);
  const { toast } = useToast();

  const [packed, setPacked] = useState<Record<string, number>>({});
  /** Draft SL yêu cầu — chỉ ghi DB khi bấm Lưu xác nhận (tab Quản Lý) */
  const [reqDraft, setReqDraft] = useState<Record<string, number>>({});
  const [savingConfirm, setSavingConfirm] = useState(false);
  const [scan, setScan] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newBarcode, setNewBarcode] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [newQty, setNewQty] = useState(1);
  const [newPrice, setNewPrice] = useState(0);
  const scanRef = useRef<HTMLInputElement>(null);
  const qtyRef = useRef<HTMLInputElement>(null);

  const catalogList = useMemo((): CatalogHit[] => {
    const rows = (catalog?.products || []) as Array<
      CatalogProductRow & {
        parent_sku?: string | null;
        is_new?: boolean;
        is_locked?: boolean;
        is_out_stock?: boolean;
        barcode_2?: string | null;
        unit_2?: string | null;
        price?: number | null;
      }
    >;
    return rows
      .filter((p) => p.slug)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug!,
        barcode: p.barcode || null,
        barcode_2: p.barcode_2 || null,
        unit: p.unit,
        unit_2: p.unit_2 || null,
        price: Number(p.price) || 0,
        parent_sku: p.parent_sku || null,
        is_new: !!p.is_new,
        is_locked: !!p.is_locked,
        is_out_stock: !!p.is_out_stock,
      }));
  }, [catalog]);

  const skuUnitIndex = useMemo(
    () => buildSkuUnitIndex(catalogList as CatalogProductRow[]),
    [catalogList],
  );

  const suggestions = useMemo(
    () => filterCatalogSuggestions(catalogList, scan, 12),
    [scan, catalogList],
  );

  const addUnitOptions = useMemo(
    () => getSkuUnitOptions(skuUnitIndex, newSlug),
    [skuUnitIndex, newSlug],
  );

  useEffect(() => {
    if (!order) return;
    const initPack: Record<string, number> = {};
    const initReq: Record<string, number> = {};
    for (const it of order.order_items) {
      initPack[it.id] = it.qty_packed ?? it.qty_requested ?? it.quantity;
      initReq[it.id] = it.qty_requested ?? it.quantity;
    }
    setPacked(initPack);
    setReqDraft(initReq);
  }, [order]);

  const clearAddForm = () => {
    setScan("");
    setSuggestOpen(false);
    setNewName("");
    setNewSlug("");
    setNewBarcode("");
    setNewUnit("");
    setNewQty(1);
    setNewPrice(0);
  };

  const focusQty = () => {
    requestAnimationFrame(() => {
      qtyRef.current?.focus();
      qtyRef.current?.select();
    });
  };

  const focusScan = () => {
    requestAnimationFrame(() => {
      scanRef.current?.focus();
      scanRef.current?.select();
    });
  };

  const pickProduct = (p: CatalogHit, preferredBarcode?: string) => {
    const block = checkCatalogAddBlocked(p);
    if (block.blocked) {
      toast({
        title: block.title,
        description: block.description || undefined,
        variant: "destructive",
      });
      focusScan();
      return;
    }
    const ma = normalizeOrderCodeText(p.slug);
    const unitOpts = getSkuUnitOptions(skuUnitIndex, ma);
    const opts =
      unitOpts.length > 0
        ? unitOpts
        : expandProductUnitOptions(p as CatalogProductRow);
    const bcPref = normalizeOrderCodeText(preferredBarcode || scan.trim());
    const match =
      opts.find(
        (o) =>
          bcPref &&
          normalizeOrderCodeText(o.barcode) === bcPref,
      ) ||
      opts[0] ||
      null;

    setNewSlug(ma);
    setNewName(p.name);
    setNewUnit(match?.unit || p.unit || "Cái");
    setNewBarcode(match?.barcode || p.barcode || "");
    setNewPrice(match?.price ?? p.price ?? 0);
    setNewQty(1);
    setScan(ma);
    setSuggestOpen(false);
    focusQty();
  };

  const handleAdd = async () => {
    const slug = normalizeOrderCodeText(newSlug) || normalizeOrderCodeText(scan);
    const name = newName.trim() || slug;
    if (!slug && !name) {
      toast({
        title: "Chưa chọn mã",
        description: "Tìm và chọn sản phẩm trước khi thêm.",
        variant: "destructive",
      });
      focusScan();
      return;
    }
    const catalogHit = catalogList.find(
      (p) => normalizeOrderCodeText(p.slug) === slug,
    );
    const block = checkCatalogAddBlocked(catalogHit);
    if (block.blocked) {
      toast({
        title: block.title,
        description: block.description || undefined,
        variant: "destructive",
      });
      focusScan();
      return;
    }
    const qty = Math.max(1, Number(newQty) || 1);
    const dup = order?.order_items.some(
      (it) =>
        normalizeOrderCodeText(it.product_slug || "") === slug &&
        normalizeOrderCodeText(it.unit || "") ===
          normalizeOrderCodeText(newUnit),
    );
    if (dup) {
      toast({
        title: "Mã đã có trong đơn",
        description: `${slug} (${newUnit || "—"}) đã tồn tại — sửa SL trên bảng.`,
        variant: "destructive",
      });
      focusScan();
      return;
    }
    try {
      await addItem.mutateAsync({
        orderId: order!.id,
        productName: name,
        productSlug: slug || name,
        quantity: qty,
        barcode: newBarcode.trim() || null,
        unit: newUnit.trim() || null,
        price: newPrice || 0,
      });
      clearAddForm();
      toast({ title: `Đã thêm ${slug || name} × ${qty}` });
      focusScan();
    } catch (e) {
      toast({
        title: "Lỗi thêm dòng",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const onScanKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = normalizeOrderCodeText(scan.trim());
    if (!q) return;

    // Đã chọn mã (ô tìm = mã hàng) → Enter = xác nhận thêm
    if (
      newSlug &&
      normalizeOrderCodeText(newSlug) === q &&
      !suggestOpen
    ) {
      void handleAdd();
      return;
    }

    const exact = catalogList.filter((p) => {
      const bc = normalizeOrderCodeText(p.barcode || "");
      const bc2 = normalizeOrderCodeText(p.barcode_2 || "");
      const slug = normalizeOrderCodeText(p.slug);
      return (bc && bc === q) || (bc2 && bc2 === q) || (slug && slug === q);
    });
    if (exact.length === 1) {
      pickProduct(exact[0], scan.trim());
      return;
    }
    if (suggestions.length === 1) {
      pickProduct(suggestions[0], scan.trim());
      return;
    }
    if (suggestions.length > 1) {
      setSuggestOpen(true);
      toast({
        title: "Chọn sản phẩm",
        description: "Có nhiều kết quả — bấm một dòng gợi ý.",
      });
      return;
    }
    toast({
      title: "Không tìm thấy mã",
      description: scan.trim(),
      variant: "destructive",
    });
  };

  const onAddUnitChange = (dvt: string) => {
    setNewUnit(dvt);
    const match = resolveUnitOption(addUnitOptions, dvt);
    if (match) {
      // Bắt buộc sync MV theo ĐVT — giữ nguyên mã hàng + tên
      setNewBarcode(match.barcode);
      if (match.price > 0) setNewPrice(match.price);
    }
  };

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Đang tải phiếu…
      </div>
    );
  }

  const locked = order.status === "completed" || order.status === "cancelled";

  const handleSavePack = async () => {
    try {
      await savePacking.mutateAsync({
        orderId: order.id,
        lines: order.order_items.map((it) => ({
          itemId: it.id,
          qtyPacked: packed[it.id] ?? it.qty_requested ?? it.quantity,
        })),
      });
      toast({ title: "Đã lưu soạn hàng", description: order.order_code || "" });
    } catch (e) {
      toast({
        title: "Lỗi soạn hàng",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  /** GAS ql_luuSua — xác nhận lưu sửa SL yêu cầu trên Quản Lý */
  const handleSaveConfirm = async () => {
    const changes = order.order_items.filter((it) => {
      const cur = it.qty_requested ?? it.quantity;
      const draft = reqDraft[it.id];
      return draft != null && Number(draft) !== Number(cur);
    });

    const tip = getPackingSaveBanner(new Date());
    const msg =
      `Xác nhận lưu sửa đơn ${order.order_code}?` +
      (changes.length ? `\n(${changes.length} dòng đổi SL yêu cầu)` : "") +
      `\n\n${tip.title}\n${tip.body}`;
    if (!confirm(msg)) return;

    setSavingConfirm(true);
    try {
      for (const it of changes) {
        await updateItemQty.mutateAsync({
          itemId: it.id,
          qtyRequested: Math.max(0, Number(reqDraft[it.id]) || 0),
        });
      }
      void notifyWarehouseEvent({
        event: "order_changed",
        soPhieu: order.order_code || order.id,
        khoXuat: warehouseShortLabel(order.source_warehouse),
        khoNhan: warehouseShortLabel(order.warehouse),
        extra: changes.length
          ? `Đã lưu xác nhận · ${changes.length} dòng SL`
          : "Đã lưu xác nhận (không đổi SL)",
      });
      toast({
        title: "Đã lưu xác nhận",
        description: changes.length
          ? `Cập nhật ${changes.length} dòng · ${tip.title}`
          : `Không có đổi SL · ${tip.title}`,
      });
    } catch (e) {
      toast({
        title: "Lỗi lưu xác nhận",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setSavingConfirm(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm(`Hủy phiếu ${order.order_code}?`)) return;
    try {
      await cancelOrder.mutateAsync(order.id);
      toast({ title: "Đã hủy phiếu" });
      onClose?.();
    } catch (e) {
      toast({
        title: "Không hủy được",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async () => {
    if (!confirm(`Khôi phục phiếu ${order.order_code}?`)) return;
    try {
      await restoreOrder.mutateAsync(order.id);
      toast({ title: "Đã khôi phục phiếu" });
    } catch (e) {
      toast({
        title: "Không khôi phục được",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold font-mono">{order.order_code}</h2>
            <Badge variant="secondary">
              {ORDER_KIND_LABELS[order.order_kind]}
            </Badge>
            <Badge
              className={cn(
                "font-normal",
                WAREHOUSE_STATUS_BADGE[order.status] || "",
              )}
            >
              {WAREHOUSE_STATUS_LABELS[order.status] || order.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {warehouseShortLabel(order.source_warehouse)} →{" "}
            {warehouseShortLabel(order.warehouse)}
          </p>
          <p className="text-sm font-semibold text-blue-700 mt-0.5">
            Ngày tạo:{" "}
            {format(new Date(order.created_at), "HH:mm dd/MM/yyyy", {
              locale: vi,
            })}
            {order.updated_at ? (
              <>
                {" "}
                · Cập nhật:{" "}
                {format(new Date(order.updated_at), "HH:mm dd/MM/yyyy", {
                  locale: vi,
                })}
              </>
            ) : null}
          </p>
          {order.customer_name && (
            <p className="text-sm mt-0.5">{order.customer_name}</p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const d = warehouseOrderToPrintDetail({
                ...order,
                order_items: order.order_items.map((it) => ({
                  ...it,
                  qty_packed:
                    packed[it.id] ??
                    it.qty_packed ??
                    it.qty_requested ??
                    it.quantity,
                })),
              });
              openOrderPdfWindow(d);
            }}
          >
            <Printer className="w-4 h-4 mr-1" />
            Xem / In PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = warehouseOrderToPrintDetail({
                ...order,
                order_items: order.order_items.map((it) => ({
                  ...it,
                  qty_packed:
                    packed[it.id] ??
                    it.qty_packed ??
                    it.qty_requested ??
                    it.quantity,
                })),
              });
              printOrderViaIframe(d);
            }}
          >
            In nhanh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = warehouseOrderToPrintDetail({
                ...order,
                order_items: order.order_items.map((it) => ({
                  ...it,
                  qty_packed:
                    packed[it.id] ??
                    it.qty_packed ??
                    it.qty_requested ??
                    it.quantity,
                })),
              });
              exportOrderExcel(d);
              toast({ title: "Đã tải file Excel" });
            }}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Xuất Excel
          </Button>
          {isAdmin && (
            <Select
              value={order.status}
              onValueChange={(v) => {
                if (!confirm(`Đổi trạng thái ${order.order_code} → ${v}?`)) return;
                void setOrderStatus
                  .mutateAsync({ orderId: order.id, status: v })
                  .then(() => toast({ title: `Đã đổi TT → ${v}` }))
                  .catch((e) =>
                    toast({
                      title: "Không đổi được TT",
                      description: e instanceof Error ? e.message : "Lỗi",
                      variant: "destructive",
                    }),
                  );
              }}
            >
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue placeholder="Trạng thái" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Mới</SelectItem>
                <SelectItem value="processing">Đã soạn</SelectItem>
                <SelectItem value="completed">Đã nhận</SelectItem>
                <SelectItem value="cancelled">Đã hủy</SelectItem>
              </SelectContent>
            </Select>
          )}
          {!locked && variant === "manage" && (
            <Button
              className="bg-sky-600 hover:bg-sky-700 text-white"
              onClick={() => void handleSaveConfirm()}
              disabled={savingConfirm || updateItemQty.isPending}
            >
              {savingConfirm || updateItemQty.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1" />
              )}
              Lưu xác nhận
            </Button>
          )}
          {!locked && variant === "packing" && (
            <Button
              variant="outline"
              onClick={() => void handleSavePack()}
              disabled={savePacking.isPending}
            >
              {savePacking.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Lưu soạn hàng
            </Button>
          )}
          {!locked && isAdmin && (
            <Button variant="destructive" onClick={() => void handleCancel()}>
              Hủy phiếu
            </Button>
          )}
          {isAdmin && order.status === "cancelled" && (
            <Button
              variant="secondary"
              onClick={() => void handleRestore()}
              disabled={restoreOrder.isPending}
            >
              {restoreOrder.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4 mr-1" />
              )}
              Khôi phục
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" onClick={onClose}>
              Đóng
            </Button>
          )}
        </div>
      </div>

      {!locked && (
        <div className="border rounded-lg p-3 space-y-2 bg-card relative sticky top-0 z-30 shadow-sm">
          <p className="text-xs text-muted-foreground">
            Enter thêm mã → lưu ngay. Sửa <strong>SL yêu cầu</strong> rồi bấm{" "}
            <strong>Lưu xác nhận</strong>. Soạn hàng (SL soạn) làm ở tab{" "}
            <strong>Soạn Hàng</strong>.
          </p>
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px] space-y-1 relative">
              <Label className="text-xs">
                Quét mã vạch / gõ mã / tên sản phẩm
              </Label>
              <Input
                ref={scanRef}
                value={scan}
                onChange={(e) => {
                  setScan(e.target.value);
                  setSuggestOpen(true);
                  if (
                    newSlug &&
                    normalizeOrderCodeText(e.target.value) !==
                      normalizeOrderCodeText(newSlug)
                  ) {
                    setNewSlug("");
                    setNewName("");
                    setNewBarcode("");
                    setNewUnit("");
                  }
                }}
                onKeyDown={onScanKeyDown}
                onFocus={() => {
                  if (scan.trim()) setSuggestOpen(true);
                }}
                placeholder="Quét mã vạch, gõ mã hàng hoặc tên…"
                className="h-10 text-sm font-semibold border-2 border-primary"
                autoComplete="off"
              />
              {suggestOpen && scan.trim() && (
                <CatalogSuggestList>
                  {suggestions.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      Không tìm thấy sản phẩm phù hợp.
                    </div>
                  ) : (
                    suggestions.map((p) => {
                      const ton =
                        getQty(p.slug, p.unit) ??
                        getQty(p.barcode || "", p.unit) ??
                        getQty(p.barcode_2 || "", p.unit_2);
                      return (
                        <CatalogSuggestItem
                          key={p.id}
                          product={p}
                          extraMeta={
                            <>
                              {" "}
                              · Tồn: {ton != null ? ton : "—"}
                            </>
                          }
                          onSelect={() => pickProduct(p)}
                        />
                      );
                    })
                  )}
                </CatalogSuggestList>
              )}
            </div>

            {newSlug ? (
              <div className="space-y-1">
                <Label className="text-xs">ĐVT</Label>
                {addUnitOptions.length > 0 ? (
                  <Select
                    value={
                      resolveUnitOption(addUnitOptions, newUnit)?.unit ||
                      addUnitOptions[0]?.unit ||
                      newUnit
                    }
                    onValueChange={onAddUnitChange}
                  >
                    <SelectTrigger className="w-28 h-10">
                      <SelectValue placeholder="ĐVT" />
                    </SelectTrigger>
                    <SelectContent>
                      {addUnitOptions.map((u) => (
                        <SelectItem key={u.unit} value={u.unit}>
                          {u.unit}
                          {u.barcode ? ` · ${u.barcode}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    className="w-24 h-10"
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="ĐVT"
                  />
                )}
              </div>
            ) : null}

            <div className="space-y-1">
              <Label className="text-xs">Số lượng</Label>
              <QtyInput
                ref={qtyRef}
                className="w-24 h-10 text-base font-bold border-2 border-sky-400"
                compact={false}
                value={newQty}
                onValueChange={(v) => setNewQty(Math.max(1, v))}
                min={1}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  void handleAdd();
                }}
              />
            </div>

            <Button
              className="h-10"
              disabled={addItem.isPending || (!newSlug && !scan.trim())}
              onClick={() => void handleAdd()}
            >
              {addItem.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-1" />
              )}
              Thêm mã
            </Button>
          </div>

          {newSlug ? (
            <div className="text-xs text-slate-600 font-mono">
              Đã chọn:{" "}
              <strong className="uppercase text-foreground">{newSlug}</strong>
              {newName ? ` — ${newName}` : ""}
              {newBarcode ? ` · MV: ${newBarcode}` : ""}
              {" · Enter ở SL để xác nhận"}
            </div>
          ) : null}
        </div>
      )}

      <div className={excelTableWrap}>
        <Table stickyHeader>
          <TableHeader>
            <TableRow>
              <TableHead className={cn(excelTh, "w-10 text-center")}>
                STT
              </TableHead>
              <TableHead className={cn(excelTh, "text-left")}>Mã hàng</TableHead>
              <TableHead className={cn(excelTh, "text-left")}>Mã vạch</TableHead>
              <TableHead className={cn(excelTh, "text-left")}>Tên hàng</TableHead>
              <TableHead className={cn(excelTh, "w-16")}>ĐVT</TableHead>
              <TableHead className={cn(excelTh, "text-right bg-emerald-100")}>
                Tồn
              </TableHead>
              <TableHead className={cn(excelTh, "text-right bg-sky-100")}>
                SL yêu cầu
              </TableHead>
              <TableHead className={cn(excelTh, "text-right bg-amber-100")}>
                SL soạn
              </TableHead>
              <TableHead className={cn(excelTh, "text-right bg-emerald-100")}>
                SL nhận
              </TableHead>
              {!locked && <TableHead className={cn(excelTh, "w-10")} />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {order.order_items.map((it, idx) => {
              const soft = it.line_notes || "";
              const loi = hasLoiNote(soft) || hasLoiNote(order.notes);
              const req = it.qty_requested ?? it.quantity;
              const packedVal = packed[it.id] ?? it.qty_packed ?? null;
              const mismatch = qtyMismatchKind(req, packedVal);
              const ton =
                getQty(it.product_slug, it.unit) ??
                getQty(it.barcode, it.unit) ??
                getQty(it.product_name, it.unit);
              return (
                <TableRow
                  key={it.id}
                  className={cn(
                    excelTr,
                    mismatch && QTY_MISMATCH_ROW[mismatch],
                    !mismatch && soft && "bg-amber-50/70",
                    it.is_out_stock && "opacity-60",
                    it.is_locked && "opacity-75",
                  )}
                >
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-center text-muted-foreground tabular-nums",
                    )}
                  >
                    {idx + 1}
                  </TableCell>
                  <TableCell className={excelTd}>
                    <ProductFlagBadges
                      showSlug
                      slug={it.product_slug}
                      is_new={it.is_new}
                      is_out_stock={it.is_out_stock}
                      is_locked={it.is_locked}
                    />
                    {mismatch ? (
                      <div
                        className={cn(
                          "text-[10px] mt-0.5 font-semibold flex items-center gap-1",
                          mismatch === "short"
                            ? "text-red-700"
                            : "text-amber-700",
                        )}
                      >
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        {QTY_MISMATCH_HINT[mismatch]}
                      </div>
                    ) : null}
                    {soft ? (
                      <div
                        className={cn(
                          "text-[10px] mt-0.5 flex items-start gap-1",
                          loi ? "text-red-700 font-bold" : "text-amber-800",
                        )}
                      >
                        {loi ? (
                          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        ) : null}
                        {soft}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className={cn(excelTd, "font-mono text-xs")}>
                    {it.barcode || "—"}
                  </TableCell>
                  <TableCell className={excelTd}>
                    <div
                      className={cn(
                        "text-xs",
                        it.is_out_stock && "text-slate-500 line-through",
                        mismatch === "short" && "text-red-800 font-medium",
                        mismatch === "over" && "text-amber-800 font-medium",
                      )}
                    >
                      {it.product_name}
                    </div>
                  </TableCell>
                  <TableCell className={cn(excelTd, "font-medium text-xs")}>
                    {it.unit || "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums bg-emerald-50/50 font-semibold",
                      ton != null && ton < req && "text-red-700",
                    )}
                  >
                    {ton != null ? ton : "—"}
                  </TableCell>
                  <TableCell className={cn(excelTd, "text-right bg-sky-50/40")}>
                    {locked || variant === "packing" ? (
                      <span className="tabular-nums text-sm">
                        {reqDraft[it.id] ?? req}
                      </span>
                    ) : (
                      <QtyInput
                        className="w-16 ml-auto"
                        value={reqDraft[it.id] ?? req}
                        onValueChange={(v) =>
                          setReqDraft((d) => ({
                            ...d,
                            [it.id]: Math.max(0, v),
                          }))
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell className={cn(excelTd, "text-right bg-amber-50/40")}>
                    {locked || variant === "manage" ? (
                      <span className="tabular-nums text-sm">
                        {it.qty_packed ?? "—"}
                      </span>
                    ) : (
                      <QtyInput
                        className={cn(
                          "w-16 ml-auto",
                          mismatch === "short" && "border-red-400 text-red-800",
                          mismatch === "over" &&
                            "border-amber-400 text-amber-900",
                        )}
                        value={packed[it.id] ?? 0}
                        onValueChange={(v) =>
                          setPacked((p) => ({ ...p, [it.id]: v }))
                        }
                      />
                    )}
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums bg-emerald-50/40 text-sm",
                    )}
                  >
                    {it.qty_received ?? "—"}
                  </TableCell>
                  {!locked && (
                    <TableCell className={excelTd}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          void removeItem
                            .mutateAsync(it.id)
                            .then(() => toast({ title: "Đã xóa dòng" }))
                            .catch((err) =>
                              toast({
                                title: "Lỗi",
                                description:
                                  err instanceof Error ? err.message : "Lỗi",
                                variant: "destructive",
                              }),
                            )
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
