import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { isClipPath, clipUrl } from './clips.js';

// Публикация библиотеки для desktop-версии: собирает снимок каталогов, обложек и клипов, кладёт файлы в Supabase Storage
// и отдаёт манифест последней версии. Данные берёт из собственного API сервера, поэтому правки админа, скрытые треки и порядок учтены.
const DATA_DIR = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));
const STATE_FILE = path.join(DATA_DIR, 'desktop-library-state.json');
const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'desktop-library';
const LOCAL = `http://127.0.0.1:${process.env.PORT ?? 3001}`;
const FEATURED_URL = 'https://soundcloud.com/nikitkakovrov4/sets/guesstrack';
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
const POLL_MS = 10_000;
const QUIET_MS = 20_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CLIP_BYTES = 50 * 1024 * 1024;
const FAIL_RETRY_MS = 6 * 3600_000;
const MAX_FAILED_PER_HOUR = 10;
const IGNORED = new Set(['genius-cache.json', 'track-failures.json', 'desktop-library-state.json']);

const enabled = () => !!BASE && !!KEY;
const authHeaders = () => (KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` });
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const objectUrl = (key) => `${BASE}/storage/v1/object/public/${BUCKET}/${key}`;
const localUrl = (sha, ext) => `guesstrack://bundle/library/assets/${sha}.${ext}`;

let state = { latest: null, assets: {}, failed: {} };
try {
  const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    state = {
      latest: parsed.latest ?? null,
      assets: parsed.assets && typeof parsed.assets === 'object' ? parsed.assets : {},
      failed: parsed.failed && typeof parsed.failed === 'object' ? parsed.failed : {},
    };
  }
} catch (e) {
  if (e.code !== 'ENOENT') console.error('Desktop-библиотека: состояние не прочитано, начинаем заново:', e.message);
}

function saveState() {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state));
  fs.renameSync(tmp, STATE_FILE);
}
let unsaved = 0;
const noteNew = () => { if (++unsaved >= 50) { unsaved = 0; try { saveState(); } catch (e) { console.error('Desktop-библиотека: состояние не сохранено:', e.message); } } };

function storage(p, init = {}, timeoutMs = 30_000) {
  return fetch(`${BASE}/storage/v1${p}`, { ...init, headers: { ...authHeaders(), ...init.headers }, signal: AbortSignal.timeout(timeoutMs) });
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const r = await storage('/bucket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_CLIP_BYTES, allowed_mime_types: [...Object.keys(MIME_EXT), 'application/json'] }),
  });
  if (r.ok) { bucketReady = true; return; }
  const text = await r.text();
  if (/already exists|duplicate/i.test(text)) { bucketReady = true; return; }
  throw new Error(`Не удалось создать хранилище desktop-библиотеки (${r.status}): ${text.slice(0, 160)}`);
}

async function putObject(key, body, type) {
  const r = await storage(`/object/${BUCKET}/${key}`, { method: 'POST', headers: { 'content-type': type, 'x-upsert': 'true' }, body }, 120_000);
  if (!r.ok) throw new Error(`Не удалось сохранить ${key} (${r.status}): ${(await r.text()).slice(0, 160)}`);
}

