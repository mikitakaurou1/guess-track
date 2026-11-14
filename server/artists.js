// Каталоги артистов: ищем треки, где артист в авторах или в названии; убираем ремиксы и дубли.
// Чтобы добавить артиста, допишите объект в ARTISTS.
// blacklist: id треков, которые нужно убрать всегда; whitelist: id треков, которые не проверяются на «лишние» слова (ремикс и т.п.).
export const ARTISTS = [
  { id: 'kai-angel', name: 'Kai Angel', aliases: ['kai angel', 'кай энджел', 'кай ангел', 'каи энджел'], blacklist: [], whitelist: [] },
  { id: 'madk1d', name: 'madk1d', aliases: ['madk1d', 'madkid', 'мэдкид', 'мадкид'], blacklist: [], whitelist: [] },
];

const TTL_MS = 12 * 60 * 60 * 1000;
const RETRY_AFTER_FAIL_MS = 60 * 1000;
const MIN_MS = 45_000;
const MAX_MS = 10 * 60 * 1000;

const norm = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-z0-9а-я]+/g, ' ').trim();
const compact = (s) => norm(s).replace(/ /g, '');

const STOP_PHRASES = [
  'remix', 'rmx', 'refix', 'bootleg', 'mashup', 'cover', 'reupload', 're upload', 'speed up', 'sped up', 'speedup', 'slowed', 'reverb',
  'bass boost', 'bassboost', 'nightcore', '8d', '16d', 'instrumental', 'acapella', 'a cappella', 'karaoke', 'type beat', 'hood track',
  'tiktok', 'snippet', 'preview', 'teaser', 'mix',
  'ремикс', 'рефикс', 'бутлег', 'мэшап', 'мешап', 'кавер', 'перезалив', 'спид ап', 'спидап', 'реверб', 'бас буст', 'басс буст', 'бассбуст',
  'найткор', 'инструментал', 'минус', 'акапелла', 'караоке', 'худ трек', 'худтрек', 'сниппет', 'превью', 'тизер', 'тикток',
];
const STOP_STEMS = ['ускорен', 'замедлен', 'ремикс', 'перезалит', 'reupload'];

function isStopped(title) {
  const n = ` ${norm(title)} `;
  return STOP_PHRASES.some((p) => n.includes(` ${p} `)) || STOP_STEMS.some((s) => n.includes(s));
}

const NOISE = new Set(['official', 'audio', 'video', 'lyrics', 'lyric', 'visualizer', 'hd', 'new', 'single', 'prod', 'by', 'explicit', 'clean', 'album', 'ep', 'премьера', 'клип', 'аудио', 'новинка', 'альбом']);

// Ключ для поиска одинаковых треков: название без скобок, фита, продюсера, имени артиста и «шума»
function dupKey(title, aliases) {
  let s = String(title ?? '').toLowerCase().replace(/ё/g, 'е');
  s = s.replace(/\([^)]*\)|\[[^\]]*\]|\{[^}]*\}/g, ' ');
  s = s.replace(/\b(feat|ft|featuring|prod)\b\.?.*$/, ' ');
  for (const a of aliases) s = s.split(a).join(' ');
  const key = norm(s).split(' ').filter((t) => t && !NOISE.has(t)).join('');
  return key.length >= 2 ? key : compact(title);
}

const big = (u) => (u ? String(u).replace('-large', '-t300x300') : null);

async function pages(v2, first, max) {
  const out = [];
  let next = first;
  for (let i = 0; next && i < max; i++) {
    let data;
    try {
      data = await v2(next);
    } catch (e) {
      console.error('Каталог артиста: ошибка страницы:', e.message);
      break;
    }
    for (const item of data.collection ?? []) {
      const t = item.track ?? item;
      if (t?.id && (t.kind === 'track' || !t.kind)) out.push(t);
    }
    next = data.next_href ?? null;
  }
  return out;
}

