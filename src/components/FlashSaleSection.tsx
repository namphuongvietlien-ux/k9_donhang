import { Link } from "react-router-dom";
import { Zap, ArrowRight, Clock } from "lucide-react";
import { useActiveFlashSales, useUpcomingFlashSales } from "@/hooks/useFlashSales";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import FlashSaleCountdown from "./FlashSaleCountdown";
import PriceDisplay from "./PriceDisplay";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import productPepper from "@/assets/product-pepper.jpg";

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const FlashSaleSection = () => {
  const { data: activeFlashSales = [], isLoading: isLoadingActive } = useActiveFlashSales();
  const { data: upcomingFlashSales = [], isLoading: isLoadingUpcoming } = useUpcomingFlashSales();
  const { addItem } = useCart();

  const isLoading = isLoadingActive || isLoadingUpcoming;

  if (isLoading) {
    return (
      <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-primary/5">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Skeleton className="h-10 w-64 mx-auto mb-4" />
            <Skeleton className="h-6 w-96 mx-auto" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="flex flex-col">
                <Skeleton className="aspect-square w-full" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-6 w-24" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Priority: Show active flash sale first, if none then show upcoming
  const flashSale = activeFlashSales.length > 0 
    ? activeFlashSales[0] 
    : upcomingFlashSales.length > 0 
      ? upcomingFlashSales[0] 
      : null;

  if (!flashSale) {
    return null; // Don't show section if no flash sales
  }

  const products = flashSale.products || [];
  const isUpcoming = activeFlashSales.length === 0 && upcomingFlashSales.length > 0;

  if (products.length === 0) {
    return null;
  }

  const handleAddToCart = async (product: any) => {
    // If flash sale is upcoming, don't allow adding to cart yet
    if (isUpcoming) {
      toast.info("Flash sale chưa bắt đầu. Vui lòng đợi đến khi flash sale bắt đầu.", { duration: 3000 });
      return;
    }

    // Check stock before adding to cart
    const availableStock = product.product.stock_quantity ?? 0;
    if (availableStock <= 0) {
      toast.error("Sản phẩm đã hết hàng. Vui lòng chọn sản phẩm khác.", { duration: 3000 });
      return;
    }
    
    const basePrice = product.product.original_price || product.product.price;
    const flashSalePrice = product.flash_sale_price || 
      (flashSale.discount_type === "percentage"
        ? basePrice * (1 - flashSale.discount_value / 100)
        : Math.max(basePrice - flashSale.discount_value, 0));

    addItem({
      id: product.product.id,
      name: product.product.name,
      slug: product.product.slug,
      price: basePrice,
      salePrice: flashSalePrice,
      image: product.product.image_url || productPepper,
    });
    toast.success("Đã thêm vào giỏ hàng!");
  };

  const calculatePrice = (product: any) => {
    const basePrice = product.product.original_price || product.product.price;
    if (product.flash_sale_price !== null) {
      return product.flash_sale_price;
    }
    if (flashSale.discount_type === "percentage") {
      return basePrice * (1 - flashSale.discount_value / 100);
    } else {
      return Math.max(basePrice - flashSale.discount_value, 0);
    }
  };

  return (
    <section className="py-20 bg-gradient-to-br from-primary/10 via-background to-primary/5">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Zap className={`w-8 h-8 ${isUpcoming ? "text-orange-500" : "text-primary"} ${!isUpcoming && "animate-pulse"}`} />
            <h2 className="text-4xl font-serif font-bold text-foreground">
              Flash Sale
            </h2>
          </div>
          {isUpcoming && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-orange-500" />
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-300">
                Sắp diễn ra
              </Badge>
            </div>
          )}
          <h3 className="text-2xl font-bold text-primary mb-4">
            {flashSale.title}
          </h3>
          {flashSale.description && (
            <p className="text-muted-foreground mb-4 max-w-2xl mx-auto">
              {flashSale.description}
            </p>
          )}
          <FlashSaleCountdown 
            startsAt={flashSale.starts_at} 
            endsAt={flashSale.ends_at} 
            className="justify-center" 
          />
          {isUpcoming && (
            <p className="text-sm text-muted-foreground mt-4">
              Flash sale sẽ bắt đầu vào lúc {new Date(flashSale.starts_at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
          {products.slice(0, 8).map((item: any) => {
            const product = item.product;
            const basePrice = product.original_price || product.price;
            const flashSalePrice = calculatePrice(item);
            const discountPercent = Math.round(
              ((basePrice - flashSalePrice) / basePrice) * 100
            );

            return (
              <Card
                key={item.id}
                className="group overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full"
              >
                <Link to={`/product/${product.slug}`}>
                  <div className="relative aspect-square w-full overflow-hidden bg-accent/20">
                    <img
                      src={product.image_url || productPepper}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
                    />
                    <Badge className="absolute top-3 left-3 bg-destructive text-destructive-foreground">
                      -{discountPercent}%
                    </Badge>
                    {item.max_quantity && (
                      <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground">
                        Tối đa {item.max_quantity}
                      </Badge>
                    )}
                  </div>
                </Link>
                <CardContent className="p-4">
                  <Link to={`/product/${product.slug}`}>
                    <h3 className="font-semibold mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                      {product.name}
                    </h3>
                  </Link>
                  <PriceDisplay
                    price={flashSalePrice}
                    originalPrice={basePrice}
                    maskEnabled={item.price_mask_enabled || false}
                    maskHideFirstDigits={item.price_mask_hide_first_digits || 1}
                    showOriginalPrice={basePrice !== flashSalePrice}
                    revealOnHover={true}
                    revealOnClick={true}
                    className="mb-3"
                  />
                  <Button
                    className="w-full"
                    onClick={() => handleAddToCart(item)}
                    disabled={product.stock_quantity <= 0 || isUpcoming}
                    variant={isUpcoming ? "outline" : "default"}
                  >
                    {isUpcoming 
                      ? "Chưa bắt đầu" 
                      : product.stock_quantity <= 0 
                        ? "Hết hàng" 
                        : "Thêm vào giỏ"}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* View All Link */}
        {products.length > 8 && (
          <div className="text-center">
            <Button variant="outline" size="lg" asChild>
              <Link to="/promotions" className="gap-2">
                Xem tất cả {products.length} sản phẩm flash sale
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default FlashSaleSection;

