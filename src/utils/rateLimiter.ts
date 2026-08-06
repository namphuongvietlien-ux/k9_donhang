/**
 * Simple client-side rate limiter for OTP requests
 * Prevents excessive OTP generation attempts
 */

const RATE_LIMIT_KEY = "admin_otp_rate_limit";
const MAX_ATTEMPTS = 3;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

interface RateLimitData {
  attempts: number;
  resetAt: number;
}

export const checkRateLimit = (): { allowed: boolean; remainingTime?: number } => {
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    if (!stored) {
      return { allowed: true };
    }

    const data: RateLimitData = JSON.parse(stored);
    const now = Date.now();

    // Reset if window expired
    if (now > data.resetAt) {
      localStorage.removeItem(RATE_LIMIT_KEY);
      return { allowed: true };
    }

    // Check if limit exceeded
    if (data.attempts >= MAX_ATTEMPTS) {
      const remainingTime = Math.ceil((data.resetAt - now) / 1000 / 60); // minutes
      return { allowed: false, remainingTime };
    }

    return { allowed: true };
  } catch {
    // If parsing fails, allow the request
    return { allowed: true };
  }
};

export const recordAttempt = (): void => {
  try {
    const stored = localStorage.getItem(RATE_LIMIT_KEY);
    const now = Date.now();
    
    let data: RateLimitData;
    if (stored) {
      data = JSON.parse(stored);
      // Reset if window expired
      if (now > data.resetAt) {
        data = { attempts: 1, resetAt: now + WINDOW_MS };
      } else {
        data.attempts += 1;
      }
    } else {
      data = { attempts: 1, resetAt: now + WINDOW_MS };
    }

    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
  } catch {
    // Silently fail if localStorage is unavailable
  }
};

export const resetRateLimit = (): void => {
  try {
    localStorage.removeItem(RATE_LIMIT_KEY);
  } catch {
    // Silently fail
  }
};

