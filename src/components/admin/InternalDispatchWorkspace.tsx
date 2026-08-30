import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Bell, Check, Eye, FileDown, Loader2, Plus, Printer, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import {
  escapeTelegramHtml,
  notifyInternalDispatchTelegram,
  type TelegramNotifyResult,
} from "@/lib/telegramNotify";
import {
  filterCatalogSuggestions,
  type CatalogSearchItem,
} from "@/lib/catalogSearch";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { openWeeklyBranchPrintWindow, type WeeklyBranchSheet } from "@/lib/internalDispatchPrint";
import { ProductSearchInput } from "@/components/admin/ProductSearchInput";
import InternalDispatchDetailDialog from "@/components/admin/InternalDispatchDetailDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type DispatchItem = { id?: string; line_no: number; product_id: string | null; product_code: string; product_name: string; unit: string | null; quantity: number; notes: string | null };
type WarehouseRef = { code: string; name: string; short_name?: string | null } | null;
type Dispatch = { id: string; dispatch_code: string; status: string; requested_at: string; requested_by: string; notes: string | null; warehouses: WarehouseRef; internal_dispatch_items: DispatchItem[] };
/** Đơn chi nhánh đã được gộp vào đơn tuần — nguồn để phân loại chi nhánh nào xuất. */
type WeeklyDispatchLink = {
  internal_dispatches: {
    dispatch_code: string;
    requested_at: string;
    warehouses: WarehouseRef;
    internal_dispatch_items: DispatchItem[];
  } | null;
};
type WeeklyOrder = { id: string; week_start: string; status: string; internal_weekly_items: DispatchItem[]; weekly_order_dispatches?: WeeklyDispatchLink[] };
type DraftLine = Omit<DispatchItem, "id" | "line_no">;

const statusLabel: Record<string, string> = {
  pending_manager: "Chờ quản lý duyệt", manager_approved: "Đã duyệt", manager_rejected: "Từ chối", processed: "Đã xử lý",
  open: "Đang gom", printed: "Đã in",
};

/** Thứ tự nhóm trạng thái trên Accordion (pending mở sẵn). */
const STATUS_GROUP_ORDER = [
  "pending_manager",
  "manager_approved",
  "manager_rejected",
  "processed",
] as const;

/** dd/MM/yyyy theo giờ máy local — tránh lệch ngày khi ISO là UTC. */
function formatLocalDdMmYyyy(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function localDateKeyFromIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "—";
  return formatLocalDdMmYyyy(parsed);
}

type DispatchDateGroup = { dateKey: string; items: Dispatch[] };
type DispatchStatusGroup = { status: string; dates: DispatchDateGroup[]; count: number };

/** Gom phiếu: status → ngày local dd/MM/yyyy (ngày mới hơn đứng trước). */
function groupDispatchesByStatusThenDate(list: Dispatch[]): DispatchStatusGroup[] {
  const byStatus = new Map<string, Map<string, Dispatch[]>>();

  for (const dispatch of list) {
    const status = dispatch.status || "unknown";
    const dateKey = localDateKeyFromIso(dispatch.requested_at);
    if (!byStatus.has(status)) byStatus.set(status, new Map());
    const byDate = byStatus.get(status)!;
    if (!byDate.has(dateKey)) byDate.set(dateKey, []);
    byDate.get(dateKey)!.push(dispatch);
  }

  const statusRank = (status: string) => {
    const index = STATUS_GROUP_ORDER.indexOf(status as (typeof STATUS_GROUP_ORDER)[number]);
    return index === -1 ? STATUS_GROUP_ORDER.length : index;
  };

  const parseDdMmYyyy = (key: string) => {
    const [dd, mm, yyyy] = key.split("/").map(Number);
    if (!yyyy || !mm || !dd) return 0;
    return new Date(yyyy, mm - 1, dd).getTime();
  };

  return [...byStatus.entries()]
    .sort((a, b) => statusRank(a[0]) - statusRank(b[0]))
    .map(([status, byDate]) => {
      const dates = [...byDate.entries()]
        .sort((a, b) => parseDdMmYyyy(b[0]) - parseDdMmYyyy(a[0]))
        .map(([dateKey, items]) => ({ dateKey, items }));
      return {
        status,
        dates,
        count: dates.reduce((sum, group) => sum + group.items.length, 0),
      };
    });
}

/** Khóa gộp giống RPC approve (weekly_order_id, product_code, unit). */
const weeklySkuKey = (code: string | null | undefined, unit: string | null | undefined) =>
  `${String(code || "").trim().toUpperCase()}|${String(unit || "").trim().toLowerCase()}`;

/** Chi nhánh nhận dùng làm khóa lọc: ưu tiên code DB, fallback nhãn ngắn. */
type BranchOption = { code: string; label: string };

function branchOptionOf(warehouse: WarehouseRef): BranchOption {
  const label = warehouseShortLabel(warehouse);
  return { code: String(warehouse?.code || "").trim() || label, label };
}

/**
 * Đơn tuần gộp SL theo mã hàng nên mất dấu chi nhánh. Dựng lại phân loại từ
 * weekly_order_dispatches → internal_dispatches → items.
 *
 * perSku khóa theo **code** chi nhánh (không phải nhãn) để lọc/in/xuất Excel
 * không bị lẫn giữa các chi nhánh có nhãn trùng nhau.
 */
