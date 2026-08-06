import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ShoppingCart, Eye } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";
import QuickViewDialog from "@/components/QuickViewDialog";
import { useCart } from "@/contexts/CartContext";
import productPepper from "@/assets/product-pepper.jpg";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  category: string | null;
  badge: string | null;
  has_gift: boolean | null;
  stock_quantity: number;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const SpiceProducts = () => {
  const [activeCategory, setActiveCategory] = useState("all");
  const [quickViewProduct, setQuickViewProduct] = useState<Product | null>(null);
  const { addItem } = useCart();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ["homepage-products"],
    queryFn: async () => {
      // Select only needed fields for homepage display
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, badge, has_gift, category, stock_quantity")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data as Product[];
    },
    // Homepage products cache longer (changes less frequently)
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  // Get unique categories from products
  const categories = [
    { id: "all", label: "Tất cả" },
    ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))
      .map(cat => ({ id: cat!, label: cat! }))
  ];

  const filteredProducts = activeCategory === "all" 
    ? products 
    : products.filter(p => p.category === activeCategory);

  const handleAddToCart = async (product: Product) => {
    // Check stock before adding to cart
    const availableStock = product.stock_quantity ?? 0;
    if (availableStock <= 0) {
      const { toast } = await import("sonner");
      toast.error("Sản phẩm đã hết hàng. Vui lòng chọn sản phẩm khác.", { duration: 3000 });
      return;
    }
    
    addItem({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.original_price || product.price,
      salePrice: product.original_price ? product.price : null,
      image: product.image_url || productPepper,
    });
  };

  return (
    <section id="products" className="py-20 bg-card">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center mb-8">
            <span className="text-muted-foreground">Sản phẩm đạt chất lượng cao</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2">
              Gia vị sạch & An Toàn
            </h2>
          </div>
        </ScrollReveal>

        {/* Category Tabs */}
        {categories.length > 1 && (
          <ScrollReveal variant="fade-up" delay={100}>
            <div className="flex flex-wrap justify-center gap-2 mb-12">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-6 py-2 min-h-[44px] rounded-full font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                    activeCategory === cat.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-accent text-foreground hover:bg-primary/10"
                  }`}
                  aria-label={`Lọc sản phẩm theo danh mục ${cat.label}`}
                  aria-pressed={activeCategory === cat.id}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </ScrollReveal>
        )}

        {/* Products Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden flex flex-col">
                <Skeleton className="aspect-square w-full" />
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-6 w-1/2" />
                  <Skeleton className="h-9 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Chưa có sản phẩm nào.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {filteredProducts.map((product, index) => (
              <ScrollReveal key={product.id} variant="fade-up" delay={index * 50}>
                <Card className="group overflow-hidden hover:shadow-lg transition-all duration-300 h-full flex flex-col">
                  <div className="relative aspect-square w-full overflow-hidden bg-accent/20">
                    <img
                      src={product.image_url || productPepper}
                      alt={`${product.name} - ${product.category || "Gia vị"} chất lượng cao`}
                      title={product.name}
                      width={400}
                      height={400}
                      loading="lazy"
                      decoding="async"
                      fetchpriority="auto"
                      className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                    />
                    
                    {/* Badge */}
                    {(() => {
                      const isOutOfStock = (product.stock_quantity ?? 0) === 0;
                      if (isOutOfStock) {
                        return (
                          <Badge className="absolute top-3 left-3 bg-destructive text-destructive-foreground">
                            Hết hàng
                          </Badge>
                        );
                      }
                      if (product.badge) {
                        return (
                          <Badge 
                            className={`absolute top-3 left-3 ${
                              product.badge.startsWith("-") 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-foreground text-card"
                            }`}
                          >
                            {product.badge}
                          </Badge>
                        );
                      }
                      return null;
                    })()}

                    {/* Gift Icon */}
                    {product.has_gift && (
                      <div className="absolute top-3 right-3 w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                        <span className="text-primary-foreground text-xs">🎁</span>
                      </div>
                    )}

                    {/* Quick View Overlay */}
                    <div className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button 
                        variant="secondary" 
                        size="sm" 
                        className="gap-2"
                        onClick={() => setQuickViewProduct(product)}
                        aria-label={`Xem nhanh sản phẩm ${product.name}`}
                      >
                        <Eye className="w-4 h-4" aria-hidden="true" />
                        Xem nhanh
                      </Button>
                    </div>
                  </div>

                  <CardContent className="p-4">
                    <Link to={`/product/${product.slug}`}>
                      <h3 className="font-medium text-foreground mb-2 line-clamp-2 min-h-[3rem] group-hover:text-primary transition-colors">
                        {product.name}
                      </h3>
                    </Link>
                    
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg font-bold text-primary">
                        {formatPrice(product.price)}
                      </span>
                      {product.original_price && (
                        <span className="text-sm text-muted-foreground line-through">
                          {formatPrice(product.original_price)}
                        </span>
                      )}
                    </div>

                    <Button 
                      size="sm" 
                      className="w-full gap-2"
                      onClick={() => handleAddToCart(product)}
                      disabled={(product.stock_quantity ?? 0) === 0}
                      aria-label={`Thêm ${product.name} vào giỏ hàng`}
                    >
                      <ShoppingCart className="w-4 h-4" aria-hidden="true" />
                      {(product.stock_quantity ?? 0) === 0 ? "Hết hàng" : "Thêm vào giỏ"}
                    </Button>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>
        )}

        {/* View All Button */}
        <ScrollReveal variant="fade-up" delay={400}>
          <div className="text-center mt-12">
            <Button variant="outline" size="lg" asChild>
              <Link to="/products">Xem tất cả sản phẩm</Link>
            </Button>
          </div>
        </ScrollReveal>
      </div>

      {/* Quick View Dialog */}
      {quickViewProduct && (
        <QuickViewDialog
          product={{
            id: typeof quickViewProduct.id === 'string' ? parseInt(quickViewProduct.id) || 0 : quickViewProduct.id as number,
            name: quickViewProduct.name,
            slug: quickViewProduct.slug,
            price: quickViewProduct.price,
            originalPrice: quickViewProduct.original_price,
            image: quickViewProduct.image_url || productPepper,
            badge: quickViewProduct.badge,
            hasGift: quickViewProduct.has_gift || false,
            stockQuantity: quickViewProduct.stock_quantity,
          }}
          open={!!quickViewProduct}
          onOpenChange={(open) => !open && setQuickViewProduct(null)}
        />
      )}
    </section>
  );
};

export default SpiceProducts;
