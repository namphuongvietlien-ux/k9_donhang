import { useState, useEffect, useMemo } from "react";
import { X, Loader2, Check, ShoppingBag, AlertTriangle } from "lucide-react";
import { useCart, CartItem } from "@/contexts/CartContext";
import { supabase } from "@/integrations/supabase/client";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useProvinces } from "@/hooks/useProvinces";
import { useShippingFee } from "@/hooks/useShippingFee";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { z } from "zod";
import { cn } from "@/lib/utils";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const checkoutFormSchema = z.object({
  customer_name: z.string().trim().min(1, "Vui lòng nhập tên").max(100, "Tên không được quá 100 ký tự"),
  customer_phone: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập số điện thoại")
    .regex(
      /^(0|\+84)[1-9][0-9]{8}$/,
      "Số điện thoại phải bắt đầu bằng 0 hoặc +84 và có đúng 10 số (đầu số Việt Nam)"
    ),
  customer_address: z.string().trim().min(1, "Vui lòng nhập địa chỉ").max(500, "Địa chỉ không được quá 500 ký tự"),
  customer_province_code: z.string().min(1, "Vui lòng chọn tỉnh/thành phố"),
});

type CheckoutFormData = z.infer<typeof checkoutFormSchema>;

interface CheckoutFormProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
  totalPrice: number;
  discountAmount?: number;
  appliedCoupon?: { code: string } | null;
}

