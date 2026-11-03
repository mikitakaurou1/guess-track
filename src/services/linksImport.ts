import type { Track } from '../types/game';
import { parseSoundCloudUrl } from './soundcloudUrl';
import { resolveShortUrl } from './likesApi';

// Достаёт ссылки на отдельные треки из текста (по одной в строке или через пробел).
// Понимает все виды ссылок SoundCloud; короткие (on.soundcloud.com) раскрываются через сервер.
export async function parseLinks(text: string): Promise<Track[]> {
  const urls: string[] = [];
  const shorts: string[] = [];

  for (const raw of text.split(/\s+/)) {
    const p = parseSoundCloudUrl(raw);
    if (!p) continue;
    if (p.short) shorts.push(raw);
    else if (p.kind === 'track') urls.push(p.url);
  }

  for (let i = 0; i < shorts.length; i += 6) {
    const chunk = shorts.slice(i, i + 6);
    const results = await Promise.all(chunk.map((s) => resolveShortUrl(s).catch(() => null)));
    for (const r of results) {
      const p = r ? parseSoundCloudUrl(r) : null;
      if (p?.kind === 'track') urls.push(p.url);
    }
  }

  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    // отрицательный id — признак того, что реальный id ещё неизвестен
    tracks.push({ id: -(tracks.length + 1), title: '', artist: '', url });
  }
  return tracks;
}
