import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { ARTISTS } from './artists.js';

const ROOT = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));
const FILE = path.join(ROOT, 'artist-playlist-sources.json');
const MANUAL = process.env.MANUAL_TRACKS_FILE ?? path.join(ROOT, 'manual-tracks.json');
const BLOCKED = process.env.BLOCKLIST_FILE ?? path.join(ROOT, 'blocked.json');
const ids = new Set(ARTISTS.map(a => a.id));
function read(file) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid catalog storage');
    return value;
  } catch (e) { if (e.code === 'ENOENT') return {}; throw e; }
}
let sources = read(FILE);
function save(next) {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = `${FILE}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(next), { mode: 0o600 }); fs.renameSync(tmp, FILE); }
  catch (e) { try { fs.unlinkSync(tmp); } catch {} throw e; }
  sources = next;
}
export function playlistUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new Error('Нужна полная HTTPS-ссылка на плейлист SoundCloud'); }
  if (u.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(u.hostname) || u.username || u.password || u.port || !/^\/[^/]+\/sets\/[^/]+\/?$/.test(u.pathname)) {
    throw new Error('Нужна прямая ссылка https://soundcloud.com/пользователь/sets/плейлист, не короткая ссылка');
  }
  return `https://soundcloud.com${u.pathname.replace(/\/$/, '')}`;
}
export async function loadPlaylist(raw, v2) {
  const url = playlistUrl(raw);
  const p = await v2(`https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}`);
  if (p?.kind !== 'playlist' || p.sharing !== 'public') throw new Error('Нужен публичный плейлист SoundCloud');
  const all = p.tracks;
  if (!Array.isArray(all) || !all.length) throw new Error('Плейлист пуст или недоступен');
  if (Number.isFinite(p.track_count) && p.track_count !== all.length) throw new Error('SoundCloud вернул неполный плейлист. Старый каталог сохранён');
  if (all.some(t => !Number.isSafeInteger(t?.id) || t.id <= 0)) throw new Error('SoundCloud вернул трек без корректного id. Старый каталог сохранён');
  const trackIds = [...new Set(all.map(t => t.id))];
  const originals = new Map(all.map(t => [t.id, t]));
  const full = new Map();
  for (let i = 0; i < trackIds.length; i += 50) {
    const batch = await v2(`https://api-v2.soundcloud.com/tracks?ids=${trackIds.slice(i, i + 50).join(',')}`);
    if (!Array.isArray(batch)) throw new Error('Не удалось загрузить полные данные треков');
    for (const t of batch) if (t?.id) full.set(t.id, t);
  }
  const tracks = trackIds.map(id => {
    const original = originals.get(id);
    const t = { ...original, ...full.get(id) };
    const title = t.title || original.title;
    const trackUrl = t.permalink_url || original.permalink_url;
    if (typeof title !== 'string' || !title.trim() || typeof trackUrl !== 'string' || !trackUrl.trim()) {
      throw new Error(`SoundCloud не отдал название или ссылку трека #${id}. Импорт остановлен без пропуска треков; старый каталог сохранён`);
    }
    return { id, title, artist: t.publisher_metadata?.artist || t.user?.username || '', url: trackUrl, artwork: (t.artwork_url || t.user?.avatar_url || '').replace('-large', '-t300x300') || undefined };
  });
  return { url, tracks, skipped: 0, updatedAt: new Date().toISOString() };
}
export function mergeTracks(source, manual, blocked) {
  const selected = new Set(source.tracks.map(t => t.id));
  const merged = new Map(source.tracks.map(t => [t.id, t]));
  for (const t of Object.values(manual ?? {})) merged.set(t.id, t);
  // A curated playlist explicitly selects these ids; historical automatic-search exclusions must not shrink it.
  // Explicit removals within this playlist source remain authoritative.
  return [...merged.values()].filter(t => !source.hidden?.[t.id] && (selected.has(t.id) || !blocked?.[t.id]));
}
const failed = new Map();
const reports = new Map();
const digest = value => crypto.createHash('sha256').update(String(value ?? '')).digest();
const busy = new Set();
function bodyOf(req) { try { const b = JSON.parse(req.body); return b && typeof b === 'object' && !Array.isArray(b) ? b : null; } catch { return null; } }
function gate(req, res, body) {
  if (!body) { res.status(400).json({ error: 'Некорректный запрос' }); return false; }
  const recent = (failed.get(req.ip) ?? []).filter(t => Date.now() - t < 3600000);
  if (recent.length >= 10) { res.status(429).json({ error: 'Слишком много попыток входа' }); return false; }
  if (!process.env.ADMIN_PASSWORD) { res.status(503).json({ error: 'Пароль администратора не задан' }); return false; }
  if (!crypto.timingSafeEqual(digest(body.password), digest(process.env.ADMIN_PASSWORD))) {
    failed.set(req.ip, [...recent, Date.now()]); res.status(403).json({ error: 'Неверный пароль' }); return false;
  }
  return true;
}
function present(id) { return sources[id] ? { mode: 'playlist', url: sources[id].url, updatedAt: sources[id].updatedAt, importedCount: sources[id].tracks.length, skipped: sources[id].skipped } : { mode: 'automatic', url: null }; }
function pool(id) { return mergeTracks(sources[id], read(MANUAL)[id], read(BLOCKED)[id]); }

