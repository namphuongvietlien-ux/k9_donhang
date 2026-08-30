import { Helmet } from "react-helmet-async";

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  image?: string;
  url?: string;
  type?: string;
}

const SEO = ({
  title = "Tăm Nhựa Việt - Tăm Nhựa Cao Cấp An Toàn Cho Gia Đình",
  description = "Tăm nhựa cao cấp, an toàn FDA, thân thiện môi trường. Sản xuất theo tiêu chuẩn quốc tế. Giao hàng toàn quốc. Giá cả cạnh tranh.",
  keywords = "tăm nhựa, tăm nhựa cao cấp, tăm nhựa an toàn, tăm nhựa việt nam, dental picks",
  image = "https://tamnhuaviet.vn/og-image.jpg",
  url = "https://tamnhuaviet.vn",
  type = "website",
}: SEOProps) => {
  return (
    <Helmet>
      {/* Primary Meta Tags */}
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={image} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />

      {/* Canonical */}
      <link rel="canonical" href={url} />

      {/* Favicon / tab icon */}
      <link rel="icon" type="image/png" href="/1564804129_k9-logo-ps.png" />
      <link rel="shortcut icon" type="image/png" href="/1564804129_k9-logo-ps.png" />
      <link rel="apple-touch-icon" href="/1564804129_k9-logo-ps.png" />
    </Helmet>
  );
};

export default SEO;
