import { useMemo, useState } from "react";
import { Loader2, Pencil, Printer, RefreshCw, Type, Warehouse } from "lucide-react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/hooks/usePermissions";
import { useStoreScope } from "@/hooks/useStoreScope";
import CatalogStockImport from "@/components/admin/CatalogStockImport";
import { useProducts } from "@/hooks/useProducts";
import { useStock } from "@/hooks/useStock";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { useToast } from "@/hooks/use-toast";
import { isVisibleSellableCatalog } from "@/lib/productCategory";
import { printStockGroups } from "@/lib/stockGroupPrint";
import {
  formatRenameCounts,
  renameProductEverywhere,
} from "@/lib/renameProduct";
import {
  OTHER_INDUSTRY,
  SKU_DETAILS,
  SKU_INDUSTRIES,
  groupSortKey,
  groupTitle,
  isSkuIndustryCode,
  resolveSkuGroup,
  type SkuIndustryCode,
} from "@/lib/skuGroups";
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
import {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type BrowseRow = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  unit: string;
  qty: number;
  updatedAt: string | null;
  industry: string;
  detail: string;
  matched?: boolean;
};

function fmtWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return format(d, "dd/MM/yyyy HH:mm", { locale: vi });
}

function foldSearch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export default function StockBrowsePanel() {
  const { hasPermission } = usePermissions();
  const canView = hasPermission("inventory.view");
  const canImport = hasPermission("inventory.stock_in");
  const canEditCatalog = hasPermission("products.update");
  const { toast } = useToast();
  const [moveRow, setMoveRow] = useState<BrowseRow | null>(null);
  const [moveIndustry, setMoveIndustry] = useState("TA");
  const [moveDetail, setMoveDetail] = useState("HA");
  const [moving, setMoving] = useState(false);
  const [renameRow, setRenameRow] = useState<BrowseRow | null>(null);
  const [renameName, setRenameName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const { warehouseId: scopedWhId, isStoreScoped } = useStoreScope();
  const { warehouses, loading: whLoading } = useWarehouses();
  const { products, loading: catalogLoading, refreshProducts } = useProducts();

  const warehouseOptions = useMemo(() => {
    const q7 = warehouses.find((w) => w.code === "Q7");
    if (!isStoreScoped) return warehouses;
    const mine = warehouses.find((w) => w.id === scopedWhId);
    const list = [mine, q7].filter(Boolean) as typeof warehouses;
    const seen = new Set<string>();
    return list.filter((w) => {
      if (seen.has(w.id)) return false;
      seen.add(w.id);
      return true;
    });
  }, [warehouses, isStoreScoped, scopedWhId]);

  const [warehouseId, setWarehouseId] = useState("");
  const selectedId = useMemo(() => {
    if (warehouseId && warehouseOptions.some((w) => w.id === warehouseId)) {
      return warehouseId;
    }
    if (isStoreScoped && scopedWhId) {
      const mine = warehouseOptions.find((w) => w.id === scopedWhId);
      if (mine) return mine.id;
    }
    return (
      warehouseOptions.find((w) => w.code === "Q7")?.id ||
      warehouseOptions[0]?.id ||
      ""
    );
  }, [warehouseId, warehouseOptions, isStoreScoped, scopedWhId]);

  const {
    rows: stockRows,
    loading: stockLoading,
    refetch,
    latestUpdatedAt,
  } = useStock(selectedId || null, canView && !!selectedId);

  const [industry, setIndustry] = useState("all");
  const [detail, setDetail] = useState("all");
  const [query, setQuery] = useState("");
  const [onlyInStock, setOnlyInStock] = useState(false);

  const detailOptions = industry !== "all" && isSkuIndustryCode(industry)
    ? SKU_DETAILS[industry as SkuIndustryCode]
    : [];

  const browseRows = useMemo((): BrowseRow[] => {
    const byProduct = new Map<string, BrowseRow[]>();
    for (const r of stockRows) {
      if (r.source !== "stock_on_hand") continue;
      const row: BrowseRow = {
        key: `${r.productId}|${r.unitKey}`,
        productId: r.productId,
        slug: r.productSlug || "",
        name: r.productName,
        unit: r.unit || "cái",
        qty: r.quantity,
        updatedAt: r.updatedAt || null,
        industry: OTHER_INDUSTRY,
        detail: "",
      };
      const list = byProduct.get(r.productId) || [];
      list.push(row);
      byProduct.set(r.productId, list);
    }

    const out: BrowseRow[] = [];
    for (const p of products) {
      if (!isVisibleSellableCatalog(p)) continue;
      const g = resolveSkuGroup({
        slug: p.slug,
        sku_industry: p.sku_industry,
        sku_detail: p.sku_detail,
      });
      const stock = byProduct.get(p.id);
      if (stock?.length) {
        for (const s of stock) {
          out.push({ ...s, name: p.name, slug: p.slug || s.slug, industry: g.industry, detail: g.detail });
        }
      } else {
        out.push({
          key: `${p.id}|empty`,
          productId: p.id,
          slug: p.slug || "",
          name: p.name,
          unit: p.unit || "cái",
          qty: 0,
          updatedAt: null,
          industry: g.industry,
          detail: g.detail,
        });
      }
    }
    return out;
  }, [products, stockRows]);

  const filtered = useMemo(() => {
    const q = foldSearch(query.trim());
    const base = browseRows.filter((r) => {
      if (industry !== "all" && r.industry !== industry) return false;
      if (detail !== "all" && r.detail !== detail) return false;
      if (onlyInStock && !(r.qty > 0)) return false;
      return true;
    });
    const withMatch = q
      ? base.map((r) => ({
          ...r,
          matched:
            foldSearch(r.name).includes(q) || foldSearch(r.slug).includes(q),
        }))
      : base;
    const hitKeys = q
      ? new Set(
          withMatch
            .filter((r) => r.matched)
            .map((r) => `${r.industry}|${r.detail}`),
        )
      : null;
    const rows = hitKeys
      ? withMatch.filter((r) => hitKeys.has(`${r.industry}|${r.detail}`))
      : withMatch;
    return rows.sort((a, b) => {
      const gk = groupSortKey(a.industry, a.detail).localeCompare(
        groupSortKey(b.industry, b.detail),
      );
      if (gk) return gk;
      return a.slug.localeCompare(b.slug, "vi");
    });
  }, [browseRows, industry, detail, query, onlyInStock]);

  const grouped = useMemo(() => {
    const groups: { key: string; industry: string; detail: string; rows: BrowseRow[] }[] = [];
    const index = new Map<string, number>();
    for (const r of filtered) {
      const key = `${r.industry}|${r.detail}`;
      let i = index.get(key);
      if (i == null) {
        i = groups.length;
        index.set(key, i);
        groups.push({ key, industry: r.industry, detail: r.detail, rows: [] });
      }
      groups[i].rows.push(r);
    }
    return groups;
  }, [filtered]);

  const toPrintGroups = (
    list: { industry: string; detail: string; rows: BrowseRow[] }[],
  ) =>
    list.map((g) => ({
      title: groupTitle(g.industry, g.detail),
      rows: g.rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        unit: r.unit,
        qty: r.qty,
        updatedAtLabel: fmtWhen(r.updatedAt),
        matched: !!r.matched,
      })),
    }));

  const printGroups = (
    list: { industry: string; detail: string; rows: BrowseRow[] }[],
    subtitle?: string,
  ) => {
    printStockGroups({
      warehouseLabel: selectedWh ? warehouseLabel(selectedWh) : "Tồn kho",
      latestUpdatedAt: fmtWhen(latestUpdatedAt),
      groups: toPrintGroups(list),
      subtitle,
    });
  };

  const openMove = (row: BrowseRow) => {
    const ind = isSkuIndustryCode(row.industry) ? row.industry : "TA";
    const details = SKU_DETAILS[ind as SkuIndustryCode];
    const det =
      details.find((d) => d.code === row.detail)?.code || details[0]?.code || "";
    setMoveIndustry(ind);
    setMoveDetail(det);
    setMoveRow(row);
  };

  const saveMove = async () => {
    if (!moveRow) return;
    setMoving(true);
    const industry =
      moveIndustry === OTHER_INDUSTRY ? OTHER_INDUSTRY : moveIndustry;
    const detail =
      moveIndustry === OTHER_INDUSTRY ? null : moveDetail || null;
    const { error } = await supabase
      .from("products")
      .update({
        sku_industry: industry,
        sku_detail: detail,
      } as never)
      .eq("id", moveRow.productId);
    setMoving(false);
    if (error) {
      toast({
        title: "Không đổi được nhóm",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: "Đã đổi nhóm",
      description: `${moveRow.slug} → ${groupTitle(industry, detail || "")}`,
    });
    setMoveRow(null);
    void refreshProducts();
  };

  const openRename = (row: BrowseRow) => {
    setRenameName(row.name);
    setRenameRow(row);
  };

  const saveRename = async () => {
    if (!renameRow) return;
    const next = renameName.trim();
    if (!next) {
      toast({
        title: "Nhập tên mới",
        variant: "destructive",
      });
      return;
    }
    if (next === renameRow.name.trim()) {
      setRenameRow(null);
      return;
    }
    setRenaming(true);
    try {
      const result = await renameProductEverywhere(renameRow.productId, next);
      toast({
        title: "Đã đổi tên",
        description: `${renameRow.slug} · ${formatRenameCounts(result)}`,
      });
      setRenameRow(null);
      void refreshProducts();
    } catch (e) {
      toast({
        title: "Không đổi được tên",
        description: e instanceof Error ? e.message : "Lỗi",
        variant: "destructive",
      });
    } finally {
      setRenaming(false);
    }
  };

  const moveDetailOptions =
    moveIndustry !== OTHER_INDUSTRY && isSkuIndustryCode(moveIndustry)
      ? SKU_DETAILS[moveIndustry as SkuIndustryCode]
      : [];

  const loading = whLoading || catalogLoading || stockLoading;
  const selectedWh = warehouseOptions.find((w) => w.id === selectedId);

  if (!canView) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Không có quyền xem tồn kho</AlertTitle>
        <AlertDescription>
          Tài khoản chưa được cấp quyền <b>inventory.view</b>. Liên hệ quản trị
          để bật phân quyền xem tồn kho.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Kho</Label>
          <Select value={selectedId} onValueChange={setWarehouseId}>
            <SelectTrigger className="mt-1 h-9 w-[220px]" aria-label="Kho tồn">
              <SelectValue placeholder="Chọn kho" />
            </SelectTrigger>
            <SelectContent>
              {warehouseOptions.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {warehouseLabel(w)}
                  {w.code === "Q7" ? " (kho nguồn)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ngành</Label>
          <Select
            value={industry}
            onValueChange={(v) => {
              setIndustry(v);
              setDetail("all");
            }}
          >
            <SelectTrigger className="mt-1 h-9 w-[200px]" aria-label="Ngành">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả ngành</SelectItem>
              {SKU_INDUSTRIES.map((i) => (
                <SelectItem key={i.code} value={i.code}>
                  {i.code} · {i.label}
                </SelectItem>
              ))}
              <SelectItem value={OTHER_INDUSTRY}>Khác</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Nhóm chi tiết</Label>
          <Select
            value={detail}
            onValueChange={setDetail}
            disabled={industry === "all" || industry === OTHER_INDUSTRY}
          >
            <SelectTrigger className="mt-1 h-9 w-[240px]" aria-label="Chi tiết">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {detailOptions.map((d) => (
                <SelectItem key={d.code} value={d.code}>
                  {d.code} · {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[220px] flex-1">
          <Label className="text-xs">Lọc tên / mã hàng</Label>
          <Input
            className="mt-1 h-9"
            placeholder="Gõ tên hoặc mã SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm pb-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={onlyInStock}
            onChange={(e) => setOnlyInStock(e.target.checked)}
          />
          Chỉ còn hàng
        </label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => {
            void refreshProducts();
            void refetch();
          }}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-1" />
          )}
          Làm mới
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-9"
          onClick={() =>
            printGroups(
              grouped,
              query.trim()
                ? `Tìm “${query.trim()}” — in cả nhóm chứa mã khớp`
                : undefined,
            )
          }
          disabled={loading || grouped.length === 0}
        >
          <Printer className="w-4 h-4 mr-1" />
          In nhóm đang xem
        </Button>
      </div>

      {canImport && (
        <details className="rounded-md border bg-card p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Cập nhật tồn hàng ngày — file TỔNG HỢP TỒN KHO
          </summary>
          <div className="mt-3">
            <CatalogStockImport
              variant="daily"
              onSuccess={() => {
                void refreshProducts();
                void refetch();
              }}
            />
          </div>
        </details>
      )}

      <Alert>
        <Warehouse className="h-4 w-4" />
        <AlertTitle>
          {selectedWh ? warehouseLabel(selectedWh) : "Tồn kho"}
        </AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <div>
            Cập nhật tồn mới nhất:{" "}
            <b>{fmtWhen(latestUpdatedAt)}</b>
          </div>
          <div className="text-muted-foreground">
            Chi nhánh xem kho mình và Q7. Gõ tên → hiện cả nhóm chứa mã đó, rồi
            in nhóm. Sai nhóm: Đổi nhóm. Sai tên: Đổi tên (đổi luôn trên đơn cũ
            cùng mã hàng).
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="secondary">{filtered.length} dòng</Badge>
        <Badge variant="outline">{grouped.length} nhóm</Badge>
        {query.trim() && (
          <span className="text-xs text-muted-foreground">
            Đang hiện cả nhóm có mã khớp “{query.trim()}” (dòng khớp tô vàng khi
            in).
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Đang tải tồn kho…
        </div>
      ) : (
        <div className={excelTableWrap}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={cn(excelTh, "w-10 text-center")}>#</TableHead>
                <TableHead className={cn(excelTh, "w-36")}>Mã hàng</TableHead>
                <TableHead className={excelTh}>Tên hàng</TableHead>
                <TableHead className={cn(excelTh, "w-20")}>ĐVT</TableHead>
                <TableHead className={cn(excelTh, "w-24 text-right")}>Tồn</TableHead>
                <TableHead className={cn(excelTh, "w-40")}>Cập nhật tồn</TableHead>
                {canEditCatalog && (
                  <TableHead className={cn(excelTh, "w-36")}>Sửa</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {grouped.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canEditCatalog ? 7 : 6}
                    className={cn(excelTd, "text-center text-muted-foreground h-16")}
                  >
                    Không có mã khớp bộ lọc.
                  </TableCell>
                </TableRow>
              ) : (
                grouped.flatMap((g) => {
                  const header = (
                    <TableRow key={`g-${g.key}`} className="bg-sky-50">
                      <TableCell
                        colSpan={canEditCatalog ? 7 : 6}
                        className={cn(excelTd, "font-semibold text-sky-900")}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span>
                            {groupTitle(g.industry, g.detail)}
                            <span className="ml-2 font-normal text-muted-foreground">
                              ({g.rows.length})
                            </span>
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7"
                            onClick={() =>
                              printGroups(
                                [g],
                                query.trim()
                                  ? `Tìm “${query.trim()}” — cả nhóm`
                                  : undefined,
                              )
                            }
                          >
                            <Printer className="w-3.5 h-3.5 mr-1" />
                            In nhóm
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                  const body = g.rows.map((r, i) => (
                    <TableRow
                      key={r.key}
                      className={cn(excelTr, r.matched && "bg-amber-50")}
                    >
                      <TableCell className={cn(excelTd, "text-center text-muted-foreground")}>
                        {i + 1}
                      </TableCell>
                      <TableCell className={cn(excelTd, "font-mono text-xs uppercase")}>
                        {r.slug}
                      </TableCell>
                      <TableCell className={excelTd}>
                        {canEditCatalog ? (
                          <button
                            type="button"
                            className="text-left hover:underline"
                            onClick={() => openRename(r)}
                            title="Đổi tên — cập nhật luôn đơn cũ cùng mã"
                          >
                            {r.name}
                          </button>
                        ) : (
                          r.name
                        )}
                      </TableCell>
                      <TableCell className={excelTd}>{r.unit}</TableCell>
                      <TableCell
                        className={cn(
                          excelTd,
                          "text-right tabular-nums font-medium",
                          r.qty <= 0 && "text-muted-foreground",
                        )}
                      >
                        {r.qty.toLocaleString("vi-VN")}
                      </TableCell>
                      <TableCell className={cn(excelTd, "tabular-nums text-xs")}>
                        {fmtWhen(r.updatedAt)}
                      </TableCell>
                      {canEditCatalog && (
                        <TableCell className={excelTd}>
                          <div className="flex flex-wrap gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openRename(r)}
                            >
                              <Type className="w-3.5 h-3.5 mr-1" />
                              Đổi tên
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2"
                              onClick={() => openMove(r)}
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              Đổi nhóm
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ));
                  return [header, ...body];
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!moveRow} onOpenChange={(o) => !o && setMoveRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi nhóm SKU</DialogTitle>
            <DialogDescription>
              {moveRow
                ? `${moveRow.slug} · ${moveRow.name}`
                : "Chọn ngành và nhóm chi tiết mới."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Ngành</Label>
              <Select
                value={moveIndustry}
                onValueChange={(v) => {
                  setMoveIndustry(v);
                  if (v === OTHER_INDUSTRY) {
                    setMoveDetail("");
                    return;
                  }
                  if (isSkuIndustryCode(v)) {
                    setMoveDetail(SKU_DETAILS[v][0]?.code || "");
                  }
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SKU_INDUSTRIES.map((i) => (
                    <SelectItem key={i.code} value={i.code}>
                      {i.code} · {i.label}
                    </SelectItem>
                  ))}
                  <SelectItem value={OTHER_INDUSTRY}>Khác</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Nhóm chi tiết</Label>
              <Select
                value={moveDetail}
                onValueChange={setMoveDetail}
                disabled={moveIndustry === OTHER_INDUSTRY}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {moveDetailOptions.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.code} · {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoveRow(null)}
              disabled={moving}
            >
              Hủy
            </Button>
            <Button type="button" onClick={() => void saveMove()} disabled={moving}>
              {moving ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : null}
              Lưu nhóm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameRow} onOpenChange={(o) => !o && !renaming && setRenameRow(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi tên sản phẩm</DialogTitle>
            <DialogDescription>
              {renameRow
                ? `${renameRow.slug} · tên hiện tại: ${renameRow.name}`
                : "Nhập tên mới."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs">Tên mới</Label>
            <Input
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void saveRename();
                }
              }}
              autoFocus
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground">
              Đổi trên danh mục và mọi dòng đơn / điều chuyển / phiếu XB cùng mã
              hàng — kể cả đơn đã khóa. Mã hàng không đổi.
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRenameRow(null)}
              disabled={renaming}
            >
              Hủy
            </Button>
            <Button type="button" onClick={() => void saveRename()} disabled={renaming}>
              {renaming ? (
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
              ) : null}
              Lưu tên
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
