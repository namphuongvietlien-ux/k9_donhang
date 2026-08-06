// Supabase Edge Function to generate dynamic sitemap.xml
// Deploy: supabase functions deploy sitemap

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Base URL - should be set in environment variables
    const baseUrl = Deno.env.get("SITE_URL") || "https://vinon.vn";
    const today = new Date().toISOString().split("T")[0];

    // Fetch products with images
    const { data: products = [], error: productsError } = await supabase
      .from("products")
      .select("slug, updated_at, image_url, name")
      .eq("is_active", true)
      .order("updated_at", { ascending: false });

    if (productsError) {
      console.error("Error fetching products:", productsError);
    }

    // Fetch posts
    const { data: posts = [], error: postsError } = await supabase
      .from("posts")
      .select("slug, updated_at, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false });

    if (postsError) {
      console.error("Error fetching posts:", postsError);
    }

    // Fetch categories
    const { data: categories = [], error: categoriesError } = await supabase
      .from("categories")
      .select("slug, updated_at")
      .eq("is_active", true);

    if (categoriesError) {
      console.error("Error fetching categories:", categoriesError);
    }

    // Build URL list with images
    const urls: Array<{
      loc: string;
      lastmod?: string;
      changefreq: string;
      priority: string;
      image?: string;
      imageTitle?: string;
    }> = [
      // Static pages
      {
        loc: `${baseUrl}/`,
        lastmod: today,
        changefreq: "daily",
        priority: "1.0",
      },
      {
        loc: `${baseUrl}/products`,
        lastmod: today,
        changefreq: "daily",
        priority: "0.9",
      },
      {
        loc: `${baseUrl}/about`,
        lastmod: today,
        changefreq: "monthly",
        priority: "0.8",
      },
      {
        loc: `${baseUrl}/news`,
        lastmod: today,
        changefreq: "daily",
        priority: "0.8",
      },
      {
        loc: `${baseUrl}/contact`,
        lastmod: today,
        changefreq: "monthly",
        priority: "0.7",
      },
      {
        loc: `${baseUrl}/promotions`,
        lastmod: today,
        changefreq: "weekly",
        priority: "0.8",
      },
    ];

    // Add products with images
    products.forEach((product: any) => {
      const productUrl = {
        loc: `${baseUrl}/product/${product.slug}`,
        lastmod: product.updated_at
          ? new Date(product.updated_at).toISOString().split("T")[0]
          : today,
        changefreq: "weekly",
        priority: "0.8",
        ...(product.image_url && {
          image: product.image_url.startsWith("http") 
            ? product.image_url 
            : `${baseUrl}${product.image_url}`,
          imageTitle: product.name || product.slug,
        }),
      };
      urls.push(productUrl);
    });

    // Add posts
    posts.forEach((post) => {
      urls.push({
        loc: `${baseUrl}/news/${post.slug}`,
        lastmod: post.updated_at
          ? new Date(post.updated_at).toISOString().split("T")[0]
          : today,
        changefreq: "monthly",
        priority: "0.7",
      });
    });

    // Add categories
    categories.forEach((category) => {
      urls.push({
        loc: `${baseUrl}/products?category=${encodeURIComponent(category.slug)}`,
        lastmod: category.updated_at
          ? new Date(category.updated_at).toISOString().split("T")[0]
          : today,
        changefreq: "weekly",
        priority: "0.6",
      });
    });

    // Generate XML
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
        xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls
  .map(
    (url) => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod || today}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>${url.image ? `
    <image:image>
      <image:loc>${url.image}</image:loc>${url.imageTitle ? `
      <image:title>${url.imageTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</image:title>` : ""}
    </image:image>` : ""}
  </url>`
  )
  .join("\n")}
</urlset>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error generating sitemap:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate sitemap" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