const CheckoutForm = ({ isOpen, onClose, items, totalPrice, discountAmount = 0, appliedCoupon = null }: CheckoutFormProps) => {
  const [formData, setFormData] = useState<CheckoutFormData>({
    customer_name: "",
    customer_phone: "",
    customer_address: "",
    customer_province_code: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCode, setOrderCode] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();
  const { clearCart } = useCart();
  const { data: siteSettings } = useSiteSettings();
  const { data: provinces = [], isLoading: isLoadingProvinces } = useProvinces();

  // Calculate total weight from items (kg)
  // Also track which items don't have weight
  const { totalWeight, itemsWithoutWeight } = useMemo(() => {
    let total = 0;
    const missingWeight: string[] = [];
    
    items.forEach((item) => {
      if (item.weight === null || item.weight === undefined) {
        // Default to 0.5kg if not set (more realistic than 0.1kg)
        total += 0.5 * item.quantity;
        missingWeight.push(item.name);
      } else {
        total += item.weight * item.quantity;
      }
    });
    
    return { 
      totalWeight: total, 
      itemsWithoutWeight: missingWeight 
    };
  }, [items]);

  // Get shipping province from settings
  const fromProvinceCode = siteSettings?.shipping_province_code || "HCM";
  const defaultShippingFee = parseInt(siteSettings?.default_shipping_fee || "30000");

  // Calculate SPX Express shipping fee
  const { 
    data: shippingFeeResult, 
    isLoading: isLoadingShippingFee,
    error: shippingFeeError 
  } = useShippingFee(
    formData.customer_province_code && totalWeight > 0
      ? {
          weight: totalWeight,
          fromProvinceCode: fromProvinceCode,
          toProvinceCode: formData.customer_province_code,
        }
      : null
  );
  
  // Extract fee from result (handle both old format (number) and new format (object) for backward compatibility)
  const spxShippingFee = shippingFeeResult?.fee ?? (typeof shippingFeeResult === 'number' ? shippingFeeResult : null);

  // Calculate subtotal
  const globalFreeShippingThreshold = parseInt(siteSettings?.free_shipping_threshold || "300000");
  const subtotal = Math.max(0, totalPrice - discountAmount);

  // Determine shipping fee
  // If weight exceeds 17kg, spxShippingFee will be null (admin will handle manually)
  // Otherwise, use SPX Express fee or check free shipping threshold
  const exceedsWeightLimit = totalWeight > 17;
  const hasValidWeight = totalWeight > 0;
  const hasItemsWithoutWeight = itemsWithoutWeight.length > 0;
  
  // Use default shipping fee as fallback if SPX calculation fails
  const effectiveShippingFee = spxShippingFee !== null ? spxShippingFee : (shippingFeeError ? defaultShippingFee : null);
  const calculatedShippingFee = effectiveShippingFee !== null ? effectiveShippingFee : 0;
  const isFreeShipping = subtotal >= globalFreeShippingThreshold;
  const shippingFee = isFreeShipping ? 0 : calculatedShippingFee;
  const finalTotal = subtotal + shippingFee;
  
  // Block submission if weight exceeds 17kg or no valid weight
  const canSubmit = !exceedsWeightLimit && hasValidWeight && formData.customer_province_code;

  const handleInputChange = (field: keyof CheckoutFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Block submission if weight exceeds 17kg or weight is 0
    if (!canSubmit) {
      if (exceedsWeightLimit) {
        toast({
          variant: "destructive",
          title: "Không thể đặt hàng",
          description: "Đơn hàng vượt quá 17kg. Vui lòng liên hệ admin qua hotline 0372777911 để xử lý đơn hàng này.",
        });
      } else if (!hasValidWeight) {
        toast({
          variant: "destructive",
          title: "Không thể tính phí vận chuyển",
          description: hasItemsWithoutWeight 
            ? `Một số sản phẩm chưa có thông tin khối lượng. Vui lòng liên hệ admin để cập nhật.`
            : "Sản phẩm chưa có thông tin khối lượng. Vui lòng liên hệ admin.",
        });
      } else if (!formData.customer_province_code) {
        toast({
          variant: "destructive",
          title: "Vui lòng chọn tỉnh/thành phố",
          description: "Cần chọn tỉnh/thành phố để tính phí vận chuyển.",
        });
      }
      return;
    }

    // Validate form
    const validationResult = checkoutFormSchema.safeParse(formData);
    if (!validationResult.success) {
      const fieldErrors: Partial<Record<keyof CheckoutFormData, string>> = {};
      validationResult.error.errors.forEach((error) => {
        if (error.path[0]) {
          fieldErrors[error.path[0] as keyof CheckoutFormData] = error.message;
        }
      });
      setErrors(fieldErrors);
      toast({
        variant: "destructive",
        title: "Vui lòng kiểm tra lại thông tin",
        description: "Có lỗi trong form đặt hàng.",
      });
      return;
    }

    setIsSubmitting(true);

    try {
      // Validate stock quantity before creating order
      const stockValidationErrors: string[] = [];
      
      for (const item of items) {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("id, name, stock_quantity, unit_name")
          .eq("id", item.id)
          .single();
        
        if (productError || !product) {
          stockValidationErrors.push(`Không tìm thấy sản phẩm: ${item.name}`);
          continue;
        }
        
        const availableStock = product.stock_quantity ?? 0;
        const unitName = product.unit_name || "Sản phẩm";
        if (item.quantity > availableStock) {
          stockValidationErrors.push(
            `Sản phẩm "${item.name}": Số lượng đặt hàng (${item.quantity} ${unitName}) vượt quá số lượng tồn kho (${availableStock} ${unitName})`
          );
        }
      }
      
      if (stockValidationErrors.length > 0) {
        setIsSubmitting(false);
        toast({
          variant: "destructive",
          title: "Không thể đặt hàng",
          description: (
            <div className="space-y-1">
              <p className="font-semibold">Số lượng đặt hàng vượt quá tồn kho:</p>
              <ul className="list-disc list-inside text-sm">
                {stockValidationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          ),
        });
        return;
      }

      // Get current user (if authenticated)
      const { data: { user } } = await supabase.auth.getUser();

      // Create order (supports both guest and authenticated users)
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          user_id: user?.id || null, // Link to user account if authenticated, null for guest
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          customer_address: formData.customer_address,
          shipping_province: formData.customer_province_code,
          subtotal: subtotal,
          shipping_fee: shippingFee,
          is_free_shipping: isFreeShipping,
          total_amount: finalTotal,
          coupon_code: appliedCoupon?.code || null,
          discount_amount: discountAmount,
          status: "pending",
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map((item) => ({
        order_id: order.id,
        product_name: item.name,
        product_slug: item.slug,
        product_image: item.image,
        price: item.salePrice ?? item.price,
        quantity: item.quantity,
      }));

      const { error: itemsError } = await supabase.from("order_items").insert(orderItems);

      if (itemsError) throw itemsError;

      // Update coupon used_count if a coupon was applied
      if (appliedCoupon?.code) {
        await supabase.rpc("increment_coupon_usage", { coupon_code: appliedCoupon.code });
      }

      // Success!
      setOrderCode(order.order_code || order.id.substring(0, 8).toUpperCase());
      setIsSuccess(true);
      clearCart();
      
      toast({
        title: "Đặt hàng thành công!",
        description: `Mã đơn hàng: ${order.order_code || order.id.substring(0, 8).toUpperCase()}`,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error creating order:", error);
      }
      toast({
        variant: "destructive",
        title: "Đặt hàng thất bại",
        description: error.message || "Có lỗi xảy ra. Vui lòng thử lại sau.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSuccess) {
      // Reset form and close
      setFormData({
        customer_name: "",
        customer_phone: "",
        customer_address: "",
        customer_province_code: "",
      });
      setErrors({});
      setIsSuccess(false);
      setOrderCode(null);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Đặt hàng</DialogTitle>
          <DialogDescription>
            Vui lòng kiểm tra thông tin đơn hàng và điền đầy đủ thông tin nhận hàng bên dưới để hoàn tất đặt mua.
          </DialogDescription>
        </DialogHeader>

        {isSuccess ? (
          <div className="py-8 text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-2xl font-bold text-green-600 mb-2">Đặt hàng thành công!</h3>
            <p className="text-muted-foreground mb-4">
              Cảm ơn bạn đã đặt hàng. Chúng tôi sẽ liên hệ với bạn sớm nhất.
            </p>
            {orderCode && (
              <div className="bg-primary/10 rounded-lg p-4 mb-4">
                <p className="text-sm text-muted-foreground mb-1">Mã đơn hàng</p>
                <p className="text-2xl font-bold text-primary">{orderCode}</p>
              </div>
            )}
            <Button onClick={handleClose} className="mt-4">
              Đóng
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Order Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ShoppingBag className="w-5 h-5" />
                  Thông tin đơn hàng
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Sản phẩm ({items.length})</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-2 bg-muted rounded">
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatPrice(item.salePrice ?? item.price)} x {item.quantity}
                          </p>
                        </div>
                        <p className="text-sm font-medium">
                          {formatPrice((item.salePrice ?? item.price) * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Tạm tính:</span>
                    <span>{formatPrice(totalPrice)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-sm text-green-600">
                      <span>Giảm giá:</span>
                      <span>-{formatPrice(discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span>Phí vận chuyển:</span>
                    {isFreeShipping ? (
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300">
                        Miễn phí
                      </Badge>
                    ) : isLoadingShippingFee ? (
                      <span className="text-muted-foreground">Đang tính...</span>
                    ) : exceedsWeightLimit ? (
                      <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300">
                        Vượt quá 17kg
                      </Badge>
                    ) : effectiveShippingFee === null ? (
                      <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300">
                        Chưa tính được
                      </Badge>
                    ) : (
                      <span>
                        {formatPrice(shippingFee)}
                        {shippingFeeError && effectiveShippingFee === defaultShippingFee && (
                          <span className="text-xs text-muted-foreground ml-1">(mặc định)</span>
                        )}
                      </span>
                    )}
                  </div>
                  {exceedsWeightLimit && (
                    <Alert className="bg-red-50 border-red-300">
                      <AlertTriangle className="h-4 w-4 text-red-700" />
                      <AlertDescription className="text-red-800 text-sm font-semibold">
                        ⚠️ Không thể đặt hàng: Khối lượng đơn hàng ({totalWeight.toFixed(2)}kg) vượt quá giới hạn 17kg của SPX Express. 
                        Vui lòng liên hệ admin qua hotline <strong>0372777911</strong> để xử lý đơn hàng này.
                      </AlertDescription>
                    </Alert>
                  )}
                  {hasItemsWithoutWeight && (
                    <Alert className="bg-yellow-50 border-yellow-300">
                      <AlertTriangle className="h-4 w-4 text-yellow-700" />
                      <AlertDescription className="text-yellow-800 text-sm">
                        ⚠️ Cảnh báo: Một số sản phẩm chưa có thông tin khối lượng ({itemsWithoutWeight.slice(0, 3).join(", ")}{itemsWithoutWeight.length > 3 ? "..." : ""}). 
                        Đang sử dụng khối lượng mặc định 0.5kg cho các sản phẩm này. Vui lòng liên hệ admin để cập nhật thông tin chính xác.
                      </AlertDescription>
                    </Alert>
                  )}
                  {!hasValidWeight && !exceedsWeightLimit && (
                    <Alert className="bg-yellow-50 border-yellow-300">
                      <AlertTriangle className="h-4 w-4 text-yellow-700" />
                      <AlertDescription className="text-yellow-800 text-sm">
                        ⚠️ Cảnh báo: Không thể tính phí vận chuyển vì không có thông tin khối lượng. 
                        Vui lòng liên hệ admin.
                      </AlertDescription>
                    </Alert>
                  )}
                  {shippingFeeError && effectiveShippingFee === defaultShippingFee && (
                    <Alert className="bg-blue-50 border-blue-300">
                      <AlertTriangle className="h-4 w-4 text-blue-700" />
                      <AlertDescription className="text-blue-800 text-sm">
                        ℹ️ Đang sử dụng phí vận chuyển mặc định do không thể tính phí SPX Express.
                      </AlertDescription>
                    </Alert>
                  )}
                  {!isFreeShipping && subtotal < globalFreeShippingThreshold && spxShippingFee !== null && (
                    <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                      Mua thêm {formatPrice(globalFreeShippingThreshold - subtotal)} để được miễn phí vận chuyển
                    </div>
                  )}
                  {formData.customer_province_code && totalWeight > 0 && totalWeight <= 17 && (
                    <div className="text-xs text-muted-foreground">
                      Khối lượng: {totalWeight.toFixed(2)}kg | Phí SPX Express
                    </div>
                  )}
                  <div className="flex justify-between text-lg font-bold border-t pt-2">
                    <span>Tổng cộng:</span>
                    <span className="text-primary">{formatPrice(finalTotal)}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Customer Information Form */}
            <Card>
              <CardHeader>
                <CardTitle>Thông tin khách hàng</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="customer_name">
                    Họ và tên <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customer_name"
                    value={formData.customer_name}
                    onChange={(e) => handleInputChange("customer_name", e.target.value)}
                    placeholder="Nhập họ và tên"
                    className={cn(errors.customer_name && "border-red-500")}
                  />
                  {errors.customer_name && (
                    <p className="text-sm text-red-500">{errors.customer_name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_phone">
                    Số điện thoại <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="customer_phone"
                    value={formData.customer_phone}
                    onChange={(e) => handleInputChange("customer_phone", e.target.value)}
                    placeholder="Nhập số điện thoại (VD: 0912345678 hoặc +84912345678)"
                    className={cn(errors.customer_phone && "border-red-500")}
                  />
                  {errors.customer_phone && (
                    <p className="text-sm text-red-500">{errors.customer_phone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_address">
                    Địa chỉ <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="customer_address"
                    value={formData.customer_address}
                    onChange={(e) => handleInputChange("customer_address", e.target.value)}
                    placeholder="Nhập địa chỉ nhận hàng"
                    rows={3}
                    className={cn(errors.customer_address && "border-red-500")}
                  />
                  {errors.customer_address && (
                    <p className="text-sm text-red-500">{errors.customer_address}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_province_code">
                    Tỉnh/Thành phố <span className="text-red-500">*</span>
                  </Label>
                  <Select
                    value={formData.customer_province_code}
                    onValueChange={(value) => handleInputChange("customer_province_code", value)}
                  >
                    <SelectTrigger
                      id="customer_province_code"
                      className={cn(errors.customer_province_code && "border-red-500")}
                    >
                      <SelectValue placeholder="Chọn tỉnh/thành phố" />
                    </SelectTrigger>
                    <SelectContent>
                      {isLoadingProvinces ? (
                        <SelectItem value="loading" disabled>Đang tải...</SelectItem>
                      ) : (
                        provinces.map((province) => (
                          <SelectItem key={province.id} value={province.code}>
                            {province.name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {errors.customer_province_code && (
                    <p className="text-sm text-red-500">{errors.customer_province_code}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Submit Button */}
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={handleClose} className="flex-1">
                Hủy
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting || !canSubmit} 
                className="flex-1"
                title={!canSubmit ? (exceedsWeightLimit ? "Đơn hàng vượt quá 17kg, vui lòng liên hệ admin" : "Vui lòng điền đầy đủ thông tin") : ""}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Đặt hàng"
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CheckoutForm;

