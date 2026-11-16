import type { Track } from '../types/game';
import { API_BASE } from '../config';

export const ARTIST_PREFIX = 'artist:';
export interface ArtistInfo { id: string; name: string; artwork: string | null; count: number; status: 'ready' | 'building' | 'error'; }
export type ReportReason = 'other-artist' | 'remix' | 'ai-cover';
export const BAD_PASSWORD = 'Неверный пароль';
export const ADMIN_CHANGED_EVENT = 'guesstrack:admin-changed';

const ADMIN_KEY = 'guesstrackAdminKey';
const names = new Map<string, string>();
const trackArtist = new Map<number, string>();
export const artistLabel = (raw: string): string => {
  const id = raw.startsWith(ARTIST_PREFIX) ? raw.slice(ARTIST_PREFIX.length) : raw;
  return names.get(id) ?? id;
};
// Из каталога какого артиста пришёл трек (для кнопки «Не тот трек»)
export const artistOfTrack = (trackId: number): string | undefined => trackArtist.get(trackId);

const notifyAdminChanged = (): void => { window.dispatchEvent(new Event(ADMIN_CHANGED_EVENT)); };
export const hasAdminKey = (): boolean => !!localStorage.getItem(ADMIN_KEY);
export const clearAdminKey = (): void => { localStorage.removeItem(ADMIN_KEY); notifyAdminChanged(); };
export const adminPassword = (): string => localStorage.getItem(ADMIN_KEY) ?? '';

async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
  const r = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify(body) });
  const data = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) throw new Error(typeof data.error === 'string' ? data.error : `Ошибка сервера (${r.status})`);
  return data;
}

export async function adminLogin(password: string): Promise<void> {
  await post('/api/admin-check', { password });
  localStorage.setItem(ADMIN_KEY, password);
  notifyAdminChanged();
}

export async function saveArtistOrder(order: string[]): Promise<void> {
  await post('/api/artist-order', { password: adminPassword(), order });
}

export async function adminDeleteTrack(artistId: string, trackId: number): Promise<void> {
  await post('/api/artist-track-delete', { password: adminPassword(), artistId, trackId });
}

// url: ссылка на трек SoundCloud, по которой игра загружает звук (null — вернуть исходную)
export async function adminEditArtistTrack(artistId: string, trackId: number, patch: { title?: string | null; artist?: string | null; artwork?: string | null; url?: string | null }): Promise<void> {
  await post('/api/artist-track-edit', { password: adminPassword(), artistId, trackId, ...patch });
}

export async function adminResetCover(artistId: string): Promise<void> {
  await post('/api/artist-cover-reset', { password: adminPassword(), artistId });
}

// Пересборка каталога артиста по кнопке (запускается на сервере в фоне)
export async function adminRebuildArtist(artistId: string): Promise<{ started: boolean; busy: boolean }> {
  const d = await post('/api/artist-rebuild', { password: adminPassword(), artistId });
  return { started: d.started === true, busy: d.busy === true };
}

function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

// Файл с компьютера -> data URL для сервера. SVG отправляется как есть, остальные форматы уменьшаются до 600 px и становятся PNG или JPEG.
async function coverDataUrl(file: File): Promise<string> {
  if (file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)) {
    return `data:image/svg+xml;base64,${bufferToBase64(await file.arrayBuffer())}`;
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Не удалось прочитать картинку. Подойдут .jpg, .png, .svg, .webp, .gif');
  }
  const scale = Math.min(1, 600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/gif';
  return canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', 0.9);
}

export async function adminSetCover(artistId: string, file: File): Promise<void> {
  await post('/api/artist-cover', { password: adminPassword(), artistId, dataUrl: await coverDataUrl(file) });
}

export async function fetchArtists(): Promise<ArtistInfo[]> {
  const r = await fetch(`${API_BASE}/api/artists`);
  if (!r.ok) throw new Error(`Ошибка сервера (${r.status})`);
  const list = (await r.json()) as ArtistInfo[];
  list.forEach(a => names.set(a.id, a.name));
  return list.map(a => (a.artwork?.startsWith('/api/') ? { ...a, artwork: `${API_BASE}${a.artwork}` } : a));
}

export async function fetchArtistPool(id: string): Promise<Track[]> {
  const r = await fetch(`${API_BASE}/api/artist-pool?id=${encodeURIComponent(id)}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
  const list = ((await r.json()) as Track[]).map(t => (t.artwork?.startsWith('/api/') ? { ...t, artwork: `${API_BASE}${t.artwork}` } : t));
  list.forEach(t => trackArtist.set(t.id, id));
  return list;
}

export async function reportTrack(artistId: string, trackId: number, reason: ReportReason): Promise<void> {
  await post('/api/artist-report', { artistId, trackId, reason });
}
