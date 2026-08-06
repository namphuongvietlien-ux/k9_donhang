import { useState, useEffect } from "react";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Eye, Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
import DuplicateAlertBanner from "@/components/admin/DuplicateAlertBanner";
import SkuHistoryBadge from "@/components/admin/SkuHistoryBadge";
import DataImport from "@/components/admin/DataImport";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

interface OrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  price: number;
  quantity: number;
  shipping_fee: number | null;
  cost_price: number | null;
  profit: number | null;
  profit_margin: number | null;
}

interface Order {
  id: string;
  order_code: string | null;
  user_id: string | null;
  customer_name: string;
  customer_phone: string | null;
  customer_address: string | null;
  shipping_province: string | null;
  subtotal: number | null;
  shipping_fee: number | null;
  is_free_shipping: boolean | null;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  warehouse_id?: string | null;
}

const statusOptions = [
  { value: "pending", label: "Chờ xác nhận", color: "bg-yellow-100 text-yellow-800 border-yellow-300" },
  { value: "confirmed", label: "Đã xác nhận", color: "bg-blue-100 text-blue-800 border-blue-300" },
  { value: "shipping", label: "Đang giao", color: "bg-purple-100 text-purple-800 border-purple-300" },
  { value: "completed", label: "Hoàn thành", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "cancelled", label: "Đã hủy", color: "bg-red-100 text-red-800 border-red-300" },
];

// Define status flow order (cannot go backwards)
const statusOrder: Record<string, number> = {
  pending: 0,
  confirmed: 1,
  shipping: 2,
  completed: 3,
  cancelled: -1, // Special case: can be set from any status but cannot be changed from
};

// Get allowed next statuses for a given current status
const getAllowedNextStatuses = (currentStatus: string): string[] => {
  const currentOrder = statusOrder[currentStatus];
  
  // If already cancelled or completed, cannot change
  if (currentStatus === "cancelled" || currentStatus === "completed") {
    return [];
  }
  
  // If pending, can go to confirmed or cancelled
  if (currentStatus === "pending") {
    return ["confirmed", "cancelled"];
  }
  
  // If confirmed, can go to shipping or cancelled (not back to pending)
  if (currentStatus === "confirmed") {
    return ["shipping", "cancelled"];
  }
  
  // If shipping, can go to completed or cancelled (not back to confirmed or pending)
  if (currentStatus === "shipping") {
    return ["completed", "cancelled"];
  }
  
  return [];
};

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const getStatusBadge = (status: string) => {
  const statusOption = statusOptions.find((s) => s.value === status);
  if (!statusOption) return <Badge variant="outline">{status}</Badge>;
  return (
    <Badge variant="outline" className={statusOption.color}>
      {statusOption.label}
    </Badge>
  );
};

