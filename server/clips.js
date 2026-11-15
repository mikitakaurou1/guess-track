import crypto from 'node:crypto';
import express from 'express';

const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const BUCKET = 'clips';
const MAX_BYTES = 50 * 1024 * 1024;
const TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
const PATH_RE = /^[a-z0-9-]{8,80}\.(mp4|webm)$/;
const MAX_FAILED_PER_HOUR = 10;

const enabled = () => !!BASE && !!KEY;
const authHeaders = () => (KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` });

export const clipPathOf = (v) => { const p = String(v ?? '').trim(); return PATH_RE.test(p) ? p : null; };
export const isClipPath = (v) => typeof v === 'string' && PATH_RE.test(v);
export const clipUrl = (p) => `${BASE}/storage/v1/object/public/${BUCKET}/${p}`;

function storage(path, init = {}) {
  return fetch(`${BASE}/storage/v1${path}`, { ...init, headers: { ...authHeaders(), ...init.headers }, signal: AbortSignal.timeout(20_000) });
}

let bucketReady = false;
async function ensureBucket() {
  if (bucketReady) return;
  const r = await storage('/bucket', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES, allowed_mime_types: Object.keys(TYPES) }),
  });
  if (r.ok) { bucketReady = true; return; }
  const text = await r.text();
  if (/already exists|duplicate/i.test(text)) { bucketReady = true; return; }
  throw new Error(`Не удалось создать хранилище клипов (${r.status}): ${text.slice(0, 160)}`);
}

export async function removeClipObject(p) {
  if (!enabled() || !isClipPath(p)) return;
  try {
    const r = await storage(`/object/${BUCKET}/${p}`, { method: 'DELETE' });
    if (!r.ok) console.error(`Не удалось удалить клип ${p}: ${r.status}`);
  } catch (e) {
    console.error(`Не удалось удалить клип ${p}:`, e.message);
  }
}

const failed = new Map();
const recentFails = (ip) => (failed.get(ip) ?? []).filter((t) => Date.now() - t < 3600_000);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function registerClipRoutes(app) {
  const textBody = express.text({ type: () => true, limit: '8kb' });
  const gate = (req, res) => {
    let body = null;
    try { const b = JSON.parse(req.body); body = b && typeof b === 'object' ? b : null; } catch { /* bad json */ }
    if (!body) { res.status(400).json({ error: 'Некорректный запрос' }); return null; }
    if (recentFails(req.ip).length >= MAX_FAILED_PER_HOUR) { res.status(429).json({ error: 'Слишком много попыток, попробуйте позже' }); return null; }
    const expected = process.env.ADMIN_PASSWORD;
    if (!expected) { res.status(503).json({ error: 'Пароль администратора не задан на сервере (ADMIN_PASSWORD)' }); return null; }
    if (!crypto.timingSafeEqual(sha(body.password ?? ''), sha(expected))) {
      failed.set(req.ip, [...recentFails(req.ip), Date.now()]);
      res.status(403).json({ error: 'Неверный пароль' });
      return null;
    }
    return body;
  };

  app.post('/api/clip-upload-url', textBody, async (req, res) => {
    const body = gate(req, res); if (!body) return;
    if (!enabled()) return res.status(503).json({ error: 'Хранилище не настроено: задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY на сервере' });
    const ext = TYPES[String(body.type ?? '')];
    const size = Number(body.size);
    if (!ext) return res.status(400).json({ error: 'Подойдут видео MP4 или WebM' });
    if (!Number.isFinite(size) || size <= 0 || size > MAX_BYTES) return res.status(400).json({ error: 'Размер видео должен быть не больше 50 МБ' });
    try {
      await ensureBucket();
      const p = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
      const r = await storage(`/object/upload/sign/${BUCKET}/${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
      const data = await r.json().catch(() => ({}));
      const rel = data.url ?? data.signedURL ?? data.signedUrl;
      if (!r.ok || !rel) throw new Error(`Хранилище не выдало ссылку для загрузки (${r.status}): ${JSON.stringify(data).slice(0, 160)}`);
      const text = String(rel);
      const uploadUrl = text.startsWith('http') ? text : `${BASE}/storage/v1${text.startsWith('/') ? '' : '/'}${text}`;
      res.json({ path: p, uploadUrl });
    } catch (e) {
      console.error('Ссылка для загрузки клипа:', e.message);
      res.status(502).json({ error: e.message });
    }
  });
}
