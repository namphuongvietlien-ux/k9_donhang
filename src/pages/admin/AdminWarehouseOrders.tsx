import { useEffect, useMemo, useState, Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, RefreshCw } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import DataImport from "@/components/admin/DataImport";
import CreateWarehouseOrderForm from "@/components/admin/CreateWarehouseOrderForm";
import WarehouseOrderDetail from "@/components/admin/WarehouseOrderDetail";
import ReceiveOrdersPanel from "@/components/admin/ReceiveOrdersPanel";
import PackingWeekCalendar from "@/components/admin/PackingWeekCalendar";
import PackingSummaryBoard from "@/components/admin/PackingSummaryBoard";
import BanKemDvPanel from "@/components/admin/BanKemDvPanel";
import SEO from "@/components/SEO";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { useWarehouseOrders } from "@/hooks/useWarehouseOrders";
import {
  ORDER_KIND_LABELS,
  WAREHOUSE_STATUS_BADGE,
  WAREHOUSE_STATUS_LABELS,
  type OrderKind,
} from "@/lib/warehouseOrders";
import {
  inferPackingDayFromCreatedAt,
  MODE_LABELS,
  toDateKey,
} from "@/lib/packingWindows";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  excelTableWrap,
  excelTd,
  excelTh,
  excelTr,
} from "@/components/ui/qty-input";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type QuickFilter = "all" | "today" | "main" | "supp";
type GroupBy = "date" | "warehouse";

const VALID_TABS = new Set([
  "list",
  "calendar",
  "summary",
  "xb",
  "bankem",
  "create",
  "receive",
]);

