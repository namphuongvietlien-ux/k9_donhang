import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Lock, Shield, ArrowLeft, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { checkRateLimit, recordAttempt, resetRateLimit } from "@/utils/rateLimiter";

const loginSchema = z.object({
  email: z.string().trim().email({ message: "Email không hợp lệ" }),
  password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự" }),
});

const otpSchema = z.object({
  otp: z.string().length(6, { message: "Mã OTP phải có 6 chữ số" }).regex(/^\d+$/, { message: "Mã OTP chỉ chứa số" }),
});

const isLocalDevHost = () => typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

const isLocalDevAdminEmail = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  return (
    normalized.includes("test.admin+local") ||
    normalized.includes("admin.test@local.dev") ||
    normalized.includes("local.dev")
  );
};

const saveLocalDevAdminEmail = (value: string | null | undefined) => {
  if (!isLocalDevHost()) return;
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized && isLocalDevAdminEmail(normalized)) {
    window.localStorage.setItem("localAdminEmail", normalized);
  }
};

const isLocalDevAdminCredentials = (emailInput: string, passwordInput: string) => {
  const isLocalDev = isLocalDevHost();
  const normalizedEmail = String(emailInput || "").trim().toLowerCase();
  const normalizedPassword = String(passwordInput || "").trim();
  return (
    isLocalDev &&
    isLocalDevAdminEmail(normalizedEmail) &&
    normalizedPassword === "123456"
  );
};