const AdminOrders = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const { toast } = useToast();
  const [importOpen, setImportOpen] = useState(false);

  const fetchOrders = async () => {
    try {
      const { data, error } = await supabase
        .from("orders")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setOrders(data || []);
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể tải danh sách đơn hàng",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter]);

  const fetchOrderItems = async (orderId: string) => {
    setLoadingItems(true);
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (error) throw error;
      setOrderItems(data || []);
    } catch (error) {
      // Error handled silently
    } finally {
      setLoadingItems(false);
    }
  };

  const handleViewOrder = (order: Order) => {
    setSelectedOrder(order);
    fetchOrderItems(order.id);
  };

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    setUpdatingStatus(orderId);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: newStatus })
        .eq("id", orderId);

      if (error) throw error;

      setOrders((prev) =>
        prev.map((order) =>
          order.id === orderId ? { ...order, status: newStatus } : order
        )
      );

      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => prev ? { ...prev, status: newStatus } : null);
      }

      // Show additional message for confirmed orders
      if (newStatus === "confirmed") {
        toast({
          title: "Đã cập nhật trạng thái",
          description: `Đơn hàng đã được xác nhận. Hệ thống đã tự động xuất kho và tạo công nợ phải thu.`,
        });
      } else {
        toast({
          title: "Đã cập nhật trạng thái",
          description: `Đơn hàng đã được cập nhật thành "${statusOptions.find(s => s.value === newStatus)?.label}"`,
        });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error updating order status:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể cập nhật trạng thái đơn hàng",
      });
    } finally {
      setUpdatingStatus(null);
    }
  };

  const orderFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: statusOptions.map((s) => ({
        value: s.value,
        label: s.label,
      })),
    },
  ];

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      !searchQuery ||
      order.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.customer_phone?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (order.order_code && order.order_code.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Pagination logic
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleItemsPerPageChange = (newItemsPerPage: number) => {
    setItemsPerPage(newItemsPerPage);
    setCurrentPage(1);
  };

  const orderStats = {
    total: orders.length,
    pending: orders.filter((o) => o.status === "pending").length,
    confirmed: orders.filter((o) => o.status === "confirmed").length,
    shipping: orders.filter((o) => o.status === "shipping").length,
    completed: orders.filter((o) => o.status === "completed").length,
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý đơn hàng | Admin" description="Quản lý đơn hàng" />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Đơn hàng</h1>
          <p className="text-muted-foreground">Quản lý và theo dõi đơn hàng</p>
        </div>
        <Button variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="w-4 h-4 mr-2" />
          Import dữ liệu
        </Button>
      </div>

      <DuplicateAlertBanner className="mb-6" />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{orderStats.total}</div>
            <p className="text-sm text-muted-foreground">Tổng đơn</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-yellow-600">{orderStats.pending}</div>
            <p className="text-sm text-muted-foreground">Chờ xác nhận</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{orderStats.confirmed}</div>
            <p className="text-sm text-muted-foreground">Đã xác nhận</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{orderStats.shipping}</div>
            <p className="text-sm text-muted-foreground">Đang giao</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{orderStats.completed}</div>
            <p className="text-sm text-muted-foreground">Hoàn thành</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <CardTitle>Danh sách đơn hàng ({filteredOrders.length})</CardTitle>
            <AdminSearchBar
              placeholder="Tìm kiếm theo mã đơn, tên khách hàng, số điện thoại..."
              searchValue={searchQuery}
              onSearchChange={setSearchQuery}
              filters={orderFilters}
              activeFilters={{
                status: statusFilter,
              }}
              onFilterChange={(key, value) => {
                if (key === "status") setStatusFilter(value);
              }}
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery || statusFilter !== "all"
                ? "Không tìm thấy đơn hàng phù hợp"
                : "Chưa có đơn hàng nào"}
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã đơn</TableHead>
                    <TableHead>Khách hàng</TableHead>
                    <TableHead>Tổng tiền</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Ngày đặt</TableHead>
                    <TableHead className="w-24">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedOrders.map((order) => (
                    <TableRow key={order.id}>
                      <TableCell className="font-mono text-sm font-semibold">
                        {order.order_code || `#${order.id.slice(0, 8).toUpperCase()}`}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{order.customer_name}</p>
                          {order.customer_phone && (
                            <p className="text-sm text-muted-foreground">{order.customer_phone}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatPrice(order.total_amount)}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={order.status}
                          onValueChange={(value) => handleStatusChange(order.id, value)}
                          disabled={updatingStatus === order.id}
                        >
                          <SelectTrigger className="w-36 h-8">
                            {updatingStatus === order.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <SelectValue />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            {statusOptions.map((status) => {
                              const allowedStatuses = getAllowedNextStatuses(order.status);
                              const isDisabled = !allowedStatuses.includes(status.value) && status.value !== order.status;
                              return (
                                <SelectItem 
                                  key={status.value} 
                                  value={status.value}
                                  disabled={isDisabled}
                                >
                                  {status.label}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {format(new Date(order.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewOrder(order)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <AdminPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredOrders.length}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                onItemsPerPageChange={handleItemsPerPageChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import dữ liệu — tạo đơn từ CSV/Excel</DialogTitle>
          </DialogHeader>
          <DataImport
            onSuccess={() => {
              setImportOpen(false);
              setLoading(true);
              fetchOrders();
            }}
          />
        </DialogContent>
      </Dialog>

      {/* Order Detail Dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              Chi tiết đơn hàng {selectedOrder?.order_code || `#${selectedOrder?.id.slice(0, 8).toUpperCase()}`}
            </DialogTitle>
          </DialogHeader>

          {selectedOrder && (
            <div className="space-y-4">
              {/* Order Info */}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Mã đơn hàng</p>
                  <p className="font-medium font-mono">{selectedOrder.order_code || `#${selectedOrder.id.slice(0, 8).toUpperCase()}`}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Trạng thái</p>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <div>
                  <p className="text-muted-foreground">Khách hàng</p>
                  <p className="font-medium">{selectedOrder.customer_name}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Số điện thoại</p>
                  <p className="font-medium">{selectedOrder.customer_phone || "N/A"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground">Địa chỉ</p>
                  <p className="font-medium">{selectedOrder.customer_address || "N/A"}</p>
                </div>
                {selectedOrder.shipping_province && (
                  <div>
                    <p className="text-muted-foreground">Tỉnh/Thành phố nhận hàng</p>
                    <p className="font-medium">{selectedOrder.shipping_province}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Ngày đặt</p>
                  <p className="font-medium">
                    {format(new Date(selectedOrder.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tạm tính</p>
                  <p className="font-medium">{formatPrice(selectedOrder.subtotal || selectedOrder.total_amount)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Phí vận chuyển</p>
                  {selectedOrder.is_free_shipping ? (
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                      Miễn phí
                    </Badge>
                  ) : (
                    <p className="font-medium">{formatPrice(selectedOrder.shipping_fee || 0)}</p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Tổng cộng</p>
                  <p className="font-bold text-primary text-lg">{formatPrice(selectedOrder.total_amount)}</p>
                </div>
              </div>

              {/* Profit Summary */}
              {orderItems.length > 0 && (() => {
                const totalCost = orderItems.reduce((sum, item) => 
                  sum + (item.cost_price || 0) * item.quantity, 0
                );
                const totalProfit = orderItems.reduce((sum, item) => 
                  sum + (item.profit || 0), 0
                );
                const totalRevenue = selectedOrder.total_amount;
                const profitMargin = totalRevenue > 0 
                  ? ((totalProfit / totalRevenue) * 100).toFixed(2)
                  : "0.00";
                
                return (
                  <div className="border-t pt-4">
                    <p className="font-medium mb-3">Tổng hợp lợi nhuận</p>
                    <div className="grid grid-cols-2 gap-4 text-sm bg-muted/50 rounded-lg p-4">
                      <div>
                        <p className="text-muted-foreground">Tổng giá vốn</p>
                        <p className="font-medium">{formatPrice(totalCost)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tổng doanh thu</p>
                        <p className="font-medium text-primary">{formatPrice(totalRevenue)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Tổng lợi nhuận</p>
                        <p className={`font-bold text-lg ${totalProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatPrice(totalProfit)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Biên lợi nhuận</p>
                        <p className={`font-bold text-lg ${parseFloat(profitMargin) >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {profitMargin}%
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Order Items */}
              <div className="border-t pt-4">
                <p className="font-medium mb-3">Sản phẩm</p>
                {loadingItems ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orderItems.map((item) => {
                      const itemProfit = item.profit || 0;
                      const itemProfitMargin = item.profit_margin || 0;
                      const itemCostPrice = item.cost_price || 0;
                      
                      return (
                        <div key={item.id} className="border rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-3">
                            {item.product_image && (
                              <img
                                src={item.product_image}
                                alt={item.product_name}
                                className="w-12 h-12 object-cover rounded"
                              />
                            )}
                            <div className="flex-1">
                              <p className="font-medium text-sm">{item.product_name}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatPrice(item.price)} x {item.quantity}
                              </p>
                              <SkuHistoryBadge
                                productSlug={item.product_slug}
                                warehouseId={
                                  (selectedOrder as Order & { warehouse_id?: string | null })
                                    .warehouse_id
                                }
                              />
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-primary">
                                {formatPrice(item.price * item.quantity)}
                              </p>
                            </div>
                          </div>
                          
                          {/* Profit Details */}
                          {itemCostPrice > 0 && (
                            <div className="grid grid-cols-3 gap-2 text-xs bg-muted/30 rounded p-2">
                              <div>
                                <p className="text-muted-foreground">Giá vốn</p>
                                <p className="font-medium">{formatPrice(itemCostPrice)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Lợi nhuận</p>
                                <p className={`font-medium ${itemProfit >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {formatPrice(itemProfit)}
                                </p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Biên LN</p>
                                <p className={`font-medium ${itemProfitMargin >= 0 ? "text-green-600" : "text-red-600"}`}>
                                  {itemProfitMargin.toFixed(2)}%
                                </p>
                              </div>
                            </div>
                          )}
                          
                          {item.shipping_fee !== null && item.shipping_fee > 0 && (
                            <p className="text-xs text-muted-foreground">
                              Phí VC: {formatPrice(item.shipping_fee)}/sản phẩm (+{formatPrice(item.shipping_fee * item.quantity)})
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              {selectedOrder.notes && (
                <div className="border-t pt-4">
                  <p className="text-muted-foreground text-sm">Ghi chú</p>
                  <p className="mt-1">{selectedOrder.notes}</p>
                </div>
              )}

              {/* Status Update */}
              <div className="border-t pt-4">
                <p className="font-medium mb-2">Cập nhật trạng thái</p>
                <Select
                  value={selectedOrder.status}
                  onValueChange={(value) => handleStatusChange(selectedOrder.id, value)}
                  disabled={updatingStatus === selectedOrder.id}
                >
                  <SelectTrigger>
                    {updatingStatus === selectedOrder.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <SelectValue />
                    )}
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((status) => {
                      const allowedStatuses = getAllowedNextStatuses(selectedOrder.status);
                      const isDisabled = !allowedStatuses.includes(status.value) && status.value !== selectedOrder.status;
                      return (
                        <SelectItem 
                          key={status.value} 
                          value={status.value}
                          disabled={isDisabled}
                        >
                          {status.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {(() => {
                  const allowedStatuses = getAllowedNextStatuses(selectedOrder.status);
                  if (allowedStatuses.length === 0) {
                    return (
                      <p className="text-sm text-muted-foreground mt-2">
                        Đơn hàng đã {selectedOrder.status === "completed" ? "hoàn thành" : "hủy"}, không thể thay đổi trạng thái.
                      </p>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminOrders;
