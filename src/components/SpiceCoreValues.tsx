import { Heart, Star, Shield, Users, Leaf, Sun, Layers, TreePine, TrendingUp, Factory, Award, Package, Globe, Target, Zap, CheckCircle, ThumbsUp, Trophy, LucideIcon } from "lucide-react";
import spicesCollection from "@/assets/spices-collection.jpg";
import ScrollReveal from "@/components/ScrollReveal";
import { useHomepageContent } from "@/hooks/useHomepageContent";
import RichTextContent from "@/components/RichTextContent";

const iconMap: Record<string, LucideIcon> = {
  Heart, Star, Shield, Users, Leaf, Sun, Layers, TreePine, TrendingUp, Factory, Award, Package, Globe, Target, Zap, CheckCircle, ThumbsUp, Trophy
};

const SpiceCoreValues = () => {
  const { content, isLoading } = useHomepageContent();

  if (isLoading) return null;

  const leftValues = content.core_values.slice(0, Math.ceil(content.core_values.length / 2));
  const rightValues = content.core_values.slice(Math.ceil(content.core_values.length / 2));
  const centerImage = content.core_values_image || spicesCollection;

  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center mb-16">
            <span className="text-primary font-medium">{content.core_values_section_subtitle}</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2">
              {content.core_values_section_title}
            </h2>
          </div>
        </ScrollReveal>

        {/* Values Grid with Center Image */}
        <div className="grid lg:grid-cols-3 gap-8 items-center">
          {/* Left Column */}
          <div className="space-y-8">
            {leftValues.map((value, index) => {
              const IconComponent = iconMap[value.icon] || Star;
              return (
                <ScrollReveal key={index} variant="fade-right" delay={index * 100}>
                  <div className="flex items-start gap-4 group">
                    <div className="flex-1 text-right">
                      <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {value.title}
                      </h3>
                      <div className="text-sm">
                        <RichTextContent 
                          content={value.description} 
                          prose={false}
                          className="text-muted-foreground"
                        />
                      </div>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center flex-shrink-0 group-hover:bg-primary transition-colors">
                      <IconComponent className="w-6 h-6 text-accent-foreground group-hover:text-primary-foreground transition-colors" />
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>

          {/* Center Image */}
          <ScrollReveal variant="zoom-in" delay={200}>
            <div className="relative hidden lg:block">
              <div className="aspect-square rounded-full overflow-hidden border-8 border-accent">
                <img 
                  src={centerImage} 
                  alt="Bộ sưu tập gia vị"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </ScrollReveal>

          {/* Right Column */}
          <div className="space-y-8">
            {rightValues.map((value, index) => {
              const IconComponent = iconMap[value.icon] || Star;
              return (
                <ScrollReveal key={index} variant="fade-left" delay={index * 100}>
                  <div className="flex items-start gap-4 group">
                    <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center flex-shrink-0 group-hover:bg-primary transition-colors">
                      <IconComponent className="w-6 h-6 text-accent-foreground group-hover:text-primary-foreground transition-colors" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-foreground mb-1 group-hover:text-primary transition-colors">
                        {value.title}
                      </h3>
                      <div className="text-sm">
                        <RichTextContent 
                          content={value.description} 
                          prose={false}
                          className="text-muted-foreground"
                        />
                      </div>
                    </div>
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default SpiceCoreValues;