function buildWeeklyBranchBreakdown(weekly: WeeklyOrder) {
  const perSku = new Map<string, Map<string, number>>();
  const branchLabels = new Map<string, string>();
  const detailRows: { branchCode: string; row: Record<string, string | number> }[] = [];

  for (const link of weekly.weekly_order_dispatches || []) {
    const dispatch = link?.internal_dispatches;
    if (!dispatch) continue;
    const branch = branchOptionOf(dispatch.warehouses);
    branchLabels.set(branch.code, branch.label);
    for (const item of dispatch.internal_dispatch_items || []) {
      const key = weeklySkuKey(item.product_code, item.unit);
      if (!perSku.has(key)) perSku.set(key, new Map());
      const byBranch = perSku.get(key)!;
      byBranch.set(branch.code, (byBranch.get(branch.code) || 0) + Number(item.quantity || 0));
      detailRows.push({
        branchCode: branch.code,
        row: {
          "Tuần từ ngày": weekly.week_start,
          "Chi nhánh": branch.label,
          "Mã đơn": dispatch.dispatch_code,
          "Ngày gửi": dispatch.requested_at ? new Date(dispatch.requested_at).toLocaleString("vi-VN") : "",
          "Mã hàng": item.product_code,
          "Tên hàng": item.product_name,
          "ĐVT": item.unit || "",
          "Số lượng": Number(item.quantity || 0),
        },
      });
    }
  }

  const branches: BranchOption[] = [...branchLabels.entries()]
    .map(([code, label]) => ({ code, label }))
    .sort((a, b) => a.label.localeCompare(b.label, "vi"));

  return { perSku, branches, branchLabels, detailRows };
}

/** SL của 1 mã hàng thuộc đúng 1 chi nhánh (0 nếu chi nhánh đó không đặt). */
function branchQtyOf(
  breakdown: ReturnType<typeof buildWeeklyBranchBreakdown> | null,
  item: DispatchItem,
  branchCode: string,
) {
  return (
    breakdown?.perSku.get(weeklySkuKey(item.product_code, item.unit))?.get(branchCode) || 0
  );
}

/** Tên sheet Excel: bỏ ký tự Excel không nhận, giới hạn 31 ký tự. */
function sheetName(name: string) {
  const clean = name.replace(/[\\/?*[\]:]/g, "-").trim().slice(0, 31);
  return clean || "Sheet";
}

/**
 * Xuất Excel lịch sử. `branch = null` → tổng hợp toàn hệ thống, kèm 1 sheet
 * riêng cho mỗi chi nhánh của đơn tuần mới nhất. `branch` có giá trị → toàn bộ
 * workbook chỉ chứa số liệu của đúng chi nhánh đó.
 */
