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
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useWarehouses, warehouseLabel as formatWhLabel } from "@/hooks/useWarehouses";
import { useStoreScope } from "@/hooks/useStoreScope";
import { useCatalogForImport } from "@/hooks/useCatalogStockImport";
import { useStock, usePackingSourceWarehouse } from "@/hooks/useStock";
import { useWarehouseOrderMutations } from "@/hooks/useWarehouseOrders";
import type { DuplicatePreSaveResult } from "@/hooks/useOrderImport";
import type { PhieuLoai } from "@/lib/importOrders";
import { downloadImportTemplate } from "@/lib/importTemplates";
import {
  filterCatalogSuggestions,
  scoreCatalogItem,
} from "@/lib/catalogSearch";
import { checkCatalogAddBlocked } from "@/lib/catalogAddGuards";
import {
  CatalogSuggestItem,
  CatalogSuggestList,
} from "@/components/admin/CatalogSuggestDropdown";
import {
  inferPackingDayFromCreatedAt,
  getPackingSaveBanner,
  MODE_LABELS,
  normalizeOrderCodeText,
} from "@/lib/packingWindows";
import {
  buildSkuUnitIndex,
  expandProductUnitOptions,
  getSkuUnitOptions,
  isLoiMaSku,
  LOI_MA_SKU,
  resolveAvailableVariants,
  resolveUnitOption,
  type CatalogProductRow,
  type SkuUnitOption,
} from "@/lib/catalogUnitBarcode";
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
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

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
}

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
  const { data: catalog, isLoading: catalogLoading, refetch: refetchCatalog } =
    useCatalogForImport();
  const { data: q7 } = usePackingSourceWarehouse();
  const { createOrder } = useWarehouseOrderMutations();
  const { toast } = useToast();
  const scanRef = useRef<HTMLInputElement>(null);

  const [loai, setLoai] = useState<PhieuLoai>("DonHang");
  const [sourceWh, setSourceWh] = useState("");
  const [destWh, setDestWh] = useState("");
  const [scan, setScan] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<DuplicatePreSaveResult | null>(null);

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
    const rows = (catalog?.products || []) as (CatalogProductRow & {
      parent_sku?: string | null;
      is_new?: boolean;
      is_locked?: boolean;
      is_out_stock?: boolean;
    })[];
    return rows
      .filter((p) => p.slug)
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
  }, [catalog]);

  const skuUnitIndex = useMemo(
    () => buildSkuUnitIndex(catalogList as CatalogProductRow[]),
    [catalogList],
  );

  const suggestions = useMemo(
    () => filterCatalogSuggestions(catalogList, scan, 12),
    [scan, catalogList],
  );

  const exactScanHit = useMemo(() => {
    const q = normalizeOrderCodeText(scan.trim());
    if (!q) return null;
    const hits = catalogList.filter((p) => {
      const bc = normalizeOrderCodeText(p.barcode || "");
      const bc2 = normalizeOrderCodeText(p.barcode_2 || "");
      const slug = normalizeOrderCodeText(p.slug);
      return (bc && bc === q) || (bc2 && bc2 === q) || (slug && slug === q);
    });
    return hits.length === 1 ? hits[0] : null;
  }, [scan, catalogList]);

  const totalQty = useMemo(
    () => lines.reduce((s, l) => s + l.quantity, 0),
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
      const hit =
        catalogList.find(
          (p) => s && normalizeOrderCodeText(p.slug) === s,
        ) ||
        catalogList.find((p) => {
          if (!b) return false;
          return (
            normalizeOrderCodeText(p.barcode || "") === b ||
            normalizeOrderCodeText(p.barcode_2 || "") === b
          );
        });
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

  /** GAS: Enter không khớp → Lỗi Mã (không chặn lưu) */
  const addLoiMa = (raw: string) => {
    const val = raw.trim();
    if (!val) return;
    setLines((prev) => [
      {
        key: `${Date.now()}-loi-${val}`,
        maHang: LOI_MA_SKU,
        maVach: val,
        tenHang: "❌ Không tồn tại",
        dvt: "Lỗi",
        unitOptions: [],
        quantity: 1,
        productId: null,
        price: 0,
        stockQty: null,
      },
      ...prev,
    ]);
    setScan("");
    scanRef.current?.focus();
  };

  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const raw = scan.trim();
    if (!raw) return;
    if (exactScanHit) {
      addProduct(exactScanHit, raw);
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
    addLoiMa(raw);
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
        if (!l.unitOptions.length) {
          return { ...l, dvt };
        }
        const match = resolveUnitOption(l.unitOptions, dvt);
        if (!match) return { ...l, dvt };
        return {
          ...l,
          dvt: match.unit,
          maVach: match.barcode,
          productId: match.productId,
          price: match.price || l.price,
          stockQty: getQty(l.maHang, match.unit) ?? l.stockQty,
        };
      }),
    );
  };

  const setLineBarcode = (key: string, barcode: string) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, maVach: barcode } : l)),
    );
  };

  const doSave = async (acknowledgeDuplicate: boolean) => {
    try {
      const res = await createOrder.mutateAsync({
        loaiPhieu: loai,
        sourceWarehouseId: sourceWh,
        destWarehouseId: destWh,
        acknowledgeDuplicate,
        lines: lines.map((l) => ({
          productName: l.tenHang,
          productSlug: l.maHang,
          quantity: l.quantity,
          price: l.price,
          barcode: l.maVach || null,
          unit: l.dvt || null,
        })),
      });
      toast({ title: "Đã tạo phiếu", description: res.order_code });
      setLines([]);
      setDupOpen(false);
      setDupInfo(null);
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
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>
              Quét mã vạch, gõ mã, từ khóa tên (có/không dấu) hoặc 6 số cuối
              vạch
            </Label>
            <Input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanKey}
              placeholder="Quét mã vạch, gõ mã, từ khóa tên (có/không dấu) hoặc 6 số cuối vạch:"
              className="h-11 text-sm font-semibold border-2 border-primary"
              autoComplete="off"
            />
            <p className="text-[11px] text-muted-foreground">
              Quét khớp → +1. Không tìm thấy → thêm dòng{" "}
              <strong>Lỗi Mã</strong> (không chặn lưu).
            </p>
          </div>
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
        </div>

        {scan.trim() && (
          <CatalogSuggestList className="left-4 right-4 top-[7.5rem] mt-0">
            {catalogLoading ? (
              <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Đang tải danh mục
                {catalogList.length
                  ? ` (${catalogList.length.toLocaleString("vi-VN")} mã)…`
                  : "…"}
              </div>
            ) : suggestions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
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
              </div>
            ) : (
              suggestions.map((p) => {
                const ton =
                  getQty(p.slug, p.unit) ??
                  getQty(p.barcode || "", p.unit) ??
                  getQty(p.barcode_2 || "", p.unit_2);
                const units = getSkuUnitOptions(skuUnitIndex, p.slug);
                const dvtLabel =
                  units.map((u) => u.unit).join("/") || p.unit || "cái";
                const mvLabel =
                  [p.barcode, p.barcode_2].filter(Boolean).join(" · ") || "—";
                return (
                  <CatalogSuggestItem
                    key={p.id}
                    product={p}
                    unitLabel={dvtLabel}
                    barcodeLabel={mvLabel}
                    extraMeta={
                      <>
                        {" "}
                        • Tồn: {ton != null ? ton : "—"}
                      </>
                    }
                    onSelect={() => addProduct(p)}
                  />
                );
              })
            )}
          </CatalogSuggestList>
        )}

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

        <div
          className={cn(
            excelTableWrap,
            "mt-1 max-h-[min(65vh,640px)] border-teal-200/80",
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
                <TableHead className={cn(excelTh, "text-left")}>
                  Tên hàng
                </TableHead>
                <TableHead className={cn(excelTh, "w-32")}>ĐVT</TableHead>
                <TableHead
                  className={cn(excelTh, "text-right w-20 bg-emerald-100")}
                >
                  Tồn
                </TableHead>
                <TableHead className={cn(excelTh, "text-center w-32")}>
                  SL
                </TableHead>
                <TableHead className={cn(excelTh, "w-10")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
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
                  const hasUnits = l.unitOptions.length > 0;
                  const unitLocked = l.unitOptions.length === 1;
                  const tonLive =
                    getQty(l.maHang, l.dvt) ??
                    getQty(l.maVach, l.dvt) ??
                    l.stockQty;
                  return (
                    <TableRow
                      key={l.key}
                      className={cn(
                        excelTr,
                        loi && "bg-red-50/80",
                        !loi && idx % 2 === 1 && "bg-slate-50/70",
                      )}
                    >
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-muted-foreground text-center",
                        )}
                      >
                        {lines.length - idx}
                      </TableCell>
                      <TableCell className={excelTd}>
                        <div
                          className={cn(
                            "font-mono text-[13px] font-bold leading-tight uppercase",
                            loi && "text-red-700",
                          )}
                        >
                          {normalizeOrderCodeText(l.maHang) || l.maHang}
                        </div>
                      </TableCell>
                      <TableCell className={excelTd}>
                        <Input
                          className={cn(
                            "h-7 text-sm font-mono p-1",
                            hasUnits && !loi && "bg-muted",
                          )}
                          value={l.maVach}
                          readOnly={hasUnits && !loi}
                          onChange={(e) =>
                            setLineBarcode(l.key, e.target.value)
                          }
                          placeholder="Mã vạch"
                          title={
                            hasUnits && !loi
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
                        {l.tenHang}
                      </TableCell>
                      <TableCell className={excelTd}>
                        {!hasUnits || loi ? (
                          <Input
                            className="h-7 text-sm p-1"
                            value={l.dvt}
                            onChange={(e) =>
                              setLineUnit(l.key, e.target.value)
                            }
                            placeholder="ĐVT"
                          />
                        ) : (
                          <Select
                            value={
                              resolveUnitOption(l.unitOptions, l.dvt)?.unit ||
                              l.unitOptions[0]?.unit ||
                              l.dvt
                            }
                            onValueChange={(v) => setLineUnit(l.key, v)}
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
                              {l.unitOptions.map((u) => (
                                <SelectItem key={u.unit} value={u.unit}>
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
                            onClick={() => setQty(l.key, l.quantity - 1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <QtyInput
                            className="w-12 text-center h-7 p-1"
                            value={l.quantity}
                            onValueChange={(v) => setQty(l.key, v)}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7 shrink-0"
                            onClick={() => setQty(l.key, l.quantity + 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className={excelTd}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() =>
                            setLines((prev) =>
                              prev.filter((x) => x.key !== l.key),
                            )
                          }
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

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="text-base font-semibold">
            Tổng cộng: <span className="text-primary">{totalQty}</span> món
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
