-- Add video_url and gallery_images columns to products table
-- Video: supports all video formats
-- Gallery: JSONB array of image URLs, max 6 images

-- Add video_url column
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS video_url TEXT;

-- Add gallery_images column (JSONB array)
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for gallery_images for faster queries
CREATE INDEX IF NOT EXISTS idx_products_gallery_images ON public.products USING gin (gallery_images);

-- Create storage bucket for product videos (if not exists)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'product-videos',
  'product-videos',
  true,
  524288000, -- 500MB limit
  ARRAY['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska', 'video/3gpp', 'video/x-flv']
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for product videos
-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view product videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload product videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update product videos" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete product videos" ON storage.objects;

-- Create policies for product videos
CREATE POLICY "Anyone can view product videos"
ON storage.objects
FOR SELECT
USING (bucket_id = 'product-videos');

CREATE POLICY "Admins can upload product videos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'product-videos' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can update product videos"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'product-videos' 
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Admins can delete product videos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'product-videos' 
  AND public.has_role(auth.uid(), 'admin')
);

-- Refresh PostgREST schema cache
NOTIFY pgrst, 'reload schema';

