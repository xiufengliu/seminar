// Prefer current origin for web deployments; fallback to env or localhost
let base = 'http://localhost:4000';
try {
  if (typeof window !== 'undefined' && window.location && window.location.origin) {
    base = `${window.location.origin}/api`;
  } else if (process.env.EXPO_PUBLIC_API_BASE_URL) {
    base = process.env.EXPO_PUBLIC_API_BASE_URL;
  }
} catch {}
export const API_BASE_URL = base;
