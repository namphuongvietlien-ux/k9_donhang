import { useState, useEffect } from "react";
import { Download, Loader2, Package, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

interface InventoryReport {
  product_id: string;
  product_name: string;
  category: string | null;
  stock_quantity: number;
  min_stock_level: number;
  average_cost: number;
  stock_value: number;
  unit: string;
}

interface StockMovement {
  date: string;
  type: "in" | "out";
  quantity: number;
  value: number;
}

const AdminInventoryReports = () => {
  const [loading, setLoading] = useState(false);
  const [reportType, setReportType] = useState<"overview" | "low_stock" | "expiring" | "movement">("overview");
  const [startDate, setStartDate] = useState(format(new Date(new Date().getFullYear(), 0, 1), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [inventoryData, setInventoryData] = useState<InventoryReport[]>([]);
  const [lowStockData, setLowStockData] = useState<InventoryReport[]>([]);
  const [movementData, setMovementData] = useState<StockMovement[]>([]);
  const { toast } = useToast();
  const { products: sharedProducts = [], loading: productsLoading } = useProducts();

  useEffect(() => {
    if (productsLoading && sharedProducts.length === 0) return;
    fetchReportData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, startDate, endDate, sharedProducts, productsLoading]);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      if (reportType === "overview" || reportType === "low_stock") {
        const products = (sharedProducts as Array<{
          id: string;
          name: string;
          category?: string | null;
          stock_quantity?: number;
          min_stock_level?: number;
          max_stock_level?: number | null;
          average_cost?: number | null;
          unit?: string;
          is_active?: boolean;
        }> || []).filter((product) => product.is_active !== false);

        const reportData: InventoryReport[] = products.map((p) => ({
          product_id: p.id,
          product_name: p.name,
          category: p.category,
          stock_quantity: p.stock_quantity || 0,
          min_stock_level: p.min_stock_level || 0,
          average_cost: p.average_cost || 0,
          stock_value: (p.stock_quantity || 0) * (p.average_cost || 0),
          unit: p.unit || "cái",
        }));

        setInventoryData(reportData);

        if (reportType === "low_stock") {
          const lowStock = reportData.filter(
            (item) => item.stock_quantity < item.min_stock_level || item.stock_quantity === 0
          );
          setLowStockData(lowStock);
        }
      } else if (reportType === "movement") {
        // Fetch stock movements
        const { data: movements, error } = await supabase
          .from("inventory_movements")
          .select(`
            movement_date,
            movement_type,
            quantity,
            unit_price
          `)
          .gte("movement_date", startDate)
          .lte("movement_date", endDate)
          .order("movement_date", { ascending: false });

        if (error) throw error;

        // Group by date and type
        const grouped: Record<string, { in: number; out: number; inValue: number; outValue: number }> = {};
        (movements || []).forEach((m) => {
          const date = m.movement_date;
          if (!grouped[date]) {
            grouped[date] = { in: 0, out: 0, inValue: 0, outValue: 0 };
          }
          if (m.movement_type === "in") {
            grouped[date].in += m.quantity;
            grouped[date].inValue += m.quantity * m.unit_price;
          } else {
            grouped[date].out += m.quantity;
            grouped[date].outValue += m.quantity * m.unit_price;
          }
        });

        const movementReport: StockMovement[] = Object.entries(grouped).map(([date, data]) => ({
          date,
          type: "in" as const,
          quantity: data.in,
          value: data.inValue,
        })).concat(
          Object.entries(grouped).map(([date, data]) => ({
            date,
            type: "out" as const,
            quantity: data.out,
            value: data.outValue,
          }))
        ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        setMovementData(movementReport);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error fetching report data:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải dữ liệu báo cáo",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat("vi-VN").format(price) + "₫";
  };

  const totalStockValue = inventoryData.reduce((sum, item) => sum + item.stock_value, 0);
  const totalProducts = inventoryData.length;
  const lowStockCount = inventoryData.filter(
    (item) => item.stock_quantity < item.min_stock_level || item.stock_quantity === 0
  ).length;

  const handleExport = () => {
    // Simple CSV export
    let csv = "";
    if (reportType === "overview") {
      csv = "Sản phẩm,Danh mục,Tồn kho,Giá vốn TB,Giá trị tồn kho\n";
      inventoryData.forEach((item) => {
        csv += `"${item.product_name}","${item.category || ""}",${item.stock_quantity},${formatPrice(item.average_cost)},${formatPrice(item.stock_value)}\n`;
      });
    } else if (reportType === "low_stock") {
      csv = "Sản phẩm,Danh mục,Tồn kho,Tồn tối thiểu,Thiếu\n";
      lowStockData.forEach((item) => {
        const shortage = item.min_stock_level - item.stock_quantity;
        csv += `"${item.product_name}","${item.category || ""}",${item.stock_quantity},${item.min_stock_level},${shortage}\n`;
      });
    }

    // Add UTF-8 BOM for proper Excel encoding
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `bao-cao-ton-kho-${format(new Date(), "yyyy-MM-dd")}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <AdminLayout>
      <SEO title="Báo cáo tồn kho" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Báo cáo tồn kho</h1>
            <p className="text-muted-foreground mt-1">
              Xem báo cáo tồn kho và xuất dữ liệu
            </p>
          </div>
          <Button onClick={handleExport} disabled={loading}>
            <Download className="w-4 h-4 mr-2" />
            Xuất Excel
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng giá trị tồn kho
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatPrice(totalStockValue)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sản phẩm sắp hết
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{lowStockCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Tổng số sản phẩm
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totalProducts}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Báo cáo</CardTitle>
              <div className="flex items-center gap-4">
                <Select value={reportType} onValueChange={(value: any) => setReportType(value)}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="overview">Tổng quan tồn kho</SelectItem>
                    <SelectItem value="low_stock">Tồn kho thấp</SelectItem>
                    <SelectItem value="movement">Nhập/xuất tồn</SelectItem>
                  </SelectContent>
                </Select>
                {reportType === "movement" && (
                  <div className="flex items-center gap-2">
                    <div>
                      <Label>Từ ngày</Label>
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                    <div>
                      <Label>Đến ngày</Label>
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-[150px]"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  {reportType === "overview" && (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sản phẩm</TableHead>
                            <TableHead>Danh mục</TableHead>
                            <TableHead>Tồn kho</TableHead>
                            <TableHead>Giá vốn TB</TableHead>
                            <TableHead>Giá trị tồn kho</TableHead>
                            <TableHead>Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {inventoryData.map((item) => (
                            <TableRow key={item.product_id}>
                              <TableCell className="font-medium">{item.product_name}</TableCell>
                              <TableCell>{item.category || "-"}</TableCell>
                              <TableCell>
                                {item.stock_quantity} {item.unit}
                              </TableCell>
                              <TableCell>{formatPrice(item.average_cost)}</TableCell>
                              <TableCell className="font-medium">
                                {formatPrice(item.stock_value)}
                              </TableCell>
                              <TableCell>
                                {item.stock_quantity === 0 ? (
                                  <Badge variant="destructive">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Hết hàng
                                  </Badge>
                                ) : item.stock_quantity < item.min_stock_level ? (
                                  <Badge variant="outline" className="border-warning text-warning">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Sắp hết
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Bình thường</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {reportType === "low_stock" && (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Sản phẩm</TableHead>
                            <TableHead>Danh mục</TableHead>
                            <TableHead>Tồn kho</TableHead>
                            <TableHead>Tồn tối thiểu</TableHead>
                            <TableHead>Thiếu</TableHead>
                            <TableHead>Trạng thái</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lowStockData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                Không có sản phẩm nào sắp hết
                              </TableCell>
                            </TableRow>
                          ) : (
                            lowStockData.map((item) => {
                              const shortage = item.min_stock_level - item.stock_quantity;
                              return (
                                <TableRow key={item.product_id}>
                                  <TableCell className="font-medium">{item.product_name}</TableCell>
                                  <TableCell>{item.category || "-"}</TableCell>
                                  <TableCell>
                                    {item.stock_quantity} {item.unit}
                                  </TableCell>
                                  <TableCell>{item.min_stock_level}</TableCell>
                                  <TableCell className="font-medium text-destructive">
                                    {shortage} {item.unit}
                                  </TableCell>
                                  <TableCell>
                                    {item.stock_quantity === 0 ? (
                                      <Badge variant="destructive">Hết hàng</Badge>
                                    ) : (
                                      <Badge variant="outline" className="border-warning text-warning">
                                        Sắp hết
                                      </Badge>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}

                  {reportType === "movement" && (
                    <div className="rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Ngày</TableHead>
                            <TableHead>Loại</TableHead>
                            <TableHead>Số lượng</TableHead>
                            <TableHead>Giá trị</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {movementData.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                Không có dữ liệu trong khoảng thời gian này
                              </TableCell>
                            </TableRow>
                          ) : (
                            movementData.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell>
                                  {format(new Date(item.date), "dd/MM/yyyy", { locale: vi })}
                                </TableCell>
                                <TableCell>
                                  {item.type === "in" ? (
                                    <Badge variant="outline" className="border-green-500 text-green-500">
                                      <TrendingUp className="w-3 h-3 mr-1" />
                                      Nhập
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="border-red-500 text-red-500">
                                      <TrendingDown className="w-3 h-3 mr-1" />
                                      Xuất
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>{item.quantity}</TableCell>
                                <TableCell className="font-medium">{formatPrice(item.value)}</TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminInventoryReports;
