import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import OptimizedImage from "@/components/OptimizedImage";
import heroSpices from "@/assets/hero-spices.jpg";

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  button_text: string | null;
  button_link: string | null;
}

const SLIDE_INTERVAL = 5000; // 5 seconds

const SpiceHero = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const { data: banners = [] } = useQuery({
    queryKey: ["banners"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("banners")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data as Banner[];
    },
    // Optimize for LCP: Don't block initial render, fetch in background
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    refetchOnMount: false, // Don't refetch if data exists
    refetchOnWindowFocus: false, // Don't refetch on focus
    // Critical: Don't block LCP - use fallback immediately
    placeholderData: [], // Use empty array as placeholder to avoid blocking
  });

  // Fallback slide when no banners
  const fallbackSlide: Banner = {
    id: "fallback",
    title: "TĂM NHỰA CAO CẤP VINON",
    subtitle: "Sạch Từng Kẽ Răng, An Toàn Tuyệt Đối\nSản phẩm đạt chuẩn kiểm định Quốc tế Eurofins",
    image_url: heroSpices,
    button_text: "Mua Ngay",
    button_link: "/products",
  };

  const slides = banners.length > 0 ? banners : [fallbackSlide];

  const goToSlide = useCallback((index: number) => {
    if (index === currentSlide || isTransitioning) return;
    setIsTransitioning(true);
    setCurrentSlide(index);
    setTimeout(() => setIsTransitioning(false), 500);
  }, [currentSlide, isTransitioning]);

  const nextSlide = useCallback(() => {
    const next = (currentSlide + 1) % slides.length;
    goToSlide(next);
  }, [currentSlide, slides.length, goToSlide]);

  // Auto-advance slides every 5 seconds
  useEffect(() => {
    if (slides.length <= 1) return;
    
    const interval = setInterval(nextSlide, SLIDE_INTERVAL);
    return () => clearInterval(interval);
  }, [slides.length, nextSlide]);

  const currentBanner = slides[currentSlide];
  const isFirstSlide = currentSlide === 0;

  return (
    <section id="home" className="relative min-h-screen flex items-center pt-32 overflow-hidden">
      {/* Background Images with Transition - Optimized for LCP */}
      {slides.map((slide, index) => {
        const isActive = index === currentSlide;
        const isFirst = index === 0;
        
        return (
          <div
            key={slide.id}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 ease-in-out",
              isActive ? "opacity-100 z-0" : "opacity-0 z-0 pointer-events-none"
            )}
          >
            {/* Use OptimizedImage for first slide (LCP element) */}
            {isFirst ? (
              <OptimizedImage
                src={slide.image_url}
                alt={slide.title || "Hero image"}
                className="absolute inset-0 w-full h-full object-cover"
                containerClassName="absolute inset-0 w-full h-full"
                priority={true}
                sizes="100vw"
                width={1920}
                height={1080}
                // Critical: Add fetchpriority for LCP optimization
              />
            ) : (
              <img
                src={slide.image_url}
                alt={slide.title || "Hero image"}
                className="absolute inset-0 w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                fetchpriority={isActive ? "high" : "low"}
                width={1920}
                height={1080}
              />
            )}
            <div className="absolute inset-0 bg-foreground/40" />
          </div>
        );
      })}

      {/* Content with Fade Animation */}
      <div className="container mx-auto px-4 relative z-10 text-center">
        <div
          key={currentBanner.id}
          className="animate-fade-in"
        >
          <h2 className="text-2xl md:text-3xl font-serif text-card/90 tracking-[0.3em] mb-4">
            {currentBanner.title}
          </h2>
          {currentBanner.subtitle && (
            <p className="text-xl md:text-2xl lg:text-3xl font-serif text-card italic max-w-3xl mx-auto leading-relaxed whitespace-pre-line">
              {currentBanner.subtitle}
            </p>
          )}
          {currentBanner.button_text && currentBanner.button_link && (
            <Link to={currentBanner.button_link} className="mt-8 inline-block">
              <Button variant="secondary" size="lg" className="text-lg px-8">
                {currentBanner.button_text}
              </Button>
            </Link>
          )}
        </div>

        {/* Slider Dots */}
        {slides.length > 1 && (
          <div className="flex items-center justify-center gap-2 mt-12">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => goToSlide(index)}
                className={cn(
                  "w-3 h-3 rounded-full transition-all duration-300",
                  index === currentSlide
                    ? "bg-primary w-8"
                    : "bg-card/50 hover:bg-card"
                )}
                aria-label={`Slide ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default SpiceHero;
