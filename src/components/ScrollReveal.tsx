import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import useScrollReveal from "@/hooks/useScrollReveal";

type AnimationVariant = 
  | "fade-up" 
  | "fade-down" 
  | "fade-left" 
  | "fade-right" 
  | "zoom-in" 
  | "zoom-out"
  | "flip-up"
  | "flip-down";

interface ScrollRevealProps {
  children: ReactNode;
  variant?: AnimationVariant;
  delay?: number;
  duration?: number;
  className?: string;
  threshold?: number;
}

const animationStyles: Record<AnimationVariant, { hidden: string; visible: string }> = {
  "fade-up": {
    hidden: "opacity-0 translate-y-10",
    visible: "opacity-100 translate-y-0",
  },
  "fade-down": {
    hidden: "opacity-0 -translate-y-10",
    visible: "opacity-100 translate-y-0",
  },
  "fade-left": {
    hidden: "opacity-0 translate-x-10",
    visible: "opacity-100 translate-x-0",
  },
  "fade-right": {
    hidden: "opacity-0 -translate-x-10",
    visible: "opacity-100 translate-x-0",
  },
  "zoom-in": {
    hidden: "opacity-0 scale-90",
    visible: "opacity-100 scale-100",
  },
  "zoom-out": {
    hidden: "opacity-0 scale-110",
    visible: "opacity-100 scale-100",
  },
  "flip-up": {
    hidden: "opacity-0 rotate-x-90",
    visible: "opacity-100 rotate-x-0",
  },
  "flip-down": {
    hidden: "opacity-0 -rotate-x-90",
    visible: "opacity-100 rotate-x-0",
  },
};

const ScrollReveal = ({
  children,
  variant = "fade-up",
  delay = 0,
  duration = 600,
  className,
  threshold = 0.1,
}: ScrollRevealProps) => {
  const { ref, isVisible } = useScrollReveal({ threshold });
  const { hidden, visible } = animationStyles[variant];

  // Use will-change for better performance and to hint the browser about upcoming changes
  // This helps avoid forced reflows by allowing the browser to optimize rendering
  return (
    <div
      ref={ref}
      className={cn(
        "transition-all ease-out",
        isVisible ? visible : hidden,
        !isVisible && "will-change-transform,opacity", // Hint browser about upcoming changes
        className
      )}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        // Use transform and opacity for animations (GPU accelerated, no layout recalculation)
        // Avoid changing layout properties like width, height, margin, padding
      }}
    >
      {children}
    </div>
  );
};

export default ScrollReveal;
