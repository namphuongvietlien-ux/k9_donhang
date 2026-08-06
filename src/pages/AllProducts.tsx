import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShoppingCart, Eye, SlidersHorizontal } from "lucide-react";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import { DynamicSEO, Breadcrumbs, CollectionPageSchema } from "@/components/seo/index";
import { useCart } from "@/contexts/CartContext";
import { Skeleton } from "@/components/ui/skeleton";
import productPepper from "@/assets/product-pepper.jpg";

interface Product {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number | null;
  image_url: string | null;
  badge: string | null;
  has_gift: boolean | null;
  category: string | null;
  stock_quantity: number;
}

const formatPrice = (price: number) => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

const AllProducts = () => {
  const [sortBy, setSortBy] = useState("newest");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const { addItem } = useCart();

  const { data: products = [], isLoading, error: queryError } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      // Select only needed fields to reduce payload size
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, badge, has_gift, category, stock_quantity")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Error fetching products:", error);
        }
        // If schema cache issue, try to handle gracefully
        if (error.code === "PGRST202" || error.code === "PGRST204" || error.message?.includes("schema cache")) {
          if (process.env.NODE_ENV === 'development') {
            console.warn("Schema cache issue detected. Please refresh schema cache in Supabase Dashboard.");
          }
          return [];
        }
        throw error;
      }
      
      return (data || []) as Product[];
    },
    // Optimize caching for product list (changes less frequently)
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: true, // Changed to true to ensure fresh data
    refetchOnWindowFocus: false,
    retry: 1, // Retry once on error
  });

  // Get unique categories
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))];

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

  const filteredProducts = filterCategory === "all" 
    ? products 
    : products.filter(p => p.category === filterCategory);

  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case "price-asc":
        return a.price - b.price;
      case "price-desc":
        return b.price - a.price;
      case "name-asc":
        return a.name.localeCompare(b.name);
      case "name-desc":
        return b.name.localeCompare(a.name);
      case "oldest":
        return 0;
      default:
        return 0;
    }
  });

  const pageTitle = filterCategory === "all" 
    ? "Tất cả sản phẩm" 
    : `Sản phẩm ${filterCategory}`;
  
  const pageDescription = filterCategory === "all"
    ? "Khám phá bộ sưu tập gia vị cao cấp từ Black Pepper: tiêu đen, quế, nghệ, muối hồng Himalaya và nhiều sản phẩm hữu cơ khác. Giao hàng toàn quốc."
    : `Danh sách sản phẩm ${filterCategory} chất lượng cao từ Black Pepper. Giao hàng nhanh, đảm bảo chất lượng.`;

  return (
    <div className="min-h-screen">
      {/* Dynamic SEO */}
      <DynamicSEO
        title={`${pageTitle} | Black Pepper`}
        description={pageDescription}
        keywords={`gia vị, ${filterCategory !== "all" ? filterCategory + ", " : ""}tiêu đen, quế, nghệ, muối hồng, black pepper, mua gia vị online`}
        url="/products"
      />
      
      {/* CollectionPage Schema */}
      <CollectionPageSchema
        name={pageTitle}
        description={pageDescription}
        url="/products"
        itemCount={sortedProducts.length}
        products={sortedProducts.slice(0, 20).map((p) => ({
          name: p.name,
          url: `/product/${p.slug}`,
          image: p.image_url || undefined,
          price: p.price,
        }))}
      />
      
      <SpiceHeader />

      <main className="pt-32 pb-20">
        <div className="container mx-auto px-4">
          {/* Breadcrumbs */}
          <Breadcrumbs
            items={[{ label: "Tất cả sản phẩm" }]}
            className="mb-6"
          />

          {/* Page Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
              <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
                Tất cả sản phẩm
              </h1>
              <p className="text-muted-foreground mt-1">
                <span className="font-semibold text-foreground">{sortedProducts.length}</span> sản phẩm
              </p>
            </div>

            <div className="flex items-center gap-4 flex-wrap">
              {/* Category Filter */}
              {categories.length > 0 && (
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-[160px]">
                    <SlidersHorizontal className="w-4 h-4 mr-2" />
                    <SelectValue placeholder="Danh mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tất cả</SelectItem>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat!}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Sort Select */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground hidden sm:block">Sắp xếp</span>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Mới nhất" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Mới nhất</SelectItem>
                    <SelectItem value="price-asc">Giá: Tăng dần</SelectItem>
                    <SelectItem value="price-desc">Giá: Giảm dần</SelectItem>
                    <SelectItem value="name-asc">Tên: A-Z</SelectItem>
                    <SelectItem value="name-desc">Tên: Z-A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Products Grid */}
          {isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="overflow-hidden">
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
          ) : queryError ? (
            <div className="text-center py-16">
              <p className="text-destructive text-lg mb-2">Lỗi khi tải sản phẩm</p>
              <p className="text-muted-foreground text-sm mb-4">
                {queryError instanceof Error ? queryError.message : "Đã xảy ra lỗi không xác định"}
              </p>
              <Button onClick={() => window.location.reload()}>Thử lại</Button>
            </div>
          ) : sortedProducts.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-muted-foreground text-lg">Chưa có sản phẩm nào.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {sortedProducts.map((product) => (
                <Card
                  key={product.id}
                  className="group overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col h-full"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-accent/20">
                    <img
                      src={product.image_url || productPepper}
                      alt={product.name}
                      className="absolute inset-0 w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500"
                      loading="lazy"
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
                          <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground gap-1">
                            <span className="text-xs">⚡</span>
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
                    <Link
                      to={`/product/${product.slug}`}
                      className="absolute inset-0 bg-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Button variant="secondary" size="sm" className="gap-2">
                        <Eye className="w-4 h-4" />
                        Xem nhanh
                      </Button>
                    </Link>
                  </div>

                  <CardContent className="p-4">
                    <Link to={`/product/${product.slug}`}>
                      <h2 className="font-medium text-foreground mb-3 line-clamp-2 min-h-[3rem] group-hover:text-primary transition-colors">
                        {product.name}
                      </h2>
                    </Link>

                    <div className="flex items-center gap-2 mb-4">
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
                    >
                      <ShoppingCart className="w-4 h-4" />
                      {(product.stock_quantity ?? 0) === 0 ? "Hết hàng" : "Thêm vào giỏ"}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <SpiceFooter />
    </div>
  );
};

export default AllProducts;
