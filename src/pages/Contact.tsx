import { useState } from "react";
import { MapPin, Phone, Mail, Clock, Send, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import ScrollReveal from "@/components/ScrollReveal";
import { DynamicSEO, Breadcrumbs } from "@/components/seo/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên của bạn").max(100, "Tên không được quá 100 ký tự"),
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

type ContactFormData = z.infer<typeof contactSchema>;

const Contact = () => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<ContactFormData>({
    name: "",
    email: "",
    phone: "",
    message: ""
  });
  const [errors, setErrors] = useState<Partial<Record<keyof ContactFormData, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch contact page settings
  const { data: contactSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["contact-page-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_page_settings")
        .select("*");
      if (error) throw error;
      const settingsMap: Record<string, string> = {};
      (data || []).forEach((setting: { setting_key: string; setting_value: string | null }) => {
        settingsMap[setting.setting_key] = setting.setting_value || "";
      });
      return settingsMap;
    },
    staleTime: 15 * 60 * 1000, // 15 minutes
  });

  // Default values
  const defaultMapIframe = "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.4946681149473!2d106.64977731531963!3d10.772461992322762!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752ec0e7a7a0ed%3A0x286a30d4c72a8f2f!2zMTgyIMSQLiBMw6ogxJDhuqFpIEjDoG5oLCBQaMaw4budbmcgMTUsIFF14bqtbiAxMSwgVGjDoG5oIHBo4buRIEjhu5MgQ2jDrSBNaW5oLCBWaeG7h3QgTmFt!5e0!3m2!1svi!2s!4v1703123456789!5m2!1svi!2s";
  
  const contactInfo = [
    {
      icon: MapPin,
      title: "Địa chỉ",
      content: contactSettings?.address || "Tầng 4, tòa nhà Flemington, số 182, đường Lê Đại Hành, phường 15, quận 11, Tp. Hồ Chí Minh."
    },
    {
      icon: Phone,
      title: "Điện thoại",
      content: contactSettings?.phone || "1900.636.000"
    },
    {
      icon: Clock,
      title: "Thời gian làm việc",
      content: contactSettings?.working_hours || "Thứ 2 đến Thứ 6: từ 8h đến 18h;\nThứ 7 và Chủ nhật: từ 8h00 đến 17h00"
    },
    {
      icon: Mail,
      title: "Email",
      content: contactSettings?.email || "hi@blackpepper.info"
    }
  ];

  const mapIframe = contactSettings?.google_map_iframe || defaultMapIframe;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Clear error when user starts typing
    if (errors[name as keyof ContactFormData]) {
      setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const validatedData = contactSchema.parse(formData);
      
      // Save to database
      const { error } = await supabase.from("contact_messages").insert({
        name: validatedData.name,
        email: validatedData.email,
        phone: validatedData.phone,
        message: validatedData.message,
      });

      if (error) throw error;
      
      // Form validation passed - show success message
      toast({
        title: "Gửi thành công!",
        description: "Chúng tôi sẽ liên hệ lại với bạn sớm nhất có thể.",
      });
      
      // Reset form
      setFormData({ name: "", email: "", phone: "", message: "" });
      setErrors({});
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof ContactFormData, string>> = {};
        error.errors.forEach(err => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as keyof ContactFormData] = err.message;
          }
        });
        setErrors(fieldErrors);
      } else {
        toast({
          title: "Lỗi",
          description: error instanceof Error ? error.message : "Không thể gửi thắc mắc. Vui lòng thử lại sau.",
          variant: "destructive",
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <DynamicSEO 
        title="Liên hệ - Tăm Nhựa Vinon | Hotline: 0353 110 711"
        description="Liên hệ với Tăm Nhựa Vinon để được tư vấn sản phẩm, đặt hàng hoặc hợp tác phân phối. Hotline: 0353 110 711, Email: lienhe@vinon.vn"
        keywords="liên hệ tăm nhựa vinon, mua tăm nhựa, tư vấn sản phẩm, địa chỉ vinon, hotline vinon"
        url="/contact"
      />
      <SpiceHeader />
      
      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={[{ label: "Liên hệ" }]} />
        </div>
      </div>

      {/* Google Map */}
      <section className="w-full h-[400px] md:h-[450px]">
        {isLoadingSettings ? (
          <Skeleton className="w-full h-full" />
        ) : (
          <iframe
            src={mapIframe}
            width="100%"
            height="100%"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="Black Pepper Location"
          />
        )}
      </section>

      {/* Contact Content */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Contact Form */}
            <ScrollReveal variant="fade-right">
              <div>
                <h1 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-4">
                  Gửi thắc mắc cho chúng tôi
                </h1>
                <p className="text-muted-foreground mb-8">
                  Nếu bạn có thắc mắc gì, có thể gửi yêu cầu cho chúng tôi, và chúng tôi sẽ liên lạc lại với bạn sớm nhất có thể.
                </p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <Input
                      name="name"
                      placeholder="Tên của bạn"
                      value={formData.name}
                      onChange={handleChange}
                      className={errors.name ? "border-destructive" : ""}
                    />
                    {errors.name && (
                      <p className="text-destructive text-sm mt-1">{errors.name}</p>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Input
                        name="email"
                        type="email"
                        placeholder="Email của bạn"
                        value={formData.email}
                        onChange={handleChange}
                        className={errors.email ? "border-destructive" : ""}
                      />
                      {errors.email && (
                        <p className="text-destructive text-sm mt-1">{errors.email}</p>
                      )}
                    </div>
                    <div>
                      <Input
                        name="phone"
                        type="tel"
                        placeholder="Số điện thoại của bạn"
                        value={formData.phone}
                        onChange={handleChange}
                        className={errors.phone ? "border-destructive" : ""}
                      />
                      {errors.phone && (
                        <p className="text-destructive text-sm mt-1">{errors.phone}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <Textarea
                      name="message"
                      placeholder="Nội dung"
                      rows={5}
                      value={formData.message}
                      onChange={handleChange}
                      className={errors.message ? "border-destructive" : ""}
                    />
                    {errors.message && (
                      <p className="text-destructive text-sm mt-1">{errors.message}</p>
                    )}
                  </div>

                  <Button type="submit" className="w-full md:w-auto" disabled={isSubmitting}>
                    <span className="flex items-center">
                      <Loader2 className={`w-4 h-4 mr-2 animate-spin ${isSubmitting ? 'inline' : 'hidden'}`} />
                      <Send className={`w-4 h-4 mr-2 ${isSubmitting ? 'hidden' : 'inline'}`} />
                      <span>{isSubmitting ? "Đang gửi..." : "GỬI CHO CHÚNG TÔI"}</span>
                    </span>
                  </Button>
                </form>
              </div>
            </ScrollReveal>

            {/* Contact Info */}
            <ScrollReveal variant="fade-left">
              <div>
                <h2 className="text-2xl md:text-3xl font-serif font-bold text-foreground mb-8">
                  Thông tin liên hệ
                </h2>

                <div className="space-y-6">
                  {contactInfo.map((info, index) => (
                    <div key={index} className="flex gap-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <info.icon className="w-5 h-5 text-muted-foreground" />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">{info.title}</h4>
                        <p className="text-muted-foreground whitespace-pre-line">{info.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      <SpiceFooter />
    </div>
  );
};

export default Contact;