// Register after registerArtistEdits (so its title/cover/clip overlay still runs), before registerArtistRoutes.
export function registerArtistPlaylistSources(app, v2) {
  const text = express.text({ type: () => true, limit: '8kb' });
  app.get('/api/artist-source', (req, res) => {
    const id = String(req.query.id ?? '');
    if (!ids.has(id)) return res.status(404).json({ error: 'Артист не найден' });
    res.setHeader('Cache-Control', 'no-store'); res.json(present(id));
  });
  app.post('/api/artist-source', text, async (req, res) => {
    const body = bodyOf(req); if (!gate(req, res, body)) return;
    const id = String(body.artistId ?? '');
    if (!ids.has(id)) return res.status(404).json({ error: 'Артист не найден' });
    if (busy.has(id)) return res.status(409).json({ error: 'Источник этого артиста уже обновляется' });
    busy.add(id);
    try {
      let count = null;
      if (body.url === null) { const next = { ...sources }; delete next[id]; save(next); }
      else {
        const loaded = await loadPlaylist(body.url, v2);
        const candidate = { ...loaded, hidden: sources[id]?.hidden ?? {} };
        count = mergeTracks(candidate, read(MANUAL)[id], read(BLOCKED)[id]).length;
        save({ ...sources, [id]: candidate });
      }
      res.setHeader('Cache-Control', 'no-store');
      res.json({ ok: true, ...present(id), count });
    } catch (e) { res.status(502).json({ error: `Изменения не применены: ${e.message}` }); }
    finally { busy.delete(id); }
  });
  app.get('/api/artist-pool', (req, res, next) => {
    const id = String(req.query.id ?? '');
    res.setHeader('Cache-Control', 'no-store');
    if (!sources[id]) return next();
    try { res.json(pool(id)); }
    catch (e) { next(e); }
  });
  app.use('/api/artists', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const send = res.json.bind(res);
    res.json = data => {
      try {
        if (!Array.isArray(data)) return send(data);
        const manual = read(MANUAL); const blocked = read(BLOCKED);
        return send(data.map(a => sources[a.id] ? { ...a, count: mergeTracks(sources[a.id], manual[a.id], blocked[a.id]).length, status: 'ready', sourceMode: 'playlist' } : a));
      } catch { return res.status(500).send({ error: 'Не удалось прочитать каталог' }); }
    };
    next();
  });
  const hide = (req, res, body, report) => {
    const id = String(body?.artistId ?? '');
    if (!body) return res.status(400).json({ error: 'Некорректный запрос' });
    if (busy.has(id)) return res.status(409).json({ error: 'Дождитесь обновления источника' });
    const trackId = Number(body.trackId);
    try {
      if (!Number.isSafeInteger(trackId) || !pool(id).some(t => t.id === trackId)) return res.status(404).json({ error: 'Трек не найден в каталоге' });
      const old = sources[id];
      save({ ...sources, [id]: { ...old, hidden: { ...old.hidden, [trackId]: { at: Date.now(), reason: report ? body.reason : 'admin' } } } });
      res.json({ ok: true, count: pool(id).length });
    } catch (e) { res.status(500).json({ error: 'Не удалось сохранить изменение каталога' }); }
  };
  app.post('/api/artist-track-delete', text, (req, res, next) => {
    const body = bodyOf(req); if (!sources[String(body?.artistId ?? '')]) return next();
    if (gate(req, res, body)) hide(req, res, body, false);
  });
  app.post('/api/artist-report', text, (req, res, next) => {
    const body = bodyOf(req); if (!sources[String(body?.artistId ?? '')]) return next();
    if (!['other-artist', 'remix', 'ai-cover'].includes(body.reason)) return res.status(400).json({ error: 'Некорректная причина' });
    const recent = (reports.get(req.ip) ?? []).filter(t => Date.now() - t < 3600000);
    if (recent.length >= 30) return res.status(429).json({ error: 'Слишком много жалоб' });
    reports.set(req.ip, [...recent, Date.now()]); hide(req, res, body, true);
  });
  app.post('/api/artist-rebuild', text, (req, res, next) => {
    const body = bodyOf(req); if (!sources[String(body?.artistId ?? '')]) return next();
    if (!gate(req, res, body)) return;
    res.status(409).json({ error: 'Выбран свой плейлист. Используйте «Обновить из плейлиста» или верните автоматический каталог' });
  });
}