async function localJson(p) {
  const r = await fetch(`${LOCAL}${p}`, { signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`${p.split('?')[0]}: HTTP ${r.status}`);
  return r.json();
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// Обложка: источник недоступен -> пропускаем (потом повторим через FAIL_RETRY_MS); ошибка нашего хранилища -> сборка прерывается.
async function imageAsset(raw) {
  const src = String(raw ?? '').trim();
  if (!src) return null;
  if (state.assets[src]) return state.assets[src];
  if (state.failed[src] && Date.now() - state.failed[src] < FAIL_RETRY_MS) return null;
  const url = src.startsWith('/api/') ? `${LOCAL}${src}` : src;
  if (!url.startsWith('https://') && !url.startsWith(LOCAL)) return null;
  let buf; let type; let ext;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    type = (r.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    ext = MIME_EXT[type];
    if (!ext) throw new Error(`неподдерживаемый тип «${type}»`);
    buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) throw new Error(`недопустимый размер ${buf.length}`);
  } catch (e) {
    state.failed[src] = Date.now();
    console.error(`Desktop-библиотека: обложка пропущена (${src.slice(0, 120)}): ${e.message}`);
    return null;
  }
  const sha = sha256(buf);
  await putObject(`objects/${sha}.${ext}`, buf, type);
  const asset = { sha256: sha, size: buf.length, ext };
  state.assets[src] = asset;
  delete state.failed[src];
  noteNew();
  return asset;
}

// Клип остаётся в хранилище клипов; серверу нужны только его размер и SHA-256 (считаются один раз и запоминаются).
async function clipAsset(raw) {
  const text = String(raw ?? '');
  const m = /\/clips\/([a-z0-9-]+\.(?:mp4|webm))(?:\?.*)?$/.exec(text);
  if (!m || !text.startsWith(BASE) || !isClipPath(m[1])) return null;
  const p = m[1];
  const id = `clip:${p}`;
  if (state.assets[id]) return state.assets[id];
  const r = await fetch(clipUrl(p), { signal: AbortSignal.timeout(300_000) });
  if (r.status === 404) { console.error(`Desktop-библиотека: клип ${p} не найден в хранилище, пропущен`); return null; }
  if (!r.ok || !r.body) throw new Error(`Клип ${p}: HTTP ${r.status}`);
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const chunk of r.body) {
    size += chunk.length;
    if (size > MAX_CLIP_BYTES) throw new Error(`Клип ${p} больше допустимого размера`);
    hash.update(chunk);
  }
  if (!size) throw new Error(`Клип ${p} пустой`);
  const asset = { sha256: hash.digest('hex'), size, ext: p.endsWith('.webm') ? 'webm' : 'mp4', url: clipUrl(p) };
  state.assets[id] = asset;
  noteNew();
  return asset;
}

async function buildSnapshot() {
  await ensureBucket();
  const files = new Map();
  const use = (asset) => {
    const p = `assets/${asset.sha256}.${asset.ext}`;
    if (!files.has(p)) files.set(p, { size: asset.size, sha256: asset.sha256, url: asset.url ?? objectUrl(`objects/${asset.sha256}.${asset.ext}`) });
    return localUrl(asset.sha256, asset.ext);
  };
  const addJson = async (rel, data) => {
    const buf = Buffer.from(JSON.stringify(data));
    const sha = sha256(buf);
    await putObject(`objects/${sha}.json`, buf, 'application/json');
    files.set(rel, { size: buf.length, sha256: sha, url: objectUrl(`objects/${sha}.json`) });
  };
  const mapTrack = async (t) => {
    if (!t || typeof t !== 'object') return t;
    const out = { ...t };
    const art = await imageAsset(t.artwork);
    if (art) out.artwork = use(art); else delete out.artwork;
    if (t.clip) {
      const clip = await clipAsset(t.clip);
      if (clip) out.clip = use(clip); else delete out.clip;
    }
    return out;
  };

  const list = await localJson('/api/artists');
  if (!Array.isArray(list)) throw new Error('/api/artists вернул не список');
  const ready = list.filter((a) => a && a.status === 'ready' && a.count > 0 && /^[a-z0-9-]+$/i.test(String(a.id)));
  if (!ready.length) throw new Error('Нет готовых каталогов артистов');
  const artists = await mapLimit(ready, 4, async (a) => {
    const art = await imageAsset(a.artwork);
    return { ...a, artwork: art ? use(art) : undefined };
  });
  for (const a of ready) {
    const pool = await localJson(`/api/artist-pool?id=${encodeURIComponent(a.id)}`);
    if (!Array.isArray(pool)) throw new Error(`Каталог ${a.id}: ответ не список`);
    await addJson(`pools/${a.id}.json`, await mapLimit(pool, 6, mapTrack));
  }
  await addJson('artists.json', artists);

  const info = await localJson(`/api/playlist-info?url=${encodeURIComponent(FEATURED_URL)}`);
  if (!Array.isArray(info.tracks) || !info.tracks.length) throw new Error('Плейлист GuessTrack пуст');
  const cover = await imageAsset(info.artwork);
  const featuredTracks = await mapLimit(info.tracks, 6, async (t) => {
    const m = await mapTrack(t);
    return { ...m, edited: { ...(m.edited ?? {}), artist: true } };
  });
  await addJson('featured.json', {
    sourceUrl: FEATURED_URL,
    title: info.title ?? 'GuessTrack',
    creator: info.creator ?? '',
    artwork: cover ? use(cover) : undefined,
    tracks: featuredTracks,
  });

  const entries = [...files]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([p, f]) => ({ path: p, size: f.size, sha256: f.sha256, url: f.url }));
  const version = sha256(entries.map((f) => `${f.path}:${f.sha256}:${f.size}`).join('\n')).slice(0, 16);
  if (state.latest?.version === version) return { version, changed: false };

  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 1, version, createdAt: new Date().toISOString(), files: entries }));
  const key = `manifests/${version}.json`;
  await putObject(key, manifest, 'application/json');
  const totalBytes = entries.reduce((sum, f) => sum + f.size, 0);
  state.latest = { version, manifestUrl: objectUrl(key), manifestSha256: sha256(manifest), publishedAt: new Date().toISOString(), fileCount: entries.length, totalBytes };
  saveState();
  return { version, changed: true, fileCount: entries.length, totalBytes };
}

