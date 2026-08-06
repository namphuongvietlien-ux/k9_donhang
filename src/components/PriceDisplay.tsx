import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

interface PriceDisplayProps {
  price: number;
  originalPrice?: number;
  maskEnabled?: boolean;
  maskHideFirstDigits?: number; // Number of first digits to hide (default: 1)
  className?: string;
  showOriginalPrice?: boolean;
  revealOnHover?: boolean; // Show full price on hover (desktop)
  revealOnClick?: boolean; // Show full price on click/tap
}

/**
 * Format price to Vietnamese currency format
 */
const formatPrice = (price: number): string => {
  return new Intl.NumberFormat("vi-VN").format(price) + "₫";
};

/**
 * Mask price by hiding first N digits
 * Example: 125000 -> "?25000" (hide 1 digit)
 * Example: 125000 -> "?5000" (hide 2 digits)
 */
const maskPrice = (price: number, hideFirstDigits: number = 1): string => {
  const priceStr = Math.round(price).toString();
  
  if (hideFirstDigits <= 0 || hideFirstDigits >= priceStr.length) {
    return "?" + priceStr;
  }
  
  // Hide first N digits
  const masked = "?".repeat(hideFirstDigits) + priceStr.slice(hideFirstDigits);
  
  // Format with thousand separators
  // Convert back to number, then format
  const visiblePart = priceStr.slice(hideFirstDigits);
  if (visiblePart.length === 0) {
    return "?" + formatPrice(price).slice(1); // Remove the ₫ and add ?
  }
  
  // Try to format the visible part with separators
  // This is tricky because we need to maintain the format
  // For now, let's just add ? at the beginning
  const formatted = formatPrice(price);
  const parts = formatted.split(".");
  const mainPart = parts[0].replace(/\D/g, ""); // Remove all non-digits
  
  if (hideFirstDigits >= mainPart.length) {
    return "?" + formatted.slice(1);
  }
  
  // Replace first N digits with ?
  const maskedMain = "?".repeat(hideFirstDigits) + mainPart.slice(hideFirstDigits);
  
  // Reconstruct with separators
  // Format the visible part
  const visibleDigits = mainPart.slice(hideFirstDigits);
  const formattedVisible = new Intl.NumberFormat("vi-VN").format(parseInt(visibleDigits) || 0);
  
  return "?".repeat(hideFirstDigits) + formattedVisible + (parts[1] ? "." + parts[1] : "") + "₫";
};

/**
 * Simplified mask function - replace first N digits with ?
 * Example: 125.000đ -> ?25.000đ (hide 1 digit)
 * Example: 125.000đ -> ?5.000đ (hide 2 digits)
 */
const maskPriceSimple = (price: number, hideFirstDigits: number = 1): string => {
  const priceInt = Math.round(price);
  const priceStr = priceInt.toString();
  
  if (hideFirstDigits <= 0 || hideFirstDigits >= priceStr.length) {
    // If hiding all or none, just show ? at the beginning
    const formatted = formatPrice(price);
    return "?" + formatted.slice(1);
  }
  
  // Hide first N digits
  const visiblePart = priceStr.slice(hideFirstDigits);
  const visiblePrice = parseInt(visiblePart) || 0;
  
  // Format the visible part
  const formattedVisible = new Intl.NumberFormat("vi-VN").format(visiblePrice);
  
  // Add ? at the beginning
  return "?".repeat(hideFirstDigits) + formattedVisible + "₫";
};

const PriceDisplay = ({
  price,
  originalPrice,
  maskEnabled = false,
  maskHideFirstDigits = 1,
  className = "",
  showOriginalPrice = true,
  revealOnHover = true,
  revealOnClick = true,
}: PriceDisplayProps) => {
  const [isRevealed, setIsRevealed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Determine if we should show masked price
  const shouldMask = maskEnabled && !isRevealed && (!revealOnHover || !isHovered);
  
  const displayPrice = shouldMask 
    ? maskPriceSimple(price, maskHideFirstDigits)
    : formatPrice(price);

  const handleClick = () => {
    if (revealOnClick && shouldMask) {
      setIsRevealed(true);
    }
  };

  const handleMouseEnter = () => {
    if (revealOnHover) {
      setIsHovered(true);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="flex items-center gap-2 cursor-pointer group"
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        role={shouldMask ? "button" : undefined}
        tabIndex={shouldMask ? 0 : undefined}
        aria-label={shouldMask ? `Giá: ${formatPrice(price)} (Nhấn để xem)` : `Giá: ${formatPrice(price)}`}
      >
        <span className={`text-lg font-bold ${shouldMask ? "text-primary" : "text-primary"}`}>
          {displayPrice}
        </span>
        {shouldMask && (
          <EyeOff className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
        )}
        {isRevealed && (
          <Eye className="w-4 h-4 text-muted-foreground" />
        )}
      </div>
      {showOriginalPrice && originalPrice && originalPrice !== price && (
        <span className="text-sm text-muted-foreground line-through">
          {formatPrice(originalPrice)}
        </span>
      )}
    </div>
  );
};

export default PriceDisplay;
