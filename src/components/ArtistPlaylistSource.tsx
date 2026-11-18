import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../config';
import { adminPassword, fetchArtistPool } from '../services/artistsApi';

type Source = { mode: 'automatic' | 'playlist'; url: string | null; updatedAt?: string; importedCount?: number; count?: number | null };
interface Props { artistId: string; disabled: boolean; onBusy: (busy: boolean) => void; onApplied: () => Promise<void>; }
export default function ArtistPlaylistSource({ artistId, disabled, onBusy, onApplied }: Props) {
  const [source, setSource] = useState<Source | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const ctrl = new AbortController();
    void fetch(`${API_BASE}/api/artist-source?id=${encodeURIComponent(artistId)}`, { cache: 'no-store', signal: ctrl.signal })
      .then(async r => { if (!r.ok) throw new Error('Не удалось получить источник артиста. Проверьте обновление сервера'); return r.json() as Promise<Source>; })
      .then(data => { if (live.current) { setSource(data); setUrl(data.url ?? ''); } })
      .catch(e => { if (live.current && !ctrl.signal.aborted) setError((e as Error).message); });
    return () => { live.current = false; ctrl.abort(); onBusy(false); };
  }, [artistId, onBusy]);
  const apply = async (value: string | null) => {
    if (busy || disabled || !source) return;
    const question = value === null ? 'Вернуть автоматический каталог для всех пользователей?' : 'Заменить автоматически собранные треки этого артиста плейлистом для всех пользователей? Ручные добавления и правки сохранятся.';
    if (!window.confirm(question)) return;
    setBusy(true); onBusy(true); setError(''); setNote('');
    let applied = false;
    try {
      const r = await fetch(`${API_BASE}/api/artist-source`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ artistId, url: value, password: adminPassword() }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? `Ошибка сервера (${r.status})`);
      applied = true;
      if (live.current) { setSource(data); setUrl(data.url ?? ''); }
      const tracks = await fetchArtistPool(artistId, { fresh: true });
      if (typeof data.count === 'number' && data.count !== tracks.length) throw new Error(`Источник сохранён, но серверный список изменился: ожидалось ${data.count}, получено ${tracks.length}. Повторно откройте артиста`);
      if (live.current) {
        await onApplied();
        if (live.current) setNote(data.mode === 'playlist'
          ? `Плейлист сохранён для всех. Импортировано: ${data.importedCount ?? tracks.length}. В актуальном каталоге: ${tracks.length}. Список проверен по серверу, не по локальной библиотеке.`
          : `Автоматический каталог восстановлен. По актуальному ответу сервера: ${tracks.length} треков. Это прежний автоматически собранный каталог, не содержимое удалённой привязки.`);
      }
    } catch (e) { if (live.current) setError(`${applied ? 'Настройка сохранена, но обновление списка не подтверждено: ' : ''}${(e as Error).message}`); }
    finally { if (live.current) { setBusy(false); onBusy(false); } }
  };
  const locked = busy || disabled || !source;
  return <section className='glass-inner block' aria-label='Источник каталога артиста'>
    <div className='block-title'>Источник треков</div>
    <p className='muted small'>{source ? source.mode === 'playlist' ? `Сейчас: свой плейлист SoundCloud${typeof source.importedCount === 'number' ? ` · импортировано ${source.importedCount}` : ''}` : 'Сейчас: автоматический каталог' : 'Проверяем источник…'}</p>
    <form className='block' onSubmit={e => { e.preventDefault(); void apply(url.trim()); }}>
      <label>Публичный плейлист SoundCloud<input className='input' type='url' required placeholder='https://soundcloud.com/user/sets/playlist' value={url} disabled={locked} onChange={e => setUrl(e.target.value)} /></label>
      <div className='row'>
        <button className='btn btn-primary' type='submit' disabled={locked || !url.trim()}>{busy ? 'Загружаем и проверяем список…' : 'Загрузить и применить'}</button>
        {source?.mode === 'playlist' && <><button className='btn btn-ghost' type='button' disabled={locked} onClick={() => void apply(source.url)}>Обновить из плейлиста</button><button className='btn btn-ghost' type='button' disabled={locked} onClick={() => void apply(null)}>Вернуть автоматический каталог</button></>}
      </div>
    </form>
    <p className='muted small'>Изменения общие для всех, обновление плейлиста — по кнопке. Фильтров длительности и доступности нет. При неполных данных импорт завершается ошибкой без замены каталога. Старые блокировки автоматического поиска не отбрасывают явно выбранные треки плейлиста; удаления в этой привязке сохраняются. Одинаковые id объединяются. Ограничения воспроизведения SoundCloud остаются. Без сети игроки могут использовать установленную библиотеку; админка не выдаёт её за свежий ответ сервера.</p>
    {note && <p className='muted small' role='status'>{note}</p>}
    {error && <div className='error' role='alert'>{error}</div>}
  </section>;
}
