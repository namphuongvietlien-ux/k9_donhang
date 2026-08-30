import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, Link, useSearchParams } from "react-router-dom";
import {
  ClipboardList,
  FileSpreadsheet,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  ArrowRightLeft,
  PenLine,
  Settings,
  Users,
} from "lucide-react";
import { warehouseShortLabel } from "@/lib/warehouseMeta";
import { useAuth } from "@/contexts/AuthContext";
import { useStoreScope } from "@/hooks/useStoreScope";
import CreateWarehouseOrderForm, {
  type CreateWarehouseOrderFormHandle,
} from "@/components/admin/CreateWarehouseOrderForm";
import NewProductsStrip from "@/components/admin/NewProductsStrip";
import CatalogAdminHub from "@/components/admin/CatalogAdminHub";
import ReceiveOrdersPanel from "@/components/admin/ReceiveOrdersPanel";
import PackingWeekCalendar from "@/components/admin/PackingWeekCalendar";
import PackingSummaryBoard from "@/components/admin/PackingSummaryBoard";
import BanKemDvPanel from "@/components/admin/BanKemDvPanel";
import DuplicateAlertBanner from "@/components/admin/DuplicateAlertBanner";
import TransferExcelImport from "@/components/admin/TransferExcelImport";
import InternalTransferBoard from "@/components/admin/InternalTransferBoard";
import InternalDispatchWorkspace from "@/components/admin/InternalDispatchWorkspace";
import WarehouseOrderDetail from "@/components/admin/WarehouseOrderDetail";
import DataImport from "@/components/admin/DataImport";
import {
  useWarehouseOrders,
} from "@/hooks/useWarehouseOrders";
import {
  WAREHOUSE_STATUS_BADGE,
  WAREHOUSE_STATUS_LABELS,
} from "@/lib/warehouseOrders";
import SEO from "@/components/SEO";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

type AppTab =
  | "create"
  | "dashboard"
  | "manage"
  | "receive"
  | "packing"
  | "internal-dispatch"
  | "xb"
  | "admin";

const NAV: { id: AppTab; label: string; icon: typeof PenLine }[] = [
  { id: "create", label: "Tạo Đơn", icon: PenLine },
  { id: "xb", label: "Hóa Đơn Dịch Vụ", icon: FileSpreadsheet },
  { id: "dashboard", label: "Tổng Quan", icon: LayoutDashboard },
  { id: "manage", label: "Quản Lý", icon: ClipboardList },
  { id: "receive", label: "Xác Nhận", icon: Package },
  { id: "packing", label: "Soạn Hàng", icon: Package },
  { id: "internal-dispatch", label: "Xuất Nội Bộ", icon: ArrowRightLeft },
  { id: "admin", label: "Quản trị", icon: Settings },
];

