import { useState, useEffect, useRef, useLayoutEffect } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, MapPin, Phone, Mail, Clock, Map } from "lucide-react";

interface ContactSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
}

const AdminContact = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMountedRef = useRef(true);
  const [isNavigating, setIsNavigating] = useState(false);
  const [formData, setFormData] = useState({
    google_map_iframe: "",
    address: "",
    phone: "",
    email: "",
    working_hours: "",
  });

  // Prevent renders during unmount
  useLayoutEffect(() => {
    return () => {
      isMountedRef.current = false;
      setIsNavigating(true);
    };
  }, []);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["admin-contact-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contact_page_settings")
        .select("*")
        .order("setting_key");
      if (error) throw error;
      return (data || []) as ContactSetting[];
    },
  });

  useEffect(() => {
    if (settings && settings.length > 0) {
      const settingsMap: Record<string, string> = {};
      settings.forEach((setting) => {
        settingsMap[setting.setting_key] = setting.setting_value || "";
      });
      setFormData({
        google_map_iframe: settingsMap.google_map_iframe || "",
        address: settingsMap.address || "",
        phone: settingsMap.phone || "",
        email: settingsMap.email || "",
        working_hours: settingsMap.working_hours || "",
      });
    }
  }, [settings]);

  const updateMutation = useMutation({
    mutationFn: async (updates: { key: string; value: string }[]) => {
      for (const update of updates) {
        // Check if setting exists
        const { data: existing } = await supabase
          .from("contact_page_settings")
          .select("id")
          .eq("setting_key", update.key)
          .single();

        if (existing) {
          const { error } = await supabase
            .from("contact_page_settings")
            .update({ setting_value: update.value })
            .eq("setting_key", update.key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("contact_page_settings")
            .insert({ setting_key: update.key, setting_value: update.value });
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-contact-settings"] });
      queryClient.invalidateQueries({ queryKey: ["contact-page-settings"] });
      toast({
        title: "Thành công",
        description: "Đã lưu cài đặt trang liên hệ",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: "Không thể lưu cài đặt: " + (error instanceof Error ? error.message : "Lỗi không xác định"),
        variant: "destructive",
      });
    },
  });

  const handleChange = (key: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const updates = Object.entries(formData).map(([key, value]) => ({
      key,
      value,
    }));
    updateMutation.mutate(updates);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quản lý Trang Liên hệ</h1>
            <p className="text-muted-foreground">
              Chỉnh sửa nội dung hiển thị trên trang liên hệ
            </p>
          </div>
          {!isNavigating ? (
            <Button onClick={handleSave} disabled={updateMutation.isPending}>
              <span className="flex items-center">
                <Loader2 className={`w-4 h-4 mr-2 animate-spin ${updateMutation.isPending ? 'inline' : 'hidden'}`} />
                <Save className={`w-4 h-4 mr-2 ${updateMutation.isPending ? 'hidden' : 'inline'}`} />
                <span>{updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}</span>
              </span>
            </Button>
          ) : (
            <Button disabled={true}>
              <span className="flex items-center">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                <span>Đang lưu...</span>
              </span>
            </Button>
          )}
        </div>

        {/* Google Map */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Map className="w-5 h-5" />
              Google Map
            </CardTitle>
            <CardDescription>
              Nhập URL iframe của Google Map. Lấy từ Google Maps: Chia sẻ → Nhúng bản đồ → Sao chép HTML → Lấy src từ thẻ iframe
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="google_map_iframe">URL iframe Google Map</Label>
              <Textarea
                id="google_map_iframe"
                value={formData.google_map_iframe}
                onChange={(e) => handleChange("google_map_iframe", e.target.value)}
                placeholder="https://www.google.com/maps/embed?pb=..."
                rows={3}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Ví dụ: https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!...
              </p>
            </div>
            {formData.google_map_iframe && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted p-2 text-xs text-muted-foreground">
                  Preview:
                </div>
                <div className="w-full h-[300px]">
                  <iframe
                    src={formData.google_map_iframe}
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    title="Google Map Preview"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader>
            <CardTitle>Thông tin liên hệ</CardTitle>
            <CardDescription>
              Cập nhật thông tin liên hệ hiển thị trên trang
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="address" className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Địa chỉ
              </Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleChange("address", e.target.value)}
                placeholder="Nhập địa chỉ..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Điện thoại
              </Label>
              <Input
                id="phone"
                value={formData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="Nhập số điện thoại..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="Nhập email..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="working_hours" className="flex items-center gap-2">
                <Clock className="w-4 h-4" />
                Thời gian làm việc
              </Label>
              <Textarea
                id="working_hours"
                value={formData.working_hours}
                onChange={(e) => handleChange("working_hours", e.target.value)}
                placeholder="Nhập thời gian làm việc..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">
                Có thể xuống dòng bằng cách nhấn Enter
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminContact;

