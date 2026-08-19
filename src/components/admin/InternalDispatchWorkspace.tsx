import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Bell, Check, FileDown, Loader2, Plus, Printer, Send, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useProducts } from "@/hooks/useProducts";
import { notifyInternalDispatchTelegram } from "@/lib/telegramNotify";
import { filterCatalogSuggestions } from "@/lib/catalogSearch";
import { ProductSearchInput } from "@/components/admin/ProductSearchInput";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

type DispatchItem = { id?: string; line_no: number; product_id: string | null; product_code: string; product_name: string; unit: string | null; quantity: number; notes: string | null };
type Dispatch = { id: string; dispatch_code: string; status: string; requested_at: string; requested_by: string; notes: string | null; warehouses: { code: string; name: string } | null; internal_dispatch_items: DispatchItem[] };
type WeeklyOrder = { id: string; week_start: string; status: string; internal_weekly_items: DispatchItem[] };
type DraftLine = Omit<DispatchItem, "id" | "line_no">;

const statusLabel: Record<string, string> = {
  pending_manager: "Chờ quản lý duyệt", manager_approved: "Đã duyệt", manager_rejected: "Từ chối", processed: "Đã xử lý",
  open: "Đang gom", printed: "Đã in",
};

function exportHistory(dispatches: Dispatch[], weeklyOrders: WeeklyOrder[]) {
  const dispatchRows = dispatches.flatMap((dispatch) => dispatch.internal_dispatch_items.map((item) => ({
    "Mã đơn": dispatch.dispatch_code, "Chi nhánh": dispatch.warehouses?.code || "", "Trạng thái": statusLabel[dispatch.status] || dispatch.status,
    "Ngày gửi": new Date(dispatch.requested_at).toLocaleString("vi-VN"), "STT": item.line_no, "Mã hàng": item.product_code,
    "Tên hàng": item.product_name, "ĐVT": item.unit || "", "Số lượng": item.quantity, "Ghi chú đơn": dispatch.notes || "", "Ghi chú dòng": item.notes || "",
  })));
  const weeklyRows = weeklyOrders.flatMap((weekly) => weekly.internal_weekly_items.map((item) => ({
    "Tuần từ ngày": weekly.week_start, "Trạng thái": statusLabel[weekly.status] || weekly.status, "STT": item.line_no,
    "Mã hàng": item.product_code, "Tên hàng": item.product_name, "ĐVT": item.unit || "", "Tổng số lượng": item.quantity,
  })));
  const workbook = XLSX.utils.book_new();
  const dispatchSheet = XLSX.utils.json_to_sheet(dispatchRows);
  const weeklySheet = XLSX.utils.json_to_sheet(weeklyRows);
  dispatchSheet["!cols"] = [{ wch: 20 }, { wch: 14 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 26 }, { wch: 26 }];
  weeklySheet["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 8 }, { wch: 18 }, { wch: 36 }, { wch: 10 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, dispatchSheet, "Lịch sử xuất nội bộ");
  XLSX.utils.book_append_sheet(workbook, weeklySheet, "Đơn tuần");
  XLSX.writeFile(workbook, `lich-su-xuat-noi-bo-${new Date().toISOString().slice(0, 10)}.xlsx`);
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
  const [isLinkingTelegram, setIsLinkingTelegram] = useState(false);
  const canManage = role === "manager" || role === "super_admin";
  const canComplete = role === "super_admin";

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ["internal-dispatches"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("internal_dispatches" as never) as any)
        .select("id, dispatch_code, status, requested_at, requested_by, notes, warehouses:warehouse_id(code,name), internal_dispatch_items(id,line_no,product_id,product_code,product_name,unit,quantity,notes)")
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
        .select("id,week_start,status,weekly_order_items(id,line_no,product_id,product_code,product_name,unit,quantity)")
        .order("week_start", { ascending: false }).limit(30);
      if (error) throw error;
      return (data || []).map((row: any) => ({ ...row, internal_weekly_items: row.weekly_order_items || [] })) as WeeklyOrder[];
    },
  });

  const refresh = () => Promise.all([queryClient.invalidateQueries({ queryKey: ["internal-dispatches"] }), queryClient.invalidateQueries({ queryKey: ["weekly-orders"] })]);
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!warehouseId) throw new Error("Tài khoản chưa được gán chi nhánh.");
      const { data, error } = await supabase.rpc("create_internal_dispatch" as never, { _warehouse_id: warehouseId, _notes: notes || null, _items: lines } as never);
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (dispatchId) => {
      await notifyInternalDispatchTelegram(`📦 <b>Đơn xuất nội bộ mới</b>\nChi nhánh: ${warehouseLabel || "—"}\nSố dòng: ${lines.length}\nTrạng thái: chờ quản lý duyệt`, { warehouseId: warehouseId || undefined, internalDispatchId: dispatchId });
      setLines([]); setNotes(""); await refresh();
      toast({ title: "Đã gửi đơn xuất nội bộ" });
    }, onError: (error: Error) => toast({ title: "Không gửi được đơn", description: error.message, variant: "destructive" }),
  });
  const approveMutation = useMutation({
    mutationFn: async (dispatch: Dispatch) => {
      const { error } = await supabase.rpc("approve_internal_dispatch" as never, { _dispatch_id: dispatch.id } as never);
      if (error) throw error;
      await notifyInternalDispatchTelegram(`✅ <b>Quản lý đã duyệt ${dispatch.dispatch_code}</b>\nChi nhánh: ${dispatch.warehouses?.code || "—"}\nHàng đã được cộng vào đơn tuần.`, { recipientUserIds: [dispatch.requested_by] });
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể duyệt", description: error.message, variant: "destructive" }),
  });
  const rejectMutation = useMutation({
    mutationFn: async (dispatch: Dispatch) => {
      const { error } = await supabase.rpc("reject_internal_dispatch" as never, { _dispatch_id: dispatch.id } as never);
      if (error) throw error;
      await notifyInternalDispatchTelegram(`❌ <b>Quản lý không duyệt ${dispatch.dispatch_code}</b>\nChi nhánh: ${dispatch.warehouses?.code || "—"}\nVui lòng kiểm tra và tạo lại yêu cầu khi cần.`, { recipientUserIds: [dispatch.requested_by] });
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể từ chối", description: error.message, variant: "destructive" }),
  });
  const completeMutation = useMutation({
    mutationFn: async (weekly: WeeklyOrder) => {
      const { error } = await supabase.rpc("complete_weekly_order" as never, { _weekly_order_id: weekly.id } as never);
      if (error) throw error;
      await notifyInternalDispatchTelegram(`🏢 <b>Tổng công ty đã xử lý đơn tuần</b>\nTuần từ ${weekly.week_start}\nQuản lý có thể đối chiếu và lưu hồ sơ.`);
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể hoàn tất", description: error.message, variant: "destructive" }),
  });
  const printMutation = useMutation({
    mutationFn: async (weekly: WeeklyOrder) => {
      const { error } = await supabase.rpc("mark_weekly_order_printed" as never, { _weekly_order_id: weekly.id } as never);
      if (error) throw error;
      window.print();
    }, onSuccess: refresh, onError: (error: Error) => toast({ title: "Không thể cập nhật trạng thái in", description: error.message, variant: "destructive" }),
  });

  const availableProducts = useMemo(() => products.filter((product) => product.is_active !== false && product.slug), [products]);
  const productSuggestions = useMemo(
    () => filterCatalogSuggestions(availableProducts, productSearch, 12),
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
  const weeklyTotalQty = currentWeekly?.internal_weekly_items.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  ) || 0;
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

  return <div className="space-y-6 print:space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
      <div><h1 className="text-2xl font-bold">Xuất nội bộ và Đơn tuần</h1><p className="mt-1 text-sm text-muted-foreground">Đơn chi nhánh được duyệt tự động gom vào đơn tuần của Tổng công ty.</p></div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={linkTelegram} disabled={!user || isLinkingTelegram}>{isLinkingTelegram ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bell className="mr-2 h-4 w-4" />}Kết nối Telegram</Button>{canManage && <Button variant="outline" onClick={() => exportHistory(dispatches, weeklyOrders)}><FileDown className="mr-2 h-4 w-4" />Xuất Excel lịch sử</Button>}</div>
    </div>

    {warehouseId && <Card className="print:hidden"><CardHeader><CardTitle className="text-lg">Tạo đơn xuất nội bộ {warehouseLabel ? `- ${warehouseLabel}` : ""}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end"><ProductSearchInput className="relative flex-1" label="Tìm sản phẩm" value={productSearch} onChange={(value) => { setProductSearch(value); setSelectedProduct(""); }} suggestions={productSuggestions} open={!!productSearch.trim()} onOpenChange={() => {}} showWhenTyping onPick={(product) => pickProduct(product.id)} placeholder="Gõ mã hàng, mã vạch hoặc tên sản phẩm..." /><Button type="button" variant="outline" onClick={addProduct} disabled={!selectedProduct}><Plus className="mr-1 h-4 w-4" />Thêm hàng</Button></div>
      <div className="overflow-x-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>STT</TableHead><TableHead>Mã hàng</TableHead><TableHead>Tên hàng</TableHead><TableHead>SL</TableHead><TableHead>ĐVT</TableHead><TableHead /></TableRow></TableHeader><TableBody>{lines.length ? lines.map((line, index) => <TableRow key={`${line.product_id}-${index}`}><TableCell>{index + 1}</TableCell><TableCell className="font-mono text-xs">{line.product_code}</TableCell><TableCell>{line.product_name}</TableCell><TableCell><Input className="w-24" type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, quantity: Number(event.target.value) } : item))} /></TableCell><TableCell>{line.unit || "—"}</TableCell><TableCell><Button variant="ghost" size="icon" aria-label="Xóa dòng" onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 className="h-4 w-4" /></Button></TableCell></TableRow>) : <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Chưa có mặt hàng.</TableCell></TableRow>}</TableBody></Table></div>
      <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end"><div><Label htmlFor="dispatch-notes">Ghi chú</Label><Textarea id="dispatch-notes" value={notes} onChange={(event) => setNotes(event.target.value)} /></div><Button onClick={() => createMutation.mutate()} disabled={!lines.length || createMutation.isPending}>{createMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Gửi quản lý</Button></div>
    </CardContent></Card>}

    <Card className="print:hidden"><CardHeader><CardTitle className="text-lg">Đơn xuất nội bộ</CardTitle></CardHeader><CardContent><div className="overflow-x-auto border rounded-md"><Table><TableHeader><TableRow><TableHead>Mã đơn</TableHead><TableHead>Chi nhánh</TableHead><TableHead>Ngày gửi</TableHead><TableHead>Trạng thái</TableHead><TableHead>Dòng hàng</TableHead>{canManage && <TableHead className="text-right">Thao tác</TableHead>}</TableRow></TableHeader><TableBody>{isLoading ? <TableRow><TableCell colSpan={6} className="py-8 text-center"><Loader2 className="inline h-4 w-4 animate-spin" /></TableCell></TableRow> : dispatches.map((dispatch) => <TableRow key={dispatch.id}><TableCell className="font-mono text-xs">{dispatch.dispatch_code}</TableCell><TableCell>{dispatch.warehouses?.code || "—"}</TableCell><TableCell>{new Date(dispatch.requested_at).toLocaleDateString("vi-VN")}</TableCell><TableCell><Badge variant="secondary">{statusLabel[dispatch.status] || dispatch.status}</Badge></TableCell><TableCell>{dispatch.internal_dispatch_items.length}</TableCell>{canManage && <TableCell className="text-right">{dispatch.status === "pending_manager" && <div className="inline-flex gap-2"><Button size="sm" onClick={() => approveMutation.mutate(dispatch)} disabled={approveMutation.isPending || rejectMutation.isPending}><Check className="mr-1 h-4 w-4" />Duyệt</Button><Button size="sm" variant="destructive" onClick={() => { if (confirm(`Không duyệt đơn ${dispatch.dispatch_code}?`)) rejectMutation.mutate(dispatch); }} disabled={approveMutation.isPending || rejectMutation.isPending}><X className="mr-1 h-4 w-4" />Không duyệt</Button></div>}</TableCell>}</TableRow>)}</TableBody></Table></div></CardContent></Card>

    {canManage && <Card className="print:hidden"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-lg">Đơn tuần {currentWeekly ? `từ ${currentWeekly.week_start}` : ""}</CardTitle><p className="mt-1 text-sm text-muted-foreground">Danh sách hàng đã cộng dồn theo mã hàng.</p></div>{currentWeekly && <div className="flex gap-2"><Button variant="outline" onClick={() => printMutation.mutate(currentWeekly)} disabled={printMutation.isPending}><Printer className="mr-2 h-4 w-4" />In phiếu</Button>{canComplete && currentWeekly.status !== "processed" && <Button onClick={() => completeMutation.mutate(currentWeekly)} disabled={completeMutation.isPending}><Check className="mr-2 h-4 w-4" />Xác nhận đã xử lý</Button>}</div>}</CardHeader><CardContent>{currentWeekly ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>STT</TableHead><TableHead>Mã hàng</TableHead><TableHead>Tên hàng</TableHead><TableHead>ĐVT</TableHead><TableHead className="text-right">Tổng SL</TableHead></TableRow></TableHeader><TableBody>{currentWeekly.internal_weekly_items.map((item) => <TableRow key={item.id || item.line_no}><TableCell>{item.line_no}</TableCell><TableCell className="font-mono text-xs">{item.product_code}</TableCell><TableCell>{item.product_name}</TableCell><TableCell>{item.unit || "—"}</TableCell><TableCell className="text-right tabular-nums">{item.quantity}</TableCell></TableRow>)}</TableBody></Table></div> : <p className="py-6 text-sm text-muted-foreground">Chưa có đơn tuần được tạo.</p>}</CardContent></Card>}

    {canManage && currentWeekly ? <section className="internal-weekly-print hidden print:block">
      <header className="internal-weekly-print__header">
        <div>
          <p className="internal-weekly-print__eyebrow">K9 · QUẢN LÝ KHO & ĐƠN HÀNG</p>
          <h1>PHIẾU TỔNG HỢP ĐƠN TUẦN</h1>
          <p className="internal-weekly-print__subtitle">Hàng hóa đã được quản lý chi nhánh phê duyệt</p>
        </div>
        <div className="internal-weekly-print__meta">
          <p><strong>Tuần từ:</strong> {new Date(`${currentWeekly.week_start}T00:00:00`).toLocaleDateString("vi-VN")}</p>
          <p><strong>Ngày in:</strong> {new Date().toLocaleDateString("vi-VN")}</p>
          <p><strong>Trạng thái:</strong> {statusLabel[currentWeekly.status] || currentWeekly.status}</p>
        </div>
      </header>

      <table className="internal-weekly-print__table">
        <thead><tr><th>STT</th><th>Mã hàng</th><th>Tên hàng</th><th>ĐVT</th><th>Tổng SL</th></tr></thead>
        <tbody>{currentWeekly.internal_weekly_items.map((item, index) => <tr key={item.id || item.line_no}><td>{index + 1}</td><td className="internal-weekly-print__code">{item.product_code}</td><td>{item.product_name}</td><td>{item.unit || "—"}</td><td className="internal-weekly-print__quantity">{item.quantity}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={4}>TỔNG CỘNG</td><td className="internal-weekly-print__quantity">{weeklyTotalQty}</td></tr></tfoot>
      </table>

      <footer className="internal-weekly-print__signatures">
        <div><strong>NGƯỜI LẬP</strong><span>(Ký, ghi rõ họ tên)</span></div>
        <div><strong>QUẢN LÝ DUYỆT</strong><span>(Ký, ghi rõ họ tên)</span></div>
        <div><strong>THỦ KHO / TỔNG CÔNG TY</strong><span>(Ký, ghi rõ họ tên)</span></div>
      </footer>
    </section> : null}
  </div>;
}