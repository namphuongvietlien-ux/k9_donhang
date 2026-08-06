-- Create site_settings table for storing website configuration
CREATE TABLE public.site_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key text UNIQUE NOT NULL,
  setting_value text,
  setting_type text DEFAULT 'text', -- text, image, json
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view site settings"
ON public.site_settings
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage site settings"
ON public.site_settings
FOR ALL
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Create trigger for updating timestamps
CREATE TRIGGER update_site_settings_updated_at
BEFORE UPDATE ON public.site_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings
INSERT INTO public.site_settings (setting_key, setting_value, setting_type) VALUES
  ('site_name', 'Gia Vị Việt Nam', 'text'),
  ('logo_url', '', 'image'),
  ('phone', '0123 456 789', 'text'),
  ('email', 'contact@giavivietnam.com', 'text'),
  ('address', '123 Đường ABC, Quận XYZ, TP. Hồ Chí Minh', 'text'),
  ('facebook_url', '', 'text'),
  ('zalo_url', '', 'text'),
  ('footer_text', '© 2024 Gia Vị Việt Nam. All rights reserved.', 'text');