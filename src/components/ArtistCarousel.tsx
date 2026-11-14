import { useEffect, useState } from 'react';
import Icon from './Icon';
import { ARTIST_PREFIX, fetchArtists, type ArtistInfo } from '../services/artistsApi';
import '../styles/artists.css';

interface Props { urls: string[]; disabled: boolean; onAdd: (id: string) => void; }

export default function ArtistCarousel({ urls, disabled, onAdd }: Props) {
  const [artists, setArtists] = useState<ArtistInfo[]>([]);
  const [failed, setFailed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;
    const load = async () => {
      try {
        const list = await fetchArtists();
        if (cancelled) return;
        setArtists(list);
        if (list.some(a => a.status === 'building') && ++tries < 40) timer = setTimeout(load, 4000);
      } catch {
        if (!cancelled && ++tries < 5) timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, []);
  if (!artists.length) return null;
  return (
    <div className='artists glass-inner'>
      <div className='artists-head'>Артисты: все треки, где они в авторах или в названии</div>
      <div className='artists-row' role='list'>
        {artists.map(a => {
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
