import { API_BASE } from '../config';

export interface PlaylistInfo { title: string; creator: string; artwork: string | null; }

// Данные плейлиста для карточки (берёт сервер, так как браузер не может обратиться к API SoundCloud напрямую)
export async function fetchPlaylistInfo(url: string): Promise<PlaylistInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(`${API_BASE}/api/playlist-info?url=${encodeURIComponent(url)}`, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const b = await r.json();
    const art = typeof b.artwork === 'string' && b.artwork.startsWith('https://') ? b.artwork : null;
    return { title: typeof b.title === 'string' ? b.title : '', creator: typeof b.creator === 'string' ? b.creator : '', artwork: art };
  } finally {
    clearTimeout(timer);
  }
}
