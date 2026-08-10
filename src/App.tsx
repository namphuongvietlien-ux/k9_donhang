import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { CartProvider } from "@/contexts/CartContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminProvider } from "@/contexts/AdminContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Loader2 } from "lucide-react";

// Portal kho nội bộ — trang chủ thay storefront ecommerce
import WarehousePortal, { StorefrontLockedRedirect } from "./pages/WarehousePortal";

const SitemapXML = lazy(() => import("./pages/SitemapXML"));

// Lazy loaded admin pages (separate bundle)
const AdminLogin = lazy(() => import("./pages/admin/AdminLogin"));
const AdminForbidden = lazy(() => import("./pages/admin/AdminForbidden"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const AdminProducts = lazy(() => import("./pages/admin/AdminProducts"));
const AdminProductForm = lazy(() => import("./pages/admin/AdminProductForm"));
const AdminCategories = lazy(() => import("./pages/admin/AdminCategories"));
const AdminOrders = lazy(() => import("./pages/admin/AdminOrders"));
const AdminBanners = lazy(() => import("./pages/admin/AdminBanners"));
const AdminPosts = lazy(() => import("./pages/admin/AdminPosts"));
const AdminPostForm = lazy(() => import("./pages/admin/AdminPostForm"));
const AdminAbout = lazy(() => import("./pages/admin/AdminAbout"));
const AdminHomepage = lazy(() => import("./pages/admin/AdminHomepage"));
const AdminPolicies = lazy(() => import("./pages/admin/AdminPolicies"));
const AdminSettings = lazy(() => import("./pages/admin/AdminSettings"));
const AdminReviews = lazy(() => import("./pages/admin/AdminReviews"));
const AdminCoupons = lazy(() => import("./pages/admin/AdminCoupons"));
const AdminFlashSales = lazy(() => import("./pages/admin/AdminFlashSales"));
const AdminFlashSaleForm = lazy(() => import("./pages/admin/AdminFlashSaleForm"));
const AdminNewsletter = lazy(() => import("./pages/admin/AdminNewsletter"));
const AdminContactMessages = lazy(() => import("./pages/admin/AdminContactMessages"));
const AdminContact = lazy(() => import("./pages/admin/AdminContact"));
const AdminMenuItems = lazy(() => import("./pages/admin/AdminMenuItems"));
const AdminSuppliers = lazy(() => import("./pages/admin/AdminSuppliers"));
const AdminStockIn = lazy(() => import("./pages/admin/AdminStockIn"));
const AdminStockOut = lazy(() => import("./pages/admin/AdminStockOut"));
const AdminInventory = lazy(() => import("./pages/admin/AdminInventory"));
const AdminPackingCalendar = lazy(() => import("./pages/admin/AdminPackingCalendar"));
const AdminPackingSummary = lazy(() => import("./pages/admin/AdminPackingSummary"));
const AdminInternalTransfers = lazy(() => import("./pages/admin/AdminInternalTransfers"));
const AdminCatalogStockImport = lazy(() => import("./pages/admin/AdminCatalogStockImport"));
const AdminCatalogHub = lazy(() => import("./pages/admin/AdminCatalogHub"));
const AdminWarehouseOrders = lazy(() => import("./pages/admin/AdminWarehouseOrders"));
const AdminAccountsPayable = lazy(() => import("./pages/admin/AdminAccountsPayable"));
const AdminAccountsReceivable = lazy(() => import("./pages/admin/AdminAccountsReceivable"));
const AdminInventoryReports = lazy(() => import("./pages/admin/AdminInventoryReports"));
const AdminAccountsReports = lazy(() => import("./pages/admin/AdminAccountsReports"));
const AdminShippingRates = lazy(() => import("./pages/admin/AdminShippingRates"));
const AdminShopeeOrders = lazy(() => import("./pages/admin/AdminShopeeOrders"));
const AdminTikTokOrders = lazy(() => import("./pages/admin/AdminTikTokOrders"));
const AdminGHNOrders = lazy(() => import("./pages/admin/AdminGHNOrders"));
const AdminJTOrders = lazy(() => import("./pages/admin/AdminJTOrders"));
const AdminShopeeFeeCalculator = lazy(() => import("./pages/admin/AdminShopeeFeeCalculator"));
const AdminShopeeRevenueReport = lazy(() => import("./pages/admin/AdminShopeeRevenueReport"));
const AdminTikTokFeeCalculator = lazy(() => import("./pages/admin/AdminTikTokFeeCalculator"));
const AdminTikTokRevenueReport = lazy(() => import("./pages/admin/AdminTikTokRevenueReport"));
const AdminProfitReport = lazy(() => import("./pages/admin/AdminProfitReport"));
const AdminProductPricing = lazy(() => import("./pages/admin/AdminProductPricing"));
const AdminFeeConfig = lazy(() => import("./pages/admin/AdminFeeConfig"));
const AdminUsers = lazy(() => import("./pages/admin/AdminUsers"));
const AdminRecovery = lazy(() => import("./pages/admin/AdminRecovery"));
const AdminResetPassword = lazy(() => import("./pages/admin/AdminResetPassword"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

// Configure QueryClient — giảm PostgREST egress (ít refetch khi đổi tab)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 phút
      // Keep unused data in cache for 1 hour (increased for production)
      gcTime: 60 * 60 * 1000,
      // Don't refetch on window focus for better UX and performance
      refetchOnWindowFocus: false,
      // Don't refetch on mount if data exists in cache
      refetchOnMount: false,
      // Retry failed requests once (avoid too many retries)
      retry: 1,
      // Retry delay: 1 second
      retryDelay: 1000,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
      retryDelay: 1000,
    },
  },
});

