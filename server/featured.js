import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { validateArtwork } from './manualTracks.js';
import { registerClipRoutes, clipPathOf, isClipPath, clipUrl, removeClipObject } from './clips.js';

export const FEATURED_KEY = 'nikitkakovrov4/sets/guesstrack';
const DATA_DIR = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));
const FILE = process.env.FEATURED_OVERRIDES_FILE ?? path.join(DATA_DIR, 'featured-overrides.json');
const COVERS_DIR = process.env.FEATURED_COVERS_DIR ?? path.join(DATA_DIR, 'featured-covers');
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const MAX_FAILED_PER_HOUR = 10;

let data = { removed: {}, edits: {} };
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid featured overrides file');
  data = {
    removed: parsed.removed && typeof parsed.removed === 'object' && !Array.isArray(parsed.removed) ? parsed.removed : {},
    edits: parsed.edits && typeof parsed.edits === 'object' && !Array.isArray(parsed.edits) ? parsed.edits : {},
  };
} catch (e) {
  if (e.code !== 'ENOENT') throw e;
}

function save(next) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(tmp, FILE);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* no temp */ }
    throw e;
  }
  data = next;
}

const coverPath = (id, ext) => path.join(COVERS_DIR, `${id}.${ext}`);
function removeCoverFiles(id, except) {
  for (const ext of Object.values(EXT)) {
    if (ext === except) continue;
    try { fs.unlinkSync(coverPath(id, ext)); } catch { /* no file */ }
  }
}

const artUrl = (id, e) => (e.artworkFile ? `/api/featured-cover?id=${id}&v=${e.artworkFile.v}` : e.artwork);
function resolvedEdits() {
  const out = {};
  for (const [id, e] of Object.entries(data.edits)) {
    const r = {};
    if (e.title) r.title = e.title;
    if (e.artist) r.artist = e.artist;
    if (isClipPath(e.clip)) r.clip = clipUrl(e.clip);
    const a = artUrl(id, e);
    if (a) r.artwork = a;
    if (Object.keys(r).length) out[id] = r;
  }
  return out;
}

export function overlayTracks(tracks) {
  const edits = resolvedEdits();

  return (tracks ?? [])
    .filter((t) => !data.removed[t.id])
    .map((t) => {
      const edit = edits[t.id];

      if (!edit) return t;

      const edited = { ...(t.edited ?? {}) };

      if (edit.title) edited.title = true;
      if (edit.artist) edited.artist = true;
      if (edit.artwork) edited.artwork = true;

      return {
        ...t,
        ...edit,
        edited,
      };
    });
}

export function overlayPlaylistInfo(cleanUrl, info) {
  if (!String(cleanUrl).toLowerCase().includes(FEATURED_KEY)) return info;
  return { ...info, tracks: overlayTracks(info.tracks) };
}

const failed = new Map();
const recentFails = (ip) => (failed.get(ip) ?? []).filter((t) => Date.now() - t < 3600_000);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function registerFeaturedRoutes(app) {
  registerClipRoutes(app);
  const textBody = express.text({ type: () => true, limit: '8kb' });
  const bigTextBody = express.text({ type: () => true, limit: '3mb' });
  const parse = (req) => { try { const b = JSON.parse(req.body); return b && typeof b === 'object' ? b : null; } catch { return null; } };
  const gate = (req, res) => {
    const body = parse(req);
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
  const idOf = (body) => { const id = Number(body.trackId); return Number.isSafeInteger(id) && id > 0 ? id : null; };
  const fail500 = (res, e) => { console.error('Правки плейлиста:', e.message); res.status(500).json({ error: 'Не удалось сохранить правки на сервере' }); };

  app.get('/api/featured-overrides', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      removed: Object.entries(data.removed).map(([id, r]) => ({ id: Number(id), title: r.title ?? '', artist: r.artist ?? '' })),
      edits: resolvedEdits(),
    });
  });

  app.get('/api/featured-cover', (req, res) => {
    const id = String(req.query.id ?? '');
    const file = data.edits[id]?.artworkFile;
    if (!file || !MIME[file.ext]) return res.status(404).end();
    fs.readFile(coverPath(id, file.ext), (err, buf) => {
      if (err) return res.status(404).end();
      res.setHeader('Content-Type', MIME[file.ext]);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.end(buf);
    });
  });

  app.post('/api/featured-edit', bigTextBody, (req, res) => {
    const body = gate(req, res); if (!body) return;
    const id = idOf(body); if (!id) return res.status(400).json({ error: 'Некорректный трек' });
    const next = { ...(data.edits[id] ?? {}) };
    for (const f of ['title', 'artist']) {
      if (!(f in body)) continue;
      if (body[f] === null) { delete next[f]; continue; }
      const v = String(body[f]).trim();
      if (!v || v.length > 300) return res.status(400).json({ error: 'Название и исполнитель должны быть от 1 до 300 символов' });
      next[f] = v;
    }
    let oldClip = null;
    if ('clip' in body) {
      oldClip = isClipPath(next.clip) ? next.clip : null;
      if (body.clip === null) delete next.clip;
      else {
        const clip = clipPathOf(body.clip);
        if (!clip) return res.status(400).json({ error: 'Некорректный файл клипа' });
        next.clip = clip;
      }
    }
    let write = null; let keepExt;
    if ('artwork' in body) {
      if (body.artwork === null) { delete next.artwork; delete next.artworkFile; }
      else {
        let art;
        try { art = validateArtwork(body.artwork); } catch (e) { return res.status(400).json({ error: e.message }); }
        if (!art) return res.status(400).json({ error: 'Пустая обложка' });
        if (art.startsWith('data:')) {
          const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/s.exec(art);
          const ext = EXT[m[1]]; write = { ext, buf: Buffer.from(m[2], 'base64') };
          keepExt = ext; delete next.artwork; next.artworkFile = { ext, v: Date.now() };
        } else { next.artwork = art; delete next.artworkFile; }
      }
    }
    const edits = { ...data.edits };
    if (Object.keys(next).length) edits[id] = next; else delete edits[id];
    try {
      if (write) { fs.mkdirSync(COVERS_DIR, { recursive: true }); fs.writeFileSync(coverPath(id, write.ext), write.buf); }
      save({ ...data, edits });
      if ('artwork' in body) removeCoverFiles(id, keepExt);
    } catch (e) { return fail500(res, e); }
    if (oldClip && oldClip !== next.clip) void removeClipObject(oldClip);
    res.json({ ok: true });
  });

  app.post('/api/featured-remove', textBody, (req, res) => {
    const body = gate(req, res); if (!body) return;
    const id = idOf(body); if (!id) return res.status(400).json({ error: 'Некорректный трек' });
    const entry = { title: String(body.title ?? '').slice(0, 300), artist: String(body.artist ?? '').slice(0, 300), at: new Date().toISOString() };
    try { save({ ...data, removed: { ...data.removed, [id]: entry } }); } catch (e) { return fail500(res, e); }
    res.json({ ok: true });
  });

  app.post('/api/featured-restore', textBody, (req, res) => {
    const body = gate(req, res); if (!body) return;
    const id = idOf(body); if (!id) return res.status(400).json({ error: 'Некорректный трек' });
    const removed = { ...data.removed }; delete removed[id];
    try { save({ ...data, removed }); } catch (e) { return fail500(res, e); }
    res.json({ ok: true });
  });
}
