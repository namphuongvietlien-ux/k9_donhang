import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { X, Settings, Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  hasConsented,
  acceptAllCookies,
  rejectAllCookies,
  saveCookiePreferences,
  getCookiePreferences,
  type CookiePreferences,
} from "@/utils/cookieConsent";
import { Link } from "react-router-dom";

const CookieConsent = () => {
  const location = useLocation();
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(getCookiePreferences());

  // Don't show cookie banner on admin pages
  const isAdminPage = location.pathname.startsWith("/admin");

  useEffect(() => {
    // Don't show banner on admin pages
    if (isAdminPage) {
      setShowBanner(false);
      return;
    }

    // Only show banner if user hasn't consented yet
    if (!hasConsented()) {
      // Small delay to avoid flash
      const timer = setTimeout(() => {
        setShowBanner(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isAdminPage]);

  const handleAcceptAll = () => {
    acceptAllCookies();
    setShowBanner(false);
  };

  const handleRejectAll = () => {
    rejectAllCookies();
    setShowBanner(false);
  };

  const handleSavePreferences = () => {
    saveCookiePreferences(preferences);
    setShowBanner(false);
    setShowDetails(false);
  };

  const handlePreferenceChange = (key: keyof CookiePreferences, value: boolean) => {
    if (key === "essential") return; // Cannot change essential
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  // Don't show on admin pages
  if (isAdminPage || !showBanner) return null;

  return (
    <>
      {/* Cookie Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-lg">
        <div className="container mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Cookie className="w-5 h-5 text-primary" />
                <h3 className="font-semibold text-lg">Chúng tôi sử dụng cookies</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Chúng tôi sử dụng cookies để cải thiện trải nghiệm của bạn, phân tích lưu lượng truy cập và cá nhân hóa nội dung. 
                Bằng cách tiếp tục sử dụng website, bạn đồng ý với việc sử dụng cookies của chúng tôi.{" "}
                <Link
                  to="/cookie-preferences"
                  className="text-primary hover:underline"
                  onClick={() => setShowDetails(true)}
                >
                  Tìm hiểu thêm
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDetails(true)}
                className="gap-2"
              >
                <Settings className="w-4 h-4" />
                Tùy chọn
              </Button>
              <Button variant="outline" size="sm" onClick={handleRejectAll}>
                Từ chối
              </Button>
              <Button size="sm" onClick={handleAcceptAll}>
                Chấp nhận tất cả
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Cookie Preferences Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Tùy chọn Cookies
            </DialogTitle>
            <DialogDescription>
              Quản lý tùy chọn cookies của bạn. Bạn có thể bật hoặc tắt các loại cookies khác nhau.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Essential Cookies */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Cookies Cần Thiết</h4>
                  <p className="text-sm text-muted-foreground">
                    Cookies này cần thiết cho website hoạt động. Không thể tắt.
                  </p>
                </div>
                <div className="px-3 py-1 bg-primary/10 text-primary rounded-md text-sm font-medium">
                  Luôn bật
                </div>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Giỏ hàng và thông tin đơn hàng</li>
                <li>• Xác thực người dùng</li>
                <li>• Tùy chọn giao diện</li>
              </ul>
            </div>

            {/* Analytics Cookies */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Cookies Phân Tích</h4>
                  <p className="text-sm text-muted-foreground">
                    Giúp chúng tôi hiểu cách bạn sử dụng website để cải thiện trải nghiệm.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.analytics}
                    onChange={(e) => handlePreferenceChange("analytics", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Google Analytics (GA4)</li>
                <li>• Phân tích hành vi người dùng</li>
                <li>• Thống kê truy cập</li>
              </ul>
            </div>

            {/* Marketing Cookies */}
            <div className="space-y-2 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold">Cookies Marketing</h4>
                  <p className="text-sm text-muted-foreground">
                    Được sử dụng để hiển thị quảng cáo phù hợp với sở thích của bạn.
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.marketing}
                    onChange={(e) => handlePreferenceChange("marketing", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>
              <ul className="text-sm text-muted-foreground space-y-1 ml-4">
                <li>• Quảng cáo cá nhân hóa</li>
                <li>• Remarketing</li>
                <li>• Hiện tại chưa sử dụng</li>
              </ul>
            </div>

            <div className="border-t pt-4">
              <p className="text-xs text-muted-foreground">
                Để biết thêm thông tin, vui lòng xem{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Chính sách bảo mật
                </Link>{" "}
                của chúng tôi.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetails(false)}>
              Hủy
            </Button>
            <Button onClick={handleSavePreferences}>
              Lưu tùy chọn
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default CookieConsent;

