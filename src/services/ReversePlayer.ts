import type { SoundCloudPlayer } from './SoundCloudPlayer';
import type { Track } from '../types/game';
import { API_BASE } from '../config';
const BASE = String(import.meta.env.VITE_REVERSE_API_URL || API_BASE).replace(/\/$/, '');
function permalink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const p = u.pathname.split('/').filter(Boolean);
    if (!['http:', 'https:'].includes(u.protocol) || !['soundcloud.com', 'www.soundcloud.com'].includes(u.hostname) || u.port || u.username || u.password || p.length !== 2 || ['sets', 'likes', 'tracks', 'albums', 'popular-tracks'].includes(p[1])) return null;
    return `https://soundcloud.com/${p.join('/')}`;
  } catch { return null; }
}
export function reverseSrc(raw: string, seconds: number): string | null {
  const url = permalink(raw);
  return url ? `${BASE}/api/reverse?${new URLSearchParams({ url, seconds: String(Math.min(60, Math.max(1, seconds))) })}` : null;
}
// Сохраняем контракт существующего плеера, меняя только аудиодвижок.
// Не переопределённые методы (например, загрузка плейлистов) работают через SoundCloud.
export function createReversePlayer(original: SoundCloudPlayer, seconds: () => number): SoundCloudPlayer {
  const audio = new Audio();
  audio.preload = 'auto';
  const progress = new Set<(ms: number) => void>();
  const plays = new Set<() => void>();
  let generation = 0;
  let prepared = false;
  let report = false;
  let objectUrl = '';
  let abort: AbortController | null = null;
  let clip = 10;
  let metadata: Track | null = null;
  const emit = () => { if (report) progress.forEach(f => f(audio.currentTime * 1000)); };
  audio.addEventListener('timeupdate', emit);
  audio.addEventListener('playing', () => { plays.forEach(f => f()); emit(); });
  audio.addEventListener('ended', () => { if (report) progress.forEach(f => f(Math.max(audio.currentTime * 1000, clip * 1000))); });
  const stop = () => { report = false; audio.pause(); };
  const release = () => {
    audio.removeAttribute('src'); audio.load();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = ''; prepared = false;
  };
  const begin = () => { generation++; abort?.abort(); stop(); release(); return generation; };
  const load = async (src: string, token: number): Promise<boolean> => {
    const controller = new AbortController(); abort = controller;
    const timer = setTimeout(() => controller.abort(), 185000);
    try {
      const r = await fetch(src, { signal: controller.signal });
      if (!r.ok || !(r.headers.get('content-type') || '').startsWith('audio/')) return false;
      const blob = await r.blob();
      if (token !== generation) return false;
      objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      prepared = true;
      return true;
    } catch { return false; }
    finally { clearTimeout(timer); if (abort === controller) abort = null; }
  };
  const play = () => { void audio.play().catch(() => {}); };
  const overrides = {
    onProgress: (f: (ms: number) => void) => { progress.add(f); return () => { progress.delete(f); }; },
    onPlay: (f: () => void) => { plays.add(f); return () => { plays.delete(f); }; },
    setStartMode: () => {},
    unlock: () => { original.unlock(); if (prepared) play(); },
    detach: () => { generation++; abort?.abort(); stop(); release(); },
    pause: stop,
    resume: () => { report = true; play(); },
    warmPrepared: async () => {},
    prepareTrack: async (track: Track, _warm: boolean, _lenient = false): Promise<Track | null | undefined> => {
      const token = begin();
      clip = seconds();
      let info = track;
      if (!permalink(info.url)) {
        original.setStartMode(undefined);
        const resolved = await original.prepareTrack(track, false);
        if (token !== generation) return undefined;
        original.detach();
        if (!resolved || resolved.id !== track.id) return null;
        info = { ...track, title: resolved.title || track.title, artist: resolved.artist || track.artist, artwork: resolved.artwork || track.artwork, url: resolved.url };
      }
      const src = reverseSrc(info.url, clip);
      if (!src) return null;
      const ok = await load(src, token);
      if (token !== generation) return undefined;
      metadata = ok ? info : null;
      return metadata;
    },
    startPrepared: async (_fast = false) => {
      if (!prepared) return false;
      report = true; audio.currentTime = 0;
      try { await audio.play(); return true; } catch { return true; }
    },
    loadOnly: async (src: string, _warm = false) => {
      const token = begin();
      try {
        const u = new URL(src, location.href);
        clip = Math.min(60, Math.max(1, Number(u.searchParams.get('seconds')) || 10));
      } catch { return false; }
      return load(src, token);
    },
    playWarmed: () => { report = true; audio.currentTime = 0; play(); },
    playFromStart: () => { report = true; audio.currentTime = 0; play(); },
    playFull: () => { report = false; audio.currentTime = 0; play(); },
  };
  return new Proxy(original, {
    get(target, property) {
      if (Object.prototype.hasOwnProperty.call(overrides, property)) return Reflect.get(overrides, property);
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
