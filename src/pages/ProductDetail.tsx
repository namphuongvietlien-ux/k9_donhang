import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trackViewItem } from "@/utils/analytics";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useFlashSalePrice } from "@/hooks/useFlashSales";
import FlashSaleCountdown from "@/components/FlashSaleCountdown";
import PriceDisplay from "@/components/PriceDisplay";
import {
  Minus,
  Plus,
  ShoppingCart,
  Truck,
  Shield,
  Phone,
  PackageCheck,
  RefreshCw,
  CreditCard,
  Facebook,
  MessageCircle,
  Share2,
} from "lucide-react";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import { DynamicSEO, Breadcrumbs, ProductSchema } from "@/components/seo/index";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import productPepper from "@/assets/product-pepper.jpg";
import ProductReviews from "@/components/ProductReviews";
import RichTextContent from "@/components/RichTextContent";
import ProductImageGallery from "@/components/ProductImageGallery";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  video_url: string | null;
  gallery_images: string[] | null;
  description: string | null;
  category: string | null;
  badge: string | null;
  has_gift: boolean | null;
  stock_quantity?: number;
  unit_name?: string;
}

const promotions = [
  { icon: Truck, title: "Miễn phí vận chuyển", subtitle: "Đơn hàng từ 300k", code: "A87TYRT55H" },
  { icon: Shield, title: "Giảm 20%", subtitle: "Đơn hàng từ 200k", code: "QH5G8J0YC" },
  { icon: CreditCard, title: "Giảm 50k", subtitle: "Đơn hàng từ 500k", code: "FT45YU08H" },
];

