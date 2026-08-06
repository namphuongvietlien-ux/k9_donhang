import { Helmet } from "react-helmet-async";

interface NavigationItem {
  name: string;
  url: string;
  children?: NavigationItem[];
}

interface SiteNavigationSchemaProps {
  items: NavigationItem[];
  siteName?: string;
  siteUrl?: string;
}

const SiteNavigationSchema = ({ 
  items, 
  siteName = "Tăm Nhựa Vinon",
  siteUrl = "https://vinon.vn"
}: SiteNavigationSchemaProps) => {
  const normalizeUrl = (url: string) => {
    return url.startsWith("http") ? url : `${siteUrl}${url}`;
  };

  const buildNavigationItem = (item: NavigationItem) => {
    const baseItem: any = {
      "@type": "WebPage",
      "name": item.name,
      "url": normalizeUrl(item.url)
    };

    if (item.children && item.children.length > 0) {
      baseItem.hasPart = item.children.map(buildNavigationItem);
    }

    return baseItem;
  };

  const schema = {
    "@context": "https://schema.org",
    "@type": "SiteNavigationElement",
    "name": "Menu điều hướng chính",
    "url": siteUrl,
    "hasPart": items.map(buildNavigationItem)
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(schema)}
      </script>
    </Helmet>
  );
};

export default SiteNavigationSchema;

