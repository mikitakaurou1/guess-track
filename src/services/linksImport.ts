import type { Track } from '../types/game';

export function parseLinks(text: string): Track[] {
  const seen = new Set<string>();
  const tracks: Track[] = [];
  for (const raw of text.split(/\s+/)) {
    const m = raw.trim().match(/^https?:\/\/(?:www\.)?soundcloud\.com\/([^/?#]+)\/([^/?#]+)/i);
    if (!m) continue;
    const url = `https://soundcloud.com/${m[1]}/${m[2]}`;
    if (seen.has(url)) continue;
    seen.add(url);
    // отрицательный id — признак того, что реальный id ещё неизвестен
    tracks.push({ id: -(tracks.length + 1), title: '', artist: '', url });
  }
  return tracks;
}