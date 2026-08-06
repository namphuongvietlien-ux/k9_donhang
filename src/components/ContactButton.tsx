import { useState } from "react";
import { useLocation } from "react-router-dom";
import { X, Phone, Mail, MessageCircle, Facebook, Instagram, Youtube, Send, Loader2 } from "lucide-react";
import { useSiteSettings, SocialLink } from "@/hooks/useSiteSettings";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { z } from "zod";
import { normalizeUrl } from "@/utils/urlNormalize";

const contactFormSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên").max(100, "Tên không được quá 100 ký tự"),
  email: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập email")
    .email("Email không hợp lệ")
    .max(255, "Email không được quá 255 ký tự")
    .regex(
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      "Email không đúng định dạng"
    ),
  phone: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập số điện thoại")
    .regex(
      /^(0|\+84)[1-9][0-9]{8}$/,
      "Số điện thoại phải bắt đầu bằng 0 hoặc +84 và có đúng 10 số (đầu số Việt Nam)"
    )
    .refine(
      (val) => {
        // Normalize: convert +84 to 0
        const cleaned = val.replace(/^\+84/, "0");
        // Must be exactly 10 digits starting with 0
        return /^0[1-9][0-9]{8}$/.test(cleaned);
      },
      {
        message: "Số điện thoại phải có đúng 10 số (bắt đầu bằng 0) hoặc 12 ký tự (bắt đầu bằng +84)",
      }
    ),
  message: z.string().trim().min(1, "Vui lòng nhập nội dung").max(1000, "Nội dung không được quá 1000 ký tự"),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