function exportHistory(
  dispatches: Dispatch[],
  weeklyOrders: WeeklyOrder[],
  branch: BranchOption | null,
) {
  const scopedDispatches = branch
    ? dispatches.filter((dispatch) => branchOptionOf(dispatch.warehouses).code === branch.code)
    : dispatches;

  const dispatchRows = scopedDispatches.flatMap((dispatch) => {
    // STT chạy liên tục theo từng phiếu, không lấy line_no có thể bị khuyết
    let stt = 0;
    return dispatch.internal_dispatch_items.map((item) => {
      stt += 1;
      return {
        "Mã đơn": dispatch.dispatch_code, "Chi nhánh": warehouseShortLabel(dispatch.warehouses), "Trạng thái": statusLabel[dispatch.status] || dispatch.status,
        "Ngày gửi": new Date(dispatch.requested_at).toLocaleString("vi-VN"), "STT": stt, "Mã hàng": item.product_code,
        "Tên hàng": item.product_name, "ĐVT": item.unit || "", "Số lượng": item.quantity, "Ghi chú đơn": dispatch.notes || "", "Ghi chú dòng": item.notes || "",
      };
    });
  });

  const breakdowns = new Map(weeklyOrders.map((weekly) => [weekly.id, buildWeeklyBranchBreakdown(weekly)]));

  /** Dòng đơn tuần của đúng 1 chi nhánh — SL là phần phân bổ riêng, STT liên tục. */
  const weeklyBranchRows = (weekly: WeeklyOrder, target: BranchOption) => {
    const breakdown = breakdowns.get(weekly.id) || null;
    let stt = 0;
    return weekly.internal_weekly_items.flatMap((item) => {
      const qty = branchQtyOf(breakdown, item, target.code);
      if (qty <= 0) return [];
      stt += 1;
      return [{
        "Tuần từ ngày": weekly.week_start, "Trạng thái": statusLabel[weekly.status] || weekly.status,
        "Chi nhánh": target.label, "STT": stt, "Mã hàng": item.product_code,
        "Tên hàng": item.product_name, "ĐVT": item.unit || "", "Số lượng": qty,
      }];
    });
  };

  const weeklyRows = branch
    ? weeklyOrders.flatMap((weekly) => weeklyBranchRows(weekly, branch))
    : weeklyOrders.flatMap((weekly) => {
      const breakdown = breakdowns.get(weekly.id);
      let stt = 0;
      return weekly.internal_weekly_items.map((item) => {
        stt += 1;
        const byBranch = breakdown?.perSku.get(weeklySkuKey(item.product_code, item.unit));
        const parts = byBranch
          ? [...byBranch.entries()].sort((a, b) => b[1] - a[1])
            .map(([code, qty]) => `${breakdown?.branchLabels.get(code) || code}: ${qty}`)
          : [];
        return {
          "Tuần từ ngày": weekly.week_start, "Trạng thái": statusLabel[weekly.status] || weekly.status, "STT": stt,
          "Mã hàng": item.product_code, "Tên hàng": item.product_name, "ĐVT": item.unit || "", "Tổng số lượng": item.quantity,
          "Chi nhánh xuất (SL)": parts.join(" · ") || "—", "Số chi nhánh": byBranch?.size || 0,
        };
      });
    });

  const branchRows = weeklyOrders.flatMap((weekly) =>
    (breakdowns.get(weekly.id)?.detailRows || [])
      .filter((entry) => !branch || entry.branchCode === branch.code)
      .map((entry) => entry.row),
  );

  const workbook = XLSX.utils.book_new();
  const dispatchSheet = XLSX.utils.json_to_sheet(dispatchRows);
  const weeklySheet = XLSX.utils.json_to_sheet(weeklyRows);
  const branchSheet = XLSX.utils.json_to_sheet(branchRows);
  dispatchSheet["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 26 }];
  weeklySheet["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 16 }, { wch: 40 }, { wch: 14 }];
  branchSheet["!cols"] = [{ wch: 16 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(workbook, dispatchSheet, sheetName(branch ? `Xuất nội bộ ${branch.label}` : "Lịch sử xuất nội bộ"));
  XLSX.utils.book_append_sheet(workbook, weeklySheet, sheetName(branch ? `Đơn tuần ${branch.label}` : "Đơn tuần"));
  XLSX.utils.book_append_sheet(workbook, branchSheet, sheetName(branch ? `Chi tiết ${branch.label}` : "Đơn tuần theo chi nhánh"));

  // Chế độ tổng hợp: thêm 1 sheet riêng cho từng chi nhánh của đơn tuần mới nhất
  const latestWeekly = weeklyOrders[0];
  if (!branch && latestWeekly) {
    const used = new Set<string>();
    for (const option of breakdowns.get(latestWeekly.id)?.branches || []) {
      const rows = weeklyBranchRows(latestWeekly, option);
      if (!rows.length) continue;
      let name = sheetName(`CN ${option.label}`);
      let suffix = 2;
      while (used.has(name)) name = sheetName(`CN ${option.label} ${suffix++}`);
      used.add(name);
      const sheet = XLSX.utils.json_to_sheet(rows);
      sheet["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(workbook, sheet, name);
    }
  }

  const scopeTag = branch ? `-${branch.label.replace(/\s+/g, "")}` : "";
  XLSX.writeFile(workbook, `lich-su-xuat-noi-bo${scopeTag}-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function InternalDispatchWorkspace() {
  const { warehouseId, warehouseLabel, role, user } = useAuth();
  const { products } = useProducts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [branchFilter, setBranchFilter] = useState("all");
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  /** Phiếu đang mở ở "mắt xem đơn" — giữ id để dữ liệu luôn theo query mới nhất */
  const [viewDispatchId, setViewDispatchId] = useState<string | null>(null);
  /** Form tạo đơn — mở bằng FAB (Sheet slide-over) */
  const [createOpen, setCreateOpen] = useState(false);
  const canManage = role === "manager" || role === "super_admin";
  const canComplete = role === "super_admin";

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["internal-dispatches"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("internal_dispatches" as never) as any)
        .select("id, dispatch_code, status, requested_at, requested_by, notes, warehouses:warehouse_id(code,name,short_name), internal_dispatch_items(id,line_no,product_id,product_code,product_name,unit,quantity,notes)")
        .order("requested_at", { ascending: false }).limit(200);
      if (error) throw error;
      return (data || []) as Dispatch[];
    },
  });
  const { data: weeklyOrders = [] } = useQuery({
    queryKey: ["weekly-orders"],
    enabled: canManage,
    queryFn: async () => {
      const { data, error } = await (supabase.from("weekly_orders" as never) as any)
        .select("id,week_start,status,weekly_order_items(id,line_no,product_id,product_code,product_name,unit,quantity),weekly_order_dispatches(internal_dispatches:dispatch_id(dispatch_code,requested_at,warehouses:warehouse_id(code,name,short_name),internal_dispatch_items(line_no,product_code,product_name,unit,quantity)))")
        .order("week_start", { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []).map((row: any) => ({ ...row, internal_weekly_items: row.weekly_order_items || [] })) as WeeklyOrder[];
    },
  });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["internal-dispatches"] }), queryClient.invalidateQueries({ queryKey: ["weekly-orders"] })]);

  /**
   * Manager duyệt/từ chối từ Telegram → telegram-webhook đổi DB ngoài app.
   * Query defaults của App.tsx (staleTime 5', refetchOnMount/Focus = false) giữ
   * UI cũ tới khi F5, nên phải nghe realtime rồi invalidate.
   * Cần migration 20260821000001 để 3 bảng này nằm trong publication realtime.
   */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("internal-dispatch-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "internal_dispatches" },
        () => { void queryClient.invalidateQueries({ queryKey: ["internal-dispatches"] }); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_orders" },
        () => { void queryClient.invalidateQueries({ queryKey: ["weekly-orders"] }); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "weekly_order_items" },
        () => { void queryClient.invalidateQueries({ queryKey: ["weekly-orders"] }); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user, queryClient]);

  /**
   * Telegram không được chặn nghiệp vụ: nghiệp vụ đã lưu xong mới bắn thông
   * báo, và lỗi thông báo chỉ hiện cảnh báo (không làm mutation thành thất bại).
   */
  const warnIfTelegramFailed = (result: TelegramNotifyResult) => {
    if (result.ok) return;
    toast({
      title: result.skipped ? "Chưa gửi được Telegram" : "Lỗi gửi Telegram",
      description: `${result.error || "Không rõ nguyên nhân"} — thao tác đã lưu, chỉ thông báo bị lỗi.`,
      variant: "destructive",
    });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Tài khoản chưa được gán chi nhánh.");
      const { data, error } = await supabase.rpc("create_internal_dispatch" as never, { _warehouse_id: warehouseId, _notes: notes || null, _items: lines } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (dispatchId) => {
      const lineCount = lines.length;
      setLines([]);
      setNotes("");
      setCreateOpen(false);
      await refresh();
      toast({ title: "Đã gửi đơn xuất nội bộ" });
      warnIfTelegramFailed(await notifyInternalDispatchTelegram(
        `📦 <b>Đơn xuất nội bộ mới</b>\nChi nhánh: ${escapeTelegramHtml(warehouseLabel || "—")}\nSố dòng: ${lineCount}\nTrạng thái: chờ quản lý duyệt`,
        { warehouseId: warehouseId || undefined, internalDispatchId: dispatchId },
      ));
    }, onError: (error: Error) => toast({ title: "Không gửi được đơn", description: error.message, variant: "destructive" }),
  });
  const approveMutation = useMutation({
    mutationFn: async (dispatch: Dispatch) => {
      const { error } = await supabase.rpc("approve_internal_dispatch" as never, { _dispatch_id: dispatch.id } as never);
      if (error) throw error;
      return dispatch;
    },
    onMutate: async (dispatch) => {
      await queryClient.cancelQueries({ queryKey: ["internal-dispatches"] });
      const previous = queryClient.getQueryData<Dispatch[]>(["internal-dispatches"]);
      queryClient.setQueryData<Dispatch[]>(["internal-dispatches"], (old) =>
        (old || []).map((row) =>
          row.id === dispatch.id ? { ...row, status: "manager_approved" } : row,
        ),
      );
      return { previous };
    },
    onError: (error: Error, _dispatch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["internal-dispatches"], context.previous);
      }
      toast({ title: "Không thể duyệt", description: error.message, variant: "destructive" });
    },
    onSuccess: async (dispatch) => {
      await refresh();
      toast({ title: `Đã duyệt ${dispatch.dispatch_code}`, description: "Hàng đã được cộng vào đơn tuần." });
      warnIfTelegramFailed(await notifyInternalDispatchTelegram(
        `✅ <b>Quản lý đã duyệt ${escapeTelegramHtml(dispatch.dispatch_code)}</b>\nChi nhánh: ${escapeTelegramHtml(dispatch.warehouses?.code || "—")}\nHàng đã được cộng vào đơn tuần.`,
        { recipientUserIds: [dispatch.requested_by] },
      ));
    },
  });
  const rejectMutation = useMutation({
    mutationFn: async (dispatch: Dispatch) => {
      const { error } = await supabase.rpc("reject_internal_dispatch" as never, { _dispatch_id: dispatch.id } as never);
      if (error) throw error;
      return dispatch;
    },
    onMutate: async (dispatch) => {
      await queryClient.cancelQueries({ queryKey: ["internal-dispatches"] });
      const previous = queryClient.getQueryData<Dispatch[]>(["internal-dispatches"]);
      queryClient.setQueryData<Dispatch[]>(["internal-dispatches"], (old) =>
        (old || []).map((row) =>
          row.id === dispatch.id ? { ...row, status: "manager_rejected" } : row,
        ),
      );
      return { previous };
    },
    onError: (error: Error, _dispatch, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["internal-dispatches"], context.previous);
      }
      toast({ title: "Không thể từ chối", description: error.message, variant: "destructive" });
    },
    onSuccess: async (dispatch) => {
      await refresh();
      toast({ title: `Đã từ chối ${dispatch.dispatch_code}`, variant: "destructive" });
      warnIfTelegramFailed(await notifyInternalDispatchTelegram(
        `❌ <b>Quản lý không duyệt ${escapeTelegramHtml(dispatch.dispatch_code)}</b>\nChi nhánh: ${escapeTelegramHtml(dispatch.warehouses?.code || "—")}\nVui lòng kiểm tra và tạo lại yêu cầu khi cần.`,
        { recipientUserIds: [dispatch.requested_by] },
      ));
    },
  });
  const completeMutation = useMutation({
    mutationFn: async (weekly: WeeklyOrder) => {
      const { error } = await supabase.rpc("complete_weekly_order" as never, { _weekly_order_id: weekly.id } as never);
      if (error) throw error;
      return weekly;
    },
    onSuccess: async (weekly) => {
      await refresh();
      warnIfTelegramFailed(await notifyInternalDispatchTelegram(
        `🏢 <b>Tổng công ty đã xử lý đơn tuần</b>\nTuần từ ${escapeTelegramHtml(weekly.week_start)}\nQuản lý có thể đối chiếu và lưu hồ sơ.`,
      ));
    }, onError: (error: Error) => toast({ title: "Không thể hoàn tất", description: error.message, variant: "destructive" }),
  });
  const printMutation = useMutation({
    mutationFn: async (weekly: WeeklyOrder) => {
      const { error } = await supabase.rpc("mark_weekly_order_printed" as never, { _weekly_order_id: weekly.id } as never);
      if (error) throw error;
      window.print();
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể cập nhật trạng thái in", description: error.message, variant: "destructive" }),
  });
  /** Chỉ đánh dấu đã in — dùng khi bản in đã mở ở tab riêng (in theo từng chi nhánh). */
  const markPrintedMutation = useMutation({
    mutationFn: async (weekly: WeeklyOrder) => {
      const { error } = await supabase.rpc("mark_weekly_order_printed" as never, { _weekly_order_id: weekly.id } as never);
      if (error) throw error;
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể cập nhật trạng thái in", description: error.message, variant: "destructive" }),
  });

  const availableProducts = useMemo(() => products.filter((product) => product.is_active !== false && product.slug), [products]);
  const productSuggestions = useMemo(
    () => filterCatalogSuggestions(availableProducts as unknown as CatalogSearchItem[], productSearch, 12),
    [availableProducts, productSearch],
  );
  const addProduct = () => {
    const product = availableProducts.find((item) => item.id === selectedProduct);
    if (!product) return;
    const productCode = product.slug || product.barcode || product.id;
    setLines((current) => [...current, { product_id: product.id, product_code: productCode, product_name: product.name, unit: product.unit || product.unit_name || null, quantity: 1, notes: null }]);
    setSelectedProduct(""); setProductSearch("");
  };
  const pickProduct = (productId: string) => {
    const product = availableProducts.find((item) => item.id === productId);
    if (!product) return;
    setSelectedProduct(product.id);
    setProductSearch(product.slug || product.name);
  };
  const currentWeekly = weeklyOrders[0];
  /** Đơn tuần gộp theo mã hàng — dựng lại "chi nhánh nào xuất" để lọc / in / xuất Excel. */
  const weeklyBreakdown = useMemo(
    () => (currentWeekly ? buildWeeklyBranchBreakdown(currentWeekly) : null),
    [currentWeekly],
  );

  /** Danh sách chi nhánh nhận có mặt trong dữ liệu (đơn lẻ + đơn tuần). */
  const branchOptions = useMemo(() => {
    const labels = new Map<string, string>();
    for (const dispatch of dispatches) {
      const branch = branchOptionOf(dispatch.warehouses);
      if (branch.code && branch.code !== "—") labels.set(branch.code, branch.label);
    }
    for (const branch of weeklyBreakdown?.branches || []) labels.set(branch.code, branch.label);
    return [...labels.entries()]
      .map(([code, label]) => ({ code, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [dispatches, weeklyBreakdown]);

  /** null = chế độ tổng hợp toàn hệ thống (kể cả khi filter cũ đã biến mất). */
  const activeBranch = useMemo(
    () => branchOptions.find((branch) => branch.code === branchFilter) || null,
    [branchOptions, branchFilter],
  );

  const visibleDispatches = useMemo(
    () => (activeBranch
      ? dispatches.filter((dispatch) => branchOptionOf(dispatch.warehouses).code === activeBranch.code)
      : dispatches),
    [dispatches, activeBranch],
  );

  /** Gom nhóm AppSheet: Trạng thái → Ngày local → danh sách phiếu. */
  const groupedDispatches = useMemo(
    () => groupDispatchesByStatusThenDate(visibleDispatches),
    [visibleDispatches],
  );

  /** Khóa ngày "Hôm nay" (local) — dùng làm defaultValue Accordion tầng ngày. */
  const todayDateKey = useMemo(() => formatLocalDdMmYyyy(new Date()), []);

  /** Dòng hàng đơn tuần đã tách theo chi nhánh đang chọn (SL = phần của CN đó). */
  const visibleWeeklyItems = useMemo(() => {
    const items = currentWeekly?.internal_weekly_items || [];
    if (!activeBranch) return items;
    return items.flatMap((item) => {
      const quantity = branchQtyOf(weeklyBreakdown, item, activeBranch.code);
      return quantity > 0 ? [{ ...item, quantity }] : [];
    });
  }, [currentWeekly, activeBranch, weeklyBreakdown]);

  const weeklyTotalQty = visibleWeeklyItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );

  /** Mỗi chi nhánh một phiếu in riêng; đang lọc thì chỉ phiếu của chi nhánh đó. */
  const branchSheets = useMemo<WeeklyBranchSheet[]>(() => {
    if (!currentWeekly) return [];
    const scope = activeBranch ? [activeBranch] : weeklyBreakdown?.branches || [];
    return scope
      .map((branch) => ({
        branchLabel: branch.label,
        lines: currentWeekly.internal_weekly_items.flatMap((item) => {
          const quantity = branchQtyOf(weeklyBreakdown, item, branch.code);
          return quantity > 0
            ? [{
              productCode: item.product_code,
              productName: item.product_name,
              unit: item.unit,
              quantity,
            }]
            : [];
        }),
      }))
      .filter((sheet) => sheet.lines.length > 0);
  }, [currentWeekly, activeBranch, weeklyBreakdown]);

  const branchScopeLabel = activeBranch ? activeBranch.label : "Tất cả chi nhánh";

  /** Phiếu đang xem — lấy lại từ danh sách để trạng thái tự đổi sau khi duyệt */
  const viewDispatch = useMemo(
    () => dispatches.find((dispatch) => dispatch.id === viewDispatchId) || null,
    [dispatches, viewDispatchId],
  );
  const decisionPending = approveMutation.isPending || rejectMutation.isPending;
  /** Optimistic UI: phiếu đang gọi RPC approve/reject */
  const syncingDispatchId =
    (approveMutation.isPending ? approveMutation.variables?.id : null) ||
    (rejectMutation.isPending ? rejectMutation.variables?.id : null) ||
    null;

  const statusBadge = (dispatch: Dispatch) => {
    if (syncingDispatchId === dispatch.id) {
      return (
        <Badge variant="outline" className="gap-1 border-sky-300 text-sky-700">
          <Loader2 className="h-3 w-3 animate-spin" />
          Đang đồng bộ...
        </Badge>
      );
    }
    return <Badge variant="secondary">{statusLabel[dispatch.status] || dispatch.status}</Badge>;
  };

  const branchCellText = (item: DispatchItem) => {
    const byBranch = weeklyBreakdown?.perSku.get(weeklySkuKey(item.product_code, item.unit));
    if (!byBranch?.size) return "—";
    const entries = [...byBranch.entries()].filter(
      ([code]) => !activeBranch || code === activeBranch.code,
    );
    if (!entries.length) return "—";
    return entries
      .sort((a, b) => b[1] - a[1])
      .map(([code, qty]) => `${weeklyBreakdown?.branchLabels.get(code) || code}: ${qty}`)
      .join(" · ");
  };
  /**
   * In phiếu riêng cho từng chi nhánh nhận. Mở tab in trước (đồng bộ trong sự
   * kiện click) để không bị popup blocker chặn, sau đó mới đánh dấu đã in.
   */
  const printByBranch = () => {
    if (!currentWeekly) return;
    if (!branchSheets.length) {
      toast({
        title: "Không có dòng hàng để in",
        description: activeBranch
          ? `Chi nhánh ${activeBranch.label} không có hàng trong đơn tuần này.`
          : "Đơn tuần chưa gom được đơn chi nhánh nào.",
        variant: "destructive",
      });
      return;
    }
    const opened = openWeeklyBranchPrintWindow({
      weekStart: currentWeekly.week_start,
      statusLabel: statusLabel[currentWeekly.status] || currentWeekly.status,
      sheets: branchSheets,
    });
    if (!opened) {
      toast({ title: "Trình duyệt chặn tab in", description: "Cho phép popup cho trang này rồi thử lại.", variant: "destructive" });
      return;
    }
    markPrintedMutation.mutate(currentWeekly);
  };

  const linkTelegram = async () => {
    setIsLinkingTelegram(true);
    try {
      const { data, error } = await supabase.functions.invoke("telegram-register");
      if (error || !data?.url) throw error || new Error("Không tạo được liên kết Telegram");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast({ title: "Không thể kết nối Telegram", description: error instanceof Error ? error.message : "Lỗi", variant: "destructive" });
    } finally {
      setIsLinkingTelegram(false);
    }
  };

  return (
    <div className="relative space-y-4 print:space-y-3">
      {/* Toolbar ngang — không có nút Thêm mới (dùng FAB) */}
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-bold">Xuất nội bộ và Đơn tuần</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn chi nhánh được duyệt tự động gom vào đơn tuần của Tổng công ty.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={activeBranch?.code || "all"} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-[210px]" aria-label="Lọc theo chi nhánh nhận">
              <SelectValue placeholder="Chi nhánh nhận" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả chi nhánh ({branchOptions.length})</SelectItem>
              {branchOptions.map((branch) => (
                <SelectItem key={branch.code} value={branch.code}>
                  {branch.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={linkTelegram} disabled={!user || isLinkingTelegram}>
            {isLinkingTelegram ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Bell className="mr-2 h-4 w-4" />
            )}
            Kết nối Telegram
          </Button>
          {canManage && (
            <Button
              variant="outline"
              onClick={() => exportHistory(dispatches, weeklyOrders, activeBranch)}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {activeBranch ? `Xuất Excel ${activeBranch.label}` : "Xuất Excel lịch sử"}
            </Button>
          )}
        </div>
      </div>

      {activeBranch && (
        <p className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm print:hidden">
          Đang lọc theo chi nhánh nhận <strong>{activeBranch.label}</strong> — bảng, phiếu in và
          file Excel chỉ chứa số liệu của chi nhánh này.
        </p>
      )}

      {/* Master: danh sách phiếu gom nhóm Accordion (status → ngày) */}
      <Card className="print:hidden shadow-sm">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-base">
            Đơn xuất nội bộ — {branchScopeLabel}{" "}
            <span className="text-sm font-normal text-muted-foreground">
              ({visibleDispatches.length} phiếu)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="h-[calc(100vh-120px)] overflow-y-auto border-t px-2">
            {isLoading ? (
              <div className="py-10 text-center">
                <Loader2 className="inline h-4 w-4 animate-spin" />
              </div>
            ) : !visibleDispatches.length ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                {activeBranch
                  ? `Chi nhánh ${activeBranch.label} chưa có đơn xuất nội bộ.`
                  : "Chưa có đơn xuất nội bộ."}
              </p>
            ) : (
              <Accordion
                type="multiple"
                defaultValue={["pending_manager"]}
                className="w-full"
              >
                {groupedDispatches.map((statusGroup) => (
                  <AccordionItem key={statusGroup.status} value={statusGroup.status}>
                    <AccordionTrigger className="px-2 text-sm hover:no-underline">
                      <span className="flex items-center gap-2 text-left">
                        <span className="font-semibold">
                          {statusLabel[statusGroup.status] || statusGroup.status}
                        </span>
                        <Badge variant="secondary" className="font-normal tabular-nums">
                          {statusGroup.count}
                        </Badge>
                      </span>
                    </AccordionTrigger>
                    <AccordionContent className="px-1 pb-3">
                      <Accordion
                        type="multiple"
                        defaultValue={
                          statusGroup.status === "pending_manager" ? [todayDateKey] : []
                        }
                        className="w-full border-l border-muted pl-2"
                      >
                        {statusGroup.dates.map((dateGroup) => (
                          <AccordionItem
                            key={`${statusGroup.status}-${dateGroup.dateKey}`}
                            value={dateGroup.dateKey}
                          >
                            <AccordionTrigger className="px-2 py-2 text-sm hover:no-underline">
                              <span className="flex items-center gap-2 text-left font-medium text-muted-foreground">
                                <span>
                                  {dateGroup.dateKey === todayDateKey
                                    ? `Hôm nay (${dateGroup.dateKey})`
                                    : dateGroup.dateKey}
                                </span>
                                <Badge variant="outline" className="font-normal tabular-nums">
                                  {dateGroup.items.length}
                                </Badge>
                              </span>
                            </AccordionTrigger>
                            <AccordionContent className="pb-2">
                              <div className="overflow-x-auto rounded-md border">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="pl-4">Mã đơn</TableHead>
                                      <TableHead>Chi nhánh</TableHead>
                                      <TableHead>Ngày gửi</TableHead>
                                      <TableHead>Trạng thái</TableHead>
                                      <TableHead>Dòng hàng</TableHead>
                                      <TableHead className="pr-4 text-right">Thao tác</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {dateGroup.items.map((dispatch) => {
                                      const isSyncing = syncingDispatchId === dispatch.id;
                                      const showDecide =
                                        canManage &&
                                        dispatch.status === "pending_manager" &&
                                        !isSyncing;
                                      return (
                                        <TableRow key={dispatch.id}>
                                          <TableCell className="pl-4 font-mono text-xs">
                                            {dispatch.dispatch_code}
                                          </TableCell>
                                          <TableCell>
                                            {warehouseShortLabel(dispatch.warehouses)}
                                          </TableCell>
                                          <TableCell>
                                            {new Date(dispatch.requested_at).toLocaleDateString(
                                              "vi-VN",
                                            )}
                                          </TableCell>
                                          <TableCell>{statusBadge(dispatch)}</TableCell>
                                          <TableCell>
                                            {dispatch.internal_dispatch_items.length}
                                          </TableCell>
                                          <TableCell className="pr-4 text-right">
                                            <div className="inline-flex items-center gap-2">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                aria-label={`Xem phiếu ${dispatch.dispatch_code}`}
                                                title="Xem đơn và duyệt ngay trên phiếu"
                                                onClick={() => setViewDispatchId(dispatch.id)}
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                              {showDecide && (
                                                <>
                                                  <Button
                                                    size="sm"
                                                    onClick={() =>
                                                      approveMutation.mutate(dispatch)
                                                    }
                                                    disabled={decisionPending}
                                                  >
                                                    <Check className="mr-1 h-4 w-4" />
                                                    Duyệt
                                                  </Button>
                                                  <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => {
                                                      if (
                                                        confirm(
                                                          `Không duyệt đơn ${dispatch.dispatch_code}?`,
                                                        )
                                                      ) {
                                                        rejectMutation.mutate(dispatch);
                                                      }
                                                    }}
                                                    disabled={decisionPending}
                                                  >
                                                    <X className="mr-1 h-4 w-4" />
                                                    Không duyệt
                                                  </Button>
                                                </>
                                              )}
                                            </div>
                                          </TableCell>
                                        </TableRow>
                                      );
                                    })}
                                  </TableBody>
                                </Table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Đơn tuần — cuộn độc lập, không kéo dài toàn trang */}
      {canManage && (
        <Card className="print:hidden shadow-sm">
          <CardHeader className="flex flex-col gap-3 space-y-0 py-3 px-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">
                Đơn tuần {currentWeekly ? `từ ${currentWeekly.week_start}` : ""} —{" "}
                {branchScopeLabel}
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {activeBranch
                  ? `Chỉ hiển thị phần hàng phân bổ cho ${activeBranch.label} (${visibleWeeklyItems.length} mã · tổng ${weeklyTotalQty}).`
                  : "Danh sách hàng đã cộng dồn theo mã hàng của tất cả chi nhánh."}
              </p>
            </div>
            {currentWeekly && (
              <div className="flex flex-wrap gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => printMutation.mutate(currentWeekly)}
                  disabled={printMutation.isPending || !visibleWeeklyItems.length}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {activeBranch ? `In phiếu ${activeBranch.label}` : "In phiếu tổng hợp"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={printByBranch}
                  disabled={markPrintedMutation.isPending || !branchSheets.length}
                >
                  <Printer className="mr-2 h-4 w-4" />
                  {activeBranch
                    ? "In phiếu riêng (tab mới)"
                    : `In riêng từng CN (${branchSheets.length})`}
                </Button>
                {canComplete && currentWeekly.status !== "processed" && (
                  <Button
                    size="sm"
                    onClick={() => completeMutation.mutate(currentWeekly)}
                    disabled={completeMutation.isPending}
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Xác nhận đã xử lý
                  </Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardContent className="p-0">
            {currentWeekly ? (
              <div className="max-h-[40vh] overflow-y-auto overflow-x-auto border-t">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="pl-4">STT</TableHead>
                      <TableHead>Mã hàng</TableHead>
                      <TableHead>Tên hàng</TableHead>
                      <TableHead>ĐVT</TableHead>
                      <TableHead className="text-right">
                        {activeBranch ? `SL ${activeBranch.label}` : "Tổng SL"}
                      </TableHead>
                      <TableHead className="pr-4">Chi nhánh xuất (SL)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!visibleWeeklyItems.length ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          {activeBranch
                            ? `Chi nhánh ${activeBranch.label} không có hàng trong đơn tuần này.`
                            : "Đơn tuần chưa có dòng hàng."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      (() => {
                        let stt = 0;
                        return visibleWeeklyItems.map((item) => {
                          stt += 1;
                          return (
                            <TableRow key={item.id || item.line_no}>
                              <TableCell className="pl-4">{stt}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {item.product_code}
                              </TableCell>
                              <TableCell>{item.product_name}</TableCell>
                              <TableCell>{item.unit || "—"}</TableCell>
                              <TableCell className="text-right tabular-nums">
                                {item.quantity}
                              </TableCell>
                              <TableCell className="pr-4 text-xs text-muted-foreground">
                                {branchCellText(item)}
                              </TableCell>
                            </TableRow>
                          );
                        });
                      })()
                    )}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">
                Chưa có đơn tuần được tạo.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {canManage && currentWeekly ? (
        <section className="internal-weekly-print hidden print:block">
          <header className="internal-weekly-print__header">
            <div>
              <p className="internal-weekly-print__eyebrow">K9 · QUẢN LÝ KHO & ĐƠN HÀNG</p>
              <h1>
                {activeBranch
                  ? "PHIẾU XUẤT NỘI BỘ THEO CHI NHÁNH"
                  : "PHIẾU TỔNG HỢP ĐƠN TUẦN"}
              </h1>
              <p className="internal-weekly-print__subtitle">
                Hàng hóa đã được quản lý chi nhánh phê duyệt
              </p>
            </div>
            <div className="internal-weekly-print__meta">
              <p>
                <strong>Chi nhánh nhận:</strong>{" "}
                {activeBranch ? activeBranch.label : "Tổng hợp toàn hệ thống"}
              </p>
              <p>
                <strong>Tuần từ:</strong>{" "}
                {new Date(`${currentWeekly.week_start}T00:00:00`).toLocaleDateString("vi-VN")}
              </p>
              <p>
                <strong>Ngày in:</strong> {new Date().toLocaleDateString("vi-VN")}
              </p>
              <p>
                <strong>Trạng thái:</strong>{" "}
                {statusLabel[currentWeekly.status] || currentWeekly.status}
              </p>
            </div>
          </header>

          <table className="internal-weekly-print__table">
            <thead>
              <tr>
                <th>STT</th>
                <th>Mã hàng</th>
                <th>Tên hàng</th>
                <th>ĐVT</th>
                <th>{activeBranch ? `SL ${activeBranch.label}` : "Tổng SL"}</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                let stt = 0;
                return visibleWeeklyItems.map((item) => {
                  stt += 1;
                  return (
                    <tr key={item.id || item.line_no}>
                      <td>{stt}</td>
                      <td className="internal-weekly-print__code">{item.product_code}</td>
                      <td>{item.product_name}</td>
                      <td>{item.unit || "—"}</td>
                      <td className="internal-weekly-print__quantity">{item.quantity}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4}>TỔNG CỘNG</td>
                <td className="internal-weekly-print__quantity">{weeklyTotalQty}</td>
              </tr>
            </tfoot>
          </table>

          <footer className="internal-weekly-print__signatures">
            <div>
              <strong>NGƯỜI LẬP</strong>
              <span>(Ký, ghi rõ họ tên)</span>
            </div>
            <div>
              <strong>QUẢN LÝ DUYỆT</strong>
              <span>(Ký, ghi rõ họ tên)</span>
            </div>
            <div>
              <strong>THỦ KHO / TỔNG CÔNG TY</strong>
              <span>(Ký, ghi rõ họ tên)</span>
            </div>
          </footer>
        </section>
      ) : null}

      {/* FAB — tạo đơn mới */}
      {warehouseId && (
        <Button
          type="button"
          aria-label="Tạo đơn xuất nội bộ"
          title="Tạo đơn xuất nội bộ"
          className="fixed bottom-8 right-8 z-50 h-14 w-14 rounded-full p-0 shadow-xl hover:shadow-2xl print:hidden"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {/* Sheet tạo đơn — Form Sections bằng Card */}
      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl print:hidden"
        >
          <SheetHeader className="shrink-0 space-y-1 border-b px-5 py-4 text-left">
            <SheetTitle>Tạo đơn xuất nội bộ</SheetTitle>
            <SheetDescription>
              {warehouseLabel
                ? `Chi nhánh: ${warehouseLabel}`
                : "Thêm mặt hàng và gửi quản lý duyệt."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Thông tin chung
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 px-4 pb-4 sm:grid-cols-2">
                <div>
                  <div className="text-xs text-muted-foreground">Chi nhánh gửi</div>
                  <div className="mt-0.5 text-sm font-medium">{warehouseLabel || "—"}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Trạng thái sau gửi</div>
                  <div className="mt-0.5 text-sm font-medium">Chờ quản lý duyệt</div>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Bảng mặt hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <ProductSearchInput
                    className="relative flex-1"
                    label="Tìm sản phẩm"
                    value={productSearch}
                    onChange={(value) => {
                      setProductSearch(value);
                      setSelectedProduct("");
                    }}
                    suggestions={productSuggestions}
                    open={!!productSearch.trim()}
                    onOpenChange={() => {}}
                    showWhenTyping
                    onPick={(product) => pickProduct(product.id)}
                    placeholder="Gõ mã hàng, mã vạch hoặc tên sản phẩm..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addProduct}
                    disabled={!selectedProduct}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    Thêm hàng
                  </Button>
                </div>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>STT</TableHead>
                        <TableHead>Mã hàng</TableHead>
                        <TableHead>Tên hàng</TableHead>
                        <TableHead>SL</TableHead>
                        <TableHead>ĐVT</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.length ? (
                        lines.map((line, index) => (
                          <TableRow key={`${line.product_id}-${index}`}>
                            <TableCell>{index + 1}</TableCell>
                            <TableCell className="font-mono text-xs">
                              {line.product_code}
                            </TableCell>
                            <TableCell>{line.product_name}</TableCell>
                            <TableCell>
                              <Input
                                className="w-24"
                                type="number"
                                min="0.001"
                                step="0.001"
                                value={line.quantity}
                                onChange={(event) =>
                                  setLines((current) =>
                                    current.map((item, itemIndex) =>
                                      itemIndex === index
                                        ? { ...item, quantity: Number(event.target.value) }
                                        : item,
                                    ),
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>{line.unit || "—"}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Xóa dòng"
                                onClick={() =>
                                  setLines((current) =>
                                    current.filter((_, itemIndex) => itemIndex !== index),
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="py-8 text-center text-muted-foreground"
                          >
                            Chưa có mặt hàng.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm sticky bottom-0 mt-auto border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-muted-foreground">
                  Hành động
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4">
                <div>
                  <Label htmlFor="dispatch-notes">Ghi chú</Label>
                  <Textarea
                    id="dispatch-notes"
                    className="mt-1.5"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Hủy
                  </Button>
                  <Button
                    onClick={() => createMutation.mutate()}
                    disabled={!lines.length || createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="mr-2 h-4 w-4" />
                    )}
                    Gửi quản lý
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </SheetContent>
      </Sheet>

      <InternalDispatchDetailDialog
        open={!!viewDispatch}
        onOpenChange={(next) => {
          if (!next) setViewDispatchId(null);
        }}
        dispatch={viewDispatch}
        branchLabel={warehouseShortLabel(viewDispatch?.warehouses || null)}
        statusText={
          viewDispatch ? statusLabel[viewDispatch.status] || viewDispatch.status : ""
        }
        canDecide={
          canManage &&
          (viewDispatch?.status === "pending_manager" ||
            syncingDispatchId === viewDispatch?.id)
        }
        isBusy={decisionPending}
        isSyncing={syncingDispatchId === viewDispatch?.id}
        onApprove={() => {
          if (viewDispatch) approveMutation.mutate(viewDispatch);
        }}
        onReject={() => {
          if (!viewDispatch) return;
          if (!confirm(`Không duyệt đơn ${viewDispatch.dispatch_code}?`)) return;
          rejectMutation.mutate(viewDispatch);
        }}
      />
    </div>
  );
}