const AdminLogin = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [step, setStep] = useState<"login" | "otp" | "forgot-password">("login");
  const [isLoading, setIsLoading] = useState(false);
  
  // Login form state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginErrors, setLoginErrors] = useState<Record<string, string>>({});
  
  // OTP form state
  const [otp, setOtp] = useState("");
  const [otpErrors, setOtpErrors] = useState<Record<string, string>>({});
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  
  // Forgot password form state
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState("");
  const [forgotPasswordErrors, setForgotPasswordErrors] = useState<Record<string, string>>({});
  const [isPasswordResetSent, setIsPasswordResetSent] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErrors({});
    
    const result = loginSchema.safeParse({ email, password });
    
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setLoginErrors(errors);
      return;
    }
    
    setIsLoading(true);
    
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const isLocalDevFallback = isLocalDevAdminCredentials(normalizedEmail, password);

      if (isLocalDevFallback) {
        saveLocalDevAdminEmail(normalizedEmail);
        window.localStorage.setItem("localAdminSession", "1");
        setIsLoading(false);
        navigate("/admin");
        return;
      }

      // Step 1: Verify email and password with Supabase
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      
      if (authError) {
        let message = "Email hoặc mật khẩu không đúng";
        if (authError.message.includes("Invalid login credentials") || authError.message.includes("Invalid email or password")) {
          message = "Email hoặc mật khẩu không đúng";
        } else if (authError.message.includes("Email not confirmed")) {
          message = "Vui lòng xác nhận email của bạn trước khi đăng nhập";
        } else if (authError.message.includes("User not found")) {
          message = "Email không tồn tại trong hệ thống";
        } else if (authError.status === 400) {
          message = `Lỗi xác thực: ${authError.message || "Email hoặc mật khẩu không đúng"}`;
        }
        toast({
          variant: "destructive",
          title: "Đăng nhập thất bại",
          description: message,
        });
        setIsLoading(false);
        return;
      }

      // Step 2: Check if user can access admin panel
      if (!authData.user) {
        toast({
          variant: "destructive",
          title: "Đăng nhập thất bại",
          description: "Không thể xác thực người dùng",
        });
        setIsLoading(false);
        return;
      }

      // Check if user can access admin panel using can_access_admin function
      const { data: canAccess, error: canAccessError } = await supabase.rpc('can_access_admin', {
        _user_id: authData.user.id
      });

      if (canAccessError || !canAccess) {
        await supabase.auth.signOut();
        toast({
          variant: "destructive",
          title: "Truy cập bị từ chối",
          description: "Bạn không có quyền truy cập trang quản trị.",
        });
        setIsLoading(false);
        return;
      }

      const isLocalDev = isLocalDevHost();
      saveLocalDevAdminEmail(email);

      // Step 3: Check rate limit before generating OTP
      const rateLimitCheck = checkRateLimit();
      if (!rateLimitCheck.allowed) {
        toast({
          variant: "destructive",
          title: "Quá nhiều yêu cầu",
          description: `Bạn đã vượt quá số lần yêu cầu OTP cho phép (3 lần trong 15 phút). Vui lòng đợi ${rateLimitCheck.remainingTime} phút hoặc sử dụng đăng nhập Google.`,
          duration: 10000,
          action: process.env.NODE_ENV === 'development' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetRateLimit();
                toast({
                  title: "Đã reset rate limit",
                  description: "Bạn có thể thử lại ngay bây giờ.",
                });
              }}
            >
              Reset (Dev)
            </Button>
          ) : undefined,
        });
        setIsLoading(false);
        return;
      }

      if (isLocalDev) {
        recordAttempt();
        setSessionToken(authData.session?.access_token || null);
        setStep("otp");
        toast({
          title: "Chế độ dev",
          description: "Đang dùng bypass OTP local. Vui lòng nhập mã 123456 để tiếp tục.",
        });
        setIsLoading(false);
        return;
      }

      // Step 4: Generate OTP and send email
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP expires in 10 minutes
      
      // Record attempt for rate limiting
      recordAttempt();

      // Save OTP to database
      // Try with better error handling
      let otpError = null;
      try {
        const { error } = await supabase
          .from("admin_otp")
          .insert({
            email: email.toLowerCase(),
            otp_code: otpCode,
            expires_at: expiresAt.toISOString(),
            used: false,
          });
        otpError = error;
      } catch (err) {
        otpError = err as any;
      }

      if (otpError) {
        // If it's a schema cache issue, show helpful message
        if (otpError.code === "PGRST205" || otpError.message?.includes("schema cache")) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Schema cache chưa refresh. Vui lòng đợi 1-2 phút và thử lại, hoặc refresh schema cache trong Supabase Dashboard. Bạn có thể sử dụng đăng nhập Google thay thế.",
            duration: 10000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: "Không thể tạo mã xác thực. Vui lòng thử lại hoặc sử dụng đăng nhập Google.",
            duration: 10000,
          });
        }
        setIsLoading(false);
        return;
      }

      // Send OTP via Edge Function using direct fetch for better error handling
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      // Use the same key as the Supabase client (supports both VITE_SUPABASE_PUBLISHABLE_KEY and VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY)
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!authData.session?.access_token) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Không thể lấy session token. Vui lòng thử lại.",
        });
        setIsLoading(false);
        return;
      }

      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/send-admin-otp`;

      let emailResponse: Response;
      let emailResponseData: any = null;
      
      try {
        const fetchStartTime = Date.now();
        
        emailResponse = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authData.session.access_token}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({ 
            email: email.toLowerCase(), 
            otpCode 
          }),
        });
        
        const fetchEndTime = Date.now();


        // Try to parse response as JSON, fallback to text if it fails
        let emailResponseData: any = {};
        try {
          const responseText = await emailResponse.text();
          if (responseText) {
            emailResponseData = JSON.parse(responseText);
          }
        } catch (parseError) {
          // Response might not be JSON, that's okay
          console.warn("Failed to parse response as JSON:", parseError);
        }


        if (!emailResponse.ok) {
          const errorMessage = emailResponseData?.error || emailResponseData?.details || `HTTP ${emailResponse.status}: ${emailResponse.statusText}`;
          let userMessage = "Không thể gửi email xác thực. Vui lòng thử lại.";
          
          if (emailResponse.status === 401) {
            userMessage = emailResponseData?.error || emailResponseData?.details || "JWT token không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.";
          } else if (emailResponse.status === 404) {
            userMessage = "Edge Function send-admin-otp chưa được deploy. Vui lòng liên hệ admin hoặc sử dụng đăng nhập Google.";
          } else if (emailResponse.status === 403) {
            userMessage = emailResponseData?.error || "Email không được phép sử dụng tính năng này.";
          } else if (emailResponse.status === 500) {
            userMessage = emailResponseData?.error || "Lỗi server khi gửi email. Vui lòng thử lại sau hoặc sử dụng đăng nhập Google.";
          } else if (errorMessage) {
            userMessage = `Không thể gửi email: ${errorMessage}`;
          }
          
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: userMessage,
            duration: 10000,
          });
          setIsLoading(false);
          return;
        }

        if (emailResponseData?.error) {
          toast({
            variant: "destructive",
            title: "Lỗi",
            description: `Không thể gửi email: ${emailResponseData.error}`,
            duration: 10000,
          });
          setIsLoading(false);
          return;
        }
      } catch (fetchError: any) {
        
        let userMessage = "Không thể kết nối đến Edge Function. ";
        
        // More specific error messages
        if (fetchError.message?.includes("Failed to fetch") || fetchError.message?.includes("NetworkError")) {
          // Check if Edge Function might not be deployed
          userMessage += "Edge Function 'send-admin-otp' có thể chưa được deploy. ";
          userMessage += "Vui lòng kiểm tra Supabase Dashboard → Edge Functions hoặc sử dụng đăng nhập Google.";
        } else if (fetchError.message?.includes("CORS")) {
          userMessage += "Lỗi CORS. Vui lòng kiểm tra cấu hình Edge Function.";
        } else {
          userMessage += fetchError.message || "Vui lòng thử lại hoặc sử dụng đăng nhập Google.";
        }
        
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: userMessage,
          duration: 15000,
        });
        setIsLoading(false);
        return;
      }

      // Store session token temporarily (we'll verify OTP before completing login)
      setSessionToken(authData.session?.access_token || null);
      setStep("otp");
      toast({
        title: "Mã xác thực đã được gửi",
        description: `Vui lòng kiểm tra email ${email} để lấy mã OTP 6 chữ số.`,
      });
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Login error:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Đã xảy ra lỗi khi đăng nhập. Vui lòng thử lại.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpErrors({});
    
    const result = otpSchema.safeParse({ otp });
    
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setOtpErrors(errors);
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Verify OTP
      const isLocalDev = isLocalDevHost();
      const isDevBypassOtp = isLocalDev && otp === "123456";
      saveLocalDevAdminEmail(email);

      const { data: otpData, error: otpError } = await supabase
        .from("admin_otp")
        .select("*")
        .eq("email", email.toLowerCase())
        .eq("otp_code", otp)
        .eq("used", false)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (otpError || (!otpData && !isDevBypassOtp)) {
        setOtpErrors({ otp: "Mã OTP không hợp lệ hoặc đã hết hạn" });
        toast({
          variant: "destructive",
          title: "Xác thực thất bại",
          description: "Mã OTP không hợp lệ hoặc đã hết hạn. Vui lòng thử lại.",
        });
        setIsLoading(false);
        return;
      }

      // Mark OTP as used
      if (otpData?.id) {
        await supabase
          .from("admin_otp")
          .update({ used: true })
          .eq("id", otpData.id);
      }

      // Login successful - session is already established from step 1
      // Reset rate limit on successful login
      resetRateLimit();
      
      toast({
        title: "Đăng nhập thành công!",
        description: "Chào mừng bạn đến với trang quản trị",
      });
      
      if (isLocalDev && isDevBypassOtp) {
        saveLocalDevAdminEmail(email);
        window.localStorage.setItem("localAdminSession", "1");
      }
      
      // Refresh session to ensure it's valid
      await supabase.auth.refreshSession();
      
      navigate("/admin");
    } catch (error) {
      console.error("OTP verification error:", error);
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Đã xảy ra lỗi khi xác thực. Vui lòng thử lại.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Google OAuth login
  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const currentOrigin = window.location.origin;
    const isIPAddress = /^\d+\.\d+\.\d+\.\d+/.test(currentOrigin.replace(/^https?:\/\//, ''));
    
    try {
      const redirectUrl = `${window.location.origin}/admin/login/callback`;
      
      
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });


      if (error) {
        let errorMessage = "Không thể đăng nhập bằng Google. Vui lòng thử lại.";
        
        if (error.message?.includes("provider is not enabled")) {
          errorMessage = "Google OAuth chưa được enable trong Supabase. Vui lòng vào Supabase Dashboard → Authentication → Providers → Google và enable provider, sau đó click Save.";
        } else if (error.message?.includes("redirect") || error.message?.includes("redirect_uri")) {
          errorMessage = "Redirect URL chưa được cấu hình trong Supabase. Vui lòng:\n1. Vào Supabase Dashboard → Authentication → URL Configuration\n2. Thêm redirect URL: " + redirectUrl + "\n3. Lưu ý: Nếu dùng IP address, cần thêm cả http:// và https://";
        } else if (isIPAddress) {
          errorMessage = "Đăng nhập Google qua IP address có thể không hoạt động. Vui lòng:\n1. Sử dụng domain name thay vì IP\n2. Hoặc cấu hình redirect URL trong Supabase Dashboard → Authentication → URL Configuration\n3. Thêm cả http://" + currentOrigin.replace(/^https?:\/\//, '') + " và https://" + currentOrigin.replace(/^https?:\/\//, '');
        }
        
        toast({
          variant: "destructive",
          title: "Lỗi đăng nhập Google",
          description: errorMessage,
          duration: 15000,
        });
        setIsLoading(false);
        return;
      }

      // OAuth will redirect automatically
      // If we get here, the redirect should happen
      if (!data?.url) {
        toast({
          variant: "destructive",
          title: "Lỗi",
          description: "Không thể lấy URL xác thực. Vui lòng thử lại.",
          duration: 10000,
        });
        setIsLoading(false);
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Google login error:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Đã xảy ra lỗi khi đăng nhập bằng Google. Vui lòng thử lại hoặc sử dụng đăng nhập bằng email/password.",
        duration: 10000,
      });
      setIsLoading(false);
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      
      // Handle hash fragment (mobile OAuth callback)
      let hashFragment = '';
      if (window.location.hash) {
        // Store hash fragment before clearing
        hashFragment = window.location.hash;
        
        // Clear hash immediately to prevent stale session warning
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        
        // Supabase client should automatically handle hash fragments
        // But we need to wait a bit for it to process
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // Get session - Supabase client should have processed the hash fragment
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        if (process.env.NODE_ENV === 'development') {
          console.error("Session error:", error);
        }
        toast({
          variant: "destructive",
          title: "Lỗi xác thực",
          description: "Không thể lấy thông tin phiên đăng nhập. Vui lòng thử lại.",
        });
        navigate("/admin/login");
        return;
      }

      if (session?.user) {
        // Check if user can access admin panel using can_access_admin function
        const { data: canAccess, error: canAccessError } = await supabase.rpc('can_access_admin', {
          _user_id: session.user.id
        });

        if (canAccessError || !canAccess) {
          await supabase.auth.signOut();
          toast({
            variant: "destructive",
            title: "Truy cập bị từ chối",
            description: "Bạn không có quyền truy cập trang quản trị. Vui lòng liên hệ admin để được cấp quyền.",
          });
          navigate("/admin/login");
          return;
        }

        // Login successful - reset rate limit
        resetRateLimit();
        if (typeof window !== 'undefined') {
          saveLocalDevAdminEmail(session.user.email);
          window.localStorage.setItem("localAdminSession", "1");
        }
        
        // Ensure hash fragment is cleared (in case it wasn't cleared earlier)
        if (window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        
        toast({
          title: "Đăng nhập thành công!",
          description: "Chào mừng bạn đến với trang quản trị",
        });
        
        navigate("/admin");
      } else {
      }
    };

    // Check if we're on the callback URL (with or without hash fragment)
    // OAuth callback can redirect to any URL with hash fragment, so check hash first
    const hasAccessToken = window.location.hash.includes("access_token");
    const isCallbackPath = window.location.pathname === "/admin/login/callback";
    const isCallback = isCallbackPath || hasAccessToken;
    
    if (isCallback) {
      handleOAuthCallback();
    }
  }, [navigate, toast]);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotPasswordErrors({});

    // Validate email
    if (!forgotPasswordEmail || !forgotPasswordEmail.trim()) {
      setForgotPasswordErrors({ email: "Vui lòng nhập email" });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(forgotPasswordEmail.trim())) {
      setForgotPasswordErrors({ email: "Email không hợp lệ" });
      return;
    }

    // Check rate limit for password reset requests
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      toast({
        variant: "destructive",
        title: "Quá nhiều yêu cầu",
        description: `Bạn đã vượt quá số lần yêu cầu đặt lại mật khẩu cho phép. Vui lòng đợi ${rateLimitCheck.remainingTime} phút hoặc liên hệ admin.`,
        duration: 10000,
      });
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Check if email has admin role
      const { data: hasAdminRole, error: checkError } = await supabase.rpc('check_admin_email_exists', {
        user_email: forgotPasswordEmail.toLowerCase().trim()
      });

      if (checkError) {
        throw new Error("Không thể kiểm tra quyền. Vui lòng thử lại.");
      }

      if (!hasAdminRole) {
        toast({
          variant: "destructive",
          title: "Không có quyền",
          description: "Email này chưa được phân quyền admin. Vui lòng liên hệ admin để được cấp quyền.",
        });
        setIsLoading(false);
        return;
      }

      // Step 2: Send password reset email
      const redirectUrl = `${window.location.origin}/admin/reset-password`;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        forgotPasswordEmail.toLowerCase().trim(),
        {
          redirectTo: redirectUrl,
        }
      );

      if (resetError) {
        throw resetError;
      }

      // Record attempt for rate limiting
      recordAttempt();

      setIsPasswordResetSent(true);
      toast({
        title: "Email đã được gửi",
        description: `Vui lòng kiểm tra email ${forgotPasswordEmail} để đặt lại mật khẩu.`,
      });
    } catch (error: any) {
      if (process.env.NODE_ENV === 'development') {
        console.error("Forgot password error:", error);
      }
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: error.message || "Không thể gửi email đặt lại mật khẩu. Vui lòng thử lại.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    // Check rate limit before resending
    const rateLimitCheck = checkRateLimit();
    if (!rateLimitCheck.allowed) {
      toast({
        variant: "destructive",
        title: "Quá nhiều yêu cầu",
        description: `Bạn đã vượt quá số lần yêu cầu OTP cho phép. Vui lòng đợi ${rateLimitCheck.remainingTime} phút hoặc sử dụng đăng nhập Google.`,
        duration: 10000,
      });
      return;
    }

    setIsLoading(true);
    try {
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10);

      const { error: insertError } = await supabase.from("admin_otp").insert({
        email: email.toLowerCase(),
        otp_code: otpCode,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

      if (insertError) {
        throw insertError;
      }

      const { error: emailError } = await supabase.functions.invoke("send-admin-otp", {
        body: { email: email.toLowerCase(), otpCode },
      });

      if (emailError) {
        throw emailError;
      }

      // Record attempt for rate limiting
      recordAttempt();

      toast({
        title: "Mã OTP mới đã được gửi",
        description: `Vui lòng kiểm tra email ${email}`,
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Lỗi",
        description: "Không thể gửi lại mã OTP. Vui lòng thử lại hoặc sử dụng đăng nhập Google.",
        duration: 10000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md shadow-xl overflow-hidden">
        <CardHeader className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-8 h-8 text-primary" />
            <CardTitle className="text-2xl font-bold">Đăng nhập Admin</CardTitle>
          </div>
          <CardDescription>
            {step === "login" 
              ? "Vui lòng đăng nhập bằng tài khoản admin" 
              : step === "otp"
              ? "Nhập mã xác thực 6 chữ số đã được gửi đến email của bạn"
              : "Nhập email admin để nhận link đặt lại mật khẩu"}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {step === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Admin</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    placeholder="nguyenthanhphatdeveloper@gmail.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
                {loginErrors.email && (
                  <p className="text-sm text-destructive">{loginErrors.email}</p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    inputMode="text"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                  />
                </div>
                {loginErrors.password && (
                  <p className="text-sm text-destructive">{loginErrors.password}</p>
                )}
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Đang xác thực...
                  </>
                ) : (
                  "Đăng nhập"
                )}
              </Button>
              
              <div className="text-center">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-sm text-muted-foreground hover:text-primary"
                  onClick={() => {
                    setStep("forgot-password");
                    setForgotPasswordEmail(email); // Pre-fill with login email
                    setForgotPasswordErrors({});
                    setIsPasswordResetSent(false);
                  }}
                  disabled={isLoading}
                >
                  Quên mật khẩu?
                </Button>
              </div>
              
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Hoặc</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogleLogin}
                disabled={isLoading}
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Đăng nhập bằng Google
              </Button>
            </form>
          ) : step === "forgot-password" ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              {isPasswordResetSent ? (
                <div className="space-y-4 text-center">
                  <div className="flex items-center justify-center">
                    <div className="rounded-full bg-green-100 dark:bg-green-900 p-3">
                      <Mail className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold mb-2">Email đã được gửi</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Vui lòng kiểm tra email <strong>{forgotPasswordEmail}</strong> và làm theo hướng dẫn để đặt lại mật khẩu.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Nếu không thấy email, vui lòng kiểm tra thư mục spam hoặc thử lại sau vài phút.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setStep("login");
                      setForgotPasswordEmail("");
                      setForgotPasswordErrors({});
                      setIsPasswordResetSent(false);
                    }}
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Quay lại đăng nhập
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email Admin</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        placeholder="nguyenthanhphatdeveloper@gmail.com"
                        value={forgotPasswordEmail}
                        onChange={(e) => setForgotPasswordEmail(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                      />
                    </div>
                    {forgotPasswordErrors.email && (
                      <p className="text-sm text-destructive">{forgotPasswordErrors.email}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Chỉ những tài khoản đã được phân quyền tại "/admin/users" mới có thể đặt lại mật khẩu.
                    </p>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setStep("login");
                        setForgotPasswordEmail("");
                        setForgotPasswordErrors({});
                      }}
                      disabled={isLoading}
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" />
                      Quay lại
                    </Button>
                    <Button type="submit" className="flex-1" disabled={isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Đang gửi...
                        </>
                      ) : (
                        <>
                          <KeyRound className="w-4 h-4 mr-2" />
                          Gửi email
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </form>
          ) : (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="otp">Mã xác thực (OTP)</Label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  value={otp}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(value);
                  }}
                  className="text-center text-2xl font-mono tracking-widest"
                  maxLength={6}
                  disabled={isLoading}
                />
                {otpErrors.otp && (
                  <p className="text-sm text-destructive">{otpErrors.otp}</p>
                )}
                <p className="text-xs text-muted-foreground text-center">
                  Mã OTP đã được gửi đến {email}
                </p>
              </div>
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep("login");
                    setOtp("");
                    setOtpErrors({});
                    supabase.auth.signOut();
                  }}
                  disabled={isLoading}
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Quay lại
                </Button>
                <Button type="submit" className="flex-1" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Đang xác thực...
                    </>
                  ) : (
                    "Xác thực"
                  )}
                </Button>
              </div>
              
              <Button
                type="button"
                variant="ghost"
                className="w-full text-sm"
                onClick={handleResendOTP}
                disabled={isLoading}
              >
                Gửi lại mã OTP
              </Button>
            </form>
          )}
          
          <div className="mt-6 pt-4 border-t text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:text-primary">
              ← Về trang chủ
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogin;

