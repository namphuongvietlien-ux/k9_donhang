import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  Eye,
  Loader2,
  Lock,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlock,
  XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { useStoreScope } from "@/hooks/useStoreScope";
import { useCatalogForImport } from "@/hooks/useCatalogStockImport";
import {
  usePackingSourceWarehouse,
  useStock,
} from "@/hooks/useStock";
import {
  useSalesVoucherByCode,
  useSalesVoucherMutations,
  useSalesVouchers,
  fetchSalesVoucherItemsByVoucherIds,
  type SalesLineKind,
  type SalesVoucherItem,
} from "@/hooks/useSalesVouchers";
import {
  buildSkuUnitIndex,
  expandProductUnitOptions,
  getSkuUnitOptions,
  resolveUnitOption,
  resolveAvailableVariants,
  type CatalogProductRow,
  type SkuUnitOption,
} from "@/lib/catalogUnitBarcode";
import {
  generateXbCode,
  isSalesServiceLine,
  normalizeInvoiceNo,
} from "@/lib/salesVoucher";
import {
  openSalesInvoicePdfWindow,
  salesVoucherToPrintDetail,
} from "@/lib/salesVoucherPrint";
import { getPackingSaveBanner, normalizeOrderCodeText } from "@/lib/packingWindows";
import {
  filterCatalogSuggestions,
  resolveCatalogScan,
  scoreCatalogItem,
} from "@/lib/catalogSearch";
import { checkCatalogAddBlocked } from "@/lib/catalogAddGuards";
import {
  isMedicineCategory,
  isServiceCatalogItem,
  SERVICE_PICK_MEDICINE_DESC,
  SERVICE_PICK_MEDICINE_TITLE,
} from "@/lib/productCategory";
import {
  CatalogSuggestItem,
  CatalogSuggestList,
} from "@/components/admin/CatalogSuggestDropdown";
import { useAuth } from "@/contexts/AuthContext";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  K9_DRAFT_ORDER_SALES,
  peekLocalDraft,
  useLocalDraft,
} from "@/hooks/useLocalDraft";

interface CartLine {
  key: string;
  maHang: string;
  maVach: string;
  tenHang: string;
  dvt: string;
  unitOptions: SkuUnitOption[];
  quantity: number;
  unitPrice: number;
  serviceFee: number;
  lineKind: SalesLineKind;
}

type SalesFormDraft = {
  v: 1;
  branchId: string;
  invoiceDraft: string;
  invoiceLocked: string | null;
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
  is_locked?: boolean;
  is_out_stock?: boolean;
  is_new?: boolean;
  category_group?: string | null;
}

function lineAmount(l: CartLine): number {
  const qty = Number(l.quantity) || 0;
  if (l.lineKind === "DV") return qty * (Number(l.serviceFee) || 0);
  return qty * (Number(l.unitPrice) || 0);
}

function formatMoney(n: number) {
  return Math.round(n || 0).toLocaleString("vi-VN");
}

/**
 * Tab Xuất Bán (XB) — layout: danh sách trên / form tạo dưới (GAS Xuất Bán Hàng).
 */
