import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface MenuItem {
  id: string;
  label: string;
  href: string;
  is_external: boolean;
  icon: string | null;
  parent_id: string | null;
  display_order: number;
  is_active: boolean;
  target_blank: boolean;
  children?: MenuItem[];
}

export const useMenuItems = () => {
  return useQuery({
    queryKey: ["menu-items"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("menu_items")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) throw error;

      const items = (data || []) as MenuItem[];

      // Build hierarchical structure (parent-child relationships)
      const rootItems: MenuItem[] = [];
      const itemsMap = new Map<string, MenuItem>();

      // First pass: create map and identify root items
      items.forEach((item) => {
        itemsMap.set(item.id, { ...item, children: [] });
        if (!item.parent_id) {
          rootItems.push(itemsMap.get(item.id)!);
        }
      });

      // Second pass: attach children to parents
      items.forEach((item) => {
        if (item.parent_id) {
          const parent = itemsMap.get(item.parent_id);
          const child = itemsMap.get(item.id);
          if (parent && child) {
            parent.children = parent.children || [];
            parent.children.push(child);
          }
        }
      });

      // Sort children by display_order
      const sortItems = (items: MenuItem[]) => {
        items.sort((a, b) => a.display_order - b.display_order);
        items.forEach((item) => {
          if (item.children && item.children.length > 0) {
            sortItems(item.children);
          }
        });
      };

      sortItems(rootItems);

      return rootItems;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    // Use placeholder data to avoid blocking render
    placeholderData: [],
    // Don't block initial render - fetch in background
    refetchOnMount: false,
  });
};

