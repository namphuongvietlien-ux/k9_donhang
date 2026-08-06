import { Facebook, Instagram, Youtube, Mail } from "lucide-react";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  const socialLinks = [
    { icon: Facebook, href: "#", label: "Facebook" },
    { icon: Instagram, href: "#", label: "Instagram" },
    { icon: Youtube, href: "#", label: "Youtube" },
    { icon: Mail, href: "#", label: "Email" },
  ];

  const quickLinks = [
    { label: "Trang chủ", href: "#home" },
    { label: "Sản phẩm", href: "#products" },
    { label: "Về chúng tôi", href: "#about" },
    { label: "Liên hệ", href: "#contact" },
  ];

  const policies = [
    { label: "Chính sách bảo mật", href: "#" },
    { label: "Điều khoản sử dụng", href: "#" },
    { label: "Chính sách đổi trả", href: "#" },
    { label: "Chính sách vận chuyển", href: "#" },
  ];

  return (
    <footer className="bg-foreground text-card py-16">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">T</span>
              </div>
              <span className="font-serif text-xl font-bold">Tăm Nhựa Việt</span>
            </div>
            <p className="text-card/70 mb-6">
              Chất lượng tạo nên thương hiệu. Chúng tôi cam kết mang đến những sản phẩm 
              tốt nhất cho sức khỏe răng miệng của bạn.
            </p>
            <div className="flex gap-4">
              {socialLinks.map((social, index) => (
                <a
                  key={index}
                  href={social.href}
                  className="w-10 h-10 rounded-full bg-card/10 flex items-center justify-center hover:bg-primary transition-colors"
                  aria-label={social.label}
                >
                  <social.icon className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Liên kết nhanh</h3>
            <ul className="space-y-3">
              {quickLinks.map((link, index) => (
                <li key={index}>
                  <a
                    href={link.href}
                    className="text-card/70 hover:text-primary transition-colors"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Policies */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Chính sách</h3>
            <ul className="space-y-3">
              {policies.map((policy, index) => (
                <li key={index}>
                  <a
                    href={policy.href}
                    className="text-card/70 hover:text-primary transition-colors"
                  >
                    {policy.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-lg mb-4">Liên hệ</h3>
            <ul className="space-y-3 text-card/70">
              <li>📞 Hotline: 0123 456 789</li>
              <li>✉️ contact@tamnhuaviet.vn</li>
              <li>📍 123 Đường ABC, Q.1, TP.HCM</li>
              <li>🕐 8:00 - 17:30 (T2 - T7)</li>
            </ul>
          </div>
        </div>

        {/* Bottom */}
        <div className="border-t border-card/10 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-card/60 text-sm">
              © {currentYear} Tăm Nhựa Việt. Tất cả quyền được bảo lưu.
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

export default Footer;
