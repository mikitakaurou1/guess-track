import { useState } from 'react';
import type { GameConfig, Track } from '../types/game';
import type { HostRoom } from '../hooks/useRoom';
import type { SourceStat } from '../hooks/useGame';
import Icon from './Icon';
import Avatar, { AvatarPicker, avatarOptions } from './Avatar';
import '../styles/howto.css';
import '../styles/setup.css';
interface Props { ready: boolean; busy: boolean; error: string | null; playlist: Track[]; sources: SourceStat[]; room: HostRoom; onLoadSources: (urls: string[]) => void; onChangePlaylist: () => void; onStart: (config: GameConfig) => void; onJoinMode: () => void; }
const toNum = (s: string, min: number, max: number, fallback: number) => { const n = parseInt(s, 10); return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n)); };
const playersWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'игрок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'игрока' : 'игроков';
function NumberField({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min: number; max: number }) {
  return <input className='input num-input' type='text' inputMode='numeric' maxLength={3} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} onBlur={() => onChange(String(toNum(value, min, max, min)))} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/>;
}
export default function SetupScreen({ ready, busy, error, playlist, sources, room, onLoadSources, onChangePlaylist, onStart, onJoinMode }: Props) {
  const [urls, setUrls] = useState<string[]>(['']);
  const [localError, setLocalError] = useState('');
  const [localCount, setLocalCount] = useState(1);
  const [names, setNames] = useState(['Игрок 1', 'Игрок 2', 'Игрок 3', 'Игрок 4', 'Игрок 5']);
  const [avatars, setAvatars] = useState<string[]>(avatarOptions.slice(0, 5));
  const [clipText, setClipText] = useState('10');
  const [answerText, setAnswerText] = useState('10');
  const [trackCount, setTrackCount] = useState(10);
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [randomOrder, setRandomOrder] = useState(true);
  const total = playlist.length;
  const load = () => {
    const filled = urls.map(u => u.trim()).filter(Boolean);
    if (!filled.length || filled.some(u => !/(soundcloud\.com|soundcloud\.app\.goo\.gl|snd\.sc)\//.test(u))) { setLocalError('Нужны ссылки именно с SoundCloud (soundcloud.com/… или on.soundcloud.com/…): на профиль или плейлист. Ссылки Spotify, YouTube и других сервисов не подходят.'); return; }
    setLocalError(''); onLoadSources(filled);
  };
  if (!total) return <section className='glass'>
    <div className='step'>Шаг 1 из 2</div><h2>Откуда брать треки</h2>
    <p className='only-sc'>Игра работает только с музыкой из <b>SoundCloud</b>. Вставьте ссылку на профиль или плейлист именно оттуда (Spotify, YouTube, Яндекс Музыка и прочие не поддерживаются).</p>
    <div className='howto glass-inner'><div className='howto-title'>Какую ссылку взять</div><ul className='howto-list'>
      <li><span className='howto-num'>1</span><div><b>Профиль — возьмём все лайки человека</b><span>Откройте страницу профиля на soundcloud.com и скопируйте адрес из строки браузера, например <code>soundcloud.com/username</code>. У этого пользователя лайки должны быть открыты для всех.</span></div></li>
      <li><span className='howto-num'>2</span><div><b>Плейлист или альбом — возьмём все его треки</b><span>Откройте плейлист, нажмите «Поделиться» → «Скопировать ссылку» (или возьмите адрес из строки браузера), например <code>soundcloud.com/username/sets/name</code>. Плейлист должен быть публичным или доступным по «секретной ссылке».</span></div></li>
      <li><span className='howto-num'>3</span><div><b>С телефона, из приложения SoundCloud</b><span>Нажмите «Поделиться» → «Скопировать ссылку» на профиле или плейлисте. Короткие ссылки вида <code>on.soundcloud.com/…</code> тоже подходят.</span></div></li>
    </ul><div className='howto-note'><Icon name='x-circle' size={16}/><span>Ссылка на один трек не подойдёт — нужен набор треков. Можно добавить до 5 источников: тогда в игре будет поровну треков от каждого.</span></div></div>
    {urls.map((u, i) => <div key={i} className='name-field'><span className={`avatar c${i}`}>{i + 1}</span><input className='input' value={u} onChange={e => setUrls(p => p.map((x, k) => k === i ? e.target.value : x))} onKeyDown={e => e.key === 'Enter' && load()} placeholder='Вставьте ссылку SoundCloud: профиль или плейлист'/>{urls.length > 1 && <button className='btn btn-ghost' onClick={() => setUrls(p => p.filter((_, k) => k !== i))}><Icon name='x' size={16}/></button>}</div>)}
    {urls.length < 5 && <button className='btn btn-ghost' onClick={() => setUrls(p => [...p, ''])}><Icon name='plus' size={16}/> Добавить ещё один источник</button>}
    <button className='btn btn-primary btn-lg' onClick={load} disabled={!ready || busy}>{busy ? 'Загружаем треки...' : ready ? 'Загрузить треки' : 'Подключаем SoundCloud...'}</button>
    {(localError || error) && <div className='error'>{localError || error}</div>}
    <button className='btn btn-ghost btn-lg' onClick={onJoinMode}>У меня есть код комнаты <Icon name='arrow-right' size={16}/></button>
  </section>;
  const S = Math.max(1, sources.length);
  const minCount = Math.min(...sources.map(s => s.count));
  const maxTotal = S * minCount;
  const perSource = Math.max(1, Math.min(Math.floor(trackCount / S), minCount));
  const tracks = perSource * S;
  const commitCount = () => { if (countDraft !== null && countDraft !== '') setTrackCount(Math.min(maxTotal, Math.max(S, parseInt(countDraft, 10)))); setCountDraft(null); };
  const guests = room.guests;
  const totalPlayers = localCount + guests.length;
  const playersOk = totalPlayers >= 1 && totalPlayers <= 5;
  const joinLink = room.code ? `${location.origin}/?room=${room.code}` : '';
  const start = () => {
    const localNames = names.slice(0, localCount).map((n, i) => n.trim() || `Игрок ${i + 1}`);
    onStart({ playerNames: [...localNames, ...guests.map(g => g.name)], avatars: [...avatars.slice(0, localCount), ...guests.map(g => g.avatar ?? 'panda')], owners: [...localNames.map(() => null), ...guests.map(g => g.id)], clipSeconds: toNum(clipText, 1, 60, 10), answerSeconds: toNum(answerText, 3, 60, 10), trackCount: tracks, randomOrder });
  };
  return <section className='glass'>
    <div className='row between'><div><div className='step'>Шаг 2 из 2</div><h2>Настройте игру</h2></div><button className='btn btn-ghost' onClick={onChangePlaylist}>Другие источники</button></div>
    <div className='block'><div className='block-title'>Треков в игре <b className='grad'>{tracks}</b>{' '}<span className='muted'>из {maxTotal}{S > 1 ? ` (по ${perSource} с каждого источника)` : ''}</span></div>
      <div className='count-row'><input className='range' type='range' min={S} max={maxTotal} step={S} value={tracks} onChange={e => { setCountDraft(null); setTrackCount(+e.target.value); }}/><input className='input count-input' type='text' inputMode='numeric' maxLength={4} aria-label='Количество треков' value={countDraft ?? String(tracks)} onChange={e => setCountDraft(e.target.value.replace(/\D/g, ''))} onFocus={e => e.target.select()} onBlur={commitCount} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/></div>
      <div className='chips'>{[5, 10, 20, 30, 50].filter(n => n % S === 0 && n < maxTotal).map(n => <button key={n} className={`chip ${tracks === n ? 'on' : ''}`} onClick={() => { setCountDraft(null); setTrackCount(n); }}>{n}</button>)}<button className={`chip ${tracks === maxTotal ? 'on' : ''}`} onClick={() => { setCountDraft(null); setTrackCount(maxTotal); }}>Максимум ({maxTotal})</button></div>
      {S > 1 && <ul className='attempts'>{sources.map((s, i) => <li key={i} className='yes'><b>{s.label}</b>: {s.count} треков в пуле → в игре {perSource}</li>)}</ul>}
      <div className='seg'><button className={randomOrder ? 'on' : ''} onClick={() => setRandomOrder(true)}><Icon name='shuffle' size={16}/> Случайные</button><button className={!randomOrder ? 'on' : ''} onClick={() => setRandomOrder(false)}><Icon name='list' size={16}/> По порядку</button></div>
    </div>
    <div className='grid-2'><div className='block'><div className='block-title'>Секунд фрагмента</div><NumberField value={clipText} onChange={setClipText} min={1} max={60}/></div><div className='block'><div className='block-title'>Секунд на ответ</div><NumberField value={answerText} onChange={setAnswerText} min={3} max={60}/></div></div>
    <div className='block'><div className='block-title'>Игроков за этим устройством</div><div className='chips'>{[0, 1, 2, 3, 4, 5].map(n => <button key={n} className={`chip ${localCount === n ? 'on' : ''}`} onClick={() => setLocalCount(n)}>{n}</button>)}</div>
      <div className='grid-names'>{names.slice(0, localCount).map((n, i) => <div key={i} className='name-field'><AvatarPicker value={avatars[i]} index={i} onChange={id => setAvatars(p => p.map((x, k) => k === i ? id : x))}/><input className='input' value={n} onChange={e => setNames(p => p.map((x, k) => k === i ? e.target.value : x))}/></div>)}</div>
      {localCount > 0 && <p className='muted small'>Нажмите на аватарку для выбора. Клавиши быстрого ответа: 1–{localCount}.</p>}
    </div>
    <div className='block'><div className='block-title'>Игра по сети (со своих устройств)</div>{!room.code ? <><button className='btn btn-ghost' onClick={room.open} disabled={room.connecting}><Icon name='globe' size={16}/> {room.connecting ? 'Создаём комнату...' : 'Создать комнату'}</button>{room.error && <div className='error'>{room.error}</div>}</> : <div className='glass-inner'><div className='muted small'>Код комнаты</div><div className='room-code'>{room.code}</div><div className='muted small'>Или ссылка: <a href={joinLink}>{joinLink}</a>{' '}<button className='chip' onClick={() => navigator.clipboard.writeText(joinLink)}>Копировать</button></div><ul className='attempts'>{guests.length === 0 && <li className='no'>Пока никто не подключился</li>}{guests.map((g, i) => <li key={g.id} className='yes'><span className='row'><Avatar id={g.avatar} index={localCount + i}/>{g.name}</span></li>)}</ul><button className='btn btn-ghost' onClick={room.close}>Закрыть комнату</button></div>}</div>
    <button className='btn btn-primary btn-lg' onClick={start} disabled={!playersOk}>Начать игру ({totalPlayers} {playersWord(totalPlayers)})</button>
    {!playersOk && <p className='muted small'>Нужно от 1 до 5 игроков суммарно (сейчас {totalPlayers}).</p>}
  </section>;
}