const AdminWarehouseOrders = () => {
  const { warehouses } = useWarehouses();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const soPhieu = searchParams.get("soPhieu");
  const [tab, setTab] = useState(() => {
    if (tabFromUrl === "bankem") return "xb";
    if (tabFromUrl && VALID_TABS.has(tabFromUrl)) {
      return tabFromUrl === "bankem" ? "xb" : tabFromUrl;
    }
    return "list";
  });

  useEffect(() => {
    if (!tabFromUrl) return;
    if (tabFromUrl === "bankem" || tabFromUrl === "xb") setTab("xb");
    else if (VALID_TABS.has(tabFromUrl)) setTab(tabFromUrl);
  }, [tabFromUrl]);

  const handleTabChange = (v: string) => {
    setTab(v);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", v);
        if (v !== "xb") n.delete("xb");
        if (v !== "list") n.delete("soPhieu");
        return n;
      },
      { replace: true },
    );
  };
  const [kind, setKind] = useState<OrderKind | "ALL">("ALL");
  const [status, setStatus] = useState<string>("ALL");
  const [warehouseId, setWarehouseId] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [quick, setQuick] = useState<QuickFilter>("today");
  const [groupBy, setGroupBy] = useState<GroupBy>("warehouse");

  const filters = useMemo(
    () => ({
      kind,
      status,
      warehouseId: warehouseId === "ALL" ? null : warehouseId,
      search: search.trim() || undefined,
      limit: 300,
    }),
    [kind, status, warehouseId, search],
  );

  const { data: orders, isLoading, isFetching, refetch } =
    useWarehouseOrders(filters);

  useEffect(() => {
    if (!soPhieu || !orders?.length) return;
    const hit = orders.find(
      (o) =>
        String(o.order_code || "").toUpperCase() ===
        String(soPhieu).toUpperCase(),
    );
    if (hit) {
      setDetailId(hit.id);
      setTab("list");
    }
  }, [soPhieu, orders]);

  const filtered = useMemo(() => {
    const list = orders || [];
    if (quick === "all") return list;
    const todayKey = toDateKey(new Date());
    return list.filter((o) => {
      const inferred = inferPackingDayFromCreatedAt(o.created_at);
      if (quick === "today") {
        return inferred.win.packingDayStr === todayKey;
      }
      if (inferred.win.packingDayStr !== todayKey) return false;
      if (quick === "main") return inferred.mode === "main";
      if (quick === "supp") return inferred.mode === "supp";
      return true;
    });
  }, [orders, quick]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const o of filtered) {
      let key: string;
      if (groupBy === "warehouse") {
        key = warehouseShortLabel(o.warehouse) || o.warehouse_id || "—";
      } else {
        key = format(new Date(o.created_at), "yyyy-MM-dd");
      }
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(o);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "vi"));
  }, [filtered, groupBy]);

  return (
    <AdminLayout>
      <SEO title="Phiếu DH/DC | Kho K9" />
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Hub phiếu kho</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              DH/DC · Xuất bán (XB) · lịch đa kho · tổng hợp soạn
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span className="ml-2">Làm mới</span>
          </Button>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap h-auto gap-1">
            <TabsTrigger value="list">Danh sách</TabsTrigger>
            <TabsTrigger value="calendar">Lịch gom đơn</TabsTrigger>
            <TabsTrigger value="summary">Tổng hợp soạn</TabsTrigger>
            <TabsTrigger value="xb">Xuất Bán (XB)</TabsTrigger>
            <TabsTrigger value="create">Tạo / Import</TabsTrigger>
            <TabsTrigger value="receive">Xác nhận nhận</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="space-y-3 mt-3">
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["today", "Hôm nay"],
                  ["main", MODE_LABELS.main],
                  ["supp", MODE_LABELS.supp],
                  ["all", "Tất cả"],
                ] as const
              ).map(([k, label]) => (
                <Button
                  key={k}
                  type="button"
                  size="sm"
                  variant={quick === k ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => setQuick(k)}
                >
                  {label}
                </Button>
              ))}
              <span className="mx-1 text-muted-foreground self-center text-xs">
                |
              </span>
              <Button
                type="button"
                size="sm"
                variant={groupBy === "warehouse" ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setGroupBy("warehouse")}
              >
                Nhóm theo kho
              </Button>
              <Button
                type="button"
                size="sm"
                variant={groupBy === "date" ? "secondary" : "ghost"}
                className="h-7 text-xs"
                onClick={() => setGroupBy("date")}
              >
                Nhóm theo ngày
              </Button>
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as OrderKind | "ALL")}
              >
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Loại" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả loại</SelectItem>
                  <SelectItem value="DH">{ORDER_KIND_LABELS.DH}</SelectItem>
                  <SelectItem value="DC">{ORDER_KIND_LABELS.DC}</SelectItem>
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
                  <SelectItem value="pending">Mới</SelectItem>
                  <SelectItem value="processing">Đã soạn</SelectItem>
                  <SelectItem value="completed">Đã nhận</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Kho nhận" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tất cả kho nhận</SelectItem>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {warehouseLabel(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8"
                placeholder="Tìm mã phiếu…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <Card>
              <CardContent className="pt-3 pb-3">
                {isLoading ? (
                  <div className="flex justify-center py-12 text-muted-foreground gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Đang tải…
                  </div>
                ) : !filtered.length ? (
                  <p className="text-center text-muted-foreground py-10 text-sm">
                    Không có phiếu khớp bộ lọc.
                  </p>
                ) : (
                  <div className={excelTableWrap}>
                    <Table stickyHeader>
                      <TableHeader>
                        <TableRow>
                          <TableHead className={cn(excelTh, "w-10 text-center")}>
                            STT
                          </TableHead>
                          <TableHead className={cn(excelTh, "text-left")}>
                            Mã phiếu
                          </TableHead>
                          <TableHead className={excelTh}>Loại</TableHead>
                          <TableHead className={cn(excelTh, "text-left")}>
                            Xuất → Nhận
                          </TableHead>
                          <TableHead className={excelTh}>TT</TableHead>
                          <TableHead className={cn(excelTh, "text-right")}>
                            SL YC
                          </TableHead>
                          <TableHead className={cn(excelTh, "text-right")}>
                            Soạn
                          </TableHead>
                          <TableHead className={cn(excelTh, "text-right")}>
                            Nhận
                          </TableHead>
                          <TableHead className={excelTh}>Ngày giờ</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(() => {
                          let stt = 0;
                          return grouped.map(([groupKey, list]) => (
                          <Fragment key={`g-${groupKey}`}>
                            <TableRow>
                              <TableCell
                                colSpan={9}
                                className="bg-slate-200/80 px-2 py-1 text-xs font-bold sticky left-0 border border-gray-300"
                              >
                                {groupBy === "warehouse"
                                  ? `Kho nhận: ${groupKey}`
                                  : `Ngày: ${format(new Date(`${groupKey}T00:00:00`), "dd/MM/yyyy", { locale: vi })}`}
                                <span className="ml-2 font-normal text-muted-foreground">
                                  ({list.length} phiếu)
                                </span>
                              </TableCell>
                            </TableRow>
                            {list.map((o) => {
                              stt += 1;
                              return (
                              <TableRow
                                key={o.id}
                                className={cn(excelTr, "cursor-pointer")}
                                onClick={() => setDetailId(o.id)}
                              >
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "text-center text-muted-foreground tabular-nums",
                                  )}
                                >
                                  {stt}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "font-mono text-xs font-semibold text-sky-800",
                                  )}
                                >
                                  {o.order_code}
                                </TableCell>
                                <TableCell className={excelTd}>
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-5 px-1"
                                  >
                                    {o.order_kind}
                                  </Badge>
                                </TableCell>
                                <TableCell
                                  className={cn(excelTd, "text-xs whitespace-nowrap")}
                                >
                                  {warehouseShortLabel(o.source_warehouse)} →{" "}
                                  {warehouseShortLabel(o.warehouse)}
                                </TableCell>
                                <TableCell className={excelTd}>
                                  <Badge
                                    className={cn(
                                      "font-normal text-[10px] h-5 px-1.5",
                                      WAREHOUSE_STATUS_BADGE[o.status],
                                    )}
                                  >
                                    {WAREHOUSE_STATUS_LABELS[o.status] ||
                                      o.status}
                                  </Badge>
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "text-right tabular-nums text-xs",
                                  )}
                                >
                                  {o.totalRequested}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "text-right tabular-nums text-xs",
                                  )}
                                >
                                  {o.totalPacked || "—"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "text-right tabular-nums text-xs",
                                  )}
                                >
                                  {o.totalReceived || "—"}
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    excelTd,
                                    "text-xs text-muted-foreground whitespace-nowrap",
                                  )}
                                >
                                  {format(
                                    new Date(o.created_at),
                                    "HH:mm dd/MM/yyyy",
                                    { locale: vi },
                                  )}
                                </TableCell>
                              </TableRow>
                              );
                            })}
                          </Fragment>
                          ));
                        })()}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="calendar" className="mt-3">
            <PackingWeekCalendar
              onSelectOrder={(id) => setDetailId(id)}
              showPrintDay
            />
          </TabsContent>

          <TabsContent value="summary" className="mt-3">
            <PackingSummaryBoard />
          </TabsContent>

          <TabsContent value="xb" className="mt-3">
            <BanKemDvPanel />
          </TabsContent>

          <TabsContent value="create" className="space-y-4 mt-3">
            <CreateWarehouseOrderForm
              onCreated={(id) => {
                setDetailId(id);
                setTab("list");
              }}
            />
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-lg">Import Excel / CSV</CardTitle>
              </CardHeader>
              <CardContent>
                <DataImport
                  onSuccess={() => {
                    void refetch();
                    setTab("list");
                  }}
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="receive" className="mt-3">
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-lg">Xác nhận nhận hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <ReceiveOrdersPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu</DialogTitle>
          </DialogHeader>
          {detailId && (
            <WarehouseOrderDetail
              orderId={detailId}
              onClose={() => setDetailId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminWarehouseOrders;
