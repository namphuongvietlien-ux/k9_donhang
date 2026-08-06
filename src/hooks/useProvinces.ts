import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Province {
  id: string;
  name: string;
  code: string;
  zone_id: string | null;
  is_special: boolean;
}

export function useProvinces() {
  return useQuery({
    queryKey: ["provinces"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("provinces")
        .select("*")
        .eq("is_active", true)
        .order("name", { ascending: true });

      if (error) throw error;
      return (data || []) as Province[];
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  });
}

