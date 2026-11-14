import { useEffect, useState } from 'react';
import Icon from './Icon';
import { ARTIST_PREFIX, BAD_PASSWORD, adminLogin, clearAdminKey, fetchArtists, hasAdminKey, saveArtistOrder, type ArtistInfo } from '../services/artistsApi';
import '../styles/artists.css';

interface Props { urls: string[]; disabled: boolean; onAdd: (id: string) => void; }

export default function ArtistCarousel({ urls, disabled, onAdd }: Props) {
  const [artists, setArtists] = useState<ArtistInfo[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  const [admin, setAdmin] = useState(hasAdminKey());
  const [adminError, setAdminError] = useState('');
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
  const logout = () => { clearAdminKey(); setAdmin(false); setAdminError(''); };
  const move = async (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= artists.length) return;
    const prev = artists;
    const next = [...artists];
    [next[i], next[j]] = [next[j], next[i]];
    setArtists(next);
    try {
      await saveArtistOrder(next.map(a => a.id));
      setAdminError('');
    } catch (e) {
      setArtists(prev);
      const message = (e as Error).message;
      setAdminError(message);
      if (message === BAD_PASSWORD) logout();
    }
  };
  if (!artists.length) return null;
  return (
    <div className='artists glass-inner'>
      <div className='artists-head'>Артисты: все треки, где они в авторах или в названии</div>
      <div className='artists-row' role='list'>
        {artists.map((a, i) => {
          const added = urls.includes(ARTIST_PREFIX + a.id);
          const art = failed[a.id] ? null : a.artwork;
          return (
            <div key={a.id} className='artist-card' role='listitem'>
              {art
                ? <img className='artist-art' src={art} alt='' referrerPolicy='no-referrer' onError={() => setFailed(f => ({ ...f, [a.id]: true }))} />
                : <div className='artist-art artist-art-ph'><Icon name='list' size={36} /></div>}
              <div className='artist-name'>{a.name}</div>
              <div className='artist-count'>{a.status === 'ready' ? `${a.count} треков` : a.status === 'building' ? 'Собираем треки…' : 'Не удалось собрать'}</div>
              <button className='btn btn-ghost' onClick={() => onAdd(a.id)} disabled={added || disabled || a.status === 'error'}>
                {added ? <><Icon name='check-circle' size={16} /> Добавлен</> : <><Icon name='plus' size={16} /> Добавить</>}
              </button>
              {admin && (
                <div className='artist-move'>
                  <button className='btn btn-ghost' aria-label='Левее' onClick={() => move(i, -1)} disabled={i === 0}><span className='flip'><Icon name='arrow-right' size={16} /></span></button>
                  <button className='btn btn-ghost' aria-label='Правее' onClick={() => move(i, 1)} disabled={i === artists.length - 1}><Icon name='arrow-right' size={16} /></button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div className='artists-admin'>
        {admin
          ? <><span className='muted small'>Режим админа: стрелки меняют порядок карточек</span><button className='chip' onClick={logout}>Выйти</button></>
          : <button className='chip' onClick={login}>Админ</button>}
      </div>
      {adminError && <div className='error'>{adminError}</div>}
    </div>
  );
}
