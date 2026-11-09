import { useEffect, useState } from 'react';
import Icon from './Icon';
import { fetchPlaylistInfo, type PlaylistInfo } from '../services/playlistInfo';

interface Props { url: string; fallbackTitle: string; fallbackCreator: string; added: boolean; disabled: boolean; onAdd: () => void; }

const cache = new Map<string, PlaylistInfo>(); // чтобы не запрашивать заново при возврате на экран

// Карточка готового плейлиста: слева обложка, справа название, автор и внизу кнопка «Добавить».
// Если данные не пришли с сервера, показываем запасные.
export default function FeaturedPlaylist({ url, fallbackTitle, fallbackCreator, added, disabled, onAdd }: Props) {
  const [info, setInfo] = useState<PlaylistInfo | null>(cache.get(url) ?? null);
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    if (cache.has(url)) return;
    let cancelled = false;
    fetchPlaylistInfo(url)
      .then((i) => { cache.set(url, i); if (!cancelled) setInfo(i); })
      .catch(() => { /* остаёмся на запасных данных */ });
    return () => { cancelled = true; };
  }, [url]);
  const title = info?.title || fallbackTitle;
  const creator = info?.creator || fallbackCreator;
  const art = imgFailed ? null : info?.artwork ?? null;
  return (
    <div className='pl-card glass-inner'>
      {art
        ? <img className='pl-art' src={art} alt='' loading='lazy' referrerPolicy='no-referrer' onError={() => setImgFailed(true)} />
        : <div className='pl-art pl-art-ph'><Icon name='list' size={40} /></div>}
      <div className='pl-info'>
        <div className='pl-text'>
          <div className='pl-title'><a href={url} target='_blank' rel='noreferrer'>{title}</a></div>
          <div className='pl-creator'>{creator}</div>
        </div>
        <button className='btn btn-ghost pl-add' onClick={onAdd} disabled={added || disabled}>
          {added ? <><Icon name='check-circle' size={16} /> Добавлен</> : <><Icon name='plus' size={16} /> Добавить</>}
        </button>
      </div>
    </div>
  );
}
