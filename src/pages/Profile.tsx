import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Save, Mail, Phone, MapPin, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import SEO from "@/components/SEO";

interface Profile {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  address: string | null;
  created_at: string;
  updated_at: string;
}

const Profile = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    full_name: "",
    phone: "",
    address: "",
  });

  // Fetch profile data
  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) throw error;
      return data as Profile | null;
    },
    enabled: !!user,
  });

  // Update form data when profile loads
  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || "",
        phone: profile.phone || "",
        address: profile.address || "",
      });
    }
  }, [profile]);

  // Create or update profile mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { full_name: string; phone: string; address: string }) => {
      if (!user) throw new Error("User not authenticated");

      // Check if profile exists
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingProfile) {
        // Update existing profile
        const { error } = await supabase
          .from("profiles")
          .update({
            full_name: data.full_name || null,
            phone: data.phone || null,
            address: data.address || null,
          })
          .eq("user_id", user.id);

        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from("profiles")
          .insert({
            user_id: user.id,
            full_name: data.full_name || null,
            phone: data.phone || null,
            address: data.address || null,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
      toast({
        title: "Thành công",
        description: "Đã cập nhật thông tin hồ sơ",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Lỗi",
        description: "Không thể cập nhật thông tin: " + error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  const handleChange = (field: keyof typeof formData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SpiceHeader />
        <main className="flex-1 pt-32 pb-12">
          <div className="container mx-auto px-4 max-w-4xl">
            <Skeleton className="h-64 w-full" />
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <SEO title="Hồ sơ | Gia Vị Việt" description="Quản lý thông tin cá nhân" />
        <SpiceHeader />
        <main className="flex-1 pt-32 pb-12 flex items-center justify-center">
          <div className="text-center">
            <User className="w-16 h-16 text-muted-foreground/50 mx-auto mb-4" />
            <h1 className="text-2xl font-serif font-bold mb-2">Bạn chưa đăng nhập</h1>
            <p className="text-muted-foreground mb-4">Vui lòng đăng nhập để xem hồ sơ của bạn</p>
            <Button asChild>
              <Link to="/auth">Đăng nhập</Link>
            </Button>
          </div>
        </main>
        <SpiceFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SEO title="Hồ sơ của tôi | Gia Vị Việt" description="Quản lý thông tin cá nhân" />
      <SpiceHeader />
      <main className="flex-1 pt-32 pb-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-3xl font-serif font-bold mb-2">Hồ sơ của tôi</h1>
            <p className="text-muted-foreground">Quản lý thông tin cá nhân của bạn</p>
          </div>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Main Profile Form */}
            <div className="md:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Thông tin cá nhân
                  </CardTitle>
                  <CardDescription>Cập nhật thông tin liên hệ của bạn</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Email (read-only) */}
                    <div className="space-y-2">
                      <Label htmlFor="email" className="flex items-center gap-2">
                        <Mail className="w-4 h-4" />
                        Email
                      </Label>
                      <Input
                        id="email"
                        type="email"
                        value={user.email || ""}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Email không thể thay đổi
                      </p>
                    </div>

                    {/* Full Name */}
                    <div className="space-y-2">
                      <Label htmlFor="full_name">Họ và tên</Label>
                      <Input
                        id="full_name"
                        value={formData.full_name}
                        onChange={(e) => handleChange("full_name", e.target.value)}
                        placeholder="Nhập họ và tên"
                      />
                    </div>

                    {/* Phone */}
                    <div className="space-y-2">
                      <Label htmlFor="phone" className="flex items-center gap-2">
                        <Phone className="w-4 h-4" />
                        Số điện thoại
                      </Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleChange("phone", e.target.value)}
                        placeholder="0123 456 789"
                      />
                    </div>

                    {/* Address */}
                    <div className="space-y-2">
                      <Label htmlFor="address" className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" />
                        Địa chỉ
                      </Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => handleChange("address", e.target.value)}
                        placeholder="Nhập địa chỉ của bạn"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={updateMutation.isPending}
                      className="w-full"
                    >
                      <span className="inline-flex items-center mr-2">
                        {updateMutation.isPending ? (
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                      </span>
                      {updateMutation.isPending ? "Đang lưu..." : "Lưu thay đổi"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            {/* Quick Links Sidebar */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Thông tin tài khoản</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Email</p>
                    <p className="text-sm font-medium">{user.email}</p>
                  </div>
                  {profile?.created_at && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Thành viên từ</p>
                      <p className="text-sm font-medium">
                        {new Date(profile.created_at).toLocaleDateString("vi-VN")}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Liên kết nhanh</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button variant="outline" className="w-full justify-start" asChild>
                    <Link to="/orders">
                      <Package className="w-4 h-4 mr-2" />
                      Lịch sử đơn hàng
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
      <SpiceFooter />
    </div>
  );
};

export default Profile;

