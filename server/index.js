import http from 'node:http';
import express from 'express';
import { WebSocketServer } from 'ws';

const PORT = process.env.PORT ?? 3001;
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/* ---------- Лайки SoundCloud ---------- */
let clientId = null;

async function fetchClientId() {
  const res = await fetch('https://soundcloud.com/', { headers: { 'user-agent': UA } });
  const html = await res.text();
  const m = html.match(/window\.__sc_hydration\s*=\s*(\[.*?\]);\s*</s);
  if (m) {
    try {
      const found = JSON.parse(m[1]).find((o) => o.hydratable === 'apiClient');
      if (found?.data?.id) return found.data.id;
    } catch {
      /* запасной вариант ниже */
    }
  }
  const scripts = [...html.matchAll(/<script[^>]+src=.(https:\/\/a-v2\.sndcdn\.com\/assets\/[^'>\s]+\.js)/g)]
    .map((x) => x[1])
    .reverse();
  for (const src of scripts) {
    const js = await (await fetch(src, { headers: { 'user-agent': UA } })).text();
    const c = js.match(/client_id[:=]\s*.([a-zA-Z0-9]{32})/);
    if (c) return c[1];
  }
  throw new Error('Не удалось получить client_id SoundCloud');
}

async function v2(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!clientId) clientId = await fetchClientId();
    const u = new URL(url);
    u.searchParams.set('client_id', clientId);
    const r = await fetch(u, { headers: { 'user-agent': UA, accept: 'application/json' } });
    if (r.status === 401 || r.status === 403) {
      clientId = null;
      continue;
    }
    if (!r.ok) {
      const err = new Error(`SoundCloud вернул ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r.json();
  }
  throw new Error('SoundCloud отклонил запрос');
}

// Трек не подходит для игры, если его нельзя воспроизвести вне SoundCloud: заблокирован, запрещено встраивание,
// нет потоков, приватный, не обработан или удалён
function isPlayable(t) {
  if (t.policy === 'BLOCK' || t.access === 'blocked') return false;
  if (t.streamable === false) return false;
  if (t.embeddable_by && t.embeddable_by !== 'all') return false;
  if (t.sharing === 'private') return false;
  if (t.state && t.state !== 'finished') return false;
  if (Array.isArray(t.media?.transcodings) && t.media.transcodings.length === 0) return false;
  if (!t.title) return false;
  return true;
}

async function fetchAllLikes(userId) {
  let next = `https://api-v2.soundcloud.com/users/${userId}/track_likes?limit=200&linked_partitioning=1`;
  const tracks = [];
  for (let page = 0; next && page < 25; page++) {
    const data = await v2(next);
    for (const item of data.collection ?? []) {
      const t = item.track ?? item;
      if (!t?.id || t.kind === 'playlist') continue;
      if (!isPlayable(t)) continue;
      tracks.push({
        id: t.id,
        title: t.title ?? '',
        artist: t.publisher_metadata?.artist || t.user?.username || '',
        url: t.permalink_url ?? '',
      });
    }
    next = data.next_href ?? null;
  }
  return tracks;
}

const app = express();

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '*';
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/likes', async (req, res) => {
  try {
    const m = String(req.query.url ?? '').trim().match(/soundcloud\.com\/([^/?#]+)/i);
    if (!m) return res.status(400).json({ error: 'Нужна ссылка на профиль SoundCloud' });

    const user = await v2(
      `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(`https://soundcloud.com/${m[1]}`)}`,
    );
    if (user.kind !== 'user') {
      return res.status(400).json({ error: 'Ссылка должна вести на профиль пользователя' });
    }
    const tracks = await fetchAllLikes(user.id);
    const seen = new Set();
    const unique = tracks.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
    if (!unique.length) {
      return res.status(404).json({ error: `Лайки «${m[1]}» не найдены. Возможно, они скрыты.` });
    }
    res.json(unique);
  } catch (e) {
    console.error(e);
    res.status(e.status === 404 ? 404 : 502).json({
      error: e.status === 404 ? 'Профиль не найден' : e.message,
    });
  }
});

// Раскрывает короткие ссылки (on.soundcloud.com/...): идёт по редиректам и возвращает итоговый адрес.
// Разрешены только известные короткие домены SoundCloud.
const SHORT_HOSTS = new Set(['on.soundcloud.com', 'soundcloud.app.goo.gl', 'snd.sc', 'www.snd.sc']);

app.get('/api/resolve', async (req, res) => {
  try {
    const raw = String(req.query.url ?? '').trim();
    const u = new URL(raw.includes('://') ? raw : `https://${raw}`);
    if (!SHORT_HOSTS.has(u.hostname.toLowerCase())) {
      return res.status(400).json({ error: 'Это не короткая ссылка SoundCloud' });
    }
    const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': UA } });
    const finalUrl = r.url;
    await r.body?.cancel();
    if (!finalUrl || finalUrl === u.href) {
      return res.status(502).json({ error: 'Короткая ссылка не раскрылась' });
    }
    res.json({ url: finalUrl });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'Не удалось раскрыть короткую ссылку' });
  }
});

/* ---------- Комнаты (WebSocket-ретранслятор) ---------- */
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 512 * 1024 });

const rooms = new Map(); // code -> { host, guests: Map<id, ws>, open }
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
let nextId = 1;

const send = (ws, obj) => {
  if (ws.readyState === 1) ws.send(JSON.stringify(obj));
};

function makeCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
  } while (rooms.has(code));
  return code;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (m.t === 'create' && !ws.room) {
      const code = makeCode();
      rooms.set(code, { host: ws, guests: new Map(), open: true });
      ws.room = code;
      ws.role = 'host';
      return send(ws, { t: 'created', code });
    }

    if (m.t === 'join' && !ws.room) {
      const code = String(m.code ?? '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { t: 'error', message: 'Комната не найдена' });
      if (!room.open) return send(ws, { t: 'error', message: 'Игра уже идёт — подключиться нельзя' });
      if (room.guests.size >= 5) return send(ws, { t: 'error', message: 'Комната заполнена' });

      const id = String(nextId++);
      const name = String(m.name ?? '').trim().slice(0, 20) || `Гость ${id}`;
      ws.room = code;
      ws.role = 'guest';
      ws.id = id;
      room.guests.set(id, ws);
      send(ws, { t: 'joined', id, name, code });
      return send(room.host, { t: 'guest_joined', id, name });
    }

    const room = ws.room && rooms.get(ws.room);
    if (!room) return;

    if (ws.role === 'host') {
      if (m.t === 'broadcast') room.guests.forEach((g) => send(g, { t: 'host_msg', data: m.data }));
      else if (m.t === 'set_open') room.open = !!m.open;
    } else if (m.t === 'to_host') {
      send(room.host, { t: 'guest_msg', id: ws.id, data: m.data });
    }
  });

  ws.on('close', () => {
    const room = ws.room && rooms.get(ws.room);
    if (!room) return;
    if (ws.role === 'host') {
      room.guests.forEach((g) => send(g, { t: 'room_closed' }));
      rooms.delete(ws.room);
    } else {
      room.guests.delete(ws.id);
      send(room.host, { t: 'guest_left', id: ws.id });
    }
  });
});

// держим соединения живыми (прокси часто рвут «тихие» подключения)
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

server.listen(PORT, () => console.log(`API и комнаты на http://localhost:${PORT}`));
