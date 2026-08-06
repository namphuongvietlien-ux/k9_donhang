import { Link } from "react-router-dom";
import { Tag, Gift, Percent, Clock, Truck, CreditCard, ShoppingBag } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import ScrollReveal from "@/components/ScrollReveal";
import { DynamicSEO, Breadcrumbs } from "@/components/seo/index";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/contexts/CartContext";
import { toast } from "sonner";
import productPepper from "@/assets/product-pepper.jpg";
import heroSpices from "@/assets/hero-spices.jpg";

const promotionBanners = [
  {
    title: "GIẢM 30% TẤT CẢ SẢN PHẨM",
    subtitle: "Chương trình khuyến mãi mùa lễ hội",
    description: "Áp dụng cho tất cả đơn hàng từ 500.000đ. Thời gian có hạn!",
    code: "GIAVITET30",
    expiry: "31/12/2024",
    bgColor: "bg-gradient-to-r from-primary to-primary/80"
  },
  {
    title: "MUA 2 TẶNG 1",
    subtitle: "Combo tiết kiệm",
    description: "Mua 2 sản phẩm bất kỳ, tặng ngay 1 sản phẩm cùng loại.",
    code: "MUA2TANG1",
    expiry: "15/01/2025",
    bgColor: "bg-gradient-to-r from-amber-600 to-amber-500"
  }
];

interface DiscountProduct {
  id: string;
  name: string;
  slug: string;
  price: number;
  original_price: number;
  image_url: string | null;
  stock_quantity: number;
}

const vouchers = [
  {
    code: "FREESHIP",
    title: "Miễn phí vận chuyển",
    description: "Cho đơn hàng từ 300.000đ",
    icon: Truck,
    color: "text-green-600 bg-green-100"
  },
  {
    code: "NEWUSER20",
    title: "Giảm 20% cho khách mới",
    description: "Áp dụng lần mua đầu tiên",
    icon: Gift,
    color: "text-purple-600 bg-purple-100"
  },
  {
    code: "GIAVILOVE",
    title: "Giảm 50.000đ",
    description: "Đơn hàng từ 500.000đ",
    icon: Tag,
    color: "text-primary bg-primary/10"
  },
  {
    code: "COMBO15",
    title: "Giảm 15% combo",
    description: "Khi mua từ 3 sản phẩm",
    icon: Percent,
    color: "text-amber-600 bg-amber-100"
  }
];

const policies = [
  { icon: Truck, title: "Giao hàng miễn phí", desc: "Đơn từ 300.000đ" },
  { icon: CreditCard, title: "Thanh toán đa dạng", desc: "COD, thẻ, ví điện tử" },
  { icon: Gift, title: "Quà tặng hấp dẫn", desc: "Với mỗi đơn hàng" },
  { icon: ShoppingBag, title: "Đổi trả dễ dàng", desc: "Trong vòng 7 ngày" }
];

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('vi-VN').format(price) + '₫';
};

