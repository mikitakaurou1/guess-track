// Постоянный кэш запросов к Genius. Списки песен артистов качаются один раз и хранятся в папке данных
// (genius-cache.json), которую persist.js синхронизирует с Supabase: перезапуски и деплои не заставляют заново ходить в Genius.
// Подключается динамически в index.js после восстановления файлов и до загрузки каталогов артистов.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));
const FILE = path.join(DATA_DIR, 'genius-cache.json');
const VERSION = String(process.env.GENIUS_CACHE_VERSION ?? '1');
const SEARCH_TTL_MS = 24 * 3600_000;
const MIN_GAP_MS = 300;
const MAX_ATTEMPTS = 8;
const REQUEST_TIMEOUT_MS = 20_000;

const realFetch = globalThis.fetch.bind(globalThis);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let items = {};
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (parsed && parsed.version === VERSION && parsed.items && typeof parsed.items === 'object') items = parsed.items;
} catch {
  /* кэша ещё нет */
}
console.log(`Genius: записей в кэше: ${Object.keys(items).length}`);

let saveTimer = null;
function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ version: VERSION, items }));
      fs.renameSync(tmp, FILE);
    } catch (e) {
      console.error('Genius: не удалось сохранить кэш:', e.message);
    }
  }, 1000);
}

const slimArtist = (a) => (a && a.id && a.url ? { id: a.id, url: String(a.url) } : null);

// Оставляем только то, что нужно сверке: адреса артистов в поиске и названия песен
function compact(pathname, data) {
  const r = data?.response;
  if (!r) return null;
  if (pathname === '/search') {
    const hits = (r.hits ?? []).map((h) => ({
      result: { primary_artist: slimArtist(h.result?.primary_artist), featured_artists: (h.result?.featured_artists ?? []).map(slimArtist).filter(Boolean) },
    }));
    return { response: { hits } };
  }
  if (/^\/artists\/\d+\/songs$/.test(pathname)) {
    return { response: { songs: (r.songs ?? []).map((s) => ({ title: s.title ?? '' })), next_page: r.next_page ?? null } };
  }
  return null;
}

const asResponse = (data) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });

let chain = Promise.resolve();
let lastAt = 0;
function schedule(task) {
  const run = chain.then(async () => {
    const wait = lastAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try { return await task(); } finally { lastAt = Date.now(); }
  });
  chain = run.catch(() => {});
  return run;
}

function cached(key, isSearch) {
  const hit = items[key];
  if (!hit) return null;
  if (isSearch && Date.now() - hit.at > SEARCH_TTL_MS) return null;
  return hit.data;
}

async function fromNetwork(url, init, key, u, isSearch) {
  const { signal: _ignored, ...rest } = init ?? {};
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let r;
    try {
      r = await realFetch(url, { ...rest, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (e) {
      if (attempt === MAX_ATTEMPTS) throw e;
      await sleep(Math.min(60_000, 2000 * 2 ** (attempt - 1)));
      continue;
    }
    if (r.ok) {
      const data = await r.json();
      const slim = compact(u.pathname, data);
      if (!slim) return asResponse(data);
      items[key] = { at: Date.now(), data: slim };
      save();
      return asResponse(slim);
    }
    if ((r.status === 429 || r.status >= 500) && attempt < MAX_ATTEMPTS) {
      const retryAfter = Number(r.headers.get('retry-after'));
      const wait = retryAfter > 0 ? Math.min(retryAfter * 1000, 60_000) : Math.min(60_000, 2000 * 2 ** (attempt - 1));
      console.warn(`Genius ответил ${r.status}, повтор через ${Math.round(wait / 1000)} с (попытка ${attempt}/${MAX_ATTEMPTS})`);
      await sleep(wait);
      continue;
    }
    return r;
  }
  throw new Error('Genius: не удалось выполнить запрос');
}

globalThis.fetch = function patchedFetch(input, init) {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
  let u;
  try { u = new URL(url); } catch { return realFetch(input, init); }
  const method = String(init?.method ?? 'GET').toUpperCase();
  if (u.hostname !== 'api.genius.com' || method !== 'GET') return realFetch(input, init);
  const key = u.pathname + u.search;
  const isSearch = u.pathname === '/search';
  const hit = cached(key, isSearch);
  if (hit) return Promise.resolve(asResponse(hit));
  return schedule(async () => {
    const again = cached(key, isSearch);
    if (again) return asResponse(again);
    return fromNetwork(url, init, key, u, isSearch);
  });
};
