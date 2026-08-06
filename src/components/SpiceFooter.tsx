import { useState } from "react";
import { Facebook, Instagram, Youtube, Phone, Mail, MapPin, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { normalizeUrl } from "@/utils/urlNormalize";

const SpiceFooter = () => {
  const currentYear = new Date().getFullYear();
  const { data: settings } = useSiteSettings();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isSubscribed, setIsSubscribed] = useState(false);

  const subscribeMutation = useMutation({
    mutationFn: async (email: string) => {
      const emailLower = email.toLowerCase().trim();
      
      // Try to insert directly, handle conflict if exists
      const { data, error } = await supabase
        .from("newsletter_subscriptions")
        .insert({
          email: emailLower,
          is_active: true,
        })
        .select()
        .single();

      // If error is about duplicate, try to reactivate
      if (error) {
        // Check if it's a unique constraint violation or schema cache error
        if (error.code === 'PGRST116' || error.message?.includes('schema cache')) {
          throw new Error("Hệ thống đang cập nhật. Vui lòng thử lại sau vài phút.");
        }
        
        if (error.code === '23505' || error.message?.includes('duplicate') || error.message?.includes('unique')) {
          // Email already exists, try to reactivate
          const { error: updateError } = await supabase
            .from("newsletter_subscriptions")
            .update({ 
              is_active: true,
              unsubscribed_at: null 
            })
            .eq("email", emailLower);

          if (updateError) {
            // If update fails, might be because it's already active
            if (updateError.code === 'PGRST116' || updateError.message?.includes('schema cache')) {
              throw new Error("Hệ thống đang cập nhật. Vui lòng thử lại sau vài phút.");
            }
            // Check if already subscribed
            const { data: checkData } = await supabase
              .from("newsletter_subscriptions")
              .select("is_active")
              .eq("email", emailLower)
              .maybeSingle();
            
            if (checkData?.is_active) {
              throw new Error("Email này đã được đăng ký");
            }
            throw updateError;
          }
        } else {
          throw error;
        }
      }
    },
    onSuccess: () => {
      setIsSubscribed(true);
      setEmail("");
      toast({
        title: "Đăng ký thành công!",
        description: "Cảm ơn bạn đã đăng ký nhận tin từ chúng tôi.",
      });
      // Reset success message after 5 seconds
      const timeoutId = setTimeout(() => setIsSubscribed(false), 5000);
      // Note: This timeout will be cleared when component unmounts or mutation resets
      // In a production app, you might want to store this in a ref and clear it on unmount
    },
    onError: (error: Error) => {
      toast({
        title: "Đăng ký thất bại",
        description: error.message || "Vui lòng thử lại sau.",
        variant: "destructive",
      });
    },
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      toast({
        title: "Vui lòng nhập email",
        description: "Email không được để trống.",
        variant: "destructive",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast({
        title: "Email không hợp lệ",
        description: "Vui lòng nhập địa chỉ email hợp lệ.",
        variant: "destructive",
      });
      return;
    }

    subscribeMutation.mutate(email);
  };

  const quickLinks = [
    { label: "Trang chủ", href: "/" },
    { label: "Sản phẩm", href: "/products" },
    { label: "Giới thiệu", href: "/about" },
    { label: "Tin tức", href: "/news" },
    { label: "Liên hệ", href: "/contact" },
    { label: "Tra cứu đơn hàng", href: "/order-lookup" },
  ];

  const policies = [
    { label: "Chính sách bảo mật", href: "/privacy" },
    { label: "Tùy chọn Cookies", href: "/cookie-preferences" },
    { label: "Điều khoản sử dụng", href: "/terms" },
    { label: "Chính sách đổi trả", href: "/return-policy" },
    { label: "Chính sách vận chuyển", href: "/shipping-policy" },
  ];

  const socialLinks = [
    { icon: Facebook, href: settings?.facebook_url, label: "Facebook" },
    { icon: Instagram, href: settings?.instagram_url, label: "Instagram" },
    { icon: Youtube, href: settings?.youtube_url, label: "Youtube" },
  ];

  return (
    <footer id="contact" className="bg-foreground text-card">
      {/* Newsletter */}
      <div className="border-b border-card/10">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <h3 className="text-2xl font-serif font-bold mb-2">
              Đăng ký nhận tin
            </h3>
            <p className="text-card/70 mb-6">
              Nhận thông tin khuyến mãi và sản phẩm mới nhất từ {settings?.site_name || "Black Pepper"}
            </p>
            {isSubscribed ? (
              <div className="flex items-center justify-center gap-2 text-primary">
                <Check className="w-5 h-5" />
                <p className="font-medium">Đăng ký thành công! Cảm ơn bạn đã quan tâm.</p>
              </div>
            ) : (
              <form onSubmit={handleSubscribe} className="flex flex-col sm:flex-row gap-3">
                <Input 
                  type="email" 
                  placeholder="Nhập email của bạn"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={subscribeMutation.isPending}
                  className="bg-card/10 border-card/20 text-card placeholder:text-card/50 flex-1"
                  required
                />
                <Button 
                  type="submit"
                  disabled={subscribeMutation.isPending}
                  className="bg-primary hover:bg-primary/90"
                >
                  <span className="flex items-center">
                    <span className={`w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin ${subscribeMutation.isPending ? 'inline' : 'hidden'}`} />
                    <Mail className={`w-4 h-4 mr-2 ${subscribeMutation.isPending ? 'hidden' : 'inline'}`} />
                    <span>{subscribeMutation.isPending ? "Đang xử lý..." : "Đăng ký"}</span>
                  </span>
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="container mx-auto px-4 py-12">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12">
          {/* Brand */}
          <div>
            {settings?.logo_url ? (
              <img 
                src={settings.logo_url} 
                alt={settings?.site_name || "Logo"} 
                className="h-10 object-contain mb-4"
              />
            ) : (
              <h3 className="font-serif text-2xl font-bold mb-4">
                {settings?.site_name || "Black Pepper"}
              </h3>
            )}
            <p className="text-card/70 mb-6 text-sm leading-relaxed">
              Chất lượng tạo nên thương hiệu. Chúng tôi cam kết mang đến những 
              tăm nhựa cao cấp an toàn tuyệt đối, đạt chuẩn kiểm định Quốc tế Eurofins.
            </p>
            <div className="flex gap-3">
              {socialLinks.map((social, index) => {
                const href = normalizeUrl(social.href);
                
                return href ? (
                  <a
                    key={index}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-10 h-10 rounded-full bg-card/10 flex items-center justify-center hover:bg-primary transition-colors"
                    aria-label={social.label}
                  >
                    <social.icon className="w-5 h-5" />
                  </a>
                ) : (
                  <span
                    key={index}
                    className="w-10 h-10 rounded-full bg-card/10 flex items-center justify-center opacity-50 cursor-not-allowed"
                    aria-label={social.label}
                  >
                    <social.icon className="w-5 h-5" />
                  </span>
                );
              })}
            </div>
          </div>

          {/* Dịch Vụ / Quick Links */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Dịch Vụ</h4>
            <ul className="space-y-3">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <Link
                    to={link.href}
                    className="text-card/70 hover:text-primary transition-colors text-sm"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Chính Sách / Policies */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Chính Sách</h4>
            <ul className="space-y-3">
              {policies.map((policy, index) => (
                <li key={index}>
                  <Link
                    to={policy.href}
                    className="text-card/70 hover:text-primary transition-colors text-sm"
                  >
                    {policy.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-semibold text-lg mb-4">Liên hệ</h4>
            <ul className="space-y-4 text-sm">
              <li className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-card/70">Hotline</p>
                  <a 
                    href={`tel:${settings?.phone?.replace(/\D/g, "")}`}
                    className="font-semibold hover:text-primary transition-colors"
                  >
                    {settings?.phone || "1900.636.000"}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <Mail className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-card/70">Email</p>
                  <a 
                    href={`mailto:${settings?.email}`}
                    className="font-semibold hover:text-primary transition-colors"
                  >
                    {settings?.email || "contact@blackpepper.vn"}
                  </a>
                </div>
              </li>
              <li className="flex items-start gap-3">
                <MapPin className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-card/70">Địa chỉ</p>
                  <p className="font-semibold">{settings?.address || "123 Đường ABC, Q.1, TP.HCM"}</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-card/10">
        <div className="container mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-card/60 text-sm">
              {settings?.footer_text || `© ${currentYear} ${settings?.site_name || "Black Pepper"}. Tất cả quyền được bảo lưu.`}
            </p>
            <p className="text-card/60 text-sm">
              Thiết kế với ❤️ tại Việt Nam
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default SpiceFooter;
