import { useState, useMemo } from "react";
import { TrendingUp, TrendingDown, DollarSign, FileText, Download, Calendar, Filter } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useEcommerceOrders, type EcommerceOrder } from "@/hooks/useEcommerceOrders";
import { calculateTikTokFeesWithQuantity, convertDbConfigToTikTokConfig } from "@/utils/tiktokFeeCalculator";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { usePlatformFeeConfig } from "@/hooks/usePlatformFeeConfig";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

interface OrderWithFees extends EcommerceOrder {
  items: Array<{
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
  feeCalculation: ReturnType<typeof calculateTikTokFeesWithQuantity>;
}

const AdminTikTokRevenueReport = () => {
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: orders = [], isLoading } = useEcommerceOrders("tiktok");
  const { data: platformFeeConfig = {}, isLoading: isLoadingFeeConfig } = usePlatformFeeConfig("tiktok");

  // Fetch order items for all orders
  const { data: orderItemsMap = {} } = useQuery({
    queryKey: ["ecommerce-order-items", orders.map((o) => o.id).join(",")],
    queryFn: async () => {
      if (orders.length === 0) return {};

      const { data, error } = await supabase
        .from("ecommerce_order_items")
        .select("*")
        .in(
          "ecommerce_order_id",
          orders.map((o) => o.id)
        );

      if (error) throw error;

      // Group by order_id
      const map: Record<string, Array<{ quantity: number; unit_price: number; total_price: number }>> = {};
      (data || []).forEach((item) => {
        if (!map[item.ecommerce_order_id]) {
          map[item.ecommerce_order_id] = [];
        }
        map[item.ecommerce_order_id].push({
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.total_price,
        });
      });

      return map;
    },
    enabled: orders.length > 0,
  });

  // Calculate fees for each order
  const ordersWithFees = useMemo(() => {
    if (isLoadingFeeConfig) return [];
    
    const feeConfig = convertDbConfigToTikTokConfig(platformFeeConfig);
    
    return orders
      .map((order): OrderWithFees | null => {
        const items = orderItemsMap[order.id] || [];
        if (items.length === 0) return null;

        // Calculate total sales and total quantity
        const totalSales = items.reduce((sum, item) => sum + Number(item.total_price), 0);
        const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

        // Calculate fees
        const feeCalculation = calculateTikTokFeesWithQuantity(
          totalSales,
          totalQuantity,
          0, // shippingFee - có thể lấy từ order nếu có
          feeConfig
        );

        return {
          ...order,
          items,
          feeCalculation,
        };
      })
      .filter((order): order is OrderWithFees => order !== null);
  }, [orders, orderItemsMap, platformFeeConfig, isLoadingFeeConfig]);

