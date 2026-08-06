import { TrendingUp, Star, Factory, Award, Heart, Shield, Users, Leaf, Sun, Layers, TreePine, Package, Globe, Target, Zap, CheckCircle, ThumbsUp, Trophy, LucideIcon } from "lucide-react";
import pepperFarm from "@/assets/pepper-farm.jpg";
import factory from "@/assets/factory.jpg";
import ScrollReveal from "@/components/ScrollReveal";
import { useHomepageContent } from "@/hooks/useHomepageContent";
import RichTextContent from "@/components/RichTextContent";

const iconMap: Record<string, LucideIcon> = {
  TrendingUp, Star, Factory, Award, Heart, Shield, Users, Leaf, Sun, Layers, TreePine, Package, Globe, Target, Zap, CheckCircle, ThumbsUp, Trophy
};

const defaultImages = [pepperFarm, pepperFarm, factory, factory];

const SpiceJourney = () => {
  const { content, isLoading } = useHomepageContent();

  if (isLoading) return null;

  return (
    <section className="py-20 bg-card">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center mb-16">
            <span className="text-muted-foreground">{content.journey_section_subtitle}</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2">
              {content.journey_section_title}
            </h2>
            <div className="flex items-center justify-center gap-2 mt-4">
              <div className="w-16 h-0.5 bg-border" />
              <div className="w-2 h-2 rotate-45 bg-primary" />
              <div className="w-16 h-0.5 bg-border" />
            </div>
          </div>
        </ScrollReveal>

        {/* Journey Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {content.journey_items.map((item, index) => {
            const IconComponent = iconMap[item.icon] || Star;
            const imageUrl = item.image_url || defaultImages[index % defaultImages.length];
            
            return (
              <ScrollReveal key={index} variant="fade-up" delay={index * 100}>
                <div className="text-center group">
                  <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-primary/30 flex items-center justify-center group-hover:border-primary transition-colors">
                    <IconComponent className="w-8 h-8 text-primary" />
                  </div>
                  <div className="aspect-video rounded-lg overflow-hidden mb-4">
                    <img 
                      src={imageUrl} 
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <div className="text-sm">
                    <RichTextContent 
                      content={item.description} 
                      prose={false}
                      className="text-muted-foreground"
                    />
                  </div>
                </div>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default SpiceJourney;
