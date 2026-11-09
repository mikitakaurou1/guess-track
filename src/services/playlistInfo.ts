import { API_BASE } from '../config';

export interface PlaylistInfo { title: string; creator: string; artwork: string | null; }

const KEY = 'guesstrack:playlist-info:';
const TTL = 30 * 24 * 60 * 60 * 1000;
const DELAYS = [0, 2000, 4000, 8000, 15000, 20000, 30000, 45000];

export function readCachedInfo(url: string): PlaylistInfo | null {
  try {
    const raw = localStorage.getItem(KEY + url);
    if (!raw) return null;
    const { at, info } = JSON.parse(raw);
    return Date.now() - at > TTL ? null : (info as PlaylistInfo);
  } catch {
    return null;
  }
}

function saveCachedInfo(url: string, info: PlaylistInfo) {
  if (!info.artwork) return;
  try {
    localStorage.setItem(KEY + url, JSON.stringify({ at: Date.now(), info }));
  } catch {
    /* хранилище недоступно */
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function withTimeout<T>(ms: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await run(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

async function viaServer(url: string, signal: AbortSignal): Promise<PlaylistInfo> {
  const r = await fetch(`${API_BASE}/api/playlist-info?url=${encodeURIComponent(url)}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.json();
  const art = typeof b.artwork === 'string' && b.artwork.startsWith('https://') ? b.artwork : null;
  return { title: typeof b.title === 'string' ? b.title : '', creator: typeof b.creator === 'string' ? b.creator : '', artwork: art };
}

// Запасной путь только для названия и автора: стандартную картинку SoundCloud (логотип) не берём
async function viaOembed(url: string, signal: AbortSignal): Promise<PlaylistInfo> {
  const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.json();
  const author = typeof b.author_name === 'string' ? b.author_name : '';
  let title = typeof b.title === 'string' ? b.title : '';
  if (author && title.endsWith(` by ${author}`)) title = title.slice(0, -(author.length + 4));
  const thumb = typeof b.thumbnail_url === 'string' && b.thumbnail_url.startsWith('https://') ? b.thumbnail_url : null;
  const art = thumb && !/placeholder|default_avatar/i.test(thumb) ? thumb : null;
  return { title, creator: author, artwork: art };
}

// Сервер может быть недоступен (перезапуск, «пробуждение»): повторяем с нарастающими паузами примерно до двух минут
export async function fetchPlaylistInfo(url: string, isCancelled: () => boolean = () => false): Promise<PlaylistInfo> {
  for (const delay of DELAYS) {
    if (delay) await sleep(delay);
    if (isCancelled()) throw new Error('cancelled');
    try {
      const info = await withTimeout(15000, (s) => viaServer(url, s));
      saveCachedInfo(url, info);
      return info;
    } catch {
      /* пробуем ещё раз */
    }
  }
  return withTimeout(10000, (s) => viaOembed(url, s));
}
