import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Bounded per-process single-flight cache. A disconnected listener never cancels other listeners.
export function createReverseCache({ concurrency = 2, maxQueued = 8, maxBytes = 64 * 1024 * 1024, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  const ready = new Map();
  const pending = new Map();
  const queue = [];
  let active = 0;
  let bytes = 0;
  const remove = key => { const item = ready.get(key); if (item) { bytes -= item.data.length; ready.delete(key); } };
  const prune = () => { for (const [key, item] of ready) if (item.until <= now()) remove(key); };
  const store = (key, data) => {
    prune();
    if (data.length > maxBytes) return;
    while (bytes + data.length > maxBytes && ready.size) remove(ready.keys().next().value);
    ready.set(key, { data, until: now() + ttlMs }); bytes += data.length;
  };
  const pump = () => {
    while (active < concurrency && queue.length) {
      const job = queue.shift(); active++;
      void (async () => {
        let data; let error;
        try {
          data = await job.build();
          if (!Buffer.isBuffer(data) || !data.length) throw new Error('Empty reverse output');
          store(job.key, data);
        } catch (e) { error = e; }
        pending.delete(job.key); active--;
        if (error) job.reject(error); else job.resolve(data);
        pump();
      })();
    }
  };
  return {
    request(key, build) {
      prune();
      const hit = ready.get(key);
      if (hit) { ready.delete(key); ready.set(key, hit); return { state: 'hit', promise: Promise.resolve(hit.data) }; }
      const shared = pending.get(key);
      if (shared) return { state: 'shared', promise: shared };
      if (active >= concurrency && queue.length >= maxQueued) {
        const error = new Error('Reverse queue full'); error.status = 429; throw error;
      }
      let resolve; let reject;
      const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      pending.set(key, promise); queue.push({ key, build, resolve, reject }); pump();
      return { state: 'miss', promise };
    },
    stats() { prune(); return { active, queued: queue.length, cached: ready.size, bytes }; },
  };
}

const run = promisify(execFile);
const app = express();
app.set('trust proxy', 1);
const origin = process.env.ALLOWED_ORIGIN;
const enabled = process.env.ENABLE_REVERSE_DOWNLOADS === 'true';
const cache = createReverseCache();
const requests = new Map();
const builds = new Map();
const cleanup = setInterval(() => {
  for (const map of [requests, builds]) for (const [key, value] of map) if (Date.now() - value.at > 60000) map.delete(key);
}, 60000);
cleanup.unref();
function allowed(map, key, limit) {
  const recent = map.get(key);
  const rate = recent && Date.now() - recent.at < 60000 ? recent : { at: Date.now(), count: 0 };
  map.set(key, rate); return ++rate.count <= limit;
}
app.use((req, res, next) => {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true, enabled, ...cache.stats() }));
async function render(url, seconds) {
  let dir;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 175000);
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'guess-reverse-'));
    await run(process.env.YT_DLP_BIN || 'yt-dlp', [
      '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
      '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
      '--max-filesize', '30M', '--match-filter', 'duration <= 1800',
      '--download-sections', `*0-${seconds}`, '--downloader', 'ffmpeg',
      '-f', 'bestaudio/best', '-o', path.join(dir, 'source.%(ext)s'), '--', url,
    ], { signal: abort.signal, timeout: 140000, maxBuffer: 1024 * 1024 });
    const names = await readdir(dir);
    const input = names.find(n => n.startsWith('source.') && !n.endsWith('.part') && !n.endsWith('.ytdl'));
    if (!input) throw new Error('Missing audio');
    const source = path.join(dir, input);
    if ((await stat(source)).size > 32 * 1024 * 1024) throw new Error('File too large');
    const output = path.join(dir, 'reverse.wav');
    await run(process.env.FFMPEG_BIN || 'ffmpeg', [
      '-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-i', source,
      '-vn', '-t', String(seconds), '-af', `atrim=start=0:end=${seconds},asetpts=PTS-STARTPTS,areverse`,
      '-ar', '44100', '-ac', '2', '-c:a', 'pcm_s16le', output,
    ], { signal: abort.signal, timeout: 30000, maxBuffer: 1024 * 1024 });
    const size = (await stat(output)).size;
    if (size < 44 || size > 12 * 1024 * 1024) throw new Error('Invalid reverse output size');
    return await readFile(output);
  } finally {
    clearTimeout(deadline);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
app.get('/api/reverse', async (req, res) => {
  if (!enabled) return res.status(503).json({ error: 'Перевертыш ещё не настроен: установите ENABLE_REVERSE_DOWNLOADS=true на отдельном backend.' });
  let url;
  const seconds = Number(req.query.seconds);
  try {
    url = new URL(String(req.query.url || ''));
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || url.port || url.username || url.password || parts.length !== 2 || ['sets', 'likes', 'tracks', 'albums', 'popular-tracks'].includes(parts[1])) throw new Error('url');
    url.hostname = 'soundcloud.com'; url.search = ''; url.hash = '';
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error('seconds');
  } catch { return res.status(400).json({ error: 'Нужна полная HTTPS-ссылка на один публичный трек SoundCloud и длительность 1–60 секунд.' }); }
  const ip = req.ip || 'unknown';
  if (!allowed(requests, ip, 240)) { res.setHeader('Retry-After', '60'); return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' }); }
  try {
    const job = cache.request(`${seconds}:${url.href}`, () => {
      // Charge expensive work only once, not once per guest, cache hit or in-flight subscriber.
      if (!allowed(builds, ip, 12)) { const e = new Error('Reverse build rate limit'); e.status = 429; throw e; }
      return render(url.href, seconds);
    });
    const data = await job.promise;
    if (!res.destroyed) {
      res.setHeader('Cache-Control', 'private, max-age=1800');
      res.setHeader('X-Reverse-Cache', job.state);
      res.type('audio/wav').send(data);
    }
  } catch (error) {
    console.error('Reverse processing failed:', error.code || error.status || error.name);
    if (!res.headersSent && !res.destroyed) {
      const status = error.status === 429 ? 429 : error.code === 'ENOENT' ? 503 : 502;
      if (status === 429) res.setHeader('Retry-After', '10');
      res.status(status).json({ error: status === 429 ? 'Очередь обработки заполнена или достигнут лимит новых треков. Повторите позже.' : status === 503 ? 'На сервере не установлены yt-dlp или FFmpeg. Требуется настройка Render.' : 'Не удалось получить или обработать трек. Он может быть недоступен; повторите запрос или замените трек.' });
    }
  }
});
app.listen(process.env.PORT || 3002, '0.0.0.0', () => console.log('Reverse audio service started'));
