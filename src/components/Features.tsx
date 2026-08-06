import { Shield, Leaf, Sparkles, Heart, Award, Truck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import ScrollReveal from "@/components/ScrollReveal";

const features = [
  {
    icon: Shield,
    title: "An Toàn Tuyệt Đối",
    description: "Được sản xuất từ nhựa PP cao cấp, không chứa BPA, đảm bảo an toàn cho sức khỏe.",
  },
  {
    icon: Leaf,
    title: "Thân Thiện Môi Trường",
    description: "Có thể tái chế 100%, góp phần bảo vệ môi trường xanh sạch đẹp.",
  },
  {
    icon: Sparkles,
    title: "Đa Dạng Màu Sắc",
    description: "Nhiều màu sắc tươi sáng, phù hợp với mọi sở thích và phong cách.",
  },
  {
    icon: Heart,
    title: "Thiết Kế Tinh Tế",
    description: "Đầu tăm mềm mại, không gây tổn thương nướu, bảo vệ răng miệng tối ưu.",
  },
  {
    icon: Award,
    title: "Chất Lượng Cao",
    description: "Đạt tiêu chuẩn ISO 9001, được kiểm định nghiêm ngặt trước khi xuất xưởng.",
  },
  {
    icon: Truck,
    title: "Giao Hàng Toàn Quốc",
    description: "Đội ngũ vận chuyển chuyên nghiệp, giao hàng nhanh chóng đến tận nơi.",
  },
];

const Features = () => {
  return (
    <section className="py-20 bg-card">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-primary font-medium">Tại sao chọn chúng tôi?</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2 mb-4">
              Đặc Điểm Nổi Bật
            </h2>
            <p className="text-muted-foreground">
              Sản phẩm tăm nhựa của chúng tôi được thiết kế với những tính năng ưu việt, 
              mang đến trải nghiệm tốt nhất cho người sử dụng.
            </p>
          </div>
        </ScrollReveal>

        {/* Features Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <ScrollReveal 
              key={index} 
              variant="fade-up" 
              delay={index * 100}
            >
              <Card 
                className="group hover:shadow-lg transition-all duration-300 border-border hover:border-primary/30 h-full"
              >
                <CardContent className="p-6">
                  <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-4 group-hover:bg-primary transition-colors">
                    <feature.icon className="w-7 h-7 text-accent-foreground group-hover:text-primary-foreground transition-colors" />
                  </div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
