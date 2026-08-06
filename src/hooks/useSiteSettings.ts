import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SiteSetting {
  id: string;
  setting_key: string;
  setting_value: string | null;
  setting_type: string | null;
}

export interface SocialLink {
  id: string;
  name: string;
  url: string;
  icon: 'phone' | 'zalo' | 'email' | 'facebook' | 'instagram' | 'youtube' | 'custom';
  icon_color?: string;
  bg_color?: string;
  is_active: boolean;
  order: number;
}

export interface SiteSettings {
  site_name: string;
  logo_url: string;
  phone: string;
  email: string;
  address: string;
  facebook_url: string;
  instagram_url: string;
  youtube_url: string;
  zalo_url: string;
  footer_text: string;
  social_links: SocialLink[];
  free_shipping_threshold: string;
  default_shipping_fee: string;
  shipping_province_code: string; // Mã tỉnh/thành phố gửi hàng (ví dụ: "HCM", "HANOI")
}

const defaultSettings: SiteSettings = {
  site_name: "Tăm Nhựa Vinon",
  logo_url: "",
  phone: "0372777911",
  email: "info@vinon.vn",
  address: "160/91/51/2/24 Khu Phố 4, Nguyễn Văn Quỳ, Phường Phú Thuận, Quận 7, TP. Hồ Chí Minh",
  facebook_url: "",
  instagram_url: "",
  youtube_url: "",
  zalo_url: "",
  footer_text: "",
  social_links: [],
  free_shipping_threshold: "300000",
  default_shipping_fee: "30000",
  shipping_province_code: "HCM", // Mặc định TP.HCM
};

export function useSiteSettings() {
  return useQuery({
    queryKey: ["site-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_settings")
        .select("*");
      
      if (error) throw error;
      
      const settings = { ...defaultSettings };
      
      (data as SiteSetting[])?.forEach((item) => {
        if (item.setting_key === 'social_links') {
          // Parse JSON for social_links
          try {
            const parsed = item.setting_value ? JSON.parse(item.setting_value) : [];
            settings.social_links = Array.isArray(parsed) ? parsed : [];
          } catch {
            settings.social_links = [];
          }
        } else if (item.setting_key in settings && item.setting_key !== 'social_links') {
          const key = item.setting_key as keyof Omit<SiteSettings, 'social_links'>;
          settings[key] = (item.setting_value || defaultSettings[key]) as any;
        }
      });
      
      return settings;
    },
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    // Use placeholder data to avoid blocking render
    placeholderData: defaultSettings,
    // Don't block initial render - fetch in background
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });
}
