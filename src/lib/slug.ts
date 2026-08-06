import { supabase } from "@/integrations/supabase/client";

/**
 * Generate URL-friendly slug from Vietnamese text
 * Converts Vietnamese text to URL-friendly slug
 * 
 * @param text - The text to convert to slug
 * @returns URL-friendly slug
 * 
 * @example
 * generateSlug("Tăm Nhựa Vinon") // "tam-nhua-vinon"
 * generateSlug("Sản phẩm Đặc Biệt 2024!") // "san-pham-dac-biet-2024"
 */
export const generateSlug = (text: string): string => {
  if (!text) return "";
  
  return text
    .toLowerCase()
    .normalize("NFD") // Decompose accented characters
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .replace(/[^a-z0-9\s-]/g, "") // Remove special characters except spaces and hyphens
    .trim()
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
    .replace(/(^-|-$)/g, ""); // Remove leading/trailing hyphens
};

/**
 * Check if slug is unique and generate unique slug if needed
 * 
 * @param baseSlug - The base slug to check
 * @param tableName - The table name to check (e.g., "products", "posts", "categories")
 * @param excludeId - Optional ID to exclude from uniqueness check (for updates)
 * @returns Unique slug
 */
export const generateUniqueSlug = async (
  baseSlug: string,
  tableName: "products" | "posts" | "categories",
  excludeId?: string
): Promise<string> => {
  if (!baseSlug || baseSlug.trim() === "") {
    // If slug is empty, generate a default one based on table
    const defaults: Record<typeof tableName, string> = {
      products: "san-pham",
      posts: "bai-viet",
      categories: "danh-muc",
    };
    baseSlug = defaults[tableName];
  }
  
  let slug = baseSlug.trim();
  let counter = 1;
  const maxAttempts = 100; // Prevent infinite loop
  
  while (counter <= maxAttempts) {
    let query = supabase
      .from(tableName)
      .select("id")
      .eq("slug", slug)
      .limit(1);
    
    if (excludeId) {
      query = query.neq("id", excludeId);
    }
    
    const { data, error } = await query;
    
    if (error) {
      // If error, return the slug anyway and let database handle uniqueness constraint
      return slug;
    }
    
    if (!data || data.length === 0) {
      return slug; // Slug is unique
    }
    
    // Slug exists, append counter
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  // Fallback: append timestamp if max attempts reached
  return `${baseSlug}-${Date.now()}`;
};

