import type { Track } from '../types/game';
import { API_BASE } from '../config';

export async function fetchLikes(url: string): Promise<Track[]> {
  const r = await fetch(`${API_BASE}/api/likes?url=${encodeURIComponent(url.trim())}`);
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `Ошибка сервера (${r.status})`);
  }
  return r.json();
}

// Короткие ссылки (on.soundcloud.com/...) раскрывает сервер: браузер не может следовать их редиректам
export async function resolveShortUrl(url: string): Promise<string> {
  const r = await fetch(`${API_BASE}/api/resolve?url=${encodeURIComponent(url.trim())}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok || !body.url) throw new Error(body.error ?? 'Не удалось раскрыть короткую ссылку');
  return body.url as string;
}
