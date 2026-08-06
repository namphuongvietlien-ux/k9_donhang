import { Button } from "@/components/ui/button";
import pepperFarm from "@/assets/pepper-farm.jpg";
import spicesCollection from "@/assets/spices-collection.jpg";
import ScrollReveal from "@/components/ScrollReveal";
import { useHomepageContent } from "@/hooks/useHomepageContent";
import { Link } from "react-router-dom";
import RichTextContent from "@/components/RichTextContent";

const defaultImages = [pepperFarm, spicesCollection];

const SpiceStory = () => {
  const { content, isLoading } = useHomepageContent();

  if (isLoading) return null;

  return (
    <section id="about" className="py-20 bg-background">
      <div className="container mx-auto px-4 space-y-20">
        {content.story_items.map((item, index) => {
          const imageUrl = item.image_url || defaultImages[index % defaultImages.length];
          const isReversed = index % 2 !== 0;

          return (
            <div key={index} className="grid lg:grid-cols-2 gap-12 items-center">
              <ScrollReveal variant={isReversed ? "fade-right" : "fade-right"} className={isReversed ? "lg:order-2" : ""}>
                <div className="rounded-2xl overflow-hidden">
                  <img 
                    src={imageUrl}
                    alt={item.title}
                    className="w-full h-auto object-cover"
                  />
                </div>
              </ScrollReveal>
              
              <ScrollReveal variant={isReversed ? "fade-left" : "fade-left"} delay={200} className={isReversed ? "lg:order-1" : ""}>
                <div className="space-y-6">
                  <h3 className="text-2xl md:text-3xl font-serif font-bold text-foreground">
                    {item.title}
                  </h3>
                  <RichTextContent 
                    content={item.description} 
                    prose={true}
                    className="text-muted-foreground"
                  />
                  {item.button_text && (
                    <Button asChild>
                      <Link to={item.button_link || "/about"}>{item.button_text}</Link>
                    </Button>
                  )}
                </div>
              </ScrollReveal>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default SpiceStory;
