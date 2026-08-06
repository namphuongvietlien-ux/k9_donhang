import { useEffect, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import SpiceHeader from "@/components/SpiceHeader";
import SpiceHero from "@/components/SpiceHero";
import { DynamicSEO, OrganizationSchema, WebsiteSchema } from "@/components/seo/index";
import { useSiteSettings } from "@/hooks/useSiteSettings";

// Import components that use CartContext directly (not lazy) to ensure context is available
import FlashSaleSection from "@/components/FlashSaleSection";
import SpiceProducts from "@/components/SpiceProducts";

// Lazy load below-the-fold sections that don't need CartContext
const SpiceJourney = lazy(() => import("@/components/SpiceJourney"));
const SpiceCoreValues = lazy(() => import("@/components/SpiceCoreValues"));
const SpiceStory = lazy(() => import("@/components/SpiceStory"));
const SpiceFooter = lazy(() => import("@/components/SpiceFooter"));

const Index = () => {
  const { data: settings } = useSiteSettings();
  const navigate = useNavigate();

  // Handle OAuth callback if hash fragment is present
  useEffect(() => {
    if (window.location.hash.includes("access_token")) {
      // Redirect to callback path to handle OAuth
      navigate("/admin/login/callback" + window.location.hash, { replace: true });
    }
  }, [navigate]);

  // Preconnect to Supabase on mount for faster API calls
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (supabaseUrl) {
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = supabaseUrl;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    }
  }, []);

  return (
    <div className="min-h-screen">
      {/* Dynamic SEO - Homepage Priority */}
      <DynamicSEO 
        title={settings?.site_name || "Tăm Nhựa Vinon - Sạch Từng Kẽ Răng, An Toàn Tuyệt Đối"}
        description={settings?.site_description || "Tăm Nhựa Cao Cấp Vinon - Sản phẩm đạt chuẩn kiểm định Quốc tế Eurofins. Bảo vệ nướu và sức khỏe gia đình bạn bằng chất liệu nhựa nguyên sinh tinh khiết. An toàn tuyệt đối, không chứa kim loại nặng."}
        keywords="tăm nhựa vinon, tăm nhựa cao cấp, tăm nhựa an toàn, tăm nhựa nha khoa, tăm nhựa eurofins, tăm nhựa nguyên sinh, tăm nhựa không độc hại, mua tăm nhựa online"
        url="/"
        type="website"
        image={settings?.logo_url || undefined}
      />

      {/* Organization & Website Schema */}
      <OrganizationSchema 
        siteName={settings?.site_name}
        phone={settings?.phone}
        email={settings?.email}
        address={settings?.address}
        facebookUrl={settings?.facebook_url}
        instagramUrl={settings?.instagram_url}
        youtubeUrl={settings?.youtube_url}
      />
      <WebsiteSchema />

      <SpiceHeader />
      <main>
        <SpiceHero />
        {/* Components that use CartContext - load eagerly */}
        <FlashSaleSection />
        <SpiceProducts />
        {/* Lazy load below-the-fold sections that don't need context */}
        <Suspense fallback={null}>
          <SpiceJourney />
          <SpiceCoreValues />
          <SpiceStory />
        </Suspense>
      </main>
      <Suspense fallback={null}>
        <SpiceFooter />
      </Suspense>
    </div>
  );
};

export default Index;
