-- Add social_links setting to store dynamic social media links
-- This will be stored as JSON array in site_settings

-- Insert default social_links setting if not exists
INSERT INTO public.site_settings (setting_key, setting_value, setting_type)
VALUES ('social_links', '[]', 'json')
ON CONFLICT (setting_key) DO NOTHING;

