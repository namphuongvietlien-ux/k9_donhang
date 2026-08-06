import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Settings, Cookie, Check, X } from "lucide-react";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import SEO from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  getCookiePreferences,
  saveCookiePreferences,
  acceptAllCookies,
  rejectAllCookies,
  type CookiePreferences,
} from "@/utils/cookieConsent";
import { useToast } from "@/hooks/use-toast";

const CookiePreferences = () => {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<CookiePreferences>(getCookiePreferences());
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Check if preferences have changed
    const current = getCookiePreferences();
    setHasChanges(
      current.analytics !== preferences.analytics ||
      current.marketing !== preferences.marketing
    );
  }, [preferences]);

  const handlePreferenceChange = (key: keyof CookiePreferences, value: boolean) => {
    if (key === "essential") return; // Cannot change essential
    setPreferences((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    saveCookiePreferences(preferences);
    toast({
      title: "Đã lưu tùy chọn",
      description: "Tùy chọn cookies của bạn đã được lưu thành công.",
    });
    setHasChanges(false);
    
    // Reload page to apply changes (especially for GA4)
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleAcceptAll = () => {
    acceptAllCookies();
    setPreferences(getCookiePreferences());
    toast({
      title: "Đã chấp nhận tất cả",
      description: "Tất cả cookies đã được bật.",
    });
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const handleRejectAll = () => {
    rejectAllCookies();
    setPreferences(getCookiePreferences());
    toast({
      title: "Đã từ chối tất cả",
      description: "Tất cả cookies không cần thiết đã được tắt.",
    });
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Tùy chọn Cookies | Vinon Store"
        description="Quản lý tùy chọn cookies của bạn. Bật hoặc tắt các loại cookies khác nhau theo sở thích của bạn."
        keywords="cookie preferences, quản lý cookies, privacy settings, tùy chọn bảo mật"
      />
      <SpiceHeader />

      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <nav className="text-sm">
            <Link to="/" className="text-muted-foreground hover:text-primary">
              Trang chủ
            </Link>
            <span className="mx-2 text-muted-foreground">/</span>
            <span className="text-foreground font-medium">Tùy chọn Cookies</span>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <section className="py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-8 h-8 text-primary" />
              <h1 className="text-3xl font-bold">Tùy chọn Cookies</h1>
            </div>
            <p className="text-muted-foreground">
              Quản lý tùy chọn cookies của bạn. Bạn có thể bật hoặc tắt các loại cookies khác nhau
              theo sở thích của bạn. Để biết thêm thông tin, vui lòng xem{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Chính sách bảo mật
              </Link>{" "}
              của chúng tôi.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            <Button onClick={handleAcceptAll} variant="outline" className="w-full">
              <Check className="w-4 h-4 mr-2" />
              Chấp nhận tất cả
            </Button>
            <Button onClick={handleRejectAll} variant="outline" className="w-full">
              <X className="w-4 h-4 mr-2" />
              Từ chối tất cả
            </Button>
          </div>

          {/* Cookie Categories */}
          <div className="space-y-6">
            {/* Essential Cookies */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cookie className="w-5 h-5" />
                      Cookies Cần Thiết
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Cookies này cần thiết cho website hoạt động. Không thể tắt.
                    </CardDescription>
                  </div>
                  <div className="px-4 py-2 bg-primary/10 text-primary rounded-md text-sm font-medium">
                    Luôn bật
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Giỏ hàng và thông tin đơn hàng</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Xác thực người dùng và phiên đăng nhập</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Tùy chọn giao diện và cài đặt</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Bảo mật và chống gian lận</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Analytics Cookies */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cookie className="w-5 h-5" />
                      Cookies Phân Tích
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Giúp chúng tôi hiểu cách bạn sử dụng website để cải thiện trải nghiệm.
                    </CardDescription>
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
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Google Analytics (GA4) - Phân tích hành vi người dùng</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Thống kê truy cập và hiệu suất website</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Phân tích xu hướng và cải thiện trải nghiệm</span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Marketing Cookies */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Cookie className="w-5 h-5" />
                      Cookies Marketing
                    </CardTitle>
                    <CardDescription className="mt-2">
                      Được sử dụng để hiển thị quảng cáo phù hợp với sở thích của bạn.
                    </CardDescription>
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
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Quảng cáo cá nhân hóa</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span>Remarketing và retargeting</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1">•</span>
                    <span className="italic">Hiện tại chưa sử dụng cookies marketing</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Save Button */}
          {hasChanges && (
            <div className="mt-8 p-4 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Bạn có thay đổi chưa lưu</p>
                  <p className="text-sm text-muted-foreground">
                    Vui lòng lưu tùy chọn để áp dụng thay đổi
                  </p>
                </div>
                <Button onClick={handleSave}>Lưu tùy chọn</Button>
              </div>
            </div>
          )}

          {/* Additional Info */}
          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Thông tin thêm</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Bạn có thể thay đổi tùy chọn cookies bất cứ lúc nào bằng cách truy cập trang này.
                Một số thay đổi có thể yêu cầu làm mới trang để áp dụng.
              </p>
              <p>
                Để biết thêm thông tin về cách chúng tôi sử dụng cookies và bảo vệ quyền riêng tư
                của bạn, vui lòng xem{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Chính sách bảo mật
                </Link>
                .
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <SpiceFooter />
    </div>
  );
};

export default CookiePreferences;

