/**
 * Normalizes a URL by ensuring it has a proper protocol
 * Handles common social media URLs like zalo.me, m.me, facebook.com
 * @param url - The URL to normalize
 * @returns Normalized URL with protocol, or null if invalid
 */
export const normalizeUrl = (url: string | null | undefined): string | null => {
  if (!url || url === "#") return null;
  
  let normalized = url.trim();
  
  // If already has protocol, return as is (after validation)
  if (normalized.match(/^https?:\/\//i) || normalized.match(/^mailto:/i) || normalized.match(/^tel:/i)) {
    try {
      new URL(normalized);
      return normalized;
    } catch {
      return null;
    }
  }
  
  // Add protocol based on URL pattern
  // Zalo links
  if (normalized.match(/^zalo\.me\//i) || normalized.match(/^www\.zalo\.me\//i)) {
    normalized = `https://${normalized.replace(/^www\./i, "")}`;
  }
  // Facebook/Messenger links
  else if (normalized.match(/^(m\.me|facebook\.com|www\.facebook\.com|fb\.com)/i)) {
    normalized = `https://${normalized.replace(/^www\./i, "")}`;
  }
  // Instagram links
  else if (normalized.match(/^(instagram\.com|www\.instagram\.com)/i)) {
    normalized = `https://${normalized.replace(/^www\./i, "")}`;
  }
  // YouTube links
  else if (normalized.match(/^(youtube\.com|youtu\.be|www\.youtube\.com)/i)) {
    normalized = `https://${normalized.replace(/^www\./i, "")}`;
  }
  // For other links starting with alphanumeric, add https://
  else if (normalized.match(/^[a-zA-Z0-9]/)) {
    normalized = `https://${normalized}`;
  }
  
  // Validate URL before returning
  try {
    new URL(normalized);
    return normalized;
  } catch {
    return null;
  }
};

