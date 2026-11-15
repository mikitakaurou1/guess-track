import type { Track } from '../types/game';
import { API_BASE } from '../config';
import { adminPassword } from './artistsApi';

export const FEATURED_MATCH = 'nikitkakovrov4/sets/guesstrack';
export interface RemovedTrack { id: number; title: string; artist: string; }
export interface FeaturedEdit { title?: string; artist?: string; artwork?: string; }
export interface FeaturedOverrides { removed: RemovedTrack[]; edits: Record<string, FeaturedEdit>; }
type Patch = { title?: string | null; artist?: string | null; artwork?: string | null };

async function send(path: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: adminPassword(), ...body }) });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error ?? `Ошибка сервера (${r.status})`);
  }
}

export const featuredEdit = (trackId: number, patch: Patch): Promise<void> => send('/api/featured-edit', { trackId, ...patch });
export const featuredRemove = (t: { id: number; title: string; artist: string }): Promise<void> => send('/api/featured-remove', { trackId: t.id, title: t.title, artist: t.artist });
export const featuredRestore = (trackId: number): Promise<void> => send('/api/featured-restore', { trackId });

export async function fetchFeaturedOverrides(): Promise<FeaturedOverrides | null> {
  try {
    const r = await fetch(`${API_BASE}/api/featured-overrides`, { cache: 'no-store' });
    if (!r.ok) return null;
    const b = await r.json();
    return { removed: Array.isArray(b.removed) ? b.removed : [], edits: b.edits && typeof b.edits === 'object' ? b.edits : {} };
  } catch {
    return null;
  }
}

const absolute = (u: string) => (u.startsWith('/api/') ? `${API_BASE}${u}` : u);

export function applyFeaturedOverrides(list: Track[], o: FeaturedOverrides | null): Track[] {
  if (!o) return list;
  const removed = new Set(o.removed.map(r => r.id));
  return list.filter(t => !removed.has(t.id)).map(t => {
    const e = o.edits[String(t.id)];
    if (!e) return t;
    const next: Track = { ...t };
    const edited: NonNullable<Track['edited']> = {};
    if (e.title) { next.title = e.title; edited.title = true; }
    if (e.artist) { next.artist = e.artist; edited.artist = true; }
    if (e.artwork) { next.artwork = absolute(e.artwork); edited.artwork = true; }
    return { ...next, edited };
  });
}
