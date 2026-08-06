import { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Package,
  PackageX,
  RefreshCw,
  Truck,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AdminLayout from "@/components/admin/AdminLayout";
import InternalTransferBoard from "@/components/admin/InternalTransferBoard";
import SEO from "@/components/SEO";
import { useDashboardStats } from "@/hooks/useDashboardStats";
import { useInternalTransferStats } from "@/hooks/useInternalTransfers";

const AdminDashboard = () => {
  const queryClient = useQueryClient();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const {
    activeTransferCount,
    unitsInTransit,
    mismatchCount,
    isLoading: transferLoading,
  } = useInternalTransferStats();

  const loading = statsLoading || transferLoading;

  const widgets = useMemo(
    () => [
      {
        label: "Tổng lệnh điều chuyển đang đi",
        value: activeTransferCount,
        hint: "Chờ xác nhận + đang luân chuyển",
        icon: ArrowRightLeft,
        color: "text-sky-700",
        bgColor: "bg-sky-100",
        href: "/admin/inventory/transfers",
      },
      {
        label: "Cảnh báo tồn kho thấp",
        value: (stats?.lowStockProducts || 0) + (stats?.outOfStockProducts || 0),
        hint:
          (stats?.outOfStockProducts || 0) > 0
            ? `${stats?.outOfStockProducts} hết hàng · ${stats?.lowStockProducts || 0} sắp hết`
            : "Dưới ngưỡng cảnh báo",
        icon: AlertTriangle,
        color: "text-amber-700",
        bgColor: "bg-amber-100",
        href: "/admin/inventory",
      },
      {
        label: "Số lượng hàng đang luân chuyển",
        value: unitsInTransit,
        hint: "Tổng SL trên lệnh đang đi đường",
        icon: Truck,
        color: "text-violet-700",
        bgColor: "bg-violet-100",
        href: "/admin/inventory/transfers",
      },
      {
        label: "Sản phẩm đang quản lý",
        value: stats?.totalProducts || 0,
        hint: "Danh mục active",
        icon: Package,
        color: "text-emerald-700",
        bgColor: "bg-emerald-100",
        href: "/admin/products",
      },
    ],
    [
      activeTransferCount,
      unitsInTransit,
      stats?.lowStockProducts,
      stats?.outOfStockProducts,
      stats?.totalProducts,
    ],
  );

  const handleRefresh = useCallback(() => {
    queryClient.refetchQueries({ queryKey: ["dashboard-stats"] });
    queryClient.refetchQueries({ queryKey: ["internal-transfers"] });
  }, [queryClient]);

  return (
    <AdminLayout>
      <SEO
        title="Hệ Thống Quản Lý Kho Nội Bộ K9"
        description="Dashboard quản lý luân chuyển kho nội bộ"
      />

      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Hệ Thống Quản Lý Kho Nội Bộ K9
          </h1>
          <p className="text-muted-foreground mt-1">
            Theo dõi điều chuyển và tồn kho giữa các chi nhánh
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Làm mới
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-8">
        {widgets.map((w) => (
          <Link key={w.label} to={w.href}>
            <Card className="h-full hover:bg-muted/40 transition-colors">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {w.label}
                </CardTitle>
                <div className={`p-2 rounded-full ${w.bgColor}`}>
                  <w.icon className={`w-4 h-4 ${w.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold tabular-nums">
                  {loading ? "—" : w.value}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{w.hint}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {((stats?.outOfStockProducts || 0) > 0 || mismatchCount > 0) && (
        <div className="grid gap-4 md:grid-cols-2 mb-8">
          {(stats?.outOfStockProducts || 0) > 0 && (
            <Link to="/admin/inventory">
              <Card className="border-destructive/50 bg-destructive/5 hover:bg-destructive/10 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-destructive">
                    Sản phẩm hết hàng
                  </CardTitle>
                  <PackageX className="w-4 h-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {stats?.outOfStockProducts}
                  </div>
                  <CardDescription className="mt-1">Cần nhập / điều chuyển bổ sung</CardDescription>
                </CardContent>
              </Card>
            </Link>
          )}
          {mismatchCount > 0 && (
            <Link to="/admin/inventory/transfers">
              <Card className="border-destructive/50 bg-destructive/5 hover:bg-destructive/10 transition-colors">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-destructive">
                    Lệnh điều chuyển sai lệch
                  </CardTitle>
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-destructive">
                    {mismatchCount}
                  </div>
                  <CardDescription className="mt-1">
                    Số lượng thực nhận không khớp xuất
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>
      )}

      <InternalTransferBoard />
    </AdminLayout>
  );
};

export default AdminDashboard;
