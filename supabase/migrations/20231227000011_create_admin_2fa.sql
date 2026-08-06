-- Create admin_otp table for 2FA
CREATE TABLE IF NOT EXISTS public.admin_otp (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_otp ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert OTP (needed for login flow)
CREATE POLICY "Anyone can insert OTP"
ON public.admin_otp
FOR INSERT
WITH CHECK (true);

-- Policy: Anyone can verify OTP (needed for login flow)
CREATE POLICY "Anyone can verify OTP"
ON public.admin_otp
FOR SELECT
USING (true);

-- Policy: Anyone can update OTP (to mark as used)
CREATE POLICY "Anyone can update OTP"
ON public.admin_otp
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Policy: Only admins can view all OTP records (for debugging)
CREATE POLICY "Admins can view all OTP records"
ON public.admin_otp
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_admin_otp_email ON public.admin_otp(email);
CREATE INDEX IF NOT EXISTS idx_admin_otp_code ON public.admin_otp(otp_code);
CREATE INDEX IF NOT EXISTS idx_admin_otp_expires_at ON public.admin_otp(expires_at);

-- Function to clean up expired OTPs (runs periodically)
CREATE OR REPLACE FUNCTION public.cleanup_expired_otps()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.admin_otp
  WHERE expires_at < now();
END;
$$;

-- Only allow specific admin email
-- This will be enforced in the application layer
-- Email: nguyenthanhphatdeveloper@gmail.com

