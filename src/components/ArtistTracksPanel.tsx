import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Icon from './Icon';
import { adminDeleteTrack, adminEditArtistTrack, fetchArtistPool, type ArtistInfo } from '../services/artistsApi';
import { API_BASE } from '../config';
import { imageFileToJpegDataUrl } from '../utils/imageData';
import { notifyCatalogChanged } from '../utils/catalogEvents';
import type { Track } from '../types/game';
import '../styles/artists.css';

type ListedTrack = Track & { manual?: boolean };
interface Props {
  artist: ArtistInfo;
  onClose: () => void;
  onRemoved: (artistId: string) => void;
  onResetCover: (artistId: string) => void;
  onError: (message: string) => void;
}
const clipUrl = (id?: string) => (id ? `https://youtu.be/${id}` : '');
export default function ArtistTracksPanel({ artist, onClose, onRemoved, onResetCover, onError }: Props) {
  const [tracks, setTracks] = useState<ListedTrack[] | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [performer, setPerformer] = useState(artist.name);
  const [url, setUrl] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [eTitle, setETitle] = useState('');
  const [eArtist, setEArtist] = useState('');
  const [eCover, setECover] = useState('');
  const [eClip, setEClip] = useState('');
  const [eFile, setEFile] = useState<File | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const currentArtist = useRef(artist.id); currentArtist.current = artist.id;
  const version = useRef(0);
  useEffect(() => {
    let cancelled = false;
    const revision = ++version.current;
    setTracks(null); setError(''); setSaved(''); setFormOpen(false); setTitle(''); setPerformer(artist.name); setUrl(''); setCoverUrl(''); setFile(null); setEditId(null);
    fetchArtistPool(artist.id)
      .then(list => { if (!cancelled && version.current === revision) setTracks(list); })
      .catch(e => { if (!cancelled && version.current === revision) setError((e as Error).message); });
    return () => { cancelled = true; version.current++; };
  }, [artist.id, artist.name]);
  const sorted = useMemo(() => tracks ? [...tracks].sort((a, b) => a.title.localeCompare(b.title)) : null, [tracks]);
  const remove = async (t: ListedTrack) => {
    if (!confirm(`Удалить «${t.title}» из каталога «${artist.name}»?`)) return;
    const id = artist.id;
    setBusyId(t.id);
    try {
      await adminDeleteTrack(id, t.id);
      if (currentArtist.current === id) { version.current++; setTracks(list => list ? list.filter(x => x.id !== t.id) : list); }
      onRemoved(id);
      notifyCatalogChanged();
    } catch (e) { onError((e as Error).message); }
    finally { setBusyId(null); }
  };
  const startEdit = (t: ListedTrack) => {
    setEditId(t.id); setETitle(t.title); setEArtist(t.artist); setECover(''); setEClip(clipUrl(t.clip)); setEFile(null); setError('');
  };
  const refresh = async (id: string) => {
    const fresh = await fetchArtistPool(id);
    if (currentArtist.current === id) { version.current++; setTracks(fresh); setEditId(null); }
    notifyCatalogChanged();
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    const t = tracks?.find(x => x.id === editId);
    if (!t || editBusy) return;
    const id = artist.id; setEditBusy(true); setError('');
    try {
      const patch: { title?: string; artist?: string; artwork?: string; clip?: string | null } = {};
      if (eTitle.trim() !== t.title) patch.title = eTitle.trim();
      if (eArtist.trim() !== t.artist) patch.artist = eArtist.trim();
      if (eClip.trim() !== clipUrl(t.clip)) patch.clip = eClip.trim() || null;
      if (eFile) patch.artwork = await imageFileToJpegDataUrl(eFile);
      else if (eCover.trim()) patch.artwork = eCover.trim();
      if (!Object.keys(patch).length) throw new Error('Нет изменений');
      await adminEditArtistTrack(id, t.id, patch);
      await refresh(id);
    } catch (err) { if (currentArtist.current === id) setError((err as Error).message); }
    finally { setEditBusy(false); }
  };
  const resetEdit = async (trackId: number) => {
    if (!confirm('Вернуть название, исполнителя и обложку из SoundCloud и убрать клип?')) return;
    const id = artist.id; setEditBusy(true); setError('');
    try {
      const patch = { title: null, artist: null, artwork: null, clip: null };
      await adminEditArtistTrack(id, trackId, patch);
      await refresh(id);
    } catch (err) { if (currentArtist.current === id) setError((err as Error).message); }
    finally { setEditBusy(false); }
  };
  const add = async (e: FormEvent) => {
    e.preventDefault(); if (saving) return;
    const id = artist.id; setSaving(true); setError(''); setSaved('');
    try {
      const artwork = file ? await imageFileToJpegDataUrl(file) : coverUrl.trim();
      const response = await fetch(`${API_BASE}/api/artist-track-add`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ password: localStorage.getItem('guesstrackAdminKey') ?? '', artistId: id, title: title.trim(), artist: performer.trim(), url: url.trim(), artwork }) });
      const data = await response.json().catch(() => ({})) as { error?: string; track?: ListedTrack; count?: number };
      if (!response.ok) throw new Error(data.error ?? `Ошибка сервера (${response.status})`);
      if (!data.track) throw new Error('Сервер не вернул добавленный трек');
      if (currentArtist.current === id) {
        const added = data.track; version.current++;
        setTracks(list => [...(list ?? []).filter(t => t.id !== added.id), added]);
        setTitle(''); setUrl(''); setCoverUrl(''); setFile(null); if (fileRef.current) fileRef.current.value = '';
        setSaved('Трек сохранён. Он доступен в каталоге этого артиста.');
      }
      notifyCatalogChanged();
    } catch (err) { if (currentArtist.current === id) setError((err as Error).message); }
    finally { setSaving(false); }
  };
  const locked = busyId !== null || saving || editBusy;
  return <div className='tracks-panel'>
    <div className='tracks-head'>
      <b>{artist.name}</b><span className='muted small'>{tracks ? `${tracks.length} треков` : ''}</span>
      <div className='tracks-actions'>
        <button className='chip' disabled={saving} onClick={() => { setFormOpen(x => !x); setSaved(''); }}>Добавить трек</button>
        <button className='chip' onClick={() => onResetCover(artist.id)}>Сбросить обложку</button>
        <button className='chip' onClick={onClose}>Закрыть</button>
      </div>
    </div>
    {formOpen && <form className='block' onSubmit={add}>
      <label>Название трека<input className='input' required maxLength={300} value={title} disabled={saving} onChange={e => setTitle(e.target.value)} /></label>
      <label>Исполнитель<input className='input' required maxLength={300} value={performer} disabled={saving} onChange={e => setPerformer(e.target.value)} /></label>
      <label>Прямая ссылка на трек SoundCloud<input className='input' type='url' required placeholder='https://soundcloud.com/artist/track' value={url} disabled={saving} onChange={e => setUrl(e.target.value)} /></label>
      <label>Ссылка на обложку (необязательно)<input className='input' type='url' placeholder='https://…' value={coverUrl} disabled={saving || !!file} onChange={e => setCoverUrl(e.target.value)} /></label>
      <label>Или файл обложки<input ref={fileRef} className='input' type='file' accept='image/png,image/jpeg,image/webp,image/gif' disabled={saving} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      {file && <button className='chip' type='button' disabled={saving} onClick={() => { setFile(null); if (fileRef.current) fileRef.current.value = ''; }}>Убрать файл</button>}
      <p className='muted small'>Если обложка не указана, используем картинку SoundCloud. Ручное добавление не требует совпадения с Genius. Сервер проверяет доступность по данным SoundCloud, но ограничения у слушателя могут отличаться.</p>
      <button className='btn btn-primary' disabled={saving} type='submit'>{saving ? 'Проверяем и сохраняем…' : 'Сохранить трек'}</button>
    </form>}
    {saved && <p role='status' className='muted small'>{saved}</p>}
    {error && <div role='alert' className='error'>{error}</div>}
    {!sorted && !error && <div className='muted small'>Загружаем список...</div>}
    {sorted && <ol className='tracks-list' aria-label={`Треки ${artist.name}`}>
      {sorted.map(t => <li key={t.id} className='feat-item'>
        <div className='feat-row'>
          {t.artwork ? <img className='feat-thumb' src={t.artwork} alt='' referrerPolicy='no-referrer' /> : <div className='feat-thumb' />}
          <div className='tracks-tx'>
            <a href={t.url} target='_blank' rel='noreferrer'>{t.title}</a>
            <div className='muted small'>{t.artist}{t.manual ? ' · Добавлен вручную' : ''}{t.clip ? ' · есть клип' : ''}</div>
          </div>
          <div className='feat-actions'>
            <button className='btn btn-ghost' disabled={locked} onClick={() => startEdit(t)}>Править</button>
            <button className='btn btn-ghost' aria-label={`Удалить ${t.title}`} disabled={locked} onClick={() => remove(t)}><Icon name='x' size={16} /></button>
          </div>
        </div>
        {editId === t.id && <form className='feat-form' onSubmit={saveEdit}>
          <label>Название<input className='input' required maxLength={300} value={eTitle} disabled={editBusy} onChange={e => setETitle(e.target.value)} /></label>
          <label>Исполнитель<input className='input' required maxLength={300} value={eArtist} disabled={editBusy} onChange={e => setEArtist(e.target.value)} /></label>
          <label>Ссылка на клип YouTube (необязательно)<input className='input' type='url' placeholder='https://youtu.be/…' value={eClip} disabled={editBusy} onChange={e => setEClip(e.target.value)} /></label>
          <label>Ссылка на обложку (необязательно)<input className='input' type='url' placeholder='https://…' value={eCover} disabled={editBusy || !!eFile} onChange={e => setECover(e.target.value)} /></label>
          <label>Или файл обложки<input className='input' type='file' accept='image/png,image/jpeg,image/webp,image/gif' disabled={editBusy} onChange={e => setEFile(e.target.files?.[0] ?? null)} /></label>
          <div className='feat-actions'>
            <button className='btn btn-primary' type='submit' disabled={editBusy}>{editBusy ? 'Сохраняем…' : 'Сохранить'}</button>
            <button className='btn btn-ghost' type='button' disabled={editBusy} onClick={() => resetEdit(t.id)}>Сбросить правки</button>
            <button className='btn btn-ghost' type='button' disabled={editBusy} onClick={() => setEditId(null)}>Отмена</button>
          </div>
        </form>}
      </li>)}
    </ol>}
  </div>;
}
