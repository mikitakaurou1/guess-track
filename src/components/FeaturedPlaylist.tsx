import { useEffect, useState } from 'react';
import Icon from './Icon';
import { fetchPlaylistInfo, readCachedInfo, type PlaylistInfo } from '../services/playlistInfo';

interface Props { url: string; fallbackTitle: string; fallbackCreator: string; added: boolean; disabled: boolean; onAdd: () => void; }

const cache = new Map<string, PlaylistInfo>();

export default function FeaturedPlaylist({ url, fallbackTitle, fallbackCreator, added, disabled, onAdd }: Props) {
  const [info, setInfo] = useState<PlaylistInfo | null>(cache.get(url) ?? readCachedInfo(url));
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    if (cache.has(url)) return;
    let cancelled = false;
    fetchPlaylistInfo(url, () => cancelled)
      .then((i) => {
        if (cancelled) return;
        if (i.artwork) cache.set(url, i);
        setInfo((prev) => ({ ...i, artwork: i.artwork ?? prev?.artwork ?? null, tracks: i.tracks ?? prev?.tracks }));
        setImgFailed(false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  const title = info?.title || fallbackTitle;
  const creator = info?.creator || fallbackCreator;
  const art = imgFailed ? null : info?.artwork ?? null;
  const tracks = info?.tracks ?? [];
  return (
    <div className={`pl-card glass-inner${tracks.length ? ' has-tracks' : ''}`}>
      {art
        ? <img className='pl-art' src={art} alt='' referrerPolicy='no-referrer' onError={() => setImgFailed(true)} />
        : <div className='pl-art pl-art-ph'><Icon name='list' size={40} /></div>}
      <div className='pl-info'>
        <div className='pl-title'><a href={url} target='_blank' rel='noreferrer'>{title}</a></div>
        <div className='pl-creator'>{creator}</div>
        <button className='btn btn-ghost pl-add' onClick={onAdd} disabled={added || disabled}>
          {added ? <><Icon name='check-circle' size={16} /> Добавлен</> : <><Icon name='plus' size={16} /> Добавить</>}
        </button>
      </div>
      {tracks.length > 0 && (
        <div className='pl-tracks'>
          <div className='pl-tracks-head'>Треки · {tracks.length}</div>
          <ol className='pl-track-list' tabIndex={0} aria-label='Треки плейлиста'>
            {tracks.map((t, i) => (
              <li key={i} className='pl-track'>
                <span className='pl-n'>{i + 1}</span>
                <div className='pl-tx'>
                  <div className='pl-tt'>{t.title}</div>
                  {t.artist && <div className='pl-ta'>{t.artist}</div>}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
