import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
import Icon from './Icon';
import ArtistTracksPanel from './ArtistTracksPanel';
import { ARTIST_PREFIX, BAD_PASSWORD, adminLogin, adminResetCover, adminSetCover, clearAdminKey, fetchArtists, hasAdminKey, saveArtistOrder, type ArtistInfo } from '../services/artistsApi';
import { ADMIN_LOGIN_EVENT } from '../services/adminLogin';
import '../styles/artists.css';

interface Props { urls: string[]; disabled: boolean; onAdd: (id: string) => void; }

const EDGE_PX = 80;
const EDGE_DWELL_MS = 300;
const MAX_SCROLL_PX = 20;

export default function ArtistCarousel({ urls, disabled, onAdd }: Props) {
  const [artists, setArtists] = useState<ArtistInfo[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [admin, setAdmin] = useState(hasAdminKey());
  const [adminError, setAdminError] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const pwRef = useRef<HTMLInputElement>(null);
  const artistsRef = useRef<ArtistInfo[]>([]);
  artistsRef.current = artists;
  const pendingRef = useRef(0);
  const dragCleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(() => { pendingRef.current = 0; }, [artists]);
  useEffect(() => () => dragCleanup.current?.(), []);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const load = async () => {
      try {
        const list = await fetchArtists();
        if (cancelled) return;
        if (!dragCleanup.current) setArtists(list);
        if (list.some(a => a.status === 'building') && ++tries < 60) timer = setTimeout(load, 5000);
      } catch {
        if (!cancelled && ++tries < 5) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);
  useEffect(() => {
    const open = () => { if (!hasAdminKey()) setLoginOpen(true); };
    window.addEventListener(ADMIN_LOGIN_EVENT, open);
    return () => window.removeEventListener(ADMIN_LOGIN_EVENT, open);
  }, []);
  useEffect(() => {
    if (!loginOpen) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pwRef.current?.focus({ preventScroll: true });
  }, [loginOpen]);

  const logout = () => { clearAdminKey(); setAdmin(false); setAdminError(''); setPanelId(null); setLoginOpen(false); setPassword(''); };
  const fail = (message: string) => {
    setAdminError(message);
    if (message === BAD_PASSWORD) logout();
  };
  const submitLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (!password || loginBusy) return;
    setLoginBusy(true);
    try {
      await adminLogin(password);
      setAdmin(true);
      setLoginOpen(false);
      setPassword('');
      setAdminError('');
    } catch (err) {
      setAdminError((err as Error).message);
    } finally {
      setLoginBusy(false);
    }
  };

  const moveArtist = (id: string, to: number) => setArtists(list => {
    const from = list.findIndex(a => a.id === id);
    if (from < 0 || from === to) return list;
    const next = [...list];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  });
  const restoreOrder = (ids: string[]) => setArtists(list => ids.map(id => list.find(a => a.id === id)).filter((a): a is ArtistInfo => !!a));
  const persistOrder = async (finalIds: string[], startIds: string[]) => {
    try {
      await saveArtistOrder(finalIds);
      setAdminError('');
    } catch (e) {
      restoreOrder(startIds);
      fail((e as Error).message);
    }
  };

  // Перетаскивание мышью: карточка «прилипает» к курсору, место выбирается по положению курсора среди всех карточек,
  // у края ленты после небольшой задержки включается автопрокрутка.
  const startPointer = (e: ReactPointerEvent<HTMLDivElement>, id: string) => {
    const row = rowRef.current;
    if (!admin || !row || e.button !== 0 || e.pointerType === 'touch' || dragCleanup.current) return;
    if ((e.target as HTMLElement).closest('button, label, input, a')) return;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const startX = e.clientX;
    const startY = e.clientY;
    const offX = startX - rect.left;
    const offY = startY - rect.top;
    const startIds = artistsRef.current.map(a => a.id);
    let x = startX;
    let y = startY;
    let dragging = false;
    let raf = 0;
    let edgeSince = 0;
    let ghost: HTMLElement | null = null;

    const place = () => {
      if (!ghost) return;
      ghost.style.left = `${x - offX}px`;
      ghost.style.top = `${y - offY}px`;
    };
    const tick = () => {
      const r = row.getBoundingClientRect();
      const toLeft = r.left + EDGE_PX - x;
      const toRight = x - (r.right - EDGE_PX);
      if (toLeft > 0 || toRight > 0) {
        const now = performance.now();
        if (!edgeSince) edgeSince = now;
        if (now - edgeSince > EDGE_DWELL_MS) {
          const k = Math.min(1, (toLeft > 0 ? toLeft : toRight) / EDGE_PX);
          row.scrollLeft += (toLeft > 0 ? -1 : 1) * MAX_SCROLL_PX * (0.25 + 0.75 * k);
        }
      } else {
        edgeSince = 0;
      }
      const waiting = pendingRef.current && performance.now() - pendingRef.current < 150;
      if (!waiting) {
        const others = Array.from(row.querySelectorAll<HTMLElement>('[data-artist-id]')).filter(el => el.dataset.artistId !== id);
        const to = others.filter(el => { const b = el.getBoundingClientRect(); return b.left + b.width / 2 < x; }).length;
        const from = artistsRef.current.findIndex(a => a.id === id);
        if (from >= 0 && to !== from) {
          pendingRef.current = performance.now();
          moveArtist(id, to);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    const begin = () => {
      dragging = true;
      ghost = card.cloneNode(true) as HTMLElement;
      ghost.classList.add('artist-ghost');
      ghost.removeAttribute('data-artist-id');
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      document.body.appendChild(ghost);
      row.classList.add('is-dragging');
      document.body.classList.add('artist-dragging');
      setDragId(id);
      place();
      raf = requestAnimationFrame(tick);
    };
    const onMove = (ev: PointerEvent) => {
      x = ev.clientX;
      y = ev.clientY;
      if (!dragging && Math.hypot(x - startX, y - startY) > 6) begin();
      place();
    };
    const finish = (cancel: boolean) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      cancelAnimationFrame(raf);
      ghost?.remove();
      row.classList.remove('is-dragging');
      document.body.classList.remove('artist-dragging');
      dragCleanup.current = null;
      setDragId(null);
      if (!dragging) return;
      const finalIds = artistsRef.current.map(a => a.id);
      if (cancel) { restoreOrder(startIds); return; }
      if (finalIds.join('|') !== startIds.join('|')) void persistOrder(finalIds, startIds);
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    dragCleanup.current = () => finish(true);
  };

  const refresh = async (id: string) => {
    setFailed(f => ({ ...f, [id]: false }));
    setArtists(await fetchArtists());
  };
  const changeCover = async (id: string, file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      await adminSetCover(id, file);
      await refresh(id);
      setAdminError('');
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const resetCover = async (id: string) => {
    setBusy(true);
    try {
      await adminResetCover(id);
      await refresh(id);
      setAdminError('');
    } catch (e) {
      fail((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!artists.length) return null;
  const panelArtist = panelId ? artists.find(a => a.id === panelId) : undefined;
  return (
    <div className='artists glass-inner'>
      <div className='artists-head'>Популярные артисты</div>
      <p className='artists-sub muted small'>Каталоги собираются из SoundCloud автоматически, а его модерация несовершенна, поэтому иногда попадаются ремиксы, ИИ-каверы и треки других исполнителей. Заметили лишнее — нажмите «Не тот трек» в игре.</p>
      {admin && <div className='muted small'>Режим админа: зажмите карточку мышью и перетащите на нужное место. У края ленты задержитесь — она пролистается сама.</div>}
      <div className='artists-row' role='list' ref={rowRef}>
        {artists.map(a => {
          const added = urls.includes(ARTIST_PREFIX + a.id);
          const art = failed[a.id] ? null : a.artwork;
          const cls = `artist-card${admin ? ' admin' : ''}${dragId === a.id ? ' dragging' : ''}`;
          return (
            <div
              key={a.id}
              data-artist-id={a.id}
              className={cls}
              role='listitem'
              onPointerDown={e => startPointer(e, a.id)}
              onDragStart={e => e.preventDefault()}
            >
              {art
                ? <img className='artist-art' src={art} alt='' draggable={false} referrerPolicy='no-referrer' onError={() => setFailed(f => ({ ...f, [a.id]: true }))} />
                : <div className='artist-art artist-art-ph'><Icon name='list' size={36} /></div>}
              <div className='artist-name'>{a.name}</div>
              <div className='artist-count'>{a.status === 'ready' ? `${a.count} треков` : a.status === 'building' ? 'Собираем треки…' : 'Не удалось собрать'}</div>
              <button className='btn btn-ghost' onClick={() => onAdd(a.id)} disabled={added || disabled || a.status === 'error'}>
                {added ? <><Icon name='check-circle' size={16} /> Добавлен</> : <><Icon name='plus' size={16} /> Добавить</>}
              </button>
              {admin && (
                <div className='artist-admin-actions'>
                  <button className='btn btn-ghost' onClick={() => setPanelId(panelId === a.id ? null : a.id)}>Треки</button>
                  <label className={`btn btn-ghost${busy ? ' is-disabled' : ''}`}>
                    Обложка
                    <input type='file' accept='image/*,.svg' hidden disabled={busy} onChange={e => { void changeCover(a.id, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {admin && panelArtist && (
        <ArtistTracksPanel
          artist={panelArtist}
          onClose={() => setPanelId(null)}
          onRemoved={id => setArtists(list => list.map(x => (x.id === id ? { ...x, count: Math.max(0, x.count - 1) } : x)))}
          onResetCover={id => { void resetCover(id); }}
          onError={fail}
        />
      )}
      {!admin && loginOpen && (
        <form className='admin-login' ref={formRef} onSubmit={submitLogin}>
          <input ref={pwRef} className='input' type='password' autoComplete='off' placeholder='Пароль администратора' value={password} onChange={e => setPassword(e.target.value)} />
          <button className='btn btn-primary' type='submit' disabled={!password || loginBusy}>{loginBusy ? 'Проверяем…' : 'Войти'}</button>
          <button className='btn btn-ghost' type='button' onClick={() => { setLoginOpen(false); setPassword(''); setAdminError(''); }}>Отмена</button>
        </form>
      )}
      {admin && <div className='artists-admin'><button className='chip' onClick={logout}>Выйти из режима админа</button></div>}
      {adminError && <div className='error'>{adminError}</div>}
    </div>
  );
}