function fingerprint() {
  const parts = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && !IGNORED.has(e.name) && !e.name.endsWith('.tmp')) {
        try { const st = fs.statSync(abs); parts.push(`${path.relative(DATA_DIR, abs)}:${st.size}:${Math.round(st.mtimeMs)}`); } catch { /* файл исчез */ }
      }
    }
  };
  walk(DATA_DIR);
  return crypto.createHash('sha1').update(parts.sort().join('\n')).digest('hex');
}

let lastFp = null;
let changedAt = 0;
let dirty = false;
let building = false;
let retryAt = 0;
let failures = 0;
let lastError = null;

async function runBuild() {
  building = true;
  dirty = false;
  try {
    const r = await buildSnapshot();
    failures = 0;
    lastError = null;
    if (r.changed) console.log(`Desktop-библиотека: опубликована версия ${r.version}, файлов ${r.fileCount}, ${(r.totalBytes / 1048576).toFixed(1)} МБ`);
    else console.log(`Desktop-библиотека: версия ${r.version} не изменилась`);
  } catch (e) {
    failures++;
    lastError = e.message;
    dirty = true;
    retryAt = Date.now() + Math.min(15 * 60_000, 30_000 * 2 ** (failures - 1));
    console.error(`Desktop-библиотека: сборка не удалась (попытка ${failures}):`, e.message);
  } finally {
    try { saveState(); } catch (e) { console.error('Desktop-библиотека: состояние не сохранено:', e.message); }
    building = false;
  }
}

function tick() {
  const fp = fingerprint();
  if (fp !== lastFp) { lastFp = fp; changedAt = Date.now(); dirty = true; }
  if (!dirty || building) return;
  if (Date.now() - changedAt < QUIET_MS || Date.now() < retryAt) return;
  void runBuild();
}

const failed = new Map();
const recentFails = (ip) => (failed.get(ip) ?? []).filter((t) => Date.now() - t < 3600_000);
const digest = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function registerDesktopLibrary(app) {
  const textBody = express.text({ type: () => true, limit: '8kb' });
  const gate = (req, res) => {
    let body = null;
    try { const b = JSON.parse(req.body); body = b && typeof b === 'object' ? b : null; } catch { /* bad json */ }
    if (!body) { res.status(400).json({ error: 'Некорректный запрос' }); return null; }
    if (recentFails(req.ip).length >= MAX_FAILED_PER_HOUR) { res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' }); return null; }
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) { res.status(503).json({ error: 'Пароль администратора не задан на сервере (ADMIN_PASSWORD)' }); return null; }
    if (!crypto.timingSafeEqual(digest(body.password ?? ''), digest(expected))) {
      failed.set(req.ip, [...recentFails(req.ip), Date.now()]);
      res.status(403).json({ error: 'Неверный пароль' });
      return null;
    }
    return body;
  };

  app.get('/api/desktop-library/latest', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!state.latest) return res.status(503).json({ error: 'Библиотека ещё не опубликована', pending: true });
    res.json({ schemaVersion: 1, ...state.latest, pending: dirty || building });
  });

  app.post('/api/desktop-library/status', textBody, (req, res) => {
    if (!gate(req, res)) return;
    res.json({ enabled: enabled(), latest: state.latest, building, dirty, failures, lastError, cachedAssets: Object.keys(state.assets).length, failedAssets: Object.keys(state.failed).length });
  });

  app.post('/api/desktop-library/publish', textBody, (req, res) => {
    if (!gate(req, res)) return;
    if (!enabled()) return res.status(503).json({ error: 'Хранилище не настроено' });
    dirty = true; changedAt = 0; retryAt = 0;
    res.json({ ok: true, building });
  });

  if (!enabled()) {
    console.warn('Desktop-библиотека выключена: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  lastFp = fingerprint();
  dirty = true;
  changedAt = Date.now() + 10_000;
  setInterval(tick, POLL_MS).unref();
}