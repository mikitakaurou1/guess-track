import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import { adminDeleteTrack, fetchArtistPool, type ArtistInfo } from '../services/artistsApi';
import type { Track } from '../types/game';
import '../styles/artists.css';

interface Props {
  artist: ArtistInfo;
  onClose: () => void;
  onRemoved: (artistId: string) => void;
  onResetCover: (artistId: string) => void;
  onError: (message: string) => void;
}

export default function ArtistTracksPanel({ artist, onClose, onRemoved, onResetCover, onError }: Props) {
  const [tracks, setTracks] = useState<Track[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    setTracks(null);
    setError('');
    fetchArtistPool(artist.id)
      .then(list => { if (!cancelled) setTracks(list); })
      .catch(e => { if (!cancelled) setError((e as Error).message); });
    return () => { cancelled = true; };
  }, [artist.id]);
  const sorted = useMemo(() => (tracks ? [...tracks].sort((a, b) => a.title.localeCompare(b.title)) : null), [tracks]);
  const remove = async (t: Track) => {
    if (!confirm(`Удалить «${t.title}» из каталога «${artist.name}»?`)) return;
    setBusyId(t.id);
    try {
      await adminDeleteTrack(artist.id, t.id);
      setTracks(list => (list ? list.filter(x => x.id !== t.id) : list));
      onRemoved(artist.id);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };
  return (
    <div className='tracks-panel'>
      <div className='tracks-head'>
        <b>{artist.name}</b>
        <span className='muted small'>{tracks ? `${tracks.length} треков` : ''}</span>
        <div className='tracks-actions'>
          <button className='chip' onClick={() => onResetCover(artist.id)}>Сбросить обложку</button>
          <button className='chip' onClick={onClose}>Закрыть</button>
        </div>
      </div>
      {error && <div className='error'>{error}</div>}
      {!sorted && !error && <div className='muted small'>Загружаем список...</div>}
      {sorted && (
        <ol className='tracks-list' aria-label={`Треки ${artist.name}`}>
          {sorted.map(t => (
            <li key={t.id}>
              <div className='tracks-tx'>
                <a href={t.url} target='_blank' rel='noreferrer'>{t.title}</a>
                <div className='muted small'>{t.artist}</div>
              </div>
              <button className='btn btn-ghost' aria-label='Удалить трек' disabled={busyId === t.id} onClick={() => remove(t)}><Icon name='x' size={16} /></button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