function WarehouseLoginGate() {
  const { user, isAdmin, signIn, signOut, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const raw = email.trim();
    const { error } = await signIn(raw, password);
    setBusy(false);
    if (error) {
      const hint =
        !raw.includes("@")
          ? ` (thử lại: ${raw.toLowerCase()} hoặc ${raw.toLowerCase()}@k9.local)`
          : "";
      toast({
        title: "Đăng nhập thất bại",
        description: `${error.message || "Sai tài khoản hoặc mật khẩu"}${hint}`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 flex flex-col items-center justify-center p-6">
      <SEO
        title="Hệ Thống Quản Lý Kho"
        image="/1564804129_k9-logo-ps.png"
      />
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white shadow-xl border border-slate-100 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-sky-500 to-emerald-400" />
          <div className="p-8 space-y-6">
            <div className="text-center space-y-3">
              <div className="inline-flex items-center justify-center">
                <img
                  src="/1564804129_k9-logo-ps.png"
                  alt="K9 Logo"
                  className="h-16 w-16 rounded-full object-cover shadow-md ring-2 ring-sky-100"
                />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-800">
                HỆ THỐNG VẬN HÀNH KHO
              </h1>
              <p className="text-sm text-slate-500 leading-relaxed">
                Đăng nhập bằng tài khoản chi nhánh để tạo đơn, theo dõi và xác
                nhận nhận hàng.
              </p>
            </div>

            {user && !isAdmin ? (
              <Alert variant="destructive">
                <AlertTitle>Không có quyền kho</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>
                    Tài khoản hiện tại chưa được cấp quyền vận hành kho. Liên hệ
                    quản trị hoặc đăng xuất để thử tài khoản khác.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void signOut()}
                  >
                    Đăng xuất
                  </Button>
                </AlertDescription>
              </Alert>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="font-semibold text-slate-700">
                    Tài khoản
                  </Label>
                  <Input
                    type="text"
                    autoComplete="username"
                    placeholder="admin / Q7 / 275hd…"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <p className="text-[11px] text-slate-400">
                    Tài khoản GAS (không cần @) hoặc email đầy đủ.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label className="font-semibold text-slate-700">
                    Mật khẩu
                  </Label>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-sky-600 hover:bg-sky-700 text-white font-bold h-11"
                  disabled={busy || authLoading}
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : null}
                  VÀO HỆ THỐNG
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ManageOrdersPanel() {
  const [searchParams] = useSearchParams();
  const soPhieu = searchParams.get("soPhieu");
  const { warehouseId: scopedWhId, isStoreScoped, warehouseLabel } =
    useStoreScope();
  const { data: orders, isLoading, refetch, isFetching } = useWarehouseOrders({
    kind: "ALL",
    limit: 100,
    warehouseId: isStoreScoped ? scopedWhId : null,
  });
  const [detailId, setDetailId] = useState<string | null>(null);

  useEffect(() => {
    if (!soPhieu || !orders?.length) return;
    const hit = orders.find(
      (o) =>
        String(o.order_code || "").toUpperCase() ===
        String(soPhieu).toUpperCase(),
    );
    if (hit) setDetailId(hit.id);
  }, [soPhieu, orders]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Tra cứu phiếu DH/DC — bấm mã để xem / sửa / soạn.
          {isStoreScoped ? (
            <>
              {" "}
              · Chỉ kho <strong>{warehouseLabel}</strong>
            </>
          ) : null}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "Làm mới"
          )}
        </Button>
      </div>
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">STT</TableHead>
                <TableHead>Mã đơn</TableHead>
                <TableHead>Loại</TableHead>
                <TableHead>Xuất → Nhận</TableHead>
                <TableHead>TT</TableHead>
                <TableHead>Ngày</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(orders || []).map((o, idx) => (
                <TableRow
                  key={o.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setDetailId(o.id)}
                >
                  <TableCell className="text-center text-muted-foreground tabular-nums">
                    {idx + 1}
                  </TableCell>
                  <TableCell className="font-mono font-medium">
                    {o.order_code}
                  </TableCell>
                  <TableCell>{o.order_kind}</TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {warehouseShortLabel(o.source_warehouse)} →{" "}
                    {warehouseShortLabel(o.warehouse)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={cn(
                        "font-normal",
                        WAREHOUSE_STATUS_BADGE[o.status],
                      )}
                    >
                      {WAREHOUSE_STATUS_LABELS[o.status] || o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {format(new Date(o.created_at), "dd/MM HH:mm", {
                      locale: vi,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[1600px] max-h-[calc(100vh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Chi tiết phiếu</DialogTitle>
          </DialogHeader>
          {detailId && (
            <WarehouseOrderDetail
              orderId={detailId}
              onClose={() => setDetailId(null)}
              variant="manage"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DashboardLite() {
  const { data: orders, isLoading } = useWarehouseOrders({ limit: 50 });
  const stats = useMemo(() => {
    const list = orders || [];
    return {
      total: list.length,
      pending: list.filter((o) => o.status === "pending").length,
      processing: list.filter((o) => o.status === "processing").length,
      completed: list.filter((o) => o.status === "completed").length,
    };
  }, [orders]);

  if (isLoading) {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: "Phiếu gần đây", value: stats.total },
          { label: "Mới", value: stats.pending },
          { label: "Đã soạn", value: stats.processing },
          { label: "Đã nhận", value: stats.completed },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">
                {s.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Alert>
        <AlertTitle>Chọn tab phù hợp công việc</AlertTitle>
        <AlertDescription className="text-sm space-y-1">
          <div>
            <b>Tạo Đơn</b> — đặt hàng / điều chuyển nội bộ (theo đợt chính / bổ sung).
          </div>
          <div>
            <b>Quản Lý</b> — tra cứu, sửa, soạn.
          </div>
          <div>
            <b>Hóa Đơn Dịch Vụ</b> — hóa đơn XB / bán kèm DV.
          </div>
          <div>
            <b>Xác Nhận / Soạn Hàng</b> — nhận hàng chi nhánh / lịch gom đơn.
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

/**
 * Trang chủ vận hành kho — UI kiểu donhang-dieuchuyen.vercel.app
 * Storefront ecommerce bị khóa; chỉ hiện hệ thống phiếu kho.
 */
export default function WarehousePortal() {
  const { user, loading, isAdmin, role, signOut } = useAuth();
  const { warehouseLabel, isStoreScoped, username } = useStoreScope();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const [tab, setTab] = useState<AppTab>(() => {
    if (tabFromUrl === "xb" || tabFromUrl === "bankem") return "xb";
    if (
      tabFromUrl === "create" ||
      tabFromUrl === "dashboard" ||
      tabFromUrl === "manage" ||
      tabFromUrl === "receive" ||
      tabFromUrl === "packing" ||
      tabFromUrl === "internal-dispatch" ||
      tabFromUrl === "admin"
    ) {
      return tabFromUrl;
    }
    return "create";
  });
  const [packDetailId, setPackDetailId] = useState<string | null>(null);
  const createFormRef = useRef<CreateWarehouseOrderFormHandle>(null);

  useEffect(() => {
    if (!tabFromUrl) return;
    if (tabFromUrl === "xb" || tabFromUrl === "bankem") setTab("xb");
    else if (
      tabFromUrl === "create" ||
      tabFromUrl === "dashboard" ||
      tabFromUrl === "manage" ||
      tabFromUrl === "receive" ||
      tabFromUrl === "packing" ||
      tabFromUrl === "internal-dispatch" ||
      tabFromUrl === "admin"
    ) {
      setTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const selectTab = (id: AppTab) => {
    setTab(id);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", id);
        if (id !== "xb") n.delete("xb");
        return n;
      },
      { replace: true },
    );
  };

  const visibleNav = useMemo(
    () =>
      // Tab Quản trị (danh mục) chỉ cho quản lý / quản trị viên — chi nhánh không thấy
      NAV.filter(
        (item) =>
          item.id !== "admin" ||
          role === "super_admin" ||
          role === "manager",
      ),
    [role],
  );

  useEffect(() => {
    if (tab === "admin" && role === "staff") {
      selectTab("create");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi role/tab admin lệch quyền
  }, [role, tab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 text-slate-600 gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
        Đang kết nối…
      </div>
    );
  }

  if (!user || !isAdmin) {
    return <WarehouseLoginGate />;
  }

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Quản Lý Kho & Đơn Hàng | K9"
        image="/1564804129_k9-logo-ps.png"
      />

      <header className="border-b bg-slate-900 text-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-bold text-lg flex items-center gap-2">
              <img
                src="/1564804129_k9-logo-ps.png"
                alt="K9"
                className="h-8 w-8 rounded-full object-cover ring-1 ring-white/30"
              />
              Quản Lý Kho &amp; Đơn Hàng
            </div>
            <p className="text-xs text-slate-300">
              Điều chuyển · Soạn &amp; xác nhận · Chi nhánh K9
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Badge variant="secondary" className="bg-slate-700 text-slate-100">
              {role === "super_admin"
                ? "Quản trị viên"
                : role === "manager"
                  ? "Quản lý"
                  : role === "staff"
                    ? "Chi nhánh"
                    : "User"}
            </Badge>
            {isStoreScoped && warehouseLabel ? (
              <Badge className="bg-amber-400 text-slate-900 font-semibold">
                {username ? `${username} · ` : ""}
                {warehouseLabel}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-slate-500 text-slate-200">
                Tất cả kho
              </Badge>
            )}
            {(role === "super_admin" || role === "manager") && (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="text-slate-200 hover:text-white hover:bg-slate-800"
              >
                <Link to="/admin/users">
                  <Users className="w-4 h-4 mr-1" />
                  Tài khoản
                </Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-200 hover:text-white hover:bg-slate-800"
              onClick={() => void signOut()}
            >
              <LogOut className="w-4 h-4 mr-1" />
              Đăng xuất
            </Button>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-2 pb-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {visibleNav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => selectTab(item.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  tab === item.id
                    ? "bg-amber-400 text-slate-900"
                    : "text-slate-200 hover:bg-slate-800",
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        {tab === "create" && (
          <div className="space-y-6">
            <NewProductsStrip
              onAdd={(item) => {
                createFormRef.current?.addBySlugOrBarcode(
                  item.maHang,
                  item.maVach,
                );
              }}
            />
            <CreateWarehouseOrderForm ref={createFormRef} />

            <Tabs defaultValue="transfer">
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="transfer">
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                  Import điều chuyển Excel
                </TabsTrigger>
                <TabsTrigger value="dhdc">
                  <FileSpreadsheet className="w-3.5 h-3.5 mr-1" />
                  Import phiếu DH/DC
                </TabsTrigger>
              </TabsList>
              <TabsContent value="transfer" className="mt-4">
                <TransferExcelImport />
              </TabsContent>
              <TabsContent value="dhdc" className="mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Import Excel phiếu DH/DC
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DataImport />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {tab === "dashboard" && <DashboardLite />}

        {tab === "manage" && <ManageOrdersPanel />}

        {tab === "receive" && (
          <Card>
            <CardHeader>
              <CardTitle>Xác nhận nhận hàng</CardTitle>
            </CardHeader>
            <CardContent>
              <ReceiveOrdersPanel />
            </CardContent>
          </Card>
        )}

        {tab === "packing" && (
          <div className="space-y-6">
            <DuplicateAlertBanner />
            <PackingWeekCalendar
              onSelectOrder={(id) => setPackDetailId(id)}
            />
            <PackingSummaryBoard />
          </div>
        )}

        {tab === "internal-dispatch" && <InternalDispatchWorkspace />}

        {tab === "xb" && (
          <div className="space-y-4">
            <BanKemDvPanel />
          </div>
        )}

        {tab === "admin" && (
          <div className="space-y-6">
            {(role === "super_admin" || role === "manager") && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Quản lý tài khoản
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    Tạo user, đổi role — chỉ Quản trị / Quản lý.
                  </p>
                  <Button asChild>
                    <Link to="/admin/users">Mở Quản lý Users</Link>
                  </Button>
                </CardContent>
              </Card>
            )}
            <CatalogAdminHub />
            <Tabs defaultValue="transfer">
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="transfer">
                  <ArrowRightLeft className="w-3.5 h-3.5 mr-1" />
                  Điều chuyển Excel
                </TabsTrigger>
              </TabsList>
              <TabsContent value="transfer" className="mt-4 space-y-4">
                <TransferExcelImport />
                <InternalTransferBoard />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      <Dialog
        open={!!packDetailId}
        onOpenChange={(o) => !o && setPackDetailId(null)}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-[1600px] max-h-[calc(100vh-1rem)] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Soạn hàng</DialogTitle>
          </DialogHeader>
          {packDetailId && (
            <WarehouseOrderDetail
              orderId={packDetailId}
              onClose={() => setPackDetailId(null)}
              variant="packing"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Redirect storefront cũ về portal kho */
export function StorefrontLockedRedirect() {
  return <Navigate to="/" replace />;
}