  // Filter orders
  const filteredOrders = useMemo(() => {
    let filtered = ordersWithFees;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((order) => order.status === statusFilter);
    }

    // Date filter
    if (dateFrom || dateTo) {
      filtered = filtered.filter((order) => {
        const orderDate = new Date(order.created_at);
        if (dateFrom && orderDate < new Date(dateFrom)) return false;
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) return false;
        }
        return true;
      });
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.tracking_code.toLowerCase().includes(query) ||
          order.platform_order_id?.toLowerCase().includes(query) ||
          order.phone_last_4?.includes(query)
      );
    }

    return filtered;
  }, [ordersWithFees, statusFilter, dateFrom, dateTo, searchQuery]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        acc.totalSales += order.feeCalculation.totalSales;
        acc.totalFees += order.feeCalculation.totalFees;
        acc.netRevenue += order.feeCalculation.netRevenue;
        acc.totalOrders += 1;
        return acc;
      },
      {
        totalSales: 0,
        totalFees: 0,
        netRevenue: 0,
        totalOrders: 0,
      }
    );
  }, [filteredOrders]);

  const handleExportCSV = () => {
    const headers = [
      "Mã vận đơn",
      "Ngày tạo",
      "Trạng thái",
      "Tổng doanh số",
      "Phí giao dịch",
      "Hoa hồng sàn",
      "Hoa hồng Affiliate",
      "Phí Voucher Xtra",
      "Phí SFR",
      "Phí xử lý đơn",
      "Thuế GTGT",
      "Thuế TNCN",
      "Tổng phí",
      "Doanh thu thuần",
      "Biên lợi nhuận (%)",
    ];

    const rows = filteredOrders.map((order) => [
      order.tracking_code,
      format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi }),
      order.status,
      order.feeCalculation.totalSales,
      order.feeCalculation.transactionFee,
      order.feeCalculation.commissionFee,
      order.feeCalculation.affiliateFee,
      order.feeCalculation.voucherXtraFee,
      order.feeCalculation.sfrFee,
      order.feeCalculation.processingFeeAmount,
      order.feeCalculation.vatFee,
      order.feeCalculation.pitFee,
      order.feeCalculation.totalFees,
      order.feeCalculation.netRevenue,
      order.feeCalculation.profitMargin.toFixed(2),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    // Add BOM for Excel UTF-8 support
    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const dateStr = dateFrom && dateTo
      ? `${format(new Date(dateFrom), "ddMMyyyy", { locale: vi })}-${format(new Date(dateTo), "ddMMyyyy", { locale: vi })}`
      : format(new Date(), "ddMMyyyy", { locale: vi });
    const statusStr = statusFilter !== "all" ? `-${statusFilter}` : "";

    link.setAttribute("href", url);
    link.setAttribute("download", `tiktok-revenue-report-${dateStr}${statusStr}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Xuất CSV thành công",
      description: `Đã xuất ${filteredOrders.length} đơn hàng`,
    });
  };

  return (
    <AdminLayout>
      <SEO title="Báo cáo doanh thu TikTok - Admin" description="Báo cáo phí sàn và doanh thu từ đơn hàng TikTok" />
      <div className="p-4 md:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <TrendingUp className="w-8 h-8 text-pink-600" />
                Báo cáo doanh thu TikTok
              </h1>
              <p className="text-muted-foreground mt-1">
                Tính toán phí sàn và doanh thu từ các đơn hàng TikTok
              </p>
            </div>
            <Button onClick={handleExportCSV} className="gap-2">
              <Download className="w-4 h-4" />
              Xuất CSV
            </Button>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng đơn hàng</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totals.totalOrders}</div>
                <p className="text-xs text-muted-foreground">đơn hàng</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng doanh số</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatPrice(totals.totalSales)}</div>
                <p className="text-xs text-muted-foreground">chưa trừ phí</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Tổng phí sàn</CardTitle>
                <TrendingDown className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">{formatPrice(totals.totalFees)}</div>
                <p className="text-xs text-muted-foreground">
                  {totals.totalSales > 0
                    ? `${((totals.totalFees / totals.totalSales) * 100).toFixed(2)}% doanh số`
                    : "0%"}
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Doanh thu thuần</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{formatPrice(totals.netRevenue)}</div>
                <p className="text-xs text-muted-foreground">
                  {totals.totalSales > 0
                    ? `${((totals.netRevenue / totals.totalSales) * 100).toFixed(2)}% doanh số`
                    : "0%"}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="w-5 h-5" />
                Bộ lọc
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>Từ ngày</Label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Đến ngày</Label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Trạng thái</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Tất cả" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tất cả</SelectItem>
                      <SelectItem value="pending">Chờ xử lý</SelectItem>
                      <SelectItem value="tracking">Đang theo dõi</SelectItem>
                      <SelectItem value="in_transit">Đang vận chuyển</SelectItem>
                      <SelectItem value="delivered">Đã giao hàng</SelectItem>
                      <SelectItem value="cancelled">Đã hủy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tìm kiếm</Label>
                  <Input
                    placeholder="Mã vận đơn, mã đơn hàng..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Orders Table */}
          <Card>
            <CardHeader>
              <CardTitle>Chi tiết đơn hàng</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading || isLoadingFeeConfig ? (
                <div className="text-center py-8">Đang tải...</div>
              ) : filteredOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Không có đơn hàng nào
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã vận đơn</TableHead>
                        <TableHead>Ngày tạo</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead className="text-right">Doanh số</TableHead>
                        <TableHead className="text-right">Phí giao dịch</TableHead>
                        <TableHead className="text-right">Hoa hồng sàn</TableHead>
                        <TableHead className="text-right">Tổng phí</TableHead>
                        <TableHead className="text-right">Doanh thu thuần</TableHead>
                        <TableHead className="text-right">Biên LN (%)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.tracking_code}</TableCell>
                          <TableCell>
                            {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.status === "delivered"
                                  ? "default"
                                  : order.status === "cancelled"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {order.status === "delivered"
                                ? "Đã giao"
                                : order.status === "cancelled"
                                ? "Đã hủy"
                                : order.status === "in_transit"
                                ? "Đang vận chuyển"
                                : order.status === "tracking"
                                ? "Đang theo dõi"
                                : "Chờ xử lý"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatPrice(order.feeCalculation.totalSales)}
                          </TableCell>
                          <TableCell className="text-right text-blue-600">
                            {formatPrice(order.feeCalculation.transactionFee)}
                          </TableCell>
                          <TableCell className="text-right text-orange-600">
                            {formatPrice(order.feeCalculation.commissionFee)}
                          </TableCell>
                          <TableCell className="text-right text-red-600 font-medium">
                            {formatPrice(order.feeCalculation.totalFees)}
                          </TableCell>
                          <TableCell className="text-right text-green-600 font-bold">
                            {formatPrice(order.feeCalculation.netRevenue)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span
                              className={
                                order.feeCalculation.profitMargin > 60
                                  ? "text-green-600 font-bold"
                                  : order.feeCalculation.profitMargin > 40
                                  ? "text-orange-600 font-bold"
                                  : "text-red-600 font-bold"
                              }
                            >
                              {order.feeCalculation.profitMargin.toFixed(2)}%
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminTikTokRevenueReport;

