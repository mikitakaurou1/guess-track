import { useEffect, useState } from 'react';
import Icon from './Icon';
import ArtistTracksPanel from './ArtistTracksPanel';
import { ARTIST_PREFIX, BAD_PASSWORD, adminLogin, adminResetCover, adminSetCover, clearAdminKey, fetchArtists, hasAdminKey, saveArtistOrder, type ArtistInfo } from '../services/artistsApi';
import '../styles/artists.css';

interface Props { urls: string[]; disabled: boolean; onAdd: (id: string) => void; }

export default function ArtistCarousel({ urls, disabled, onAdd }: Props) {
  const [artists, setArtists] = useState<ArtistInfo[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [admin, setAdmin] = useState(hasAdminKey());
  const [adminError, setAdminError] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [panelId, setPanelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const load = async () => {
      try {
        const list = await fetchArtists();
        if (cancelled) return;
        setArtists(list);
        if (list.some(a => a.status === 'building') && ++tries < 60) timer = setTimeout(load, 5000);
      } catch {
        if (!cancelled && ++tries < 5) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);
  const logout = () => { clearAdminKey(); setAdmin(false); setAdminError(''); setPanelId(null); };
  const fail = (message: string) => {
    setAdminError(message);
    if (message === BAD_PASSWORD) logout();
  };
  const login = async () => {
    const password = window.prompt('Пароль администратора');
    if (!password) return;
    try {
      await adminLogin(password);
      setAdmin(true);
      setAdminError('');
    } catch (e) {
      setAdminError((e as Error).message);
    }
  };
  const reorder = async (from: number, to: number) => {
    if (from === to) return;
    const prev = artists;
    const next = [...artists];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setArtists(next);
    try {
      await saveArtistOrder(next.map(a => a.id));
      setAdminError('');
    } catch (e) {
      setArtists(prev);
      fail((e as Error).message);
    }
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
      <div className='artists-head'>Артисты: все треки, где они в авторах или в названии</div>
      {admin && <div className='muted small'>Режим админа: перетаскивайте карточки мышью, чтобы поменять порядок.</div>}
      <div className='artists-row' role='list'>
        {artists.map((a, i) => {
          const added = urls.includes(ARTIST_PREFIX + a.id);
          const art = failed[a.id] ? null : a.artwork;
          const cls = `artist-card${dragIndex === i ? ' dragging' : ''}${admin && dragIndex !== null && overIndex === i && dragIndex !== i ? ' drop-target' : ''}`;
          return (
            <div
              key={a.id}
              className={cls}
              role='listitem'
              draggable={admin}
              onDragStart={e => { setDragIndex(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', a.id); }}
              onDragOver={e => { if (dragIndex === null) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOverIndex(i); }}
              onDrop={e => { e.preventDefault(); if (dragIndex !== null) void reorder(dragIndex, i); setDragIndex(null); setOverIndex(null); }}
              onDragEnd={() => { setDragIndex(null); setOverIndex(null); }}
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
      <div className='artists-admin'>
        {admin
          ? <button className='chip' onClick={logout}>Выйти из режима админа</button>
          : <button className='chip' onClick={login}>Админ</button>}
      </div>
      {adminError && <div className='error'>{adminError}</div>}
    </div>
  );
}
