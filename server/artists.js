// Каталоги артистов: ищем треки, где артист в авторах или в названии; убираем ремиксы и дубли.
// Чтобы добавить артиста, допишите объект в ARTISTS. Поиск идёт ТОЛЬКО по написаниям из aliases (точно как написано, без «склеенных» вариантов).
// titleMatch: false — не искать имя в названии трека (для имён-обычных слов), останутся треки с аккаунта артиста и где он указан автором.
// blacklist: id треков, которые нужно убрать всегда; whitelist: id треков, которые не проверяются на «лишние» слова (ремикс и т.п.).
// Треки, помеченные кнопкой «Не тот трек» в игре, сохраняются в файле (см. BLOCKLIST_FILE) и тоже убираются.
// Порядок карточек меняет админ (переменная окружения ADMIN_PASSWORD), порядок хранится в ARTIST_ORDER_FILE.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';

const A = (id, name, aliases, extra = {}) => ({ id, name, aliases, blacklist: [], whitelist: [], ...extra });

export const ARTISTS = [
  A('kai-angel', 'Kai Angel', ['Kai Angel']),
  A('madk1d', 'madk1d', ['madk1d']),
  A('og-buda', 'OG Buda', ['OG Buda']),
  A('mayot', 'MAYOT', ['MAYOT']),
  A('163onmyneck', '163ONMYNECK', ['163ONMYNECK']),
  A('temnyi-prints', 'темный принц', ['темный принц']),
  A('villian', 'VILLIAN', ['VILLIAN']),
  A('friendly-thug-52-ngg', 'FRIENDLY THUG 52 NGG', ['FRIENDLY THUG 52 NGG']),
  A('kizaru', 'kizaru', ['kizaru']),
  A('saluki', 'SALUKI', ['SALUKI']),
  A('lildrughill', 'LILDRUGHILL', ['LILDRUGHILL']),
  A('rocket', 'ROCKET', ['ROCKET'], { titleMatch: false }),
  A('fendiglock', 'FENDIGLOCK', ['FENDIGLOCK']),
  A('t3wkyy-cyanide', 't3wkyy / Cya.niDE', ['t3wkyy', 'Cya.niDE']),
  A('fortuna-812', 'FORTUNA 812', ['FORTUNA 812']),
  A('onda-andar', 'ONDA ANDAR', ['ONDA ANDAR']),
  A('aquakey', 'AQUAKEY', ['AQUAKEY']),
  A('cupsize', 'CUPSIZE', ['CUPSIZE']),
  A('uggly', 'Uggly', ['Uggly']),
  A('babyface-melo', 'Babyface Melo', ['Babyface Melo']),
  A('dzhon-garik', 'Джон Гарик', ['Джон Гарик']),
  A('gone-fludd', 'GONE.Fludd', ['GONE.Fludd']),
  A('toxi', 'Toxi$', ['Toxi$']),
  A('voskresenskii', 'Voskresenskii', ['Voskresenskii']),
  A('lovv66', 'LOVV66', ['LOVV66']),
  A('big-baby-tape', 'Big Baby Tape', ['Big Baby Tape']),
  A('platina', 'Платина', ['Платина'], { titleMatch: false }),
  A('pharaoh', 'PHARAOH', ['PHARAOH']),
  A('deathmarried-yeschapskii', 'deathmarried / Yeschapskii', ['deathmarried', 'Yeschapskii']),
  A('heronwater', 'Heronwater', ['Heronwater']),
  A('oxxxymiron', 'Oxxxymiron', ['Oxxxymiron']),
  A('lsp', 'ЛСП', ['ЛСП']),
  A('icegergert', 'ICEGERGERT', ['ICEGERGERT']),
  A('9mice', '9mice', ['9mice']),
];

const TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 60 * 1000;
const MIN_MS = 45_000;
const MAX_MS = 10 * 60 * 1000;
const MAX_PARALLEL = 3;
const PAGE_DELAY_MS = 120;

const REASONS = { 'other-artist': 'Другой исполнитель', remix: 'Ремикс / перезалив', 'ai-cover': 'ИИ-кавер' };
const BLOCKLIST_FILE = process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json');
const ORDER_FILE = process.env.ARTIST_ORDER_FILE ?? path.join(path.dirname(BLOCKLIST_FILE), 'artist-order.json');
const MAX_REPORTS_PER_HOUR = 30;
const MAX_FAILED_LOGINS_PER_HOUR = 10;

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data, what) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 1));
  } catch (e) {
    console.error(`Не удалось сохранить ${what}:`, e.message);
  }
}

