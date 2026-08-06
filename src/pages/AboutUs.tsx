import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Check, Leaf, Award, Users, Truck, CreditCard, Shield, Gift } from "lucide-react";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import ScrollReveal from "@/components/ScrollReveal";
import { DynamicSEO, Breadcrumbs } from "@/components/seo/index";
import { Skeleton } from "@/components/ui/skeleton";
import RichTextContent from "@/components/RichTextContent";

import pepperFarm from "@/assets/pepper-farm.jpg";
import factory from "@/assets/factory.jpg";
import spicesCollection from "@/assets/spices-collection.jpg";

interface AboutContent {
  hero_image: string;
  intro_title: string;
  intro_text: string;
  mission_title: string;
  mission_text: string;
  vision_title: string;
  vision_text: string;
  values: Array<{ title: string; description: string }>;
  story_image: string;
  story_text: string;
}

const defaultAboutCards = [
  {
    image: pepperFarm,
    title: "Chúng tôi là ai?",
    description: "CÔNG TY TNHH VINON là đơn vị chuyên sản xuất và phân phối tăm nhựa cao cấp hàng đầu Việt Nam. Chúng tôi tự hào là thương hiệu tăm nhựa đầu tiên đạt chứng nhận kiểm định Quốc tế Eurofins tại Việt Nam."
  },
  {
    image: factory,
    title: "Sản phẩm của chúng tôi",
    description: "Tăm nhựa Vinon được sản xuất từ nhựa nguyên sinh cao cấp, không mùi, không vị, độ dẻo cao. Thiết kế thông minh với hai đầu đa năng giúp loại bỏ mảng bám hiệu quả mà không làm thưa răng."
  },
  {
    image: spicesCollection,
    title: "Chứng nhận chất lượng",
    description: "Sản phẩm đạt chuẩn QCVN 12-1:2011/BYT, được kiểm nghiệm tại Eurofins Sắc Ký Hải Đăng. KHÔNG chứa kim loại nặng (Chì, Cadimi), an toàn tuyệt đối cho sức khỏe người tiêu dùng."
  }
];

const defaultQualityItems = [
  {
    icon: Leaf,
    title: "Nhựa nguyên sinh cao cấp",
    description: "Chất liệu nhựa nguyên sinh tinh khiết, không mùi, không vị, độ dẻo cao, không lo xước nướu hay gãy vụn như tăm tre truyền thống."
  },
  {
    icon: Award,
    title: "Chứng nhận Eurofins",
    description: "Đạt chuẩn QCVN 12-1:2011/BYT, được kiểm nghiệm tại Eurofins Sắc Ký Hải Đăng. KHÔNG chứa kim loại nặng (Chì, Cadimi)."
  },
  {
    icon: Users,
    title: "Thiết kế thông minh",
    description: "Hai đầu đa năng (một đầu nhọn, một đầu lông chải mềm) giúp loại bỏ mảng bám hiệu quả mà không làm thưa răng."
  },
  {
    icon: Shield,
    title: "Cam kết hoàn tiền 200%",
    description: "Hoàn tiền 200% nếu phát hiện sản phẩm chứa chất độc hại vượt ngưỡng cho phép."
  },
  {
    icon: Truck,
    title: "Giao hàng toàn quốc",
    description: "Hệ thống giao hàng nhanh chóng, đảm bảo sản phẩm đến tay khách hàng an toàn và nguyên vẹn."
  },
  {
    icon: Gift,
    title: "Công nghệ kháng khuẩn",
    description: "Quy trình sản xuất khép kín, đảm bảo vệ sinh tối đa từ nhà máy đến tay người dùng."
  }
];

const policies = [
  { icon: CreditCard, title: "THANH TOÁN DỄ DÀNG", desc: "Hỗ trợ thanh toán qua thẻ, ví điện tử và COD" },
  { icon: Truck, title: "GIAO HÀNG TOÀN QUỐC", desc: "Giao hàng nhanh chóng, đảm bảo chất lượng" },
  { icon: Shield, title: "AN TOÀN TUYỆT ĐỐI", desc: "Chứng nhận Eurofins, không chứa kim loại nặng" },
  { icon: Gift, title: "CAM KẾT 200%", desc: "Hoàn tiền 200% nếu phát hiện chất độc hại" }
];

