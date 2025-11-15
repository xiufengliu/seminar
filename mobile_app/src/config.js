// Prefer same-origin /api for deployed builds but keep localhost:4000 for Expo dev
let base = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://localhost:4000';
try {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    const { hostname, origin } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    if (!isLocalHost) {
      base = `${origin}/api`;
    }
  }
} catch {}
export const API_BASE_URL = base;
