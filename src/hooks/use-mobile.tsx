import * as React from "react";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // Use matchMedia to avoid forced reflow - it doesn't require layout calculation
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    
    // Use requestAnimationFrame to batch state updates and avoid forced reflow
    const updateState = () => {
      requestAnimationFrame(() => {
        setIsMobile(mql.matches);
      });
    };
    
    // Set initial state without reading layout properties
    updateState();
    
    // Use modern event listener API
    if (mql.addEventListener) {
      mql.addEventListener("change", updateState);
      return () => mql.removeEventListener("change", updateState);
    } else {
      // Fallback for older browsers
      mql.addListener(updateState);
      return () => mql.removeListener(updateState);
    }
  }, []);

  return !!isMobile;
}