const Promotions = () => {
  const { addItem } = useCart();

  // Fetch discounted products (products with original_price)
  const { data: discountedProducts = [], isLoading: isLoadingProducts } = useQuery({
    queryKey: ["discounted-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, price, original_price, image_url, stock_quantity")
        .not("original_price", "is", null)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(8);

      if (error) throw error;
      return (data || []) as DiscountProduct[];
    },
  });

  const copyVoucher = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Đã sao chép mã giảm giá!");
  };

  const handleAddToCart = (product: DiscountProduct) => {
    addItem({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.original_price || product.price,
      salePrice: product.original_price ? product.price : null,
      image: product.image_url || productPepper,
    });
    toast.success("Đã thêm vào giỏ hàng!");
  };

  // Calculate discount percentage
  const calculateDiscount = (originalPrice: number, salePrice: number) => {
    return Math.round(((originalPrice - salePrice) / originalPrice) * 100);
  };

  return (
    <div className="min-h-screen bg-background">
      <DynamicSEO 
        title="Chương trình khuyến mãi - Tăm Nhựa Vinon"
        description="Khám phá các chương trình khuyến mãi hấp dẫn từ Tăm Nhựa Vinon. Giảm giá lên đến 30%, miễn phí vận chuyển và nhiều ưu đãi đặc biệt."
        keywords="khuyến mãi tăm nhựa, giảm giá tăm vinon, voucher vinon, flash sale tăm nhựa"
        url="/promotions"
      />
      <SpiceHeader />
      
      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={[{ label: "Khuyến mãi" }]} />
        </div>
      </div>

      {/* Hero Banner */}
      <section className="relative py-16 overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroSpices})` }}
        />
        <div className="absolute inset-0 bg-foreground/80" />
        <div className="container mx-auto px-4 relative z-10">
          <ScrollReveal variant="fade-up">
            <div className="text-center text-card max-w-3xl mx-auto">
              <span className="inline-block px-4 py-1 bg-primary text-primary-foreground rounded-full text-sm font-medium mb-4">
                ƯU ĐÃI ĐẶC BIỆT
              </span>
              <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
                Chương Trình Khuyến Mãi
              </h1>
              <p className="text-lg text-card/80">
                Khám phá hàng loạt ưu đãi hấp dẫn dành riêng cho bạn. 
                Giảm giá lên đến 30% và nhiều quà tặng đặc biệt!
              </p>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* Promotion Banners */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-6">
            {promotionBanners.map((promo, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 100}>
                <div className={`${promo.bgColor} rounded-2xl p-8 text-primary-foreground relative overflow-hidden`}>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/10 rounded-full translate-y-1/2 -translate-x-1/2" />
                  <div className="relative z-10">
                    <span className="text-sm font-medium opacity-90">{promo.subtitle}</span>
                    <h3 className="text-2xl md:text-3xl font-bold mt-1 mb-3">{promo.title}</h3>
                    <p className="text-sm opacity-90 mb-4">{promo.description}</p>
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2">
                        <span className="text-xs opacity-80">Mã giảm giá</span>
                        <div className="font-bold text-lg">{promo.code}</div>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4" />
                        <span>HSD: {promo.expiry}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Vouchers Section */}
      <section className="py-12 bg-muted/30">
        <div className="container mx-auto px-4">
          <ScrollReveal variant="fade-up">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
                Mã Giảm Giá Dành Cho Bạn
              </h2>
              <p className="text-muted-foreground mt-2">
                Nhấn vào mã để sao chép và sử dụng khi thanh toán
              </p>
            </div>
          </ScrollReveal>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {vouchers.map((voucher, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 80}>
                <button 
                  onClick={() => copyVoucher(voucher.code)}
                  className="w-full bg-card border border-border rounded-xl p-5 text-left hover:shadow-lg hover:border-primary/30 transition-all group"
                >
                  <div className={`w-12 h-12 rounded-full ${voucher.color} flex items-center justify-center mb-4`}>
                    <voucher.icon className="w-6 h-6" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">{voucher.title}</h4>
                  <p className="text-sm text-muted-foreground mb-3">{voucher.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-primary">{voucher.code}</span>
                    <span className="text-xs text-muted-foreground group-hover:text-primary transition-colors">
                      Nhấn để sao chép
                    </span>
                  </div>
                </button>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Discounted Products */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <ScrollReveal variant="fade-up">
            <div className="flex items-center justify-between mb-8">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 bg-primary text-primary-foreground rounded-full text-sm font-medium">
                    <Percent className="w-4 h-4" />
                    GIẢM GIÁ
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
                  Sản Phẩm Giảm Giá Sốc
                </h2>
              </div>
              <Link to="/products">
                <Button variant="outline">Xem tất cả</Button>
              </Link>
            </div>
          </ScrollReveal>

          {isLoadingProducts ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="bg-card border border-border rounded-xl overflow-hidden">
                  <Skeleton className="w-full aspect-square" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-6 w-2/3" />
                    <Skeleton className="h-9 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : discountedProducts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground">Chưa có sản phẩm giảm giá nào.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {discountedProducts.map((product, index) => {
                const discount = calculateDiscount(
                  Number(product.original_price),
                  Number(product.price)
                );
                return (
                  <ScrollReveal key={product.id} variant="fade-up" delay={index * 100}>
                    <div className="bg-card border border-border rounded-xl overflow-hidden group hover:shadow-lg transition-shadow flex flex-col h-full">
                      <Link to={`/product/${product.slug}`} className="block relative aspect-square w-full overflow-hidden">
                        <img 
                          src={product.image_url || productPepper} 
                          alt={product.name}
                          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                          loading="lazy"
                        />
                        <span className="absolute top-3 left-3 bg-primary text-primary-foreground text-sm font-bold px-2 py-1 rounded">
                          -{discount}%
                        </span>
                      </Link>
                      <div className="p-4">
                        <Link to={`/product/${product.slug}`}>
                          <h3 className="font-medium text-foreground line-clamp-2 mb-2 group-hover:text-primary transition-colors">
                            {product.name}
                          </h3>
                        </Link>
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-lg font-bold text-primary">
                            {formatPrice(Number(product.price))}
                          </span>
                          <span className="text-sm text-muted-foreground line-through">
                            {formatPrice(Number(product.original_price))}
                          </span>
                        </div>
                        {/* Stock info */}
                        {product.stock_quantity > 0 && (
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-muted-foreground mb-1">
                              <span>Còn hàng: {product.stock_quantity}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-primary rounded-full transition-all"
                                style={{ 
                                  width: `${Math.min((product.stock_quantity / (product.stock_quantity + 50)) * 100, 100)}%` 
                                }}
                              />
                            </div>
                          </div>
                        )}
                        <Button 
                          className="w-full" 
                          size="sm"
                          onClick={() => handleAddToCart(product)}
                          disabled={product.stock_quantity === 0}
                        >
                          {product.stock_quantity === 0 ? "Hết hàng" : "Thêm vào giỏ"}
                        </Button>
                      </div>
                    </div>
                  </ScrollReveal>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Policies */}
      <section className="py-12 bg-muted/30 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {policies.map((policy, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 50}>
                <div className="text-center">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
                    <policy.icon className="w-7 h-7 text-primary" />
                  </div>
                  <h4 className="font-semibold text-foreground mb-1">{policy.title}</h4>
                  <p className="text-sm text-muted-foreground">{policy.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      <SpiceFooter />
    </div>
  );
};

export default Promotions;
