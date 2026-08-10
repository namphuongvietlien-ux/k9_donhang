import { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Save, Zap, Package, Plus, Search, X, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useProducts } from "@/hooks/useProducts";
import ImageUploader from "@/components/admin/ImageUploader";
import DateTimePicker from "@/components/admin/DateTimePicker";
import { cn } from "@/lib/utils";

interface FlashSale {
  id: string;
  title: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  display_order: number;
  banner_image_url: string | null;
  products?: Array<{
    id: string;
    product_id: string;
    flash_sale_price: number | null;
    max_quantity: number | null;
    price_mask_enabled: boolean;
    price_mask_hide_first_digits: number;
  }>;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
  stock_quantity: number;
}

interface FlashSaleFormData {
  title: string;
  description: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
  display_order: number;
  banner_image_url: string;
  product_ids: string[];
  product_prices: Record<string, number | null>;
  product_max_quantities: Record<string, number | null>;
  product_price_masks: Record<string, { enabled: boolean; hideFirstDigits: number }>;
}

const AdminFlashSaleForm = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const isMountedRef = useRef(true);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [productPrices, setProductPrices] = useState<Record<string, number | null>>({});
  const [productMaxQuantities, setProductMaxQuantities] = useState<Record<string, number | null>>({});
  const [productPriceMasks, setProductPriceMasks] = useState<Record<string, { enabled: boolean; hideFirstDigits: number }>>({});
  const [editingFlashSale, setEditingFlashSale] = useState<FlashSale | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [productSearchQuery, setProductSearchQuery] = useState("");

  const [formData, setFormData] = useState<FlashSaleFormData>({
    title: "",
    description: "",
    discount_type: "percentage",
    discount_value: 0,
    starts_at: "",
    ends_at: "",
    is_active: true,
    display_order: 0,
    banner_image_url: "",
    product_ids: [],
    product_prices: {},
    product_max_quantities: {},
    product_price_masks: {},
  });

  const isEditing = !!id;

  // Prevent renders during unmount
  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      setIsNavigating(true);
    };
  }, []);

  // Fetch flash sale if editing
  useEffect(() => {
    if (id) {
      setIsLoading(true);
      const fetchFlashSale = async () => {
        const { data, error } = await supabase
          .from("flash_sales")
          .select(`
            *,
            products:flash_sale_products(
              id,
              product_id,
              flash_sale_price,
              max_quantity,
              price_mask_enabled,
              price_mask_hide_first_digits
            )
          `)
          .eq("id", id)
          .single();

        if (error) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể tải thông tin flash sale",
          });
          navigate("/admin/flash-sales");
          return;
        }

        if (data) {
          const flashSale = data as FlashSale;
          setEditingFlashSale(flashSale);
          
          const productIds = flashSale.products?.map((p) => p.product_id) || [];
          const prices: Record<string, number | null> = {};
          const maxQuantities: Record<string, number | null> = {};
          const priceMasks: Record<string, { enabled: boolean; hideFirstDigits: number }> = {};
          
          flashSale.products?.forEach((p) => {
            prices[p.product_id] = p.flash_sale_price;
            maxQuantities[p.product_id] = p.max_quantity;
            priceMasks[p.product_id] = {
              enabled: p.price_mask_enabled || false,
              hideFirstDigits: p.price_mask_hide_first_digits || 1,
            };
          });

          setFormData({
            title: flashSale.title,
            description: flashSale.description || "",
            discount_type: flashSale.discount_type as "percentage" | "fixed",
            discount_value: flashSale.discount_value,
            starts_at: format(new Date(flashSale.starts_at), "yyyy-MM-dd'T'HH:mm"),
            ends_at: format(new Date(flashSale.ends_at), "yyyy-MM-dd'T'HH:mm"),
            is_active: flashSale.is_active,
            display_order: flashSale.display_order,
            banner_image_url: flashSale.banner_image_url || "",
            product_ids: productIds,
            product_prices: prices,
            product_max_quantities: maxQuantities,
            product_price_masks: priceMasks,
          });
          setSelectedProducts(productIds);
          setProductPrices(prices);
          setProductMaxQuantities(maxQuantities);
          setProductPriceMasks(priceMasks);
        }
        setIsLoading(false);
      };
      fetchFlashSale();
    }
  }, [id, navigate, toast]);

  const { products: sharedProducts = [] } = useProducts();
  const allProducts = (sharedProducts as Product[]).filter((product) => {
    if (product.is_active === false) return false;
    if (!id) return (product.stock_quantity ?? 0) > 0;
    return true;
  });

  // Filter products based on search query (name or id)
  const filteredProductsForDialog = allProducts.filter((product) => {
    if (!productSearchQuery.trim()) return true;
    const query = productSearchQuery.toLowerCase();
    return (
      product.name.toLowerCase().includes(query) ||
      product.id.toLowerCase().includes(query) ||
      product.slug.toLowerCase().includes(query)
    );
  });

  const toggleProduct = (productId: string) => {
    if (selectedProducts.includes(productId)) {
      setSelectedProducts(selectedProducts.filter((id) => id !== productId));
      const newPrices = { ...productPrices };
      const newQuantities = { ...productMaxQuantities };
      const newMasks = { ...productPriceMasks };
      delete newPrices[productId];
      delete newQuantities[productId];
      delete newMasks[productId];
      setProductPrices(newPrices);
      setProductMaxQuantities(newQuantities);
      setProductPriceMasks(newMasks);
    } else {
      setSelectedProducts([...selectedProducts, productId]);
    }
  };

  const removeProduct = (productId: string) => {
    setSelectedProducts(selectedProducts.filter((id) => id !== productId));
    const newPrices = { ...productPrices };
    const newQuantities = { ...productMaxQuantities };
    const newMasks = { ...productPriceMasks };
    delete newPrices[productId];
    delete newQuantities[productId];
    delete newMasks[productId];
    setProductPrices(newPrices);
    setProductMaxQuantities(newQuantities);
    setProductPriceMasks(newMasks);
  };

  const getSelectedProductDetails = (productId: string) => {
    return allProducts.find((p) => p.id === productId);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isMountedRef.current || isNavigating) return;
    
    setIsSubmitting(true);

    try {
      // Validate
      if (!formData.title.trim()) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng nhập tiêu đề",
        });
        setIsSubmitting(false);
        return;
      }

      if (formData.discount_value <= 0) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Giá trị giảm giá phải lớn hơn 0",
        });
        setIsSubmitting(false);
        return;
      }

      // Validate datetime fields
      if (!formData.starts_at || !formData.ends_at) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng chọn thời gian bắt đầu và kết thúc",
        });
        setIsSubmitting(false);
        return;
      }

      const startsAtDate = new Date(formData.starts_at);
      const endsAtDate = new Date(formData.ends_at);
      
      if (isNaN(startsAtDate.getTime()) || isNaN(endsAtDate.getTime())) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Thời gian không hợp lệ",
        });
        setIsSubmitting(false);
        return;
      }

      if (endsAtDate <= startsAtDate) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Thời gian kết thúc phải sau thời gian bắt đầu",
        });
        setIsSubmitting(false);
        return;
      }

      if (selectedProducts.length === 0) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Vui lòng chọn ít nhất một sản phẩm",
        });
        setIsSubmitting(false);
        return;
      }

      // Validate: Chỉ kiểm tra stock của các sản phẩm MỚI được thêm vào (không phải sản phẩm đã có từ trước)
      const previousProductIds = editingFlashSale?.products?.map((p) => p.product_id) || [];
      const newProductIds = selectedProducts.filter((productId) => !previousProductIds.includes(productId));

      if (newProductIds.length > 0) {
        // Chỉ validate những sản phẩm mới được thêm vào
        const { data: newProductsData, error: stockCheckError } = await supabase
          .from("products")
          .select("id, name, stock_quantity")
          .in("id", newProductIds);

        if (stockCheckError) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể kiểm tra tồn kho sản phẩm",
          });
          setIsSubmitting(false);
          return;
        }

        // Kiểm tra xem có sản phẩm MỚI nào hết hàng không (stock <= 0)
        const outOfStockProducts = newProductsData?.filter(
          (p) => !p.stock_quantity || p.stock_quantity <= 0
        );

        if (outOfStockProducts && outOfStockProducts.length > 0) {
          const productNames = outOfStockProducts.map((p) => p.name).join(", ");
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: `Các sản phẩm sau đã hết hàng và không thể thêm vào Flash Sale: ${productNames}. Vui lòng bỏ chọn các sản phẩm này.`,
          });
          setIsSubmitting(false);
          return;
        }
      }

      let flashSaleId: string;

      // Convert datetime-local format to ISO string with timezone
      const startsAtISO = startsAtDate.toISOString();
      const endsAtISO = endsAtDate.toISOString();

      if (isEditing && editingFlashSale) {
        // Update flash sale
        const { data, error } = await supabase
          .from("flash_sales")
          .update({
            title: formData.title,
            description: formData.description || null,
            discount_type: formData.discount_type,
            discount_value: formData.discount_value,
            starts_at: startsAtISO,
            ends_at: endsAtISO,
            is_active: formData.is_active,
            display_order: formData.display_order,
            banner_image_url: formData.banner_image_url || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingFlashSale.id)
          .select()
          .single();

        if (error) throw error;
        flashSaleId = data.id;

        // Delete existing products
        await supabase
          .from("flash_sale_products")
          .delete()
          .eq("flash_sale_id", flashSaleId);
      } else {
        // Create flash sale
        const insertData = {
          title: formData.title,
          description: formData.description || null,
          discount_type: formData.discount_type,
          discount_value: formData.discount_value,
          starts_at: startsAtISO,
          ends_at: endsAtISO,
          is_active: formData.is_active,
          display_order: formData.display_order,
          banner_image_url: formData.banner_image_url || null,
        };
        
        const { data, error } = await supabase
          .from("flash_sales")
          .insert(insertData)
          .select()
          .single();

        if (error) {
          setIsSubmitting(false);
          throw error;
        }
        flashSaleId = data.id;
      }

      // Add products
      const productsToInsert = selectedProducts.map((productId) => {
        const mask = productPriceMasks[productId] || { enabled: false, hideFirstDigits: 1 };
        return {
          flash_sale_id: flashSaleId,
          product_id: productId,
          flash_sale_price: productPrices[productId] || null,
          max_quantity: productMaxQuantities[productId] || null,
          price_mask_enabled: mask.enabled,
          price_mask_hide_first_digits: mask.hideFirstDigits,
        };
      });

      if (productsToInsert.length > 0) {
        const { error: productsError } = await supabase
          .from("flash_sale_products")
          .insert(productsToInsert);

        if (productsError) throw productsError;
      }

      if (!isMountedRef.current || isNavigating) return;

      toast({
        title: "Thành công",
        description: isEditing ? "Đã cập nhật flash sale" : "Đã tạo flash sale",
      });

      queryClient.invalidateQueries({ queryKey: ["flash-sales"] });
      navigate("/admin/flash-sales");
    } catch (error: any) {
      if (!isMountedRef.current || isNavigating) return;
      
      let errorMessage = "Không thể lưu flash sale";
      if (error?.message) {
        errorMessage = error.message;
      } else if (error?.details) {
        errorMessage = error.details;
      } else if (error?.hint) {
        errorMessage = error.hint;
      }
      
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: errorMessage,
      });
    } finally {
      if (isMountedRef.current && !isNavigating) {
        setIsSubmitting(false);
      }
    }
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <SEO title={isEditing ? "Chỉnh sửa Flash Sale" : "Tạo Flash Sale mới"} />
        <div className="p-6 space-y-4">
          <div className="h-8 w-64 bg-muted animate-pulse rounded" />
          <div className="h-96 bg-muted animate-pulse rounded" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <SEO title={isEditing ? "Chỉnh sửa Flash Sale" : "Tạo Flash Sale mới"} />
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/admin/flash-sales")}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Zap className="w-8 h-8 text-primary" />
              {isEditing ? "Chỉnh sửa Flash Sale" : "Tạo Flash Sale mới"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isEditing
                ? "Cập nhật thông tin flash sale"
                : "Tạo chương trình flash sale mới cho sản phẩm"}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Form */}
            <div className="lg:col-span-2 space-y-6">
              {/* Basic Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin cơ bản</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="title">Tiêu đề *</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) =>
                          setFormData({ ...formData, title: e.target.value })
                        }
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="display_order">Thứ tự hiển thị</Label>
                      <Input
                        id="display_order"
                        type="number"
                        value={formData.display_order}
                        onChange={(e) => {
                          const value = e.target.value;
                          const intValue = value === "" ? 0 : parseInt(value, 10);
                          setFormData({
                            ...formData,
                            display_order: isNaN(intValue) || !isFinite(intValue) ? 0 : intValue,
                          });
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Mô tả</Label>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) =>
                        setFormData({ ...formData, description: e.target.value })
                      }
                      rows={4}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Discount Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Thiết lập giảm giá</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="discount_type">Loại giảm giá</Label>
                      <Select
                        value={formData.discount_type}
                        onValueChange={(value: "percentage" | "fixed") =>
                          setFormData({ ...formData, discount_type: value })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percentage">Phần trăm (%)</SelectItem>
                          <SelectItem value="fixed">Số tiền cố định (₫)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="discount_value">
                        Giá trị giảm giá *
                        {formData.discount_type === "percentage" ? " (%)" : " (₫)"}
                      </Label>
                      <Input
                        id="discount_value"
                        type="number"
                        min="0"
                        step={formData.discount_type === "percentage" ? "1" : "1000"}
                        value={formData.discount_value}
                        onChange={(e) => {
                          const value = e.target.value;
                          const numValue = value === "" ? 0 : parseFloat(value);
                          setFormData({
                            ...formData,
                            discount_value: isNaN(numValue) || !isFinite(numValue) ? 0 : numValue,
                          });
                        }}
                        required
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Time Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Thời gian</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <DateTimePicker
                      id="starts_at"
                      label="Thời gian bắt đầu *"
                      value={formData.starts_at}
                      onChange={(value) =>
                        setFormData({ ...formData, starts_at: value })
                      }
                      required
                    />

                    <DateTimePicker
                      id="ends_at"
                      label="Thời gian kết thúc *"
                      value={formData.ends_at}
                      onChange={(value) =>
                        setFormData({ ...formData, ends_at: value })
                      }
                      required
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Product Selection */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Sản phẩm *</CardTitle>
                    <Button
                      type="button"
                      onClick={() => setIsProductDialogOpen(true)}
                      className="gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Thêm sản phẩm
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg">
                      <Package className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Chưa có sản phẩm nào. Nhấn "Thêm sản phẩm" để chọn sản phẩm cho Flash Sale.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {selectedProducts.map((productId) => {
                        const product = getSelectedProductDetails(productId);
                        if (!product) return null;

                        return (
                          <div
                            key={productId}
                            className="p-4 border rounded-lg space-y-3"
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="font-medium">{product.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    Mã: {product.id.substring(0, 8)}...
                                  </Badge>
                                  {product.stock_quantity <= 0 ? (
                                    <Badge variant="destructive" className="text-xs">
                                      <Package className="w-3 h-3 mr-1" />
                                      Hết hàng
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline" className="text-xs">
                                      <Package className="w-3 h-3 mr-1" />
                                      Còn {product.stock_quantity}
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm text-muted-foreground">
                                  Giá gốc: {new Intl.NumberFormat("vi-VN").format(product.price)}₫
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeProduct(productId)}
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-3 border-t">
                              <div>
                                <Label className="text-xs">Giá flash sale (₫)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  step="1000"
                                  value={productPrices[productId] || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "") {
                                      setProductPrices({
                                        ...productPrices,
                                        [productId]: null,
                                      });
                                    } else {
                                      const numValue = parseFloat(value);
                                      setProductPrices({
                                        ...productPrices,
                                        [productId]: isNaN(numValue) || !isFinite(numValue) || numValue < 0 ? null : numValue,
                                      });
                                    }
                                  }}
                                  placeholder="Tự động tính"
                                  className="text-sm"
                                />
                                <p className="text-xs text-muted-foreground mt-1">
                                  Để trống dùng giá tính toán
                                </p>
                              </div>
                              <div>
                                <Label className="text-xs">Số lượng tối đa mỗi khách</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={productMaxQuantities[productId] || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "") {
                                      setProductMaxQuantities({
                                        ...productMaxQuantities,
                                        [productId]: null,
                                      });
                                    } else {
                                      const intValue = parseInt(value, 10);
                                      setProductMaxQuantities({
                                        ...productMaxQuantities,
                                        [productId]: isNaN(intValue) || !isFinite(intValue) || intValue < 1 ? null : intValue,
                                      });
                                    }
                                  }}
                                  placeholder="Không giới hạn"
                                  className="text-sm"
                                />
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={`price-mask-${productId}`}
                                  checked={productPriceMasks[productId]?.enabled || false}
                                  onCheckedChange={(checked) => {
                                    setProductPriceMasks({
                                      ...productPriceMasks,
                                      [productId]: {
                                        enabled: checked === true,
                                        hideFirstDigits: productPriceMasks[productId]?.hideFirstDigits || 1,
                                      },
                                    });
                                  }}
                                />
                                <Label htmlFor={`price-mask-${productId}`} className="text-sm font-medium cursor-pointer">
                                  Ẩn một phần giá để tạo sự tò mò
                                </Label>
                              </div>
                              {productPriceMasks[productId]?.enabled && (
                                <div className="ml-6 space-y-2">
                                  <Label className="text-xs">Số chữ số đầu cần ẩn (1-3)</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="3"
                                    value={productPriceMasks[productId]?.hideFirstDigits || 1}
                                    onChange={(e) => {
                                      const value = parseInt(e.target.value, 10);
                                      if (!isNaN(value) && value >= 1 && value <= 3) {
                                        setProductPriceMasks({
                                          ...productPriceMasks,
                                          [productId]: {
                                            enabled: true,
                                            hideFirstDigits: value,
                                          },
                                        });
                                      }
                                    }}
                                    className="w-20"
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Ví dụ: 125.000đ → {productPriceMasks[productId]?.hideFirstDigits === 1 ? "?25.000đ" : productPriceMasks[productId]?.hideFirstDigits === 2 ? "?5.000đ" : "?.000đ"}
                                  </p>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Banner Image */}
              <Card>
                <CardHeader>
                  <CardTitle>Hình ảnh banner</CardTitle>
                </CardHeader>
                <CardContent>
                  <ImageUploader
                    label=""
                    imageUrl={formData.banner_image_url || null}
                    onUpload={(url) => setFormData({ ...formData, banner_image_url: url })}
                    onRemove={() => setFormData({ ...formData, banner_image_url: "" })}
                    maxSize={5}
                    aspectRatio="video"
                    folder="flash-sales"
                  />
                </CardContent>
              </Card>

              {/* Settings */}
              <Card>
                <CardHeader>
                  <CardTitle>Cài đặt</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="is_active">Kích hoạt</Label>
                    <Switch
                      id="is_active"
                      checked={formData.is_active}
                      onCheckedChange={(checked) =>
                        setFormData({ ...formData, is_active: checked })
                      }
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                {!isNavigating ? (
                  <Button type="submit" disabled={isSubmitting} className="w-full">
                    <span className="flex items-center">
                      <Loader2 className={`w-4 h-4 mr-2 animate-spin ${isSubmitting ? 'inline' : 'hidden'}`} />
                      <Save className={`w-4 h-4 mr-2 ${isSubmitting ? 'hidden' : 'inline'}`} />
                      <span>{isSubmitting ? "Đang lưu..." : (isEditing ? "Cập nhật Flash Sale" : "Tạo Flash Sale")}</span>
                    </span>
                  </Button>
                ) : (
                  <Button type="submit" disabled={true} className="w-full">
                    <span className="flex items-center">
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      <span>Đang lưu...</span>
                    </span>
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate("/admin/flash-sales")}
                  className="w-full"
                >
                  Hủy
                </Button>
              </div>
            </div>
          </div>
        </form>

        {/* Product Selection Dialog */}
        <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Chọn sản phẩm</DialogTitle>
              <DialogDescription>
                Tìm kiếm và chọn sản phẩm để thêm vào Flash Sale
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Tìm kiếm theo tên sản phẩm hoặc mã sản phẩm..."
                  value={productSearchQuery}
                  onChange={(e) => setProductSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Products Table */}
              <div className="border rounded-md max-h-[500px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            filteredProductsForDialog.length > 0 &&
                            filteredProductsForDialog.every((p) => selectedProducts.includes(p.id))
                          }
                          onCheckedChange={(checked) => {
                            if (checked) {
                              filteredProductsForDialog.forEach((product) => {
                                const isOutOfStock = !product.stock_quantity || product.stock_quantity <= 0;
                                const isPreviouslyInFlashSale = editingFlashSale?.products?.some(
                                  (p) => p.product_id === product.id
                                );
                                if (!isOutOfStock || isPreviouslyInFlashSale) {
                                  if (!selectedProducts.includes(product.id)) {
                                    toggleProduct(product.id);
                                  }
                                }
                              });
                            } else {
                              filteredProductsForDialog.forEach((product) => {
                                if (selectedProducts.includes(product.id)) {
                                  toggleProduct(product.id);
                                }
                              });
                            }
                          }}
                        />
                      </TableHead>
                      <TableHead>Sản phẩm</TableHead>
                      <TableHead>Giá</TableHead>
                      <TableHead>Kho hàng</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProductsForDialog.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          {productSearchQuery
                            ? "Không tìm thấy sản phẩm nào"
                            : "Không có sản phẩm nào"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProductsForDialog.map((product) => {
                        const isOutOfStock = !product.stock_quantity || product.stock_quantity <= 0;
                        const isSelected = selectedProducts.includes(product.id);
                        const isPreviouslyInFlashSale = editingFlashSale?.products?.some(
                          (p) => p.product_id === product.id
                        );
                        // Chỉ disable checkbox nếu sản phẩm hết hàng VÀ chưa được chọn (không phải sản phẩm đã có từ trước)
                        const isDisabled = isOutOfStock && !isSelected && !isPreviouslyInFlashSale;

                        return (
                          <TableRow
                            key={product.id}
                            className={cn(
                              isDisabled && "opacity-50",
                              isSelected && "bg-muted/50"
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => {
                                  if (!isDisabled) {
                                    toggleProduct(product.id);
                                  }
                                }}
                                disabled={isDisabled}
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-3">
                                {product.image_url && (
                                  <img
                                    src={product.image_url}
                                    alt={product.name}
                                    className="w-12 h-12 object-cover rounded"
                                  />
                                )}
                                <div>
                                  <div className="font-medium">{product.name}</div>
                                  <div className="text-xs text-muted-foreground">
                                    Mã: {product.id.substring(0, 8)}...
                                  </div>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">
                                {new Intl.NumberFormat("vi-VN").format(product.price)}₫
                              </span>
                            </TableCell>
                            <TableCell>
                              {isOutOfStock ? (
                                <Badge variant="destructive" className="text-xs">
                                  <Package className="w-3 h-3 mr-1" />
                                  Hết hàng
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">
                                  <Package className="w-3 h-3 mr-1" />
                                  Còn {product.stock_quantity} sản phẩm
                                </Badge>
                              )}
                              {isPreviouslyInFlashSale && isOutOfStock && (
                                <Badge variant="secondary" className="text-xs ml-2">
                                  Đã có trong Flash Sale
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

              {selectedProducts.length > 0 && (
                <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                  <span className="text-sm font-medium">
                    Đã chọn {selectedProducts.length} sản phẩm
                    {filteredProductsForDialog.filter((p) => selectedProducts.includes(p.id)).length > 0 && (
                      <span className="text-muted-foreground ml-2">
                        ({filteredProductsForDialog.filter((p) => selectedProducts.includes(p.id)).length} trong danh sách này)
                      </span>
                    )}
                  </span>
                  {filteredProductsForDialog.filter((p) => selectedProducts.includes(p.id)).length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        filteredProductsForDialog.forEach((product) => {
                          if (selectedProducts.includes(product.id)) {
                            toggleProduct(product.id);
                          }
                        });
                      }}
                    >
                      Bỏ chọn tất cả trong danh sách
                    </Button>
                  )}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setIsProductDialogOpen(false);
                  setProductSearchQuery("");
                }}
              >
                Đóng
              </Button>
              <Button
                type="button"
                onClick={() => {
                  setIsProductDialogOpen(false);
                  setProductSearchQuery("");
                }}
              >
                Xong
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminFlashSaleForm;
