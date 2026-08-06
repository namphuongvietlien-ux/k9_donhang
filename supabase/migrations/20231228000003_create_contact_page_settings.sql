-- Create contact_page_settings table for storing contact page content
CREATE TABLE IF NOT EXISTS public.contact_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default values
INSERT INTO public.contact_page_settings (setting_key, setting_value)
VALUES
  ('google_map_iframe', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3919.4946681149473!2d106.64977731531963!3d10.772461992322762!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x31752ec0e7a7a0ed%3A0x286a30d4c72a8f2f!2zMTgyIMSQLiBMw6ogxJDhuqFpIEjDoG5oLCBQaMaw4budbmcgMTUsIFF14bqtbiAxMSwgVGjDoG5oIHBo4buRIEjhu5MgQ2jDrSBNaW5oLCBWaeG7h3QgTmFt!5e0!3m2!1svi!2s!4v1703123456789!5m2!1svi!2s'),
  ('address', 'Tầng 4, tòa nhà Flemington, số 182, đường Lê Đại Hành, phường 15, quận 11, Tp. Hồ Chí Minh.'),
  ('phone', '1900.636.000'),
  ('email', 'hi@blackpepper.info'),
  ('working_hours', 'Thứ 2 đến Thứ 6: từ 8h đến 18h;\nThứ 7 và Chủ nhật: từ 8h00 đến 17h00')
ON CONFLICT (setting_key) DO NOTHING;

-- Create index
CREATE INDEX IF NOT EXISTS idx_contact_page_settings_key ON public.contact_page_settings(setting_key);

-- Enable RLS
ALTER TABLE public.contact_page_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can view (for public page)
CREATE POLICY "Anyone can view contact page settings"
ON public.contact_page_settings
FOR SELECT
TO anon, authenticated
USING (true);

-- Only admins can update
CREATE POLICY "Admins can update contact page settings"
ON public.contact_page_settings
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can insert
CREATE POLICY "Admins can insert contact page settings"
ON public.contact_page_settings
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_contact_page_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at
CREATE TRIGGER update_contact_page_settings_updated_at
BEFORE UPDATE ON public.contact_page_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_contact_page_settings_updated_at();

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