const AboutUs = () => {
  const { data: pageContent, isLoading } = useQuery({
    queryKey: ["page-content", "about"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("page_key", "about")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const content = pageContent?.content as unknown as AboutContent | undefined;
  const title = pageContent?.title || "VỀ CHÚNG TÔI";
  const subtitle = pageContent?.subtitle || "";

  // Use content values or defaults
  const introText = content?.intro_text || "CÔNG TY TNHH VINON là đơn vị chuyên sản xuất và phân phối tăm nhựa cao cấp hàng đầu Việt Nam. Với cam kết mang đến sản phẩm an toàn tuyệt đối cho sức khỏe răng miệng, chúng tôi tự hào là thương hiệu tăm nhựa đầu tiên đạt chứng nhận kiểm định Quốc tế Eurofins tại Việt Nam.";
  const missionText = content?.mission_text || "Sứ mệnh của chúng tôi là bảo vệ sức khỏe răng miệng của mọi gia đình Việt Nam bằng sản phẩm tăm nhựa cao cấp, an toàn tuyệt đối, không chứa chất độc hại, và thân thiện với môi trường.";
  const visionText = content?.vision_text || "Trở thành thương hiệu tăm nhựa số 1 Việt Nam, được tin dùng bởi hàng triệu gia đình nhờ chất lượng vượt trội và cam kết an toàn tuyệt đối cho sức khỏe người tiêu dùng.";
  const storyText = content?.story_text || "Chúng tôi hiểu rằng sức khỏe của bạn bắt đầu từ những điều nhỏ nhất. Tăm nhựa Vinon đã trải qua các bước kiểm tra nghiêm ngặt tại trung tâm Eurofins Sắc Ký Hải Đăng và đạt kết quả hoàn hảo: Đạt chuẩn QCVN 12-1:2011/BYT, KHÔNG chứa kim loại nặng (Chì, Cadimi), và an toàn tuyệt đối với các chỉ số cặn khô trong ngưỡng an toàn cực thấp.";
  const heroImage = content?.hero_image || pepperFarm;
  const storyImage = content?.story_image || factory;
  const values = content?.values || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Dynamic SEO */}
      <DynamicSEO 
        title="Giới thiệu - Tăm Nhựa Vinon | Chứng Nhận Eurofins"
        description="CÔNG TY TNHH VINON - Sản xuất và phân phối tăm nhựa cao cấp đạt chuẩn kiểm định Quốc tế Eurofins. Sản phẩm an toàn tuyệt đối, không chứa kim loại nặng, đạt chuẩn QCVN 12-1:2011/BYT. Địa chỉ: 160/91/51/2/24 Khu Phố 4, Nguyễn Văn Quỳ, Phường Phú Thuận, Quận 7, TP. Hồ Chí Minh."
        keywords="giới thiệu tăm nhựa vinon, về chúng tôi, tăm nhựa cao cấp, tăm nhựa an toàn, công ty vinon, chứng nhận eurofins, tăm nhựa eurofins, tăm nhựa qcvn"
        url="/about"
      />
      <SpiceHeader />
      
      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={[{ label: "Giới thiệu" }]} />
        </div>
      </div>

      {/* Hero Section */}
      <section className="py-16 text-center">
        <div className="container mx-auto px-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-64 mx-auto" />
              <Skeleton className="h-6 w-96 mx-auto" />
              <Skeleton className="h-24 w-full max-w-3xl mx-auto" />
            </div>
          ) : (
            <ScrollReveal variant="fade-up">
              <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xl text-primary mb-6">{subtitle}</p>
              )}
              <div className="max-w-3xl mx-auto text-lg">
                <RichTextContent 
                  content={introText} 
                  prose={true}
                  className="text-muted-foreground"
                />
              </div>
            </ScrollReveal>
          )}
        </div>
      </section>

      {/* Hero Image */}
      {heroImage && (
        <section className="pb-16">
          <div className="container mx-auto px-4">
            <ScrollReveal variant="zoom-in">
              <div className="rounded-lg overflow-hidden max-h-[500px]">
                <img 
                  src={heroImage} 
                  alt={title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* Mission & Vision */}
      {(missionText || visionText) && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-8">
              {missionText && (
                <ScrollReveal variant="fade-right">
                  <div className="bg-card border border-border rounded-lg p-8">
                    <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
                      {content?.mission_title || "Sứ mệnh"}
                    </h2>
                    <RichTextContent 
                      content={missionText} 
                      prose={true}
                      className="text-muted-foreground"
                    />
                  </div>
                </ScrollReveal>
              )}
              {visionText && (
                <ScrollReveal variant="fade-left">
                  <div className="bg-card border border-border rounded-lg p-8">
                    <h2 className="text-2xl font-serif font-bold text-foreground mb-4">
                      {content?.vision_title || "Tầm nhìn"}
                    </h2>
                    <RichTextContent 
                      content={visionText} 
                      prose={true}
                      className="text-muted-foreground"
                    />
                  </div>
                </ScrollReveal>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Values */}
      {values.length > 0 && (
        <section className="py-16">
          <div className="container mx-auto px-4">
            <ScrollReveal variant="fade-up">
              <div className="text-center mb-12">
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground">
                  Giá trị cốt lõi
                </h2>
              </div>
            </ScrollReveal>
            <div className="grid md:grid-cols-3 gap-6">
              {values.map((value, index) => (
                <ScrollReveal key={index} variant="fade-up" delay={index * 100}>
                  <div className="bg-card border border-border rounded-lg p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <Check className="w-8 h-8 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold text-foreground mb-2">{value.title}</h3>
                    <p className="text-muted-foreground">{value.description}</p>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About Cards (default content) */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-3 gap-8">
            {defaultAboutCards.map((card, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 100}>
                <article className="group text-center">
                  <div className="relative overflow-hidden rounded-lg mb-6">
                    <img 
                      src={card.image} 
                      alt={card.title}
                      className="w-full h-64 object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                  <h3 className="text-xl font-serif font-semibold text-foreground mb-3">
                    {card.title}
                  </h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                </article>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* Quality Section */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <ScrollReveal variant="fade-up">
            <div className="text-center mb-12">
              <span className="text-primary font-medium">Tăm Nhựa Vinon</span>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2">
                CHẤT LƯỢNG TỐT NHẤT
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-8">
              {defaultQualityItems.slice(0, 3).map((item, index) => (
                <ScrollReveal key={index} variant="fade-right" delay={index * 100}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <item.icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>

            <ScrollReveal variant="zoom-in" delay={150}>
              <div className="flex items-center justify-center">
                <img 
                  src={spicesCollection} 
                  alt="Gia vị chất lượng"
                  className="rounded-lg shadow-lg max-h-96 object-cover"
                  loading="lazy"
                />
              </div>
            </ScrollReveal>

            <div className="space-y-8">
              {defaultQualityItems.slice(3, 6).map((item, index) => (
                <ScrollReveal key={index} variant="fade-left" delay={index * 100}>
                  <div className="flex gap-4">
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <item.icon className="w-6 h-6 text-primary" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                    </div>
                  </div>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Story Section */}
      {storyText && (
        <section className="py-16 bg-muted/30">
          <div className="container mx-auto px-4">
            <ScrollReveal variant="fade-up">
              <div className="grid md:grid-cols-2 gap-12 items-center">
                <div>
                  <img 
                    src={storyImage} 
                    alt="Câu chuyện thương hiệu"
                    className="w-full h-80 object-cover rounded-lg shadow-lg"
                    loading="lazy"
                  />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-4">
                    Câu chuyện thương hiệu
                  </h2>
                  <div className="mb-6">
                    <RichTextContent 
                      content={storyText} 
                      prose={true}
                      className="text-muted-foreground"
                    />
                  </div>
                  <Link 
                    to="/products" 
                    className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors font-medium"
                  >
                    Xem sản phẩm
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </section>
      )}

      {/* Policies */}
      <section className="py-12 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {policies.map((policy, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 50}>
                <div className="text-center">
                  <policy.icon className="w-10 h-10 text-primary mx-auto mb-3" />
                  <h3 className="font-semibold text-foreground text-sm mb-1">{policy.title}</h3>
                  <p className="text-xs text-muted-foreground">{policy.desc}</p>
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

export default AboutUs;
