import { Helmet } from "react-helmet-async";

const StructuredData = () => {
  // Organization Schema
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tăm Nhựa Việt",
    url: "https://tamnhuaviet.vn",
    logo: "https://tamnhuaviet.vn/logo.png",
    description:
      "Công ty sản xuất và phân phối tăm nhựa cao cấp hàng đầu Việt Nam",
    address: {
      "@type": "PostalAddress",
      streetAddress: "123 Đường ABC, Quận 1",
      addressLocality: "TP. Hồ Chí Minh",
      addressCountry: "VN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+84-123-456-789",
      contactType: "customer service",
      availableLanguage: ["Vietnamese"],
    },
    sameAs: [
      "https://facebook.com/tamnhuaviet",
      "https://instagram.com/tamnhuaviet",
    ],
  };

  // Local Business Schema
  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: "Tăm Nhựa Việt",
    image: "https://tamnhuaviet.vn/og-image.jpg",
    "@id": "https://tamnhuaviet.vn",
    url: "https://tamnhuaviet.vn",
    telephone: "+84-123-456-789",
    address: {
      "@type": "PostalAddress",
      streetAddress: "123 Đường ABC, Quận 1",
      addressLocality: "TP. Hồ Chí Minh",
      addressRegion: "HCM",
      postalCode: "70000",
      addressCountry: "VN",
    },
    openingHoursSpecification: {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
      opens: "08:00",
      closes: "17:30",
    },
    priceRange: "$$",
  };

  // Product Schema for featured products
  const productsSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        item: {
          "@type": "Product",
          name: "Tăm Nhựa Classic",
          description: "Gói 200 chiếc, màu pastel nhẹ nhàng, an toàn FDA",
          image: "https://tamnhuaviet.vn/products/classic.jpg",
          brand: {
            "@type": "Brand",
            name: "Tăm Nhựa Việt",
          },
          offers: {
            "@type": "Offer",
            price: "25000",
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
            seller: {
              "@type": "Organization",
              name: "Tăm Nhựa Việt",
            },
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.8",
            reviewCount: "256",
          },
        },
      },
      {
        "@type": "ListItem",
        position: 2,
        item: {
          "@type": "Product",
          name: "Tăm Nhựa Eco Green",
          description: "Gói 150 chiếc, thân thiện môi trường, tái chế 100%",
          image: "https://tamnhuaviet.vn/products/eco-green.jpg",
          brand: {
            "@type": "Brand",
            name: "Tăm Nhựa Việt",
          },
          offers: {
            "@type": "Offer",
            price: "30000",
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
            seller: {
              "@type": "Organization",
              name: "Tăm Nhựa Việt",
            },
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.9",
            reviewCount: "189",
          },
        },
      },
      {
        "@type": "ListItem",
        position: 3,
        item: {
          "@type": "Product",
          name: "Tăm Nhựa Rainbow",
          description: "Hộp 300 chiếc, đa màu sắc, phù hợp cả gia đình",
          image: "https://tamnhuaviet.vn/products/rainbow.jpg",
          brand: {
            "@type": "Brand",
            name: "Tăm Nhựa Việt",
          },
          offers: {
            "@type": "Offer",
            price: "45000",
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
            seller: {
              "@type": "Organization",
              name: "Tăm Nhựa Việt",
            },
          },
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: "4.7",
            reviewCount: "324",
          },
        },
      },
    ],
  };

  // FAQ Schema
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Tăm nhựa có an toàn cho sức khỏe không?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Tăm nhựa của chúng tôi được sản xuất từ nhựa PP cao cấp, không chứa BPA, đạt tiêu chuẩn an toàn FDA và ISO 9001. Hoàn toàn an toàn cho sức khỏe răng miệng.",
        },
      },
      {
        "@type": "Question",
        name: "Tăm nhựa có thể tái chế được không?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Có, sản phẩm tăm nhựa của chúng tôi có thể tái chế 100%. Chúng tôi cam kết bảo vệ môi trường và khuyến khích khách hàng tái chế sau khi sử dụng.",
        },
      },
      {
        "@type": "Question",
        name: "Thời gian giao hàng là bao lâu?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Chúng tôi giao hàng toàn quốc. Đối với TP.HCM và Hà Nội: 1-2 ngày. Các tỉnh thành khác: 3-5 ngày làm việc.",
        },
      },
    ],
  };

  // Breadcrumb Schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Trang chủ",
        item: "https://tamnhuaviet.vn",
      },
    ],
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(productsSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(faqSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </script>
    </Helmet>
  );
};

export default StructuredData;