const App = () => {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AdminProvider>
            <CartProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter
                  future={{
                    v7_startTransition: true,
                    v7_relativeSplatPath: true,
                  }}
                >
                  <ErrorBoundary>
                    {/* Storefront ecommerce khóa — không load chatbot/cart/cookie bán lẻ */}
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                    {/* Portal kho nội bộ K9 (kiểu donhang-dieuchuyen) */}
                    <Route path="/" element={<WarehousePortal />} />

                    {/* Storefront ecommerce khóa hoàn toàn */}
                    <Route path="/sitemap.xml" element={<SitemapXML />} />

                    {/* Admin pages - separate lazy bundle */}
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/admin/login/callback" element={<AdminLogin />} />
                    <Route path="/admin/recovery" element={<AdminRecovery />} />
                    <Route path="/admin/reset-password" element={<AdminResetPassword />} />
                    <Route path="/admin/forbidden" element={<AdminForbidden />} />
                    <Route path="/admin" element={<AdminDashboard />} />
                    <Route path="/admin/products" element={<AdminProducts />} />
                    <Route path="/admin/products/new" element={<AdminProductForm />} />
                    <Route path="/admin/products/:id/edit" element={<AdminProductForm />} />
                    <Route path="/admin/products/pricing" element={<AdminProductPricing />} />
                    <Route path="/admin/categories" element={<AdminCategories />} />
                    <Route path="/admin/orders" element={<AdminOrders />} />
                    <Route path="/admin/banners" element={<AdminBanners />} />
                    <Route path="/admin/posts" element={<AdminPosts />} />
                    <Route path="/admin/posts/new" element={<AdminPostForm />} />
                    <Route path="/admin/posts/:id/edit" element={<AdminPostForm />} />
                    <Route path="/admin/homepage" element={<AdminHomepage />} />
                    <Route path="/admin/about" element={<AdminAbout />} />
                    <Route path="/admin/policies" element={<AdminPolicies />} />
                    <Route path="/admin/settings" element={<AdminSettings />} />
                    <Route path="/admin/users" element={<AdminUsers />} />
                    <Route path="/admin/fee-config" element={<AdminFeeConfig />} />
                    <Route path="/admin/reviews" element={<AdminReviews />} />
                    <Route path="/admin/coupons" element={<AdminCoupons />} />
                    <Route path="/admin/flash-sales" element={<AdminFlashSales />} />
                    <Route path="/admin/flash-sales/new" element={<AdminFlashSaleForm />} />
                    <Route path="/admin/flash-sales/:id/edit" element={<AdminFlashSaleForm />} />
                    <Route path="/admin/shipping-rates" element={<AdminShippingRates />} />
                    <Route path="/admin/newsletter" element={<AdminNewsletter />} />
                    <Route path="/admin/contact" element={<AdminContactMessages />} />
                    <Route path="/admin/contact-page" element={<AdminContact />} />
                    <Route path="/admin/menu-items" element={<AdminMenuItems />} />
                    <Route path="/admin/suppliers" element={<AdminSuppliers />} />
                    <Route path="/admin/inventory/stock-in" element={<AdminStockIn />} />
                    <Route path="/admin/inventory/stock-out" element={<AdminStockOut />} />
                    <Route path="/admin/inventory/transfers" element={<AdminInternalTransfers />} />
                    <Route path="/admin/inventory/orders" element={<AdminWarehouseOrders />} />
                    <Route path="/admin/inventory/import" element={<AdminCatalogStockImport />} />
                    <Route path="/admin/inventory/catalog" element={<AdminCatalogHub />} />
                    <Route path="/admin/inventory/packing/summary" element={<AdminPackingSummary />} />
                    <Route path="/admin/inventory/packing" element={<AdminPackingCalendar />} />
                    <Route path="/admin/inventory" element={<AdminInventory />} />
                    <Route path="/admin/accounts/payable" element={<AdminAccountsPayable />} />
                    <Route path="/admin/accounts/receivable" element={<AdminAccountsReceivable />} />
                    <Route path="/admin/accounts/reports" element={<AdminAccountsReports />} />
                    <Route path="/admin/inventory/reports" element={<AdminInventoryReports />} />
                    <Route path="/admin/ecommerce/shopee" element={<AdminShopeeOrders />} />
                    <Route path="/admin/ecommerce/shopee/fee-calculator" element={<AdminShopeeFeeCalculator />} />
                    <Route path="/admin/ecommerce/shopee/revenue-report" element={<AdminShopeeRevenueReport />} />
                    <Route path="/admin/profit-report" element={<AdminProfitReport />} />
                    <Route path="/admin/ecommerce/tiktok" element={<AdminTikTokOrders />} />
                    <Route path="/admin/ecommerce/tiktok/fee-calculator" element={<AdminTikTokFeeCalculator />} />
                    <Route path="/admin/ecommerce/tiktok/revenue-report" element={<AdminTikTokRevenueReport />} />
                    <Route path="/admin/ecommerce/ghn" element={<AdminGHNOrders />} />
                    <Route path="/admin/ecommerce/jt" element={<AdminJTOrders />} />
                    
                    {/* Catch-all → portal kho */}
                    <Route path="*" element={<StorefrontLockedRedirect />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </BrowserRouter>
              </TooltipProvider>
            </CartProvider>
          </AdminProvider>
        </AuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
