import { useState } from "react";
import { Plus, Loader2, RefreshCw, Eye, Trash2 } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import AdminPagination from "@/components/admin/AdminPagination";
import AdminSearchBar, { SearchFilter } from "@/components/admin/AdminSearchBar";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProducts } from "@/hooks/useProducts";
import {
  useEcommerceOrders,
  useCreateEcommerceOrder,
  useSyncJTTracking,
  useAddEcommerceOrderItems,
  useDeleteEcommerceOrderItem,
  useEcommerceOrder,
  type EcommerceOrder,
} from "@/hooks/useEcommerceOrders";
import { parseJTTracking, getJTStatusText, fetchJTTracking } from "@/utils/jtApi";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const getStatusBadge = (status: string) => {
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Chờ xử lý", variant: "outline" },
    tracking: { label: "Đang theo dõi", variant: "secondary" },
    in_transit: { label: "Đang vận chuyển", variant: "secondary" },
    delivered: { label: "Đã giao hàng", variant: "default" },
    returned: { label: "Đã trả hàng", variant: "destructive" },
    cancelled: { label: "Đã hủy", variant: "destructive" },
  };
  const statusInfo = statusMap[status] || { label: status, variant: "outline" };
  return <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>;
};

interface OrderItem {
  internal_product_id: string;
  quantity: number;
  unit_price: number;
  product_name: string;
}

