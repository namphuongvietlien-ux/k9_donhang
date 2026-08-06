import { Check } from "lucide-react";
import ScrollReveal from "@/components/ScrollReveal";

const benefits = [
  "Hơn 10 năm kinh nghiệm sản xuất",
  "Công nghệ sản xuất hiện đại từ Nhật Bản",
  "Đội ngũ kỹ sư và công nhân lành nghề",
  "Quy trình kiểm soát chất lượng nghiêm ngặt",
  "Cam kết giá cả cạnh tranh nhất thị trường",
  "Hỗ trợ khách hàng 24/7",
];

const stats = [
  { value: "10+", label: "Năm kinh nghiệm" },
  { value: "5M+", label: "Sản phẩm/tháng" },
  { value: "1000+", label: "Đối tác" },
  { value: "99%", label: "Hài lòng" },
];

const About = () => {
  return (
    <section id="about" className="py-20 bg-card">
      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Content */}
          <div className="space-y-8">
            <ScrollReveal variant="fade-right">
              <div>
                <span className="text-primary font-medium">Về chúng tôi</span>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2 mb-4">
                  Tăm Nhựa Việt - Chất Lượng Tạo Nên Thương Hiệu
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Là một trong những đơn vị tiên phong trong lĩnh vực sản xuất tăm nhựa tại Việt Nam, 
                  chúng tôi tự hào mang đến những sản phẩm chất lượng cao với giá thành hợp lý. 
                  Với phương châm "Chất lượng là danh dự", chúng tôi cam kết mỗi sản phẩm 
                  đều được sản xuất với tiêu chuẩn khắt khe nhất.
                </p>
              </div>
            </ScrollReveal>

            {/* Benefits List */}
            <div className="grid sm:grid-cols-2 gap-4">
              {benefits.map((benefit, index) => (
                <ScrollReveal key={index} variant="fade-up" delay={index * 80}>
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check className="w-3 h-3 text-primary-foreground" />
                    </div>
                    <span className="text-muted-foreground">{benefit}</span>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>

          {/* Stats */}
          <ScrollReveal variant="fade-left" delay={200}>
            <div className="bg-gradient-to-br from-primary to-primary/80 rounded-3xl p-8 md:p-12">
              <div className="grid grid-cols-2 gap-8">
                {stats.map((stat, index) => (
                  <ScrollReveal key={index} variant="zoom-in" delay={300 + index * 100}>
                    <div className="text-center">
                      <div className="text-4xl md:text-5xl font-bold text-primary-foreground mb-2">
                        {stat.value}
                      </div>
                      <div className="text-primary-foreground/80 font-medium">
                        {stat.label}
                      </div>
                    </div>
                  </ScrollReveal>
                ))}
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
};

export default About;
