/**
 * Google Analytics 4 (GA4) Integration
 * 
 * Usage:
 * - Import: import { trackEvent, trackPageView } from '@/utils/analytics'
 * - Track page view: trackPageView('/products')
 * - Track event: trackEvent('add_to_cart', { product_id: '123', product_name: 'Product Name' })
 */

import { isAnalyticsAllowed } from './cookieConsent';
import { supabase } from '@/integrations/supabase/client';

// GA4 Measurement ID - Can be set via environment variable or database
let GA4_MEASUREMENT_ID = import.meta.env.VITE_GA4_MEASUREMENT_ID || '';
let ga4IdLoaded = false;
let ga4IdPromise: Promise<string> | null = null;

// Fetch GA4 ID from database
const fetchGA4IdFromDatabase = async (): Promise<string> => {
  try {
    // Use same pattern as useSiteSettings - select all columns, then filter
    const { data, error } = await supabase
      .from('site_settings')
      .select('*')
      .eq('setting_key', 'ga4_measurement_id');
    
    if (error) {
      return '';
    }
    
    // Check if we have data and extract setting_value
    if (!data || !Array.isArray(data) || data.length === 0) {
      return '';
    }
    
    const result = (data[0]?.setting_value || '').trim();
    return result;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('Failed to fetch GA4 ID from database:', error);
    }
    return '';
  }
};

// Get GA4 Measurement ID (from env or database)
export const getGA4MeasurementId = async (): Promise<string> => {
  // If already loaded, return cached value
  if (ga4IdLoaded) {
    return GA4_MEASUREMENT_ID;
  }

  // If env variable is set, use it (priority)
  if (GA4_MEASUREMENT_ID) {
    ga4IdLoaded = true;
    return GA4_MEASUREMENT_ID;
  }

  // Otherwise, fetch from database (only once)
  if (!ga4IdPromise) {
    ga4IdPromise = fetchGA4IdFromDatabase().then((id) => {
      GA4_MEASUREMENT_ID = id;
      ga4IdLoaded = true;
      return id;
    });
  }

  return ga4IdPromise;
};

// Check if GA4 is enabled
export const isGA4Enabled = () => {
  return typeof window !== 'undefined' && GA4_MEASUREMENT_ID && window.gtag;
};

/**
 * Initialize GA4
 * Call this once when the app loads
 */
export const initGA4 = async () => {
  if (typeof window === 'undefined') {
    return;
  }

  // Get GA4 ID (from env or database)
  const measurementId = await getGA4MeasurementId();
  
  if (!measurementId) {
    // GA4 is optional - silently return if not configured
    // Only show warning if explicitly required via VITE_GA4_REQUIRED env var
    if (process.env.NODE_ENV === 'development' && import.meta.env.VITE_GA4_REQUIRED === 'true') {
      console.warn('GA4 Measurement ID not found. Analytics disabled.');
    }
    return;
  }

  // Update the global variable
  GA4_MEASUREMENT_ID = measurementId;

  // Load gtag script if not already loaded
  if (!window.gtag) {
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_MEASUREMENT_ID}`;
    document.head.appendChild(script1);

    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA4_MEASUREMENT_ID}', {
        page_path: window.location.pathname,
        send_page_view: false // We'll track page views manually for SPA
      });
    `;
    document.head.appendChild(script2);
  }
};

/**
 * Track page view
 * Use this for SPA routing (React Router)
 */
export const trackPageView = (path: string, title?: string) => {
  // Check if analytics is allowed before tracking
  if (!isAnalyticsAllowed() || !isGA4Enabled()) return;

  window.gtag('config', GA4_MEASUREMENT_ID, {
    page_path: path,
    page_title: title || document.title,
  });
};

/**
 * Track custom event
 * 
 * @param eventName - Event name (e.g., 'add_to_cart', 'purchase', 'search')
 * @param eventParams - Event parameters (e.g., { product_id: '123', value: 100 })
 */
export const trackEvent = (
  eventName: string,
  eventParams?: Record<string, any>
) => {
  // Check if analytics is allowed before tracking
  if (!isAnalyticsAllowed() || !isGA4Enabled()) return;

  window.gtag('event', eventName, eventParams);
};

/**
 * Track e-commerce events
 */

// Track add to cart
export const trackAddToCart = (product: {
  id: string;
  name: string;
  price: number;
  quantity?: number;
  category?: string;
}) => {
  trackEvent('add_to_cart', {
    currency: 'VND',
    value: product.price * (product.quantity || 1),
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity: product.quantity || 1,
        item_category: product.category,
      },
    ],
  });
};

// Track remove from cart
export const trackRemoveFromCart = (product: {
  id: string;
  name: string;
  price: number;
  quantity?: number;
}) => {
  trackEvent('remove_from_cart', {
    currency: 'VND',
    value: product.price * (product.quantity || 1),
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        quantity: product.quantity || 1,
      },
    ],
  });
};

// Track view item
export const trackViewItem = (product: {
  id: string;
  name: string;
  price: number;
  category?: string;
  image_url?: string;
}) => {
  trackEvent('view_item', {
    currency: 'VND',
    value: product.price,
    items: [
      {
        item_id: product.id,
        item_name: product.name,
        price: product.price,
        item_category: product.category,
        item_image: product.image_url,
      },
    ],
  });
};

// Track begin checkout
export const trackBeginCheckout = (cart: {
  value: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    category?: string;
  }>;
}) => {
  trackEvent('begin_checkout', {
    currency: 'VND',
    value: cart.value,
    items: cart.items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
      item_category: item.category,
    })),
  });
};

// Track purchase
export const trackPurchase = (order: {
  transaction_id: string;
  value: number;
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
    category?: string;
  }>;
}) => {
  trackEvent('purchase', {
    transaction_id: order.transaction_id,
    currency: 'VND',
    value: order.value,
    items: order.items.map((item) => ({
      item_id: item.id,
      item_name: item.name,
      price: item.price,
      quantity: item.quantity,
      item_category: item.category,
    })),
  });
};

// Track search
export const trackSearch = (searchTerm: string) => {
  trackEvent('search', {
    search_term: searchTerm,
  });
};

// Track newsletter subscription
export const trackNewsletterSubscribe = () => {
  trackEvent('newsletter_subscribe');
};

// Track contact form submission
export const trackContactFormSubmit = () => {
  trackEvent('contact_form_submit');
};

// Track login
export const trackLogin = (method: 'email' | 'google' | 'facebook') => {
  trackEvent('login', {
    method: method,
  });
};

// Track signup
export const trackSignUp = (method: 'email' | 'google' | 'facebook') => {
  trackEvent('sign_up', {
    method: method,
  });
};

// Extend Window interface for TypeScript
declare global {
  interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
  }
}

