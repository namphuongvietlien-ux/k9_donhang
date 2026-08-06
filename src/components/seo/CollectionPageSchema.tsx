import { Helmet } from "react-helmet-async";

interface CollectionPageSchemaProps {
  name: string;
  description: string;
  url: string;
  itemCount?: number;
  products?: Array<{
    name: string;
    url: string;
    image?: string;
    price?: number;
  }>;
}

const BASE_URL = "https://vinon.vn";

const CollectionPageSchema = ({
  name,
  description,
  url,
  itemCount = 0,
  products = [],
}: CollectionPageSchemaProps) => {
  const fullUrl = url.startsWith("http") ? url : `${BASE_URL}${url}`;

  // CollectionPage Schema
  const collectionPageSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: name,
    description: description,
    url: fullUrl,
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: itemCount,
      ...(products.length > 0 && {
        itemListElement: products.slice(0, 20).map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: {
            "@type": "Product",
            name: product.name,
            url: product.url.startsWith("http") ? product.url : `${BASE_URL}${product.url}`,
            ...(product.image && {
              image: product.image.startsWith("http") ? product.image : `${BASE_URL}${product.image}`,
            }),
            ...(product.price && {
              offers: {
                "@type": "Offer",
                price: product.price,
                priceCurrency: "VND",
              },
            }),
          },
        })),
      }),
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(collectionPageSchema)}</script>
    </Helmet>
  );
};

export default CollectionPageSchema;

