import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Shield, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

const resetPasswordSchema = z.object({
  password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự" }),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Mật khẩu không khớp",
  path: ["confirmPassword"],
});

const AdminResetPassword = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let timeoutId: NodeJS.Timeout | null = null;
    
    // Check if we have a valid session from the password reset link
    // Supabase automatically processes hash fragments (#access_token=...) from reset password links
    const checkSession = async () => {
      try {
        // First check: Supabase client should have processed the hash fragment automatically
        let { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        // If no session and we have a hash fragment, wait for Supabase to process it
        if (!session && window.location.hash) {
          // Wait a moment for Supabase client to process the hash fragment
          await new Promise<void>(resolve => {
            timeoutId = setTimeout(() => resolve(), 500);
          });
          
          if (!isMounted) return;
          
          // Check again after waiting
          const { data: { session: newSession }, error: newError } = await supabase.auth.getSession();
          session = newSession;
          sessionError = newError;
        }
        
        if (!isMounted) return;
        
        if (sessionError) {
          throw sessionError;
        }
        
        if (!session) {
          toast({
            variant: "destructive",
            title: "Link không hợp lệ",
            description: "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu link mới.",
          });
          navigate("/admin/login");
          return;
        }
        
        setIsValidatingToken(false);
      } catch (error) {
        if (!isMounted) return;
        
        if (process.env.NODE_ENV === 'development') {
          console.error("Error validating token:", error);
        }
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Không thể xác thực link. Vui lòng thử lại.",
        });
        navigate("/admin/login");
      }
    };

    checkSession();
    
    return () => {
      isMounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = resetPasswordSchema.safeParse({ password, confirmPassword });

    if (!result.success) {
      const newErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          newErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);

    try {
      // Update password using Supabase Auth
      const { error: updateError } = await supabase.auth.updateUser({
        password: password,
      });

      if (updateError) {
        throw updateError;
      }

      setIsSuccess(true);
      toast({
        title: "Thành công",
        description: "Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập lại.",
      });

      // Redirect to login after 2 seconds
      setTimeout(() => {
        supabase.auth.signOut();
        navigate("/admin/login");
      }, 2000);
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Reset password error:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể đặt lại mật khẩu. Vui lòng thử lại.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isValidatingToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Đang xác thực link...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <SEO title="Đặt lại mật khẩu" />
      <Card className="w-full max-w-md shadow-xl overflow-hidden">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Đặt lại mật khẩu</CardTitle>
          </div>
          <CardDescription>
            {isSuccess 
              ? "Mật khẩu đã được đặt lại thành công"
              : "Nhập mật khẩu mới cho tài khoản admin của bạn"}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {isSuccess ? (
            <div className="space-y-4 text-center">
              <div className="flex items-center justify-center">
                <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                  <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold mb-2">Thành công!</h3>
                <p className="text-sm text-muted-foreground">
                  Mật khẩu của bạn đã được đặt lại thành công. Bạn sẽ được chuyển đến trang đăng nhập...
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu mới</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    inputMode="text"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    inputMode="text"
                    autoComplete="new-password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
                {errors.confirmPassword && (
                  <p className="text-sm text-destructive">{errors.confirmPassword}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xử lý...
                  </>
                ) : (
                  "Đặt lại mật khẩu"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminResetPassword;