const policies = [
  { icon: Truck, text: "Miễn phí giao hàng" },
  { icon: RefreshCw, text: "Đổi trả trong 7 ngày" },
  { icon: Shield, text: "Cam kết hàng chính hãng 100%" },
  { icon: PackageCheck, text: "Mở hộp kiểm tra nhận hàng" },
  { icon: Phone, text: "Hỗ trợ 24/7" },
  { icon: CreditCard, text: "Thanh toán nhanh chóng" },
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const ProductDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const [quantity, setQuantity] = useState(1);
  const { addItem, items: cartItems } = useCart();

  const { data: product, isLoading, error } = useQuery({
    queryKey: ["product", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, video_url, gallery_images, description, category, badge, has_gift, stock_quantity, unit_name")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      
      if (error) throw error;
      return data as Product | null;
    },
    enabled: !!slug,
    // Product detail pages cache longer (changes less frequently)
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const { data: relatedProducts = [] } = useQuery({
    queryKey: ["related-products", product?.category, product?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, badge")
        .eq("is_active", true)
        .eq("category", product?.category || "")
        .neq("id", product?.id || "")
        .limit(3);
      if (error) throw error;
      return data;
    },
    enabled: !!product?.category,
  });

  interface RatingDistribution {
    [key: string]: number;
  }

  interface RatingStats {
    average_rating: number;
    total_reviews: number;
    rating_distribution: RatingDistribution;
  }

  // Fetch rating stats for schema
  const { data: ratingStats } = useQuery({
    queryKey: ["product-rating-stats", product?.id],
    queryFn: async () => {
      if (!product?.id) return null;
      
      const { data, error } = await supabase.rpc("get_product_rating_stats", {
        product_uuid: product.id,
      });
      
      // If RPC function doesn't exist (404), return null instead of throwing
      // Check multiple error indicators: code, status, message
      if (error) {
        const isNotFoundError = 
          error.code === "PGRST116" || 
          error.code === "PGRST202" ||  // Function not found in schema cache
          error.code === "42883" || 
          error.code === "404" ||
          error.status === 404 ||
          error.message?.includes("does not exist") || 
          error.message?.includes("function") ||
          error.message?.includes("not found") ||
          error.message?.includes("NOT_FOUND") ||
          error.message?.includes("schema cache") ||
          (error.details && error.details.includes("function")) ||
          (error.hint && error.hint.includes("function"));
        
        if (isNotFoundError) {
          return null;
        }
        throw error;
      }
      return data?.[0] as RatingStats | null;
    },
    enabled: !!product?.id,
    retry: false, // Don't retry if function doesn't exist
  });

  // Fetch reviews for schema
  const { data: reviews = [] } = useQuery({
    queryKey: ["product-reviews-schema", product?.id],
    queryFn: async () => {
      if (!product?.id) return [];
      
      const { data, error } = await supabase
        .from("product_reviews")
        .select("rating, comment, reviewer_name, created_at")
        .eq("product_id", product.id)
        .eq("is_approved", true)
        .order("created_at", { ascending: false })
        .limit(10); // Limit for schema

      // If table doesn't exist (404), return empty array instead of throwing
      if (error) {
        if (error.code === "PGRST116" || error.message?.includes("does not exist")) {
          return [];
        }
        throw error;
      }
      return data || [];
    },
    enabled: !!product?.id,
    retry: false, // Don't retry if table doesn't exist
  });

  // Track view item when product is loaded
  useEffect(() => {
    if (product) {
      trackViewItem({
        id: product.id,
        name: product.name,
        price: product.original_price || product.price,
        category: product.category || undefined,
        image_url: product.image_url || undefined,
      });
    }
  }, [product]);

  // Get flash sale price (must be before early returns - Rules of Hooks)
  const basePrice = product?.original_price || product?.price || 0;
  const { data: flashSalePrice } = useFlashSalePrice(product?.id || "", basePrice);
  
  // Get active flash sale info for countdown and price mask (must be before early returns - Rules of Hooks)
  const { data: flashSaleInfo } = useQuery({
    queryKey: ["active-flash-sales-for-product", product?.id],
    queryFn: async () => {
      if (!product?.id) return null;
      try {
        const now = new Date().toISOString();
        
        // Get flash sale product relationship with price mask info
        const { data: flashSaleProduct, error: fspError } = await supabase
          .from("flash_sale_products")
          .select("flash_sale_id, price_mask_enabled, price_mask_hide_first_digits")
          .eq("product_id", product.id)
          .maybeSingle();

        if (fspError || !flashSaleProduct) {
          return null;
        }

        // Then, get the flash sale and check if it's active
        const { data: flashSale, error: fsError } = await supabase
          .from("flash_sales")
          .select("id, title, ends_at, is_active, starts_at, display_order")
          .eq("id", flashSaleProduct.flash_sale_id)
          .eq("is_active", true)
          .lte("starts_at", now)
          .gt("ends_at", now)
          .order("display_order", { ascending: false })
          .maybeSingle();

        if (fsError || !flashSale) {
          return null;
        }

        return {
          ...flashSale,
          price_mask_enabled: flashSaleProduct.price_mask_enabled || false,
          price_mask_hide_first_digits: flashSaleProduct.price_mask_hide_first_digits || 1,
        };
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Error in flash sale query:", error);
        }
        return null;
      }
    },
    enabled: !!product?.id,
    staleTime: 30 * 1000,
  });

  // Calculate derived values (after hooks but before early returns)
  const displayPrice = flashSalePrice ?? (product?.price || 0);
  const hasFlashSale = flashSalePrice !== null && flashSalePrice !== undefined && flashSalePrice < basePrice;
  const productImage = product?.image_url || productPepper;
  // Alias for backward compatibility
  const activeFlashSales = flashSaleInfo;

  const handleAddToCart = async () => {
    if (!product) return;
    
    // Fetch product with unit_name
    const { data: productWithUnit } = await supabase
      .from("products")
      .select("stock_quantity, unit_name")
      .eq("id", product.id)
      .single();
    
    const availableStock = productWithUnit?.stock_quantity ?? product.stock_quantity ?? 0;
    const unitName = productWithUnit?.unit_name || "Sản phẩm";
    
    if (quantity > availableStock) {
      toast.error(
        `Số lượng đặt hàng (${quantity} ${unitName}) vượt quá số lượng tồn kho (${availableStock} ${unitName}). Vui lòng giảm số lượng.`,
        { duration: 5000 }
      );
      return;
    }
    
    // Check current cart quantity for this product
    const existingCartItem = cartItems.find((item) => item.id === product.id);
    const currentCartQuantity = existingCartItem?.quantity || 0;
    const totalRequestedQuantity = currentCartQuantity + quantity;
    
    if (totalRequestedQuantity > availableStock) {
      toast.error(
        `Tổng số lượng trong giỏ hàng (${currentCartQuantity} ${unitName}) + số lượng muốn thêm (${quantity} ${unitName}) = ${totalRequestedQuantity} ${unitName} vượt quá tồn kho (${availableStock} ${unitName}). Vui lòng giảm số lượng.`,
        { duration: 5000 }
      );
      return;
    }
    
    // Determine price and salePrice correctly
    let cartPrice: number;
    let cartSalePrice: number | null = null;
    
    if (hasFlashSale && flashSalePrice !== undefined) {
      // Flash sale active: basePrice is original, flashSalePrice is the sale price
      cartPrice = basePrice;
      cartSalePrice = flashSalePrice;
    } else if (product.original_price && product.original_price !== product.price) {
      // Regular sale: original_price is base, price is sale price
      cartPrice = product.original_price;
      cartSalePrice = product.price;
    } else {
      // No sale: just regular price
      cartPrice = product.price;
      cartSalePrice = null;
    }
    
    // Add multiple quantities
    for (let i = 0; i < quantity; i++) {
      addItem({
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: cartPrice,
        salePrice: cartSalePrice,
        image: productImage,
      });
    }
    toast.success(`Đã thêm ${quantity} sản phẩm vào giỏ hàng!`);
  };

  const handleBuyNow = () => {
    handleAddToCart();
    toast.success("Đang chuyển đến trang thanh toán...");
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(`Đã sao chép mã: ${code}`);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <SpiceHeader />
        <main className="pt-32 pb-20">
          <div className="container mx-auto px-4">
            <Skeleton className="h-6 w-64 mb-6" />
            <div className="grid lg:grid-cols-3 gap-8">
              <Skeleton className="aspect-square rounded-lg" />
              <div className="space-y-4">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-10 w-48" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="min-h-screen">
        <SpiceHeader />
        <main className="pt-32 pb-20">
          <div className="container mx-auto px-4 text-center py-16">
            <h1 className="text-2xl font-bold text-foreground mb-4">Không tìm thấy sản phẩm</h1>
            <p className="text-muted-foreground mb-8">Sản phẩm bạn đang tìm không tồn tại hoặc đã bị xóa.</p>
            <Link to="/products">
              <Button>Xem tất cả sản phẩm</Button>
            </Link>
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  const inStock = (product.stock_quantity ?? 1) > 0;
  
  // Generate SEO-friendly description
  const seoDescription = product.description 
    ? product.description.replace(/<[^>]*>/g, "").substring(0, 160).trim() + (product.description.length > 160 ? "..." : "")
    : `Mua ${product.name} chất lượng cao tại Tăm Nhựa Vinon. ${product.category ? `Sản phẩm ${product.category}` : "Tăm nhựa"} chính hãng, giao hàng nhanh, đảm bảo chất lượng, đạt chuẩn Eurofins.`;
  
  // Generate SEO-friendly keywords
  const seoKeywords = [
    product.name,
    product.category || "tăm nhựa",
    "mua online",
    "tăm nhựa vinon",
    product.original_price ? "giảm giá" : "",
    "chính hãng",
    "giao hàng nhanh",
    "tăm nhựa an toàn",
    "tăm nhựa eurofins"
  ].filter(Boolean).join(", ");

  return (
    <div className="min-h-screen">
      {/* Dynamic SEO */}
      <DynamicSEO
        title={`${product.name} | Tăm Nhựa Vinon`}
        description={seoDescription}
        keywords={seoKeywords}
        image={productImage}
        url={`/product/${product.slug}`}
        type="product"
        price={product.price}
        availability={inStock ? "InStock" : "OutOfStock"}
        brand="Tăm Nhựa Vinon"
      />
      
      {/* Product Schema */}
      <ProductSchema
        name={product.name}
        description={product.description?.replace(/<[^>]*>/g, "") || `${product.name} - Sản phẩm chất lượng cao từ Tăm Nhựa Vinon, đạt chuẩn Eurofins`}
        image={productImage}
        price={product.price}
        originalPrice={product.original_price || undefined}
        slug={product.slug}
        category={product.category || undefined}
        inStock={inStock}
        brand="Tăm Nhựa Vinon"
        sku={product.id}
        rating={ratingStats?.average_rating}
        reviewCount={ratingStats?.total_reviews}
        reviews={reviews.map((r) => ({
          rating: r.rating,
          comment: r.comment || undefined,
          reviewer_name: r.reviewer_name,
          created_at: r.created_at,
        }))}
      />

      <SpiceHeader />

      <main className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          {/* Breadcrumbs with Schema */}
          <Breadcrumbs
            items={[
              { label: product.category || "Sản phẩm", href: "/products" },
              { label: product.name },
            ]}
            className="mb-6"
          />

          {/* Product Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mb-16">
            {/* Product Media */}
            <div className="lg:col-span-1">
              <div className="lg:sticky lg:top-32 space-y-4">
                {/* Video (if exists, replaces main image) */}
                {product.video_url ? (
                  <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-muted">
                    <video
                      src={product.video_url}
                      controls
                      className="absolute inset-0 w-full h-full object-contain"
                      preload="metadata"
                    >
                      Trình duyệt của bạn không hỗ trợ video.
                    </video>
                  </div>
                ) : (
                  /* Main Image (only if no video) */
                  <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted">
                    <img
                      src={productImage}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover object-center"
                    />
                  </div>
                )}

                {/* Gallery Images */}
                {product.gallery_images && product.gallery_images.length > 0 && (
                  <ProductImageGallery
                    images={product.gallery_images}
                    mainImage={product.image_url || undefined}
                    videoUrl={product.video_url || undefined}
                    productName={product.name}
                  />
                )}
              </div>
            </div>

            {/* Product Info */}
            <div className="lg:col-span-1">
              <h1 className="text-2xl font-serif font-bold text-foreground mb-4">
                {product.name}
              </h1>

              <div className="flex items-center gap-2 mb-6">
                <span className="text-muted-foreground">Tình trạng:</span>
                <Badge variant="outline" className={inStock ? "text-primary border-primary" : "text-destructive border-destructive"}>
                  {inStock ? "Còn hàng" : "Hết hàng"}
                </Badge>
                {product.has_gift && (
                  <Badge className="bg-primary text-primary-foreground">🎁 Quà tặng</Badge>
                )}
              </div>

              {/* Price */}
              <div className="bg-accent/50 rounded-lg p-4 mb-6">
                <div className="space-y-2">
                  {hasFlashSale && activeFlashSales && (
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-destructive text-destructive-foreground">
                        ⚡ Flash Sale
                      </Badge>
                      {activeFlashSales.ends_at && (
                        <FlashSaleCountdown 
                          startsAt={activeFlashSales.starts_at} 
                          endsAt={activeFlashSales.ends_at} 
                        />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground">Giá:</span>
                    {hasFlashSale && flashSaleInfo ? (
                      <PriceDisplay
                        price={displayPrice}
                        originalPrice={basePrice}
                        maskEnabled={flashSaleInfo.price_mask_enabled || false}
                        maskHideFirstDigits={flashSaleInfo.price_mask_hide_first_digits || 1}
                        showOriginalPrice={basePrice !== displayPrice}
                        revealOnHover={true}
                        revealOnClick={true}
                        className="text-2xl"
                      />
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-primary">
                          {formatPrice(displayPrice)}
                        </span>
                        {hasFlashSale && basePrice !== displayPrice ? (
                          <>
                            <span className="text-muted-foreground line-through">
                              {formatPrice(basePrice)}
                            </span>
                            <Badge className="bg-primary text-primary-foreground">
                              -{Math.round((1 - displayPrice / basePrice) * 100)}%
                            </Badge>
                          </>
                        ) : !hasFlashSale && product.original_price && product.original_price !== product.price ? (
                          <>
                            <span className="text-muted-foreground line-through">
                              {formatPrice(product.original_price)}
                            </span>
                            <Badge className="bg-primary text-primary-foreground">
                              -{Math.round((1 - product.price / product.original_price) * 100)}%
                            </Badge>
                          </>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Quantity */}
              <div className="flex items-center gap-4 mb-6">
                <span className="text-muted-foreground">Số lượng:</span>
                <div className="flex items-center border border-border rounded-lg">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 hover:bg-accent transition-colors"
                    aria-label="Giảm số lượng"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 text-center border-x border-border py-2 bg-transparent"
                    aria-label="Số lượng"
                  />
                  <button
                    onClick={() => setQuantity(quantity + 1)}
                    className="p-2 hover:bg-accent transition-colors"
                    aria-label="Tăng số lượng"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4 mb-6">
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1 gap-2"
                  onClick={handleAddToCart}
                  disabled={!inStock}
                >
                  <ShoppingCart className="w-5 h-5" />
                  THÊM VÀO GIỎ
                </Button>
                <Button size="lg" className="flex-1" onClick={handleBuyNow} disabled={!inStock}>
                  MUA NGAY
                </Button>
              </div>

              {/* Share */}
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground">Chia sẻ:</span>
                <div className="flex gap-2">
                  <button 
                    className="w-10 h-10 rounded-full bg-[#1877f2] text-card flex items-center justify-center hover:opacity-80"
                    aria-label="Chia sẻ Facebook"
                  >
                    <Facebook className="w-5 h-5" />
                  </button>
                  <button 
                    className="w-10 h-10 rounded-full bg-[#0084ff] text-card flex items-center justify-center hover:opacity-80"
                    aria-label="Chia sẻ Messenger"
                  >
                    <MessageCircle className="w-5 h-5" />
                  </button>
                  <button 
                    className="w-10 h-10 rounded-full bg-muted text-foreground flex items-center justify-center hover:opacity-80"
                    aria-label="Chia sẻ"
                  >
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Promotions Sidebar */}
            <div className="lg:col-span-1">
              <div className="space-y-4">
                {promotions.map((promo, index) => (
                  <Card key={index} className="border-border">
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center flex-shrink-0">
                        <promo.icon className="w-6 h-6 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-foreground">{promo.title}</p>
                        <p className="text-sm text-muted-foreground">{promo.subtitle}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Mã: <span className="font-mono">{promo.code}</span>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => copyCode(promo.code)}
                      >
                        SAO CHÉP
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Policies */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-16">
            {policies.map((policy, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <policy.icon className="w-5 h-5 text-primary flex-shrink-0" />
                <span className="text-muted-foreground">{policy.text}</span>
              </div>
            ))}
          </div>

          {/* Product Details & Related Products */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
            {/* Tabs */}
            <div className="lg:col-span-2">
              <Tabs defaultValue="description" className="w-full">
                <TabsList className="w-full justify-start sm:justify-start border-b border-border rounded-none bg-transparent h-auto p-0 overflow-x-auto scrollbar-hide">
                  <TabsTrigger
                    value="description"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap flex-shrink-0"
                  >
                    Mô tả sản phẩm
                  </TabsTrigger>
                  <TabsTrigger
                    value="policy"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap flex-shrink-0"
                  >
                    Chính sách đổi trả
                  </TabsTrigger>
                  <TabsTrigger
                    value="reviews"
                    className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base whitespace-nowrap flex-shrink-0"
                  >
                    Đánh giá ({ratingStats?.total_reviews || 0})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="description" className="pt-6">
                  {product.description ? (
                    <RichTextContent 
                      content={product.description}
                      prose={true}
                    />
                  ) : (
                    <p className="text-muted-foreground">Chưa có mô tả cho sản phẩm này.</p>
                  )}
                </TabsContent>

                <TabsContent value="policy" className="pt-6">
                  <div className="text-muted-foreground space-y-4">
                    <p>
                      <strong className="text-foreground">1. Điều kiện đổi trả:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Sản phẩm còn nguyên tem, nhãn mác</li>
                      <li>Sản phẩm chưa qua sử dụng</li>
                      <li>Đổi trả trong vòng 7 ngày kể từ ngày nhận hàng</li>
                    </ul>
                    <p>
                      <strong className="text-foreground">2. Quy trình đổi trả:</strong>
                    </p>
                    <ul className="list-disc list-inside space-y-2">
                      <li>Liên hệ hotline: 1900.636.000</li>
                      <li>Gửi hình ảnh sản phẩm cần đổi trả</li>
                      <li>Chờ xác nhận từ bộ phận CSKH</li>
                    </ul>
                  </div>
                </TabsContent>

                <TabsContent value="reviews" className="pt-6">
                  <ProductReviews productId={product.id} productName={product.name} />
                </TabsContent>
              </Tabs>
            </div>

            {/* Related Products */}
            <aside className="lg:col-span-1">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6">
                Sản phẩm liên quan
              </h2>
              {relatedProducts.length > 0 ? (
                <div className="space-y-4">
                  {relatedProducts.map((item) => (
                    <Link to={`/product/${item.slug}`} key={item.id}>
                      <Card className="group overflow-hidden hover:shadow-md transition-all">
                        <div className="flex gap-4 p-4">
                          <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-accent/20 flex-shrink-0">
                            <img
                              src={item.image_url || productPepper}
                              alt={item.name}
                              className="absolute inset-0 w-full h-full object-cover object-center"
                              loading="lazy"
                            />
                            {item.badge && (
                              <Badge className="absolute top-1 left-1 text-xs bg-primary text-primary-foreground">
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-foreground text-sm line-clamp-2 group-hover:text-primary transition-colors">
                              {item.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="font-bold text-primary">{formatPrice(item.price)}</span>
                              {item.original_price && (
                                <span className="text-xs text-muted-foreground line-through">
                                  {formatPrice(item.original_price)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">Không có sản phẩm liên quan.</p>
              )}
            </aside>
          </div>
        </div>
      </main>

      <SpiceFooter />
    </div>
  );
};

export default ProductDetail;
