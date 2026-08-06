import { Helmet } from "react-helmet-async";

interface ArticleSchemaProps {
  title: string;
  description: string;
  image: string;
  slug: string;
  publishedTime: string;
  modifiedTime?: string;
  author?: string;
  category?: string;
}

const BASE_URL = "https://vinon.vn";
const SITE_NAME = "Tăm Nhựa Vinon";

const ArticleSchema = ({
  title,
  description,
  image,
  slug,
  publishedTime,
  modifiedTime,
  author = SITE_NAME,
  category,
}: ArticleSchemaProps) => {
  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description: description?.substring(0, 200) || title,
    image: image.startsWith("http") ? image : `${BASE_URL}${image}`,
    url: `${BASE_URL}/news/${slug}`,
    datePublished: publishedTime,
    ...(modifiedTime && { dateModified: modifiedTime }),
    author: {
      "@type": "Person",
      name: author,
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: {
        "@type": "ImageObject",
        url: `${BASE_URL}/logo.png`,
      },
    },
    ...(category && {
      articleSection: category,
    }),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": `${BASE_URL}/news/${slug}`,
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(articleSchema)}
      </script>
    </Helmet>
  );
};

export default ArticleSchema;
