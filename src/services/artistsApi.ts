import type { Track } from '../types/game';
import { API_BASE } from '../config';

export const ARTIST_PREFIX = 'artist:';
export interface ArtistInfo { id: string; name: string; artwork: string | null; count: number; status: 'ready' | 'building' | 'error'; }

const names = new Map<string, string>();
export const artistLabel = (raw: string): string => {
  const id = raw.startsWith(ARTIST_PREFIX) ? raw.slice(ARTIST_PREFIX.length) : raw;
  return names.get(id) ?? id;
};

export async function fetchArtists(): Promise<ArtistInfo[]> {
  const r = await fetch(`${API_BASE}/api/artists`);
  if (!r.ok) throw new Error(`Ошибка сервера (${r.status})`);
  const list = (await r.json()) as ArtistInfo[];
  list.forEach(a => names.set(a.id, a.name));
  return list;
}

export async function fetchArtistPool(id: string): Promise<Track[]> {
  const r = await fetch(`${API_BASE}/api/artist-pool?id=${encodeURIComponent(id)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
  return r.json();
}
