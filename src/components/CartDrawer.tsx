import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Minus, Trash2, ShoppingBag, Loader2, Ticket, X, Check } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { trackBeginCheckout } from "@/utils/analytics";
import CheckoutForm from "@/components/CheckoutForm";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN').format(price) + '₫';
};

interface AppliedCoupon {
  code: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  discountAmount: number;
}

const CartDrawer = () => {
  const { items, isOpen, closeCart, updateQuantity, removeItem, totalItems, totalPrice, clearCart } = useCart();
  const { toast } = useToast();
  const { data: siteSettings } = useSiteSettings();
  const [couponCode, setCouponCode] = useState("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [quantityInputs, setQuantityInputs] = useState<Record<string | number, string>>({});
  
  const freeShippingThreshold = parseInt(siteSettings?.free_shipping_threshold || "300000");
  const amountToFreeShipping = Math.max(0, freeShippingThreshold - totalPrice);
  const hasFreeShipping = totalPrice >= freeShippingThreshold;

  // Calculate discount
  const discountAmount = appliedCoupon?.discountAmount || 0;
  const finalPrice = Math.max(0, totalPrice - discountAmount);

  const applyCoupon = async () => {
    if (!couponCode.trim()) {
      toast({
        variant: "destructive",
        title: "Vui lòng nhập mã giảm giá",
      });
      return;
    }

    setIsApplyingCoupon(true);
    try {
      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;

      if (!coupon) {
        toast({
          variant: "destructive",
          title: "Mã giảm giá không hợp lệ",
          description: "Mã không tồn tại hoặc đã hết hạn.",
        });
        return;
      }

      // Check expiration
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        toast({
          variant: "destructive",
          title: "Mã giảm giá đã hết hạn",
        });
        return;
      }

      // Check max uses
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        toast({
          variant: "destructive",
          title: "Mã giảm giá đã hết lượt sử dụng",
        });
        return;
      }

      // Check minimum order amount
      if (coupon.min_order_amount && totalPrice < coupon.min_order_amount) {
        toast({
          variant: "destructive",
          title: "Đơn hàng chưa đạt giá trị tối thiểu",
          description: `Đơn hàng phải từ ${formatPrice(coupon.min_order_amount)} trở lên.`,
        });
        return;
      }

      // Calculate discount
      let calculatedDiscount = 0;
      if (coupon.discount_type === "percentage") {
        calculatedDiscount = Math.round((totalPrice * coupon.discount_value) / 100);
      } else {
        calculatedDiscount = coupon.discount_value;
      }
      calculatedDiscount = Math.min(calculatedDiscount, totalPrice);

      setAppliedCoupon({
        code: coupon.code,
        discount_type: coupon.discount_type as "percentage" | "fixed",
        discount_value: coupon.discount_value,
        discountAmount: calculatedDiscount,
      });

      toast({
        title: "Áp dụng mã thành công!",
        description: `Bạn được giảm ${formatPrice(calculatedDiscount)}`,
      });
      setCouponCode("");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Không xác định";
      toast({
        variant: "destructive",
        title: "Lỗi khi áp dụng mã giảm giá",
        description: errorMessage.includes("network") || errorMessage.includes("fetch")
          ? "Vui lòng kiểm tra kết nối mạng và thử lại"
          : "Vui lòng thử lại sau",
      });
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    toast({
      title: "Đã hủy mã giảm giá",
    });
  };

  const handleCheckout = () => {
    if (items.length === 0) return;
    
    // Track begin checkout
    trackBeginCheckout({
      value: finalPrice,
      items: items.map((item) => ({
        id: String(item.id),
        name: item.name,
        price: item.salePrice ?? item.price,
        quantity: item.quantity,
      })),
    });
    
    // Open CheckoutForm for both guest and authenticated users
    setIsCheckoutOpen(true);
  };

  return (
    <Sheet open={isOpen} onOpenChange={closeCart}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader className="border-b border-border pb-4">
          <SheetTitle className="text-xl font-serif">Giỏ hàng</SheetTitle>
          <SheetDescription className="sr-only">
            Xem và quản lý các sản phẩm trong giỏ hàng của bạn
          </SheetDescription>
        </SheetHeader>

        {/* Free Shipping Progress */}
        <div className="py-4 border-b border-border">
          {hasFreeShipping ? (
            <p className="text-sm text-green-600 font-medium">
              🎉 Bạn được miễn phí vận chuyển!
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">
                Bạn cần mua thêm <span className="text-primary font-semibold">{formatPrice(amountToFreeShipping)}</span> để được miễn phí vận chuyển
              </p>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary rounded-full transition-all"
                  style={{ width: `${Math.min((totalPrice / freeShippingThreshold) * 100, 100)}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto py-4">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <ShoppingBag className="w-16 h-16 text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">Chưa có sản phẩm trong giỏ hàng...</p>
              <Button variant="outline" onClick={closeCart} asChild>
                <Link to="/products">Trở về trang sản phẩm</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const itemPrice = item.salePrice ?? item.price;
                return (
                  <div key={item.id} className="flex gap-4 p-3 bg-muted/30 rounded-lg">
                    <Link to={`/product/${item.slug}`} onClick={closeCart}>
                      <img
                        src={item.image}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link 
                        to={`/product/${item.slug}`} 
                        onClick={closeCart}
                        className="font-medium text-foreground hover:text-primary transition-colors line-clamp-2 text-sm"
                      >
                        {item.name}
                      </Link>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-primary font-semibold">
                          {formatPrice(itemPrice)}
                        </span>
                        {item.salePrice && (
                          <span className="text-xs text-muted-foreground line-through">
                            {formatPrice(item.price)}
                          </span>
                        )}
                      </div>
                      
                      {/* Quantity Controls */}
                      <div className="flex items-center justify-between mt-2 gap-2">
                        <div className="flex items-center border border-border rounded-lg overflow-hidden">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="p-2 min-h-[44px] min-w-[44px] hover:bg-muted transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                            aria-label={`Giảm số lượng ${item.name}, hiện tại ${item.quantity}`}
                          >
                            <Minus className="w-4 h-4" aria-hidden="true" />
                          </button>
                          <input
                            type="number"
                            min="1"
                            value={quantityInputs[item.id] ?? item.quantity}
                            onChange={(e) => {
                              const value = e.target.value;
                              setQuantityInputs(prev => ({ ...prev, [item.id]: value }));
                            }}
                            onBlur={(e) => {
                              const value = parseInt(e.target.value) || 1;
                              const finalValue = Math.max(1, value);
                              setQuantityInputs(prev => {
                                const newState = { ...prev };
                                delete newState[item.id];
                                return newState;
                              });
                              if (finalValue !== item.quantity) {
                                updateQuantity(item.id, finalValue);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            className="w-16 text-center text-sm font-medium border-x border-border py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-primary focus:ring-inset"
                            aria-label={`Số lượng: ${item.quantity}`}
                          />
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="p-2 min-h-[44px] min-w-[44px] hover:bg-muted transition-colors flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-1"
                            aria-label={`Tăng số lượng ${item.name}, hiện tại ${item.quantity}`}
                          >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-1"
                          aria-label={`Xóa sản phẩm ${item.name} khỏi giỏ hàng`}
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-border pt-4 space-y-4">
            {/* Coupon Input */}
            <div className="space-y-2">
              {appliedCoupon ? (
                <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-400">
                      {appliedCoupon.code}
                    </span>
                    <span className="text-sm text-green-600">
                      (-{appliedCoupon.discount_type === "percentage" 
                        ? `${appliedCoupon.discount_value}%` 
                        : formatPrice(appliedCoupon.discount_value)})
                    </span>
                  </div>
                  <button
                    onClick={removeCoupon}
                    className="p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-1"
                    aria-label="Xóa mã giảm giá"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Nhập mã giảm giá"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="pl-10 uppercase"
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                    />
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={applyCoupon}
                    disabled={isApplyingCoupon}
                  >
                    {isApplyingCoupon ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Áp dụng"
                    )}
                  </Button>
                </div>
              )}
            </div>

            {/* Price Summary */}
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Tạm tính:</span>
                <span>{formatPrice(totalPrice)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-green-600">
                  <span>Giảm giá:</span>
                  <span>-{formatPrice(discountAmount)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-lg font-semibold pt-2 border-t border-border">
                <span>TỔNG TIỀN:</span>
                <span className="text-primary">{formatPrice(finalPrice)}</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={closeCart} asChild>
                <Link to="/products">Tiếp tục mua</Link>
              </Button>
              <Button onClick={handleCheckout} className="gap-2">
                <ShoppingBag className="w-4 h-4" />
                Đặt hàng
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
      
      {/* Checkout Form Dialog */}
      <CheckoutForm
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        items={items}
        totalPrice={totalPrice}
        discountAmount={discountAmount}
        appliedCoupon={appliedCoupon}
      />
    </Sheet>
  );
};

export default CartDrawer;
