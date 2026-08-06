import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import ScrollReveal from "@/components/ScrollReveal";
import { DynamicSEO, Breadcrumbs } from "@/components/seo/index";
import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { Skeleton } from "@/components/ui/skeleton";

import heroSpices from "@/assets/hero-spices.jpg";

interface Post {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  image_url: string | null;
  category: string | null;
  published_at: string | null;
  created_at: string;
}

const ITEMS_PER_PAGE = 6;

const CATEGORIES = ["Tin tức", "Công thức", "Mẹo vặt", "Sự kiện"];

const News = () => {
  const [currentPage, setCurrentPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState({
    recentPosts: true,
    categories: true
  });

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      // Select only needed fields for list view
      const { data, error } = await supabase
        .from("posts")
        .select("id, title, slug, excerpt, image_url, category, published_at, created_at")
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as Post[];
    },
    // News list cache longer (changes less frequently)
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  const filteredPosts = filterCategory 
    ? posts.filter(post => post.category === filterCategory)
    : posts;

  const totalPages = Math.ceil(filteredPosts.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentPosts = filteredPosts.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  const toggleSection = (section: 'recentPosts' | 'categories') => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleCategoryClick = (category: string | null) => {
    setFilterCategory(category);
    setCurrentPage(1);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "";
    return format(new Date(dateString), "dd MMMM, yyyy", { locale: vi });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Dynamic SEO */}
      <DynamicSEO 
        title="Tin tức - Tăm Nhựa Vinon"
        description="Cập nhật tin tức mới nhất về sản phẩm tăm nhựa, chương trình khuyến mãi và thông tin hữu ích từ Tăm Nhựa Vinon."
        keywords="tin tức tăm nhựa, tăm vinon, khuyến mãi, sản phẩm mới, tăm nhựa cao cấp"
        url="/news"
      />
      <SpiceHeader />
      
      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={[{ label: "Tin tức" }]} />
        </div>
      </div>

      {/* Main Content */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <ScrollReveal variant="fade-up">
            <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-8">
              Tin tức {filterCategory && `- ${filterCategory}`}
            </h1>
          </ScrollReveal>

          <div className="grid lg:grid-cols-4 gap-8">
            {/* News Grid */}
            <div className="lg:col-span-3">
              {isLoading ? (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-card rounded-lg overflow-hidden border border-border">
                      <Skeleton className="aspect-[4/3] w-full" />
                      <div className="p-4 space-y-2">
                        <Skeleton className="h-5 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : currentPosts.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted-foreground">Chưa có bài viết nào.</p>
                </div>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
                  {currentPosts.map((post, index) => (
                    <ScrollReveal key={post.id} variant="fade-up" delay={index * 100}>
                      <article className="group bg-card rounded-lg overflow-hidden border border-border hover:shadow-lg transition-shadow">
                        <Link to={`/news/${post.slug}`} className="block">
                          <div className="relative overflow-hidden aspect-[4/3]">
                            <img 
                              src={post.image_url || heroSpices} 
                              alt={post.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                              loading="lazy"
                            />
                          </div>
                        </Link>
                        <div className="p-4">
                          <Link to={`/news/${post.slug}`}>
                            <h2 className="font-serif font-semibold text-foreground mb-2 line-clamp-2 group-hover:text-primary transition-colors">
                              {post.title}
                            </h2>
                          </Link>
                          {post.excerpt && (
                            <p className="text-sm text-muted-foreground line-clamp-3 mb-3">
                              {post.excerpt}
                            </p>
                          )}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {post.category && (
                              <>
                                <span>{post.category}</span>
                                <span className="w-1 h-1 rounded-full bg-muted-foreground"></span>
                              </>
                            )}
                            <time dateTime={post.published_at || post.created_at}>
                              {formatDate(post.published_at || post.created_at)}
                            </time>
                          </div>
                        </div>
                      </article>
                    </ScrollReveal>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <nav className="flex items-center justify-center gap-2 mt-10" aria-label="Phân trang">
                  <button 
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Trang trước"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`w-10 h-10 rounded border transition-colors ${
                        currentPage === page 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'border-border hover:bg-muted'
                      }`}
                      aria-label={`Trang ${page}`}
                      aria-current={currentPage === page ? "page" : undefined}
                    >
                      {page}
                    </button>
                  ))}
                  
                  <button 
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    aria-label="Trang sau"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </nav>
              )}
            </div>

            {/* Sidebar */}
            <aside className="lg:col-span-1 space-y-6">
              {/* Recent Posts */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <button 
                  onClick={() => toggleSection('recentPosts')}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  aria-expanded={expandedSections.recentPosts}
                >
                  <span className="font-semibold text-foreground">Bài viết mới nhất</span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${expandedSections.recentPosts ? 'rotate-180' : ''}`} />
                </button>
                
                {expandedSections.recentPosts && (
                  <div className="px-4 pb-4 space-y-4">
                    {posts.slice(0, 4).map((post, index) => (
                      <Link 
                        key={post.id} 
                        to={`/news/${post.slug}`}
                        className="flex gap-3 group"
                      >
                        <div className="relative flex-shrink-0">
                          <span className="absolute -top-1 -left-1 w-5 h-5 bg-primary text-primary-foreground text-xs rounded-full flex items-center justify-center z-10">
                            {index + 1}
                          </span>
                          <img 
                            src={post.image_url || heroSpices} 
                            alt={post.title}
                            className="w-16 h-12 object-cover rounded"
                            loading="lazy"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                            {post.title}
                          </h3>
                          <span className="text-xs text-muted-foreground">
                            {post.category && `${post.category} - `}
                            {formatDate(post.published_at || post.created_at).split(',')[0]}
                          </span>
                        </div>
                      </Link>
                    ))}
                    {posts.length === 0 && !isLoading && (
                      <p className="text-sm text-muted-foreground">Chưa có bài viết.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Categories */}
              <div className="bg-card border border-border rounded-lg overflow-hidden">
                <button 
                  onClick={() => toggleSection('categories')}
                  className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
                  aria-expanded={expandedSections.categories}
                >
                  <span className="font-semibold text-foreground">Danh mục bài viết</span>
                  <ChevronDown className={`w-5 h-5 transition-transform ${expandedSections.categories ? 'rotate-180' : ''}`} />
                </button>
                
                {expandedSections.categories && (
                  <div className="pb-2">
                    <button 
                      onClick={() => handleCategoryClick(null)}
                      className={`w-full flex items-center justify-between px-4 py-3 border-b border-border hover:bg-muted/50 transition-colors text-left ${
                        filterCategory === null ? 'text-primary font-medium' : 'text-foreground'
                      }`}
                    >
                      <span>Tất cả</span>
                      <span className="text-muted-foreground text-sm">{posts.length}</span>
                    </button>
                    {CATEGORIES.map((category) => {
                      const count = posts.filter(p => p.category === category).length;
                      return (
                        <button 
                          key={category} 
                          onClick={() => handleCategoryClick(category)}
                          className={`w-full flex items-center justify-between px-4 py-3 border-b border-border last:border-0 hover:bg-muted/50 transition-colors text-left ${
                            filterCategory === category ? 'text-primary font-medium' : 'text-foreground'
                          }`}
                        >
                          <span>{category}</span>
                          <span className="text-muted-foreground text-sm">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </section>

      <SpiceFooter />
    </div>
  );
};

export default News;
