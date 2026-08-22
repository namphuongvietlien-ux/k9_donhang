import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Download,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useWarehouses, warehouseLabel as formatWhLabel } from "@/hooks/useWarehouses";
import { useStoreScope } from "@/hooks/useStoreScope";
import { useProducts } from "@/hooks/useProducts";
import { useStock, usePackingSourceWarehouse } from "@/hooks/useStock";
import { useWarehouseOrderMutations } from "@/hooks/useWarehouseOrders";
import type { DuplicatePreSaveResult } from "@/hooks/useOrderImport";
import type { PhieuLoai } from "@/lib/importOrders";
import { downloadImportTemplate } from "@/lib/importTemplates";
import { exportKiotVietTransferFile } from "@/lib/transferExportTemplate";
import {
  filterCatalogSuggestions,
  resolveCatalogScan,
  scoreCatalogItem,
} from "@/lib/catalogSearch";
import { checkCatalogAddBlocked } from "@/lib/catalogAddGuards";
import { ProductSearchInput } from "@/components/admin/ProductSearchInput";
import { OrderItemsGrid } from "@/components/admin/OrderItemsGrid";
import {
  inferPackingDayFromCreatedAt,
  getPackingSaveBanner,
  MODE_LABELS,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import {
  expandProductUnitOptions,
  getSkuUnitOptions,
  isLoiMaSku,
  resolveAvailableVariants,
  type CatalogProductRow,
  type SkuUnitOption,
} from "@/lib/catalogUnitBarcode";
import {
  syncDraftLineUnit,
  useSkuUnitIndex,
} from "@/hooks/useVariantSync";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  K9_DRAFT_ORDER_TRANSFER,
  peekLocalDraft,
  useLocalDraft,
} from "@/hooks/useLocalDraft";

interface CartLine {
  key: string;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  /** Quy cách từ catalog (availableVariants); rỗng = mã ngoài → Input ĐVT tự do */
  unitOptions: SkuUnitOption[];
  quantity: number;
  productId: string | null;
  price: number;
  stockQty: number | null;
  /** SKU gõ tay / không có trong catalog — mở khóa tên/ĐVT/MV */
  isCustomSku?: boolean;
}

type TransferFormDraft = {
  v: 1;
  loai: PhieuLoai;
  sourceWh: string;
  destWh: string;
  lines: CartLine[];
  savedAt?: string;
};

interface CatalogHit {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  unit: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  price: number;
  parent_sku?: string | null;
  is_new?: boolean;
  is_locked?: boolean;
  is_out_stock?: boolean;
}

interface CreateWarehouseOrderFormProps {
  onCreated?: (orderId: string) => void;
}

export type CreateWarehouseOrderFormHandle = {
  addBySlugOrBarcode: (slug?: string | null, barcode?: string | null) => boolean;
};

function pickOptionForProduct(
  p: CatalogHit,
  preferredBarcode?: string | null,
): SkuUnitOption {
  const opts = expandProductUnitOptions(p as CatalogProductRow);
  const bc = normalizeOrderCodeText(preferredBarcode || "");
  if (bc) {
    const byBc = opts.find(
      (o) => normalizeOrderCodeText(o.barcode) === bc,
    );
    if (byBc) return byBc;
  }
  return opts[0] || {
    unit: p.unit || "cái",
    barcode: p.barcode || "",
    productId: p.id,
    name: p.name,
    price: p.price,
    ratio: 1,
    source: "unit" as const,
  };
}

const CreateWarehouseOrderForm = forwardRef<
  CreateWarehouseOrderFormHandle,
  CreateWarehouseOrderFormProps
