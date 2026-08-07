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
  resolveAvailableVariants,
  barcodeForUnit,
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
    updateItemUnit,
    addItem,
    removeItem,
    cancelOrder,
    restoreOrder,
    setOrderStatus,
    savePacking,
  } = useWarehouseOrderMutations();
  const { role, username, user } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const actorLabel =
    username ||
    user?.email?.split("@")[0] ||
    "User";
  const { data: catalog } = useCatalogForImport();
  const { data: q7 } = usePackingSourceWarehouse();
  const stockWhId =
    order?.source_warehouse_id || order?.source_warehouse?.id || q7?.id || null;
  const { getQty } = useStock(stockWhId);
  const { toast } = useToast();

  const [packed, setPacked] = useState<Record<string, number>>({});
  /** Draft SL yêu cầu — chỉ ghi DB khi bấm Lưu xác nhận (tab Quản Lý) */
  const [reqDraft, setReqDraft] = useState<Record<string, number>>({});
  /** Draft ĐVT / MV khi đổi trên lưới (optimistic + gửi kèm Lưu soạn) */
  const [unitDraft, setUnitDraft] = useState<
    Record<string, { unit: string; barcode: string }>
  >({});
  const [unitBusyId, setUnitBusyId] = useState<string | null>(null);
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
    // Chỉ xóa draft ĐVT khi server đã khớp — tránh mất barcode vừa sync trước refetch
    setUnitDraft((d) => {
      if (!Object.keys(d).length) return d;
      const next = { ...d };
      for (const it of order.order_items) {
        const draft = next[it.id];
        if (!draft) continue;
        const unitOk =
          normalizeOrderCodeText(draft.unit) ===
          normalizeOrderCodeText(it.unit || "");
        const bcOk =
          normalizeOrderCodeText(draft.barcode) ===
          normalizeOrderCodeText(it.barcode || "");
        if (unitOk && bcOk) delete next[it.id];
      }
      return next;
    });
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
      return false;
    }
    const ma = normalizeOrderCodeText(p.slug);
    const opts = resolveAvailableVariants(
      catalogList as CatalogProductRow[],
      ma,
    );
    const unitOpts =
      opts.length > 0
        ? opts
        : expandProductUnitOptions(p as CatalogProductRow);
    const bcPref = normalizeOrderCodeText(preferredBarcode || scan.trim());
    const match =
      unitOpts.find(
        (o) =>
          bcPref &&
          normalizeOrderCodeText(o.barcode) === bcPref,
      ) ||
      unitOpts[0] ||
      null;

    setNewSlug(ma);
    setNewName(p.name);
    setNewUnit(match?.unit || p.unit || "cái");
    setNewBarcode(match?.barcode || p.barcode || "");
    setNewPrice(match?.price ?? p.price ?? 0);
    setNewQty(1);
    setScan(ma);
    setSuggestOpen(false);
    focusQty();
    return true;
  };

  /** Resolve mã từ ô tìm / catalog khi user chưa bấm dòng gợi ý */
  const resolveAddPayload = () => {
    const q = normalizeOrderCodeText(newSlug) || normalizeOrderCodeText(scan);
    if (!q) return null;

    let slug = normalizeOrderCodeText(newSlug) || q;
    let name = newName.trim();
    let unit = newUnit.trim();
    let barcode = newBarcode.trim();
    let price = newPrice;
    let productId: string | null = null;

    const bySlug = catalogList.find(
      (p) => normalizeOrderCodeText(p.slug) === slug,
    );
    const byScan = catalogList.filter((p) => {
      const bc = normalizeOrderCodeText(p.barcode || "");
      const bc2 = normalizeOrderCodeText(p.barcode_2 || "");
      const s = normalizeOrderCodeText(p.slug);
      return (bc && bc === q) || (bc2 && bc2 === q) || (s && s === q);
    });
    const hit = bySlug || (byScan.length === 1 ? byScan[0] : null);

    if (hit) {
      const block = checkCatalogAddBlocked(hit);
      if (block.blocked) {
        return { error: block as { title: string; description: string } };
      }
      slug = normalizeOrderCodeText(hit.slug);
      name = name || hit.name;
      productId = hit.id;
      if (!unit) {
        const opts = resolveAvailableVariants(
          catalogList as CatalogProductRow[],
          slug,
        );
        const unitOpts =
          opts.length > 0
            ? opts
            : expandProductUnitOptions(hit as CatalogProductRow);
        const bcPref = normalizeOrderCodeText(barcode || scan.trim());
        const match =
          unitOpts.find(
            (o) =>
              bcPref && normalizeOrderCodeText(o.barcode) === bcPref,
          ) ||
          unitOpts[0] ||
          null;
        unit = match?.unit || hit.unit || "cái";
        barcode = match?.barcode || hit.barcode || barcode;
        price = match?.price ?? hit.price ?? price;
      }
    }

    return { slug, name, unit, barcode, price, productId };
  };

  type AddPayload = {
    slug: string;
    name: string;
    unit: string;
    barcode: string;
    price: number;
    productId: string | null;
  };

  const payloadFromHit = (
    p: CatalogHit,
    preferredBarcode?: string,
  ): AddPayload | null => {
    const block = checkCatalogAddBlocked(p);
    if (block.blocked) {
      toast({
        title: block.title,
        description: block.description || undefined,
        variant: "destructive",
      });
      focusScan();
      return null;
    }
    const slug = normalizeOrderCodeText(p.slug);
    const opts = resolveAvailableVariants(
      catalogList as CatalogProductRow[],
      slug,
    );
    const unitOpts =
      opts.length > 0
        ? opts
        : expandProductUnitOptions(p as CatalogProductRow);
    const bcPref = normalizeOrderCodeText(
      preferredBarcode || scan.trim(),
    );
    const match =
      unitOpts.find(
        (o) =>
          bcPref && normalizeOrderCodeText(o.barcode) === bcPref,
      ) ||
      unitOpts[0] ||
      null;
    return {
      slug,
      name: p.name,
      unit: match?.unit || p.unit || "cái",
      barcode: match?.barcode || p.barcode || "",
      price: match?.price ?? p.price ?? 0,
      productId: p.id,
    };
  };

  const handleAdd = async (override?: AddPayload) => {
    const resolved = override ?? resolveAddPayload();
    if (!resolved) {
      toast({
        title: "Chưa chọn mã",
        description: "Tìm và chọn sản phẩm trước khi thêm.",
        variant: "destructive",
      });
      focusScan();
      return;
    }
    if ("error" in resolved && resolved.error) {
      toast({
        title: resolved.error.title,
        description: resolved.error.description || undefined,
        variant: "destructive",
      });
      focusScan();
      return;
    }
    const { slug, name, unit, barcode, price, productId } = resolved as AddPayload;

    if (!name) {
      // Mã ngoài: hiện ô tên
      setNewSlug(slug);
      setNewName("");
      setNewUnit(unit || "cái");
      setNewBarcode(barcode || "");
      setSuggestOpen(false);
      toast({
        title: "Thiếu tên hàng",
        description: `Điền tên cho mã ${slug} (mã ngoài / hàng mới).`,
        variant: "destructive",
      });
      window.setTimeout(() => {
        document
          .querySelector<HTMLInputElement>('input[data-add-name="1"]')
          ?.focus();
      }, 50);
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
          normalizeOrderCodeText(unit),
    );
    if (dup) {
      toast({
        title: "Mã đã có trong đơn",
        description: `${slug} (${unit || "—"}) đã tồn tại — sửa SL trên bảng.`,
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
        barcode: barcode || null,
        unit: unit || null,
        price: price || 0,
        productId,
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
      const payload = payloadFromHit(exact[0], scan.trim());
      if (!payload) return;
      pickProduct(exact[0], scan.trim());
      void handleAdd(payload);
      return;
    }
    if (suggestions.length === 1) {
      const payload = payloadFromHit(suggestions[0], scan.trim());
      if (!payload) return;
      pickProduct(suggestions[0], scan.trim());
      void handleAdd(payload);
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
    // Mã ngoài: điền form để user bổ sung tên / ĐVT / MV rồi thêm
    setNewSlug(q);
    setNewName("");
    setNewUnit("cái");
    setNewBarcode("");
    setNewPrice(0);
    setNewQty(1);
    setSuggestOpen(false);
    toast({
      title: "Mã ngoài — hàng mới",
      description: `${q}: điền Tên hàng rồi Enter / Thêm. Hệ thống sẽ tạo SP (is_new) khi lưu.`,
    });
    window.setTimeout(() => {
      const el = document.querySelector<HTMLInputElement>(
        'input[data-add-name="1"]',
      );
      el?.focus();
    }, 50);
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
  /** pending / processing — cho sửa ĐVT; completed / cancelled khóa cứng */
  const unitEditable = !locked;

  const lineUnit = (it: { id: string; unit?: string | null }) =>
    unitDraft[it.id]?.unit ?? it.unit ?? "";
  const lineBarcode = (it: { id: string; barcode?: string | null }) =>
    unitDraft[it.id]?.barcode ?? it.barcode ?? "";

  const onLineUnitChange = async (
    it: {
      id: string;
      product_slug: string | null;
      unit?: string | null;
      barcode?: string | null;
    },
    nextUnit: string,
  ) => {
    const opts = getSkuUnitOptions(skuUnitIndex, it.product_slug || "");
    const match = resolveUnitOption(opts, nextUnit);
    const newUnit = match?.unit || nextUnit.trim();
    // BẮT BUỘC sync barcode theo ĐVT (kể cả rỗng — xóa MV cũ)
    const newBarcode = match
      ? String(match.barcode ?? "").trim()
      : barcodeForUnit(opts, newUnit);
    const oldUnit = String(it.unit || "").trim() || "—";
    if (
      normalizeOrderCodeText(oldUnit) === normalizeOrderCodeText(newUnit) &&
      normalizeOrderCodeText(newBarcode) ===
        normalizeOrderCodeText(it.barcode || "")
    ) {
      return;
    }

    setUnitDraft((d) => ({
      ...d,
      [it.id]: { unit: newUnit, barcode: newBarcode },
    }));

    const sku = normalizeOrderCodeText(it.product_slug || "") || "—";
    const auditNote = `Hệ thống: ${actorLabel} đã đổi ĐVT của mã ${sku} từ '${oldUnit}' sang '${newUnit}'`;

    setUnitBusyId(it.id);
    try {
      await updateItemUnit.mutateAsync({
        itemId: it.id,
        unit: newUnit,
        barcode: newBarcode || null,
        auditNote,
      });
      toast({
        title: "Đã đổi ĐVT",
        description: `${sku}: ${oldUnit} → ${newUnit}${newBarcode ? ` · MV ${newBarcode}` : ""}`,
      });
    } catch (e) {
      setUnitDraft((d) => {
        const next = { ...d };
        delete next[it.id];
        return next;
      });
      toast({
        title: "Không đổi được ĐVT",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setUnitBusyId(null);
    }
  };

  const handleSavePack = async () => {
    try {
      await savePacking.mutateAsync({
        orderId: order.id,
        lines: order.order_items.map((it) => ({
          itemId: it.id,
          qtyPacked: packed[it.id] ?? it.qty_requested ?? it.quantity,
          unit: lineUnit(it) || it.unit || null,
          barcode: lineBarcode(it) || it.barcode || null,
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
        <div className="border rounded-lg p-3 space-y-2 bg-card relative sticky top-0 z-50 shadow-sm overflow-visible">
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
                    disabled={addUnitOptions.length === 1}
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

            {newSlug && addUnitOptions.length === 0 ? (
              <>
                <div className="space-y-1 min-w-[160px] flex-1">
                  <Label className="text-xs">Tên hàng *</Label>
                  <Input
                    data-add-name="1"
                    className="h-10"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Tên hàng mới"
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      void handleAdd();
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mã vạch</Label>
                  <Input
                    className="w-36 h-10 font-mono text-xs"
                    value={newBarcode}
                    onChange={(e) => setNewBarcode(e.target.value)}
                    placeholder="Mã vạch"
                  />
                </div>
              </>
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
              <TableHead className={cn(excelTh, "w-28")}>ĐVT</TableHead>
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
              const displayUnit = lineUnit(it);
              const displayBarcode = lineBarcode(it);
              const unitOpts = getSkuUnitOptions(
                skuUnitIndex,
                it.product_slug || "",
              );
              const ton =
                getQty(it.product_slug, displayUnit) ??
                getQty(displayBarcode, displayUnit) ??
                getQty(it.product_name, displayUnit);
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
                    {displayBarcode || "—"}
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
                    {!unitEditable ? (
                      <span>{displayUnit || "—"}</span>
                    ) : unitOpts.length > 0 ? (
                      <Select
                        value={
                          resolveUnitOption(unitOpts, displayUnit)?.unit ||
                          unitOpts[0]?.unit ||
                          displayUnit
                        }
                        onValueChange={(v) => void onLineUnitChange(it, v)}
                        disabled={
                          unitOpts.length === 1 || unitBusyId === it.id
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            "h-7 text-xs min-w-[5.5rem]",
                            unitOpts.length === 1 && "opacity-80",
                          )}
                        >
                          <SelectValue placeholder="ĐVT" />
                        </SelectTrigger>
                        <SelectContent>
                          {unitOpts.map((u) => (
                            <SelectItem key={u.unit} value={u.unit}>
                              {u.unit}
                              {u.barcode ? ` · ${u.barcode}` : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        className="h-7 text-xs p-1 min-w-[4.5rem]"
                        value={displayUnit}
                        disabled={unitBusyId === it.id}
                        onChange={(e) =>
                          setUnitDraft((d) => ({
                            ...d,
                            [it.id]: {
                              unit: e.target.value,
                              barcode: displayBarcode,
                            },
                          }))
                        }
                        onBlur={() => {
                          const draft = unitDraft[it.id];
                          if (
                            !draft ||
                            normalizeOrderCodeText(draft.unit) ===
                              normalizeOrderCodeText(it.unit || "")
                          ) {
                            return;
                          }
                          void onLineUnitChange(it, draft.unit);
                        }}
                        placeholder="ĐVT"
                      />
                    )}
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
