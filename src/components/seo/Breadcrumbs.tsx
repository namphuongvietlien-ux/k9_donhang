import { Link } from "react-router-dom";
import { ChevronRight, Home } from "lucide-react";
import { Helmet } from "react-helmet-async";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
  className?: string;
}

const BASE_URL = "https://vinon.vn";

const Breadcrumbs = ({ items, className = "" }: BreadcrumbsProps) => {
  // Generate structured data for breadcrumbs
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
      ...items.map((item, index) => ({
        "@type": "ListItem",
        position: index + 2,
        name: item.label,
        ...(item.href && { item: `${BASE_URL}${item.href}` }),
      })),
    ],
  };

  return (
    <>
      <Helmet>
        <script type="application/ld+json">
          {JSON.stringify(breadcrumbSchema)}
        </script>
      </Helmet>

      <nav 
        aria-label="Breadcrumb" 
        className={`flex items-center gap-2 text-sm flex-wrap ${className}`}
      >
        <Link 
          to="/" 
          className="text-primary hover:underline flex items-center gap-1"
          aria-label="Trang chủ"
        >
          <Home className="w-4 h-4" />
          <span className="sr-only md:not-sr-only">Trang chủ</span>
        </Link>

        {items.map((item, index) => (
          <span key={index} className="flex items-center gap-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            {item.href ? (
              <Link 
                to={item.href} 
                className="text-primary hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              <span className="text-foreground font-medium line-clamp-1">
                {item.label}
              </span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
};

export default Breadcrumbs;
