import { Button } from "@/components/ui/button";
import heroImage from "@/assets/hero-toothpicks.jpg";
import { ArrowRight, Shield, Leaf, Star } from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";
import ScrollReveal from "@/components/ScrollReveal";

const Hero = () => {
  return (
    <section id="home" className="relative min-h-screen flex items-center pt-20">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-accent/50 via-background to-background" />
      
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Content */}
          <div className="space-y-8">
            <ScrollReveal variant="fade-up" delay={0}>
              <div className="inline-flex items-center gap-2 bg-accent px-4 py-2 rounded-full">
                <Star className="w-4 h-4 text-accent-foreground" fill="currentColor" />
                <span className="text-sm font-medium text-accent-foreground">
                  Sản phẩm chất lượng cao #1 Việt Nam
                </span>
              </div>
            </ScrollReveal>
            
            <ScrollReveal variant="fade-up" delay={100}>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold text-foreground leading-tight">
                Tăm Nhựa Cao Cấp
                <span className="text-primary block">An Toàn - Tiện Lợi</span>
              </h1>
            </ScrollReveal>
            
            <ScrollReveal variant="fade-up" delay={200}>
              <p className="text-lg text-muted-foreground max-w-lg">
                Sản phẩm tăm nhựa chất lượng cao, an toàn cho sức khỏe răng miệng, 
                được sản xuất theo tiêu chuẩn quốc tế và thân thiện với môi trường.
              </p>
            </ScrollReveal>

            <ScrollReveal variant="fade-up" delay={300}>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button size="lg" className="gap-2 text-lg px-8">
                  Khám phá sản phẩm
                  <ArrowRight className="w-5 h-5" />
                </Button>
                <Button size="lg" variant="outline" className="text-lg px-8">
                  Liên hệ tư vấn
                </Button>
              </div>
            </ScrollReveal>

            {/* Trust Badges */}
            <ScrollReveal variant="fade-up" delay={400}>
              <div className="flex flex-wrap gap-6 pt-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Shield className="w-5 h-5 text-primary" />
                  <span className="text-sm">An toàn FDA</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Leaf className="w-5 h-5 text-primary" />
                  <span className="text-sm">Thân thiện môi trường</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Star className="w-5 h-5 text-primary" />
                  <span className="text-sm">10,000+ khách hàng</span>
                </div>
              </div>
            </ScrollReveal>
          </div>

          {/* Hero Image */}
          <ScrollReveal variant="zoom-in" delay={200}>
            <div className="relative">
              <div className="absolute -inset-4 bg-gradient-to-r from-primary/20 to-accent rounded-3xl blur-3xl" />
              <div className="relative bg-card rounded-3xl p-8 shadow-xl">
                <OptimizedImage
                  src={heroImage}
                  alt="Tăm nhựa cao cấp đa màu sắc"
                  className="w-full h-auto rounded-2xl"
                  containerClassName="rounded-2xl"
                  priority={true}
                />
              </div>
            </div>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
};

export default Hero;
