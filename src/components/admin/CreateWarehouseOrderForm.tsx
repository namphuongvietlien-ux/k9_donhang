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
import { isQ7PhieuLoai, phieuLoaiToKind, type PhieuLoai } from "@/lib/importOrders";
import { downloadImportTemplate } from "@/lib/importTemplates";
import { exportKiotVietTransferFile } from "@/lib/transferExportTemplate";
import {
  filterCatalogSuggestions,
  resolveCatalogScan,
  scoreCatalogItem,
} from "@/lib/catalogSearch";
import { checkCatalogAddBlocked } from "@/lib/catalogAddGuards";
import {
  isServiceCatalogItem,
  isVisibleSellableCatalog,
} from "@/lib/productCategory";
import {
  assertLineFitsOrderKind,
  lineFitsOrderKind,
  notifyOrderKindMixBlocked,
} from "@/lib/orderKindMix";
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
  isQtyMultipleOfMoq,
  resolveAvailableVariants,
  resolveLineMoq,
  resolveLineMoqFromOptions,
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
import { useProductGifts } from "@/hooks/useProductGifts";
import { attachGiftLines } from "@/lib/productGifts";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
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
  /** unit_2_ratio từ catalog — hiển thị MOQ */
  moq?: number;
  /** SKU gõ tay / không có trong catalog — mở khóa tên/ĐVT/MV */
  isCustomSku?: boolean;
  isGift?: boolean;
  giftOfKey?: string;
  giftRuleId?: string;
}

/** Mỗi loại phiếu một giỏ riêng — soạn DH và DT song song, lưu 1 lần 2 đơn. */
type CartMap = Record<PhieuLoai, CartLine[]>;

const PHIEU_LOAI_ORDER: PhieuLoai[] = ["DonThuoc", "DonHang", "DieuChuyen"];
/** Hai thẻ Q7 có thể lưu chung một lượt (cùng kho xuất Q7 + kho nhận). */
const Q7_PAIR: PhieuLoai[] = ["DonThuoc", "DonHang"];

const emptyCarts = (): CartMap => ({
  DonThuoc: [],
  DonHang: [],
  DieuChuyen: [],
});

const LOAI_LABEL: Record<PhieuLoai, string> = {
  DonThuoc: "Đơn thuốc (DT)",
  DonHang: "Đơn hàng (DH)",
  DieuChuyen: "Điều chuyển (DC)",
};
const LOAI_SHORT: Record<PhieuLoai, string> = {
  DonThuoc: "DT",
  DonHang: "DH",
  DieuChuyen: "DC",
};

type TransferFormDraftV1 = {
  v: 1;
  loai: PhieuLoai;
  sourceWh: string;
  destWh: string;
  lines: CartLine[];
  savedAt?: string;
};

type TransferFormDraft = {
  v: 2;
  loai: PhieuLoai;
  sourceWh: string;
  destWh: string;
  carts: CartMap;
  savedAt?: string;
};

function normalizeDraftLines(rows: unknown): CartLine[] {
  return (Array.isArray(rows) ? (rows as CartLine[]) : []).map((l) => ({
    ...l,
    unitOptions: Array.isArray(l.unitOptions) ? l.unitOptions : [],
  }));
}

/** Đọc nháp v2 (nhiều giỏ) hoặc v1 (một giỏ → gán vào thẻ đang chọn). */
function cartsFromDraft(
  draft: TransferFormDraft | TransferFormDraftV1 | null | undefined,
): CartMap {
  const carts = emptyCarts();
  if (!draft) return carts;
  if (draft.v === 2 && draft.carts) {
    for (const k of PHIEU_LOAI_ORDER) {
      carts[k] = normalizeDraftLines(draft.carts[k]);
    }
    return carts;
  }
  const legacy = draft as TransferFormDraftV1;
  const loai: PhieuLoai = legacy.loai || "DonHang";
  carts[loai] = normalizeDraftLines(legacy.lines);
  return carts;
}

function countCartLines(carts: CartMap): number {
  return PHIEU_LOAI_ORDER.reduce((s, k) => s + carts[k].length, 0);
}

