import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Lock,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  useWarehouseOrder,
  useWarehouseOrderMutations,
} from "@/hooks/useWarehouseOrders";
import { useProducts } from "@/hooks/useProducts";
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
  isQtyMultipleOfMoq,
  nearestMoqCeiling,
  resolveUnitOption,
  resolveAvailableVariants,
  resolveLineMoq,
  resolveLineMoqFromOptions,
  barcodeForUnit,
  type CatalogProductRow,
} from "@/lib/catalogUnitBarcode";
import {
  exportKiotVietTransferFile,
  exportKiotVietTransferFromTemplate,
  KIOTVIET_Q7_WAREHOUSE,
  type TransferExportLine,
} from "@/lib/transferExportTemplate";
import { filterCatalogSuggestions, resolveCatalogScan } from "@/lib/catalogSearch";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  TableFooter,
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

const vnd = (n: number) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("vi-VN", {
    maximumFractionDigits: 0,
  });

/** Ô dòng Tổng cộng — ghim đáy bảng như excelTh ghim đỉnh */
const excelTf =
  "sticky bottom-0 z-20 border border-gray-300 bg-slate-100 p-1 px-1.5 text-[13px] h-9 whitespace-nowrap shadow-[0_-1px_0_#cbd5e1]";

type CatalogHit = {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  barcode_2?: string | null;
  unit: string | null;
  unit_2?: string | null;
  price?: number;
  /** Giá riêng của ĐVT lớn (unit_2) — không suy ra từ price × tỷ lệ */
  price_2?: number | null;
  /** 1 unit_2 = unit_2_ratio × unit */
  unit_2_ratio?: number | null;
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
  const { data: order, isLoading, refetch } = useWarehouseOrder(orderId);
  const {
    updateItemQty,
    updateItemUnit,
    addItem,
    removeItem,
    cancelOrder,
    restoreOrder,
    setOrderStatus,
    setOrderLock,
    emergencyUnlockOrder,
    savePacking,
  } = useWarehouseOrderMutations();
  const { role, username, user } = useAuth();
  const isAdmin = role === "super_admin" || role === "manager";
  const canEmergencyUnlock = role === "super_admin";
  const actorLabel =
    username ||
    user?.email?.split("@")[0] ||
    "User";
  const { products: sharedProducts = [] } = useProducts();
  const { data: q7 } = usePackingSourceWarehouse();
  const stockWhId =
    order?.source_warehouse_id || order?.source_warehouse?.id || q7?.id || null;
  const {
    getQty,
    getVerifiedQty,
    loading: stockLoading,
    refetch: refetchStock,
  } = useStock(stockWhId);
  const { toast } = useToast();

  const [packed, setPacked] = useState<Record<string, number>>({});
  /** Draft SL yêu cầu — chỉ ghi DB khi bấm Lưu xác nhận (tab Quản Lý) */
  const [reqDraft, setReqDraft] = useState<Record<string, number>>({});
  /** Draft ĐVT / MV / đơn giá khi đổi trên lưới (optimistic + gửi kèm Lưu soạn) */
  const [unitDraft, setUnitDraft] = useState<
    Record<string, { unit: string; barcode: string; price?: number }>
  >({});
  /** Chế độ xem chi tiết giá — hiện cột Đơn giá / Thành tiền */
  const [showPrice, setShowPrice] = useState(false);
  /** Xác nhận lưu soạn khi có dòng lệch MOQ */
  const [moqConfirmOpen, setMoqConfirmOpen] = useState(false);
  const [moqViolations, setMoqViolations] = useState<
    {
      itemId: string;
      slug: string;
      name: string;
      qty: number;
      moq: number;
      suggest: number;
    }[]
  >([]);
  /**
   * Mở khóa nhập SL lẻ / dưới MOQ — dùng chung tab Quản Lý + Soạn Hàng
   * (cùng UX form tạo đơn).
   */
  const [allowPartial, setAllowPartial] = useState(false);
  const [exportingTransfer, setExportingTransfer] = useState(false);
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
    const rows = Array.isArray(sharedProducts) ? sharedProducts : [];
    return rows
      .filter((p) => p.is_active !== false && p.slug)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug!,
        barcode: p.barcode || null,
        barcode_2: p.barcode_2 || null,
        unit: p.unit,
        unit_2: p.unit_2 || null,
        price: Number(p.price) || 0,
        price_2: Number(p.price_2) || null,
        unit_2_ratio: Number(p.unit_2_ratio) || null,
        parent_sku: p.parent_sku || null,
        is_new: !!p.is_new,
        is_locked: !!p.is_locked,
        is_out_stock: !!p.is_out_stock,
      }));
  }, [sharedProducts]);

  const skuUnitIndex = useMemo(
    () => buildSkuUnitIndex(catalogList as CatalogProductRow[]),
    [catalogList],
  );

  const productOfSlug = (slug: string | null | undefined) => {
    const key = normalizeOrderCodeText(slug || "");
    return catalogList.find((p) => normalizeOrderCodeText(p.slug) === key);
  };

  /** unit_2_ratio từ catalog — luôn dùng để HIỂN THỊ cột MOQ */
  const catalogMoqOf = (slug: string | null | undefined) => {
    const product = productOfSlug(slug);
    const ratio = Number(product?.unit_2_ratio);
    if (Number.isFinite(ratio) && ratio > 1) return ratio;
    const opts = getSkuUnitOptions(skuUnitIndex, slug || "");
    const maxRatio = Math.max(
      ...opts.map((o) => Number(o.ratio) || 1),
      1,
    );
    return maxRatio > 1 ? maxRatio : 0;
  };

  /**
   * MOQ hiệu lực theo ĐVT dòng: ĐVT cơ sở → unit_2_ratio; ĐVT lớn → 1.
   * Ưu tiên products.unit_2_ratio (không phụ thuộc có khai báo unit_2).
   */
  const moqOf = (
    slug: string | null | undefined,
    unit: string | null | undefined,
  ) => {
    const product = productOfSlug(slug);
    if (product && Number(product.unit_2_ratio) > 1) {
      return resolveLineMoq(product, unit);
    }
    return resolveLineMoqFromOptions(
      getSkuUnitOptions(skuUnitIndex, slug || ""),
      unit,
    );
  };

  // Mã vạch chỉ khớp exact/prefix — quy tắc nằm trong filterCatalogSuggestions.
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

    setPacked((prev) => {
      const next: Record<string, number> = {};
      for (const it of order.order_items) {
        const serverValue = it.qty_packed ?? it.qty_requested ?? it.quantity;
        const currentValue = prev[it.id];
        const resolvedValue =
          currentValue != null && Number.isFinite(Number(currentValue))
            ? Number(currentValue)
            : serverValue;
        next[it.id] = Number.isFinite(Number(resolvedValue))
          ? Math.max(0, Number(resolvedValue))
          : Number(serverValue ?? 0);
      }
      return next;
    });

    setReqDraft((prev) => {
      const next: Record<string, number> = {};
      for (const it of order.order_items) {
        const serverValue = it.qty_requested ?? it.quantity;
        const currentValue = prev[it.id];
        const resolvedValue =
          currentValue != null && Number.isFinite(Number(currentValue))
            ? Number(currentValue)
            : serverValue;
        next[it.id] = Number.isFinite(Number(resolvedValue))
          ? Math.max(0, Number(resolvedValue))
          : Number(serverValue ?? 0);
      }
      return next;
    });

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

    const pickedUnit = match?.unit || p.unit || "cái";
    setNewSlug(ma);
    setNewName(p.name);
    setNewUnit(pickedUnit);
    setNewBarcode(match?.barcode || p.barcode || "");
    setNewPrice(match?.price ?? p.price ?? 0);
    setNewQty(resolveLineMoq(p, pickedUnit));
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
    // ĐVT luôn ưu tiên giá trị đang chọn trên dropdown — không ép về ĐVT gốc catalog
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
      const opts = resolveAvailableVariants(
        catalogList as CatalogProductRow[],
        slug,
      );
      const unitOpts =
        opts.length > 0
          ? opts
          : expandProductUnitOptions(hit as CatalogProductRow);

      if (unit) {
        // Đã chọn ĐVT: chỉ dò biến thể để lấy MV / giá tương ứng, giữ nguyên ĐVT
        const byUnit = resolveUnitOption(unitOpts, unit);
        if (byUnit) {
          unit = byUnit.unit;
          barcode = String(byUnit.barcode ?? "").trim() || barcode;
          price = Number(byUnit.price) || price;
        }
      } else {
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
    const moq = moqOf(slug, unit);
    let qty = Math.max(1, Number(newQty) || 1);
    if (!allowPartial && qty === 1 && moq > 1) qty = moq;
    if (!allowPartial && !isQtyMultipleOfMoq(qty, moq)) {
      toast({
        title: "SL không đúng bội số MOQ",
        description: `${slug}: SL ${qty} phải là bội số của ${moq}. Tick «cho phép xuất lẻ» nếu cần nhập lệch MOQ.`,
        variant: "destructive",
      });
      focusQty();
      return;
    }
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

    const exact = resolveCatalogScan(catalogList, q);
    // Mã vạch gắn cho nhiều mã hàng → không đoán hộ, mở gợi ý cho user chọn
    if (exact.ambiguous) {
      setSuggestOpen(true);
      toast({
        title: "Mã vạch đang gắn cho nhiều mã hàng",
        description: `${q} → ${exact.skus.join(", ")}. Chọn đúng mã hàng trong gợi ý.`,
        variant: "destructive",
      });
      return;
    }
    if (exact.hit) {
      const payload = payloadFromHit(exact.hit, scan.trim());
      if (!payload) return;
      pickProduct(exact.hit, scan.trim());
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
      // Bắt buộc sync MV + đơn giá theo ĐVT — giữ nguyên mã hàng + tên
      setNewBarcode(match.barcode);
      setNewPrice(Number(match.price) || 0);
    }
    const moq = moqOf(newSlug, dvt);
    setNewQty((q) => {
      if (allowPartial) return Math.max(1, q);
      return moq > 1 && !isQtyMultipleOfMoq(q, moq) ? moq : Math.max(1, q);
    });
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
  /** Admin vẫn sửa được đơn khóa; completed / cancelled mới khóa cứng. */
  const unitEditable = !locked;

  const lineUnit = (it: { id: string; unit?: string | null }) =>
    unitDraft[it.id]?.unit ?? it.unit ?? "";
  const lineBarcode = (it: { id: string; barcode?: string | null }) =>
    unitDraft[it.id]?.barcode ?? it.barcode ?? "";
  /** Đơn giá theo ĐVT đang chọn — draft thắng giá server khi vừa đổi ĐVT */
  const linePrice = (it: { id: string; price?: number | null }) =>
    Number(unitDraft[it.id]?.price ?? it.price ?? 0) || 0;
  const lineQtyForMoney = (it: typeof order.order_items[number]) =>
    Number(
      variant === "packing"
        ? packed[it.id] ?? it.qty_packed ?? it.qty_requested ?? it.quantity
        : reqDraft[it.id] ?? it.qty_requested ?? it.quantity,
    ) || 0;
  /** Tồn dùng quyết định thiếu / xuất — ưu tiên SOH, fallback getQty (sau khi điều chỉnh tồn). */
  const availableOf = (it: typeof order.order_items[number]) => {
    const unit = lineUnit(it);
    return (
      getVerifiedQty(it.product_slug, unit) ??
      getVerifiedQty(lineBarcode(it), unit) ??
      getQty(it.product_slug, unit) ??
      getQty(lineBarcode(it), unit) ??
      null
    );
  };
  const packedQtyOf = (it: typeof order.order_items[number]) =>
    Number(
      packed[it.id] ?? it.qty_packed ?? it.qty_requested ?? it.quantity,
    ) || 0;
  /** SL yêu cầu > tồn — nhắc nhẹ (vẫn có thể soạn ít hơn). */
  const isReqOverStock = (it: typeof order.order_items[number]) => {
    const requiredQty = Number(it.qty_requested ?? it.quantity) || 0;
    if (requiredQty <= 0) return false;
    const availableQty = availableOf(it);
    if (availableQty == null) return false;
    return availableQty < requiredQty;
  };
  /**
   * SL soạn > tồn → không xuất (màu đỏ).
   * Khi bấm “→ tồn” (SL soạn ≤ tồn) → hết trạng thái này, đổi màu available.
   */
  const isPackOverStock = (it: typeof order.order_items[number]) => {
    const qty = packedQtyOf(it);
    if (qty <= 0) return false;
    const availableQty = availableOf(it);
    if (availableQty == null) return false;
    return qty > availableQty;
  };
  /** Backward-compatible alias: soạn hàng dùng pack-over-stock; quản lý dùng req-over-stock. */
  const isItemStockShort = (it: typeof order.order_items[number]) =>
    variant === "packing" ? isPackOverStock(it) : isReqOverStock(it);
  /** Xuất phiếu: SL soạn > 0 và không vượt tồn. */
  const exportableOrderItems = order.order_items.filter((it) => {
    if (it.is_out_stock || it.is_locked) return false;
    const qty = packedQtyOf(it);
    if (qty <= 0) return false;
    const availableQty = availableOf(it);
    if (availableQty != null && qty > availableQty) return false;
    return true;
  });
  const displayOrderItems = variant === "packing"
    ? [...order.order_items].sort((left, right) => {
        // Không xuất (SL soạn > tồn) xuống cuối; đã hạ SL theo tồn lên trên
        const leftBlock = Number(isPackOverStock(left));
        const rightBlock = Number(isPackOverStock(right));
        if (leftBlock !== rightBlock) return leftBlock - rightBlock;
        return Number(isReqOverStock(left)) - Number(isReqOverStock(right));
      })
    : order.order_items;
  const hiddenPackingItemCount = order.order_items.filter(isPackOverStock).length;
  const adjustedPackingItemCount = order.order_items.filter(
    (it) =>
      isReqOverStock(it) &&
      !isPackOverStock(it) &&
      packedQtyOf(it) > 0,
  ).length;

  /** Tổng cộng cuối bảng — dùng cho cả Quản lý và Soạn hàng */
  const footerTotals = displayOrderItems.reduce(
    (acc, it) => {
      const reqQty = Number(reqDraft[it.id] ?? it.qty_requested ?? it.quantity) || 0;
      const packedQty =
        Number(
          packed[it.id] ?? it.qty_packed ?? it.qty_requested ?? it.quantity,
        ) || 0;
      acc.lines += 1;
      acc.req += reqQty;
      acc.packed += packedQty;
      acc.received += Number(it.qty_received) || 0;
      acc.money += linePrice(it) * lineQtyForMoney(it);
      return acc;
    },
    { lines: 0, req: 0, packed: 0, received: 0, money: 0 },
  );
  /** SL tổng theo màn hình: Quản lý = SL yêu cầu, Soạn hàng = SL soạn */
  const footerQtyTotal =
    variant === "packing" ? footerTotals.packed : footerTotals.req;

  /** ĐVT chuẩn từ catalog cho mã hàng (quy cách đầu tiên / unit gốc). */
  const catalogUnitOf = (slug: string | null) => {
    const opts = getSkuUnitOptions(skuUnitIndex, slug || "");
    if (opts.length) return opts[0].unit;
    const key = normalizeOrderCodeText(slug || "");
    const hit = catalogList.find((p) => normalizeOrderCodeText(p.slug) === key);
    return String(hit?.unit || "").trim();
  };

  /**
   * ĐVT dùng cho In / Excel — bám đúng ô ĐVT đang hiển thị trên lưới:
   * draft chưa lưu > resolve theo catalog (như Select) > ĐVT chuẩn catalog.
   * Không dùng snapshot `order_items.unit` khi nó lệch với giao diện.
   */
  const printUnitOf = (it: typeof order.order_items[number]) => {
    const shown = String(lineUnit(it) || "").trim();
    const opts = getSkuUnitOptions(skuUnitIndex, it.product_slug || "");
    if (unitEditable && opts.length) {
      return (
        resolveUnitOption(opts, shown)?.unit ||
        opts[0]?.unit ||
        shown ||
        catalogUnitOf(it.product_slug)
      );
    }
    return shown || catalogUnitOf(it.product_slug);
  };

  /** MV luôn đi kèm ĐVT đã chọn — đổi ĐVT thì MV phải theo (rule chung). */
  const printBarcodeOf = (it: typeof order.order_items[number]) => {
    const opts = getSkuUnitOptions(skuUnitIndex, it.product_slug || "");
    const unit = printUnitOf(it);
    const shownBarcode = String(lineBarcode(it) || "").trim();
    if (
      normalizeOrderCodeText(unit) === normalizeOrderCodeText(lineUnit(it))
    ) {
      return shownBarcode || barcodeForUnit(opts, unit);
    }
    return barcodeForUnit(opts, unit) || shownBarcode;
  };

  /** SL In / Excel = đúng con số người dùng đang thấy trên dòng đó. */
  const printQtyOf = (it: typeof order.order_items[number]) => {
    const reqShown =
      Number(reqDraft[it.id] ?? it.qty_requested ?? it.quantity) || 0;
    if (variant === "packing") {
      return (
        Number(
          packed[it.id] ??
            it.qty_packed ??
            it.qty_requested ??
            it.quantity,
        ) || 0
      );
    }
    // Quản lý: cột SL soạn chỉ hiện số của server; chưa soạn thì in SL yêu cầu
    return it.qty_packed != null ? Number(it.qty_packed) || 0 : reqShown;
  };

  const createPrintDetail = () => warehouseOrderToPrintDetail({
    ...order,
    order_items: exportableOrderItems.map((it) => ({
      ...it,
      qty_packed: printQtyOf(it),
      display_unit: printUnitOf(it),
      display_barcode: printBarcodeOf(it),
    })),
  });

  /**
   * Lệnh điều chuyển KiotViet — cùng mẫu với nút "Xuất lệnh điều chuyển" của
   * Bảng tổng hợp soạn hàng. ĐVT + SL lấy nguyên từ createPrintDetail() nên
   * khớp tuyệt đối với bảng đang hiển thị.
   */
  const handleExportTransferOrder = async () => {
    const detail = createPrintDetail();
    const sourceWhId =
      order.source_warehouse_id || order.source_warehouse?.id || null;
    const khoXuat =
      sourceWhId && q7?.id && sourceWhId === q7.id
        ? KIOTVIET_Q7_WAREHOUSE
        : [order.source_warehouse?.code, order.source_warehouse?.name]
            .map((part) => String(part || "").trim())
            .filter(Boolean)
            .join(" | ") || detail.khoXuat;

    const lines: TransferExportLine[] = detail.items
      .filter((it) => (Number(it.sl) || 0) > 0)
      .map((it) => ({
        maHang: it.parentSku || it.maHang,
        maVach: it.maVach || "",
        tenHang: it.tenHang,
        kho: khoXuat,
        dvt: it.dvt,
        soLuong: Number(it.sl) || 0,
        ghiChu: `${detail.soPhieu} · Kho nhận: ${detail.khoNhan}`,
      }));

    if (!lines.length) {
      toast({
        title: "Không có dòng hàng để xuất",
        description:
          "Phiếu chưa có dòng đủ điều kiện (SL > 0, còn tồn, không khóa).",
        variant: "destructive",
      });
      return;
    }

    const code = (detail.soPhieu || "phieu").replace(/[^\w.-]+/g, "_");
    const fileName = `lenh-dieu-chuyen_${code}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;

    setExportingTransfer(true);
    try {
      const usedTemplate = await exportKiotVietTransferFromTemplate(lines, {
        fileName,
      });
      // Thiếu / lỗi file mẫu trong public → vẫn xuất bằng bản dựng lại đúng layout
      if (!usedTemplate) exportKiotVietTransferFile(lines, { fileName });
      toast({
        title: "Đã xuất lệnh điều chuyển",
        description:
          `${lines.length} dòng · ${detail.khoXuat} → ${detail.khoNhan}` +
          (usedTemplate ? "" : " · dùng bản dựng lại (không tải được file mẫu)"),
      });
    } catch (e) {
      toast({
        title: "Không xuất được lệnh điều chuyển",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setExportingTransfer(false);
    }
  };

  const onLineUnitChange = async (
    it: {
      id: string;
      product_slug: string | null;
      unit?: string | null;
      barcode?: string | null;
      price?: number | null;
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
    const oldPrice = Number(it.price) || 0;
    // Đơn giá theo quy cách mới; ĐVT lớn dùng price_2 (hoặc giá cơ sở × tỷ lệ)
    const nextPrice = match ? Number(match.price) || 0 : oldPrice;
    const oldUnit = String(it.unit || "").trim() || "—";
    if (
      normalizeOrderCodeText(oldUnit) === normalizeOrderCodeText(newUnit) &&
      normalizeOrderCodeText(newBarcode) ===
        normalizeOrderCodeText(it.barcode || "") &&
      nextPrice === oldPrice
    ) {
      return;
    }

    setUnitDraft((d) => ({
      ...d,
      [it.id]: { unit: newUnit, barcode: newBarcode, price: nextPrice },
    }));

    const sku = normalizeOrderCodeText(it.product_slug || "") || "—";
    const auditNote = `Hệ thống: ${actorLabel} đã đổi ĐVT của mã ${sku} từ '${oldUnit}' sang '${newUnit}'`;

    setUnitBusyId(it.id);
    try {
      await updateItemUnit.mutateAsync({
        itemId: it.id,
        unit: newUnit,
        barcode: newBarcode || null,
        price: match ? nextPrice : null,
        auditNote,
      });
      toast({
        title: "Đã đổi ĐVT",
        description:
          `${sku}: ${oldUnit} → ${newUnit}` +
          (newBarcode ? ` · MV ${newBarcode}` : "") +
          (match && nextPrice !== oldPrice ? ` · Giá ${vnd(nextPrice)}đ` : ""),
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

  const collectPackMoqViolations = () =>
    order.order_items
      .map((it) => {
        const qty = packedQtyOf(it);
        const moq = moqOf(it.product_slug, lineUnit(it));
        if (isQtyMultipleOfMoq(qty, moq)) return null;
        return {
          itemId: it.id,
          slug: it.product_slug || "",
          name: it.product_name,
          qty,
          moq,
          suggest: nearestMoqCeiling(qty, moq),
        };
      })
      .filter((row): row is NonNullable<typeof row> => !!row);

  const persistPacking = async (acknowledgeMoq: boolean) => {
    try {
      const lines = order.order_items.map((it) => {
        const rawPacked =
          packed[it.id] ??
          it.qty_packed ??
          it.qty_requested ??
          it.quantity;
        const qtyPacked = Number.isFinite(Number(rawPacked))
          ? Math.max(0, Number(rawPacked))
          : Number(it.qty_requested ?? it.quantity ?? 0);

        return {
          itemId: it.id,
          qtyPacked,
          unit: lineUnit(it) || it.unit || null,
          barcode: lineBarcode(it) || it.barcode || null,
        };
      });

      await savePacking.mutateAsync({
        orderId: order.id,
        lines,
      });

      await refetch();
      setMoqConfirmOpen(false);
      setMoqViolations([]);
      toast({
        title: "Đã lưu soạn hàng",
        description:
          (order.order_code || "") +
          (acknowledgeMoq ? " · đã chấp nhận lệch MOQ" : ""),
      });
    } catch (e) {
      toast({
        title: "Lỗi soạn hàng",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const handleSavePack = async () => {
    const violations = collectPackMoqViolations();
    if (violations.length) {
      if (allowPartial) {
        await persistPacking(true);
        return;
      }
      setMoqViolations(violations);
      setMoqConfirmOpen(true);
      return;
    }
    await persistPacking(false);
  };

  const applyMoqSuggestionsAndSave = async () => {
    setPacked((prev) => {
      const next = { ...prev };
      for (const v of moqViolations) {
        next[v.itemId] = v.suggest;
      }
      return next;
    });
    // Đợi state packed cập nhật một tick rồi lưu với số đề xuất
    const lines = order.order_items.map((it) => {
      const violation = moqViolations.find((v) => v.itemId === it.id);
      const rawPacked = violation
        ? violation.suggest
        : packed[it.id] ??
          it.qty_packed ??
          it.qty_requested ??
          it.quantity;
      const qtyPacked = Number.isFinite(Number(rawPacked))
        ? Math.max(0, Number(rawPacked))
        : 0;
      return {
        itemId: it.id,
        qtyPacked,
        unit: lineUnit(it) || it.unit || null,
        barcode: lineBarcode(it) || it.barcode || null,
      };
    });
    try {
      await savePacking.mutateAsync({ orderId: order.id, lines });
      await refetch();
      setMoqConfirmOpen(false);
      setMoqViolations([]);
      toast({
        title: "Đã lưu soạn hàng",
        description: `${order.order_code || ""} · đã làm tròn theo MOQ`,
      });
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
    if (!allowPartial) {
      const moqBad = order.order_items.find((it) => {
        const qty =
          Number(reqDraft[it.id] ?? it.qty_requested ?? it.quantity) || 0;
        return !isQtyMultipleOfMoq(qty, moqOf(it.product_slug, lineUnit(it)));
      });
      if (moqBad) {
        const moq = moqOf(moqBad.product_slug, lineUnit(moqBad));
        const qty =
          Number(
            reqDraft[moqBad.id] ?? moqBad.qty_requested ?? moqBad.quantity,
          ) || 0;
        toast({
          title: "SL không đúng bội số MOQ",
          description: `${moqBad.product_slug || moqBad.product_name}: SL ${qty} phải là bội số của ${moq}. Tick «cho phép xuất lẻ» nếu cần nhập lệch MOQ.`,
          variant: "destructive",
        });
        return;
      }
    }
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
      await refetch();
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
          ? `Cập nhật ${changes.length} dòng · ${tip.title}${allowPartial ? " · đã mở khóa xuất lẻ" : ""}`
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

  const handleToggleOrderLock = async () => {
    const isLocked = !order.is_locked;
    const message = isLocked
      ? `Khóa đơn ${order.order_code}? Khách sẽ nhận thông báo đơn không thể thay đổi và cần tạo đơn mới.`
      : `Mở khóa đơn ${order.order_code}?`;
    if (!confirm(message)) return;

    try {
      await setOrderLock.mutateAsync({ orderId: order.id, isLocked });
      toast({ title: isLocked ? "Đã khóa đơn" : "Đã mở khóa đơn" });
    } catch (e) {
      toast({
        title: isLocked ? "Không khóa được đơn" : "Không mở khóa được đơn",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const handleEmergencyUnlock = async () => {
    const reason = window.prompt(
      `Lý do mở khóa khẩn cấp đơn ${order.order_code}:`,
    );
    if (!reason?.trim()) return;
    try {
      await emergencyUnlockOrder.mutateAsync({ orderId: order.id, reason });
      toast({ title: "Đã mở khóa khẩn cấp", description: "Lý do đã được lưu vào nhật ký quản trị." });
    } catch (error) {
      toast({
        title: "Không thể mở khóa",
        description: error instanceof Error ? error.message : "Lỗi",
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
            variant={showPrice ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPrice((v) => !v)}
            title="Bật/tắt cột Đơn giá & Thành tiền"
          >
            {showPrice ? (
              <EyeOff className="w-4 h-4 mr-1" />
            ) : (
              <Eye className="w-4 h-4 mr-1" />
            )}
            {showPrice ? "Ẩn giá" : "Xem chi tiết giá"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              openOrderPdfWindow(createPrintDetail());
            }}
            disabled={stockLoading}
          >
            <Printer className="w-4 h-4 mr-1" />
            Xem / In PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              printOrderViaIframe(createPrintDetail());
            }}
            disabled={stockLoading}
          >
            In nhanh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              exportOrderExcel(createPrintDetail());
              toast({ title: "Đã tải file Excel" });
            }}
            disabled={stockLoading}
          >
            <FileSpreadsheet className="w-4 h-4 mr-1" />
            Xuất Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleExportTransferOrder()}
            disabled={stockLoading || exportingTransfer}
            title="Mẫu lệnh điều chuyển MISA"
          >
            {exportingTransfer ? (
              <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            ) : (
              <ArrowRightLeft className="w-4 h-4 mr-1" />
            )}
            Xuất lệnh điều chuyển
          </Button>
          {isAdmin && !order.is_locked && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleToggleOrderLock()}
              disabled={setOrderLock.isPending}
            >
              <Lock className="w-4 h-4 mr-1" />
              Khóa đặt hàng
            </Button>
          )}
          {canEmergencyUnlock && order.is_locked && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleEmergencyUnlock()}
              disabled={emergencyUnlockOrder.isPending}
            >
              {emergencyUnlockOrder.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Unlock className="w-4 h-4 mr-1" />}
              Mở khóa khẩn cấp
            </Button>
          )}
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
          {variant === "packing" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refetchStock().then(() =>
                  toast({
                    title: "Đã tải lại tồn",
                    description:
                      "SL soạn ≤ tồn → đủ xuất (xanh). SL soạn > tồn → không xuất (đỏ).",
                  }),
                );
              }}
              disabled={stockLoading}
              title="Tải lại tồn kho nguồn — mã đủ tồn sẽ hết cảnh báo thiếu"
            >
              <RefreshCw
                className={cn("w-4 h-4 mr-1", stockLoading && "animate-spin")}
              />
              Tải lại tồn
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Enter thêm mã → lưu ngay. Sửa{" "}
              <strong>
                {variant === "packing" ? "SL soạn" : "SL yêu cầu"}
              </strong>{" "}
              rồi bấm{" "}
              <strong>
                {variant === "packing" ? "Lưu soạn hàng" : "Lưu xác nhận"}
              </strong>
              .
            </p>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1.5 rounded-md">
              <input
                type="checkbox"
                id="detail-allow-partial"
                className="w-4 h-4 cursor-pointer accent-amber-600"
                checked={allowPartial}
                onChange={(e) => setAllowPartial(e.target.checked)}
              />
              <Label
                htmlFor="detail-allow-partial"
                className="cursor-pointer font-semibold text-xs leading-snug"
              >
                Cho phép xuất lẻ (mở khóa nhập dưới / lệch MOQ)
              </Label>
            </div>
          </div>
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
                              {resolveLineMoq(p, p.unit) > 1
                                ? ` · MOQ: ${resolveLineMoq(p, p.unit)}`
                                : ""}
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
                    value={newUnit || addUnitOptions[0]?.unit || ""}
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
              <Label className="text-xs">
                Số lượng
                {newSlug && moqOf(newSlug, newUnit) > 1 ? (
                  <span className="ml-1 text-orange-700 font-semibold">
                    MOQ {moqOf(newSlug, newUnit)}
                  </span>
                ) : null}
              </Label>
              <QtyInput
                ref={qtyRef}
                className={cn(
                  "w-24 h-10 text-base font-bold border-2",
                  !allowPartial &&
                    newSlug &&
                    moqOf(newSlug, newUnit) > 1 &&
                    !isQtyMultipleOfMoq(newQty, moqOf(newSlug, newUnit))
                    ? "border-orange-500 text-orange-800"
                    : "border-sky-400",
                )}
                compact={false}
                value={newQty}
                onValueChange={(v) => setNewQty(Math.max(1, v))}
                min={1}
                step={
                  allowPartial
                    ? 1
                    : newSlug
                      ? moqOf(newSlug, newUnit)
                      : 1
                }
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
              {newUnit ? ` · ĐVT: ${newUnit}` : ""}
              {moqOf(newSlug, newUnit) > 1
                ? ` · MOQ: ${moqOf(newSlug, newUnit)}`
                : ""}
              {newPrice > 0 ? (
                <span className="text-emerald-700 font-semibold">
                  {` · Đơn giá: ${vnd(newPrice)}đ`}
                  {newQty > 0
                    ? ` · Thành tiền: ${vnd(newPrice * newQty)}đ`
                    : ""}
                </span>
              ) : null}
              {" · Enter ở SL để xác nhận"}
            </div>
          ) : null}
        </div>
      )}

      <div className={cn(excelTableWrap, "max-h-[calc(96vh-18rem)] min-h-[22rem]")}>
        {variant === "packing" &&
        (hiddenPackingItemCount > 0 || adjustedPackingItemCount > 0) ? (
          <div
            className={cn(
              "sticky top-0 z-20 border-b px-3 py-2 text-xs font-semibold",
              hiddenPackingItemCount > 0
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800",
            )}
          >
            {hiddenPackingItemCount > 0 ? (
              <>
                {hiddenPackingItemCount} mã <strong>không xuất</strong> vì SL
                soạn &gt; tồn — xếp cuối. Bấm <strong>→ tồn</strong> để hạ SL
                soạn = tồn thì đổi sang màu xanh và được xuất.
              </>
            ) : null}
            {adjustedPackingItemCount > 0 ? (
              <>
                {hiddenPackingItemCount > 0 ? " " : null}
                {adjustedPackingItemCount} mã đã hạ SL soạn ≤ tồn —{" "}
                <strong>đủ xuất</strong> (màu xanh).
              </>
            ) : null}{" "}
            Bấm <strong>Tải lại tồn</strong> nếu vừa chỉnh tồn kho.
          </div>
        ) : null}
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
              {showPrice && (
                <>
                  <TableHead className={cn(excelTh, "text-right w-24")}>
                    Đơn giá
                  </TableHead>
                  <TableHead
                    className={cn(excelTh, "text-right w-28 bg-amber-100")}
                  >
                    Thành tiền
                  </TableHead>
                </>
              )}
              <TableHead className={cn(excelTh, "text-right bg-emerald-100")}>
                Tồn
              </TableHead>
              <TableHead
                className={cn(excelTh, "text-right w-16 bg-orange-100")}
                title="MOQ = unit_2_ratio · SL phải là bội số"
              >
                MOQ
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
            {(() => {
              // STT dùng biến đếm riêng để luôn liên tục 1,2,3… theo dòng hiển thị
              let stt = 0;
              return displayOrderItems.map((it) => {
              stt += 1;
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
              const packOverStock = isPackOverStock(it);
              const reqOverStock = isReqOverStock(it);
              const packFitsStock =
                variant === "packing" &&
                reqOverStock &&
                !packOverStock &&
                packedQtyOf(it) > 0;
              /** Đỏ = không xuất; xanh = đã hạ SL theo tồn / đủ xuất */
              const stockShort = variant === "packing" ? packOverStock : reqOverStock;
              const unitPrice = linePrice(it);
              const moneyQty = lineQtyForMoney(it);
              const catalogMoq = catalogMoqOf(it.product_slug);
              const moq = moqOf(it.product_slug, displayUnit);
              const qtyForMoq = Number(
                variant === "packing"
                  ? packed[it.id] ?? it.qty_packed ?? req
                  : reqDraft[it.id] ?? req,
              ) || 0;
              const moqError = moq > 1 && !isQtyMultipleOfMoq(qtyForMoq, moq);
              return (
                <TableRow
                  key={it.id}
                  className={cn(
                    excelTr,
                    moqError && !packFitsStock && "bg-orange-50",
                    mismatch && QTY_MISMATCH_ROW[mismatch],
                    !mismatch && !moqError && soft && "bg-amber-50/70",
                    it.is_out_stock && "opacity-60",
                    it.is_locked && "opacity-75",
                    stockShort && "bg-red-50/80 opacity-60",
                    packFitsStock && !moqError && "bg-emerald-50/90",
                  )}
                >
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-center text-muted-foreground tabular-nums",
                    )}
                  >
                    {stt}
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
                    {moqError ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-orange-700">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Lệch MOQ ({moq})
                      </div>
                    ) : null}
                    {stockShort ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-red-700">
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                        Không xuất — SL soạn {packedQtyOf(it)} &gt; tồn{" "}
                        {availableOf(it) ?? "—"}
                        {reqOverStock
                          ? ` (yêu cầu ${Number(it.qty_requested ?? it.quantity) || 0})`
                          : ""}
                      </div>
                    ) : null}
                    {packFitsStock ? (
                      <div className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-emerald-700">
                        Đủ xuất — SL soạn {packedQtyOf(it)} ≤ tồn{" "}
                        {availableOf(it) ?? "—"}
                        {reqOverStock
                          ? ` (yêu cầu ${Number(it.qty_requested ?? it.quantity) || 0})`
                          : ""}
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
                  {showPrice && (
                    <>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums text-xs",
                        )}
                      >
                        {unitPrice > 0 ? `${vnd(unitPrice)}đ` : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums text-xs font-semibold bg-amber-50/60",
                        )}
                      >
                        {unitPrice > 0 ? `${vnd(unitPrice * moneyQty)}đ` : "—"}
                      </TableCell>
                    </>
                  )}
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums bg-emerald-50/50 font-semibold",
                      ton != null && ton < req && "text-red-700",
                    )}
                  >
                    {ton != null ? ton : "—"}
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTd,
                      "text-right tabular-nums font-bold text-base",
                      catalogMoq > 1
                        ? "bg-orange-50 text-orange-800"
                        : "text-muted-foreground",
                      moqError && "ring-1 ring-inset ring-orange-500",
                    )}
                    title={
                      catalogMoq > 1
                        ? moq > 1
                          ? `MOQ ${catalogMoq} (unit_2_ratio) · SL phải là bội số của ${moq}`
                          : `MOQ catalog ${catalogMoq} · ĐVT lớn không ràng buộc bội số`
                        : "Không có unit_2_ratio trên danh mục"
                    }
                  >
                    {catalogMoq > 1 ? catalogMoq : "—"}
                  </TableCell>
                  <TableCell className={cn(excelTd, "text-right bg-sky-50/40")}>
                    {locked || variant === "packing" ? (
                      <span className="tabular-nums text-sm">
                        {reqDraft[it.id] ?? req}
                      </span>
                    ) : (
                      <QtyInput
                        className={cn(
                          "w-16 ml-auto",
                          !allowPartial &&
                            moqError &&
                            "border-orange-500 text-orange-800",
                        )}
                        value={reqDraft[it.id] ?? req}
                        onValueChange={(v) =>
                          setReqDraft((d) => ({
                            ...d,
                            [it.id]: Math.max(0, v),
                          }))
                        }
                        step={allowPartial ? 1 : moq}
                        title={
                          !allowPartial && moqError
                            ? `SL phải là bội số của MOQ ${moq}`
                            : undefined
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
                      <div className="flex flex-col items-end gap-0.5">
                        <QtyInput
                          className={cn(
                            "w-16 ml-auto",
                            stockShort &&
                              "border-red-400 bg-red-100 text-red-800",
                            mismatch === "short" &&
                              "border-red-400 text-red-800",
                            mismatch === "over" &&
                              "border-amber-400 text-amber-900",
                            moqError && "border-orange-500 text-orange-800",
                          )}
                          step={1}
                          title={
                            moqError
                              ? `Lệch MOQ ${moq} — đề xuất ${nearestMoqCeiling(qtyForMoq, moq)}`
                              : stockShort
                                ? "Thiếu tồn — có thể nhập SL soạn ≤ tồn"
                                : undefined
                          }
                          value={
                            packed[it.id] ??
                            it.qty_packed ??
                            it.qty_requested ??
                            it.quantity
                          }
                          onValueChange={(v) =>
                            setPacked((p) => ({ ...p, [it.id]: v }))
                          }
                        />
                        {variant === "packing" && moqError ? (
                          <button
                            type="button"
                            className="text-[10px] font-semibold text-orange-700 underline hover:text-orange-900"
                            onClick={() =>
                              setPacked((p) => ({
                                ...p,
                                [it.id]: nearestMoqCeiling(qtyForMoq, moq),
                              }))
                            }
                            title={`Làm tròn lên bội số MOQ ${moq}`}
                          >
                            → {nearestMoqCeiling(qtyForMoq, moq)}
                          </button>
                        ) : null}
                        {variant === "packing" &&
                        (packOverStock || reqOverStock) &&
                        availableOf(it) != null &&
                        availableOf(it)! >= 0 &&
                        packedQtyOf(it) !== availableOf(it) ? (
                          <button
                            type="button"
                            className={cn(
                              "text-[10px] font-semibold underline",
                              packOverStock
                                ? "text-red-700 hover:text-red-900"
                                : "text-emerald-700 hover:text-emerald-900",
                            )}
                            onClick={() =>
                              setPacked((p) => ({
                                ...p,
                                [it.id]: Math.max(0, availableOf(it)!),
                              }))
                            }
                            title="Đặt SL soạn = tồn → đủ xuất"
                          >
                            → tồn {availableOf(it)}
                          </button>
                        ) : null}
                      </div>
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
              });
            })()}
          </TableBody>
          <TableFooter className="bg-transparent">
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={5} className={cn(excelTf, "text-left")}>
                <span className="font-semibold">
                  TỔNG CỘNG: {footerTotals.lines} dòng hàng
                </span>
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                  ({variant === "packing" ? "SL soạn" : "SL yêu cầu"} ×{" "}
                  đơn giá dòng)
                </span>
                {!showPrice ? (
                  <span className="ml-3 font-bold text-amber-900">
                    Tổng tiền:{" "}
                    <span className="tabular-nums text-[15px]">
                      {vnd(footerTotals.money)}đ
                    </span>
                  </span>
                ) : null}
              </TableCell>
              {showPrice && (
                <>
                  <TableCell
                    className={cn(excelTf, "text-right text-muted-foreground")}
                  >
                    —
                  </TableCell>
                  <TableCell
                    className={cn(
                      excelTf,
                      "text-right tabular-nums bg-amber-100 text-[15px] font-bold text-amber-900",
                    )}
                  >
                    {vnd(footerTotals.money)}đ
                  </TableCell>
                </>
              )}
              <TableCell className={cn(excelTf, "text-right")} />
              <TableCell
                className={cn(excelTf, "text-right bg-orange-50 text-orange-800 text-[11px]")}
              >
                MOQ
              </TableCell>
              <TableCell
                className={cn(
                  excelTf,
                  "text-right tabular-nums bg-sky-50",
                  variant !== "packing" &&
                    "text-[15px] font-bold text-sky-900",
                )}
              >
                {footerTotals.req.toLocaleString("vi-VN")}
              </TableCell>
              <TableCell
                className={cn(
                  excelTf,
                  "text-right tabular-nums bg-amber-50",
                  variant === "packing" &&
                    "text-[15px] font-bold text-amber-900",
                )}
              >
                {footerTotals.packed.toLocaleString("vi-VN")}
              </TableCell>
              <TableCell
                className={cn(excelTf, "text-right tabular-nums bg-emerald-50")}
              >
                {footerTotals.received.toLocaleString("vi-VN")}
              </TableCell>
              {!locked && <TableCell className={excelTf} />}
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <p className="text-right text-sm">
        <span className="text-muted-foreground">
          Tổng {footerQtyTotal.toLocaleString("vi-VN")}{" "}
          {variant === "packing" ? "SL soạn" : "SL yêu cầu"} ·{" "}
        </span>
        <span className="font-bold text-amber-900">
          Tổng thành tiền:{" "}
          <span className="tabular-nums text-base">
            {vnd(footerTotals.money)}đ
          </span>
        </span>
      </p>

      <AlertDialog open={moqConfirmOpen} onOpenChange={setMoqConfirmOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Chấp nhận lệch MOQ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Có {moqViolations.length} dòng SL soạn không phải bội số MOQ
                  (unit_2_ratio). Bạn có thể làm tròn theo đề xuất hoặc vẫn lưu
                  số đang nhập.
                </p>
                <ul className="max-h-48 overflow-y-auto rounded border bg-orange-50/60 px-3 py-2 text-xs text-foreground space-y-1">
                  {moqViolations.map((v) => (
                    <li key={v.itemId} className="font-mono">
                      <strong className="uppercase">{v.slug || "—"}</strong>
                      {" · "}
                      SL {v.qty} / MOQ {v.moq}
                      <span className="text-orange-800 font-semibold">
                        {" "}
                        → đề xuất {v.suggest}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel disabled={savePacking.isPending}>
              Hủy
            </AlertDialogCancel>
            <Button
              type="button"
              variant="secondary"
              disabled={savePacking.isPending}
              onClick={() => void applyMoqSuggestionsAndSave()}
            >
              {savePacking.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : null}
              Áp dụng đề xuất &amp; lưu
            </Button>
            <AlertDialogAction
              disabled={savePacking.isPending}
              onClick={(e) => {
                e.preventDefault();
                void persistPacking(true);
              }}
            >
              Vẫn lưu lệch MOQ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
