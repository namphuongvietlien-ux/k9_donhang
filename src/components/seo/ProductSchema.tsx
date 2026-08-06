import { Helmet } from "react-helmet-async";

interface Review {
  rating: number;
  comment?: string | null;
  reviewer_name: string;
  created_at: string;
}

interface ProductSchemaProps {
  name: string;
  description: string;
  image: string;
  price: number;
  originalPrice?: number;
  slug: string;
  category?: string;
  inStock?: boolean;
  brand?: string;
  sku?: string;
  rating?: number;
  reviewCount?: number;
  reviews?: Review[];
}

const BASE_URL = "https://vinon.vn";
const SITE_NAME = "Tăm Nhựa Vinon";

const ProductSchema = ({
  name,
  description,
  image,
  price,
  originalPrice,
  slug,
  category,
  inStock = true,
  brand = SITE_NAME,
  sku,
  rating,
  reviewCount,
  reviews = [],
}: ProductSchemaProps) => {
  const productSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description: description?.substring(0, 500) || `${name} - Sản phẩm chất lượng từ ${SITE_NAME}`,
    image: image.startsWith("http") ? image : `${BASE_URL}${image}`,
    url: `${BASE_URL}/product/${slug}`,
    brand: {
      "@type": "Brand",
      name: brand,
    },
    ...(sku && { sku }),
    ...(category && {
      category: {
        "@type": "Thing",
        name: category,
      },
    }),
    offers: {
      "@type": "Offer",
      url: `${BASE_URL}/product/${slug}`,
      priceCurrency: "VND",
      price: price,
      ...(originalPrice && { 
        priceValidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      }),
      availability: inStock 
        ? "https://schema.org/InStock" 
        : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: SITE_NAME,
      },
    },
    ...(rating && reviewCount && {
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: rating.toString(),
        reviewCount: reviewCount.toString(),
        bestRating: "5",
        worstRating: "1",
      },
    }),
    // Add individual reviews for Rich Snippets
    ...(reviews.length > 0 && {
      review: reviews.slice(0, 10).map((review) => ({
        "@type": "Review",
        reviewRating: {
          "@type": "Rating",
          ratingValue: review.rating.toString(),
          bestRating: "5",
          worstRating: "1",
        },
        author: {
          "@type": "Person",
          name: review.reviewer_name,
        },
        reviewBody: review.comment || "",
        datePublished: new Date(review.created_at).toISOString().split("T")[0],
      })),
    }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(productSchema)}
      </script>
    </Helmet>
  );
};

export default ProductSchema;
