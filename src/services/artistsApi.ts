import type { Track } from '../types/game';
import { API_BASE } from '../config';

export const ARTIST_PREFIX = 'artist:';
export interface ArtistInfo { id: string; name: string; artwork: string | null; count: number; status: 'ready' | 'building' | 'error'; }
export type ReportReason = 'other-artist' | 'remix' | 'ai-cover';

const names = new Map<string, string>();
const trackArtist = new Map<number, string>();
export const artistLabel = (raw: string): string => {
  const id = raw.startsWith(ARTIST_PREFIX) ? raw.slice(ARTIST_PREFIX.length) : raw;
  return names.get(id) ?? id;
};
// Из каталога какого артиста пришёл трек (для кнопки «Не тот трек»)
export const artistOfTrack = (trackId: number): string | undefined => trackArtist.get(trackId);

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
  const list = (await r.json()) as Track[];
  list.forEach(t => trackArtist.set(t.id, id));
  return list;
}

export async function reportTrack(artistId: string, trackId: number, reason: ReportReason): Promise<void> {
  const r = await fetch(`${API_BASE}/api/artist-report`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: JSON.stringify({ artistId, trackId, reason }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
}