const blocked = readJson(BLOCKLIST_FILE, {});
const saveBlocked = () => writeJson(BLOCKLIST_FILE, blocked, 'список скрытых треков');
const isBlocked = (artistId, trackId) => !!blocked[artistId]?.[trackId];

let order = readJson(ORDER_FILE, []);
if (!Array.isArray(order)) order = [];
order = order.map(String);
const saveOrder = () => writeJson(ORDER_FILE, order, 'порядок артистов');

const reportHits = new Map();
function tooManyReports(ip) {
  const now = Date.now();
  const list = (reportHits.get(ip) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  list.push(now);
  reportHits.set(ip, list);
  return list.length > MAX_REPORTS_PER_HOUR;
}

const failedLogins = new Map();
const recentFails = (ip) => (failedLogins.get(ip) ?? []).filter((t) => Date.now() - t < 60 * 60 * 1000);
function noteFail(ip) {
  failedLogins.set(ip, [...recentFails(ip), Date.now()]);
}
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
function checkAdmin(password) {
  const expected = process.env.ADMIN_PASSWORD;
  if (!expected) return 'disabled';
  return crypto.timingSafeEqual(sha(password ?? ''), sha(expected)) ? 'ok' : 'bad';
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
const compact = (s) => norm(s).replace(/ /g, '');
const hasPhrase = (text, phrase) => ` ${norm(text)} `.includes(` ${phrase} `);

const STOP_PHRASES = [
  'remix', 'rmx', 'refix', 'bootleg', 'mashup', 'cover', 'reupload', 're upload', 'speed up', 'sped up', 'speedup', 'slowed', 'reverb',
  'bass boost', 'bassboost', 'nightcore', '8d', '16d', 'instrumental', 'acapella', 'a cappella', 'karaoke', 'type beat', 'hood track',
  'tiktok', 'snippet', 'preview', 'teaser', 'mix',
  'ремикс', 'рефикс', 'бутлег', 'мэшап', 'мешап', 'кавер', 'перезалив', 'спид ап', 'спидап', 'реверб', 'бас буст', 'басс буст', 'бассбуст',
  'найткор', 'инструментал', 'минус', 'акапелла', 'караоке', 'худ трек', 'худтрек', 'сниппет', 'превью', 'тизер', 'тикток',
];
const STOP_STEMS = ['ускорен', 'замедлен', 'ремикс', 'перезалит', 'reupload'];

function isStopped(title) {
  const n = ` ${norm(title)} `;
  return STOP_PHRASES.some((p) => n.includes(` ${p} `)) || STOP_STEMS.some((s) => n.includes(s));
}

const NOISE = new Set(['official', 'audio', 'video', 'lyrics', 'lyric', 'visualizer', 'hd', 'new', 'single', 'prod', 'by', 'explicit', 'clean', 'album', 'ep', 'премьера', 'клип', 'аудио', 'новинка', 'альбом']);

// Ключ для поиска одинаковых треков: название без скобок, фита, продюсера, имени артиста и «шума»
function dupKey(title, aliasesLower) {
  let s = String(title ?? '').toLowerCase().replace(/ё/g, 'е');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
  s = s.replace(/\b(feat|ft|featuring|prod)\b\.?.*$/, ' ');
  for (const a of aliasesLower) s = s.split(a).join(' ');
  const key = norm(s).split(' ').filter((t) => t && !NOISE.has(t)).join('');
  return key.length >= 2 ? key : compact(title);
}

const big = (u) => (u ? String(u).replace('-large', '-t300x300') : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(v2, url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await v2(url);
    } catch (e) {
      if (e.status === 429 && attempt < 2) {
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  return null;
}

async function pages(v2, first, max) {
  const out = [];
  let next = first;
  for (let i = 0; next && i < max; i++) {
    let data;
    try {
      data = await fetchPage(v2, next);
    } catch (e) {
      console.error('Каталог артиста: ошибка страницы:', e.message);
      break;
    }
    for (const item of data?.collection ?? []) {
      const t = item.track ?? item;
      if (t?.id && (t.kind === 'track' || !t.kind)) out.push(t);
    }
    next = data?.next_href ?? null;
    await sleep(PAGE_DELAY_MS);
  }
  return out;
}

async function build(def, v2) {
  const aliasesN = def.aliases.map(norm);
  const aliasesLower = def.aliases.map((a) => a.toLowerCase().replace(/ё/g, 'е'));
  const own = new Set();
  let avatar = null;
  let bestFollowers = -1;
  const raw = [];

  for (const a of def.aliases.slice(0, 3)) {
    try {
      const r = await fetchPage(v2, `https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(a)}&limit=10`);
      for (const u of r?.collection ?? []) {
        if (!u?.id || own.has(u.id) || !aliasesN.includes(norm(u.username))) continue;
        own.add(u.id);
        if ((u.followers_count ?? 0) > bestFollowers) { bestFollowers = u.followers_count ?? 0; avatar = big(u.avatar_url); }
      }
    } catch (e) {
      console.error(`Каталог артиста: профиль «${a}»:`, e.message);
    }
    await sleep(PAGE_DELAY_MS);
  }
  for (const id of [...own].slice(0, 3)) {
    raw.push(...(await pages(v2, `https://api-v2.soundcloud.com/users/${id}/tracks?limit=200&linked_partitioning=1`, 10)));
  }
  for (const a of def.aliases) {
    raw.push(...(await pages(v2, `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(a)}&limit=200&linked_partitioning=1`, 6)));
  }

  const isOwned = (t) =>
    own.has(t.user?.id) || aliasesN.includes(norm(t.user?.username)) || aliasesN.some((a) => hasPhrase(t.publisher_metadata?.artist, a));
  const isRelated = (t) => isOwned(t) || (def.titleMatch !== false && aliasesN.some((a) => hasPhrase(t.title, a)));

  const byId = new Map();
  for (const t of raw) byId.set(t.id, t);

  const best = new Map();
  for (const t of byId.values()) {
    if (def.blacklist?.includes(t.id) || isBlocked(def.id, t.id)) continue;
    if (t.policy === 'BLOCK' || t.policy === 'SNIP' || t.access === 'blocked' || t.access === 'preview') continue;
    const ms = t.full_duration ?? t.duration ?? 0;
    if (ms < MIN_MS || ms > MAX_MS) continue;
    if (!def.whitelist?.includes(t.id) && isStopped(t.title)) continue;
    if (!isRelated(t)) continue;
    const key = dupKey(t.title, aliasesLower);
    const score = (isOwned(t) ? 1e12 : 0) + (t.playback_count ?? 0);
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { t, score });
  }

  const entries = [...best.values()];
  if (!entries.length) throw new Error('Треки не найдены');
  const top = [...entries].sort((a, b) => b.score - a.score).find((x) => x.t.artwork_url);
  const tracks = entries.map(({ t }) => ({
    id: t.id,
    title: t.title ?? '',
    artist: t.publisher_metadata?.artist || t.user?.username || '',
    url: t.permalink_url ?? '',
    artwork: big(t.artwork_url || t.user?.avatar_url) ?? undefined,
  }));
  return { tracks, artwork: avatar ?? big(top?.t.artwork_url) };
}

const state = new Map(ARTISTS.map((def) => [def.id, { def, tracks: null, artwork: null, at: 0, failedAt: 0, promise: null, job: null }]));

function orderedStates() {
  const rank = (s) => {
    const i = order.indexOf(s.def.id);
    return i === -1 ? 1e6 + ARTISTS.indexOf(s.def) : i;
  };
  return [...state.values()].sort((a, b) => rank(a) - rank(b));
}

// Очередь сборки: не больше MAX_PARALLEL каталогов одновременно, чтобы SoundCloud не ограничил запросы
const queue = [];
let running = 0;
function pump() {
  while (running < MAX_PARALLEL && queue.length) {
    const job = queue.shift();
    running++;
    job().finally(() => {
      running--;
      pump();
    });
  }
}

function ensure(s, v2, urgent = false) {
  if (s.promise) {
    if (urgent && s.job) {
      const i = queue.indexOf(s.job);
      if (i > 0) {
        queue.splice(i, 1);
        queue.unshift(s.job);
      }
    }
    return s.promise;
  }
  const fresh = s.tracks && Date.now() - s.at <= TTL_MS;
  if (fresh) return Promise.resolve();
  if (s.failedAt && Date.now() - s.failedAt < RETRY_AFTER_FAIL_MS) return Promise.resolve();
  let job;
  s.promise = new Promise((resolve) => {
    job = () => {
      s.job = null;
      return build(s.def, v2)
        .then((r) => {
          s.tracks = r.tracks;
          s.artwork = r.artwork;
          s.at = Date.now();
          s.failedAt = 0;
          console.log(`Каталог «${s.def.name}»: ${r.tracks.length} треков`);
        })
        .catch((e) => {
          s.failedAt = Date.now();
          console.error(`Каталог «${s.def.name}» не собран:`, e.message);
        })
        .finally(() => {
          s.promise = null;
          resolve();
        });
    };
  });
  s.job = job;
  if (urgent) queue.unshift(job);
  else queue.push(job);
  pump();
  return s.promise;
}

const info = (s) => ({
  id: s.def.id,
  name: s.def.name,
  artwork: s.artwork,
  count: s.tracks?.length ?? 0,
  status: s.tracks ? 'ready' : s.promise || !s.failedAt ? 'building' : 'error',
});

function parseBody(req) {
  try {
    const b = JSON.parse(req.body);
    return b && typeof b === 'object' ? b : null;
  } catch {
    return null;
  }
}

export function registerArtistRoutes(app, v2) {
  const textBody = express.text({ type: () => true, limit: '8kb' });

  app.get('/api/artists', (req, res) => {
    const list = orderedStates();
    list.forEach((s) => { void ensure(s, v2); });
    res.json(list.map(info));
  });

  app.get('/api/artist-pool', async (req, res) => {
    const s = state.get(String(req.query.id ?? ''));
    if (!s) return res.status(404).json({ error: 'Артист не найден' });
    if (s.tracks) {
      void ensure(s, v2);
      return res.json(s.tracks);
    }
    await ensure(s, v2, true);
    if (!s.tracks) return res.status(502).json({ error: `Не удалось собрать треки «${s.def.name}». Попробуйте через минуту.` });
    res.json(s.tracks);
  });

  // Жалоба на трек: «другой исполнитель», «ремикс», «ИИ-кавер». Тело приходит как text/plain (JSON), чтобы не нужен был CORS-предзапрос.
  app.post('/api/artist-report', textBody, (req, res) => {
    const body = parseBody(req);
    if (!body) return res.status(400).json({ error: 'Некорректный запрос' });
    const s = state.get(String(body.artistId ?? ''));
    const trackId = Number(body.trackId);
    const reason = String(body.reason ?? '');
    if (!s || !Number.isInteger(trackId) || !Object.prototype.hasOwnProperty.call(REASONS, reason)) {
      return res.status(400).json({ error: 'Некорректный запрос' });
    }
    if (tooManyReports(req.ip)) return res.status(429).json({ error: 'Слишком много жалоб, попробуйте позже' });
    const track = s.tracks?.find((t) => t.id === trackId);
    if (!track) return res.status(404).json({ error: 'Трека нет в каталоге' });
    (blocked[s.def.id] ??= {})[trackId] = { reason, title: track.title, at: new Date().toISOString() };
    saveBlocked();
    s.tracks = s.tracks.filter((t) => t.id !== trackId);
    console.log(`Скрыт трек ${trackId} «${track.title}» у «${s.def.name}»: ${REASONS[reason]}`);
    res.json({ ok: true, count: s.tracks.length });
  });

  // Проверка пароля администратора (пароль задаётся переменной окружения ADMIN_PASSWORD)
  const adminGate = (req, res) => {
    const body = parseBody(req);
    if (!body) { res.status(400).json({ error: 'Некорректный запрос' }); return null; }
    if (recentFails(req.ip).length >= MAX_FAILED_LOGINS_PER_HOUR) { res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' }); return null; }
    const result = checkAdmin(body.password);
    if (result === 'disabled') { res.status(503).json({ error: 'Пароль администратора не задан на сервере (ADMIN_PASSWORD)' }); return null; }
    if (result !== 'ok') { noteFail(req.ip); res.status(403).json({ error: 'Неверный пароль' }); return null; }
    return body;
  };

  app.post('/api/admin-check', textBody, (req, res) => {
    if (adminGate(req, res)) res.json({ ok: true });
  });

  app.post('/api/artist-order', textBody, (req, res) => {
    const body = adminGate(req, res);
    if (!body) return;
    const ids = Array.isArray(body.order) ? body.order.map(String).filter((id, i, a) => state.has(id) && a.indexOf(id) === i) : null;
    if (!ids || !ids.length) return res.status(400).json({ error: 'Некорректный порядок' });
    order = ids;
    saveOrder();
    res.json({ ok: true });
  });

  for (const s of orderedStates()) void ensure(s, v2);
}
