import { Helmet } from "react-helmet-async";

interface ImageSchemaProps {
  imageUrl: string;
  caption?: string;
  description?: string;
  name?: string;
}

const BASE_URL = "https://vinon.vn";

const ImageSchema = ({
  imageUrl,
  caption,
  description,
  name,
}: ImageSchemaProps) => {
  const fullImageUrl = imageUrl.startsWith("http") ? imageUrl : `${BASE_URL}${imageUrl}`;

  const imageSchema = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    contentUrl: fullImageUrl,
    url: fullImageUrl,
    ...(name && { name }),
    ...(caption && { caption }),
    ...(description && { description }),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(imageSchema)}</script>
    </Helmet>
  );
};

export default ImageSchema;

