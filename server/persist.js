// Хранит папку с данными сервера (правки админа, обложки, порядок артистов) в Supabase,
// чтобы они переживали перезапуски и деплои Render. Должен импортироваться первым в server/index.js:
// модули данных читают файлы при загрузке, а здесь папка сначала восстанавливается из базы.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const TABLE = 'guesstrack_files';
const POLL_MS = 2000;
export const DATA_DIR = path.dirname(process.env.BLOCKLIST_FILE ?? path.join(path.dirname(fileURLToPath(import.meta.url)), 'data', 'blocked.json'));

const known = new Map();
let busy = false;

// Новые ключи sb_secret_... не JWT: они отправляются только в apikey. Старый service_role (JWT) дублируется в Authorization.
const authHeaders = () => (KEY.startsWith('sb_') ? { apikey: KEY } : { apikey: KEY, Authorization: `Bearer ${KEY}` });

async function api(query, init = {}) {
  const r = await fetch(`${BASE}/rest/v1/${TABLE}${query}`, {
    ...init,
    headers: { ...authHeaders(), 'content-type': 'application/json', ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!r.ok) throw new Error(`Supabase ответил ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

const sigOf = (st) => `${st.size}:${Math.round(st.mtimeMs)}`;

function scan() {
  const out = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (e.isFile() && !e.name.endsWith('.tmp')) {
        out.set(path.relative(DATA_DIR, abs).split(path.sep).join('/'), { abs, sig: sigOf(fs.statSync(abs)) });
      }
    }
  };
  walk(DATA_DIR);
  return out;
}

function localPath(rel) {
  const root = path.resolve(DATA_DIR);
  const abs = path.resolve(root, rel);
  return abs.startsWith(root + path.sep) ? abs : null;
}

async function restore() {
  const rows = await (await api('?select=path,content_base64&order=path')).json();
  for (const row of rows) {
    const abs = localPath(String(row.path));
    if (!abs) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Buffer.from(String(row.content_base64), 'base64'));
    known.set(String(row.path), sigOf(fs.statSync(abs)));
  }
  return rows.length;
}

async function upload(rel, item) {
  const buf = fs.readFileSync(item.abs);
  await api('?on_conflict=path', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ path: rel, content_base64: buf.toString('base64'), updated_at: new Date().toISOString() }),
  });
  known.set(rel, item.sig);
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    let files;
    try { files = scan(); } catch (e) { if (e.code === 'ENOENT') return; throw e; }
    for (const [rel, item] of files) {
      if (known.get(rel) === item.sig) continue;
      try { await upload(rel, item); } catch (e) { console.error(`Не удалось сохранить «${rel}» в Supabase:`, e.message); }
    }
    for (const rel of [...known.keys()]) {
      if (files.has(rel)) continue;
      try { await api(`?path=eq.${encodeURIComponent(rel)}`, { method: 'DELETE' }); known.delete(rel); }
      catch (e) { console.error(`Не удалось удалить «${rel}» из Supabase:`, e.message); }
    }
  } catch (e) {
    console.error('Синхронизация с Supabase:', e.message);
  } finally {
    busy = false;
  }
}

async function start() {
  if (!BASE || !KEY) {
    console.warn('SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY не заданы: правки админа хранятся только на диске сервера и пропадут при деплое');
    return;
  }
  let restored = false;
  for (let attempt = 1; attempt <= 4 && !restored; attempt++) {
    try {
      const n = await restore();
      restored = true;
      console.log(`Supabase: восстановлено файлов: ${n}`);
    } catch (e) {
      console.error(`Supabase: восстановление не удалось (попытка ${attempt}):`, e.message);
      if (attempt < 4) await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
  if (!restored) {
    console.error('Supabase недоступен: синхронизация выключена, чтобы не затереть сохранённые данные. Правки живут только на диске сервера');
    return;
  }
  setInterval(() => { void tick(); }, POLL_MS).unref();
  process.once('SIGTERM', () => {
    setTimeout(() => process.exit(0), 10_000).unref();
    void tick().finally(() => process.exit(0));
  });
  void tick();
}

await start();
