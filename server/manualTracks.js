import fs from 'node:fs';
import path from 'node:path';

export function createManualTracks(blocklistFile) {
  const file = process.env.MANUAL_TRACKS_FILE ?? path.join(path.dirname(blocklistFile), 'manual-tracks.json');
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid manual track storage');
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  return {
    list(id) { return Object.values(data[id] ?? {}); },
    put(id, track) {
      const next = { ...data, [id]: { ...(data[id] ?? {}), [track.id]: track } };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temp = `${file}.tmp`;
      try {
        fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
        fs.renameSync(temp, file);
      } catch (e) {
        try { fs.unlinkSync(temp); } catch { /* no temp */ }
        throw e;
      }
      data = next;
    },
  };
}

export function validateTrackUrl(raw) {
  let u;
  try { u = new URL(String(raw ?? '').trim()); } catch { throw new Error('Нужна полная HTTPS-ссылка на трек SoundCloud'); }
  if (u.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(u.hostname) || u.username || u.password || u.port) {
    throw new Error('Нужна прямая HTTPS-ссылка soundcloud.com/исполнитель/трек (не короткая ссылка)');
  }
  return `https://soundcloud.com${u.pathname}`;
}

export function validateArtwork(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return undefined;
  if (value.startsWith('data:')) {
    const m = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!m) throw new Error('Нужна растровая картинка PNG, JPEG, WebP или GIF');
    const buf = Buffer.from(m[2], 'base64');
    if (!buf.length || buf.length > 1.5 * 1024 * 1024) throw new Error('Обложка должна быть не больше 1,5 МБ');
    const valid = m[1] === 'png' ? buf.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : m[1] === 'jpeg' ? buf[0] === 255 && buf[1] === 216 && buf[2] === 255
      : m[1] === 'gif' ? /^GIF8[79]a$/.test(buf.subarray(0, 6).toString())
      : buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP';
    if (!valid) throw new Error('Содержимое файла не соответствует формату картинки');
    return value;
  }
  let u;
  try { u = new URL(value); } catch { throw new Error('Нужна HTTPS-ссылка на обложку'); }
  if (u.protocol !== 'https:' || u.username || u.password || value.length > 2048) throw new Error('Нужна HTTPS-ссылка на обложку');
  return u.href;
}

export function requirePlayableTrack(t) {
  if (t?.kind !== 'track' || !Number.isSafeInteger(t.id) || t.id <= 0) throw new Error('Ссылка должна вести на один трек, не на профиль или плейлист');
  if (t.streamable !== true || t.embeddable_by !== 'all' || t.sharing !== 'public' || t.state !== 'finished') {
    throw new Error('SoundCloud не подтверждает доступность полного трека для встроенного плеера');
  }
  if ((t.policy && t.policy !== 'ALLOW') || (t.access && t.access !== 'playable')) throw new Error('Трек заблокирован или доступен только как превью');
  const ms = t.full_duration ?? t.duration ?? 0;
  if (ms < 45_000 || ms > 600_000) throw new Error('Длительность трека должна быть от 45 секунд до 10 минут');
  if (t.full_duration && t.duration && t.duration < t.full_duration - 2000) throw new Error('Доступно только превью трека');
  if (!t.media?.transcodings?.length) throw new Error('SoundCloud не вернул поток для воспроизведения');
}
