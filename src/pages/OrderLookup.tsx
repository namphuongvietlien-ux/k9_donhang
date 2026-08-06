import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Search, Loader2, Package, AlertCircle, CheckCircle2, XCircle, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import SEO from "@/components/SEO";
import { z } from "zod";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const lookupSchema = z.object({
  order_code: z.string().trim().optional(),
  customer_phone: z
    .string()
    .trim()
    .optional()
    .refine(
      (val) => !val || /^(0|\+84)[1-9][0-9]{8}$/.test(val),
      "Số điện thoại phải bắt đầu bằng 0 hoặc +84 và có đúng 10 số"
    ),
}).refine(
  (data) => (data.order_code && data.order_code.trim() !== "") || 
            (data.customer_phone && data.customer_phone.trim() !== ""),
  {
    message: "Vui lòng nhập ít nhất mã đơn hàng hoặc số điện thoại",
    path: ["order_code"], // Show error on order_code field
  }
);

type LookupFormData = z.infer<typeof lookupSchema>;

interface OrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  price: number;
  quantity: number;
  shipping_fee: number | null;
}

interface Order {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  shipping_province: string | null;
  subtotal: number;
  shipping_fee: number;
  is_free_shipping: boolean;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const getStatusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return (
        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
          Chờ xác nhận
        </Badge>
      );
    case "confirmed":
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-300">
          Đã xác nhận
        </Badge>
      );
    case "shipping":
      return (
        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-300">
          Đang giao
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
          Hoàn thành
        </Badge>
      );
    case "cancelled":
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
          Đã hủy
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const OrderLookup = () => {
  const [formData, setFormData] = useState<LookupFormData>({
    order_code: "",
    customer_phone: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LookupFormData, string>>>({});
  const [isSearching, setIsSearching] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof LookupFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (error) {
      setError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    setOrders([]);
    setSelectedOrderId(null);
    setOrderItems({});

    // Validate form
    const validationResult = lookupSchema.safeParse(formData);
    if (!validationResult.success) {
      const fieldErrors: Partial<Record<keyof LookupFormData, string>> = {};
      validationResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as keyof LookupFormData] = err.message;
        } else if (err.message.includes("ít nhất")) {
          // Show error on both fields if neither is provided
          fieldErrors.order_code = err.message;
          fieldErrors.customer_phone = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSearching(true);

    try {
      // Normalize inputs
      const normalizedOrderCode = formData.order_code?.trim().toUpperCase() || null;
      const normalizedPhone = formData.customer_phone?.trim().replace(/\s+/g, "") || null;

      // Call SQL function to lookup order(s)
      const { data: orderData, error: orderError } = await supabase.rpc("lookup_guest_order", {
        p_order_code: normalizedOrderCode,
        p_customer_phone: normalizedPhone,
      });

      if (orderError) {
        if (orderError.message.includes("not found") || orderError.message.includes("Order")) {
          setError("Không tìm thấy đơn hàng. Vui lòng kiểm tra lại thông tin.");
        } else {
          setError(orderError.message || "Không thể tra cứu đơn hàng. Vui lòng thử lại sau.");
        }
        return;
      }

      if (!orderData || orderData.length === 0) {
        setError("Không tìm thấy đơn hàng. Vui lòng kiểm tra lại thông tin.");
        return;
      }

      const foundOrders = orderData as Order[];
      setOrders(foundOrders);
      
      // If only one order, auto-select it
      if (foundOrders.length === 1) {
        setSelectedOrderId(foundOrders[0].id);
        // Fetch order items for the single order
        const { data: itemsData, error: itemsError } = await supabase.rpc("lookup_guest_order_items", {
          p_order_id: foundOrders[0].id,
        });
        if (!itemsError && itemsData) {
          setOrderItems({ [foundOrders[0].id]: itemsData });
        }
      } else {
        // Multiple orders found, user needs to select one
        setSelectedOrderId(null);
      }
    } catch (err: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error looking up order:", err);
      }
      setError(err.message || "Đã xảy ra lỗi. Vui lòng thử lại sau.");
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO
        title="Tra cứu đơn hàng | Tăm Nhựa Vinon"
        description="Tra cứu đơn hàng của bạn bằng mã đơn hàng và số điện thoại"
      />
      <SpiceHeader />

      <main className="flex-1 pt-24 sm:pt-32 pb-8 sm:pb-12">
        <div className="container mx-auto px-3 sm:px-4 max-w-4xl">
          <div className="mb-6 sm:mb-8 text-center px-2 sm:px-0">
            <h1 className="text-2xl sm:text-3xl font-serif font-bold mb-2">Tra cứu đơn hàng</h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Nhập mã đơn hàng <strong>hoặc</strong> số điện thoại để xem thông tin đơn hàng của bạn
            </p>
          </div>

          {/* Lookup Form */}
          <Card className="mb-4 sm:mb-6">
            <CardHeader className="pb-3 sm:pb-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Search className="w-4 h-4 sm:w-5 sm:h-5" />
                Thông tin tra cứu
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="order_code">
                    Mã đơn hàng
                  </Label>
                  <Input
                    id="order_code"
                    value={formData.order_code}
                    onChange={(e) => handleInputChange("order_code", e.target.value.toUpperCase())}
                    placeholder="VD: VN20250101000001 (không bắt buộc)"
                    className={errors.order_code ? "border-red-500" : ""}
                    disabled={isSearching}
                  />
                  {errors.order_code && (
                    <p className="text-sm text-red-500">{errors.order_code}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Nhập mã đơn hàng nếu bạn có
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_phone">
                    Số điện thoại
                  </Label>
                  <Input
                    id="customer_phone"
                    value={formData.customer_phone}
                    onChange={(e) => handleInputChange("customer_phone", e.target.value)}
                    placeholder="VD: 0123456789 hoặc +84123456789 (không bắt buộc)"
                    className={errors.customer_phone ? "border-red-500" : ""}
                    disabled={isSearching}
                  />
                  {errors.customer_phone && (
                    <p className="text-sm text-red-500">{errors.customer_phone}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Số điện thoại bạn đã sử dụng khi đặt hàng. <strong>Nhập ít nhất 1 trong 2 thông tin trên.</strong>
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isSearching}>
                  {isSearching ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang tìm kiếm...
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4 mr-2" />
                      Tra cứu đơn hàng
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Multiple Orders List */}
          {orders.length > 1 && !selectedOrderId && (
            <Card className="mb-4 sm:mb-6">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                  <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                  Tìm thấy {orders.length} đơn hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <p className="text-sm text-muted-foreground mb-4">
                  Vui lòng chọn đơn hàng bạn muốn xem chi tiết:
                </p>
                <div className="space-y-3">
                  {orders.map((order) => (
                    <Card
                      key={order.id}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedOrderId(order.id);
                        // Fetch order items when selected
                        supabase.rpc("lookup_guest_order_items", {
                          p_order_id: order.id,
                        }).then(({ data, error }) => {
                          if (!error && data) {
                            setOrderItems((prev) => ({ ...prev, [order.id]: data }));
                          }
                        });
                      }}
                    >
                      <CardContent className="p-3 sm:p-4">
                        <div className="flex items-center justify-between gap-2 sm:gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm sm:text-base truncate">{order.order_code}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {format(new Date(order.created_at), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })}
                            </p>
                            <p className="text-xs sm:text-sm font-medium mt-1">
                              {formatPrice(order.total_amount)}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                            {getStatusBadge(order.status)}
                            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-muted-foreground" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Order Details */}
          {orders.length > 0 && (orders.length === 1 || selectedOrderId) && (() => {
            const order = orders.length === 1 ? orders[0] : orders.find(o => o.id === selectedOrderId);
            const items = selectedOrderId ? orderItems[selectedOrderId] || [] : orderItems[order?.id || ''] || [];
            
            if (!order) return null;
            
            return (
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Package className="w-4 h-4 sm:w-5 sm:h-5" />
                    Chi tiết đơn hàng
                  </CardTitle>
                  <div className="flex-shrink-0">{getStatusBadge(order.status)}</div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4 sm:space-y-6">
                {/* Order Info */}
                <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Mã đơn hàng</p>
                    <p className="font-semibold text-base sm:text-lg break-all">{order.order_code}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Ngày đặt hàng</p>
                    <p className="font-medium text-sm sm:text-base">
                      {format(new Date(order.created_at), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Tên khách hàng</p>
                    <p className="font-medium text-sm sm:text-base break-words">{order.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-1">Số điện thoại</p>
                    <p className="font-medium text-sm sm:text-base">{order.customer_phone}</p>
                  </div>
                  {order.customer_address && (
                    <div className="md:col-span-2">
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">Địa chỉ nhận hàng</p>
                      <p className="font-medium text-sm sm:text-base break-words">{order.customer_address}</p>
                    </div>
                  )}
                  {order.shipping_province && (
                    <div>
                      <p className="text-xs sm:text-sm text-muted-foreground mb-1">Tỉnh/Thành phố</p>
                      <p className="font-medium text-sm sm:text-base">{order.shipping_province}</p>
                    </div>
                  )}
                </div>

                {/* Order Items */}
                {items.length > 0 && (
                  <div className="border-t pt-3 sm:pt-4">
                    <h3 className="font-semibold mb-3 sm:mb-4 text-sm sm:text-base">Sản phẩm đã đặt</h3>
                    <div className="space-y-2 sm:space-y-3">
                      {items.map((item) => (
                        <div key={item.id} className="flex gap-2 sm:gap-4 items-center p-2 sm:p-3 bg-muted/30 rounded-lg">
                          {item.product_image && (
                            <img
                              src={item.product_image}
                              alt={item.product_name}
                              className="w-12 h-12 sm:w-16 sm:h-16 object-cover rounded-lg flex-shrink-0"
                            />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm sm:text-base truncate">{item.product_name}</p>
                            <p className="text-xs sm:text-sm text-muted-foreground">
                              {formatPrice(item.price)} x {item.quantity}
                            </p>
                          </div>
                          <p className="font-semibold text-primary text-sm sm:text-base flex-shrink-0 whitespace-nowrap">
                            {formatPrice(item.price * item.quantity)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Order Summary */}
                <div className="border-t pt-3 sm:pt-4 space-y-2">
                  <div className="flex justify-between text-xs sm:text-sm">
                    <span>Tạm tính:</span>
                    <span className="font-medium">{formatPrice(order.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs sm:text-sm items-center">
                    <span>Phí vận chuyển:</span>
                    <span>
                      {order.is_free_shipping ? (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 text-xs">
                          Miễn phí
                        </Badge>
                      ) : (
                        <span className="font-medium">{formatPrice(order.shipping_fee)}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between text-base sm:text-lg font-semibold pt-2 border-t">
                    <span>Tổng tiền:</span>
                    <span className="text-primary">{formatPrice(order.total_amount)}</span>
                  </div>
                </div>

                {/* Notes */}
                {order.notes && (
                  <div className="border-t pt-4">
                    <p className="text-sm text-muted-foreground mb-1">Ghi chú:</p>
                    <p className="text-sm">{order.notes}</p>
                  </div>
                )}

                {/* Actions */}
                <div className="border-t pt-4 flex flex-col sm:flex-row gap-2 sm:gap-3">
                  {orders.length > 1 && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSelectedOrderId(null);
                        setOrderItems({});
                      }} 
                      className="w-full sm:flex-1 text-sm sm:text-base"
                    >
                      <span className="hidden sm:inline">Xem danh sách đơn hàng</span>
                      <span className="sm:hidden">Danh sách đơn hàng</span>
                    </Button>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setOrders([]);
                      setSelectedOrderId(null);
                      setOrderItems({});
                      setFormData({ order_code: "", customer_phone: "" });
                      setError(null);
                    }} 
                    className="w-full sm:flex-1 text-sm sm:text-base"
                  >
                    <span className="hidden sm:inline">Tra cứu đơn hàng khác</span>
                    <span className="sm:hidden">Tra cứu khác</span>
                  </Button>
                  <Button asChild className="w-full sm:flex-1 text-sm sm:text-base">
                    <Link to="/products">Tiếp tục mua sắm</Link>
                  </Button>
                </div>

                {/* Info for authenticated users */}
                <Alert className="bg-blue-50 border-blue-200">
                  <CheckCircle2 className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-800">
                    <strong>Lưu ý:</strong> Nếu bạn đã có tài khoản,{" "}
                    <Link to="/auth" className="underline font-medium">
                      đăng nhập
                    </Link>{" "}
                    để xem tất cả đơn hàng của bạn trong một nơi.
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
            );
          })()}

          {/* Help Section */}
          {orders.length === 0 && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-lg">Cần hỗ trợ?</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    • Mã đơn hàng được gửi đến email/SMS sau khi đặt hàng thành công
                  </p>
                  <p>
                    • Số điện thoại phải khớp với số bạn đã sử dụng khi đặt hàng
                  </p>
                  <p>
                    • Nếu không tìm thấy đơn hàng, vui lòng liên hệ hotline:{" "}
                    <a href="tel:0372777911" className="text-primary hover:underline font-medium">
                      0372777911
                    </a>
                  </p>
                  <p>
                    • Bạn có thể{" "}
                    <Link to="/auth" className="text-primary hover:underline font-medium">
                      đăng ký tài khoản
                    </Link>{" "}
                    để quản lý đơn hàng dễ dàng hơn
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      <SpiceFooter />
    </div>
  );
};

export default OrderLookup;

