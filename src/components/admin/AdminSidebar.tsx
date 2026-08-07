import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Image,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  Menu,
  Ticket,
  FolderTree,
  Star,
  Mail,
  MessageSquare,
  MapPin,
  Zap,
  ChevronDown,
  Store,
  Newspaper,
  Globe,
  Users,
  Truck,
  Warehouse,
  ArrowDownToLine,
  ArrowUpFromLine,
  PackageSearch,
  Building2,
  CreditCard,
  Receipt,
  TrendingUp,
  ShoppingBag,
  Calculator,
  BarChart3,
  DollarSign,
  CalendarDays,
  ClipboardList,
  ArrowRightLeft,
  FileSpreadsheet,
} from "lucide-react";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface MenuItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  permission?: string;
  /** Ẩn tạm — giữ route, không hiện menu (chuyển sang mô hình kho nội bộ) */
  hidden?: boolean;
  /**
   * Chỉ hiện với Quản trị viên / Quản lý.
   * Chi nhánh (staff) không thấy — không ẩn hoàn toàn khỏi admin.
   */
  adminRolesOnly?: boolean;
}

interface MenuGroup {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: MenuItem[];
  defaultOpen?: boolean;
  permission?: string;
  hidden?: boolean;
  /** Nhóm ưu tiên (kho) — highlight header */
  emphasize?: boolean;
}

const menuGroups: MenuGroup[] = [
  {
    label: "Quản lý kho",
    icon: Warehouse,
    permission: "inventory.view",
    defaultOpen: true,
    emphasize: true,
    items: [
      {
        icon: FileText,
        label: "Phiếu DH/DC",
        href: "/admin/inventory/orders",
        permission: "inventory.view",
      },
      {
        icon: ArrowRightLeft,
        label: "Điều chuyển nội bộ",
        href: "/admin/inventory/transfers",
        permission: "inventory.view",
      },
      {
        icon: FileSpreadsheet,
        label: "Import tồn / danh mục",
        href: "/admin/inventory/import",
        permission: "inventory.view",
      },
      {
        icon: Package,
        label: "Hàng mới / Biến thể / Khóa",
        href: "/admin/inventory/catalog",
        permission: "inventory.view",
      },
      { icon: ArrowDownToLine, label: "Nhập kho", href: "/admin/inventory/stock-in", permission: "inventory.stock_in" },
      { icon: ArrowUpFromLine, label: "Xuất kho", href: "/admin/inventory/stock-out", permission: "inventory.stock_out" },
      { icon: PackageSearch, label: "Tồn kho", href: "/admin/inventory", permission: "inventory.view" },
      { icon: CalendarDays, label: "Lịch gom đơn", href: "/admin/inventory/packing", permission: "inventory.view" },
      { icon: ClipboardList, label: "Tổng hợp soạn hàng", href: "/admin/inventory/packing/summary", permission: "inventory.view" },
    ],
  },
  {
    label: "Quản lý sản phẩm",
    icon: Package,
    permission: "products.view",
    defaultOpen: true,
    emphasize: true,
    items: [
      { icon: Package, label: "Sản phẩm", href: "/admin/products", permission: "products.view" },
      { icon: DollarSign, label: "Giá vốn & Lợi nhuận", href: "/admin/products/pricing", permission: "products.pricing" },
      { icon: FolderTree, label: "Danh mục", href: "/admin/categories", permission: "products.view" },
      // Ẩn tạm — bán lẻ
      { icon: Star, label: "Đánh giá", href: "/admin/reviews", permission: "products.view", hidden: true },
    ],
  },
  {
    label: "Quản lý đơn hàng",
    icon: ShoppingCart,
    permission: "orders.view",
    // Ẩn tạm toàn nhóm bán lẻ (đơn hàng / coupon / flash sale)
    hidden: true,
    items: [
      { icon: ShoppingCart, label: "Đơn hàng", href: "/admin/orders", permission: "orders.view", hidden: true },
      { icon: Ticket, label: "Mã giảm giá", href: "/admin/coupons", permission: "marketing.coupons", hidden: true },
      { icon: Zap, label: "Flash Sale", href: "/admin/flash-sales", permission: "marketing.flash_sales", hidden: true },
      { icon: Truck, label: "Bảng giá vận chuyển", href: "/admin/shipping-rates", permission: "settings.view", hidden: true },
    ],
  },
  {
    label: "Quản lý nội dung",
    icon: Newspaper,
    permission: "content.view",
    items: [
      { icon: FileText, label: "Bài viết", href: "/admin/posts", permission: "content.view" },
      { icon: Image, label: "Slide/Banner", href: "/admin/banners", permission: "content.view" },
    ],
  },
  {
    label: "Quản lý trang",
    icon: Globe,
    permission: "content.view",
    items: [
      { icon: FileText, label: "Trang chủ", href: "/admin/homepage", permission: "content.manage" },
      { icon: FileText, label: "Trang Giới thiệu", href: "/admin/about", permission: "content.manage" },
      { icon: FileText, label: "Chính sách", href: "/admin/policies", permission: "content.manage" },
      { icon: MapPin, label: "Trang liên hệ", href: "/admin/contact-page", permission: "content.manage" },
    ],
  },
  {
    label: "Quản lý liên hệ",
    icon: Users,
    // Ẩn tạm — kênh khách hàng / bán lẻ
    hidden: true,
    items: [
      { icon: Mail, label: "Đăng ký nhận tin", href: "/admin/newsletter", hidden: true },
      { icon: MessageSquare, label: "Tin nhắn liên hệ", href: "/admin/contact", hidden: true },
      { icon: Menu, label: "Menu Header", href: "/admin/menu-items", permission: "content.manage", hidden: true },
    ],
  },
  {
    label: "Quản lý công nợ",
    icon: CreditCard,
    permission: "accounts.view",
    items: [
      { icon: Receipt, label: "Công nợ phải trả", href: "/admin/accounts/payable", permission: "accounts.payable" },
      { icon: Receipt, label: "Công nợ phải thu", href: "/admin/accounts/receivable", permission: "accounts.receivable" },
      { icon: TrendingUp, label: "Báo cáo công nợ", href: "/admin/accounts/reports", permission: "accounts.reports" },
    ],
  },
  {
    label: "Báo cáo",
    icon: TrendingUp,
    permission: "reports.view",
    items: [
      { icon: Package, label: "Báo cáo tồn kho", href: "/admin/inventory/reports", permission: "inventory.reports" },
      { icon: TrendingUp, label: "Báo cáo lợi nhuận", href: "/admin/profit-report", permission: "reports.view" },
    ],
  },
  {
    label: "Đối tác",
    icon: Building2,
    permission: "inventory.view",
    items: [
      { icon: Building2, label: "Nhà cung cấp", href: "/admin/suppliers", permission: "inventory.view" },
    ],
  },
  {
    label: "Ecommerce",
    icon: ShoppingBag,
    permission: "ecommerce.view",
    hidden: true,
    items: [
      { icon: Store, label: "Shopee", href: "/admin/ecommerce/shopee", permission: "ecommerce.view", hidden: true },
      { icon: Calculator, label: "Tính phí Shopee", href: "/admin/ecommerce/shopee/fee-calculator", permission: "ecommerce.view", hidden: true },
      { icon: BarChart3, label: "Báo cáo doanh thu Shopee", href: "/admin/ecommerce/shopee/revenue-report", permission: "ecommerce.reports", hidden: true },
      { icon: Store, label: "TikTok", href: "/admin/ecommerce/tiktok", permission: "ecommerce.view", hidden: true },
      { icon: Calculator, label: "Tính phí TikTok", href: "/admin/ecommerce/tiktok/fee-calculator", permission: "ecommerce.view", hidden: true },
      { icon: BarChart3, label: "Báo cáo doanh thu TikTok", href: "/admin/ecommerce/tiktok/revenue-report", permission: "ecommerce.reports", hidden: true },
      { icon: Truck, label: "GHN", href: "/admin/ecommerce/ghn", permission: "ecommerce.view", hidden: true },
      { icon: Settings, label: "Cấu hình phí sàn", href: "/admin/fee-config", permission: "settings.manage", hidden: true },
    ],
  },
];