interface CatalogHit {
  id: string;
  name: string;
  slug: string;
  barcode: string | null;
  unit: string | null;
  unit_2: string | null;
  barcode_2: string | null;
  unit_2_ratio?: number | null;
  price: number;
  price_2?: number | null;
  parent_sku?: string | null;
  is_new?: boolean;
  is_locked?: boolean;
  is_out_stock?: boolean;
  category_group?: string | null;
  sku_industry?: string | null;
  sku_detail?: string | null;
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
  const { data: giftRules = [] } = useProductGifts();
  const { toast } = useToast();
  const scanRef = useRef<HTMLInputElement>(null);

  const initialDraftRef = useRef(
    peekLocalDraft<TransferFormDraft | TransferFormDraftV1>(
      K9_DRAFT_ORDER_TRANSFER,
    ),
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
  const [allowPartial, setAllowPartial] = useState(false);
  const [carts, setCarts] = useState<CartMap>(() =>
    cartsFromDraft(initialDraft),
  );
  /** Giỏ của thẻ đang chọn */
  const lines = carts[loai];
  const setCartLines = (
    target: PhieuLoai,
    updater: CartLine[] | ((prev: CartLine[]) => CartLine[]),
  ) => {
    setCarts((prev) => ({
      ...prev,
      [target]:
        typeof updater === "function" ? updater(prev[target]) : updater,
    }));
  };
  const setLines = (
    updater: CartLine[] | ((prev: CartLine[]) => CartLine[]),
  ) => setCartLines(loai, updater);
  const [dupOpen, setDupOpen] = useState(false);
  const [dupInfo, setDupInfo] = useState<DuplicatePreSaveResult | null>(null);
  /** Danh sách loại phiếu còn phải lưu sau khi user chấp nhận đơn trùng */
  const [dupTargets, setDupTargets] = useState<PhieuLoai[]>([]);

  const draftPayload = useMemo(
    (): TransferFormDraft => ({
      v: 2,
      loai,
      sourceWh,
      destWh,
      carts,
      savedAt: new Date().toISOString(),
    }),
    [loai, sourceWh, destWh, carts],
  );
  const totalDraftLines = countCartLines(carts);
  const formDirty = totalDraftLines > 0;
  const { clearDraft } = useLocalDraft({
    storageKey: K9_DRAFT_ORDER_TRANSFER,
    value: draftPayload,
    isDirty: formDirty,
    debounceMs: 1000,
  });

  useEffect(() => {
    if (restoredToastShown.current) return;
    const restored = cartsFromDraft(initialDraft);
    const total = countCartLines(restored);
    if (!total) return;
    restoredToastShown.current = true;
    const parts = PHIEU_LOAI_ORDER.filter((k) => restored[k].length).map(
      (k) => `${LOAI_SHORT[k]}: ${restored[k].length} dòng`,
    );
    toast({
      title: "Đã khôi phục bản nháp chưa lưu trước đó!",
      description: parts.join(" · "),
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
    if (isQ7PhieuLoai(loai)) {
      // Đơn hàng / đơn thuốc: xuất luôn Q7
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
    if (isQ7PhieuLoai(loai)) setDestWh(scopedWhId);
    else setSourceWh(scopedWhId);
  }, [isStoreScoped, scopedWhId, loai]);

  const catalogList: CatalogHit[] = useMemo(() => {
    const rows = Array.isArray(products) ? products : [];
    return rows
      .filter((p) => isVisibleSellableCatalog(p))
      .map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug!,
        barcode: p.barcode || null,
        unit: p.unit,
        unit_2: p.unit_2 || null,
        barcode_2: p.barcode_2 || null,
        unit_2_ratio: Number(p.unit_2_ratio) || null,
        price: Number(p.price) || 0,
        price_2: Number(p.price_2) || null,
        parent_sku: p.parent_sku || null,
        is_new: !!p.is_new,
        is_locked: !!p.is_locked,
        is_out_stock: !!p.is_out_stock,
        category_group: p.category_group || null,
        sku_industry: p.sku_industry || null,
        sku_detail: p.sku_detail || null,
      }));
  }, [products]);

  const skuUnitIndex = useSkuUnitIndex(catalogList as CatalogProductRow[]);

  const withGifts = (rows: CartLine[], forLoai: PhieuLoai = loai): CartLine[] => {
    const kind = phieuLoaiToKind(forLoai);
    return attachGiftLines(rows, giftRules, {
      isGift: (line) => !!line.isGift,
      mainOf: (line) => ({
        id: line.productId,
        slug: line.maHang,
        quantity: line.quantity,
      }),
      makeGift: (main, seed) => {
        const hit = catalogList.find(
          (p) =>
            p.id === seed.giftProductId ||
            normalizeOrderCodeText(p.slug) === seed.slug,
        );
        return {
          key: `gift-${main.key}-${seed.ruleId}`,
          maHang: seed.slug,
          maVach: hit?.barcode || "",
          tenHang: `${seed.name} (tặng kèm)`,
          dvt: seed.unit,
          unitOptions: [],
          quantity: seed.quantity,
          productId: seed.giftProductId,
          price: 0,
          stockQty: getQty(seed.slug, seed.unit),
          isGift: true,
          giftOfKey: main.key,
          giftRuleId: seed.ruleId,
        };
      },
    }).filter((line) => {
      if (!line.isGift) return true;
      const hit = catalogList.find(
        (p) =>
          p.id === line.productId ||
          normalizeOrderCodeText(p.slug) === normalizeOrderCodeText(line.maHang),
      );
      return lineFitsOrderKind(kind, hit || { slug: line.maHang, name: line.tenHang });
    });
  };

  useEffect(() => {
    if (!giftRules.length) return;
    setCarts((prev) => {
      const sig = (rows: CartLine[]) =>
        rows
          .filter((l) => l.isGift)
          .map((l) => `${l.key}:${l.quantity}`)
          .join("|");
      let changed = false;
      const next = { ...prev };
      for (const k of PHIEU_LOAI_ORDER) {
        if (!prev[k].length) continue;
        const rows = withGifts(prev[k], k);
        if (sig(prev[k]) !== sig(rows)) {
          next[k] = rows;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- withGifts đọc catalog/giftRules hiện tại
  }, [giftRules]);

  /**
   * Thẻ Q7 (DH/DT): mã không hợp thẻ đang chọn → thẻ Q7 còn lại (nếu hợp).
   * DC nhận mọi mã → null. Trả null khi mã hợp thẻ hiện tại.
   */
  const suggestLoaiFor = (p: CatalogHit): PhieuLoai | null => {
    if (loai === "DieuChuyen") return null;
    if (lineFitsOrderKind(phieuLoaiToKind(loai), p)) return null;
    const other: PhieuLoai = loai === "DonHang" ? "DonThuoc" : "DonHang";
    return lineFitsOrderKind(phieuLoaiToKind(other), p) ? other : null;
  };

  // Lọc mã vạch chặt (exact / prefix) đã nằm trong filterCatalogSuggestions —
  // không vá lại ở tầng form để hai nơi không lệch nhau.
  const suggestions = useMemo(
    () =>
      filterCatalogSuggestions(
        catalogList.filter((p) => {
          if (isServiceCatalogItem(p)) return false;
          return lineFitsOrderKind(phieuLoaiToKind(loai), p);
        }),
        scan,
        12,
      ),
    [scan, catalogList, loai],
  );

  /** Mã khớp từ khóa nhưng thuộc thẻ Q7 còn lại — dùng để gợi ý khi "không tìm thấy". */
  const otherTabSuggestions = useMemo((): CatalogHit[] => {
    if (!scan.trim() || suggestions.length) return [];
    return filterCatalogSuggestions(
      catalogList.filter(
        (p) => !isServiceCatalogItem(p) && suggestLoaiFor(p) !== null,
      ),
      scan,
      5,
    ) as CatalogHit[];
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggestLoaiFor chỉ phụ thuộc loai
  }, [scan, catalogList, loai, suggestions.length]);

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

  /**
   * Mã thuộc thẻ Q7 còn lại → báo rõ DT/DH + nút thêm thẳng vào thẻ đó
   * (không phải đổi thẻ, không tạo dòng Lỗi Mã).
   */
  const suggestOtherTab = (
    p: CatalogHit,
    target: PhieuLoai,
    preferredBarcode?: string,
  ) => {
    const isMed = phieuLoaiToKind(target) === "DT";
    toast({
      title: `${normalizeOrderCodeText(p.slug)} là ${isMed ? "THUỐC" : "HÀNG HÓA"} → thuộc ${LOAI_LABEL[target]}`,
      description: `${p.name}. Không thêm được vào ${LOAI_LABEL[loai]} — bấm "Thêm vào ${LOAI_SHORT[target]}" để đặt song song.`,
      variant: "destructive",
      action: (
        <ToastAction
          altText={`Thêm vào ${LOAI_SHORT[target]}`}
          onClick={() => addProduct(p, preferredBarcode, target)}
        >
          Thêm vào {LOAI_SHORT[target]}
        </ToastAction>
      ),
    });
    scanRef.current?.focus();
  };

  const addProduct = (
    p: CatalogHit,
    preferredBarcode?: string,
    target: PhieuLoai = loai,
  ) => {
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
    const mix = assertLineFitsOrderKind(phieuLoaiToKind(target), p);
    if (!mix.ok) {
      const other = target === loai ? suggestLoaiFor(p) : null;
      if (other) {
        suggestOtherTab(p, other, preferredBarcode);
        return;
      }
      notifyOrderKindMixBlocked();
      toast({ title: mix.message, variant: "destructive" });
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

    const catalogMoq = Number(p.unit_2_ratio) > 1 ? Number(p.unit_2_ratio) : 1;
    const moq = resolveLineMoq(p, unit);

    setCartLines(target, (prev) => {
      const exist = prev.find(
        (l) =>
          !l.isGift &&
          normalizeOrderCodeText(l.maHang) === ma &&
          normalizeOrderCodeText(l.dvt) === normalizeOrderCodeText(unit),
      );
      if (exist) {
        return withGifts(
          prev.map((l) =>
            l.key === exist.key
              ? { ...l, quantity: l.quantity + moq, moq: catalogMoq }
              : l,
          ),
          target,
        );
      }
      return withGifts(
        [
          {
            key: `${Date.now()}-${ma}-${unit}`,
            maHang: ma,
            maVach: barcode,
            tenHang: p.name,
            dvt: unit,
            unitOptions: opts,
            quantity: moq,
            productId: picked?.productId || p.id,
            price: picked?.price ?? p.price ?? 0,
            stockQty: getQty(ma, unit),
            moq: catalogMoq,
          },
          ...prev,
        ],
        target,
      );
    });
    if (target !== loai) {
      toast({
        title: `Đã thêm vào ${LOAI_LABEL[target]}`,
        description: `${ma} · ${p.name}. Thẻ ${LOAI_SHORT[target]} đang soạn song song — bấm "Lưu cả DT + DH" để tạo 2 đơn một lần.`,
        action: (
          <ToastAction altText="Mở thẻ" onClick={() => setLoai(target)}>
            Mở thẻ {LOAI_SHORT[target]}
          </ToastAction>
        ),
      });
    }
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
        return withGifts(
          prev.map((l) =>
            l.key === exist.key ? { ...l, quantity: l.quantity + 1 } : l,
          ),
        );
      }
      return withGifts([
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
      ]);
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
    // Không có trong thẻ này nhưng có ở thẻ Q7 còn lại → gợi ý DT/DH thay vì tạo Lỗi Mã
    if (otherTabSuggestions.length) {
      const best = otherTabSuggestions[0];
      const target = suggestLoaiFor(best);
      if (
        target &&
        (otherTabSuggestions.length === 1 ||
          scoreCatalogItem(best, scan) >= 1200)
      ) {
        suggestOtherTab(best, target, raw);
        return;
      }
      const isMed = loai === "DonHang";
      toast({
        title: `Không có trong ${LOAI_LABEL[loai]} — ${otherTabSuggestions.length} mã khớp là ${isMed ? "THUỐC" : "HÀNG HÓA"}`,
        description: `${otherTabSuggestions
          .map((p) => normalizeOrderCodeText(p.slug))
          .join(", ")} → thuộc ${LOAI_LABEL[isMed ? "DonThuoc" : "DonHang"]}. Chọn mã trong danh sách gợi ý để thêm đúng thẻ.`,
        variant: "destructive",
      });
      return;
    }
    addCustomSku(raw);
  };

  const setQty = (key: string, qty: number) => {
    setLines((prev) =>
      withGifts(
        prev
          .map((l) =>
            l.key === key ? { ...l, quantity: Math.max(0, qty) } : l,
          )
          .filter((l) => l.quantity > 0),
      ),
    );
  };

  /** Đổi ĐVT → sync mã vạch ngay (giữ mã hàng + tên) */
  const setLineUnit = (key: string, dvt: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const synced = syncDraftLineUnit(l, dvt, {
          skuUnitIndex,
          getStockQty: (ma, unit) => getQty(ma, unit),
        });
        
        const hit = catalogList.find(
          (p) =>
            p.id === l.productId ||
            normalizeOrderCodeText(p.slug) ===
              normalizeOrderCodeText(l.maHang),
        );
        const catalogMoq =
          Number(hit?.unit_2_ratio) > 1 ? Number(hit!.unit_2_ratio) : 1;
        const moq = resolveLineMoq(hit, dvt);
        synced.moq = catalogMoq;
        if (moq > 1 && !isQtyMultipleOfMoq(synced.quantity, moq)) {
          synced.quantity = moq;
        }
        return synced;
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

  /**
   * Lưu một phiếu cho thẻ `target`.
   * @returns "ok" | "empty" | "blocked" (lỗi nhập liệu / lỗi server) | "dup" (đã mở dialog trùng)
   */
  const saveOne = async (
    target: PhieuLoai,
    acknowledgeDuplicate: boolean,
  ): Promise<"ok" | "empty" | "blocked" | "dup"> => {
    const rows = carts[target];
    if (!rows.length) return "empty";
    const tag = LOAI_LABEL[target];
    const preparedLines = rows.map((l) => {
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
        title: `Thiếu mã hàng — ${tag}`,
        description: "Mỗi dòng cần có mã hàng trước khi lưu.",
        variant: "destructive",
      });
      return "blocked";
    }

    const lineMoq = (l: CartLine) => {
      const hit = catalogList.find(
        (p) =>
          normalizeOrderCodeText(p.slug) ===
          normalizeOrderCodeText(l.maHang),
      );
      if (hit && Number(hit.unit_2_ratio) > 1) {
        return resolveLineMoq(hit, l.dvt);
      }
      return resolveLineMoqFromOptions(
        getSkuUnitOptions(skuUnitIndex, l.maHang),
        l.dvt,
        l.moq ?? hit?.unit_2_ratio,
      );
    };
    const moqBad = preparedLines.find((l) => {
      if (l.quantity <= 0 || l.isCustomSku || l.isGift) return false;
      return !isQtyMultipleOfMoq(l.quantity, lineMoq(l));
    });
    if (moqBad && !allowPartial) {
      toast({
        title: `Chưa đạt số lượng MOQ — ${tag}`,
        description:
          "Bạn đang nhập số lượng lẻ. Vui lòng tick vào ô 'Xác nhận cho phép xuất lẻ' ở trên bảng để lưu đơn.",
        variant: "destructive",
      });
      return "blocked";
    }

    const kind = phieuLoaiToKind(target);
    const mixBad = preparedLines.find((l) => {
      const hit = catalogList.find(
        (p) =>
          p.id === l.productId ||
          normalizeOrderCodeText(p.slug) === normalizeOrderCodeText(l.maHang),
      );
      return !lineFitsOrderKind(
        kind,
        hit || { slug: l.maHang, name: l.tenHang },
      );
    });
    if (mixBad) {
      notifyOrderKindMixBlocked();
      toast({
        title: `${tag}: không được trộn lẫn! Vui lòng nhập thuốc và hàng hóa riêng biệt`,
        description: `Dòng ${normalizeOrderCodeText(mixBad.maHang)} không thuộc ${tag}.`,
        variant: "destructive",
      });
      return "blocked";
    }

    // DH/DT luôn xuất Q7 dù thẻ đang mở là DC
    const sourceForTarget = isQ7PhieuLoai(target)
      ? q7?.id || sourceWh
      : sourceWh;

    try {
      const res = await createOrder.mutateAsync({
        loaiPhieu: target,
        sourceWarehouseId: sourceForTarget,
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
          isGift: !!l.isGift,
          giftRuleId: l.giftRuleId || null,
        })),
      });
      toast({ title: `Đã tạo phiếu ${LOAI_SHORT[target]}`, description: res.order_code });
      setCartLines(target, []);
      onCreated?.(res.id);
      return "ok";
    } catch (e) {
      const dup = (e as Error & { duplicate?: DuplicatePreSaveResult })
        ?.duplicate;
      if (dup?.isDuplicate && !acknowledgeDuplicate) {
        setDupInfo(dup);
        setDupOpen(true);
        return "dup";
      }
      toast({
        title: `Không tạo được phiếu ${LOAI_SHORT[target]}`,
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
      if (e instanceof Error && e.message.includes("trộn lẫn")) {
        notifyOrderKindMixBlocked();
      }
      return "blocked";
    }
  };

  /**
   * Lưu lần lượt các thẻ trong `targets` (bỏ thẻ trống). Gặp đơn trùng → mở dialog,
   * nhớ các thẻ còn lại vào `dupTargets` để tiếp tục sau khi user chấp nhận.
   */
  const doSave = async (acknowledgeDuplicate: boolean, targets: PhieuLoai[]) => {
    const queue = targets.filter((t) => carts[t].length > 0);
    if (!queue.length) {
      toast({ title: "Chưa có hàng", variant: "destructive" });
      return;
    }
    let saved = 0;
    for (let i = 0; i < queue.length; i++) {
      const t = queue[i];
      // Chỉ đơn đầu tiên trong lượt được coi là đã xác nhận trùng
      const ack = acknowledgeDuplicate && i === 0;
      const r = await saveOne(t, ack);
      if (r === "ok") {
        saved += 1;
        continue;
      }
      if (r === "dup") {
        setDupTargets(queue.slice(i));
        return;
      }
      if (r === "blocked") {
        setLoai(t);
        break;
      }
    }
    setDupOpen(false);
    setDupInfo(null);
    setDupTargets([]);
    if (saved > 0) {
      void refetchCatalog();
      if (saved > 1) {
        toast({
          title: `Đã tạo ${saved} phiếu`,
          description: queue.map((t) => LOAI_SHORT[t]).join(" + "),
        });
      }
    }
    const remaining = countCartLines({
      ...carts,
      ...Object.fromEntries(queue.slice(0, saved).map((t) => [t, []])),
    } as CartMap);
    if (remaining === 0) {
      clearDraft();
      setAllowPartial(false);
    }
    scanRef.current?.focus();
  };

  const handleSubmit = async () => {
    if (!lines.length) {
      toast({ title: "Chưa có hàng", variant: "destructive" });
      return;
    }
    await doSave(false, [loai]);
  };

  /** Lưu cả 2 thẻ Q7 (DT trước, DH sau) trong một lượt */
  const q7PairCount = Q7_PAIR.filter((t) => carts[t].length > 0).length;
  const handleSubmitPair = async () => {
    if (q7PairCount === 0) {
      toast({ title: "Chưa có hàng", variant: "destructive" });
      return;
    }
    await doSave(false, Q7_PAIR);
  };

  const srcWh = warehouses.find((w) => w.id === sourceWh);
  const destWhRow = warehouses.find((w) => w.id === destWh);
  const srcCode = srcWh ? formatWhLabel(srcWh) : "—";
  const destCode = destWhRow ? formatWhLabel(destWhRow) : "—";
  /** Đơn hàng: khóa xuất Q7; Điều chuyển + CN: khóa xuất = kho được cấp */
  const sourceLocked =
    isQ7PhieuLoai(loai) || (loai === "DieuChuyen" && isStoreScoped);
  const destLocked = isQ7PhieuLoai(loai) && isStoreScoped;

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
          <Label>Loại đơn — mỗi thẻ là một phiếu riêng, soạn song song</Label>
          <div
            role="tablist"
            aria-label="Loại đơn"
            className="inline-flex flex-wrap gap-1 rounded-md bg-muted p-1"
          >
            {(
              [
                ["DonThuoc", "Đơn thuốc", "DT- · lấy từ Q7"],
                ["DonHang", "Đơn hàng", "DH- · lấy từ Q7"],
                ["DieuChuyen", "Điều chuyển", "DC- · giữa các kho"],
              ] as [PhieuLoai, string, string][]
            ).map(([value, title, sub]) => {
              const active = loai === value;
              const count = carts[value].length;
              return (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-testid={`tab-${LOAI_SHORT[value]}`}
                  onClick={() => setLoai(value)}
                  className={cn(
                    "flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm font-semibold"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span>
                    {title}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      ({sub})
                    </span>
                  </span>
                  <span
                    className={cn(
                      "min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-[11px] tabular-nums text-center",
                      count > 0
                        ? value === "DonThuoc"
                          ? "bg-sky-100 text-sky-800"
                          : value === "DonHang"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        : "bg-muted-foreground/10 text-muted-foreground",
                    )}
                    title={`${count} dòng trong ${LOAI_LABEL[value]}`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Quét mã thuốc khi đang ở thẻ DH (hoặc ngược lại) → hệ thống báo mã
            thuộc thẻ nào và cho thêm thẳng vào thẻ đó. Bấm{" "}
            <strong>Lưu cả DT + DH</strong> để tạo 2 phiếu một lần.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>
              Kho xuất
              {sourceLocked ? (
                <span className="text-xs text-muted-foreground ml-1">
                  {isQ7PhieuLoai(loai)
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
                Quét khớp → +MOQ. Không tìm thấy → thêm dòng{" "}
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
              otherTabSuggestions.length ? (
                <div className="space-y-1.5" data-testid="other-tab-suggest">
                  <div className="text-foreground">
                    Không có trong <strong>{LOAI_LABEL[loai]}</strong>. Mã này là{" "}
                    <strong
                      className={
                        loai === "DonHang" ? "text-sky-800" : "text-emerald-800"
                      }
                    >
                      {loai === "DonHang" ? "THUỐC" : "HÀNG HÓA"}
                    </strong>{" "}
                    → thuộc{" "}
                    <strong>
                      {LOAI_LABEL[loai === "DonHang" ? "DonThuoc" : "DonHang"]}
                    </strong>
                    :
                  </div>
                  <ul className="space-y-1">
                    {otherTabSuggestions.map((p) => {
                      const target = suggestLoaiFor(p);
                      if (!target) return null;
                      return (
                        <li
                          key={p.id}
                          className="flex items-center justify-between gap-2 rounded border bg-background px-2 py-1"
                        >
                          <span className="min-w-0 truncate">
                            <span className="font-mono font-semibold">
                              {normalizeOrderCodeText(p.slug)}
                            </span>{" "}
                            <span className="text-muted-foreground">{p.name}</span>
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="h-7 shrink-0"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => addProduct(p, scan.trim(), target)}
                          >
                            Thêm vào {LOAI_SHORT[target]}
                          </Button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="text-[11px]">
                    Thẻ {LOAI_SHORT[loai === "DonHang" ? "DonThuoc" : "DonHang"]}{" "}
                    soạn song song; lưu 2 phiếu cùng lúc bằng nút{" "}
                    <strong>Lưu cả DT + DH</strong>.
                  </div>
                </div>
              ) : (
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
              )
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
              const moq = resolveLineMoq(p, p.unit);
              return (
                <>
                  {" "}
                  • Tồn: {ton != null ? ton : "—"}
                  {moq > 1 ? ` • MOQ: ${moq}` : ""}
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

        <div className="flex items-center gap-2 mb-2 bg-amber-50 border border-amber-200 text-amber-800 p-2 rounded-md w-fit">
          <input
            type="checkbox"
            id="allowPartial"
            className="w-4 h-4 cursor-pointer accent-amber-600"
            checked={allowPartial}
            onChange={(e) => setAllowPartial(e.target.checked)}
          />
          <Label
            htmlFor="allowPartial"
            className="cursor-pointer font-semibold text-xs"
          >
            Xác nhận cho phép xuất lẻ (nhập số lượng dưới mức MOQ quy định)
          </Label>
        </div>

        <OrderItemsGrid
          lines={lines}
          skuUnitIndex={skuUnitIndex}
          allowPartial={allowPartial}
          getQty={getQty}
          onQty={setQty}
          onUnit={setLineUnit}
          onBarcode={setLineBarcode}
          onName={setLineName}
          onRemove={(key) =>
            setLines((prev) =>
              withGifts(
                prev.filter((x) => x.key !== key && x.giftOfKey !== key),
              ),
            )
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
          <div className="flex flex-wrap items-center gap-2">
            {isQ7PhieuLoai(loai) && q7PairCount === 2 ? (
              <Button
                size="lg"
                variant="secondary"
                data-testid="save-pair"
                onClick={() => void handleSubmitPair()}
                disabled={createOrder.isPending}
                title={`Tạo 2 phiếu: DT (${carts.DonThuoc.length} dòng) + DH (${carts.DonHang.length} dòng)`}
              >
                {createOrder.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : null}
                Lưu cả DT + DH
                <span className="ml-1 text-xs font-normal opacity-80">
                  ({carts.DonThuoc.length} + {carts.DonHang.length} dòng)
                </span>
              </Button>
            ) : null}
            <Button
              size="lg"
              data-testid="save-one"
              onClick={() => void handleSubmit()}
              disabled={createOrder.isPending || lines.length === 0}
            >
              {createOrder.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Lưu đơn {LOAI_SHORT[loai]}
            </Button>
          </div>
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
                setDupTargets([]);
              }}
            >
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void doSave(true, dupTargets.length ? dupTargets : [loai]);
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