>(function CreateWarehouseOrderForm({ onCreated }, ref) {
  const { warehouses } = useWarehouses();
  const { warehouseId: scopedWhId, isStoreScoped, warehouseLabel: scopedLabel } =
    useStoreScope();
  const { products, loading: catalogLoading, refreshProducts: refetchCatalog } =
    useProducts();
  const { data: q7 } = usePackingSourceWarehouse();
  const { createOrder } = useWarehouseOrderMutations();
  const { toast } = useToast();
  const scanRef = useRef<HTMLInputElement>(null);

  const initialDraftRef = useRef(
    peekLocalDraft<TransferFormDraft>(K9_DRAFT_ORDER_TRANSFER),
  );
  const initialDraft = initialDraftRef.current;
  const restoredToastShown = useRef(false);

  const [loai, setLoai] = useState<PhieuLoai>(
    () => initialDraft?.loai || "DonHang",
  );
  const [sourceWh, setSourceWh] = useState(
    () => initialDraft?.sourceWh || "",
  );
  const [destWh, setDestWh] = useState(() => initialDraft?.destWh || "");
  const [scan, setScan] = useState("");
  const [lines, setLines] = useState<CartLine[]>(
    () =>
      (Array.isArray(initialDraft?.lines) ? initialDraft!.lines : []).map(
        (l) => ({
          ...l,
          unitOptions: Array.isArray(l.unitOptions) ? l.unitOptions : [],
        }),
      ),
  );
  const [dupOpen, setDupOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<DuplicatePreSaveResult | null>(null);

  const draftPayload = useMemo(
    (): TransferFormDraft => ({
      v: 1,
      loai,
      sourceWh,
      destWh,
      lines,
      savedAt: new Date().toISOString(),
    }),
    [loai, sourceWh, destWh, lines],
  );
  const formDirty = lines.length > 0;
  const { clearDraft } = useLocalDraft({
    storageKey: K9_DRAFT_ORDER_TRANSFER,
    value: draftPayload,
    isDirty: formDirty,
    debounceMs: 1000,
  });

  useEffect(() => {
    if (restoredToastShown.current) return;
    if (!initialDraft?.lines?.length) return;
    restoredToastShown.current = true;
    toast({
      title: "Đã khôi phục bản nháp chưa lưu trước đó!",
      description: `${initialDraft.lines.length} dòng · ${initialDraft.loai === "DieuChuyen" ? "Điều chuyển" : "Đơn hàng"}`,
    });
  }, [toast, initialDraft]);

  const stockWhId = sourceWh || q7?.id || null;
  const { getQty } = useStock(stockWhId);

  const now = useMemo(() => new Date(), []);
  const timeline = useMemo(() => inferPackingDayFromCreatedAt(now), [now]);
  const packingBanner = useMemo(() => getPackingSaveBanner(now), [now]);

  useEffect(() => {
    if (!warehouses.length) return;
    const q7w = warehouses.find((w) => w.code === "Q7");
    if (loai === "DonHang") {
      // Đơn hàng: xuất luôn Q7
      if (q7w) setSourceWh(q7w.id);
      // Chi nhánh: khóa kho nhận = kho được cấp
      if (isStoreScoped && scopedWhId) {
        setDestWh(scopedWhId);
      } else if (!destWh) {
        setDestWh(
          warehouses.find((w) => w.code !== "Q7")?.id || warehouses[0].id,
        );
      }
    } else {
      // Điều chuyển: chi nhánh khóa kho xuất = kho được cấp
      if (isStoreScoped && scopedWhId) {
        setSourceWh(scopedWhId);
        if (!destWh || destWh === scopedWhId) {
          setDestWh(
            warehouses.find((w) => w.id !== scopedWhId)?.id ||
              warehouses[0].id,
          );
        }
      } else {
        if (!sourceWh) setSourceWh(q7w?.id || warehouses[0].id);
        if (!destWh) {
          setDestWh(
            warehouses.find((w) => w.id !== (q7w?.id || sourceWh))?.id ||
              warehouses[0].id,
          );
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- đồng bộ khi đổi loại / kho / scope
  }, [loai, warehouses, isStoreScoped, scopedWhId]);

  // Giữ khóa cứng khi scope đổi giữa phiên
  useEffect(() => {
    if (!isStoreScoped || !scopedWhId) return;
    if (loai === "DonHang") setDestWh(scopedWhId);
    else setSourceWh(scopedWhId);
  }, [isStoreScoped, scopedWhId, loai]);

  const catalogList: CatalogHit[] = useMemo(() => {
    const rows = Array.isArray(products) ? products : [];
    return rows
      .filter((p) => p.is_active !== false && p.slug)
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug!,
        barcode: p.barcode || null,
        unit: p.unit,
        unit_2: p.unit_2 || null,
        barcode_2: p.barcode_2 || null,
        price: Number(p.price) || 0,
        parent_sku: p.parent_sku || null,
        is_new: !!p.is_new,
        is_locked: !!p.is_locked,
        is_out_stock: !!p.is_out_stock,
      }));
  }, [products]);

  const skuUnitIndex = useSkuUnitIndex(catalogList as CatalogProductRow[]);

  // Lọc mã vạch chặt (exact / prefix) đã nằm trong filterCatalogSuggestions —
  // không vá lại ở tầng form để hai nơi không lệch nhau.
  const suggestions = useMemo(
    () => filterCatalogSuggestions(catalogList, scan, 12),
    [scan, catalogList],
  );

  /** Khớp tuyệt đối: mã hàng trước, mã vạch sau, mã vạch dùng chung → ambiguous */
  const exactScan = useMemo(
    () => resolveCatalogScan(catalogList, scan),
    [scan, catalogList],
  );

  const warnAmbiguousBarcode = (raw: string, skus: string[]) => {
    toast({
      title: "Mã vạch đang gắn cho nhiều mã hàng",
      description: `${raw} → ${skus.join(", ")}. Chọn đúng mã hàng trong danh sách gợi ý.`,
      variant: "destructive",
    });
  };

  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
    [lines],
  );
  /** Tổng tiền đơn = Σ (SL × đơn giá theo ĐVT đang chọn). */
  const totalAmount = useMemo(
    () =>
      lines.reduce(
        (s, l) => s + (Number(l.price) || 0) * (Number(l.quantity) || 0),
        0,
      ),
    [lines],
  );

  const addProduct = (p: CatalogHit, preferredBarcode?: string) => {
    const block = checkCatalogAddBlocked(p);
    if (block.blocked) {
      toast({
        title: block.title,
        description: block.description || undefined,
        variant: "destructive",
      });
      setScan("");
      scanRef.current?.focus();
      return;
    }
    const ma = normalizeOrderCodeText(p.slug);
    // Variants = mọi ĐVT cùng SKU trong catalog (unit + unit_2, nhiều dòng)
    const optsFromCatalog = resolveAvailableVariants(
      catalogList as CatalogProductRow[],
      ma,
    );
    const opts =
      optsFromCatalog.length > 0
        ? optsFromCatalog
        : expandProductUnitOptions(p as CatalogProductRow);
    const picked =
      (preferredBarcode || scan.trim()
        ? opts.find(
            (o) =>
              normalizeOrderCodeText(o.barcode) ===
              normalizeOrderCodeText(preferredBarcode || scan.trim()),
          )
        : null) ||
      pickOptionForProduct(p, preferredBarcode || scan.trim()) ||
      opts[0];
    const unit = picked?.unit || p.unit || "cái";
    const barcode = picked?.barcode || p.barcode || "";

    setLines((prev) => {
      const exist = prev.find(
        (l) =>
          normalizeOrderCodeText(l.maHang) === ma &&
          normalizeOrderCodeText(l.dvt) === normalizeOrderCodeText(unit),
      );
      if (exist) {
        return prev.map((l) =>
          l.key === exist.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        {
          key: `${Date.now()}-${ma}-${unit}`,
          maHang: ma,
          maVach: barcode,
          tenHang: p.name,
          dvt: unit,
          unitOptions: opts,
          quantity: 1,
          productId: picked?.productId || p.id,
          price: picked?.price ?? p.price ?? 0,
          stockQty: getQty(ma, unit),
        },
        ...prev,
      ];
    });
    setScan("");
    scanRef.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    addBySlugOrBarcode: (slug, barcode) => {
      const s = normalizeOrderCodeText(slug || "");
      const b = normalizeOrderCodeText(barcode || "");
      const bySlug = s ? resolveCatalogScan(catalogList, s) : null;
      let hit = bySlug?.hit || undefined;
      if (!hit && b) {
        const byBarcode = resolveCatalogScan(catalogList, b);
        // Mã vạch dùng chung nhiều mã hàng → không đoán, bắt chọn tay
        if (byBarcode.ambiguous) {
          warnAmbiguousBarcode(String(barcode || ""), byBarcode.skus);
          setScan(String(barcode || ""));
          scanRef.current?.focus();
          return false;
        }
        hit = byBarcode.hit || undefined;
      }
      if (!hit) {
        toast({
          title: "Không tìm thấy mã",
          description: slug || barcode || "—",
          variant: "destructive",
        });
        return false;
      }
      addProduct(hit, barcode || undefined);
      return true;
    },
  }));

  /** Enter không khớp catalog → dòng mã ngoài (user tự điền tên/ĐVT/MV) */
  const addCustomSku = (raw: string) => {
    const val = raw.trim();
    if (!val) return;
    const sku = normalizeOrderCodeText(val);
    setLines((prev) => {
      const exist = prev.find(
        (l) =>
          l.isCustomSku &&
          normalizeOrderCodeText(l.maHang) === sku,
      );
      if (exist) {
        return prev.map((l) =>
          l.key === exist.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        {
          key: `${Date.now()}-new-${sku}`,
          maHang: sku,
          maVach: "",
          tenHang: "",
          dvt: "cái",
          unitOptions: [],
          quantity: 1,
          productId: null,
          price: 0,
          stockQty: null,
          isCustomSku: true,
        },
        ...prev,
      ];
    });
    setScan("");
    toast({
      title: "Mã ngoài — hàng mới",
      description: `${sku}: điền Tên hàng / ĐVT / Mã vạch rồi lưu phiếu.`,
    });
    scanRef.current?.focus();
  };

  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = scan.trim();
    if (!raw) return;
    if (exactScan.ambiguous) {
      warnAmbiguousBarcode(raw, exactScan.skus);
      return;
    }
    if (exactScan.hit) {
      addProduct(exactScan.hit, raw);
      return;
    }
    if (suggestions.length === 1) {
      addProduct(suggestions[0], raw);
      return;
    }
    if (suggestions[0] && scoreCatalogItem(suggestions[0], scan) >= 1200) {
      addProduct(suggestions[0], raw);
      return;
    }
    addCustomSku(raw);
  };

  const setQty = (key: string, qty: number) => {
    setLines((prev) =>
      prev
        .map((l) =>
          l.key === key ? { ...l, quantity: Math.max(0, qty) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  /** Đổi ĐVT → sync mã vạch ngay (giữ mã hàng + tên) */
  const setLineUnit = (key: string, dvt: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        return syncDraftLineUnit(l, dvt, {
          skuUnitIndex,
          getStockQty: (ma, unit) => getQty(ma, unit),
        });
      }),
    );
  };

  const setLineBarcode = (key: string, barcode: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, maVach: barcode } : l)),
    );
  };

  const setLineName = (key: string, tenHang: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, tenHang } : l)),
    );
  };

  const doSave = async (acknowledgeDuplicate: boolean) => {
    const preparedLines = lines.map((l) => {
      if (l.quantity <= 0) return l;
      if (l.isCustomSku && !String(l.tenHang || "").trim()) {
        return {
          ...l,
          tenHang: String(l.maHang || "Hàng mới").trim() || "Hàng mới",
        };
      }
      return l;
    });

    const incomplete = preparedLines.find(
      (l) => l.quantity > 0 && !normalizeOrderCodeText(l.maHang),
    );
    if (incomplete) {
      toast({
        title: "Thiếu mã hàng",
        description: "Mỗi dòng cần có mã hàng trước khi lưu.",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await createOrder.mutateAsync({
        loaiPhieu: loai,
        sourceWarehouseId: sourceWh,
        destWarehouseId: destWh,
        acknowledgeDuplicate,
        lines: preparedLines.map((l) => ({
          productName: String(l.tenHang || "").trim() || l.maHang || "Hàng mới",
          productSlug: l.maHang,
          quantity: l.quantity,
          price: l.price,
          barcode: l.maVach || null,
          unit: l.dvt || null,
          productId: l.productId,
        })),
      });
      toast({ title: "Đã tạo phiếu", description: res.order_code });
      clearDraft();
      setLines([]);
      setDupOpen(false);
      setDupInfo(null);
      void refetchCatalog();
      onCreated?.(res.id);
      scanRef.current?.focus();
    } catch (e) {
      const dup = (e as Error & { duplicate?: DuplicatePreSaveResult })
        ?.duplicate;
      if (dup?.isDuplicate && !acknowledgeDuplicate) {
        setDupInfo(dup);
        setDupOpen(true);
        return;
      }
      toast({
        title: "Không tạo được phiếu",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const handleSubmit = async () => {
    if (!lines.length) {
      toast({ title: "Chưa có hàng", variant: "destructive" });
      return;
    }
    await doSave(false);
  };

  const srcWh = warehouses.find((w) => w.id === sourceWh);
  const destWhRow = warehouses.find((w) => w.id === destWh);
  const srcCode = srcWh ? formatWhLabel(srcWh) : "—";
  const destCode = destWhRow ? formatWhLabel(destWhRow) : "—";
  /** Đơn hàng: khóa xuất Q7; Điều chuyển + CN: khóa xuất = kho được cấp */
  const sourceLocked =
    loai === "DonHang" || (loai === "DieuChuyen" && isStoreScoped);
  /** Đơn hàng + CN: khóa nhận = kho được cấp */
  const destLocked = loai === "DonHang" && isStoreScoped;

  return (
    <div className="space-y-4">
      <Alert
        className={
          packingBanner.mode === "supp"
            ? "border-amber-300 bg-amber-50/80"
            : "border-teal-300 bg-teal-50/70"
        }
      >
        <AlertTitle>{packingBanner.title}</AlertTitle>
        <AlertDescription className="space-y-1.5 text-sm">
          <p>{packingBanner.body}</p>
          <p className="text-xs text-muted-foreground">{packingBanner.footer}</p>
        </AlertDescription>
      </Alert>

      <div className="border rounded-lg p-4 space-y-4 bg-card">
        <div className="space-y-2">
          <Label>Loại đơn</Label>
          <div className="flex flex-col sm:flex-row gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="loaiPhieu"
                checked={loai === "DonHang"}
                onChange={() => setLoai("DonHang")}
              />
              Tạo Đơn Hàng (lấy từ Q7)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="loaiPhieu"
                checked={loai === "DieuChuyen"}
                onChange={() => setLoai("DieuChuyen")}
              />
              Đơn Điều Chuyển (giữa các kho)
            </label>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Kho xuất
              {sourceLocked ? (
                <span className="text-xs text-muted-foreground ml-1">
                  {loai === "DonHang"
                    ? "(khóa Q7)"
                    : `(khóa ${scopedLabel || "chi nhánh"})`}
                </span>
              ) : null}
            </Label>
            <Select
              value={sourceWh}
              onValueChange={setSourceWh}
              disabled={sourceLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {formatWhLabel(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>
              Kho nhận
              {destLocked ? (
                <span className="text-xs text-muted-foreground ml-1">
                  (khóa {scopedLabel || "chi nhánh"})
                </span>
              ) : null}
            </Label>
            <Select
              value={destWh}
              onValueChange={setDestWh}
              disabled={destLocked}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {formatWhLabel(w)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isStoreScoped ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            Tài khoản chi nhánh chỉ thao tác kho{" "}
            <strong>{scopedLabel}</strong> — không đổi được kho đã cấp.
          </p>
        ) : null}

        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          Mã đơn: <strong>(chưa lưu)</strong> · Kho: {srcCode} → {destCode}
          {sourceWh && destWh && sourceWh === destWh ? (
            <span className="text-amber-700 text-xs ml-2">
              (kho xuất = nhận — vẫn lưu được)
            </span>
          ) : null}
          <div className="text-xs text-muted-foreground mt-0.5">
            Ngày giờ tạo dự kiến:{" "}
            <strong className="text-foreground">
              {format(now, "HH:mm dd/MM/yyyy", { locale: vi })}
            </strong>
            {" · "}
            [{MODE_LABELS[timeline.mode]}] · ngày giao{" "}
            {packingBanner.packingDayStr}
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3 bg-card relative">
        <div className="flex flex-wrap gap-2 items-end">
          <ProductSearchInput
            className="flex-1 min-w-[220px] space-y-1.5 relative"
            label={
              <Label>
                Quét mã vạch, gõ mã, từ khóa tên (có/không dấu) hoặc 6 số cuối
                vạch
              </Label>
            }
            hint={
              <p className="text-[11px] text-muted-foreground">
                Quét khớp → +1. Không tìm thấy → thêm dòng{" "}
                <strong>Lỗi Mã</strong> (không chặn lưu).
              </p>
            }
            inputRef={scanRef}
            value={scan}
            onChange={setScan}
            onKeyDown={handleScanKey}
            open={!!scan.trim()}
            onOpenChange={() => {}}
            showWhenTyping
            loading={catalogLoading}
            loadingText={
              <>
                Đang tải danh mục
                {catalogList.length
                  ? ` (${catalogList.length.toLocaleString("vi-VN")} mã)…`
                  : "…"}
              </>
            }
            suggestions={suggestions}
            onPick={(p) => addProduct(p as CatalogHit)}
            placeholder="Quét mã vạch, gõ mã, từ khóa tên (có/không dấu) hoặc 6 số cuối vạch:"
            inputClassName="h-11 text-sm font-semibold border-2 border-primary"
            listClassName="left-4 right-4 top-[7.5rem] mt-0"
            emptyText={
              <>
                Không tìm thấy — Enter để thêm <strong>Lỗi Mã</strong>.
                {catalogList.length ? (
                  <span className="block text-[11px] mt-1">
                    Đã tải {catalogList.length.toLocaleString("vi-VN")} mã · thử{" "}
                    <button
                      type="button"
                      className="underline text-primary"
                      onClick={() => void refetchCatalog()}
                    >
                      tải lại danh mục
                    </button>
                  </span>
                ) : null}
              </>
            }
            unitLabel={(p) => {
              const units = getSkuUnitOptions(skuUnitIndex, p.slug);
              return units.map((u) => u.unit).join("/") || p.unit || "cái";
            }}
            barcodeLabel={(p) =>
              [p.barcode, p.barcode_2].filter(Boolean).join(" · ") || "—"
            }
            renderExtraMeta={(p) => {
              const ton =
                getQty(p.slug, p.unit) ??
                getQty(p.barcode || "", p.unit) ??
                getQty(p.barcode_2 || "", p.unit_2);
              return (
                <>
                  {" "}
                  • Tồn: {ton != null ? ton : "—"}
                </>
              );
            }}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => void refetchCatalog()}
            disabled={catalogLoading}
          >
            <RefreshCw
              className={cn("w-4 h-4 mr-2", catalogLoading && "animate-spin")}
            />
            Tải lại danh mục
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => downloadImportTemplate("orderDhDc")}
          >
            <Download className="w-4 h-4 mr-2" />
            Mẫu Excel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={lines.length === 0}
            onClick={() => {
              const source = warehouses?.find((w) => w.id === sourceWh);
              exportKiotVietTransferFile(
                lines.map((l) => ({
                  maHang: l.maHang,
                  maVach: l.maVach,
                  tenHang: l.tenHang,
                  kho: source?.name || "",
                  dvt: l.dvt,
                  soLuong: l.quantity,
                })),
              );
              toast({
                title: "Đã xuất theo mẫu KiotViet",
                description:
                  "Dữ liệu bắt đầu ở dòng 6. Kiểm tra cột Kho phải đúng dạng \"MÃKHO | Tên kho\" trước khi nhập vào KiotViet.",
              });
            }}
          >
            <Download className="w-4 h-4 mr-2" />
            Xuất mẫu điều chuyển
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            Đang có{" "}
            <strong className="text-foreground tabular-nums">
              {lines.length}
            </strong>{" "}
            dòng · Tổng SL{" "}
            <strong className="text-foreground tabular-nums">
              {lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0)}
            </strong>
            {lines.length >= 80 ? (
              <span className="ml-2 text-amber-700">
                Đơn lớn — cuộn bảng bên dưới, header cố định.
              </span>
            ) : null}
          </span>
          {lines.length > 0 ? (
            <button
              type="button"
              className="underline text-sky-700 hover:text-sky-900"
              onClick={() => {
                if (confirm(`Xóa toàn bộ ${lines.length} dòng?`)) setLines([]);
              }}
            >
              Xóa hết dòng
            </button>
          ) : null}
        </div>

        <OrderItemsGrid
          lines={lines}
          skuUnitIndex={skuUnitIndex}
          getQty={getQty}
          onQty={setQty}
          onUnit={setLineUnit}
          onBarcode={setLineBarcode}
          onName={setLineName}
          onRemove={(key) =>
            setLines((prev) => prev.filter((x) => x.key !== key))
          }
        />

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-base font-semibold">
            Tổng cộng: <span className="text-primary">{totalQty}</span> món
            {totalAmount > 0 ? (
              <span className="ml-3">
                · Tổng tiền:{" "}
                <span className="text-primary tabular-nums">
                  {new Intl.NumberFormat("vi-VN", {
                    maximumFractionDigits: 0,
                  }).format(totalAmount)}
                </span>{" "}
                đ
              </span>
            ) : null}
          </div>
          <Button
            size="lg"
            onClick={() => void handleSubmit()}
            disabled={createOrder.isPending || lines.length === 0}
          >
            {createOrder.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Lưu đơn
          </Button>
        </div>
      </div>

      <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Phát hiện đơn trùng lặp</AlertDialogTitle>
            <AlertDialogDescription>
              Phát hiện đơn trùng lặp cách đây{" "}
              {dupInfo?.minutesAgo ?? "?"} phút
              {dupInfo?.peerOrderCode
                ? ` (phiếu ${dupInfo.peerOrderCode})`
                : ""}
              {dupInfo?.reason ? ` — Lý do: ${dupInfo.reason}` : ""}. Bạn có
              muốn tiếp tục lưu?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDupInfo(null);
              }}
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doSave(true);
              }}
            >
              Chấp nhận lưu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

export default CreateWarehouseOrderForm;
