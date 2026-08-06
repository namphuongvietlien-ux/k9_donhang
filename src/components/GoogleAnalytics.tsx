import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initGA4, trackPageView, isGA4Enabled } from '@/utils/analytics';
import { isAnalyticsAllowed, getCookiePreferences } from '@/utils/cookieConsent';

/**
 * Google Analytics Component
 * 
 * This component:
 * 1. Initializes GA4 only if user consented to analytics cookies
 * 2. Tracks page views on route changes (for SPA)
 * 3. Respects user's cookie preferences
 * 
 * Add this component to your App.tsx
 */
const GoogleAnalytics = () => {
  const location = useLocation();

  // Initialize GA4 only if user consented to analytics
  useEffect(() => {
    // Check consent before initializing
    if (isAnalyticsAllowed()) {
      initGA4().catch((error) => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('Failed to initialize GA4:', error);
        }
      });
    }
  }, []);

  // Listen for cookie preference changes
  useEffect(() => {
    const handlePreferenceChange = () => {
      const preferences = getCookiePreferences();
      if (preferences.analytics && !isGA4Enabled()) {
        // User just enabled analytics, initialize now
        initGA4().catch((error) => {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Failed to initialize GA4:', error);
          }
        });
      }
    };

    window.addEventListener('cookiePreferencesUpdated', handlePreferenceChange);
    return () => {
      window.removeEventListener('cookiePreferencesUpdated', handlePreferenceChange);
    };
  }, []);

  // Track page view on route change (only if analytics is allowed)
  useEffect(() => {
    if (isAnalyticsAllowed() && isGA4Enabled()) {
      // Small delay to ensure page is fully loaded
      const timer = setTimeout(() => {
        trackPageView(location.pathname + location.search, document.title);
      }, 100);

      return () => clearTimeout(timer);
    }
  }, [location]);

  return null; // This component doesn't render anything
};

export default GoogleAnalytics;

