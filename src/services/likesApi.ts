import type { Track } from '../types/game';
import { API_BASE } from '../config';

export function isProfileUrl(raw: string): boolean {
  const s = raw.trim();
  if (!s) return false;
  let u: URL;
  try {
    u = new URL(s.startsWith('http') ? s : 'https://' + s);
  } catch {
    return false;
  }
  if (u.hostname !== 'soundcloud.com' && u.hostname !== 'www.soundcloud.com') return false;
  const parts = u.pathname.split('/').filter(Boolean);
  return parts.length === 1 || (parts.length === 2 && parts[1] === 'likes');
}

export async function fetchLikes(url: string): Promise<Track[]> {
  const r = await fetch(`${API_BASE}/api/likes?url=${encodeURIComponent(url.trim())}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
  return r.json();
}
