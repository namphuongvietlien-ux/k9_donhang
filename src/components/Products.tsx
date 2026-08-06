import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import product1 from "@/assets/product-1.jpg";
import product2 from "@/assets/product-2.jpg";
import product3 from "@/assets/product-3.jpg";
import { ShoppingCart } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import ScrollReveal from "@/components/ScrollReveal";

const products = [
  {
    id: 1,
    name: "Tăm Nhựa Classic",
    description: "Gói 200 chiếc, màu pastel nhẹ nhàng",
    price: "25.000đ",
    originalPrice: "35.000đ",
    image: product1,
    badge: "Bán chạy",
  },
  {
    id: 2,
    name: "Tăm Nhựa Eco Green",
    description: "Gói 150 chiếc, thân thiện môi trường",
    price: "30.000đ",
    originalPrice: "40.000đ",
    image: product2,
    badge: "Mới",
  },
  {
    id: 3,
    name: "Tăm Nhựa Rainbow",
    description: "Hộp 300 chiếc, đa màu sắc",
    price: "45.000đ",
    originalPrice: "55.000đ",
    image: product3,
    badge: "Hot",
  },
];

const Products = () => {
  return (
    <section id="products" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-primary font-medium">Bộ sưu tập</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2 mb-4">
              Sản Phẩm Của Chúng Tôi
            </h2>
            <p className="text-muted-foreground">
              Đa dạng mẫu mã và kích cỡ, đáp ứng mọi nhu cầu của gia đình bạn
            </p>
          </div>
        </ScrollReveal>

        {/* Products Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {products.map((product) => (
            <Card 
              key={product.id}
              className="group overflow-hidden hover:shadow-xl transition-all duration-300 h-full"
            >
              <div className="relative aspect-square overflow-hidden bg-accent/30">
                <OptimizedImage
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  containerClassName="w-full h-full"
                />
                <Badge className="absolute top-4 left-4 bg-primary text-primary-foreground z-10">
                  {product.badge}
                </Badge>
              </div>
              <CardContent className="p-6">
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {product.name}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {product.description}
                </p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-primary">
                      {product.price}
                    </span>
                    <span className="text-sm text-muted-foreground line-through">
                      {product.originalPrice}
                    </span>
                  </div>
                  <Button size="sm" className="gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    Mua ngay
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* View All Button */}
        <ScrollReveal variant="fade-up" delay={450}>
          <div className="text-center mt-12">
            <Button variant="outline" size="lg">
              Xem tất cả sản phẩm
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
};

export default Products;
