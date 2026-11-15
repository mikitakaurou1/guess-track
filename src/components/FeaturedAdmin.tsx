import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Icon from './Icon';
import type { PlaylistTrack } from '../services/playlistInfo';
import { BAD_PASSWORD, clearAdminKey } from '../services/artistsApi';
import { featuredEdit, featuredRemove, featuredRestore, fetchFeaturedOverrides, type RemovedTrack } from '../services/featuredApi';
import { imageFileToJpegDataUrl } from '../utils/imageData';
import { notifyCatalogChanged } from '../utils/catalogEvents';
import '../styles/artists.css';

interface Props { tracks: PlaylistTrack[]; onChanged: () => Promise<void>; }

const clipUrl = (id?: string) => (id ? `https://youtu.be/${id}` : '');

export default function FeaturedAdmin({ tracks, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [clip, setClip] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState<RemovedTrack[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const refreshRemoved = async () => {
    const o = await fetchFeaturedOverrides();
    if (o) setRemoved(o.removed);
  };
  useEffect(() => { if (open) void refreshRemoved(); }, [open]);
  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await job();
      await onChanged();
      await refreshRemoved();
      notifyCatalogChanged();
    } catch (e) {
      const m = (e as Error).message;
      setError(m);
      if (m === BAD_PASSWORD) clearAdminKey();
    } finally {
      setBusy(false);
    }
  };
  const startEdit = (t: PlaylistTrack) => {
    if (t.id === undefined) return;
    setEditId(t.id); setTitle(t.title); setArtist(t.artist); setCoverUrl(''); setClip(clipUrl(t.clip)); setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    const t = tracks.find(x => x.id === editId);
    if (!t || t.id === undefined) return;
    const id = t.id;
    void run(async () => {
      const patch: { title?: string; artist?: string; artwork?: string; clip?: string | null } = {};
      if (title.trim() !== t.title) patch.title = title.trim();
      if (artist.trim() !== t.artist) patch.artist = artist.trim();
      if (clip.trim() !== clipUrl(t.clip)) patch.clip = clip.trim() || null;
      if (file) patch.artwork = await imageFileToJpegDataUrl(file);
      else if (coverUrl.trim()) patch.artwork = coverUrl.trim();
      if (!Object.keys(patch).length) throw new Error('Нет изменений');
      await featuredEdit(id, patch);
      setEditId(null);
    });
  };
  const resetEdits = (id: number) => {
    if (!confirm('Вернуть название, исполнителя и обложку из SoundCloud и убрать клип?')) return;
    void run(async () => { await featuredEdit(id, { title: null, artist: null, artwork: null, clip: null }); setEditId(null); });
  };
  const remove = (t: PlaylistTrack) => {
    const id = t.id;
    if (id === undefined || !confirm(`Убрать «${t.title}» из плейлиста на сайте?`)) return;
    void run(async () => { await featuredRemove({ id, title: t.title, artist: t.artist }); });
  };
  const restore = (id: number) => { void run(async () => { await featuredRestore(id); }); };
  return (
    <div className='feat-admin glass-inner'>
      <div className='row between'>
        <b>Админ: треки плейлиста</b>
        <button className='chip' onClick={() => setOpen(o => !o)}>{open ? 'Скрыть' : 'Править треки'}</button>
      </div>
      {open && <>
        <p className='muted small'>Правки видны только на этом сайте, плейлист на SoundCloud не меняется. «Убрать» скрывает трек из игры и из списка.</p>
        {error && <div role='alert' className='error'>{error}</div>}
        <ol className='tracks-list' aria-label='Треки плейлиста'>
          {tracks.filter(t => t.id !== undefined).map(t => (
            <li key={t.id} className='feat-item'>
              <div className='feat-row'>
                {t.artwork ? <img className='feat-thumb' src={t.artwork} alt='' referrerPolicy='no-referrer' /> : <div className='feat-thumb' />}
                <div className='tracks-tx'><div>{t.title}</div><div className='muted small'>{t.artist}{t.clip ? ' · есть клип' : ''}</div></div>
                <div className='feat-actions'>
                  <button className='btn btn-ghost' disabled={busy} onClick={() => startEdit(t)}>Править</button>
                  <button className='btn btn-ghost' aria-label={`Убрать ${t.title}`} disabled={busy} onClick={() => remove(t)}><Icon name='x' size={16} /></button>
                </div>
              </div>
              {editId === t.id && (
                <form className='feat-form' onSubmit={save}>
                  <label>Название<input className='input' required maxLength={300} value={title} disabled={busy} onChange={e => setTitle(e.target.value)} /></label>
                  <label>Исполнитель<input className='input' required maxLength={300} value={artist} disabled={busy} onChange={e => setArtist(e.target.value)} /></label>
                  <label>Ссылка на клип YouTube (необязательно)<input className='input' type='url' placeholder='https://youtu.be/…' value={clip} disabled={busy} onChange={e => setClip(e.target.value)} /></label>
                  <label>Ссылка на обложку (необязательно)<input className='input' type='url' placeholder='https://…' value={coverUrl} disabled={busy || !!file} onChange={e => setCoverUrl(e.target.value)} /></label>
                  <label>Или файл обложки<input ref={fileRef} className='input' type='file' accept='image/png,image/jpeg,image/webp,image/gif' disabled={busy} onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
                  <div className='feat-actions'>
                    <button className='btn btn-primary' type='submit' disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
                    <button className='btn btn-ghost' type='button' disabled={busy} onClick={() => resetEdits(editId as number)}>Сбросить правки</button>
                    <button className='btn btn-ghost' type='button' disabled={busy} onClick={() => setEditId(null)}>Отмена</button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ol>
        {removed.length > 0 && <>
          <div className='muted small'>Убранные треки</div>
          <ul className='tracks-list' aria-label='Убранные треки'>
            {removed.map(r => (
              <li key={r.id}>
                <div className='tracks-tx'>{r.title || `Трек ${r.id}`}<div className='muted small'>{r.artist}</div></div>
                <button className='btn btn-ghost' disabled={busy} onClick={() => restore(r.id)}>Вернуть</button>
              </li>
            ))}
          </ul>
        </>}
      </>}
    </div>
  );
}
