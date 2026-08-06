import { useState, useEffect, useRef } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Globe, Phone, Mail, MapPin, Share2, Upload, X, Image, Plus, Trash2, GripVertical, Edit2, ShoppingBag, BarChart3 } from "lucide-react";
import { SocialLink } from "@/hooks/useSiteSettings";
import { useProvinces } from "@/hooks/useProvinces";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SiteSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  setting_type: string | null;
}

const AdminSettings = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingLink, setEditingLink] = useState<SocialLink | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<SocialLink>>({});

  // Call useProvinces hook to get provinces data
  const { data: provinces = [], isLoading: isLoadingProvinces } = useProvinces();

  const { data: siteSettings, isLoading, refetch } = useQuery({
    queryKey: ["admin-site-settings"], // Use different key to avoid conflict with useSiteSettings
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*");
      if (error) throw error;
      // Ensure we always return an array, even if data is null/undefined
      return (Array.isArray(data) ? data : []) as SiteSetting[];
    },
    staleTime: 0, // Always refetch when invalidated
  });

  useEffect(() => {
    if (siteSettings && Array.isArray(siteSettings)) {
      const settingsMap: Record<string, string> = {};
      let foundSocialLinks = false;
      
      siteSettings.forEach((setting) => {
        if (setting.setting_key === 'social_links') {
          foundSocialLinks = true;
          // Parse social links JSON
          try {
            const links = setting.setting_value ? JSON.parse(setting.setting_value) : [];
            const parsedLinks = Array.isArray(links) ? links : [];
            setSocialLinks(parsedLinks);
          } catch (error) {
            if (process.env.NODE_ENV === 'development') {
              console.error('AdminSettings - Error parsing social_links:', error);
            }
            setSocialLinks([]);
          }
        } else {
          settingsMap[setting.setting_key] = setting.setting_value || "";
        }
      });
      
      setSettings(settingsMap);
      
      if (!foundSocialLinks) {
        setSocialLinks([]);
      }
    } else if (siteSettings === undefined && !isLoading) {
      // If no data and not loading, reset to empty
      setSocialLinks([]);
    }
  }, [siteSettings, isLoading]);

  const updateMutation = useMutation({
    mutationFn: async (updates: { key: string; value: string }[]) => {
      for (const update of updates) {
        // Check if setting exists - use array pattern instead of .single() to avoid 406 error
        const { data: existingData, error: checkError } = await supabase
          .from("site_settings")
          .select("id")
          .eq("setting_key", update.key);

        if (checkError) throw checkError;

        const existing = existingData && existingData.length > 0 ? existingData[0] : null;

        if (existing) {
          const { error } = await supabase
            .from("site_settings")
            .update({ setting_value: update.value })
            .eq("setting_key", update.key);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("site_settings")
            .insert({ setting_key: update.key, setting_value: update.value, setting_type: update.key === 'social_links' ? 'json' : 'text' });
          if (error) throw error;
        }
      }
    },
    onSuccess: async () => {
      // Invalidate both admin and user queries
      await queryClient.invalidateQueries({ queryKey: ["admin-site-settings"] });
      await queryClient.invalidateQueries({ queryKey: ["site-settings"] }); // Also invalidate user query
      
      // Refetch the query to get fresh data
      await refetch();
      
      toast({
        title: "Thành công",
        description: "Đã lưu cài đặt website",
      });
    },
    onError: (error) => {
      toast({
        title: "Lỗi",
        description: "Không thể lưu cài đặt: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = () => {
    const updates = Object.entries(settings).map(([key, value]) => ({
      key,
      value,
    }));
    // Add social_links as JSON
    updates.push({
      key: 'social_links',
      value: JSON.stringify(socialLinks),
    });
    updateMutation.mutate(updates);
  };

  const addSocialLink = () => {
    const newLink: SocialLink = {
      id: Date.now().toString(),
      name: "",
      url: "",
      icon: "phone",
      is_active: true,
      order: socialLinks.length,
    };
    setSocialLinks([...socialLinks, newLink]);
  };

  const removeSocialLink = (id: string) => {
    setSocialLinks(socialLinks.filter((link) => link.id !== id));
  };

  const updateSocialLink = (id: string, field: keyof SocialLink, value: any) => {
    setSocialLinks(
      socialLinks.map((link) =>
        link.id === id ? { ...link, [field]: value } : link
      )
    );
  };

  const handleEditLink = (link: SocialLink) => {
    setEditingLink(link);
    setEditFormData({ ...link });
  };

  const handleSaveEdit = () => {
    if (!editingLink) return;
    setSocialLinks(
      socialLinks.map((link) =>
        link.id === editingLink.id ? { ...link, ...editFormData } : link
      )
    );
    setEditingLink(null);
    setEditFormData({});
    toast({
      title: "Thành công",
      description: "Đã cập nhật nút liên hệ",
    });
  };

  const handleCancelEdit = () => {
    setEditingLink(null);
    setEditFormData({});
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Lỗi",
        description: "Vui lòng chọn file ảnh",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Lỗi",
        description: "Kích thước file tối đa là 2MB",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `site/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      handleChange("logo_url", publicUrl);
      
      toast({
        title: "Thành công",
        description: "Đã tải lên logo",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Không thể tải lên logo";
      toast({
        title: "Lỗi",
        description: "Không thể tải lên: " + errorMessage,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveLogo = () => {
    handleChange("logo_url", "");
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
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
            <h1 className="text-2xl font-bold">Cài đặt Website</h1>
            <p className="text-muted-foreground">Quản lý thông tin chung của website</p>
          </div>
          <Button 
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            <span className="flex items-center">
              <Loader2 className={`w-4 h-4 mr-2 animate-spin ${updateMutation.isPending ? 'inline' : 'hidden'}`} />
              <Save className={`w-4 h-4 mr-2 ${updateMutation.isPending ? 'hidden' : 'inline'}`} />
              <span>Lưu thay đổi</span>
            </span>
          </Button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Thông tin cơ bản */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="w-5 h-5" />
                Thông tin cơ bản
              </CardTitle>
              <CardDescription>Tên website và logo</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="site_name">Tên website</Label>
                <Input
                  id="site_name"
                  value={settings.site_name || ""}
                  onChange={(e) => handleChange("site_name", e.target.value)}
                  placeholder="Nhập tên website"
                />
              </div>
              
              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                
                {settings.logo_url ? (
                  <div className="relative inline-block">
                    <div className="border rounded-lg p-4 bg-muted/30">
                      <img
                        src={settings.logo_url}
                        alt="Logo preview"
                        className="h-16 object-contain"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/placeholder.svg";
                        }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveLogo}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
                  >
                    {uploading ? (
                      <Loader2 className="w-8 h-8 mx-auto animate-spin text-muted-foreground" />
                    ) : (
                      <>
                        <Image className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                        <p className="text-sm text-muted-foreground">
                          Click để tải lên logo
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          PNG, JPG tối đa 2MB
                        </p>
                      </>
                    )}
                  </div>
                )}
                
                {settings.logo_url && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="mt-2"
                  >
                    <span className="inline-flex items-center mr-2">
                      {uploading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4" />
                      )}
                    </span>
                    Thay đổi logo
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Thông tin liên hệ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="w-5 h-5" />
                Thông tin liên hệ
              </CardTitle>
              <CardDescription>Số điện thoại và email</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Số điện thoại
                </Label>
                <Input
                  id="phone"
                  value={settings.phone || ""}
                  onChange={(e) => handleChange("phone", e.target.value)}
                  placeholder="0123 456 789"
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
                  value={settings.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Địa chỉ */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="w-5 h-5" />
                Địa chỉ
              </CardTitle>
              <CardDescription>Địa chỉ cửa hàng/văn phòng</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="address">Địa chỉ đầy đủ</Label>
                <Textarea
                  id="address"
                  value={settings.address || ""}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="123 Đường ABC, Quận XYZ, TP. Hồ Chí Minh"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Google Analytics */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5" />
                Google Analytics
              </CardTitle>
              <CardDescription>Cấu hình Google Analytics 4 (GA4) để theo dõi lượt truy cập</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ga4_measurement_id">
                  GA4 Measurement ID
                </Label>
                <Input
                  id="ga4_measurement_id"
                  value={settings.ga4_measurement_id || ""}
                  onChange={(e) => handleChange("ga4_measurement_id", e.target.value)}
                  placeholder="G-XXXXXXXXXX"
                />
                <p className="text-sm text-muted-foreground">
                  Nhập Measurement ID từ Google Analytics 4 (ví dụ: G-XXXXXXXXXX). 
                  Để trống nếu không sử dụng Google Analytics.
                </p>
                <p className="text-xs text-muted-foreground">
                  💡 Lấy Measurement ID tại: Google Analytics → Admin → Data Streams → Chọn stream → Measurement ID
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Shipping Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5" />
                Vận chuyển
              </CardTitle>
              <CardDescription>Cấu hình phí vận chuyển và miễn phí vận chuyển</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="free_shipping_threshold">
                  Ngưỡng miễn phí vận chuyển (₫)
                </Label>
                <Input
                  id="free_shipping_threshold"
                  type="number"
                  value={settings.free_shipping_threshold || "300000"}
                  onChange={(e) => handleChange("free_shipping_threshold", e.target.value)}
                  placeholder="300000"
                />
                <p className="text-sm text-muted-foreground">
                  Đơn hàng từ {new Intl.NumberFormat("vi-VN").format(parseInt(settings.free_shipping_threshold || "300000"))}₫ sẽ được miễn phí vận chuyển
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_shipping_fee">
                  Phí vận chuyển mặc định (₫)
                </Label>
                <Input
                  id="default_shipping_fee"
                  type="number"
                  value={settings.default_shipping_fee || "30000"}
                  onChange={(e) => handleChange("default_shipping_fee", e.target.value)}
                  placeholder="30000"
                />
                <p className="text-sm text-muted-foreground">
                  Phí vận chuyển áp dụng cho đơn hàng chưa đạt ngưỡng miễn phí
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="shipping_province_code">
                  Tỉnh/Thành phố gửi hàng <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={settings.shipping_province_code || "HCM"}
                  onValueChange={(value) => handleChange("shipping_province_code", value)}
                >
                  <SelectTrigger id="shipping_province_code">
                    <SelectValue placeholder="Chọn tỉnh/thành phố gửi hàng" />
                  </SelectTrigger>
                  <SelectContent>
                    {isLoadingProvinces ? (
                      <SelectItem value="loading" disabled>Đang tải...</SelectItem>
                    ) : (
                      provinces.map((province) => (
                        <SelectItem key={province.id} value={province.code}>
                          {province.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  Tỉnh/thành phố nơi cửa hàng gửi hàng (dùng để tính phí vận chuyển SPX Express)
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Social Links - Dynamic Management */}
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Share2 className="w-5 h-5" />
                    Nút Liên Hệ (Contact Button)
                    {socialLinks.length > 0 && (
                      <span className="ml-2 px-2 py-1 text-xs font-normal bg-primary/10 text-primary rounded-full">
                        {socialLinks.length} nút
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Quản lý các nút liên hệ hiển thị trong menu popup. Click "Chỉnh sửa" để cập nhật thông tin.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={addSocialLink}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Thêm nút mới
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {socialLinks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Share2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>Chưa có nút liên hệ nào</p>
                  <p className="text-sm mt-2">Nhấn "Thêm nút" để tạo mới</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {socialLinks
                    .sort((a, b) => a.order - b.order)
                    .map((link, index) => (
                      <Card key={link.id} className="p-4 border-2 hover:border-primary/50 transition-colors">
                        <div className="flex items-start gap-4">
                          <div className="flex flex-col items-center gap-2 pt-2">
                            <GripVertical className="w-5 h-5 text-muted-foreground" />
                            <span className="text-sm font-bold text-primary bg-primary/10 rounded-full w-8 h-8 flex items-center justify-center">
                              {index + 1}
                            </span>
                          </div>

                          <div className="flex-1">
                            <div className="mb-3 flex items-center gap-2">
                              <h4 className="font-semibold text-lg">{link.name || "(Chưa có tên)"}</h4>
                              {link.is_active ? (
                                <span className="px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">Đang hiển thị</span>
                              ) : (
                                <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-600 rounded-full">Đã ẩn</span>
                              )}
                            </div>
                            <div className="grid gap-3 md:grid-cols-2 mb-4 bg-muted/30 p-3 rounded-lg">
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">
                                  {link.icon === "email" 
                                    ? "Địa chỉ Email" 
                                    : link.icon === "phone"
                                    ? "Số điện thoại"
                                    : "URL / Số điện thoại"}
                                </Label>
                                <p className="text-sm break-all font-mono bg-background p-2 rounded">
                                  {link.url || (link.icon === "email" ? "(Chưa có email)" : "(Chưa có URL)")}
                                </p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Icon</Label>
                                <p className="text-sm capitalize font-medium">{link.icon}</p>
                              </div>
                              <div>
                                <Label className="text-xs text-muted-foreground mb-1 block">Màu nền</Label>
                                <div className="flex items-center gap-2">
                                  <div
                                    className="w-8 h-8 rounded border-2 border-gray-300 shadow-sm"
                                    style={{ backgroundColor: link.bg_color || "#3b82f6" }}
                                  />
                                  <span className="text-sm font-mono">{link.bg_color || "#3b82f6"}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 pt-2 border-t">
                              <Button
                                type="button"
                                variant="default"
                                size="sm"
                                onClick={() => handleEditLink(link)}
                                className="bg-primary hover:bg-primary/90"
                              >
                                <Edit2 className="w-4 h-4 mr-2" />
                                Chỉnh sửa
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newOrder = link.order - 1;
                                  if (newOrder >= 0) {
                                    updateSocialLink(link.id, "order", newOrder);
                                    const prevLink = socialLinks.find(
                                      (l) => l.order === newOrder
                                    );
                                    if (prevLink) {
                                      updateSocialLink(prevLink.id, "order", link.order);
                                    }
                                  }
                                }}
                                disabled={link.order === 0}
                                title="Di chuyển lên"
                              >
                                ↑
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newOrder = link.order + 1;
                                  if (newOrder < socialLinks.length) {
                                    updateSocialLink(link.id, "order", newOrder);
                                    const nextLink = socialLinks.find(
                                      (l) => l.order === newOrder
                                    );
                                    if (nextLink) {
                                      updateSocialLink(nextLink.id, "order", link.order);
                                    }
                                  }
                                }}
                                disabled={link.order === socialLinks.length - 1}
                                title="Di chuyển xuống"
                              >
                                ↓
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                onClick={() => removeSocialLink(link.id)}
                                className="ml-auto"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Footer */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Footer</CardTitle>
              <CardDescription>Nội dung hiển thị ở cuối trang</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="footer_text">Văn bản Footer</Label>
                <Input
                  id="footer_text"
                  value={settings.footer_text || ""}
                  onChange={(e) => handleChange("footer_text", e.target.value)}
                  placeholder="© 2024 Your Company. All rights reserved."
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingLink} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa nút liên hệ</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin nút liên hệ. Nhấn "Lưu" để áp dụng thay đổi.
            </DialogDescription>
          </DialogHeader>
          {editingLink && (
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Tên hiển thị *</Label>
                <Input
                  id="edit-name"
                  value={editFormData.name || ""}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, name: e.target.value })
                  }
                  placeholder="Ví dụ: Hotline, Zalo, Email..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-url">
                  {editingLink.icon === "email" 
                    ? "Địa chỉ Email *" 
                    : editingLink.icon === "phone"
                    ? "Số điện thoại *"
                    : "URL / Số điện thoại *"}
                </Label>
                <Input
                  id="edit-url"
                  type={editingLink.icon === "email" ? "email" : "text"}
                  value={editFormData.url || ""}
                  onChange={(e) => {
                    let value = e.target.value;
                    // Auto-remove mailto: prefix for email
                    if (editingLink.icon === "email") {
                      value = value.replace(/^mailto:/i, "").trim();
                    }
                    setEditFormData({ ...editFormData, url: value });
                  }}
                  placeholder={
                    editingLink.icon === "email"
                      ? "example@domain.com"
                      : editingLink.icon === "phone"
                      ? "0123 456 789"
                      : "https://... hoặc số điện thoại"
                  }
                />
                {editingLink.icon === "email" && editFormData.url && (
                  <p className="text-xs text-muted-foreground">
                    Email sẽ mở ứng dụng email mặc định khi click
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-icon">Icon *</Label>
                <Select
                  value={editFormData.icon || "phone"}
                  onValueChange={(value: SocialLink["icon"]) =>
                    setEditFormData({ ...editFormData, icon: value })
                  }
                >
                  <SelectTrigger id="edit-icon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="phone">Phone</SelectItem>
                    <SelectItem value="zalo">Zalo</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-bg-color">Màu nền (hex)</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={editFormData.bg_color || "#3b82f6"}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, bg_color: e.target.value })
                    }
                    className="w-20 h-10"
                  />
                  <Input
                    id="edit-bg-color"
                    value={editFormData.bg_color || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, bg_color: e.target.value })
                    }
                    placeholder="#3b82f6"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-icon-color">Màu icon (hex)</Label>
                <div className="flex gap-2">
                  <Input
                    type="color"
                    value={editFormData.icon_color || "#ffffff"}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, icon_color: e.target.value })
                    }
                    className="w-20 h-10"
                  />
                  <Input
                    id="edit-icon-color"
                    value={editFormData.icon_color || ""}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, icon_color: e.target.value })
                    }
                    placeholder="#ffffff"
                    className="flex-1"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="edit-active"
                  checked={editFormData.is_active ?? true}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, is_active: e.target.checked })
                  }
                  className="w-4 h-4 rounded"
                />
                <Label htmlFor="edit-active" className="cursor-pointer">
                  Hiển thị nút này
                </Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleCancelEdit}>
              Hủy
            </Button>
            <Button type="button" onClick={handleSaveEdit}>
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSettings;