export default function BanKemDvPanel() {
  const { warehouses } = useWarehouses();
  const { user, role } = useAuth();
  const {
    warehouseId: scopedWhId,
    warehouseCode: scopedWhCode,
    warehouseLabel: scopedLabel,
    isStoreScoped,
  } = useStoreScope();
  const isAdmin = role === "super_admin" || role === "manager";
  const { data: catalog, isLoading: catalogLoading, refetch: refetchCatalog } =
    useCatalogForImport();
  const { data: q7 } = usePackingSourceWarehouse();
  const { getQty } = useStock(q7?.id || null);
  const { createVoucher, cancelVoucher, restoreVoucher } =
    useSalesVoucherMutations();
  const { toast } = useToast();
  const scanRef = useRef<HTMLInputElement>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const branches = useMemo(() => {
    const list = warehouses.filter((w) => w.code !== "Q7");
    // Chi nhánh: chỉ hiện kho được cấp (kể cả nếu là Q7)
    if (isStoreScoped && scopedWhId) {
      const mine = warehouses.find((w) => w.id === scopedWhId);
      return mine ? [mine] : list;
    }
    return list;
  }, [warehouses, isStoreScoped, scopedWhId]);

  /* —— List filters —— */
  const [listSearch, setListSearch] = useState("");
  const [listStatus, setListStatus] = useState("ALL");
  const [listBranch, setListBranch] = useState("ALL");
  const [listDays, setListDays] = useState(30);
  const {
    data: vouchers,
    isLoading: listLoading,
    refetch: refetchList,
  } = useSalesVouchers({
    days: listDays,
    search: listSearch,
    status: listStatus,
    warehouseCode: isStoreScoped && scopedWhCode ? scopedWhCode : listBranch,
  });

  /* —— Deep link ?xb=XB-xxxxxx —— */
  const xbParam = searchParams.get("xb");
  const { data: deepVoucher } = useSalesVoucherByCode(xbParam);
  const openedDeep = useRef<string | null>(null);

  useEffect(() => {
    if (!deepVoucher?.voucher_code) return;
    if (openedDeep.current === deepVoucher.voucher_code) return;
    openedDeep.current = deepVoucher.voucher_code;
    openSalesInvoicePdfWindow(salesVoucherToPrintDetail(deepVoucher));
  }, [deepVoucher]);

  /* —— Create form —— */
  const initialDraftRef = useRef(
    peekLocalDraft<SalesFormDraft>(K9_DRAFT_ORDER_SALES),
  );
  const initialDraft = initialDraftRef.current;
  const restoredToastShown = useRef(false);

  const [branchId, setBranchId] = useState(
    () => initialDraft?.branchId || "",
  );
  const [invoiceDraft, setInvoiceDraft] = useState(
    () => initialDraft?.invoiceDraft || "",
  );
  const [invoiceLocked, setInvoiceLocked] = useState<string | null>(
    () => initialDraft?.invoiceLocked ?? null,
  );
  const [invoiceError, setInvoiceError] = useState(false);
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

  const draftPayload = useMemo(
    (): SalesFormDraft => ({
      v: 1,
      branchId,
      invoiceDraft,
      invoiceLocked,
      lines,
      savedAt: new Date().toISOString(),
    }),
    [branchId, invoiceDraft, invoiceLocked, lines],
  );
  const formDirty =
    lines.length > 0 || !!invoiceLocked || !!invoiceDraft.trim();
  const { clearDraft } = useLocalDraft({
    storageKey: K9_DRAFT_ORDER_SALES,
    value: draftPayload,
    isDirty: formDirty,
    debounceMs: 1000,
  });

  useEffect(() => {
    if (restoredToastShown.current) return;
    if (
      !initialDraft?.lines?.length &&
      !initialDraft?.invoiceLocked &&
      !initialDraft?.invoiceDraft
    ) {
      return;
    }
    restoredToastShown.current = true;
    toast({
      title: "Đã khôi phục bản nháp chưa lưu trước đó!",
      description: initialDraft.lines?.length
        ? `${initialDraft.lines.length} dòng xuất bán`
        : "Hóa đơn / chi nhánh đã nhập",
    });
  }, [toast, initialDraft]);

  useEffect(() => {
    if (isStoreScoped && scopedWhId) {
      setBranchId(scopedWhId);
      if (scopedWhCode) setListBranch(scopedWhCode);
      return;
    }
    if (branchId) return;
    const list = branches.length ? branches : warehouses;
    if (list[0]) setBranchId(list[0].id);
  }, [
    branches,
    warehouses,
    branchId,
    isStoreScoped,
    scopedWhId,
    scopedWhCode,
  ]);

  const catalogList: CatalogHit[] = useMemo(() => {
    const rows = (catalog?.products || []) as (CatalogProductRow & {
      parent_sku?: string | null;
      is_locked?: boolean;
      is_out_stock?: boolean;
      is_new?: boolean;
      category_group?: string | null;
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
        is_locked: !!p.is_locked,
        is_out_stock: !!p.is_out_stock,
        is_new: !!p.is_new,
        category_group: p.category_group || null,
      }));
  }, [catalog]);

  const skuUnitIndex = useMemo(
    () => buildSkuUnitIndex(catalogList as CatalogProductRow[]),
    [catalogList],
  );

  const suggestions = useMemo(() => {
    if (!invoiceLocked) return [];
    return filterCatalogSuggestions(
      catalogList.filter((p) => !isServiceCatalogItem(p)),
      scan,
      12,
    );
  }, [scan, catalogList, invoiceLocked]);

  /** Mã hàng thắng mã vạch; mã vạch dùng chung nhiều mã hàng → bắt chọn tay */
  const exactScan = useMemo(
    () => resolveCatalogScan(catalogList, scan),
    [scan, catalogList],
  );

  const qtyErrors = useMemo(
    () => lines.filter((l) => !(l.quantity > 0)).map((l) => l.key),
    [lines],
  );

  const totalHang = useMemo(
    () =>
      lines
        .filter((l) => l.lineKind === "HANG")
        .reduce((s, l) => s + lineAmount(l), 0),
    [lines],
  );
  const totalDv = useMemo(
    () =>
      lines
        .filter((l) => l.lineKind === "DV")
        .reduce((s, l) => s + lineAmount(l), 0),
    [lines],
  );
  const grandTotal = totalHang + totalDv;

  const lockInvoice = () => {
    const so = normalizeInvoiceNo(invoiceDraft);
    if (!so) {
      setInvoiceError(true);
      toast({
        title: "Thiếu số hóa đơn",
        description: "Nhập Số Hóa Đơn MISA/KiotViet (bắt buộc).",
        variant: "destructive",
      });
      return;
    }
    if (!branchId) {
      toast({
        title: "Chọn chi nhánh",
        description: "Chọn chi nhánh xuất bán trước khi khóa HĐ.",
        variant: "destructive",
      });
      return;
    }
    setInvoiceError(false);
    setInvoiceLocked(so);
    setInvoiceDraft(so);
    scanRef.current?.focus();
    toast({ title: `Đã khóa HĐ ${so}` });
  };

  const unlockInvoice = () => {
    if (lines.length && !confirm("Đổi HĐ sẽ giữ giỏ hiện tại. Tiếp tục?")) return;
    setInvoiceLocked(null);
  };

  const addProduct = (p: CatalogHit) => {
    if (!invoiceLocked) return;
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
    const opts = resolveAvailableVariants(
      catalogList as CatalogProductRow[],
      p.slug,
    );
    const unitOpts =
      opts.length > 0
        ? opts
        : expandProductUnitOptions(p as CatalogProductRow);
    const bc = normalizeOrderCodeText(scan.trim());
    const picked =
      unitOpts.find((o) => normalizeOrderCodeText(o.barcode) === bc) ||
      unitOpts[0];
    const dvt = picked?.unit || p.unit || "cái";
    const ma = normalizeOrderCodeText(p.slug);
    const looksService = isSalesServiceLine({
      productSlug: p.slug,
      productName: p.name,
      unit: dvt,
    });
    if (looksService && !isMedicineCategory(p.category_group)) {
      toast({
        title: SERVICE_PICK_MEDICINE_TITLE,
        description: SERVICE_PICK_MEDICINE_DESC,
        variant: "destructive",
      });
      setScan("");
      scanRef.current?.focus();
      return;
    }
    const kind: SalesLineKind = "HANG";
    const price = picked?.price || p.price || 0;

    setLines((prev) => {
      const exist = prev.find(
        (l) =>
          normalizeOrderCodeText(l.maHang) === ma &&
          normalizeOrderCodeText(l.dvt) === normalizeOrderCodeText(dvt) &&
          l.lineKind === kind,
      );
      if (exist) {
        return prev.map((l) =>
          l.key === exist.key ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        {
          key: `${Date.now()}-${ma}-${dvt}-${kind}`,
          maHang: ma,
          maVach: picked?.barcode || p.barcode || "",
          tenHang: p.name,
          dvt,
          unitOptions: unitOpts,
          quantity: 1,
          unitPrice: kind === "HANG" ? price : 0,
          serviceFee: kind === "DV" ? price : 0,
          lineKind: kind,
        },
        ...prev,
      ];
    });
    setScan("");
    scanRef.current?.focus();
  };

  const handleScanKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!invoiceLocked) {
      lockInvoice();
      return;
    }
    if (exactScan.ambiguous) {
      toast({
        title: "Mã vạch đang gắn cho nhiều mã hàng",
        description: `${scan.trim()} → ${exactScan.skus.join(", ")}. Chọn đúng mã hàng trong gợi ý.`,
        variant: "destructive",
      });
      return;
    }
    if (exactScan.hit) {
      addProduct(exactScan.hit);
      return;
    }
    if (suggestions[0] && scoreCatalogItem(suggestions[0], scan) >= 1200) {
      addProduct(suggestions[0]);
    }
  };

  const patchLine = (key: string, patch: Partial<CartLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l)),
    );
  };

  const setQty = (key: string, qty: number) => {
    setLines((prev) =>
      prev.map((l) =>
        l.key === key ? { ...l, quantity: Math.max(0, qty) } : l,
      ),
    );
  };

  const setLineUnit = (key: string, dvt: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        const liveOpts = getSkuUnitOptions(skuUnitIndex, l.maHang);
        const opts = liveOpts.length > 0 ? liveOpts : l.unitOptions;
        const match = resolveUnitOption(opts, dvt);
        if (!match) {
          return { ...l, dvt, maVach: "", unitOptions: opts };
        }
        return {
          ...l,
          dvt: match.unit,
          maVach: String(match.barcode ?? "").trim(),
          unitOptions: opts,
          unitPrice:
            l.lineKind === "HANG" ? match.price || l.unitPrice : l.unitPrice,
          serviceFee:
            l.lineKind === "DV" ? match.price || l.serviceFee : l.serviceFee,
        };
      }),
    );
  };

  const setLineKind = (key: string, kind: SalesLineKind) => {
    if (kind === "DV") {
      const line = lines.find((l) => l.key === key);
      const hit = catalogList.find(
        (p) =>
          normalizeOrderCodeText(p.slug) ===
          normalizeOrderCodeText(line?.maHang || ""),
      );
      if (!isMedicineCategory(hit?.category_group)) {
        toast({
          title: SERVICE_PICK_MEDICINE_TITLE,
          description: SERVICE_PICK_MEDICINE_DESC,
          variant: "destructive",
        });
        return;
      }
    }
    setLines((prev) =>
      prev.map((l) => {
        if (l.key !== key) return l;
        if (kind === "DV") {
          return {
            ...l,
            lineKind: "DV",
            serviceFee: l.serviceFee || l.unitPrice || 0,
            unitPrice: 0,
          };
        }
        return {
          ...l,
          lineKind: "HANG",
          unitPrice: l.unitPrice || l.serviceFee || 0,
          serviceFee: 0,
        };
      }),
    );
  };

  const handleSave = async () => {
    if (!invoiceLocked) {
      setInvoiceError(true);
      toast({
        title: "Chưa nhập Số Hóa Đơn",
        description: "Khóa Số Hóa Đơn MISA/KiotViet trước khi lưu.",
        variant: "destructive",
      });
      return;
    }
    const wh = warehouses.find((w) => w.id === branchId);
    if (!wh) {
      toast({ title: "Thiếu chi nhánh", variant: "destructive" });
      return;
    }
    if (!lines.length) {
      toast({ title: "Chưa có hàng", variant: "destructive" });
      return;
    }
    if (qtyErrors.length) {
      toast({
        title: "Số lượng không hợp lệ",
        description: "Mọi dòng phải có Số lượng > 0 (ô đỏ).",
        variant: "destructive",
      });
      return;
    }
    try {
      const res = await createVoucher.mutateAsync({
        invoiceNo: invoiceLocked,
        warehouseId: wh.id,
        warehouseCode: wh.code,
        warehouseName: wh.name,
        createdBy: user?.email || user?.id || undefined,
        lines: lines.map((l) => ({
          productName: l.tenHang,
          productSlug: l.maHang,
          barcode: l.maVach || null,
          unit: l.dvt,
          quantity: l.quantity,
          unitPrice: l.lineKind === "HANG" ? l.unitPrice : 0,
          lineKind: l.lineKind,
          serviceCost: l.lineKind === "DV" ? l.serviceFee : null,
        })),
      });
      toast({
        title: "Đã lưu xuất bán",
        description: `${res.voucher_code} · HĐ ${res.invoice_no}`,
      });
      clearDraft();
      setLines([]);
      setInvoiceLocked(null);
      setInvoiceDraft("");
      setInvoiceError(false);
      void refetchList();
      // Mở PDF + cập nhật URL xem đơn (Telegram dùng cùng link)
      setSearchParams(
        (prev) => {
          const n = new URLSearchParams(prev);
          n.set("tab", "xb");
          n.set("xb", res.voucher_code);
          return n;
        },
        { replace: true },
      );
    } catch (e) {
      toast({
        title: "Không lưu được",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const openVoucher = async (code: string) => {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "xb");
        n.set("xb", code);
        return n;
      },
      { replace: true },
    );
    openedDeep.current = null;
  };

  const handleCancelVoucher = async (id: string, code: string) => {
    if (!confirm(`Hủy phiếu xuất bán ${code}?`)) return;
    try {
      await cancelVoucher.mutateAsync(id);
      toast({ title: `Đã hủy ${code}` });
      void refetchList();
    } catch (e) {
      toast({
        title: "Không hủy được",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const handleRestoreVoucher = async (id: string, code: string) => {
    if (!confirm(`Khôi phục phiếu ${code}?`)) return;
    try {
      await restoreVoucher.mutateAsync(id);
      toast({ title: `Đã khôi phục ${code}` });
      void refetchList();
    } catch (e) {
      toast({
        title: "Không khôi phục được",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    }
  };

  const branchWh = warehouses.find((w) => w.id === branchId);
  const branchCode = branchWh ? warehouseLabel(branchWh) : "—";
  const locked = !!invoiceLocked;
  const packingBanner = useMemo(() => getPackingSaveBanner(new Date()), []);

  const exportExcel = async () => {
    const list = vouchers || [];
    if (!list.length) {
      toast({
        title: "Không có dữ liệu",
        description: "Chưa có hóa đơn trong khoảng lọc hiện tại.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Đang xuất Excel…",
      description: `Tải chi tiết ${list.length} phiếu (mã hàng / tên hàng)…`,
    });

    let itemsByVoucher = new Map<string, SalesVoucherItem[]>();
    try {
      const fetched = await fetchSalesVoucherItemsByVoucherIds(
        list.map((v) => v.id),
      );
      for (const it of fetched) {
        const vid = it.voucher_id;
        if (!vid) continue;
        const arr = itemsByVoucher.get(vid) || [];
        arr.push(it);
        itemsByVoucher.set(vid, arr);
      }
    } catch (e) {
      // Fallback: dùng embed trong list nếu có
      console.warn("[exportExcel] fetch items failed", e);
      itemsByVoucher = new Map();
      for (const v of list) {
        if (v.sales_voucher_items?.length) {
          itemsByVoucher.set(v.id, v.sales_voucher_items);
        }
      }
    }

    // Nếu vẫn thiếu, thử merge embed
    for (const v of list) {
      if (!itemsByVoucher.has(v.id) && v.sales_voucher_items?.length) {
        itemsByVoucher.set(v.id, v.sales_voucher_items);
      }
    }

    const listAoa: (string | number)[][] = [
      [
        "STT",
        "Mã XB",
        "Số HĐ",
        "Mã CN",
        "Tên CN",
        "Số dòng",
        "Tổng SL",
        "Tổng tiền",
        "Trạng thái",
        "Ngày tạo",
        "Ghi chú",
      ],
    ];
    const detailAoa: (string | number)[][] = [
      [
        "STT",
        "Mã XB",
        "Số HĐ",
        "CN",
        "Loại",
        "Mã hàng",
        "Mã vạch",
        "Tên hàng / DV",
        "ĐVT",
        "SL",
        "Đơn giá",
        "Phí DV",
        "Thành tiền",
        "Ghi chú dòng",
      ],
    ];

    let detailStt = 1;
    list.forEach((v, idx) => {
      const cnLabel = warehouseShortLabel({
        code: v.warehouse_code,
        short_name: null,
        name: v.warehouse_name,
      });
      const items = [...(itemsByVoucher.get(v.id) || [])].sort(
        (a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0),
      );
      listAoa.push([
        idx + 1,
        v.voucher_code || "",
        v.invoice_no || "",
        cnLabel,
        v.warehouse_name || "",
        items.length || v.itemCount || 0,
        items.reduce((s, i) => s + (Number(i.quantity) || 0), 0) ||
          v.totalQty ||
          0,
        Math.round(Number(v.total_amount) || 0),
        v.status === "cancelled" ? "Đã hủy" : "Đã lưu",
        format(new Date(v.created_at), "HH:mm dd/MM/yyyy", { locale: vi }),
        v.notes || "",
      ]);
      for (const it of items) {
        const isDv = String(it.line_kind || "").toUpperCase() === "DV";
        const maHang = String(it.product_slug || "").trim();
        const tenHang = String(it.product_name || "").trim();
        detailAoa.push([
          detailStt++,
          v.voucher_code || "",
          v.invoice_no || "",
          cnLabel,
          isDv ? "DV" : "Hàng",
          maHang,
          String(it.barcode || "").trim(),
          tenHang,
          String(it.unit || "").trim(),
          Number(it.quantity) || 0,
          Math.round(Number(it.unit_price) || 0),
          isDv ? Math.round(Number(it.service_cost) || 0) : "",
          Math.round(Number(it.line_total) || 0),
          it.line_notes || "",
        ]);
      }
    });

    if (detailStt <= 1) {
      toast({
        title: "Thiếu dòng chi tiết",
        description:
          "Không đọc được mã hàng/tên từ sales_voucher_items. Kiểm tra RLS hoặc Làm mới rồi xuất lại.",
        variant: "destructive",
      });
      return;
    }

    const wb = XLSX.utils.book_new();
    // Chi tiết đặt sheet đầu — dễ thấy mã hàng / tên hàng
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(detailAoa),
      "ChiTiet",
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(listAoa),
      "DanhSach",
    );
    const stamp = format(new Date(), "yyyyMMdd_HHmm");
    XLSX.writeFile(wb, `hoa-don-dich-vu_${stamp}.xlsx`);
    toast({
      title: "Đã xuất Excel",
      description: `${list.length} phiếu · ${detailStt - 1} dòng (sheet ChiTiet: mã hàng + tên hàng)`,
    });
  };

  return (
    <div className="space-y-5">
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

      {/* ===== PHẦN TRÊN: Filter + List ===== */}
      <div className="border rounded-lg p-4 bg-card space-y-3">
        {isStoreScoped ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex items-center gap-2">
            <Lock className="h-4 w-4 shrink-0" />
            Tài khoản chi nhánh — hóa đơn chỉ ghi cho{" "}
            <strong>
              {scopedLabel}
              {scopedWhCode ? ` (${scopedWhCode})` : ""}
            </strong>
            . Không đổi được chi nhánh.
          </div>
        ) : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-sm">
            Hóa đơn dịch vụ đã tạo
          </h3>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!vouchers?.length || listLoading}
              onClick={() => void exportExcel()}
            >
              <Download className="w-3.5 h-3.5 mr-1" />
              Xuất Excel
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refetchList()}
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              Làm mới
            </Button>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-4">
          <Input
            placeholder="Tìm XB / HĐ / CN…"
            value={listSearch}
            onChange={(e) => setListSearch(e.target.value)}
            className="h-9"
          />
          <Select value={listStatus} onValueChange={setListStatus}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tất cả TT</SelectItem>
              <SelectItem value="saved">Đã lưu</SelectItem>
              <SelectItem value="cancelled">Đã hủy</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={listBranch}
            onValueChange={setListBranch}
            disabled={isStoreScoped}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {!isStoreScoped ? (
                <SelectItem value="ALL">Tất cả CN</SelectItem>
              ) : null}
              {(branches.length ? branches : warehouses).map((w) => (
                <SelectItem key={w.id} value={w.code}>
                  {warehouseLabel(w)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={String(listDays)}
            onValueChange={(v) => setListDays(Number(v))}
          >
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 ngày</SelectItem>
              <SelectItem value="30">30 ngày</SelectItem>
              <SelectItem value="90">90 ngày</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {listLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Đang tải…
          </div>
        ) : !vouchers?.length ? (
          <p className="text-sm text-muted-foreground py-3">
            Chưa có phiếu XB trong khoảng lọc.
          </p>
        ) : (
          <div className={cn(excelTableWrap, "max-h-[min(36vh,320px)]")}>
            <Table stickyHeader>
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(excelTh, "w-10 text-center")}>
                    STT
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-left")}>
                    Mã XB
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-left")}>HĐ</TableHead>
                  <TableHead className={excelTh}>CN</TableHead>
                  <TableHead className={cn(excelTh, "text-right")}>
                    Dòng
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-right")}>
                    Tổng tiền
                  </TableHead>
                  <TableHead className={excelTh}>TT</TableHead>
                  <TableHead className={excelTh}>Ngày</TableHead>
                  <TableHead className={excelTh}>Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchers.map((v, idx) => {
                  const cancelled = v.status === "cancelled";
                  const highlight = xbParam === v.voucher_code;
                  return (
                    <TableRow
                      key={v.id}
                      className={cn(
                        excelTr,
                        cancelled && "opacity-60",
                        highlight && "bg-primary/10",
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
                      <TableCell
                        className={cn(
                          excelTd,
                          "font-mono text-xs font-semibold",
                        )}
                      >
                        {v.voucher_code}
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono text-xs")}>
                        {v.invoice_no}
                      </TableCell>
                      <TableCell className={excelTd}>
                        {(() => {
                          const wh = warehouses.find(
                            (w) => w.code === v.warehouse_code,
                          );
                          return wh
                            ? warehouseLabel(wh)
                            : warehouseShortLabel({
                                code: v.warehouse_code,
                              });
                        })()}
                      </TableCell>
                      <TableCell
                        className={cn(excelTd, "text-right tabular-nums")}
                      >
                        {v.itemCount ?? 0}
                      </TableCell>
                      <TableCell
                        className={cn(excelTd, "text-right tabular-nums")}
                      >
                        {formatMoney(Number(v.total_amount) || 0)}
                      </TableCell>
                      <TableCell className={excelTd}>
                        <Badge
                          variant={cancelled ? "destructive" : "secondary"}
                          className="text-[10px] h-5"
                        >
                          {cancelled ? "Hủy" : "Lưu"}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-xs text-muted-foreground",
                        )}
                      >
                        {format(new Date(v.created_at), "HH:mm dd/MM", {
                          locale: vi,
                        })}
                      </TableCell>
                      <TableCell className={excelTd}>
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Xem / In"
                            onClick={() => void openVoucher(v.voucher_code)}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          {isAdmin && !cancelled && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              title="Hủy phiếu"
                              disabled={cancelVoucher.isPending}
                              onClick={() =>
                                void handleCancelVoucher(
                                  v.id,
                                  v.voucher_code,
                                )
                              }
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          {isAdmin && cancelled && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-700"
                              title="Khôi phục"
                              disabled={restoreVoucher.isPending}
                              onClick={() =>
                                void handleRestoreVoucher(
                                  v.id,
                                  v.voucher_code,
                                )
                              }
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ===== PHẦN DƯỚI: Form tạo mới ===== */}
      <div className="border rounded-lg p-4 space-y-3 bg-card">
        <h3 className="font-semibold text-sm">Tạo hóa đơn dịch vụ mới</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>
              Số Hóa Đơn MISA/KiotViet{" "}
              <span className="text-destructive">*</span>
            </Label>
            <Input
              value={invoiceDraft}
              onChange={(e) => {
                setInvoiceDraft(e.target.value);
                if (e.target.value.trim()) setInvoiceError(false);
              }}
              disabled={locked}
              placeholder="VD: HD-2026-001234"
              className={cn(
                invoiceError &&
                  !locked &&
                  "border-destructive ring-1 ring-destructive",
              )}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  lockInvoice();
                }
              }}
            />
            {invoiceError && !locked ? (
              <p className="text-xs text-destructive font-medium">
                Bắt buộc nhập số hóa đơn trước khi lưu.
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label>
              Chi nhánh xuất bán
              {isStoreScoped ? (
                <span className="text-xs text-amber-800 ml-1 font-semibold">
                  (đã khóa)
                </span>
              ) : null}
            </Label>
            {isStoreScoped ? (
              <div className="h-10 flex items-center gap-2 px-3 rounded-md border-2 border-amber-400 bg-amber-50 text-sm font-semibold text-amber-950">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                {scopedLabel || scopedWhCode || "Chi nhánh"}
                {scopedWhCode ? (
                  <span className="text-xs font-mono font-normal text-amber-800">
                    ({scopedWhCode})
                  </span>
                ) : null}
              </div>
            ) : (
              <Select
                value={branchId}
                onValueChange={setBranchId}
                disabled={locked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn chi nhánh" />
                </SelectTrigger>
                <SelectContent>
                  {(branches.length ? branches : warehouses).map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Thao tác</Label>
            {locked ? (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={unlockInvoice}
              >
                <Unlock className="w-4 h-4 mr-1" />
                Đổi HĐ
              </Button>
            ) : (
              <Button type="button" className="w-full" onClick={lockInvoice}>
                <Lock className="w-4 h-4 mr-1" />
                Xác nhận HĐ
              </Button>
            )}
          </div>
        </div>
        {locked && (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            Đang nhập cho HĐ: <strong>{invoiceLocked}</strong> · CN {branchCode}
          </div>
        )}
      </div>

      <div
        className={cn(
          "border rounded-lg p-4 space-y-3 bg-card relative",
          !locked && "opacity-55 pointer-events-none",
        )}
      >
        <div className="flex flex-wrap gap-2 items-end">
          <div className="flex-1 min-w-[220px] space-y-1.5">
            <Label>Quét mã / tìm hàng · dịch vụ</Label>
            <Input
              ref={scanRef}
              value={scan}
              onChange={(e) => setScan(e.target.value)}
              onKeyDown={handleScanKey}
              placeholder={
                locked
                  ? `Quét mã cho HĐ ${invoiceLocked}`
                  : "Khóa HĐ trước…"
              }
              className="h-11 font-semibold border-2 border-primary"
              autoComplete="off"
            />
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
            Danh mục
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={createVoucher.isPending || !lines.length}
          >
            {createVoucher.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Lưu xuất bán
          </Button>
        </div>

        {scan.trim() && locked && (
          <CatalogSuggestList className="left-4 right-4 top-[6.5rem] mt-0 z-20">
            {suggestions.length === 0 ? (
              <div className="p-3 text-sm text-muted-foreground">
                Không tìm thấy.
              </div>
            ) : (
              suggestions.map((p) => (
                <CatalogSuggestItem
                  key={p.id}
                  product={p}
                  unitLabel={p.unit || "cái"}
                  barcodeLabel={
                    [p.barcode, p.barcode_2].filter(Boolean).join(" · ") || "—"
                  }
                  extraMeta={
                    <>
                      {" "}
                      · {formatMoney(p.price)}₫
                    </>
                  }
                  onSelect={() => addProduct(p)}
                />
              ))
            )}
          </CatalogSuggestList>
        )}

        <div className={cn(excelTableWrap, "max-h-[min(48vh,480px)]")}>
          <Table stickyHeader>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(excelTh, "w-10 text-center")}>
                  STT
                </TableHead>
                <TableHead className={cn(excelTh, "w-24")}>Loại dòng</TableHead>
                <TableHead className={cn(excelTh, "text-left")}>
                  Mã Hàng
                </TableHead>
                <TableHead className={cn(excelTh, "text-left")}>
                  Mã Vạch
                </TableHead>
                <TableHead className={cn(excelTh, "text-left")}>
                  Tên Hàng
                </TableHead>
                <TableHead className={cn(excelTh, "w-24")}>ĐVT</TableHead>
                <TableHead
                  className={cn(excelTh, "w-20 text-right bg-emerald-100")}
                >
                  Tồn
                </TableHead>
                <TableHead className={cn(excelTh, "w-28 text-center")}>
                  Số Lượng
                </TableHead>
                <TableHead className={cn(excelTh, "w-28 text-right")}>
                  Đơn giá
                </TableHead>
                <TableHead className={cn(excelTh, "w-28 text-right")}>
                  Phí DV
                </TableHead>
                <TableHead className={cn(excelTh, "w-28 text-right")}>
                  Thành tiền
                </TableHead>
                <TableHead className={cn(excelTh, "w-8")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={12}
                    className={cn(
                      excelTd,
                      "text-center text-muted-foreground py-8 h-auto",
                    )}
                  >
                    Chưa có dòng. Quét mã hoặc chọn từ gợi ý.
                  </TableCell>
                </TableRow>
              ) : (
                lines.map((l, idx) => {
                  const badQty = !(l.quantity > 0);
                  const ton =
                    l.lineKind === "DV"
                      ? null
                      : getQty(l.maHang, l.dvt) ?? getQty(l.maVach, l.dvt);
                  return (
                    <TableRow key={l.key} className={excelTr}>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-center text-muted-foreground tabular-nums",
                        )}
                      >
                        {lines.length - idx}
                      </TableCell>
                      <TableCell className={excelTd}>
                        <Select
                          value={l.lineKind}
                          onValueChange={(v) =>
                            setLineKind(l.key, v as SalesLineKind)
                          }
                        >
                          <SelectTrigger className="h-7 text-[11px] px-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="HANG">HÀNG</SelectItem>
                            <SelectItem value="DV">DỊCH VỤ</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono text-xs uppercase")}>
                        {normalizeOrderCodeText(l.maHang) || l.maHang}
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono text-xs")}>
                        {(() => {
                          const liveOpts = getSkuUnitOptions(
                            skuUnitIndex,
                            l.maHang,
                          );
                          const unitOpts =
                            liveOpts.length > 0 ? liveOpts : l.unitOptions;
                          return (
                            <Input
                              className={cn(
                                "h-7 text-xs font-mono p-1",
                                unitOpts.length > 0 && "bg-muted",
                              )}
                              value={l.maVach}
                              readOnly={unitOpts.length > 0}
                              onChange={(e) =>
                                patchLine(l.key, { maVach: e.target.value })
                              }
                              placeholder="Mã vạch"
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell className={cn(excelTd, "text-xs text-left")}>
                        {l.tenHang}
                      </TableCell>
                      <TableCell className={excelTd}>
                        {(() => {
                          const liveOpts = getSkuUnitOptions(
                            skuUnitIndex,
                            l.maHang,
                          );
                          const unitOpts =
                            liveOpts.length > 0 ? liveOpts : l.unitOptions;
                          if (unitOpts.length > 0) {
                            return (
                              <Select
                                value={
                                  resolveUnitOption(unitOpts, l.dvt)?.unit ||
                                  unitOpts[0]?.unit ||
                                  l.dvt
                                }
                                onValueChange={(v) => setLineUnit(l.key, v)}
                                disabled={unitOpts.length === 1}
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="ĐVT" />
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
                            );
                          }
                          return (
                            <Input
                              className="h-7 text-xs p-1"
                              value={l.dvt}
                              onChange={(e) =>
                                setLineUnit(l.key, e.target.value)
                              }
                              placeholder="ĐVT"
                            />
                          );
                        })()}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums bg-emerald-50/60 font-semibold",
                          ton != null &&
                            ton < l.quantity &&
                            "text-red-700",
                        )}
                      >
                        {l.lineKind === "DV"
                          ? "—"
                          : ton != null
                            ? ton
                            : "—"}
                      </TableCell>
                      <TableCell className={excelTd}>
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => setQty(l.key, l.quantity - 1)}
                          >
                            <Minus className="w-3 h-3" />
                          </Button>
                          <QtyInput
                            className={cn(
                              "w-14 text-center",
                              badQty &&
                                "border-destructive ring-1 ring-destructive text-destructive",
                            )}
                            value={l.quantity}
                            onValueChange={(v) => setQty(l.key, v)}
                          />
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-7 w-7"
                            onClick={() => setQty(l.key, l.quantity + 1)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className={excelTd}>
                        {l.lineKind === "HANG" ? (
                          <Input
                            type="number"
                            className="h-7 text-xs text-right tabular-nums"
                            value={l.unitPrice || ""}
                            onChange={(e) =>
                              patchLine(l.key, {
                                unitPrice: Number(e.target.value) || 0,
                              })
                            }
                            onFocus={(e) => e.target.select()}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className={excelTd}>
                        {l.lineKind === "DV" ? (
                          <Input
                            type="number"
                            className="h-7 text-xs text-right tabular-nums"
                            value={l.serviceFee || ""}
                            onChange={(e) =>
                              patchLine(l.key, {
                                serviceFee: Number(e.target.value) || 0,
                              })
                            }
                            onFocus={(e) => e.target.select()}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums font-semibold text-xs",
                        )}
                      >
                        {formatMoney(lineAmount(l))}
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

        {qtyErrors.length > 0 ? (
          <p className="text-sm text-destructive font-medium">
            Có {qtyErrors.length} dòng số lượng ≤ 0 — sửa trước khi lưu.
          </p>
        ) : null}

        <div className="flex flex-wrap justify-between items-end gap-3 pt-1 border-t">
          <div className="text-sm space-y-0.5">
            <div>
              Hàng: <strong>{formatMoney(totalHang)}₫</strong>
              {" · "}
              DV: <strong>{formatMoney(totalDv)}₫</strong>
            </div>
            <div className="text-base font-bold text-primary">
              Tổng cộng: {formatMoney(grandTotal)}₫
            </div>
          </div>
          <Button
            size="lg"
            onClick={() => void handleSave()}
            disabled={createVoucher.isPending || !lines.length}
          >
            {createVoucher.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : null}
            Lưu xuất bán (XB)
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Mã mẫu: {generateXbCode()} — mỗi lần lưu hệ thống cấp XB-xxxxxx mới.
        </p>
      </div>
    </div>
  );
}