const ContactButton = () => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    message: "",
  });
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const { data: settings, isLoading, error } = useSiteSettings();
  const { toast } = useToast();

  // Hide contact button on admin pages
  const isAdminPage = location.pathname.startsWith("/admin");
  
  if (isAdminPage) {
    return null;
  }

  const socialLinks = settings?.social_links || [];

  // Get active links sorted by order
  const activeLinks = socialLinks
    .filter((link) => {
      // Show if is_active is not explicitly false AND has required fields
      return link.is_active !== false && link.url && link.name;
    })
    .sort((a, b) => {
      const orderA = a.order ?? 999;
      const orderB = b.order ?? 999;
      // If same order, sort by id for consistency
      if (orderA === orderB) {
        return a.id.localeCompare(b.id);
      }
      return orderA - orderB;
    });

  const handleLinkClick = (link: SocialLink) => {
    if (!link.url) return;

    try {
      if (link.icon === "phone") {
        // Phone: use tel: protocol
        const phoneNumber = link.url.replace(/\D/g, "");
        if (phoneNumber) {
          window.location.href = `tel:${phoneNumber}`;
        }
      } else if (link.icon === "email") {
        // Email: use mailto: protocol
        // Remove mailto: prefix if user accidentally included it
        const emailAddress = link.url.replace(/^mailto:/i, "").trim();
        if (emailAddress) {
          window.location.href = `mailto:${emailAddress}`;
        }
      } else {
        // Other links: open in new tab
        const normalizedUrl = normalizeUrl(link.url);
        
        if (normalizedUrl) {
          window.open(normalizedUrl, "_blank", "noopener,noreferrer");
        } else {
          toast({
            title: "Lỗi",
            description: "URL không hợp lệ. Vui lòng kiểm tra lại cấu hình.",
            variant: "destructive",
          });
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Error handling link click:", error);
      }
      toast({
        title: "Lỗi",
        description: "Không thể mở liên kết. Vui lòng thử lại sau.",
        variant: "destructive",
      });
    }
  };

  const getIcon = (iconType: SocialLink["icon"]) => {
    const iconClass = "w-6 h-6 text-white";
    switch (iconType) {
      case "phone":
        return <Phone className={iconClass} />;
      case "email":
        return <Mail className={iconClass} />;
      case "zalo":
        return (
          <svg className={iconClass} viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 2.98.97 4.29L1 23l6.71-1.97C9.02 21.64 10.46 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.38 0-2.68-.36-3.8-1L4 20l1-4.2C4.36 14.68 4 13.38 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" />
            <path d="M12.5 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-5 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
          </svg>
        );
      case "facebook":
        return (
          <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
            <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
          </svg>
        );
      case "instagram":
        return <Instagram className={iconClass} />;
      case "youtube":
        return <Youtube className={iconClass} />;
      default:
        return <MessageCircle className={iconClass} />;
    }
  };

  const contactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      const { error } = await supabase.from("contact_messages").insert({
        name: data.name,
        email: data.email,
        phone: data.phone,
        message: data.message,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Gửi thành công!",
        description: "Chúng tôi sẽ liên hệ lại với bạn sớm nhất có thể.",
      });
      setFormData({ name: "", email: "", phone: "", message: "" });
      setFormErrors({});
      setShowForm(false);
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: error.message || "Không thể gửi tin nhắn. Vui lòng thử lại sau.",
        variant: "destructive",
      });
    },
  });

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (formErrors[name as keyof ContactFormData]) {
      setFormErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validatedData = contactFormSchema.parse(formData);
      contactMutation.mutate(validatedData);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof ContactFormData] = err.message;
          }
        });
        setFormErrors(fieldErrors);
      }
    }
  };

  const getBgColor = (link: SocialLink) => {
    if (link.bg_color) return link.bg_color;
    
    // Default colors by icon type
    switch (link.icon) {
      case "phone":
        return "#ef4444"; // red-500
      case "zalo":
        return "#3b82f6"; // blue-500
      case "email":
        return "linear-gradient(to bottom right, #22d3ee, #3b82f6)"; // cyan to blue
      case "facebook":
        return "#2563eb"; // blue-600
      case "instagram":
        return "linear-gradient(to bottom right, #f59e0b, #ec4899)"; // orange to pink
      case "youtube":
        return "#dc2626"; // red-600
      default:
        return "#3b82f6"; // blue-500
    }
  };

  return (
    <>
      {/* Contact Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-28 right-6 z-50",
          "w-16 h-16 rounded-full",
          "bg-gradient-to-br from-orange-500 to-red-500",
          "shadow-lg shadow-orange-500/50",
          "flex items-center justify-center",
          "text-white",
          "transition-all duration-300",
          "hover:scale-110 hover:shadow-xl hover:shadow-orange-500/60",
          "active:scale-95",
          "group"
        )}
        aria-label="Liên hệ"
      >
        {/* Chat Icon SVG (custom) */}
        {!isOpen ? (
          <svg
            width="34"
            height="35"
            viewBox="0 0 34 35"
            xmlns="http://www.w3.org/2000/svg"
            className="w-8 h-8"
          >
            <path
              d="M4.35522 31V25.416H5.41122V30.064H7.61122V31H4.35522ZM8.97509 26.216C8.76176 26.216 8.60709 26.168 8.51109 26.072C8.42043 25.976 8.37509 25.8533 8.37509 25.704V25.544C8.37509 25.3947 8.42043 25.272 8.51109 25.176C8.60709 25.08 8.76176 25.032 8.97509 25.032C9.18309 25.032 9.33509 25.08 9.43109 25.176C9.52709 25.272 9.57509 25.3947 9.57509 25.544V25.704C9.57509 25.8533 9.52709 25.976 9.43109 26.072C9.33509 26.168 9.18309 26.216 8.97509 26.216ZM8.46309 26.824H9.48709V31H8.46309V26.824ZM12.834 24.712L13.842 25.944L13.33 26.344L12.37 25.424L11.41 26.344L10.898 25.944L11.906 24.712H12.834ZM12.362 31.096C12.0527 31.096 11.7754 31.0453 11.53 30.944C11.29 30.8373 11.0847 30.6907 10.914 30.504C10.7487 30.312 10.6207 30.0827 10.53 29.816C10.4394 29.544 10.394 29.24 10.394 28.904C10.394 28.5733 10.4367 28.2747 10.522 28.008C10.6127 27.7413 10.7407 27.5147 10.906 27.328C11.0714 27.136 11.274 26.9893 11.514 26.888C11.754 26.7813 12.026 26.728 12.33 26.728C12.6554 26.728 12.938 26.784 13.178 26.896C13.418 27.008 13.6154 27.16 13.77 27.352C13.9247 27.544 14.0394 27.768 14.114 28.024C14.194 28.2747 14.234 28.544 14.234 28.832V29.168H11.458V29.272C11.458 29.576 11.5434 29.8213 11.714 30.008C11.8847 30.1893 12.138 30.28 12.474 30.28C12.73 30.28 12.938 30.2267 13.098 30.12C13.2634 30.0133 13.41 29.8773 13.538 29.712L14.09 30.328C13.9194 30.568 13.6847 30.7573 13.386 30.896C13.0927 31.0293 12.7514 31.096 12.362 31.096ZM12.346 27.496C12.074 27.496 11.858 27.5867 11.698 27.768C11.538 27.9493 11.458 28.184 11.458 28.472V28.536H13.17V28.464C13.17 28.176 13.098 27.944 12.954 27.768C12.8154 27.5867 12.6127 27.496 12.346 27.496ZM15.135 31V26.824H16.159V27.52H16.199C16.2843 27.296 16.4176 27.1093 16.599 26.96C16.7856 26.8053 17.0416 26.728 17.367 26.728C17.799 26.728 18.1296 26.8693 18.359 27.152C18.5883 27.4347 18.703 27.8373 18.703 28.36V31H17.679V28.464C17.679 28.1653 17.6256 27.9413 17.519 27.792C17.4123 27.6427 17.2363 27.568 16.991 27.568C16.8843 27.568 16.7803 27.584 16.679 27.616C16.583 27.6427 16.495 27.6853 16.415 27.744C16.3403 27.7973 16.279 27.8667 16.231 27.952C16.183 28.032 16.159 28.128 16.159 28.24V31H15.135ZM21.7287 25.08H22.7527V27.52H22.7927C22.8781 27.296 23.0114 27.1093 23.1927 26.96C23.3794 26.8053 23.6354 26.728 23.9607 26.728C24.3927 26.728 24.7234 26.8693 24.9527 27.152C25.1821 27.4347 25.2967 27.8373 25.2967 28.36V31H24.2727V28.464C24.2727 28.1653 24.2194 27.9413 24.1127 27.792C24.0061 27.6427 23.8301 27.568 23.5847 27.568C23.4781 27.568 23.3741 27.584 23.2727 27.616C23.1767 27.6427 23.0887 27.6853 23.0087 27.744C22.9341 27.7973 22.8727 27.8667 22.8247 27.952C22.7767 28.032 22.7527 28.128 22.7527 28.24V31H21.7287V25.08ZM28.5918 24.712L29.5998 25.944L29.0878 26.344L28.1278 25.424L27.1678 26.344L26.6558 25.944L27.6638 24.712H28.5918ZM28.1198 31.096C27.8105 31.096 27.5332 31.0453 27.2878 30.944C27.0478 30.8373 26.8425 30.6907 26.6718 30.504C26.5065 30.312 26.3785 30.0827 26.2878 29.816C26.1972 29.544 26.1518 29.24 26.1518 28.904C26.1518 28.5733 26.1945 28.2747 26.2798 28.008C26.3705 27.7413 26.4985 27.5147 26.6638 27.328C26.8292 27.136 27.0318 26.9893 27.2718 26.888C27.5118 26.7813 27.7838 26.728 28.0878 26.728C28.4132 26.728 28.6958 26.784 28.9358 26.896C29.1758 27.008 29.3732 27.16 29.5278 27.352C29.6825 27.544 29.7972 27.768 29.8718 28.024C29.9518 28.2747 29.9918 28.544 29.9918 28.832V29.168H27.2158V29.272C27.2158 29.576 27.3012 29.8213 27.4718 30.008C27.6425 30.1893 27.8958 30.28 28.2318 30.28C28.4878 30.28 28.6958 30.2267 28.8558 30.12C29.0212 30.0133 29.1678 29.8773 29.2958 29.712L29.8478 30.328C29.6772 30.568 29.4425 30.7573 29.1438 30.896C28.8505 31.0293 28.5092 31.096 28.1198 31.096ZM28.1038 27.496C27.8318 27.496 27.6158 27.5867 27.4558 27.768C27.2958 27.9493 27.2158 28.184 27.2158 28.472V28.536H28.9278V28.464C28.9278 28.176 28.8558 27.944 28.7118 27.768C28.5732 27.5867 28.3705 27.496 28.1038 27.496ZM28.1038 32.552C27.8958 32.552 27.7465 32.5067 27.6558 32.416C27.5705 32.3307 27.5278 32.2213 27.5278 32.088V31.912C27.5278 31.7787 27.5705 31.6667 27.6558 31.576C27.7465 31.4907 27.8958 31.448 28.1038 31.448C28.3118 31.448 28.4585 31.4907 28.5438 31.576C28.6345 31.6667 28.6798 31.7787 28.6798 31.912V32.088C28.6798 32.2213 28.6345 32.3307 28.5438 32.416C28.4585 32.5067 28.3118 32.552 28.1038 32.552Z"
              fill="currentColor"
            />
            <path
              d="M27.2212 0H10.7532C9.76511 0 8.97461 0.834345 8.97461 1.82643V12.334C8.97461 13.3487 9.78701 14.1604 10.7532 14.1604H22.1051L24.6741 16.8211C24.7839 16.9338 24.9157 17.0015 25.0693 17.0015C25.3768 17.0015 25.6402 16.7535 25.6402 16.4153V14.1604H27.2212C28.2092 14.1604 28.9997 13.3261 28.9997 12.334V1.82643C28.9997 0.811779 28.1873 0 27.2212 0ZM13.2783 9.04195C12.378 9.04195 11.6315 8.2753 11.6315 7.35077C11.6315 6.42631 12.378 5.65966 13.2783 5.65966C14.1785 5.65966 14.925 6.42631 14.925 7.35077C14.925 8.2753 14.2005 9.04195 13.2783 9.04195ZM19.0531 9.04195C18.1528 9.04195 17.4062 8.2753 17.4062 7.35077C17.4062 6.42631 18.1528 5.65966 19.0531 5.65966C19.9533 5.65966 20.6998 6.42631 20.6998 7.35077C20.6998 8.2753 19.9533 9.04195 19.0531 9.04195ZM24.8059 9.04195C23.9056 9.04195 23.1591 8.2753 23.1591 7.35077C23.1591 6.42631 23.9056 5.65966 24.8059 5.65966C25.7061 5.65966 26.4526 6.42631 26.4526 7.35077C26.4526 8.2753 25.7061 9.04195 24.8059 9.04195Z"
              fill="currentColor"
            />
            <path
              d="M7.9649 12.3782V8.79297H6.16437C5.52762 8.79297 5.00066 9.33418 5.00066 9.98807V16.8878C4.97869 17.5868 5.50564 18.128 6.16437 18.128H7.19637V19.6162C7.19637 19.8192 7.37202 19.9995 7.56964 19.9995C7.67944 19.9995 7.76727 19.9544 7.83312 19.8868L9.52385 18.1505H16.9894C17.6261 18.1505 18.1531 17.6094 18.1531 16.9555V15.2418H10.7535C9.2165 15.2418 7.9649 13.9566 7.9649 12.3782Z"
              fill="currentColor"
            />
          </svg>
        ) : (
          <X className="w-6 h-6 animate-in fade-in duration-200" />
        )}
      </button>

      {/* Contact Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
          />

          {/* Menu Card */}
          <div
            className={cn(
              "fixed bottom-40 right-6 z-50",
              "w-80 bg-white rounded-2xl shadow-2xl",
              "animate-in slide-in-from-bottom-4 fade-in duration-300",
              "overflow-hidden",
              "max-h-[80vh] overflow-y-auto"
            )}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsOpen(false)}
              className={cn(
                "absolute top-3 right-3 z-10",
                "w-8 h-8 rounded-full",
                "bg-gray-100 hover:bg-gray-200",
                "flex items-center justify-center",
                "transition-colors",
                "text-gray-600 hover:text-gray-800"
              )}
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Menu Items */}
            <div className="p-4 space-y-2">
              {showForm ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Gửi thắc mắc</h3>
                    <button
                      onClick={() => {
                        setShowForm(false);
                        setFormData({ name: "", email: "", phone: "", message: "" });
                        setFormErrors({});
                      }}
                      className="text-gray-500 hover:text-gray-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleFormSubmit} className="space-y-3">
                    <div>
                      <Input
                        name="name"
                        placeholder="Tên của bạn *"
                        value={formData.name}
                        onChange={handleFormChange}
                        className={formErrors.name ? "border-red-500" : ""}
                      />
                      {formErrors.name && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>
                      )}
                    </div>
                    <div>
                      <Input
                        name="email"
                        type="email"
                        placeholder="Email của bạn *"
                        value={formData.email}
                        onChange={handleFormChange}
                        className={formErrors.email ? "border-red-500" : ""}
                      />
                      {formErrors.email && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.email}</p>
                      )}
                    </div>
                    <div>
                      <Input
                        name="phone"
                        type="tel"
                        placeholder="Số điện thoại *"
                        value={formData.phone}
                        onChange={handleFormChange}
                        className={formErrors.phone ? "border-red-500" : ""}
                      />
                      {formErrors.phone && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.phone}</p>
                      )}
                    </div>
                    <div>
                      <Textarea
                        name="message"
                        placeholder="Nội dung tin nhắn *"
                        rows={4}
                        value={formData.message}
                        onChange={handleFormChange}
                        className={formErrors.message ? "border-red-500" : ""}
                      />
                      {formErrors.message && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.message}</p>
                      )}
                    </div>
                    <Button
                      type="submit"
                      disabled={contactMutation.isPending}
                      className="w-full"
                    >
                      <span className="flex items-center">
                        <Loader2 className={`w-4 h-4 mr-2 animate-spin ${contactMutation.isPending ? 'inline' : 'hidden'}`} />
                        <Send className={`w-4 h-4 mr-2 ${contactMutation.isPending ? 'hidden' : 'inline'}`} />
                        <span>{contactMutation.isPending ? "Đang gửi..." : "Gửi tin nhắn"}</span>
                      </span>
                    </Button>
                  </form>
                </div>
              ) : (
                <>
                  {/* Quick Contact Button */}
                  <button
                    onClick={() => setShowForm(true)}
                    className={cn(
                      "w-full flex items-center gap-4 p-4 rounded-xl",
                      "bg-gradient-to-r from-orange-500 to-red-500",
                      "text-white hover:from-orange-600 hover:to-red-600",
                      "transition-all",
                      "shadow-md hover:shadow-lg",
                      "mb-2"
                    )}
                  >
                    <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                      <MessageCircle className="w-6 h-6" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold">Gửi thắc mắc</p>
                      <p className="text-xs text-white/80">Chúng tôi sẽ phản hồi sớm nhất</p>
                    </div>
                  </button>

                  {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Đang tải...</p>
                </div>
              ) : activeLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p className="text-sm">Chưa có nút liên hệ nào</p>
                  <p className="text-xs mt-2">Vui lòng cấu hình trong Admin Settings</p>
                </div>
                  ) : (
                    activeLinks.map((link) => {
                  const bgColor = getBgColor(link);
                  const isGradient = bgColor.includes("gradient");

                  return (
                    <button
                      key={link.id}
                      onClick={() => handleLinkClick(link)}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-xl",
                        "bg-gray-50 hover:bg-gray-100",
                        "transition-colors",
                        "text-left",
                        "group"
                      )}
                    >
                      <div
                        className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0",
                          "group-hover:scale-110 transition-transform"
                        )}
                        style={
                          isGradient
                            ? { background: bgColor }
                            : { backgroundColor: bgColor }
                        }
                      >
                        {getIcon(link.icon)}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-gray-900">
                          {link.name || "Liên hệ"}
                        </p>
                      </div>
                    </button>
                  );
                })
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default ContactButton;
