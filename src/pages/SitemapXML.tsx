import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Helmet } from "react-helmet-async";

const SitemapXML = () => {
  const [xml, setXml] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    generateSitemap();
  }, []);

  useEffect(() => {
    // Set content type when XML is ready
    if (xml && !loading) {
      // Try to set response headers (works in some environments)
      const meta = document.createElement("meta");
      meta.httpEquiv = "Content-Type";
      meta.content = "application/xml; charset=utf-8";
      document.head.appendChild(meta);
    }
  }, [xml, loading]);

  interface SitemapProduct {
    slug: string;
    updated_at: string | null;
  }

  interface SitemapPost {
    slug: string;
    updated_at: string | null;
    published_at: string | null;
  }

  interface SitemapCategory {
    slug: string;
    updated_at: string | null;
  }

  const generateSitemap = async () => {
    try {
      const baseUrl = import.meta.env.VITE_SITE_URL || window.location.origin;
      const today = new Date().toISOString().split("T")[0];

      // Fetch products
      const { data: products = [] } = await supabase
        .from("products")
        .select("slug, updated_at")
        .eq("is_active", true)
        .order("updated_at", { ascending: false });

      // Fetch posts
      const { data: posts = [] } = await supabase
        .from("posts")
        .select("slug, updated_at, published_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false });

      // Fetch categories
      const { data: categories = [] } = await supabase
        .from("categories")
        .select("slug, updated_at")
        .eq("is_active", true);

      // Build URL list
      const urls: Array<{
        loc: string;
        lastmod?: string;
        changefreq: string;
        priority: string;
      }> = [
        // Static pages
        {
          loc: `${baseUrl}/`,
          lastmod: today,
          changefreq: "daily",
          priority: "1.0", // Highest priority for homepage
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
          priority: "0.8",
        },
        {
          loc: `${baseUrl}/promotions`,
          lastmod: today,
          changefreq: "weekly",
          priority: "0.8",
        },
      ];

      // Add products
      (products as SitemapProduct[]).forEach((product) => {
        urls.push({
          loc: `${baseUrl}/product/${product.slug}`,
          lastmod: product.updated_at
            ? new Date(product.updated_at).toISOString().split("T")[0]
            : today,
          changefreq: "weekly",
          priority: "0.8",
        });
      });

      // Add posts
      (posts as SitemapPost[]).forEach((post) => {
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
      (categories as SitemapCategory[]).forEach((category) => {
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
      const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
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
    <priority>${url.priority}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

      setXml(xmlContent);
      setLoading(false);
    } catch (error) {
      setLoading(false);
    }
  };

  // Return XML with proper formatting
  if (loading) {
    return (
      <>
        <Helmet>
          <meta httpEquiv="Content-Type" content="application/xml; charset=utf-8" />
        </Helmet>
        <pre style={{ padding: "20px", fontFamily: "monospace" }}>
          Generating sitemap...
        </pre>
      </>
    );
  }

  return (
    <>
      <Helmet>
        <meta httpEquiv="Content-Type" content="application/xml; charset=utf-8" />
      </Helmet>
      <pre style={{ 
        padding: "20px", 
        fontFamily: "monospace", 
        whiteSpace: "pre-wrap",
        margin: 0,
        fontSize: "12px",
        lineHeight: "1.5"
      }}>
        {xml}
      </pre>
    </>
  );
};

export default SitemapXML;

