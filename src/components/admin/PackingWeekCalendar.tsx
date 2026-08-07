import { useEffect, useMemo, useState } from "react";
import { format, addWeeks, subWeeks } from "date-fns";
import { vi } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  AlertTriangle,
  Printer,
  LayoutGrid,
} from "lucide-react";
import { useWarehouses, warehouseLabel } from "@/hooks/useWarehouses";
import { useStoreScope } from "@/hooks/useStoreScope";
import { useWeekOrders } from "@/hooks/useOrders";
import {
  getMonday,
  getWeekDays,
  toDateKey,
  WEEKDAY_NAMES_VI,
  formatOrderTimestampUi,
} from "@/lib/packingWindows";
import PrintDayModal, {
  type PrintDayOrderRow,
} from "@/components/admin/PrintDayModal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const ALL = "__ALL__";

interface PackingWeekCalendarProps {
  className?: string;
  onSelectOrder?: (orderId: string) => void;
  showPrintDay?: boolean;
}

/**
 * Lịch gom đơn: 1 kho × tuần HOẶC tất cả kho × tuần (GAS).
 * In Đơn Ngày vẫn ghép nhiều phiếu / nhiều chi nhánh.
 */
export default function PackingWeekCalendar({
  className,
  onSelectOrder,
  showPrintDay = true,
}: PackingWeekCalendarProps) {
  const { warehouses, loading: whLoading } = useWarehouses();
  const { warehouseId: scopedWhId, isStoreScoped } = useStoreScope();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [activeWarehouse, setActiveWarehouse] = useState<string>(ALL);
  const [printDay, setPrintDay] = useState<{
    dateKey: string;
    dateLabel: string;
    orders: PrintDayOrderRow[];
  } | null>(null);

  useEffect(() => {
    if (isStoreScoped && scopedWhId) setActiveWarehouse(scopedWhId);
  }, [isStoreScoped, scopedWhId]);

  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const weekStartKey = toDateKey(weekStart);
  const isAll = !isStoreScoped && activeWarehouse === ALL;

  const visibleWarehouses = useMemo(() => {
    if (isStoreScoped && scopedWhId) {
      return warehouses.filter((w) => w.id === scopedWhId);
    }
    return warehouses;
  }, [warehouses, isStoreScoped, scopedWhId]);

  const { data: orders = [], isLoading: loading } = useWeekOrders({
    weekStartYYYYMMDD: weekStartKey,
    warehouseId: isAll ? null : activeWarehouse,
    enabled: !!activeWarehouse && (isAll || warehouses.length > 0),
  });

  const byDay = useMemo(() => {
    const map = new Map<string, typeof orders>();
    for (const day of weekDays) map.set(toDateKey(day), []);
    for (const o of orders) {
      const key = toDateKey(new Date(o.createdAtMs));
      if (!map.has(key)) continue;
      map.get(key)!.push(o);
    }
    return map;
  }, [orders, weekDays]);

  /** ALL mode: day × warehouse matrix */
  const byDayWh = useMemo(() => {
    if (!isAll) return null;
    const map = new Map<string, Map<string, typeof orders>>();
    for (const day of weekDays) {
      const dayKey = toDateKey(day);
      const inner = new Map<string, typeof orders>();
      for (const w of warehouses) inner.set(w.id, []);
      map.set(dayKey, inner);
    }
    for (const o of orders) {
      const dayKey = toDateKey(new Date(o.createdAtMs));
      const whId = o.warehouse_id || "";
      const dayMap = map.get(dayKey);
      if (!dayMap) continue;
      if (!dayMap.has(whId)) dayMap.set(whId, []);
      dayMap.get(whId)!.push(o);
    }
    return map;
  }, [isAll, orders, weekDays, warehouses]);

  const activeWh = warehouses.find((w) => w.id === activeWarehouse);
  const warehouseCode = activeWh
    ? warehouseLabel(activeWh)
    : "Tất cả";

  const openPrintForDay = (dateKey: string, dateLabel: string, list: typeof orders) => {
    setPrintDay({
      dateKey,
      dateLabel,
      orders: list.map((o) => ({
        id: o.id,
        order_code: o.order_code,
        status: o.status,
        warehouse_id: o.warehouse_id,
        warehouse_code: warehouseLabel({
          code: o.warehouse?.code || "",
          short_name: o.warehouse?.short_name,
          print_name: o.warehouse?.print_name,
          name: o.warehouse?.name,
        }),
        created_at: o.created_at,
        totalQty: o.totalQty,
      })),
    });
  };

  return (
    <Card className={cn(className)}>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 py-3">
        <div>
          <CardTitle className="text-xl">Lịch gom đơn đa kho</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            1 kho / nhiều ngày · hoặc tất cả kho / 1 tuần · In nhiều phiếu 1 ngày
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekStart((d) => subWeeks(d, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[160px] text-center">
            Tuần {format(weekStart, "dd/MM", { locale: vi })} –{" "}
            {format(weekDays[6], "dd/MM/yyyy", { locale: vi })}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setWeekStart((d) => addWeeks(d, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8"
            onClick={() => setWeekStart(getMonday(new Date()))}
          >
            Hôm nay
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {whLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : warehouses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Chưa có mã kho. Chạy migration warehouses.
          </p>
        ) : (
          <Tabs
            value={activeWarehouse}
            onValueChange={(v) => {
              if (isStoreScoped) return;
              setActiveWarehouse(v);
            }}
          >
            <TabsList className="flex flex-wrap h-auto gap-1">
              {!isStoreScoped ? (
                <TabsTrigger value={ALL} className="gap-1">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  Tất cả kho
                </TabsTrigger>
              ) : null}
              {visibleWarehouses.map((w) => (
                <TabsTrigger key={w.id} value={w.id} className="gap-1">
                  <Package className="h-3.5 w-3.5" />
                  {warehouseLabel(w)}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ===== ALL warehouses × week ===== */}
            <TabsContent value={ALL} className="mt-3">
              {loading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="overflow-x-auto rounded-md border border-gray-300">
                  <table className="w-full min-w-[900px] text-xs border-collapse">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-20 bg-slate-100 border border-gray-200 px-2 py-1 text-left">
                          Kho
                        </th>
                        {weekDays.map((day, idx) => {
                          const key = toDateKey(day);
                          const dayAll = byDay.get(key) ?? [];
                          return (
                            <th
                              key={key}
                              className="border border-gray-200 bg-slate-100 px-1 py-1 min-w-[110px]"
                            >
                              <div className="font-semibold">
                                {WEEKDAY_NAMES_VI[idx]}
                              </div>
                              <div>{format(day, "dd/MM", { locale: vi })}</div>
                              {showPrintDay && dayAll.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-6 text-[10px] px-1 mt-0.5 w-full"
                                  onClick={() =>
                                    openPrintForDay(
                                      key,
                                      format(day, "dd/MM/yyyy", { locale: vi }),
                                      dayAll,
                                    )
                                  }
                                >
                                  <Printer className="w-3 h-3 mr-0.5" />
                                  In ({dayAll.length})
                                </Button>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {warehouses.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50">
                          <td className="sticky left-0 z-10 bg-white border border-gray-200 px-2 py-1 font-bold">
                            {warehouseLabel(w)}
                          </td>
                          {weekDays.map((day) => {
                            const key = toDateKey(day);
                            const list =
                              byDayWh?.get(key)?.get(w.id) ?? [];
                            return (
                              <td
                                key={key}
                                className="border border-gray-200 px-1 py-1 align-top"
                              >
                                {list.length === 0 ? (
                                  <span className="text-muted-foreground/50">
                                    —
                                  </span>
                                ) : (
                                  <div className="space-y-0.5 max-h-36 overflow-y-auto">
                                    {list.map((o) => (
                                      <button
                                        key={o.id}
                                        type="button"
                                        className={cn(
                                          "block w-full text-left font-mono text-[10px] truncate underline-offset-2 hover:underline",
                                          o.status === "pending" &&
                                            "text-sky-700",
                                          o.status === "processing" &&
                                            "text-amber-700",
                                          o.status === "completed" &&
                                            "text-emerald-700",
                                        )}
                                        onClick={() => onSelectOrder?.(o.id)}
                                        title={`${o.order_code} · ${format(new Date(o.created_at), "HH:mm dd/MM")} · SL ${o.totalQty}`}
                                      >
                                        {o.order_code || o.id.slice(0, 8)}
                                        <span className="text-muted-foreground font-sans ml-1">
                                          {format(new Date(o.created_at), "HH:mm")}
                                        </span>
                                        {o.isDuplicateSuspect && (
                                          <AlertTriangle className="inline w-2.5 h-2.5 ml-0.5 text-amber-600" />
                                        )}
                                      </button>
                                    ))}
                                    <div className="text-[9px] text-muted-foreground">
                                      {list.length} đơn
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* ===== Single warehouse ===== */}
            {warehouses.map((w) => (
              <TabsContent key={w.id} value={w.id} className="mt-3">
                {loading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <div className="grid grid-cols-7 gap-2 min-w-[840px]">
                      {weekDays.map((day, idx) => {
                        const key = toDateKey(day);
                        const list = byDay.get(key) ?? [];
                        const dateLabel = format(day, "dd/MM/yyyy", {
                          locale: vi,
                        });
                        return (
                          <div key={key} className="space-y-1">
                            <div className="text-center space-y-0.5">
                              <div className="text-xs font-semibold text-muted-foreground">
                                {WEEKDAY_NAMES_VI[idx]}
                              </div>
                              <div className="text-sm font-medium">
                                {format(day, "dd/MM", { locale: vi })}
                              </div>
                              <Badge
                                variant="outline"
                                className="text-[10px]"
                              >
                                {warehouseCode}
                              </Badge>
                              {showPrintDay && list.length > 0 && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 text-[10px] px-2 w-full"
                                  onClick={() =>
                                    openPrintForDay(key, dateLabel, list)
                                  }
                                >
                                  <Printer className="w-3 h-3 mr-1" />
                                  In Ngày
                                </Button>
                              )}
                            </div>
                            <div className="rounded-md border bg-muted/20 p-1.5 min-h-[120px] space-y-1">
                              {list.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground/70">
                                  —
                                </p>
                              ) : (
                                list.map((o) => (
                                  <button
                                    key={o.id}
                                    type="button"
                                    className={cn(
                                      "w-full text-left text-[11px] leading-tight rounded px-1 py-0.5 border bg-background hover:bg-accent transition",
                                      o.isDuplicateSuspect &&
                                        "border-amber-400 bg-amber-50",
                                      o.status === "pending" &&
                                        "border-l-4 border-l-sky-500",
                                      o.status === "processing" &&
                                        "border-l-4 border-l-amber-500",
                                      o.status === "completed" &&
                                        "border-l-4 border-l-emerald-500",
                                    )}
                                    onClick={() => onSelectOrder?.(o.id)}
                                  >
                                    <div className="flex items-center gap-1">
                                      <span className="font-mono font-medium truncate text-sky-700">
                                        {o.order_code || o.id.slice(0, 8)}
                                      </span>
                                      {o.isDuplicateSuspect && (
                                        <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                                      )}
                                    </div>
                                    <span className="block text-[10px] text-muted-foreground">
                                      {formatOrderTimestampUi(o.createdAtMs)} ·
                                      SL {o.totalQty}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        )}
      </CardContent>

      {printDay && (
        <PrintDayModal
          open={!!printDay}
          onOpenChange={(o) => !o && setPrintDay(null)}
          dateKey={printDay.dateKey}
          dateLabel={printDay.dateLabel}
          orders={printDay.orders}
          warehouses={warehouses}
          defaultWarehouseId={isAll ? null : activeWarehouse}
        />
      )}
    </Card>
  );
}
