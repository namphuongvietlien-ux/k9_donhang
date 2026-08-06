import { Helmet } from "react-helmet-async";

interface OrganizationSchemaProps {
  siteName?: string;
  phone?: string;
  email?: string;
  address?: string;
  facebookUrl?: string;
  instagramUrl?: string;
  youtubeUrl?: string;
}

const BASE_URL = "https://vinon.vn";

const OrganizationSchema = ({
  siteName = "Tăm Nhựa Vinon",
  phone = "0372777911",
  email = "info@vinon.vn",
  address = "160/91/51/2/24 Khu Phố 4, Nguyễn Văn Quỳ, Phường Phú Thuận, Quận 7, TP. Hồ Chí Minh",
  facebookUrl,
  instagramUrl,
  youtubeUrl,
}: OrganizationSchemaProps) => {
  const sameAs = [facebookUrl, instagramUrl, youtubeUrl].filter(Boolean);

  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: "CÔNG TY TNHH VINON - Sản xuất và phân phối tăm nhựa cao cấp đạt chuẩn kiểm định Quốc tế Eurofins. Sản phẩm an toàn tuyệt đối, không chứa kim loại nặng, bảo vệ sức khỏe răng miệng.",
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: "TP. Hồ Chí Minh",
      addressRegion: "Quận 7",
      addressCountry: "VN",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: phone,
      email: email,
      contactType: "customer service",
      availableLanguage: ["Vietnamese", "English"],
    },
    ...(sameAs.length > 0 && { sameAs }),
  };

  const localBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: siteName,
    image: `${BASE_URL}/og-image.jpg`,
    "@id": BASE_URL,
    url: BASE_URL,
    telephone: phone,
    email: email,
    address: {
      "@type": "PostalAddress",
      streetAddress: address,
      addressLocality: "TP. Hồ Chí Minh",
      addressRegion: "Quận 7",
      postalCode: "70000",
      addressCountry: "VN",
    },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        opens: "08:00",
        closes: "17:30",
      },
    ],
    priceRange: "$$",
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(organizationSchema)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(localBusinessSchema)}
      </script>
    </Helmet>
  );
};

export default OrganizationSchema;
