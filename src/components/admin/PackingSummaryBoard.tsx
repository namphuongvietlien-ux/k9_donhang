import { useMemo, useState } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import {
  AlertTriangle,
  Download,
  Loader2,
  Lock,
  Printer,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { useProducts } from "@/hooks/useProducts";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { usePackingOrders } from "@/hooks/useOrders";
import { usePackingSourceWarehouse, useStock } from "@/hooks/useStock";
import {
  MODE_LABELS,
  normalizeOrderCodeText,
  toDateKey,
  type PackingMode,
} from "@/lib/packingWindows";
import {
  buildProductMetaIndexFromProducts,
  getMeta,
  resolveLineUnitBarcode,
} from "@/lib/productCatalogMeta";
import {
  buildSkuUnitIndex,
  getSkuUnitOptions,
  resolveUnitOption,
  type CatalogProductRow,
} from "@/lib/catalogUnitBarcode";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";
import { cn } from "@/lib/utils";

interface SummaryRow {
  skuKey: string;
  productName: string;
  productSlug: string | null;
  unit: string | null;
  barcode: string | null;
  stockOnHand: number;
  stockMapped: boolean;
  orderedQty: number;
  byBranch: Record<string, number>;
  isNew: boolean;
  isLocked: boolean;
}

interface PackingSummaryBoardProps {
  className?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Port GAS taoBangSoanHangNgayMai:
 * Gom tất cả kho nhận theo Ngày/Ca · tồn Q7 · phân bổ CN · cảnh báo THIẾU.
 * Backfill ĐVT/MV + highlight mã mới / khóa mã từ catalog.
 */
export default function PackingSummaryBoard({
  className,
}: PackingSummaryBoardProps) {
  const { warehouses, loading: whLoading } = useWarehouses();
  const { data: q7, error: q7Error } = usePackingSourceWarehouse();
  const [packingDate, setPackingDate] = useState(() => toDateKey(new Date()));
  const [mode, setMode] = useState<PackingMode>("total");

  /** Ưu tiên query Q7; fallback từ danh sách kho đã tải */
  const stockWarehouseId = useMemo(() => {
    if (q7?.id) return q7.id;
    const fromList = warehouses.find(
      (w) => String(w.code || "").toUpperCase() === "Q7",
    );
    return fromList?.id || null;
  }, [q7?.id, warehouses]);

  const {
    getQty,
    loading: stockLoading,
    refetch: refetchStock,
    count: stockRowCount,
    sohCount,
    error: stockError,
  } = useStock(stockWarehouseId);

  const {
    orders,
    loading: ordersLoading,
    refetch: refetchOrders,
  } = usePackingOrders({
    packingDateYYYYMMDD: packingDate,
    mode,
    warehouseId: null,
  });

  const orderSlugs = useMemo(() => {
    const set = new Set<string>();
    for (const o of orders) {
      for (const it of o.order_items || []) {
        if (it.product_slug) set.add(it.product_slug);
      }
    }
    return [...set];
  }, [orders]);

  const {
    products: sharedProducts = [],
    loading: productsLoading,
    refreshProducts,
  } = useProducts();

  const metaIndex = useMemo(
    () => buildProductMetaIndexFromProducts(sharedProducts, orderSlugs),
    [sharedProducts, orderSlugs],
  );

  const skuUnitIndex = useMemo(
    () => buildSkuUnitIndex(sharedProducts as CatalogProductRow[]),
    [sharedProducts],
  );

  const branchCodes = useMemo(() => {
    const codes = new Set<string>();
    const codeToLabel = new Map<string, string>();
    for (const w of warehouses) {
      if (w.code === "Q7") continue;
      const label = warehouseLabel(w) || warehouseShortLabel(w) || w.code;
      codes.add(w.code);
      codeToLabel.set(w.code, label);
    }
    for (const o of orders) {
      const c = o.warehouse?.code;
      if (c && c !== "Q7") {
        codes.add(c);
        if (!codeToLabel.has(c)) {
          codeToLabel.set(
            c,
            warehouseShortLabel(o.warehouse) || warehouseLabel({
              code: c,
              short_name: o.warehouse?.short_name,
              print_name: o.warehouse?.print_name,
              name: undefined,
            }) || c,
          );
        }
      }
    }
    const sorted = [...codes].sort((a, b) => {
      const la = codeToLabel.get(a) || a;
      const lb = codeToLabel.get(b) || b;
      return la.localeCompare(lb, "vi");
    });
    return sorted.map((code) => ({
      code,
      label: codeToLabel.get(code) || code,
    }));
  }, [warehouses, orders]);

  const rows = useMemo(() => {
    const map = new Map<string, SummaryRow>();
    const index = metaIndex;

    const ensure = (
      slug: string | null,
      name: string,
      unitHint: string | null,
      barcodeHint: string | null,
    ): SummaryRow => {
      const meta = getMeta(index || new Map(), slug);
      let resolved = resolveLineUnitBarcode(meta, unitHint, barcodeHint);
      if (!resolved.barcode && slug) {
        const opts = getSkuUnitOptions(skuUnitIndex, slug);
        const match = unitHint
          ? resolveUnitOption(opts, unitHint) || opts[0]
          : opts[0];
        if (match?.barcode) {
          resolved = {
            unit: resolved.unit || match.unit || unitHint || null,
            barcode: match.barcode,
          };
        }
      }
      // Key tổng hợp = mã + ĐVT (không gộp chung mã khác đơn vị)
      const code = normalizeOrderCodeText(slug || name) || name;
      const unitPart = normalizeOrderCodeText(resolved.unit || unitHint || "") || "—";
      const skuKey = `${code}::${unitPart}`;
      let row = map.get(skuKey);

      if (!row) {
        const stockQty =
          getQty(slug, resolved.unit) ??
          getQty(resolved.barcode, resolved.unit) ??
          getQty(slug) ??
          (meta?.stock_quantity != null ? meta.stock_quantity : null);
        row = {
          skuKey,
          productName: name,
          productSlug: slug,
          unit: resolved.unit,
          barcode: resolved.barcode,
          stockOnHand: stockQty ?? 0,
          stockMapped: stockQty !== null,
          orderedQty: 0,
          byBranch: {},
          isNew: !!meta?.is_new,
          isLocked: !!meta?.is_locked,
        };
        map.set(skuKey, row);
      } else {
        if (!row.unit && resolved.unit) row.unit = resolved.unit;
        if (!row.barcode && resolved.barcode) row.barcode = resolved.barcode;
        if (meta?.is_new) row.isNew = true;
        if (meta?.is_locked) row.isLocked = true;
        if ((!row.productSlug || row.productSlug === name) && slug) {
          row.productSlug = slug;
        }
        if (!row.stockMapped) {
          const stockQty =
            getQty(slug, resolved.unit) ??
            getQty(resolved.barcode, resolved.unit) ??
            getQty(slug) ??
            (meta?.stock_quantity != null ? meta.stock_quantity : null);
          if (stockQty !== null) {
            row.stockOnHand = stockQty;
            row.stockMapped = true;
          }
        }
      }
      return row;
    };

    for (const order of orders) {
      const branch = order.warehouse?.code || "—";
      for (const it of order.order_items || []) {
        const qty = Number(it.qty_packed ?? it.qty_requested ?? it.quantity) || 0;
        if (qty <= 0) continue;
        const row = ensure(
          it.product_slug,
          it.product_name,
          it.unit || null,
          it.barcode || null,
        );
        row.orderedQty += qty;
        row.byBranch[branch] = (row.byBranch[branch] || 0) + qty;
      }
    }

    return Array.from(map.values())
      .filter((r) => r.orderedQty > 0)
      .sort((a, b) => {
        const aShort = a.stockMapped && a.stockOnHand < a.orderedQty ? 0 : 1;
        const bShort = b.stockMapped && b.stockOnHand < b.orderedQty ? 0 : 1;
        if (aShort !== bShort) return aShort - bShort;
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
        return (a.productSlug || a.productName).localeCompare(
          b.productSlug || b.productName,
          "vi",
        );
      });
  }, [orders, getQty, metaIndex]);

  const shortCount = rows.filter(
    (r) => r.stockMapped && r.stockOnHand < r.orderedQty,
  ).length;
  const loading = stockLoading || ordersLoading || whLoading || productsLoading;

  const refresh = () => {
    refetchStock();
    refetchOrders();
    void refreshProducts();
  };

  const dateLabel = format(new Date(`${packingDate}T00:00:00`), "dd/MM/yyyy", {
    locale: vi,
  });

  const exportExcel = () => {
    const header = [
      "STT",
      "Mã hàng",
      "Mã vạch",
      "Tên hàng",
      "ĐVT",
      "Mới",
      "Khóa",
      "Tồn Q7",
      "Tổng cần soạn",
      ...branchCodes.map((b) => b.label),
      "Cảnh báo",
    ];
    const aoa: (string | number)[][] = [header];
    let excelStt = 1;
    for (const r of rows) {
      const short = r.stockMapped && r.stockOnHand < r.orderedQty;
      aoa.push([
        excelStt++,
        r.productSlug || "",
        r.barcode || "",
        r.productName,
        r.unit || "",
        r.isNew ? "MỚI" : "",
        r.isLocked ? "KHÓA" : "",
        r.stockMapped ? r.stockOnHand : "",
        r.orderedQty,
        ...branchCodes.map((b) => r.byBranch[b.code] || 0),
        short ? `THIẾU ${r.orderedQty - r.stockOnHand}` : "OK",
      ]);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "TongHopSoan");
    XLSX.writeFile(wb, `tong-hop-soan_${packingDate}_${mode}.xlsx`);
  };

  const exportTransferImport = async () => {
    try {
      const response = await fetch("/nhap_khau_phieu_lenh_dieu_chuyen.xlsx");
      if (!response.ok) throw new Error("Không tải được file mẫu lệnh điều chuyển.");
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await response.arrayBuffer());
      const sheetName = "Nhập khẩu hàng hóa lệnh";
      const worksheet = workbook.getWorksheet(sheetName);
      if (!worksheet) throw new Error("Không tìm thấy sheet Nhập khẩu hàng hóa lệnh trong file mẫu.");

      const templateRow = worksheet.getRow(6);
      for (let rowNumber = 6; rowNumber <= worksheet.rowCount; rowNumber += 1) {
        for (const column of [1, 6, 8, 9]) {
          worksheet.getRow(rowNumber).getCell(column).value = null;
        }
      }

      rows.forEach((row, index) => {
        const excelRow = index + 6;
        const targetRow = worksheet.getRow(excelRow);
        if (excelRow > 6) {
          targetRow.height = templateRow.height;
          for (let column = 1; column <= worksheet.columnCount; column += 1) {
            targetRow.getCell(column).style = { ...templateRow.getCell(column).style };
          }
        }
        targetRow.getCell(1).value = row.productSlug || row.productName;
        targetRow.getCell(6).value = "KHODDKD0007 | Kho Địa điểm kinh doanh Q7";
        targetRow.getCell(8).value = row.unit || "";
        targetRow.getCell(9).value = Number(row.orderedQty) || 0;
        targetRow.commit();
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `nhap-khau-lenh-dieu-chuyen_Q7_${packingDate}_${mode}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể xuất file lệnh điều chuyển.");
    }
  };

  const printBoard = () => {
    const branchTh = branchCodes
      .map((b) => `<th>${escapeHtml(b.label)}</th>`)
      .join("");
    let body = "";
    let stt = 1;
    for (const r of rows) {
      const short = r.stockMapped && r.stockOnHand < r.orderedQty;
      const branchTd = branchCodes
        .map(
          (b) =>
            `<td class="num">${r.byBranch[b.code] ? escapeHtml(r.byBranch[b.code]) : ""}</td>`,
        )
        .join("");
      const flags =
        (r.isNew ? `<span class="tag-new">MỚI</span>` : "") +
        (r.isLocked ? `<span class="tag-lock">KHÓA</span>` : "");
      const rowClass = [
        short ? "short" : "",
        r.isNew ? "is-new" : "",
        r.isLocked ? "is-locked" : "",
      ]
        .filter(Boolean)
        .join(" ");
      body +=
        `<tr class="${rowClass}"><td>${stt++}</td>` +
        `<td class="code">${escapeHtml(r.productSlug || "")}${flags}</td>` +
        `<td class="code">${escapeHtml(r.barcode || "")}</td>` +
        `<td>${escapeHtml(r.productName)}</td>` +
        `<td>${escapeHtml(r.unit || "")}</td>` +
        `<td class="num">${r.stockMapped ? r.stockOnHand : ""}</td>` +
        `<td class="num bold">${r.orderedQty}</td>` +
        branchTd +
        `<td class="${short ? "warn" : "ok"}">${
          short ? `THIẾU ${r.orderedQty - r.stockOnHand}` : "OK"
        }</td></tr>`;
    }
    const html =
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<title>Tổng hợp soạn ${escapeHtml(dateLabel)}</title>` +
      `<style>
        body{font-family:"Segoe UI",Arial,sans-serif;margin:8px;color:#0f172a;font-size:13px;}
        h1{font-size:16px;margin:0 0 2px;} .sub{color:#64748b;font-size:12px;margin-bottom:8px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        th,td{border:1px solid #9ca3af;padding:2px 4px;vertical-align:middle;}
        th{background:#e2e8f0;text-align:left;font-weight:700;}
        .code{font-family:ui-monospace,Consolas,monospace;font-weight:700;}
        .num{text-align:right;font-variant-numeric:tabular-nums;}
        .bold{font-weight:800;} .warn{color:#b91c1c;font-weight:700;}
        .ok{color:#111;font-weight:600;}
        tr.short{background:#fef2f2;}
        tr.is-new{background:#ecfdf5;}
        tr.is-new.short{background:#fef2f2;}
        tr.is-locked td.code{color:#b91c1c;}
        .tag-new{display:inline-block;margin-left:4px;padding:0 4px;background:#059669;color:#fff;font-size:10px;border-radius:3px;font-weight:700;}
        .tag-lock{display:inline-block;margin-left:4px;padding:0 4px;background:#b91c1c;color:#fff;font-size:10px;border-radius:3px;font-weight:700;}
        .toolbar{margin-bottom:8px;}
        @media print{.toolbar{display:none!important;} body{margin:0;} @page{margin:6mm;size:A4 landscape;}}
      </style></head><body>` +
      `<div class="toolbar"><button onclick="window.print()">🖨️ In</button></div>` +
      `<h1>Bảng tổng hợp soạn hàng</h1>` +
      `<div class="sub">${escapeHtml(dateLabel)} · ${escapeHtml(MODE_LABELS[mode])} · ${rows.length} SKU · ${orders.length} phiếu</div>` +
      `<table><thead><tr><th>STT</th><th>Mã hàng</th><th>Mã vạch</th><th>Tên hàng</th><th>ĐVT</th><th>Tồn Q7</th><th>Tổng cần soạn</th>${branchTh}<th>Cảnh báo</th></tr></thead><tbody>${body}</tbody></table>` +
      `</body></html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert("Trình duyệt chặn popup. Cho phép rồi thử lại.");
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => {
      w.focus();
      w.print();
    }, 350);
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="space-y-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-xl">Bảng tổng hợp soạn hàng</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Gom SKU theo <strong>ngày giao / ca</strong> đã chọn · lọc theo{" "}
              <strong>giờ tạo đơn</strong> (đợt chính / bổ sung / cả ngày) · bỏ
              phiếu đã hủy &amp; đã nhận · tồn Q7 · phân bổ theo CN nhận.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={printBoard}
              disabled={!rows.length}
            >
              <Printer className="h-4 w-4 mr-1" />
              In bảng
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={exportExcel}
              disabled={!rows.length}
            >
              <Download className="h-4 w-4 mr-1" />
              Xuất Excel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void exportTransferImport()}
              disabled={!rows.length}
            >
              <Download className="h-4 w-4 mr-1" />
              Xuất lệnh điều chuyển
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCw
                className={cn("h-4 w-4 mr-1", loading && "animate-spin")}
              />
              Làm mới
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Input
            type="date"
            className="w-[160px] h-8"
            value={packingDate}
            onChange={(e) => setPackingDate(e.target.value)}
          />
          <div className="flex gap-1">
            {(
              [
                ["main", MODE_LABELS.main],
                ["supp", MODE_LABELS.supp],
                ["total", MODE_LABELS.total],
              ] as const
            ).map(([v, label]) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={mode === v ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => setMode(v)}
              >
                {label}
              </Button>
            ))}
          </div>
          {shortCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {shortCount} SKU THIẾU HÀNG
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {rows.length} SKU · {orders.length} phiếu
          </Badge>
          <Badge
            variant={
              stockError || (!stockLoading && stockRowCount === 0)
                ? "destructive"
                : "outline"
            }
            className="text-xs"
            title={
              stockError
                ? String((stockError as Error).message || stockError)
                : q7Error
                  ? String((q7Error as Error).message || q7Error)
                  : !stockWarehouseId
                    ? "Chưa tìm thấy kho Q7"
                    : sohCount != null && sohCount !== stockRowCount
                      ? `stock_on_hand: ${sohCount} · kèm fallback products: ${stockRowCount}`
                      : `Đã tải ${stockRowCount} mã tồn`
            }
          >
            Tồn Q7:{" "}
            {stockLoading || whLoading
              ? "…"
              : !stockWarehouseId
                ? "chưa có kho Q7"
                : stockError
                  ? "lỗi tải"
                  : sohCount != null && sohCount > 0 && sohCount !== stockRowCount
                    ? `${stockRowCount} mã (${sohCount} SOH)`
                    : `${stockRowCount} mã`}
          </Badge>
        </div>
        {(stockError || (!stockLoading && stockWarehouseId && stockRowCount === 0)) && (
          <p className="text-xs text-destructive">
            {stockError
              ? `Không tải được tồn Q7: ${(stockError as Error).message || stockError}`
              : "Tồn Q7 trống — vào Quản trị → Đồng bộ MISA & Tồn kho, import sheet Tồn Q7 rồi bấm Làm mới."}
          </p>
        )}
        <p className="text-xs text-muted-foreground leading-relaxed">
          Chọn <strong>ngày giao</strong> + ca:{" "}
          <strong>Đợt chính</strong> = đơn tạo từ 10:00 hôm trước → trước
          08:00 ngày giao · <strong>Bổ sung</strong> = 08:00–10:00 ngày giao ·{" "}
          <strong>Cả ngày</strong> = cả khung trên. Phiếu đã hủy / đã nhận không
          vào bảng.
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Không có phiếu Mới/Đã soạn cho {dateLabel} · {MODE_LABELS[mode]}.
          </p>
        ) : (
          <div className={excelTableWrap}>
            <Table stickyHeader className="border-collapse text-[13px]">
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(excelTh, "w-10 text-center")}>
                    STT
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-left min-w-[90px]")}>
                    Mã hàng
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-left min-w-[100px]")}>
                    Mã vạch
                  </TableHead>
                  <TableHead className={cn(excelTh, "text-left min-w-[160px]")}>
                    Tên hàng
                  </TableHead>
                  <TableHead className={cn(excelTh, "w-14")}>ĐVT</TableHead>
                  <TableHead
                    className={cn(excelTh, "text-right bg-emerald-100")}
                  >
                    Tồn Q7
                  </TableHead>
                  <TableHead
                    className={cn(excelTh, "text-right bg-sky-100 font-bold")}
                  >
                    Tổng cần soạn
                  </TableHead>
                  {branchCodes.map((b) => (
                    <TableHead
                      key={b.code}
                      className={cn(excelTh, "text-right min-w-[44px]")}
                    >
                      {b.label}
                    </TableHead>
                  ))}
                  <TableHead className={cn(excelTh, "min-w-[88px]")}>
                    Cảnh báo
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const short = r.stockMapped && r.stockOnHand < r.orderedQty;
                  const thieu = short ? r.orderedQty - r.stockOnHand : 0;
                  return (
                    <TableRow
                      key={r.skuKey}
                      className={cn(
                        excelTr,
                        short && "bg-red-50",
                        r.isNew && !short && "bg-emerald-50",
                        r.isLocked && "opacity-80",
                      )}
                    >
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-center text-muted-foreground",
                        )}
                      >
                        {idx + 1}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "font-mono font-semibold",
                          r.isLocked && "text-red-700",
                        )}
                      >
                        <span className="inline-flex items-center gap-1 flex-wrap">
                          {r.isLocked ? (
                            <Lock className="w-3 h-3 shrink-0" />
                          ) : null}
                          {r.productSlug || "—"}
                          {r.isNew ? (
                            <Badge className="h-4 px-1 text-[9px] bg-emerald-600 hover:bg-emerald-600 gap-0.5">
                              <Sparkles className="w-2.5 h-2.5" />
                              MỚI
                            </Badge>
                          ) : null}
                        </span>
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono")}>
                        {r.barcode || "—"}
                      </TableCell>
                      <TableCell
                        className={cn(excelTd, "truncate max-w-[220px]")}
                      >
                        {r.productName}
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-medium")}>
                        {r.unit || "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums bg-emerald-50/60",
                        )}
                      >
                        {r.stockMapped ? r.stockOnHand : "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums bg-sky-50/60 font-bold",
                        )}
                      >
                        {r.orderedQty}
                      </TableCell>
                      {branchCodes.map((b) => (
                        <TableCell
                          key={b.code}
                          className={cn(excelTd, "text-right tabular-nums")}
                        >
                          {r.byBranch[b.code] || ""}
                        </TableCell>
                      ))}
                      <TableCell className={excelTd}>
                        {short ? (
                          <span className="text-red-700 font-bold text-[13px]">
                            THIẾU {thieu}
                          </span>
                        ) : (
                          <span className="text-black font-medium text-[13px]">
                            OK
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
