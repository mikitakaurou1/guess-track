import { API_BASE } from '../config';

export interface PlaylistInfo { title: string; creator: string; artwork: string | null; }

async function viaServer(url: string, signal: AbortSignal): Promise<PlaylistInfo> {
  const r = await fetch(`${API_BASE}/api/playlist-info?url=${encodeURIComponent(url)}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.json();
  const art = typeof b.artwork === 'string' && b.artwork.startsWith('https://') ? b.artwork : null;
  return { title: typeof b.title === 'string' ? b.title : '', creator: typeof b.creator === 'string' ? b.creator : '', artwork: art };
}

async function viaOembed(url: string, signal: AbortSignal): Promise<PlaylistInfo> {
  const r = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.json();
  const author = typeof b.author_name === 'string' ? b.author_name : '';
  let title = typeof b.title === 'string' ? b.title : '';
  if (author && title.endsWith(` by ${author}`)) title = title.slice(0, -(author.length + 4));
  const art = typeof b.thumbnail_url === 'string' && b.thumbnail_url.startsWith('https://') ? b.thumbnail_url : null;
  return { title, creator: author, artwork: art };
}

export async function fetchPlaylistInfo(url: string): Promise<PlaylistInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    try {
      return await viaServer(url, ctrl.signal);
    } catch {
      return await viaOembed(url, ctrl.signal);
    }
  } finally {
    clearTimeout(timer);
  }
}
