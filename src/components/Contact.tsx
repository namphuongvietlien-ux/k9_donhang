import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Phone, Mail, MapPin, Clock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import ScrollReveal from "@/components/ScrollReveal";

const contactInfo = [
  {
    icon: Phone,
    title: "Điện thoại",
    value: "0123 456 789",
    description: "Hotline hỗ trợ 24/7",
  },
  {
    icon: Mail,
    title: "Email",
    value: "contact@tamnhuaviet.vn",
    description: "Phản hồi trong 24h",
  },
  {
    icon: MapPin,
    title: "Địa chỉ",
    value: "123 Đường ABC, Quận 1",
    description: "TP. Hồ Chí Minh",
  },
  {
    icon: Clock,
    title: "Giờ làm việc",
    value: "8:00 - 17:30",
    description: "Thứ 2 - Thứ 7",
  },
];

const Contact = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.");
    setFormData({ name: "", email: "", phone: "", message: "" });
  };

  return (
    <section id="contact" className="py-20 bg-background">
      <div className="container mx-auto px-4">
        {/* Section Header */}
        <ScrollReveal variant="fade-up">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-primary font-medium">Liên hệ</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mt-2 mb-4">
              Kết Nối Với Chúng Tôi
            </h2>
            <p className="text-muted-foreground">
              Hãy để lại thông tin, chúng tôi sẽ liên hệ tư vấn và báo giá cho bạn
            </p>
          </div>
        </ScrollReveal>

        <div className="grid lg:grid-cols-2 gap-12">
          {/* Contact Info */}
          <div className="grid sm:grid-cols-2 gap-6">
            {contactInfo.map((info, index) => (
              <ScrollReveal key={index} variant="fade-up" delay={index * 100}>
                <Card className="border-border h-full">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mb-4">
                      <info.icon className="w-6 h-6 text-accent-foreground" />
                    </div>
                    <h3 className="font-semibold text-foreground mb-1">
                      {info.title}
                    </h3>
                    <p className="text-primary font-medium">{info.value}</p>
                    <p className="text-sm text-muted-foreground">
                      {info.description}
                    </p>
                  </CardContent>
                </Card>
              </ScrollReveal>
            ))}
          </div>

          {/* Contact Form */}
          <ScrollReveal variant="fade-left" delay={200}>
            <Card className="border-border">
              <CardContent className="p-8">
                <h3 className="text-xl font-semibold text-foreground mb-6">
                  Gửi tin nhắn cho chúng tôi
                </h3>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Input
                        placeholder="Họ và tên *"
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        required
                        className="bg-background"
                      />
                    </div>
                    <div>
                      <Input
                        type="email"
                        placeholder="Email *"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        required
                        className="bg-background"
                      />
                    </div>
                  </div>
                  <div>
                    <Input
                      type="tel"
                      placeholder="Số điện thoại"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="bg-background"
                    />
                  </div>
                  <div>
                    <Textarea
                      placeholder="Nội dung tin nhắn *"
                      rows={4}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      required
                      className="bg-background resize-none"
                    />
                  </div>
                  <Button type="submit" size="lg" className="w-full">
                    Gửi tin nhắn
                  </Button>
                </form>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
};

export default Contact;
