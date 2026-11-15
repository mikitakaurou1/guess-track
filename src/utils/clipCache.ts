// Заранее скачиваем видеоклипы в память браузера, чтобы на экране ответа фон появлялся сразу.
// Если скачать не удалось, клип просто играет по обычной ссылке.
const MAX_CLIPS = 3;
type Entry = { blobUrl: string | null };
const cache = new Map<string, Entry>();

// Готовый адрес из памяти или null, если клип ещё не скачан
export function readyClip(url: string): string | null {
  return cache.get(url)?.blobUrl ?? null;
}

export function preloadClip(url: string | undefined): void {
  if (!url || cache.has(url) || typeof fetch === 'undefined') return;
  const entry: Entry = { blobUrl: null };
  cache.set(url, entry);
  while (cache.size > MAX_CLIPS) {
    const oldest = cache.keys().next().value as string;
    const old = cache.get(oldest);
    if (old?.blobUrl) URL.revokeObjectURL(old.blobUrl);
    cache.delete(oldest);
  }
  fetch(url)
    .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.blob(); })
    .then(blob => { if (cache.get(url) === entry) entry.blobUrl = URL.createObjectURL(blob); })
    .catch(e => console.warn('Клип: не удалось скачать заранее, будет обычная загрузка', e));
}