async function build(def, v2) {
  const aliasesC = def.aliases.map(compact);
  const own = new Set();
  let avatar = null;
  let bestFollowers = -1;
  const raw = [];

  for (const a of def.aliases.slice(0, 2)) {
    try {
      const r = await v2(`https://api-v2.soundcloud.com/search/users?q=${encodeURIComponent(a)}&limit=10`);
      for (const u of r.collection ?? []) {
        if (!u?.id || own.has(u.id) || !aliasesC.includes(compact(u.username))) continue;
        own.add(u.id);
        if ((u.followers_count ?? 0) > bestFollowers) { bestFollowers = u.followers_count ?? 0; avatar = big(u.avatar_url); }
      }
    } catch (e) {
      console.error(`Каталог артиста: профиль «${a}»:`, e.message);
    }
  }
  for (const id of [...own].slice(0, 3)) {
    raw.push(...(await pages(v2, `https://api-v2.soundcloud.com/users/${id}/tracks?limit=200&linked_partitioning=1`, 10)));
  }
  const found = await Promise.all(
    def.aliases.map((a) => pages(v2, `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(a)}&limit=200&linked_partitioning=1`, 6)),
  );
  found.forEach((list) => raw.push(...list));

  const isOwned = (t) =>
    own.has(t.user?.id) || aliasesC.includes(compact(t.user?.username)) || aliasesC.some((a) => compact(t.publisher_metadata?.artist).includes(a));
  const isRelated = (t) => isOwned(t) || aliasesC.some((a) => compact(t.title).includes(a));

  const byId = new Map();
  for (const t of raw) byId.set(t.id, t);

  const best = new Map();
  for (const t of byId.values()) {
    if (def.blacklist?.includes(t.id)) continue;
    if (t.policy === 'BLOCK' || t.policy === 'SNIP' || t.access === 'blocked' || t.access === 'preview') continue;
    const ms = t.full_duration ?? t.duration ?? 0;
    if (ms < MIN_MS || ms > MAX_MS) continue;
    if (!def.whitelist?.includes(t.id) && isStopped(t.title)) continue;
    if (!isRelated(t)) continue;
    const key = dupKey(t.title, def.aliases);
    const score = (isOwned(t) ? 1e12 : 0) + (t.playback_count ?? 0);
    const cur = best.get(key);
    if (!cur || score > cur.score) best.set(key, { t, score });
  }

  const entries = [...best.values()];
  if (!entries.length) throw new Error('Треки не найдены');
  const top = [...entries].sort((a, b) => b.score - a.score).find((x) => x.t.artwork_url);
  const tracks = entries.map(({ t }) => ({
    id: t.id,
    title: t.title ?? '',
    artist: t.publisher_metadata?.artist || t.user?.username || '',
    url: t.permalink_url ?? '',
    artwork: big(t.artwork_url || t.user?.avatar_url) ?? undefined,
  }));
  return { tracks, artwork: avatar ?? big(top?.t.artwork_url) };
}

const state = new Map(ARTISTS.map((def) => [def.id, { def, tracks: null, artwork: null, at: 0, failedAt: 0, promise: null }]));

function ensure(s, v2) {
  if (s.promise) return s.promise;
  const fresh = s.tracks && Date.now() - s.at <= TTL_MS;
  if (fresh) return Promise.resolve();
  if (s.failedAt && Date.now() - s.failedAt < RETRY_AFTER_FAIL_MS) return Promise.resolve();
  s.promise = build(s.def, v2)
    .then((r) => {
      s.tracks = r.tracks;
      s.artwork = r.artwork;
      s.at = Date.now();
      s.failedAt = 0;
      console.log(`Каталог «${s.def.name}»: ${r.tracks.length} треков`);
    })
    .catch((e) => {
      s.failedAt = Date.now();
      console.error(`Каталог «${s.def.name}» не собран:`, e.message);
    })
    .finally(() => { s.promise = null; });
  return s.promise;
}

const info = (s) => ({
  id: s.def.id,
  name: s.def.name,
  artwork: s.artwork,
  count: s.tracks?.length ?? 0,
  status: s.tracks ? 'ready' : s.promise || !s.failedAt ? 'building' : 'error',
});

export function registerArtistRoutes(app, v2) {
  app.get('/api/artists', (req, res) => {
    state.forEach((s) => { void ensure(s, v2); });
    res.json([...state.values()].map(info));
  });

  app.get('/api/artist-pool', async (req, res) => {
    const s = state.get(String(req.query.id ?? ''));
    if (!s) return res.status(404).json({ error: 'Артист не найден' });
    if (s.tracks) {
      void ensure(s, v2);
      return res.json(s.tracks);
    }
    await ensure(s, v2);
    if (!s.tracks) return res.status(502).json({ error: `Не удалось собрать треки «${s.def.name}». Попробуйте через минуту.` });
    res.json(s.tracks);
  });

  (async () => {
    for (const s of state.values()) await ensure(s, v2);
  })();
}
