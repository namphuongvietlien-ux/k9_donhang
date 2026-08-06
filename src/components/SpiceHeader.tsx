import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, X, Phone, Search, User, ShoppingCart, Bell, LogOut, Package, ChevronDown, ChevronRight } from "lucide-react";
import SearchDialog from "./SearchDialog";
import { getIcon } from "@/utils/iconLoader";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { useMenuItems, MenuItem } from "@/hooks/useMenuItems";
import { SiteNavigationSchema } from "@/components/seo/index";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

const SpiceHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [expandedMenuItems, setExpandedMenuItems] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const { openCart, totalItems } = useCart();
  
  // Helper to check if a menu item is active
  const isActive = (href: string) => {
    if (href === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(href);
  };
  
  // Helper to check if any child is active
  const hasActiveChild = (item: MenuItem): boolean => {
    if (!item.children || item.children.length === 0) return false;
    return item.children.some(child => isActive(child.href));
  };
  
  // Toggle expanded state for mobile menu
  const toggleExpanded = (itemId: string) => {
    setExpandedMenuItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };
  
  // Handle keyboard navigation for mobile menu
  useEffect(() => {
    if (!isMenuOpen) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsMenuOpen(false);
      }
      // Trap focus within menu when open
      if (e.key === "Tab" && menuRef.current) {
        const focusableElements = menuRef.current.querySelectorAll(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;
        
        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault();
          lastElement?.focus();
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault();
          firstElement?.focus();
        }
      }
    };
    
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMenuOpen]);
  const { user, signOut } = useAuth();
  const { data: settings } = useSiteSettings();
  const { data: menuItems = [], isLoading: isLoadingMenu } = useMenuItems();

  // Fallback to default items if menu is loading or empty
  const defaultMenuItems: MenuItem[] = [
    { id: "1", label: "Trang chủ", href: "/", is_external: false, icon: null, parent_id: null, display_order: 1, is_active: true, target_blank: false },
    { id: "2", label: "Sản phẩm", href: "/products", is_external: false, icon: null, parent_id: null, display_order: 2, is_active: true, target_blank: false },
    { id: "3", label: "Khuyến mãi", href: "/promotions", is_external: false, icon: null, parent_id: null, display_order: 3, is_active: true, target_blank: false },
    { id: "4", label: "Giới thiệu", href: "/about", is_external: false, icon: null, parent_id: null, display_order: 4, is_active: true, target_blank: false },
    { id: "5", label: "Tin tức", href: "/news", is_external: false, icon: null, parent_id: null, display_order: 5, is_active: true, target_blank: false },
    { id: "6", label: "Liên hệ", href: "/contact", is_external: false, icon: null, parent_id: null, display_order: 6, is_active: true, target_blank: false },
  ];

  const displayMenuItems = menuItems.length > 0 ? menuItems : defaultMenuItems;

  // Navigation items for SEO schema (nested structure)
  const navigationSchemaItems = displayMenuItems
    .filter(item => !item.is_external)
    .map(item => {
      const baseItem = { name: item.label, url: item.href };
      if (item.children && item.children.length > 0) {
        const children = item.children
          .filter(child => !child.is_external)
          .map(child => ({ name: child.label, url: child.href }));
        return { ...baseItem, children };
      }
      return baseItem;
    });

  // Helper to get icon component - uses optimized icon loader
  const renderIcon = (iconName: string | null) => {
    if (!iconName) return null;
    const IconComponent = getIcon(iconName);
    return IconComponent ? <IconComponent className="w-4 h-4" /> : null;
  };

  return (
    <>
    <SiteNavigationSchema items={navigationSchemaItems} />
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* Top Bar */}
      <div className="bg-foreground text-card py-2">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex items-center justify-between text-xs sm:text-sm gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0 flex-1">
              <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary flex-shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap">Hotline:</span>
              <a 
                href={`tel:${settings?.phone?.replace(/\D/g, "")}`} 
                className="font-semibold text-primary hover:underline whitespace-nowrap flex-shrink-0 min-h-[44px] flex items-center px-1"
                aria-label={`Gọi hotline ${settings?.phone || "1900.636.000"}`}
              >
                {settings?.phone || "1900.636.000"}
              </a>
              <span className="text-card/70 hidden sm:inline whitespace-nowrap">(8h - 12h, 13h30 - 17h)</span>
              <span className="mx-2 sm:mx-4 text-card/50 hidden sm:inline" aria-hidden="true">|</span>
              <Link 
                to="/contact" 
                className="hover:text-primary transition-colors whitespace-nowrap flex-shrink-0 min-h-[44px] flex items-center px-1"
                aria-label="Liên hệ với chúng tôi"
              >
                Liên hệ
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-2 flex-shrink-0">
              <Bell className="w-4 h-4" aria-hidden="true" />
              <span>Thông báo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="bg-card border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            {/* Logo */}
            <Link to="/" className="flex items-center">
              {settings?.logo_url ? (
                <img 
                  src={settings.logo_url} 
                  alt={settings?.site_name || "Logo"} 
                  className="h-10 md:h-12 object-contain"
                />
              ) : (
                <span className="font-serif text-2xl md:text-3xl font-bold text-foreground tracking-wide">
                  {settings?.site_name || "Black Pepper"}
                </span>
              )}
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-8" aria-label="Menu điều hướng chính">
              {isLoadingMenu ? (
                // Loading skeleton
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-6 w-20 bg-muted animate-pulse rounded" aria-hidden="true" />
                ))
              ) : (
                displayMenuItems.map((item) => {
                const icon = renderIcon(item.icon);
                const hasChildren = item.children && item.children.length > 0;

                // Menu item with children (hover dropdown)
                if (hasChildren) {
                  const isParentActive = hasActiveChild(item);
                  return (
                    <HoverCard key={item.id} openDelay={150} closeDelay={200}>
                      <HoverCardTrigger asChild>
                        <button 
                          className={cn(
                            "text-foreground hover:text-primary transition-all duration-300 ease-out font-medium relative group flex items-center gap-1",
                            isParentActive && "text-primary"
                          )}
                          aria-label={`${item.label}, có menu con`}
                          aria-expanded="false"
                          aria-haspopup="true"
                        >
                          {icon}
                          <span className="transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
                          <ChevronDown className={cn(
                            "w-4 h-4 opacity-70 transition-all duration-300 ease-out",
                            "group-hover:opacity-100 group-hover:rotate-180"
                          )} />
                          <span className={cn(
                            "absolute -bottom-1 left-0 h-0.5 bg-primary transition-all duration-300 ease-out origin-left",
                            isParentActive ? "w-full scale-x-100" : "w-0 scale-x-0 group-hover:w-full group-hover:scale-x-100"
                          )} />
                        </button>
                      </HoverCardTrigger>
                      <HoverCardContent 
                        align="start" 
                        className="min-w-[200px] p-1.5" 
                        sideOffset={8} 
                        role="menu"
                      >
                        <div className="flex flex-col gap-0.5">
                          {item.children?.map((child, index) => {
                            const childIcon = renderIcon(child.icon);
                            const childIsActive = isActive(child.href);
                            const childLinkClass = cn(
                              "flex items-center gap-2 px-3 py-2.5 text-sm rounded-md",
                              "hover:bg-accent hover:text-accent-foreground",
                              "transition-all duration-200 ease-out cursor-pointer",
                              "transform hover:translate-x-1 hover:scale-[1.02]",
                              "group",
                              childIsActive && "bg-accent/50 text-accent-foreground font-medium"
                            );
                            
                            return child.is_external ? (
                              <a
                                key={child.id}
                                href={child.href}
                                target={child.target_blank ? "_blank" : undefined}
                                rel={child.target_blank ? "noopener noreferrer" : undefined}
                                className={childLinkClass}
                                role="menuitem"
                                aria-label={child.label}
                                style={{
                                  animation: `fadeInUp 0.3s ease-out ${index * 30}ms forwards`
                                }}
                              >
                                {childIcon && <span className="transition-transform duration-200 group-hover:scale-110">{childIcon}</span>}
                                <span>{child.label}</span>
                              </a>
                            ) : (
                              <Link
                                key={child.id}
                                to={child.href}
                                className={childLinkClass}
                                role="menuitem"
                                aria-label={child.label}
                                style={{
                                  animation: `fadeInUp 0.3s ease-out ${index * 30}ms forwards`
                                }}
                              >
                                {childIcon && <span className="transition-transform duration-200 group-hover:scale-110">{childIcon}</span>}
                                <span>{child.label}</span>
                              </Link>
                            );
                          })}
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                }

                // Regular menu item (no children)
                const itemIsActive = isActive(item.href);
                const linkClass = cn(
                  "text-foreground hover:text-primary transition-all duration-300 ease-out font-medium relative group flex items-center gap-2",
                  "hover:scale-105",
                  itemIsActive && "text-primary"
                );
                const underlineClass = cn(
                  "absolute -bottom-1 left-0 h-0.5 bg-primary transition-all duration-300 ease-out origin-left",
                  itemIsActive ? "w-full scale-x-100" : "w-0 scale-x-0 group-hover:w-full group-hover:scale-x-100"
                );
                const linkProps = {
                  className: linkClass,
                  ...(item.target_blank && { target: "_blank", rel: "noopener noreferrer" }),
                };

                return item.is_external ? (
                  <a key={item.id} href={item.href} {...linkProps} aria-label={item.label}>
                    {icon && <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>}
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
                    <span className={underlineClass} />
                  </a>
                ) : (
                  <Link key={item.id} to={item.href} {...linkProps} aria-label={item.label}>
                    {icon && <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>}
                    <span className="transition-transform duration-200 group-hover:translate-x-0.5">{item.label}</span>
                    <span className={underlineClass} />
                  </Link>
                );
              }))}
            </nav>

            {/* Actions */}
            <div className="flex items-center gap-2 sm:gap-4">
              <button 
                className="p-2.5 min-h-[44px] min-w-[44px] hover:text-primary transition-colors rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" 
                aria-label="Tìm kiếm"
                onClick={() => setIsSearchOpen(true)}
              >
                <Search className="w-5 h-5" aria-hidden="true" />
              </button>
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="p-2.5 min-h-[44px] hover:text-primary transition-colors hidden md:flex items-center gap-2 rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" aria-label={`Tài khoản: ${user.email?.split('@')[0]}`}>
                      <User className="w-5 h-5" aria-hidden="true" />
                      <span className="text-sm max-w-[100px] truncate">{user.email?.split('@')[0]}</span>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link to="/profile" className="cursor-pointer min-h-[44px] flex items-center">
                        <User className="w-4 h-4 mr-2" aria-hidden="true" />
                        Hồ sơ của tôi
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/orders" className="cursor-pointer min-h-[44px] flex items-center">
                        <Package className="w-4 h-4 mr-2" aria-hidden="true" />
                        Lịch sử đơn hàng
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive min-h-[44px] flex items-center">
                      <LogOut className="w-4 h-4 mr-2" aria-hidden="true" />
                      Đăng xuất
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link to="/auth" className="p-2.5 min-h-[44px] min-w-[44px] hover:text-primary transition-colors hidden md:flex items-center justify-center rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" aria-label="Đăng nhập hoặc đăng ký tài khoản">
                  <User className="w-5 h-5" aria-hidden="true" />
                </Link>
              )}
              <button 
                className="p-2.5 min-h-[44px] min-w-[44px] hover:text-primary transition-colors relative rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2" 
                aria-label={`Giỏ hàng, có ${totalItems} sản phẩm`}
                onClick={openCart}
              >
                <ShoppingCart className="w-5 h-5" aria-hidden="true" />
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center" aria-hidden="true">
                    {totalItems}
                  </span>
                )}
              </button>

              {/* Mobile Menu Button */}
              <button
                className="lg:hidden p-2.5 min-h-[44px] min-w-[44px] text-foreground rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label={isMenuOpen ? "Đóng menu" : "Mở menu"}
                aria-expanded={isMenuOpen}
              >
                {isMenuOpen ? <X size={24} aria-hidden="true" /> : <Menu size={24} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {/* Mobile Menu */}
          {isMenuOpen && (
            <nav 
              ref={menuRef}
              className="lg:hidden py-4 border-t border-border"
              role="menu"
              aria-label="Menu điều hướng"
            >
              <div className="flex flex-col gap-2">
                {displayMenuItems.map((item) => {
                  const icon = renderIcon(item.icon);
                  const hasChildren = item.children && item.children.length > 0;

                  // Menu item with children (expandable)
                  if (hasChildren) {
                    const isExpanded = expandedMenuItems.has(item.id);
                    const isParentActive = hasActiveChild(item);
                    return (
                      <div key={item.id} className="flex flex-col overflow-hidden">
                        <button
                          onClick={() => toggleExpanded(item.id)}
                          className={cn(
                            "text-foreground hover:text-primary transition-all duration-300 ease-out font-medium py-3 px-2 flex items-center justify-between w-full focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 rounded-md",
                            "hover:bg-accent/50 hover:scale-[1.02]",
                            isParentActive && "text-primary bg-accent/30"
                          )}
                          aria-expanded={isExpanded}
                          aria-label={`${item.label}, có menu con, ${isExpanded ? "đã mở" : "đã đóng"}`}
                        >
                          <div className="flex items-center gap-2">
                            {icon && <span className="transition-transform duration-200">{icon}</span>}
                            <span className="transition-transform duration-200">{item.label}</span>
                          </div>
                          <ChevronRight className={cn(
                            "w-4 h-4 transition-all duration-300 ease-out",
                            isExpanded && "rotate-90"
                          )} />
                        </button>
                        <div 
                          className={cn(
                            "overflow-hidden transition-all duration-300 ease-out",
                            isExpanded ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                          )}
                          role="menu"
                        >
                          <div className="pl-6 flex flex-col gap-1 pt-1">
                            {item.children?.map((child, index) => {
                              const childIcon = renderIcon(child.icon);
                              const childIsActive = isActive(child.href);
                              const childLinkProps = {
                                className: cn(
                                  "text-muted-foreground hover:text-primary transition-all duration-200 ease-out font-medium py-2.5 px-3 rounded-md",
                                  "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                                  "flex items-center gap-2 hover:bg-accent/50 hover:translate-x-1 hover:scale-[1.02]",
                                  "transform opacity-0",
                                  childIsActive && "text-primary font-semibold bg-accent/30"
                                ),
                                onClick: () => setIsMenuOpen(false),
                                role: "menuitem" as const,
                                style: isExpanded ? {
                                  animation: `fadeInUp 0.3s ease-out ${index * 50}ms forwards`
                                } : {},
                                ...(child.target_blank && { target: "_blank", rel: "noopener noreferrer" }),
                              };

                              return child.is_external ? (
                                <a key={child.id} href={child.href} {...childLinkProps} aria-label={child.label}>
                                  {childIcon && <span className="transition-transform duration-200 group-hover:scale-110">{childIcon}</span>}
                                  <span>{child.label}</span>
                                </a>
                              ) : (
                                <Link key={child.id} to={child.href} {...childLinkProps} aria-label={child.label}>
                                  {childIcon && <span className="transition-transform duration-200 group-hover:scale-110">{childIcon}</span>}
                                  <span>{child.label}</span>
                                </Link>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Regular menu item (no children)
                  const itemIsActive = isActive(item.href);
                  const linkProps = {
                    className: cn(
                      "text-foreground hover:text-primary transition-all duration-300 ease-out font-medium py-3 px-2 rounded-md",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                      "flex items-center gap-2 hover:bg-accent/50 hover:scale-[1.02] hover:translate-x-1",
                      itemIsActive && "text-primary font-semibold bg-accent/30"
                    ),
                    onClick: () => setIsMenuOpen(false),
                    role: "menuitem" as const,
                    ...(item.target_blank && { target: "_blank", rel: "noopener noreferrer" }),
                  };

                  return item.is_external ? (
                    <a key={item.id} href={item.href} {...linkProps} aria-label={item.label}>
                      {icon && <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>}
                      <span className="transition-transform duration-200">{item.label}</span>
                    </a>
                  ) : (
                    <Link key={item.id} to={item.href} {...linkProps} aria-label={item.label}>
                      {icon && <span className="transition-transform duration-200 group-hover:scale-110">{icon}</span>}
                      <span className="transition-transform duration-200">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}
        </div>
      </div>
    </header>

    <SearchDialog open={isSearchOpen} onOpenChange={setIsSearchOpen} />
    </>
  );
};

export default SpiceHeader;
