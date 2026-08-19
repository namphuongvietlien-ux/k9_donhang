-- Restore default category seed data for storefront/admin pages.
-- This prevents /admin/categories from remaining empty after a database reset.

INSERT INTO public.categories (name, slug, description, is_active, display_order)
VALUES
  ('Tiêu', 'tieu', 'Danh mục sản phẩm tiêu', true, 1),
  ('Quế', 'que', 'Danh mục sản phẩm quế', true, 2),
  ('Nghệ', 'nghe', 'Danh mục sản phẩm nghệ', true, 3),
  ('Hữu cơ', 'huu-co', 'Danh mục sản phẩm hữu cơ', true, 4),
  ('Combo', 'combo', 'Danh mục sản phẩm combo', true, 5)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.categories (name, slug, description, is_active, display_order)
VALUES
  ('Hạt tiêu', 'hat-tieu', 'Hạt tiêu nguyên chất', true, 6),
  ('Bột quế', 'bot-que', 'Bột quế nguyên chất', true, 7),
  ('Nghệ tươi', 'nghe-tuoi', 'Nghệ tươi', true, 8)
ON CONFLICT (name) DO NOTHING;

-- Ensure existing slug duplicates are not created unexpectedly.
UPDATE public.categories
SET slug = lower(regexp_replace(trim(name), '[^a-z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';
