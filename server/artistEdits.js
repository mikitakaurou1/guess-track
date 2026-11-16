import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ARTISTS } from './artists.js';
import { validateArtwork, validateTrackUrl } from './manualTracks.js';
import { clipPathOf, isClipPath, clipUrl, removeClipObject } from './clips.js';

const DATA_DIR = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));
const FILE = process.env.ARTIST_TRACK_EDITS_FILE ?? path.join(DATA_DIR, 'artist-track-edits.json');
const COVERS_DIR = process.env.ARTIST_TRACK_COVERS_DIR ?? path.join(DATA_DIR, 'artist-track-covers');
const EXT = { png: 'png', jpeg: 'jpg', webp: 'webp', gif: 'gif' };
const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };
const MAX_FAILED_PER_HOUR = 10;
const ARTIST_IDS = new Set(ARTISTS.map((a) => a.id));
const NOT_A_TRACK = new Set(['sets', 'likes', 'tracks', 'albums', 'reposts', 'popular-tracks', 'following', 'followers']);

// Ссылка на один трек SoundCloud: soundcloud.com/исполнитель/название (не профиль и не плейлист)
function trackLink(raw) {
  const url = validateTrackUrl(raw);
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  if (parts.length !== 2 || NOT_A_TRACK.has(parts[1].toLowerCase())) throw new Error('Нужна ссылка именно на трек: soundcloud.com/исполнитель/название-трека');
  return url;
}

let edits = {};
try {
  const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid artist track edits file');
  edits = parsed;
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
  edits = next;
}

const coverPath = (artistId, id, ext) => path.join(COVERS_DIR, `${artistId}__${id}.${ext}`);
function removeCoverFiles(artistId, id, except) {
  for (const ext of Object.values(EXT)) {
    if (ext === except) continue;
    try { fs.unlinkSync(coverPath(artistId, id, ext)); } catch { /* no file */ }
  }
}

const artUrl = (artistId, id, e) => (e.artworkFile ? `/api/artist-track-cover?artist=${encodeURIComponent(artistId)}&id=${id}&v=${e.artworkFile.v}` : e.artwork);

function overlayPool(artistId, list) {
  const per = edits[artistId];
  if (!per) return list;
  return list.map((t) => {
    const e = per[t.id];
    if (!e) return t;
    const out = { ...t };
    const edited = {};
    if (e.title) { out.title = e.title; edited.title = true; }
    if (e.artist) { out.artist = e.artist; edited.artist = true; }
    const art = artUrl(artistId, t.id, e);
    if (art) { out.artwork = art; edited.artwork = true; }
    if (isClipPath(e.clip)) out.clip = clipUrl(e.clip);
    // Админ поменял ссылку: звук берётся оттуда, а название, исполнитель и обложка остаются как были (игра не подменяет их данными другого трека)
    if (e.url) { out.url = e.url; out.src = e.url; edited.title = true; edited.artist = true; edited.artwork = true; }
    const hasEdited = Object.keys(edited).length > 0;
    return hasEdited || out.clip ? { ...out, ...(hasEdited ? { edited } : {}) } : t;
  });
}

const failed = new Map();
const recentFails = (ip) => (failed.get(ip) ?? []).filter((t) => Date.now() - t < 3600_000);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();

export function registerArtistEdits(app) {
  const bigTextBody = express.text({ type: () => true, limit: '3mb' });
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

  app.use('/api/artist-pool', (req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => json(Array.isArray(body) ? overlayPool(String(req.query.id ?? ''), body) : body);
    next();
  });

  app.get('/api/artist-track-cover', (req, res) => {
    const artistId = String(req.query.artist ?? '');
    const id = String(req.query.id ?? '');
    const file = edits[artistId]?.[id]?.artworkFile;
    if (!ARTIST_IDS.has(artistId) || !file || !MIME[file.ext]) return res.status(404).end();
    fs.readFile(coverPath(artistId, id, file.ext), (err, buf) => {
      if (err) return res.status(404).end();
      res.setHeader('Content-Type', MIME[file.ext]);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      res.end(buf);
    });
  });

  app.post('/api/artist-track-edit', bigTextBody, (req, res) => {
    const body = gate(req, res); if (!body) return;
    const artistId = String(body.artistId ?? '');
    const id = Number(body.trackId);
    if (!ARTIST_IDS.has(artistId) || !Number.isSafeInteger(id) || id === 0) return res.status(400).json({ error: 'Некорректный трек' });
    const next = { ...(edits[artistId]?.[id] ?? {}) };
    for (const f of ['title', 'artist']) {
      if (!(f in body)) continue;
      if (body[f] === null) { delete next[f]; continue; }
      const v = String(body[f]).trim();
      if (!v || v.length > 300) return res.status(400).json({ error: 'Название и исполнитель должны быть от 1 до 300 символов' });
      next[f] = v;
    }
    if ('url' in body) {
      if (body.url === null) delete next.url;
      else {
        try { next.url = trackLink(body.url); }
        catch (e) { return res.status(400).json({ error: e.message }); }
      }
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
          if (!m) return res.status(400).json({ error: 'Нужна картинка PNG, JPEG, WebP или GIF' });
          const ext = EXT[m[1]]; write = { ext, buf: Buffer.from(m[2], 'base64') };
          keepExt = ext; delete next.artwork; next.artworkFile = { ext, v: Date.now() };
        } else { next.artwork = art; delete next.artworkFile; }
      }
    }
    const per = { ...(edits[artistId] ?? {}) };
    if (Object.keys(next).length) per[id] = next; else delete per[id];
    const all = { ...edits };
    if (Object.keys(per).length) all[artistId] = per; else delete all[artistId];
    try {
      if (write) { fs.mkdirSync(COVERS_DIR, { recursive: true }); fs.writeFileSync(coverPath(artistId, id, write.ext), write.buf); }
      save(all);
      if ('artwork' in body) removeCoverFiles(artistId, id, keepExt);
    } catch (e) {
      console.error('Правки треков артиста:', e.message);
      return res.status(500).json({ error: 'Не удалось сохранить правки на сервере' });
    }
    if (oldClip && oldClip !== next.clip) void removeClipObject(oldClip);
    res.json({ ok: true });
  });
}
