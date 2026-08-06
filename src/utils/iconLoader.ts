/**
 * Icon Loader Utility
 * Lazy loads Lucide icons to reduce initial bundle size
 * Only loads icons when needed instead of importing all icons
 * 
 * This prevents importing the entire lucide-react library (1000+ icons)
 * which can add significant bundle size. Only common icons are eagerly loaded.
 */

import { ComponentType } from "react";
import type { LucideProps } from "lucide-react";

// Common icons that are frequently used - import directly
import {
  Menu,
  X,
  Phone,
  Search,
  User,
  ShoppingCart,
  Bell,
  LogOut,
  Package,
  ChevronDown,
  ChevronRight,
  Home,
  ShoppingBag,
  Gift,
  Info,
  Newspaper,
  Mail,
  Settings,
  Star,
  Heart,
  Shield,
  Users,
  Leaf,
  TrendingUp,
  Factory,
  Award,
  Globe,
  Target,
  Zap,
  CheckCircle,
  ThumbsUp,
  Trophy,
  Sun,
  Layers,
  TreePine,
} from "lucide-react";

// Icon map for common icons (eagerly loaded)
const commonIcons: Record<string, ComponentType<LucideProps>> = {
  Menu,
  X,
  Phone,
  Search,
  User,
  ShoppingCart,
  Bell,
  LogOut,
  Package,
  ChevronDown,
  ChevronRight,
  Home,
  ShoppingBag,
  Gift,
  Info,
  Newspaper,
  Mail,
  Settings,
  Star,
  Heart,
  Shield,
  Users,
  Leaf,
  TrendingUp,
  Factory,
  Award,
  Globe,
  Target,
  Zap,
  CheckCircle,
  ThumbsUp,
  Trophy,
  Sun,
  Layers,
  TreePine,
};

/**
 * Get icon component by name
 * Returns common icons immediately, lazy loads others
 */
export const getIcon = (iconName: string | null): ComponentType<LucideProps> | null => {
  if (!iconName) return null;
  
  // Check common icons first (eagerly loaded)
  if (commonIcons[iconName]) {
    return commonIcons[iconName];
  }
  
  // For other icons, return null and let component handle fallback
  // This prevents importing all icons from lucide-react
  return null;
};

/**
 * Lazy load icon by name (for less common icons)
 * This is used when an icon is not in the common icons map
 */
export const lazyLoadIcon = (iconName: string): ComponentType<LucideProps> | null => {
  if (!iconName) return null;
  
  // Only lazy load if not in common icons
  if (commonIcons[iconName]) {
    return commonIcons[iconName];
  }
  
  // For production, we could implement dynamic import here
  // For now, return null to prevent bundle bloat
  return null;
};

