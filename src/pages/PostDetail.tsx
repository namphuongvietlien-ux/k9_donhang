import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import { DynamicSEO, Breadcrumbs, ArticleSchema } from "@/components/seo/index";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronLeft, Calendar, Tag } from "lucide-react";
import RichTextContent from "@/components/RichTextContent";

import heroSpices from "@/assets/hero-spices.jpg";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string | null;
  image_url: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

const PostDetail = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data: post, isLoading, error } = useQuery({
    queryKey: ["post", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (error) throw error;
      return data as Post | null;
    },
    enabled: !!slug,
  });

  const { data: relatedPosts = [] } = useQuery({
    queryKey: ["related-posts", post?.category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, slug, image_url, published_at, created_at")
        .eq("is_published", true)
        .neq("id", post?.id || "")
        .eq("category", post?.category || "")
        .order("published_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data;
    },
    enabled: !!post?.category,
  });

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    return format(new Date(dateString), "dd MMMM, yyyy", { locale: vi });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <SpiceHeader />
        <div className="mt-[104px] md:mt-[112px]">
          <Skeleton className="w-full h-[400px]" />
          <div className="container mx-auto px-4 py-8 space-y-4">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <SpiceFooter />
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="min-h-screen bg-background">
        <SpiceHeader />
        <div className="mt-[104px] md:mt-[112px] container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-4">Không tìm thấy bài viết</h1>
          <p className="text-muted-foreground mb-8">Bài viết bạn đang tìm kiếm không tồn tại hoặc đã bị xóa.</p>
          <Link 
            to="/news" 
            className="inline-flex items-center gap-2 text-primary hover:underline"
          >
            <ChevronLeft className="w-4 h-4" />
            Quay lại trang tin tức
          </Link>
        </div>
        <SpiceFooter />
      </div>
    );
  }

  const postImage = post.image_url || heroSpices;

  return (
    <div className="min-h-screen bg-background">
      {/* Dynamic SEO */}
      <DynamicSEO 
        title={post.title}
        description={post.excerpt || `Đọc bài viết ${post.title} từ Black Pepper - Gia vị Việt Nam cao cấp`}
        keywords={`${post.category || "tin tức"}, gia vị, black pepper, ${post.title}`}
        image={postImage}
        url={`https://blackpepper.vn/news/${post.slug}`}
        type="article"
        publishedTime={post.published_at || post.created_at}
        modifiedTime={post.updated_at}
        section={post.category || "Tin tức"}
      />

      {/* Article Schema */}
      <ArticleSchema
        title={post.title}
        description={post.excerpt || post.title}
        image={postImage}
        slug={post.slug}
        publishedTime={post.published_at || post.created_at}
        modifiedTime={post.updated_at}
        category={post.category || undefined}
      />

      <SpiceHeader />
      
      {/* Hero Image */}
      <div className="relative mt-[104px] md:mt-[112px]">
        <div 
          className="w-full h-[300px] md:h-[400px] bg-cover bg-center"
          style={{ backgroundImage: `url(${postImage})` }}
        >
          <div className="absolute inset-0 bg-foreground/50" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="container mx-auto px-4 text-center text-card">
            {post.category && (
              <span className="inline-block px-3 py-1 bg-primary text-primary-foreground text-sm rounded-full mb-4">
                {post.category}
              </span>
            )}
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-serif font-bold max-w-4xl mx-auto">
              {post.title}
            </h1>
          </div>
        </div>
      </div>

      {/* Breadcrumb with Schema */}
      <div className="bg-muted/30 py-4">
        <div className="container mx-auto px-4">
          <Breadcrumbs
            items={[
              { label: "Tin tức", href: "/news" },
              { label: post.title },
            ]}
          />
        </div>
      </div>

      {/* Content */}
      <article className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto">
            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <time dateTime={post.published_at || post.created_at}>
                  {formatDate(post.published_at || post.created_at)}
                </time>
              </div>
              {post.category && (
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  <span>{post.category}</span>
                </div>
              )}
            </div>

            {/* Excerpt */}
            {post.excerpt && (
              <p className="text-lg text-muted-foreground italic mb-8 leading-relaxed">
                {post.excerpt}
              </p>
            )}

            {/* Content */}
            {post.content ? (
              <RichTextContent 
                content={post.content} 
                prose={true}
                className="prose-lg text-foreground"
              />
            ) : (
              <p className="text-muted-foreground">Nội dung đang được cập nhật...</p>
            )}

            {/* Back Link */}
            <div className="mt-12 pt-8 border-t border-border">
              <Link 
                to="/news" 
                className="inline-flex items-center gap-2 text-primary hover:underline"
              >
                <ChevronLeft className="w-4 h-4" />
                Quay lại trang tin tức
              </Link>
            </div>
          </div>
        </div>
      </article>

      {/* Related Posts */}
      {relatedPosts.length > 0 && (
        <section className="py-12 bg-muted/30">
          <div className="container mx-auto px-4">
            <h2 className="text-2xl font-serif font-bold text-foreground mb-8">
              Bài viết liên quan
            </h2>
            <div className="grid md:grid-cols-3 gap-6">
              {relatedPosts.map((relatedPost) => (
                <Link 
                  key={relatedPost.id} 
                  to={`/news/${relatedPost.slug}`}
                  className="group bg-card rounded-lg overflow-hidden border border-border hover:shadow-lg transition-shadow"
                >
                  <div className="relative overflow-hidden aspect-[4/3]">
                    <img 
                      src={relatedPost.image_url || heroSpices} 
                      alt={relatedPost.title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-serif font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                      {relatedPost.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-2">
                      {formatDate(relatedPost.published_at || relatedPost.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <SpiceFooter />
    </div>
  );
};

export default PostDetail;
