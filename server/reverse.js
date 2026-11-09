import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const run = promisify(execFile);
const app = express();
app.set('trust proxy', 1);
const origin = process.env.ALLOWED_ORIGIN;
const enabled = process.env.ENABLE_REVERSE_DOWNLOADS === 'true';
let active = 0;
const requests = new Map();
const cleanup = setInterval(() => {
  for (const [key, value] of requests) if (Date.now() - value.at > 60000) requests.delete(key);
}, 60000);
cleanup.unref();
app.use((req, res, next) => {
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.get('/health', (_req, res) => res.json({ ok: true, enabled }));
app.get('/api/reverse', async (req, res) => {
  if (!enabled) return res.status(503).json({ error: 'Перевертыш ещё не настроен: установите ENABLE_REVERSE_DOWNLOADS=true на отдельном backend.' });
  let url;
  const seconds = Number(req.query.seconds);
  try {
    url = new URL(String(req.query.url || ''));
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) || url.port || url.username || url.password || parts.length !== 2 || ['sets', 'likes', 'tracks', 'albums', 'popular-tracks'].includes(parts[1])) throw new Error('url');
    url.search = ''; url.hash = '';
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error('seconds');
  } catch { return res.status(400).json({ error: 'Нужна полная HTTPS-ссылка на один публичный трек SoundCloud и длительность 1–60 секунд.' }); }
  const key = req.ip || 'unknown';
  const recent = requests.get(key);
  const rate = recent && Date.now() - recent.at < 60000 ? recent : { at: Date.now(), count: 0 };
  requests.set(key, rate);
  if (++rate.count > 12) return res.status(429).json({ error: 'Слишком много запросов. Подождите минуту.' });
  if (active >= 2) return res.status(429).json({ error: 'Сервис занят обработкой двух треков. Повторите позже.' });
  active++;
  let dir;
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 175000);
  const disconnect = () => { if (!res.writableEnded) abort.abort(); };
  res.on('close', disconnect);
  try {
    dir = await mkdtemp(path.join(tmpdir(), 'guess-reverse-'));
    await run(process.env.YT_DLP_BIN || 'yt-dlp', [
      '--ignore-config', '--no-playlist', '--no-progress', '--no-warnings',
      '--socket-timeout', '15', '--retries', '1', '--fragment-retries', '1',
      '--max-filesize', '30M', '--match-filter', 'duration <= 1800',
      '--download-sections', `*0-${seconds}`, '--downloader', 'ffmpeg',
      '-f', 'bestaudio/best', '-o', path.join(dir, 'source.%(ext)s'), '--', url.href,
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
    if (!res.destroyed) {
      res.type('audio/wav');
      await new Promise((resolve, reject) => res.sendFile(output, e => e ? reject(e) : resolve()));
    }
  } catch (error) {
    console.error('Reverse processing failed:', error.code || error.name);
    if (!res.headersSent && !res.destroyed) res.status(error.code === 'ENOENT' ? 503 : 502).json({ error: error.code === 'ENOENT' ? 'На сервере не установлены yt-dlp или FFmpeg. Требуется настройка Render.' : 'Не удалось получить или обработать трек. Он может быть недоступен; повторите запрос или замените трек.' });
  } finally {
    clearTimeout(deadline);
    res.off('close', disconnect);
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
    active--;
  }
});
app.listen(process.env.PORT || 3002, '0.0.0.0', () => console.log('Reverse audio service started'));
