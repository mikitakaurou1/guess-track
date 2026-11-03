export type ScKind = 'profile' | 'likes' | 'playlist' | 'track' | 'unsupported';

export interface ScParsed {
  kind: ScKind;
  url: string; // каноническая ссылка
  short?: boolean; // короткая ссылка (on.soundcloud.com и т.п.): сначала нужно раскрыть через сервер
  reason?: string; // почему ссылка не подходит
}

const MAIN_HOSTS = new Set([
  'soundcloud.com',
  'www.soundcloud.com',
  'm.soundcloud.com',
  'mobile.soundcloud.com',
  'mobi.soundcloud.com',
]);

const SHORT_HOSTS = new Set(['on.soundcloud.com', 'soundcloud.app.goo.gl', 'snd.sc', 'www.snd.sc']);

// Первые сегменты пути, которые не являются именем пользователя
const RESERVED = new Set([
  'discover', 'stream', 'you', 'upload', 'search', 'charts', 'feed', 'pages', 'people', 'popular',
  'tags', 'terms-of-use', 'jobs', 'imprint', 'mobile', 'settings', 'messages', 'notifications',
  'download', 'creator', 'go', 'pro', 'next', 'stations', 'trending',
]);

// Вкладки профиля: soundcloud.com/user/tracks, /albums, /sets, /reposts ...
const PROFILE_TABS = new Set([
  'tracks', 'popular-tracks', 'albums', 'sets', 'reposts', 'spotlight',
  'following', 'followers', 'comments', 'playlists', 'insights',
]);

function bad(reason: string): ScParsed {
  return { kind: 'unsupported', url: '', reason };
}

// Разбирает любую ссылку SoundCloud и приводит её к каноническому виду.
// Поддерживается: soundcloud.com, www./m./mobile., короткие on.soundcloud.com, встраиваемый плеер
// w.soundcloud.com/player/?url=..., api.soundcloud.com/tracks|playlists/ID, секретные ссылки (s-...),
// ссылки с ?si=, ?utm_..., вкладки профиля и трек внутри плейлиста (?in=...).
export function parseSoundCloudUrl(raw: string, depth = 0): ScParsed | null {
  let s = raw.trim();
  if (!s) return null;
  if (s.startsWith('//')) s = 'https:' + s;
  if (!s.includes('://')) s = 'https://' + s;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();

  if (SHORT_HOSTS.has(host)) {
    return { kind: 'unsupported', url: `https://${host}${u.pathname}`, short: true };
  }

  if (host === 'w.soundcloud.com') {
    const inner = u.searchParams.get('url');
    if (inner && depth < 3) return parseSoundCloudUrl(inner, depth + 1);
    return bad('В ссылке на плеер нет адреса трека или плейлиста');
  }

  if (host === 'api.soundcloud.com') {
    const parts = u.pathname.split('/').filter(Boolean);
    const secret = u.searchParams.get('secret_token');
    const tail = secret ? `?secret_token=${secret}` : '';
    if (parts[0] === 'tracks' && parts[1]) {
      return { kind: 'track', url: `https://api.soundcloud.com/tracks/${parts[1]}${tail}` };
    }
    if (parts[0] === 'playlists' && parts[1]) {
      return { kind: 'playlist', url: `https://api.soundcloud.com/playlists/${parts[1]}${tail}` };
    }
    return bad('Ссылки api.soundcloud.com поддерживаются только для треков и плейлистов');
  }

  if (!MAIN_HOSTS.has(host)) return null;

  const parts = u.pathname.split('/').filter(Boolean);
  if (!parts.length) {
    return bad('Это главная страница SoundCloud: вставьте ссылку на профиль или плейлист');
  }

  const user = parts[0];
  if (RESERVED.has(user.toLowerCase())) {
    return bad(
      user.toLowerCase() === 'you'
        ? 'Ссылки вида soundcloud.com/you/... требуют входа в аккаунт: вставьте ссылку на публичный профиль (soundcloud.com/ВАШ_ЛОГИН)'
        : `Страница «${user}» не подходит: нужен профиль или плейлист`,
    );
  }

  const base = `https://soundcloud.com/${user}`;
  const secret = u.searchParams.get('secret_token');

  if (parts.length === 1) return { kind: 'profile', url: base };

  const second = parts[1].toLowerCase();

  if (parts.length === 2) {
    if (second === 'likes') return { kind: 'likes', url: base };
    if (PROFILE_TABS.has(second)) return { kind: 'profile', url: base };

    // трек, открытый из плейлиста: soundcloud.com/user/track?in=user/sets/name
    const inParam = u.searchParams.get('in');
    if (inParam && depth < 3) {
      const inner = parseSoundCloudUrl(`https://soundcloud.com/${inParam}`, depth + 1);
      if (inner?.kind === 'playlist') return inner;
    }
    return { kind: 'track', url: `${base}/${parts[1]}${secret ? `/${secret}` : ''}` };
  }

  if (second === 'sets' || second === 'albums') {
    const token = parts[3]?.startsWith('s-') ? parts[3] : secret;
    return { kind: 'playlist', url: `${base}/sets/${parts[2]}${token ? `/${token}` : ''}` };
  }

  if (parts.length === 3) {
    const third = parts[2].toLowerCase();
    if (third.startsWith('s-')) return { kind: 'track', url: `${base}/${parts[1]}/${parts[2]}` }; // секретный трек
    if (['recommended', 'comments', 'likes', 'reposts'].includes(third)) {
      return { kind: 'track', url: `${base}/${parts[1]}` };
    }
  }

  return bad('Не удалось понять, на что ведёт ссылка: нужен профиль, лайки или плейлист');
}
