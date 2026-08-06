/**
 * Cookie Consent Management
 * Handles user preferences for different types of cookies
 */

export const COOKIE_CONSENT_KEY = "vinon_cookie_consent";

export interface CookiePreferences {
  essential: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  timestamp: string;
  version: string; // For future policy updates
}

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  timestamp: new Date().toISOString(),
  version: "1.0",
};

/**
 * Check if user has already provided consent
 */
export const hasConsented = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(COOKIE_CONSENT_KEY) !== null;
};

/**
 * Get user's cookie preferences
 */
export const getCookiePreferences = (): CookiePreferences => {
  if (typeof window === "undefined") return DEFAULT_PREFERENCES;

  try {
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Merge with defaults to handle missing fields
      return { ...DEFAULT_PREFERENCES, ...parsed };
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Failed to parse cookie preferences:", error);
    }
  }

  return DEFAULT_PREFERENCES;
};

/**
 * Save user's cookie preferences
 */
export const saveCookiePreferences = (preferences: Partial<CookiePreferences>): void => {
  if (typeof window === "undefined") return;

  try {
    const current = getCookiePreferences();
    const updated: CookiePreferences = {
      ...current,
      ...preferences,
      essential: true, // Always true
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(updated));
    
    // Dispatch custom event for other components to listen
    window.dispatchEvent(new CustomEvent("cookiePreferencesUpdated", { detail: updated }));
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Failed to save cookie preferences:", error);
    }
  }
};

/**
 * Accept all cookies (analytics + marketing)
 */
export const acceptAllCookies = (): void => {
  saveCookiePreferences({
    analytics: true,
    marketing: true,
  });
};

/**
 * Reject all non-essential cookies
 */
export const rejectAllCookies = (): void => {
  saveCookiePreferences({
    analytics: false,
    marketing: false,
  });
};

/**
 * Check if analytics cookies are allowed
 */
export const isAnalyticsAllowed = (): boolean => {
  return getCookiePreferences().analytics;
};

/**
 * Check if marketing cookies are allowed
 */
export const isMarketingAllowed = (): boolean => {
  return getCookiePreferences().marketing;
};

