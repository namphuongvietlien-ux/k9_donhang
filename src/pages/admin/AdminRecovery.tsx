import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Shield, Loader2 } from "lucide-react";
import SEO from "@/components/SEO";

/**
 * Emergency Recovery Page
 * 
 * This page allows a super admin to restore their role if they accidentally removed it.
 * 
 * SECURITY NOTE: This page should only be accessible if:
 * 1. User is authenticated (has valid session)
 * 2. User's email matches a predefined list of recovery emails
 * 3. This is a last-resort recovery mechanism
 */
const AdminRecovery = () => {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState("");
  
  // List of emails that can use recovery (should match your super admin emails)
  const ALLOWED_RECOVERY_EMAILS = [
    "nguyenthanhphatdeveloper@gmail.com",
    // Add more super admin emails here if needed
  ];

  const handleRecovery = async () => {
    if (!email || !email.trim()) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Vui lòng nhập email",
      });
      return;
    }

    // Check if user is authenticated
    if (!user || !session) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Bạn cần đăng nhập trước",
      });
      return;
    }

    // Check if authenticated user's email matches the recovery email
    const normalizedUserEmail = user.email?.toLowerCase().trim();
    const normalizedInputEmail = email.toLowerCase().trim();

    if (normalizedUserEmail !== normalizedInputEmail) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Email không khớp với tài khoản đang đăng nhập",
      });
      return;
    }

    // Check if email is in allowed recovery list
    if (!ALLOWED_RECOVERY_EMAILS.some(e => e.toLowerCase() === normalizedInputEmail)) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Email này không được phép sử dụng tính năng khôi phục",
      });
      return;
    }

    // Optional: Require recovery code for extra security
    // For now, we'll skip this but you can add it later
    if (recoveryCode && recoveryCode.trim() !== "RECOVERY2025") {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Mã khôi phục không đúng",
      });
      return;
    }

    setIsRestoring(true);

    try {
      // Call RPC function to restore role
      const { data, error } = await supabase.rpc('restore_super_admin_role', {
        user_email: normalizedInputEmail,
        recovery_code: recoveryCode || null
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Thành công",
        description: "Đã khôi phục quyền super_admin. Vui lòng đăng nhập lại.",
      });

      // Sign out and redirect to login
      setTimeout(async () => {
        await supabase.auth.signOut();
        window.location.href = "/admin/login";
      }, 2000);

    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Recovery error:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể khôi phục quyền. Vui lòng liên hệ admin hoặc chạy migration SQL trực tiếp trong Supabase Dashboard.",
      });
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <SEO title="Khôi phục quyền Admin" />
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-destructive" />
            <CardTitle>Khôi phục quyền Admin</CardTitle>
          </div>
          <CardDescription>
            Trang khôi phục khẩn cấp cho Super Admin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Chỉ sử dụng trang này nếu bạn là Super Admin và đã vô tình xóa quyền của chính mình.
              Sau khi khôi phục, bạn sẽ cần đăng nhập lại.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="email">Email của bạn</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nguyenthanhphatdeveloper@gmail.com"
              disabled={isRestoring}
            />
            <p className="text-xs text-muted-foreground">
              Email phải khớp với tài khoản đang đăng nhập
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="recoveryCode">Mã khôi phục (tùy chọn)</Label>
            <Input
              id="recoveryCode"
              type="text"
              value={recoveryCode}
              onChange={(e) => setRecoveryCode(e.target.value)}
              placeholder="RECOVERY2025"
              disabled={isRestoring}
            />
            <p className="text-xs text-muted-foreground">
              Để trống nếu không có mã khôi phục
            </p>
          </div>

          <Button
            onClick={handleRecovery}
            disabled={isRestoring || !email.trim()}
            className="w-full"
            variant="destructive"
          >
            {isRestoring ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Đang khôi phục...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Khôi phục quyền Super Admin
              </>
            )}
          </Button>

          <div className="text-xs text-muted-foreground space-y-1">
            <p className="font-semibold">Cách khác để khôi phục:</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Mở Supabase Dashboard → SQL Editor</li>
              <li>Chạy migration: <code className="bg-muted px-1 rounded">20250107000001_restore_super_admin_role.sql</code></li>
              <li>Hoặc chạy SQL trực tiếp:</li>
            </ol>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-2">
{`INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::app_role
FROM auth.users
WHERE email = 'nguyenthanhphatdeveloper@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;`}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminRecovery;
