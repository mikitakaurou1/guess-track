import type { Track } from '../types/game';

const API = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export function isProfileUrl(raw: string): boolean {
  const m = raw.trim().match(/^(?:https?:\/\/)?(?:www\.)?soundcloud\.com\/([^?#]+)/i);
  if (!m) return false;
  const parts = m[1].split('/').filter(Boolean);
  return parts.length === 1 || (parts.length === 2 && parts[1] === 'likes');
}

export async function fetchLikes(url: string): Promise<Track[]> {
  const r = await fetch(`${API}/api/likes?url=${encodeURIComponent(url.trim())}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
  return r.json();
}
