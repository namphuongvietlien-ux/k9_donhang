-- Create menu_items table for dynamic header navigation
CREATE TABLE IF NOT EXISTS public.menu_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  is_external BOOLEAN NOT NULL DEFAULT false,
  icon TEXT, -- Optional icon name (e.g., "Home", "Package", etc.)
  parent_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  target_blank BOOLEAN NOT NULL DEFAULT false, -- Open in new tab
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_id ON public.menu_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_display_order ON public.menu_items(display_order);
CREATE INDEX IF NOT EXISTS idx_menu_items_is_active ON public.menu_items(is_active);

-- Enable RLS
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active menu items
CREATE POLICY "Anyone can view active menu items"
ON public.menu_items
FOR SELECT
USING (is_active = true);

-- Policy: Admins can manage all menu items
CREATE POLICY "Admins can manage menu items"
ON public.menu_items
FOR ALL
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_menu_items_updated_at
BEFORE UPDATE ON public.menu_items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default menu items
INSERT INTO public.menu_items (label, href, is_external, display_order, is_active) VALUES
  ('Trang chủ', '/', false, 1, true),
  ('Sản phẩm', '/products', false, 2, true),
  ('Khuyến mãi', '/promotions', false, 3, true),
  ('Giới thiệu', '/about', false, 4, true),
  ('Tin tức', '/news', false, 5, true),
  ('Liên hệ', '/contact', false, 6, true)
ON CONFLICT DO NOTHING;