const standaloneItems: MenuItem[] = [
  { icon: LayoutDashboard, label: "Tổng quan", href: "/admin", permission: "dashboard.view" },
  {
    icon: Users,
    label: "Quản lý Users",
    href: "/admin/users",
    adminRolesOnly: true,
  },
  { icon: Settings, label: "Cài đặt", href: "/admin/settings", permission: "settings.view" },
];

interface AdminSidebarProps {
  onNavigate?: () => void;
}

const AdminSidebar = (props: AdminSidebarProps = {}) => {
  const { onNavigate } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    // Initialize with defaultOpen groups
    const initial: Record<string, boolean> = {};
    menuGroups.forEach((group, index) => {
      if (group.defaultOpen) {
        initial[`group-${index}`] = true;
      }
    });
    return initial;
  });
  const location = useLocation();
  const { signOut } = useAuth();
  const { hasPermission, role } = usePermissions();
  
  // Filter menu items based on permissions + temporary hide flags
  const filteredMenuGroups = useMemo(() => {
    return menuGroups
      .map((group) => {
        if (group.hidden) return null;

        const filteredItems = group.items.filter((item) => {
          if (item.hidden) return false;
          if (!item.permission) return true;
          return hasPermission(item.permission);
        });

        if (filteredItems.length === 0 && group.permission) {
          return null;
        }

        return {
          ...group,
          items: filteredItems,
        };
      })
      .filter((group): group is MenuGroup => {
        if (!group) return false;
        if (group.permission && !hasPermission(group.permission)) {
          return false;
        }
        return group.items.length > 0;
      });
  }, [hasPermission]);

  const isAdminRole = role === "super_admin" || role === "manager";

  const filteredStandaloneItems = useMemo(() => {
    return standaloneItems.filter((item) => {
      if (item.hidden) return false;
      // Tài khoản: chỉ Admin/Quản lý — Chi nhánh không thấy
      if (item.adminRolesOnly) return isAdminRole;
      if (!item.permission) return true;
      return hasPermission(item.permission);
    });
  }, [hasPermission, isAdminRole]);
  
  // Close mobile menu on navigation
  const handleLinkClick = () => {
    if (onNavigate) {
      onNavigate();
    }
  };

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <aside
      className={cn(
        "h-screen bg-card border-r border-border transition-all duration-300 flex flex-col",
        "lg:fixed lg:left-0 lg:top-0 lg:z-30",
        collapsed ? "w-16" : "w-full lg:w-64"
      )}
    >
      {/* Header - Only show on desktop */}
      <div className="hidden lg:flex items-center justify-between h-16 px-4 border-b border-border flex-shrink-0">
        {!collapsed && (
          <Link to="/admin" className="font-serif text-xl font-bold text-primary">
            Kho nội bộ K9
          </Link>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto"
          aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}
        >
          {collapsed ? <Menu className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1 pb-20 admin-sidebar-nav">
        {/* User role badge (only show when not collapsed) */}
        {!collapsed && role && (
          <div className="px-3 py-2 mb-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-lg">
            Vai trò: {
              role === 'super_admin' ? 'Quản trị viên' :
              role === 'manager' ? 'Quản lý' :
              role === 'staff' ? 'Nhân viên' : role
            }
          </div>
        )}

        {/* Standalone items (not grouped) */}
        {filteredStandaloneItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={handleLinkClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {/* Grouped items */}
        {!collapsed && filteredMenuGroups.map((group, groupIndex) => {
          const groupId = `group-${groupIndex}`;
          const isOpen = openGroups[groupId] || false;
          const hasActiveItem = group.items.some(
            (item) =>
              location.pathname === item.href ||
              (item.href !== "/admin" && location.pathname.startsWith(item.href + "/")),
          );

          return (
            <Collapsible
              key={groupId}
              open={isOpen}
              onOpenChange={() => toggleGroup(groupId)}
            >
              <CollapsibleTrigger
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors text-left",
                  hasActiveItem
                    ? "bg-primary/10 text-primary font-medium"
                    : group.emphasize
                      ? "text-foreground hover:bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <div className="flex items-center gap-3">
                  <group.icon
                    className={cn(
                      "w-5 h-5 shrink-0",
                      group.emphasize && "text-primary",
                    )}
                  />
                  <span className="text-sm font-medium">{group.label}</span>
                </div>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 shrink-0 transition-transform",
                    isOpen && "transform rotate-180"
                  )}
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="pl-4 mt-1 space-y-1">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== "/admin/inventory" &&
                      location.pathname.startsWith(item.href + "/"));
                  return (
                    <Link
                      key={item.href}
                      to={item.href}
                      onClick={handleLinkClick}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-sm",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      <item.icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}

        {/* Collapsed view - show only icons with dropdown on hover */}
        {collapsed && filteredMenuGroups.map((group, groupIndex) => {
          const hasActiveItem = group.items.some(
            (item) =>
              location.pathname === item.href ||
              (item.href !== "/admin" && location.pathname.startsWith(item.href + "/")),
          );
          return (
            <div key={`collapsed-${groupIndex}`} className="relative group">
              <button
                className={cn(
                  "w-full flex items-center justify-center p-2.5 rounded-lg transition-colors",
                  hasActiveItem
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
                title={group.label}
              >
                <group.icon className="w-5 h-5" />
              </button>
              {/* Dropdown menu on hover */}
              <div className="absolute left-full ml-2 top-0 z-40 hidden group-hover:block">
                <div className="bg-popover text-popover-foreground rounded-md shadow-lg border min-w-[200px] py-1">
                  <div className="px-3 py-2 text-xs font-semibold border-b border-border">
                    {group.label}
                  </div>
                  {group.items.map((item) => {
                    const isActive = location.pathname === item.href;
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={handleLinkClick}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-accent",
                          isActive && "bg-primary/10 text-primary font-medium"
                        )}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="flex-shrink-0 p-3 border-t border-border bg-card">
        <Link
          to="/"
          onClick={handleLinkClick}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors mb-1"
        >
          <ChevronLeft className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Về trang chủ</span>}
        </Link>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-destructive hover:bg-destructive/10 transition-colors w-full"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {!collapsed && <span>Đăng xuất</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
