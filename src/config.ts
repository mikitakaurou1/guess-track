const raw = (import.meta.env.VITE_API_URL as string | undefined) ?? '';
export const API_BASE = raw.endsWith('/') ? raw.slice(0, -1) : raw;
