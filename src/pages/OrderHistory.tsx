import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Package, ChevronDown, ChevronUp, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import SEO from "@/components/SEO";

interface OrderItem {
  id: string;
  product_name: string;
  product_slug: string | null;
  product_image: string | null;
  price: number;
  quantity: number;
}

interface Order {
  id: string;
  customer_name: string;
  total_amount: number;
  status: string;
  created_at: string;
  notes: string | null;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const getStatusBadge = (status: string) => {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-300">Chờ xác nhận</Badge>;
    case "confirmed":
      return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-300">Đã xác nhận</Badge>;
    case "shipping":
      return <Badge variant="outline" className="bg-purple-100 text-purple-800 border-purple-300">Đang giao</Badge>;
    case "completed":
      return <Badge variant="outline" className="bg-green-100 text-green-800 border-green-300">Hoàn thành</Badge>;
    case "cancelled":
      return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-300">Đã hủy</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

const OrderHistory = () => {
  const { user, loading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderItems, setOrderItems] = useState<Record<string, OrderItem[]>>({});
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && user) {
      fetchOrders();
    } else if (!authLoading && !user) {
      setLoading(false);
    }
  }, [user, authLoading]);

  const fetchOrders = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    try {
      // Filter orders by user_id for authenticated users
      const { data: ordersData, error: ordersError } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id) // Filter by user_id
        .order("created_at", { ascending: false });

      if (ordersError) throw ordersError;
      setOrders(ordersData || []);
    } catch (error) {
      // Error handled silently
    } finally {
      setLoading(false);
    }
  };

  const fetchOrderItems = async (orderId: string) => {
    if (orderItems[orderId]) return;

    try {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (error) throw error;
      setOrderItems((prev) => ({ ...prev, [orderId]: data || [] }));
    } catch (error) {
      // Error handled silently
    }
  };

  const toggleOrderExpand = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
      fetchOrderItems(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SpiceHeader />
        <main className="flex-1 pt-32 pb-12">
          <div className="container mx-auto px-4">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SEO title="Lịch sử đơn hàng | Gia Vị Việt" description="Xem lịch sử đơn hàng của bạn" />
        <SpiceHeader />
        <main className="flex-1 pt-32 pb-12 flex items-center justify-center">
          <div className="text-center">
            <ShoppingBag className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h1 className="text-2xl font-serif font-bold mb-2">Bạn chưa đăng nhập</h1>
            <p className="text-muted-foreground mb-4">
              Vui lòng đăng nhập để xem lịch sử đơn hàng của bạn. 
              Nếu bạn đã đặt hàng mà chưa có tài khoản, vui lòng liên hệ hotline để tra cứu đơn hàng.
            </p>
            <div className="flex gap-3 justify-center">
              <Button asChild>
                <Link to="/auth">Đăng nhập / Đăng ký</Link>
              </Button>
            </div>
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Lịch sử đơn hàng | Gia Vị Việt" description="Xem lịch sử đơn hàng của bạn" />
      <SpiceHeader />

      <main className="flex-1 pt-32 pb-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold mb-8">Lịch sử đơn hàng</h1>

          {orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
              <h2 className="text-xl font-medium mb-2">Chưa có đơn hàng nào</h2>
              <p className="text-muted-foreground mb-4">Bạn chưa đặt đơn hàng nào</p>
              <Button asChild>
                <Link to="/products">Mua sắm ngay</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {orders.map((order) => {
                const isExpanded = expandedOrders.has(order.id);
                const items = orderItems[order.id] || [];

                return (
                  <Card key={order.id}>
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => toggleOrderExpand(order.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Package className="w-8 h-8 text-primary" />
                          <div>
                            <CardTitle className="text-lg">
                              Đơn hàng #{order.id.slice(0, 8).toUpperCase()}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              {format(new Date(order.created_at), "dd/MM/yyyy 'lúc' HH:mm", { locale: vi })}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          {getStatusBadge(order.status)}
                          <span className="font-semibold text-primary">
                            {formatPrice(order.total_amount)}
                          </span>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>

                    {isExpanded && (
                      <CardContent className="border-t">
                        <div className="pt-4 space-y-3">
                          {items.length === 0 ? (
                            <div className="flex gap-2">
                              <Skeleton className="w-16 h-16" />
                              <div className="flex-1">
                                <Skeleton className="h-4 w-3/4 mb-2" />
                                <Skeleton className="h-4 w-1/4" />
                              </div>
                            </div>
                          ) : (
                            items.map((item) => (
                              <div key={item.id} className="flex gap-4 items-center">
                                {item.product_image && (
                                  <img
                                    src={item.product_image}
                                    alt={item.product_name}
                                    className="w-16 h-16 object-cover rounded-lg"
                                  />
                                )}
                                <div className="flex-1">
                                  <p className="font-medium">{item.product_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatPrice(item.price)} x {item.quantity}
                                  </p>
                                </div>
                                <p className="font-semibold text-primary">
                                  {formatPrice(item.price * item.quantity)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>

                        {order.notes && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-muted-foreground">
                              <span className="font-medium">Ghi chú:</span> {order.notes}
                            </p>
                          </div>
                        )}
                      </CardContent>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <SpiceFooter />
    </div>
  );
};

export default OrderHistory;