const AdminJTOrders = () => {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [trackingCode, setTrackingCode] = useState("");
  const [phoneLast4, setPhoneLast4] = useState("");
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: orders = [], isLoading } = useEcommerceOrders("jt");
  const createOrderMutation = useCreateEcommerceOrder();
  const syncTrackingMutation = useSyncJTTracking();
  const addItemsMutation = useAddEcommerceOrderItems();
  const deleteItemMutation = useDeleteEcommerceOrderItem();
  const { data: selectedOrderData } = useEcommerceOrder(selectedOrderId || "");

  const { products: sharedProducts = [] } = useProducts();
  const products = (sharedProducts as Array<{ id: string; name: string; price?: number; stock_quantity?: number; is_active?: boolean }> || []).filter(
    (product) => product.is_active !== false
  );

  const searchFilters: SearchFilter[] = [
    {
      key: "status",
      label: "Trạng thái",
      options: [
        { value: "all", label: "Tất cả" },
        { value: "pending", label: "Chờ xử lý" },
        { value: "tracking", label: "Đang theo dõi" },
        { value: "in_transit", label: "Đang vận chuyển" },
        { value: "delivered", label: "Đã giao hàng" },
        { value: "returned", label: "Đã trả hàng" },
        { value: "cancelled", label: "Đã hủy" },
      ],
    },
  ];

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      !searchQuery ||
      order.tracking_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      order.platform_order_id?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === "all" || order.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleAddItemToOrder = () => {
    if (!selectedProductId || quantity <= 0 || unitPrice <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập đầy đủ thông tin",
      });
      return;
    }

    const product = products.find((p) => p.id === selectedProductId);
    if (!product) return;

    const newItem: OrderItem = {
      internal_product_id: selectedProductId,
      quantity,
      unit_price: unitPrice,
      product_name: product.name,
    };

    setOrderItems([...orderItems, newItem]);
    setSelectedProductId("");
    setQuantity(1);
    setUnitPrice(0);
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  const handleAddOrder = async () => {
    if (!trackingCode.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập mã vận chuyển",
      });
      return;
    }

    if (!phoneLast4.trim() || phoneLast4.trim().length !== 4) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập 4 số cuối điện thoại",
      });
      return;
    }

    if (orderItems.length === 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng thêm ít nhất một sản phẩm",
      });
      return;
    }

    try {
      // Create order
      const order = await createOrderMutation.mutateAsync({
        trackingCode: trackingCode.trim(),
        platformCode: "jt",
      });

      // Update phone_last_4
      await supabase
        .from("ecommerce_orders")
        .update({ phone_last_4: phoneLast4.trim() })
        .eq("id", order.id);

      // Add items to order
      await addItemsMutation.mutateAsync({
        orderId: order.id,
        items: orderItems.map((item) => ({
          internal_product_id: item.internal_product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
        })),
      });

      // After creating order and items, sync tracking
      await handleSyncTracking(order.id, trackingCode.trim(), phoneLast4.trim());

      // Reset form
      setTrackingCode("");
      setPhoneLast4("");
      setOrderItems([]);
      setSelectedProductId("");
      setQuantity(1);
      setUnitPrice(0);
      setIsAddDialogOpen(false);
      
    } catch (error) {
      // Error handled by mutation
    }
  };

  const handleSyncTracking = async (orderId: string, code: string, phone: string) => {
    setIsSyncing(true);
    try {
      // Get Supabase credentials
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error("Missing Supabase credentials");
      }

      // Get current session for auth
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      let htmlResponse: string;

      // Try to call Edge Function first
      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/jt-tracking`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": supabaseKey,
          },
          body: JSON.stringify({ trackingCode: code, phoneLast4: phone }),
        });

        if (response.ok) {
          const data = await response.json();
          htmlResponse = data.html;
        } else if (response.status === 404) {
          throw new Error("Edge Function not found. Please deploy the jt-tracking Edge Function to Supabase.");
        } else if (response.status === 401) {
          throw new Error("Authentication failed. Please check your Supabase credentials.");
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (fetchError) {
        // DO NOT try direct fetch - it will always fail due to CORS
        // The Edge Function must be deployed and working
        if (fetchError instanceof TypeError || (fetchError instanceof Error && fetchError.message.includes("Failed to fetch"))) {
          throw new Error("Cannot reach Edge Function. Please ensure the jt-tracking Edge Function is deployed. Direct fetch from browser is blocked by CORS.");
        } else {
          throw fetchError;
        }
      }

      // Parse tracking data
      const trackingData = parseJTTracking(htmlResponse, code);

      // Sync to database
      await syncTrackingMutation.mutateAsync({
        orderId,
        trackingData,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error syncing tracking:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error instanceof Error ? error.message : "Không thể sync tracking. Vui lòng thử lại sau.",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleAddProducts = () => {
    if (!selectedOrderId) return;
    setIsProductDialogOpen(true);
  };

  return (
    <AdminLayout>
      <SEO title="Quản lý đơn hàng J&T" />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Đơn hàng J&T</h1>
            <p className="text-muted-foreground mt-1">
              Quản lý và theo dõi đơn hàng từ J&T Express
            </p>
          </div>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Thêm đơn hàng
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Danh sách đơn hàng</CardTitle>
          </CardHeader>
          <CardContent>
            <AdminSearchBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              filters={searchFilters}
              onFilterChange={(key, value) => {
                if (key === "status") setStatusFilter(value);
              }}
            />

            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : paginatedOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Không có đơn hàng nào
              </div>
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mã vận đơn</TableHead>
                      <TableHead>Trạng thái</TableHead>
                      <TableHead>Milestone</TableHead>
                      <TableHead>Tổng tiền</TableHead>
                      <TableHead>Lần sync cuối</TableHead>
                      <TableHead>Thao tác</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedOrders.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono">{order.tracking_code}</TableCell>
                        <TableCell>{getStatusBadge(order.status)}</TableCell>
                        <TableCell>
                          {order.last_milestone_name ? (
                            <span className="text-sm">{order.last_milestone_name}</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>{formatPrice(order.total_amount)}</TableCell>
                        <TableCell>
                          {order.last_synced_at
                            ? format(new Date(order.last_synced_at), "dd/MM/yyyy HH:mm", { locale: vi })
                            : "-"}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                setSelectedOrderId(order.id);
                                setIsProductDialogOpen(true);
                              }}
                              aria-label="Xem chi tiết"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleSyncTracking(order.id, order.tracking_code, order.phone_last_4 || "")}
                              disabled={isSyncing || !order.phone_last_4}
                              aria-label="Sync lại"
                            >
                              <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>

                <AdminPagination
                  currentPage={currentPage}
                  totalPages={Math.ceil(filteredOrders.length / itemsPerPage)}
                  onPageChange={setCurrentPage}
                  itemsPerPage={itemsPerPage}
                  onItemsPerPageChange={setItemsPerPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add Order Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Thêm đơn hàng J&T</DialogTitle>
            <DialogDescription>
              Nhập mã vận chuyển, 4 số cuối điện thoại và chọn sản phẩm để tạo đơn hàng mới
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {/* Tracking Code and Phone */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tracking-code">Mã vận chuyển *</Label>
                <Input
                  id="tracking-code"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="VD: 859870046929"
                />
              </div>
              <div>
                <Label htmlFor="phone-last-4">4 số cuối điện thoại *</Label>
                <Input
                  id="phone-last-4"
                  value={phoneLast4}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setPhoneLast4(value);
                  }}
                  placeholder="VD: 9366"
                  maxLength={4}
                />
              </div>
            </div>

            {/* Product Selection */}
            <div className="border-t pt-4">
              <h3 className="font-semibold mb-4">Thêm sản phẩm</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label htmlFor="product-select">Sản phẩm</Label>
                  <Select value={selectedProductId} onValueChange={(value) => {
                    setSelectedProductId(value);
                    const product = products.find((p) => p.id === value);
                    if (product) {
                      setUnitPrice(product.price);
                    }
                  }}>
                    <SelectTrigger id="product-select">
                      <SelectValue placeholder="Chọn sản phẩm" />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} ({formatPrice(product.price)})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="quantity">Số lượng</Label>
                  <Input
                    id="quantity"
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label htmlFor="unit-price">Giá bán (₫)</Label>
                  <Input
                    id="unit-price"
                    type="number"
                    min="0"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddItemToOrder}
                    disabled={!selectedProductId}
                    className="w-full"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Thêm
                  </Button>
                </div>
              </div>
              {selectedProductId && (
                <div className="mt-2 text-sm text-muted-foreground">
                  Giá hệ thống: {formatPrice(products.find((p) => p.id === selectedProductId)?.price || 0)} | 
                  Tồn kho: {products.find((p) => p.id === selectedProductId)?.stock_quantity || 0}
                </div>
              )}
            </div>

            {/* Selected Items List */}
            {orderItems.length > 0 && (
              <div className="border-t pt-4">
                <h3 className="font-semibold mb-2">Sản phẩm đã chọn</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Số lượng</TableHead>
                      <TableHead>Đơn giá</TableHead>
                      <TableHead>Thành tiền</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderItems.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.product_name}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatPrice(item.unit_price)}</TableCell>
                        <TableCell>{formatPrice(item.unit_price * item.quantity)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveItem(index)}
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="mt-4 text-right">
                  <strong>
                    Tổng đơn hàng: {formatPrice(
                      orderItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)
                    )}
                  </strong>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false);
                  setTrackingCode("");
                  setPhoneLast4("");
                  setOrderItems([]);
                  setSelectedProductId("");
                  setQuantity(1);
                  setUnitPrice(0);
                }}
              >
                Hủy
              </Button>
              <Button
                onClick={handleAddOrder}
                disabled={createOrderMutation.isPending || addItemsMutation.isPending || isSyncing}
              >
                {createOrderMutation.isPending || addItemsMutation.isPending || isSyncing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Thêm và Sync"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Product Selection Dialog - Similar to Shopee */}
      {selectedOrderId && (
        <ProductSelectionDialog
          open={isProductDialogOpen}
          onOpenChange={setIsProductDialogOpen}
          orderId={selectedOrderId}
          orderData={selectedOrderData}
          products={products}
          onAddItems={addItemsMutation.mutateAsync}
          onDeleteItem={deleteItemMutation.mutateAsync}
        />
      )}
    </AdminLayout>
  );
};

// Product Selection Dialog Component (reuse from Shopee)
interface ProductSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  orderData?: {
    order: EcommerceOrder;
    items: any[];
    events: any[];
  };
  products: Array<{
    id: string;
    name: string;
    price: number;
    stock_quantity: number;
  }>;
  onAddItems: (data: {
    orderId: string;
    items: Array<{
      internal_product_id: string;
      quantity: number;
      unit_price: number;
    }>;
  }) => Promise<any>;
  onDeleteItem: (itemId: string) => Promise<void>;
}

const ProductSelectionDialog = ({
  open,
  onOpenChange,
  orderId,
  orderData,
  products,
  onAddItems,
  onDeleteItem,
}: ProductSelectionDialogProps) => {
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setUnitPrice(product.price);
    }
  };

  const handleAddItem = async () => {
    if (!selectedProductId || quantity <= 0 || unitPrice <= 0) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng chọn sản phẩm và nhập đầy đủ thông tin",
      });
      return;
    }

    setIsAdding(true);
    try {
      await onAddItems({
        orderId,
        items: [
          {
            internal_product_id: selectedProductId,
            quantity,
            unit_price: unitPrice,
          },
        ],
      });
      setSelectedProductId("");
      setQuantity(1);
      setUnitPrice(0);
    } catch (error) {
      // Error handled by mutation
    } finally {
      setIsAdding(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await onDeleteItem(itemId);
    } catch (error) {
      // Error handled by mutation
    }
  };

  const totalAmount = orderData?.items.reduce((sum, item) => sum + item.total_price, 0) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chọn sản phẩm</DialogTitle>
          <DialogDescription>
            Mã vận đơn: {orderData?.order.tracking_code}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Existing Items */}
          {orderData && orderData.items.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">Sản phẩm đã thêm</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sản phẩm</TableHead>
                    <TableHead>Số lượng</TableHead>
                    <TableHead>Đơn giá</TableHead>
                    <TableHead>Thành tiền</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orderData.items.map((item) => {
                    const product = products.find((p) => p.id === item.internal_product_id);
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{product?.name || "N/A"}</TableCell>
                        <TableCell>{item.quantity}</TableCell>
                        <TableCell>{formatPrice(item.unit_price)}</TableCell>
                        <TableCell>{formatPrice(item.total_price)}</TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteItem(item.id)}
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              <div className="mt-4 text-right">
                <strong>Tổng đơn hàng: {formatPrice(totalAmount)}</strong>
              </div>
            </div>
          )}

          {/* Add New Item */}
          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Thêm sản phẩm</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="product-select">Sản phẩm</Label>
                <Select value={selectedProductId} onValueChange={handleProductSelect}>
                  <SelectTrigger id="product-select">
                    <SelectValue placeholder="Chọn sản phẩm" />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name} ({formatPrice(product.price)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="quantity">Số lượng</Label>
                <Input
                  id="quantity"
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                />
              </div>
              <div>
                <Label htmlFor="unit-price">Giá bán (₫)</Label>
                <Input
                  id="unit-price"
                  type="number"
                  min="0"
                  value={unitPrice}
                  onChange={(e) => setUnitPrice(parseInt(e.target.value) || 0)}
                />
              </div>
              <div className="flex items-end">
                <Button
                  onClick={handleAddItem}
                  disabled={!selectedProductId || isAdding}
                  className="w-full"
                >
                  {isAdding ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Thêm"
                  )}
                </Button>
              </div>
            </div>
            {selectedProduct && (
              <div className="mt-2 text-sm text-muted-foreground">
                Giá hệ thống: {formatPrice(selectedProduct.price)} | Tồn kho: {selectedProduct.stock_quantity}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminJTOrders;
