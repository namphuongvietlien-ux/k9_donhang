-- Optimize Database Indexes for Production Performance
-- This migration adds missing indexes for common queries

-- Products table indexes (most critical for product pages)
CREATE INDEX IF NOT EXISTS idx_products_slug ON public.products(slug);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON public.products(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_products_created_at ON public.products(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_price ON public.products(price);
CREATE INDEX IF NOT EXISTS idx_products_active_category ON public.products(is_active, category) WHERE is_active = true;

-- Posts table indexes (for news/blog pages)
CREATE INDEX IF NOT EXISTS idx_posts_is_published ON public.posts(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_posts_published_at ON public.posts(published_at DESC) WHERE published_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_category ON public.posts(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_published_category ON public.posts(is_published, category) WHERE is_published = true;

-- Orders table indexes (for order management)
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders(user_id, created_at DESC) WHERE user_id IS NOT NULL;

-- Order items indexes
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- Page contents indexes (for policy pages and dynamic content)
CREATE INDEX IF NOT EXISTS idx_page_contents_page_key ON public.page_contents(page_key);

-- Banners indexes (for homepage)
CREATE INDEX IF NOT EXISTS idx_banners_is_active ON public.banners(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_banners_display_order ON public.banners(display_order) WHERE is_active = true;

-- Categories indexes (if categories table exists)
-- CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
-- CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active) WHERE is_active = true;

-- Composite indexes for common query patterns
-- Products: active products by category, ordered by created_at
CREATE INDEX IF NOT EXISTS idx_products_active_category_created ON public.products(is_active, category, created_at DESC) 
  WHERE is_active = true AND category IS NOT NULL;

-- Posts: published posts by category, ordered by published_at
CREATE INDEX IF NOT EXISTS idx_posts_published_category_date ON public.posts(is_published, category, published_at DESC) 
  WHERE is_published = true AND published_at IS NOT NULL;

-- Analyze tables to update statistics (helps query planner)
ANALYZE public.products;
ANALYZE public.posts;
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.product_reviews;
ANALYZE public.page_contents;
ANALYZE public.banners;
ANALYZE public.newsletter_subscriptions;

