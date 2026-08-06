import { Helmet } from "react-helmet-async";

interface PolicyPageSchemaProps {
  title: string;
  description: string;
  url: string;
  publishedTime?: string;
  modifiedTime?: string;
  breadcrumbItems?: Array<{ label: string; url?: string }>;
}

const BASE_URL = "https://vinon.vn";

const PolicyPageSchema = ({
  title,
  description,
  url,
  publishedTime,
  modifiedTime,
  breadcrumbItems = [],
}: PolicyPageSchemaProps) => {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  // WebPage Schema
  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description: description,
    url: fullUrl,
    ...(publishedTime && { datePublished: publishedTime }),
    ...(modifiedTime && { dateModified: modifiedTime }),
    publisher: {
      "@type": "Organization",
      name: "Black Pepper",
      url: BASE_URL,
    },
    inLanguage: "vi-VN",
    isAccessibleForFree: true,
  };

  // BreadcrumbList Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Trang chủ",
        item: BASE_URL,
      },
      ...breadcrumbItems.map((item, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: item.label,
        item: item.url ? (item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`) : fullUrl,
      })),
    ],
  };

  // FAQPage Schema (if applicable - can be added later)
  // const faqSchema = {
  //   "@context": "https://schema.org",
  //   "@type": "FAQPage",
  //   mainEntity: [
  //     {
  //       "@type": "Question",
  //       name: "Question text",
  //       acceptedAnswer: {
  //         "@type": "Answer",
  //         text: "Answer text"
  //       }
  //     }
  //   ]
  // };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(webPageSchema)}</script>
      {breadcrumbItems.length > 0 && (
        <script type="application/ld+json">{JSON.stringify(breadcrumbSchema)}</script>
      )}
    </Helmet>
  );
};

export default PolicyPageSchema;

