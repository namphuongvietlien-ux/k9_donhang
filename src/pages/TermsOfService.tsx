import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceFooter from "@/components/SpiceFooter";
import { DynamicSEO, Breadcrumbs, PolicyPageSchema } from "@/components/seo/index";
import { FileText } from "lucide-react";
import RichTextContent from "@/components/RichTextContent";
import { Skeleton } from "@/components/ui/skeleton";

interface PolicySection {
  title: string;
  content: string;
}

interface PolicyContent {
  sections: PolicySection[];
}

// Helper function to extract text from HTML (works on both client and server)
const extractTextFromHTML = (html: string): string => {
  if (!html) return "";
  // Simple regex extraction that works everywhere
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  return text;
};

// Helper function to generate description from content
const generateDescription = (
  subtitle: string | null | undefined,
  sections: PolicySection[]
): string => {
  if (subtitle) return subtitle;
  if (sections.length > 0) {
    const firstSectionText = extractTextFromHTML(sections[0].content);
    if (firstSectionText) {
      return firstSectionText.substring(0, 160).trim() + (firstSectionText.length > 160 ? "..." : "");
    }
  }
  return "Điều khoản và điều kiện sử dụng dịch vụ. Quy định về việc sử dụng website và mua hàng.";
};

const TermsOfService = () => {
  const { data: pageContent, isLoading } = useQuery({
    queryKey: ["page-content", "terms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("page_contents")
        .select("*")
        .eq("page_key", "terms")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const content = (pageContent?.content as unknown as PolicyContent) || { sections: [] };
  const lastUpdated = pageContent?.updated_at
    ? new Date(pageContent.updated_at).toLocaleDateString("vi-VN")
    : new Date().toLocaleDateString("vi-VN");
  
  const pageTitle = pageContent?.title || "Điều khoản sử dụng";
  const description = generateDescription(pageContent?.subtitle, content.sections);
  const keywords = "điều khoản sử dụng, terms of service, quy định sử dụng, điều kiện sử dụng";

  return (
    <div className="min-h-screen bg-background">
      <DynamicSEO 
        title={`${pageTitle} | Gia Vị Việt`}
        description={description}
        keywords={keywords}
        url="/terms"
        modifiedTime={pageContent?.updated_at}
        publishedTime={pageContent?.created_at}
      />
      <PolicyPageSchema
        title={`${pageTitle} | Gia Vị Việt`}
        description={description}
        url="/terms"
        publishedTime={pageContent?.created_at}
        modifiedTime={pageContent?.updated_at}
        breadcrumbItems={[{ label: pageTitle }]}
      />
      <SpiceHeader />
      
      {/* Breadcrumb */}
      <div className="bg-muted/30 py-4 mt-[104px] md:mt-[112px]">
        <div className="container mx-auto px-4">
          <Breadcrumbs items={[{ label: "Điều khoản sử dụng" }]} />
        </div>
      </div>

      {/* Content */}
      <article className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
                <FileText className="w-8 h-8 text-primary" />
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4">
                {pageContent?.title || "Điều khoản sử dụng"}
              </h1>
              {pageContent?.subtitle && (
                <p className="text-xl text-primary mb-4">{pageContent.subtitle}</p>
              )}
              <p className="text-muted-foreground">
                Cập nhật lần cuối: {lastUpdated}
              </p>
            </div>

            {/* Content */}
            {isLoading ? (
              <div className="space-y-6">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-24 w-full" />
                  </div>
                ))}
              </div>
            ) : content.sections.length > 0 ? (
              <div className="prose prose-lg max-w-none space-y-8 text-foreground">
                {content.sections.map((section, index) => (
                  <section key={index}>
                    <h2 className="text-2xl font-bold mb-4">{section.title}</h2>
                    <RichTextContent 
                      htmlContent={section.content} 
                      className="text-muted-foreground leading-relaxed"
                    />
                  </section>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>Nội dung đang được cập nhật...</p>
              </div>
            )}
          </div>
        </div>
      </article>

      <SpiceFooter />
    </div>
  );
};

export default TermsOfService;
