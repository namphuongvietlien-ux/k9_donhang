import { useState, useMemo, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, Package, Download, Calendar, Filter, BarChart3, FileText } from "lucide-react";
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
import { useProducts } from "@/hooks/useProducts";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { vi } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import * as RechartsComponents from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  product_slug: string | null;
  price: number;
  quantity: number;
  cost_price: number | null;
  profit: number | null;
  profit_margin: number | null;
}

interface Order {
  id: string;
  order_code: string | null;
  customer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
}

interface ProductProfit {
  product_slug: string | null;
  product_name: string;
  total_quantity: number;
  total_revenue: number;
  total_cost: number;
  total_profit: number;
  profit_margin: number;
  order_count: number;
}

interface DailyProfit {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  order_count: number;
}

const AdminProfitReport = () => {
  const [dateFrom, setDateFrom] = useState<string>(
    format(subDays(new Date(), 30), "yyyy-MM-dd")
  );
  const [dateTo, setDateTo] = useState<string>(
    format(new Date(), "yyyy-MM-dd")
  );
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"summary" | "products" | "orders" | "chart">("summary");
  const { toast } = useToast();

  // Fetch orders
  const { data: orders = [], isLoading: ordersLoading } = useQuery({
    queryKey: ["profit-orders", dateFrom, dateTo, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (dateFrom) {
        query = query.gte("created_at", startOfDay(new Date(dateFrom)).toISOString());
      }
      if (dateTo) {
        query = query.lte("created_at", endOfDay(new Date(dateTo)).toISOString());
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Order[];
    },
  });

  // Fetch order items
  const { data: orderItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["profit-order-items", orders.map((o) => o.id).join(",")],
    queryFn: async () => {
      if (orders.length === 0) return [];

      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .in("order_id", orders.map((o) => o.id));

      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: orders.length > 0,
  });

  // Fetch products for category filter
  const { products: sharedProducts = [] } = useProducts();
  const products = (sharedProducts as Array<{ slug?: string; category?: string | null; is_active?: boolean }> || []).filter(
    (product) => product.is_active !== false
  );

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort();
  }, [products]);

  // Filter order items by category
  const filteredOrderItems = useMemo(() => {
    if (categoryFilter === "all") return orderItems;

    const categorySlugs = products
      .filter((p) => p.category === categoryFilter)
      .map((p) => p.slug);

    return orderItems.filter((item) => categorySlugs.includes(item.product_slug));
  }, [orderItems, categoryFilter, products]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    const totalRevenue = filteredOrderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );
    const totalCost = filteredOrderItems.reduce(
      (sum, item) => sum + (item.cost_price || 0) * item.quantity,
      0
    );
    const totalProfit = filteredOrderItems.reduce(
      (sum, item) => sum + (item.profit || 0),
      0
    );
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const orderCount = new Set(filteredOrderItems.map((item) => item.order_id)).size;

    return {
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      orderCount,
      itemCount: filteredOrderItems.length,
    };
  }, [filteredOrderItems]);

  // Calculate product profits
  const productProfits = useMemo(() => {
    const productMap: Record<string, ProductProfit> = {};

    filteredOrderItems.forEach((item) => {
      const key = item.product_slug || item.product_name;
      if (!productMap[key]) {
        productMap[key] = {
          product_slug: item.product_slug,
          product_name: item.product_name,
          total_quantity: 0,
          total_revenue: 0,
          total_cost: 0,
          total_profit: 0,
          profit_margin: 0,
          order_count: 0,
        };
      }

      productMap[key].total_quantity += item.quantity;
      productMap[key].total_revenue += item.price * item.quantity;
      productMap[key].total_cost += (item.cost_price || 0) * item.quantity;
      productMap[key].total_profit += item.profit || 0;
      productMap[key].order_count += 1;
    });

    return Object.values(productMap)
      .map((p) => ({
        ...p,
        profit_margin: p.total_revenue > 0 ? (p.total_profit / p.total_revenue) * 100 : 0,
      }))
      .sort((a, b) => b.total_profit - a.total_profit);
  }, [filteredOrderItems]);

  // Calculate daily profits
  const dailyProfits = useMemo(() => {
    const dailyMap: Record<string, DailyProfit> = {};

    filteredOrderItems.forEach((item) => {
      const order = orders.find((o) => o.id === item.order_id);
      if (!order) return;

      const date = format(new Date(order.created_at), "yyyy-MM-dd");
      if (!dailyMap[date]) {
        dailyMap[date] = {
          date,
          revenue: 0,
          cost: 0,
          profit: 0,
          order_count: 0,
        };
      }

      dailyMap[date].revenue += item.price * item.quantity;
      dailyMap[date].cost += (item.cost_price || 0) * item.quantity;
      dailyMap[date].profit += item.profit || 0;
    });

    // Add order count
    orders.forEach((order) => {
      const date = format(new Date(order.created_at), "yyyy-MM-dd");
      if (dailyMap[date]) {
        dailyMap[date].order_count += 1;
      }
    });

    return Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        date: format(new Date(d.date), "dd/MM", { locale: vi }),
      }));
  }, [filteredOrderItems, orders]);

  // Orders with profit
  const ordersWithProfit = useMemo(() => {
    return orders.map((order) => {
      const items = filteredOrderItems.filter((item) => item.order_id === order.id);
      const orderRevenue = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const orderCost = items.reduce((sum, item) => sum + (item.cost_price || 0) * item.quantity, 0);
      const orderProfit = items.reduce((sum, item) => sum + (item.profit || 0), 0);
      const orderMargin = orderRevenue > 0 ? (orderProfit / orderRevenue) * 100 : 0;

      return {
        ...order,
        revenue: orderRevenue,
        cost: orderCost,
        profit: orderProfit,
        profitMargin: orderMargin,
        itemCount: items.length,
      };
    });
  }, [orders, filteredOrderItems]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      "Mã đơn",
      "Khách hàng",
      "Ngày đặt",
      "Trạng thái",
      "Doanh thu",
      "Giá vốn",
      "Lợi nhuận",
      "Biên LN (%)",
      "Số sản phẩm",
    ];

    const rows = ordersWithProfit.map((order) => [
      order.order_code || `#${order.id.slice(0, 8).toUpperCase()}`,
      order.customer_name,
      format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi }),
      order.status,
      order.revenue.toString(),
      order.cost.toString(),
      order.profit.toString(),
      order.profitMargin.toFixed(2),
      order.itemCount.toString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    const BOM = "\uFEFF";
    const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `bao-cao-loi-nhuan-${dateFrom}-${dateTo}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Đã xuất CSV",
      description: "File CSV đã được tải xuống",
    });
  };

  const isLoading = ordersLoading || itemsLoading;

  return (
    <AdminLayout>
      <SEO title="Báo cáo lợi nhuận | Admin" description="Báo cáo lợi nhuận chi tiết" />

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Báo cáo lợi nhuận</h1>
            <p className="text-muted-foreground">Theo dõi và phân tích lợi nhuận</p>
          </div>
          <Button onClick={handleExportCSV} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Xuất CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Bộ lọc
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">Từ ngày</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">Đến ngày</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="statusFilter">Trạng thái</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger id="statusFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  <SelectItem value="pending">Chờ xác nhận</SelectItem>
                  <SelectItem value="confirmed">Đã xác nhận</SelectItem>
                  <SelectItem value="shipping">Đang giao</SelectItem>
                  <SelectItem value="completed">Hoàn thành</SelectItem>
                  <SelectItem value="cancelled">Đã hủy</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="categoryFilter">Danh mục</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="categoryFilter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat || ""}>
                      {cat || "Không có danh mục"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
                <p className="text-2xl font-bold text-primary">
                  {formatPrice(summary.totalRevenue)}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tổng giá vốn</p>
                <p className="text-2xl font-bold">
                  {formatPrice(summary.totalCost)}
                </p>
              </div>
              <Package className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tổng lợi nhuận</p>
                <p className={`text-2xl font-bold ${summary.totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {formatPrice(summary.totalProfit)}
                </p>
              </div>
              {summary.totalProfit >= 0 ? (
                <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
              ) : (
                <TrendingDown className="w-8 h-8 text-red-600 opacity-50" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Biên lợi nhuận</p>
                <p className={`text-2xl font-bold ${summary.profitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {summary.profitMargin.toFixed(2)}%
                </p>
              </div>
              <BarChart3 className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Số đơn hàng</p>
                <p className="text-2xl font-bold">{summary.orderCount}</p>
              </div>
              <FileText className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-2 mb-4">
        <Button
          variant={viewMode === "summary" ? "default" : "outline"}
          onClick={() => setViewMode("summary")}
        >
          Tổng hợp
        </Button>
        <Button
          variant={viewMode === "products" ? "default" : "outline"}
          onClick={() => setViewMode("products")}
        >
          Theo sản phẩm
        </Button>
        <Button
          variant={viewMode === "orders" ? "default" : "outline"}
          onClick={() => setViewMode("orders")}
        >
          Theo đơn hàng
        </Button>
        <Button
          variant={viewMode === "chart" ? "default" : "outline"}
          onClick={() => setViewMode("chart")}
        >
          Biểu đồ
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              Đang tải dữ liệu...
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "summary" ? (
        <Card>
          <CardHeader>
            <CardTitle>Tổng hợp</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Khoảng thời gian</p>
                  <p className="font-medium">
                    {format(new Date(dateFrom), "dd/MM/yyyy", { locale: vi })} -{" "}
                    {format(new Date(dateTo), "dd/MM/yyyy", { locale: vi })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Số sản phẩm</p>
                  <p className="font-medium">{summary.itemCount}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : viewMode === "products" ? (
        <Card>
          <CardHeader>
            <CardTitle>Top sản phẩm lợi nhuận cao nhất</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Số lượng</TableHead>
                  <TableHead>Doanh thu</TableHead>
                  <TableHead>Giá vốn</TableHead>
                  <TableHead>Lợi nhuận</TableHead>
                  <TableHead>Biên LN (%)</TableHead>
                  <TableHead>Số đơn</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productProfits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      Không có dữ liệu
                    </TableCell>
                  </TableRow>
                ) : (
                  productProfits.map((product, index) => (
                    <TableRow key={product.product_slug || product.product_name}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{product.product_name}</p>
                          {index < 3 && (
                            <Badge variant="outline" className="mt-1">
                              Top {index + 1}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{product.total_quantity}</TableCell>
                      <TableCell>{formatPrice(product.total_revenue)}</TableCell>
                      <TableCell>{formatPrice(product.total_cost)}</TableCell>
                      <TableCell className={product.total_profit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {formatPrice(product.total_profit)}
                      </TableCell>
                      <TableCell className={product.profit_margin >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {product.profit_margin.toFixed(2)}%
                      </TableCell>
                      <TableCell>{product.order_count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : viewMode === "orders" ? (
        <Card>
          <CardHeader>
            <CardTitle>Danh sách đơn hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Khách hàng</TableHead>
                  <TableHead>Ngày đặt</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Doanh thu</TableHead>
                  <TableHead>Giá vốn</TableHead>
                  <TableHead>Lợi nhuận</TableHead>
                  <TableHead>Biên LN (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordersWithProfit.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      Không có dữ liệu
                    </TableCell>
                  </TableRow>
                ) : (
                  ordersWithProfit.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm">
                        {order.order_code || `#${order.id.slice(0, 8).toUpperCase()}`}
                      </TableCell>
                      <TableCell>{order.customer_name}</TableCell>
                      <TableCell>
                        {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{order.status}</Badge>
                      </TableCell>
                      <TableCell>{formatPrice(order.revenue)}</TableCell>
                      <TableCell>{formatPrice(order.cost)}</TableCell>
                      <TableCell className={order.profit >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {formatPrice(order.profit)}
                      </TableCell>
                      <TableCell className={order.profitMargin >= 0 ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                        {order.profitMargin.toFixed(2)}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : viewMode === "chart" ? (
        <Card>
          <CardHeader>
            <CardTitle>Biểu đồ lợi nhuận theo thời gian</CardTitle>
          </CardHeader>
          <CardContent>
            {dailyProfits.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                Không có dữ liệu để hiển thị
              </div>
            ) : (
              <ChartContainer
                config={{
                  revenue: { label: "Doanh thu", color: "hsl(var(--primary))" },
                  profit: { label: "Lợi nhuận", color: "hsl(142, 76%, 36%)" },
                  cost: { label: "Giá vốn", color: "hsl(0, 84%, 60%)" },
                }}
                className="h-[400px]"
              >
                <RechartsComponents.ComposedChart data={dailyProfits}>
                  <RechartsComponents.CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <RechartsComponents.XAxis
                    dataKey="date"
                    className="text-xs"
                    tickLine={false}
                    axisLine={false}
                  />
                  <RechartsComponents.YAxis
                    className="text-xs"
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value) => `${(value / 1000000).toFixed(0)}M`}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <RechartsComponents.Bar
                    dataKey="revenue"
                    fill="hsl(var(--primary))"
                    radius={[4, 4, 0, 0]}
                    name="Doanh thu"
                  />
                  <RechartsComponents.Bar
                    dataKey="cost"
                    fill="hsl(0, 84%, 60%)"
                    radius={[4, 4, 0, 0]}
                    name="Giá vốn"
                  />
                  <RechartsComponents.Line
                    type="monotone"
                    dataKey="profit"
                    stroke="hsl(142, 76%, 36%)"
                    strokeWidth={2}
                    name="Lợi nhuận"
                  />
                </RechartsComponents.ComposedChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
      ) : null}
    </AdminLayout>
  );
};

export default AdminProfitReport;

