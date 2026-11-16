// Однократный сбор данных Genius с вашего компьютера и загрузка в Supabase.
// Запуск (Node 18+):
//   GENIUS_ACCESS_TOKEN=... SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=sb_secret_... node scripts/genius-warm.mjs
// (в PowerShell: $env:GENIUS_ACCESS_TOKEN='...'; $env:SUPABASE_URL='...'; $env:SUPABASE_SERVICE_ROLE_KEY='...'; node scripts/genius-warm.mjs)
// Скрипт медленный и терпеливый. Прогресс сохраняется в genius-warm.progress.json, повторный запуск продолжает с места остановки.
import fs from 'node:fs';

const TOKEN = process.env.GENIUS_ACCESS_TOKEN ?? '';
const SB_URL = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const VERSION = String(process.env.GENIUS_CACHE_VERSION ?? '1');
const PROGRESS = 'genius-warm.progress.json';
const GAP_MS = 1500;
const MAX_WAIT_MS = 10 * 60_000;
if (!TOKEN || !SB_URL || !SB_KEY) {
  console.error('Нужны переменные GENIUS_ACCESS_TOKEN, SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// [адрес артиста на Genius, запрос для поиска]: те же, что в server/artists.js (без t3wkyy / Cya.niDE, их не трогаем)
const ARTISTS = [
  ['Kai-angel', 'Kai Angel'], ['Madk1d', 'madk1d'], ['Og-buda', 'OG Buda'], ['Mayot', 'MAYOT'], ['163onmyneck', '163ONMYNECK'],
  ['Darkprinceee', 'темный принц'], ['Villian', 'VILLIAN'], ['Friendly-thug-52-ngg', 'FRIENDLY THUG 52 NGG'], ['Kizaru', 'kizaru'], ['Saluki', 'SALUKI'],
  ['Lildrughill', 'LILDRUGHILL'], ['Rocket', 'ROCKET'], ['Fendiglock', 'FENDIGLOCK'], ['Fortuna-812', 'FORTUNA 812'], ['Onda-andar', 'ONDA ANDAR'],
  ['Aquakey', 'AQUAKEY'], ['Cupsize', 'CUPSIZE'], ['Uggly', 'Uggly'], ['Babyface-melo', 'Babyface Melo'], ['John-garik', 'Джон Гарик'],
  ['Gonefludd', 'GONE.Fludd'], ['Toxi', 'Toxi$'], ['Voskresenskii', 'Voskresenskii'], ['Lovv66', 'LOVV66'], ['Big-baby-tape', 'Big Baby Tape'],
  ['Platina', 'Платина'], ['Pharaoh', 'PHARAOH'], ['Deathmarried', 'deathmarried'], ['Yeschapskii', 'Yeschapskii'], ['Heronwater', 'Heronwater'],
  ['Oxxxymiron', 'Oxxxymiron'], ['Lsp', 'ЛСП'], ['Icegergert', 'ICEGERGERT'], ['9mice', '9mice'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cleanUrl = (u) => String(u ?? '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
const slimArtist = (a) => (a && a.id && a.url ? { id: a.id, url: String(a.url) } : null);

function compact(pathname, data) {
  const r = data?.response;
  if (!r) return null;
  if (pathname === '/search') {
    return { response: { hits: (r.hits ?? []).map((h) => ({ result: { primary_artist: slimArtist(h.result?.primary_artist), featured_artists: (h.result?.featured_artists ?? []).map(slimArtist).filter(Boolean) } })) } };
  }
  return { response: { songs: (r.songs ?? []).map((s) => ({ title: s.title ?? '' })), next_page: r.next_page ?? null } };
}

let items = {};
try { items = JSON.parse(fs.readFileSync(PROGRESS, 'utf8')).items ?? {}; } catch { /* начинаем с нуля */ }
const saveProgress = () => fs.writeFileSync(PROGRESS, JSON.stringify({ items }));

let lastAt = 0;
async function get(key) {
  if (items[key]) return items[key].data;
  const pathname = key.split('?')[0];
  for (let attempt = 1; ; attempt++) {
    const wait = lastAt + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    let r;
    try {
      r = await fetch(`https://api.genius.com${key}`, { headers: { Authorization: `Bearer ${TOKEN}` }, signal: AbortSignal.timeout(30_000) });
    } catch (e) {
      lastAt = Date.now();
      console.warn(`  сетевая ошибка (${e.message}), жду 10 с`);
      await sleep(10_000);
      continue;
    }
    lastAt = Date.now();
    if (r.ok) {
      const slim = compact(pathname, await r.json());
      items[key] = { at: Date.now(), data: slim };
      saveProgress();
      return slim;
    }
    const limited = r.status === 429 || r.status >= 500 || (r.status === 404 && pathname.endsWith('/songs'));
    if (!limited) throw new Error(`Genius ответил ${r.status} на ${key}`);
    const retryAfter = Number(r.headers.get('retry-after'));
    const pause = Math.min(MAX_WAIT_MS, retryAfter > 0 ? retryAfter * 1000 : 30_000 * Math.min(attempt, 10));
    console.warn(`  Genius ответил ${r.status}, жду ${Math.round(pause / 1000)} с (попытка ${attempt})`);
    await sleep(pause);
  }
}

async function resolveId(slug, q) {
  const want = cleanUrl(`https://genius.com/artists/${slug}`);
  const keys = [];
  for (let page = 1; page <= 3; page++) {
    const key = `/search?q=${encodeURIComponent(q)}&per_page=20&page=${page}`;
    keys.push(key);
    const data = await get(key);
    for (const hit of data.response.hits ?? []) {
      const song = hit.result ?? {};
      for (const a of [song.primary_artist, ...(song.featured_artists ?? [])]) {
        if (a?.id && cleanUrl(a.url) === want) {
          keys.forEach((k) => { items[k].keep = true; });
          saveProgress();
          return a.id;
        }
      }
    }
  }
  throw new Error(`Не найден артист Genius «${slug}»`);
}

async function songs(id) {
  let count = 0;
  let page = 1;
  for (let i = 0; page && i < 30; i++) {
    const data = await get(`/artists/${id}/songs?per_page=50&sort=title&page=${page}`);
    count += data.response.songs.length;
    page = data.response.next_page ?? null;
  }
  return count;
}

function sbHeaders() {
  return SB_KEY.startsWith('sb_') ? { apikey: SB_KEY } : { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` };
}

async function upload() {
  const base = `${SB_URL}/rest/v1/guesstrack_files`;
  let merged = { ...items };
  const cur = await fetch(`${base}?path=eq.genius-cache.json&select=content_base64`, { headers: sbHeaders() });
  if (cur.ok) {
    const rows = await cur.json();
    if (rows[0]?.content_base64) {
      try {
        const old = JSON.parse(Buffer.from(rows[0].content_base64, 'base64').toString('utf8'));
        if (old.version === VERSION && old.items) merged = { ...old.items, ...items };
      } catch { /* старый файл нечитаем, перезапишем */ }
    }
  }
  const body = JSON.stringify({ version: VERSION, items: merged });
  const r = await fetch(`${base}?on_conflict=path`, {
    method: 'POST',
    headers: { ...sbHeaders(), 'content-type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ path: 'genius-cache.json', content_base64: Buffer.from(body).toString('base64'), updated_at: new Date().toISOString() }),
  });
  if (!r.ok) throw new Error(`Supabase ответил ${r.status}: ${(await r.text()).slice(0, 200)}`);
  console.log(`Готово: в Supabase записано ${Object.keys(merged).length} записей кэша`);
}

const failed = [];
for (const [i, [slug, q]] of ARTISTS.entries()) {
  try {
    const id = await resolveId(slug, q);
    const n = await songs(id);
    console.log(`[${i + 1}/${ARTISTS.length}] ${slug}: ${n} песен`);
  } catch (e) {
    failed.push(slug);
    console.error(`[${i + 1}/${ARTISTS.length}] ${slug}: ошибка: ${e.message}`);
  }
}
await upload();
if (failed.length) console.log(`Не удалось: ${failed.join(', ')}. Запустите скрипт ещё раз: он продолжит с места остановки.`);
