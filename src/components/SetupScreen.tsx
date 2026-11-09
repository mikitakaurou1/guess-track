import { useState } from 'react';
import type { GameConfig, Track } from '../types/game';
import type { HostRoom } from '../hooks/useRoom';
import type { SourceStat } from '../hooks/useGame';
import Icon from './Icon';
import Avatar, { AvatarPicker, avatarOptions } from './Avatar';
import FeaturedPlaylist from './FeaturedPlaylist';
import '../styles/howto.css';
import '../styles/setup.css';
import '../styles/setupExtras.css';
import '../styles/reverse.css';
interface Props { ready: boolean; busy: boolean; error: string | null; playlist: Track[]; sources: SourceStat[]; room: HostRoom; onLoadSources: (urls: string[]) => void; onChangePlaylist: () => void; onStart: (config: GameConfig) => void; onReverseStart?: (config: GameConfig) => void; onJoinMode: () => void; }
const FEATURED_URL = 'https://soundcloud.com/nikitkakovrov4/sets/guesstrack';
const FEATURED_MATCH = 'nikitkakovrov4/sets/guesstrack';
const MAX_PLAYERS = 10;
const toNum = (s: string, min: number, max: number, fallback: number) => { const n = parseInt(s, 10); return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n)); };
const playersWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'игрок' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'игрока' : 'игроков';
function NumberField({ value, onChange, min, max }: { value: string; onChange: (v: string) => void; min: number; max: number }) {
  return <input className='input num-input' type='text' inputMode='numeric' maxLength={3} value={value} onChange={e => onChange(e.target.value.replace(/\D/g, ''))} onBlur={() => onChange(String(toNum(value, min, max, min)))} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/>;
}
export default function SetupScreen({ ready, busy, error, playlist, sources, room, onLoadSources, onChangePlaylist, onStart, onReverseStart, onJoinMode }: Props) {
  const [urls, setUrls] = useState<string[]>(['']);
  const [localError, setLocalError] = useState('');
  const [howtoOpen, setHowtoOpen] = useState(false);
  const [localCount, setLocalCount] = useState(1);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, (_, i) => `Игрок ${i + 1}`));
  const [avatars, setAvatars] = useState<string[]>(() => Array.from({ length: MAX_PLAYERS }, (_, i) => avatarOptions[i % avatarOptions.length]));
  const [clipText, setClipText] = useState('10');
  const [answerText, setAnswerText] = useState('10');
  const [trackCount, setTrackCount] = useState(10);
  const [countDraft, setCountDraft] = useState<string | null>(null);
  const [randomOrder, setRandomOrder] = useState(true);
  const [gameMode, setGameMode] = useState<'start' | 'mid' | 'songless' | 'reverse'>('start');
  const songless = gameMode === 'songless';
  const reverse = gameMode === 'reverse';
  const solo = songless || (reverse && !room.code);
  const effLocal = solo ? 1 : localCount;
  const total = playlist.length;
  const hasFeatured = urls.some(u => u.toLowerCase().includes(FEATURED_MATCH));
  const canAddFeatured = urls.some(u => !u.trim()) || urls.length < 5;
  const addFeatured = () => {
    if (hasFeatured) return;
    setUrls(p => {
      const i = p.findIndex(x => !x.trim());
      if (i >= 0) return p.map((x, k) => k === i ? FEATURED_URL : x);
      return p.length < 5 ? [...p, FEATURED_URL] : p;
    });
  };
  const load = () => {
    const filled = urls.map(u => u.trim()).filter(Boolean);
    if (!filled.length || filled.some(u => !/(soundcloud\.com|soundcloud\.app\.goo\.gl|snd\.sc)\//.test(u))) { setLocalError('Нужны ссылки именно с SoundCloud (soundcloud.com/… или on.soundcloud.com/…): на профиль или плейлист. Ссылки Spotify, YouTube и других сервисов не подходят.'); return; }
    setLocalError(''); onLoadSources(filled);
  };
  if (!total) return <section className='glass'>
    <div className='step'>Шаг 1 из 2</div><h2>Откуда брать треки</h2>
    <p className='only-sc'>Игра работает только с музыкой из <b>SoundCloud</b>. Вставьте ссылку на профиль или плейлист именно оттуда (Spotify, YouTube, Яндекс Музыка и прочие не поддерживаются).</p>
    <div className='howto glass-inner'><div className='howto-title'>Какую ссылку взять</div><div className={`howto-body${howtoOpen ? '' : ' collapsed'}`}><ul className='howto-list'>
      <li><span className='howto-num'>1</span><div><b>Профиль — возьмём все лайки человека</b><span>Откройте страницу профиля на soundcloud.com и скопируйте адрес из строки браузера, например <code>soundcloud.com/username</code>. У этого пользователя лайки должны быть открыты для всех.</span></div></li>
      <li><span className='howto-num'>2</span><div><b>Плейлист или альбом — возьмём все его треки</b><span>Откройте плейлист, нажмите «Поделиться» → «Скопировать ссылку» (или возьмите адрес из строки браузера), например <code>soundcloud.com/username/sets/name</code>. Плейлист должен быть публичным или доступным по «секретной ссылке».</span></div></li>
      <li><span className='howto-num'>3</span><div><b>С телефона, из приложения SoundCloud</b><span>Нажмите «Поделиться» → «Скопировать ссылку» на профиле или плейлисте. Короткие ссылки вида <code>on.soundcloud.com/…</code> тоже подходят.</span></div></li>
    </ul><div className='howto-note'><Icon name='x-circle' size={16}/><span>Ссылка на один трек не подойдёт — нужен набор треков. Можно добавить до 5 источников: тогда в игре будет поровну треков от каждого.</span></div></div><button className='howto-more' onClick={() => setHowtoOpen(o => !o)} aria-expanded={howtoOpen}>{howtoOpen ? 'свернуть' : 'ещё'}</button></div>
    <FeaturedPlaylist url={FEATURED_URL} fallbackTitle='GuessTrack' fallbackCreator='nikitkakovrov4' added={hasFeatured} disabled={!canAddFeatured} onAdd={addFeatured}/>
    {urls.map((u, i) => <div key={i} className='name-field'><span className={`avatar c${i}`}>{i + 1}</span><input className='input' value={u} onChange={e => setUrls(p => p.map((x, k) => k === i ? e.target.value : x))} onKeyDown={e => e.key === 'Enter' && load()} placeholder='Вставьте ссылку SoundCloud: профиль или плейлист'/>{urls.length > 1 && <button className='btn btn-ghost' onClick={() => setUrls(p => p.filter((_, k) => k !== i))}><Icon name='x' size={16}/></button>}</div>)}
    {urls.length < 5 && <button className='btn btn-ghost' onClick={() => setUrls(p => [...p, ''])}><Icon name='plus' size={16}/> Добавить ещё один источник</button>}
    <button className='btn btn-primary btn-lg' onClick={load} disabled={!ready || busy}>{busy ? 'Загружаем треки...' : ready ? 'Загрузить треки' : 'Подключаем SoundCloud...'}</button>
    {(localError || error) && <div className='error'>{localError || error}</div>}
    <button className='btn btn-ghost btn-lg' onClick={onJoinMode}>У меня есть код комнаты <Icon name='arrow-right' size={16}/></button>
  </section>;
  const S = Math.max(1, sources.length);
  const minCount = sources.length ? Math.min(...sources.map(s => s.count)) : total;
  const maxTotal = S * minCount;
  const perSource = Math.max(1, Math.min(Math.floor(trackCount / S), minCount));
  const tracks = perSource * S;
  const commitCount = () => { if (countDraft !== null && countDraft !== '') setTrackCount(Math.min(maxTotal, Math.max(S, parseInt(countDraft, 10)))); setCountDraft(null); };
  const guests = solo ? [] : room.guests;
  const totalPlayers = effLocal + guests.length;
  const playersOk = totalPlayers >= 1 && totalPlayers <= MAX_PLAYERS;
  const joinLink = room.code ? `${location.origin}/?room=${room.code}` : '';
  const start = () => {
    const localNames = names.slice(0, effLocal).map((n, i) => n.trim() || `Игрок ${i + 1}`);
    const draft = countDraft === null ? tracks : toNum(countDraft, S, maxTotal, tracks);
    const selected = Math.max(S, Math.floor(draft / S) * S);
    if (reverse) {
      onReverseStart?.({ playerNames: [...localNames, ...guests.map(g => g.name)], avatars: [...avatars.slice(0, effLocal), ...guests.map(g => g.avatar ?? 'panda')], owners: [...localNames.map(() => null), ...guests.map(g => g.id)], clipSeconds: toNum(clipText, 1, 60, 10), answerSeconds: toNum(answerText, 3, 60, 10), trackCount: selected, randomOrder, reverse: true });
      return;
    }
    if (songless) {
      onStart({ playerNames: localNames, avatars: avatars.slice(0, effLocal), owners: localNames.map(() => null), clipSeconds: 20, answerSeconds: 0, trackCount: selected, randomOrder, songless: true });
      return;
    }
    onStart({ playerNames: [...localNames, ...guests.map(g => g.name)], avatars: [...avatars.slice(0, effLocal), ...guests.map(g => g.avatar ?? 'panda')], owners: [...localNames.map(() => null), ...guests.map(g => g.id)], clipSeconds: toNum(clipText, 1, 60, 10), answerSeconds: toNum(answerText, 3, 60, 10), trackCount: selected, randomOrder, randomStart: gameMode === 'mid', startSeed: Math.floor(Math.random() * 2147483647) });
  };
  return <section className='glass'>
    <div className='row between'><div><div className='step'>Шаг 2 из 2</div><h2>Настройте игру</h2></div><button className='btn btn-ghost' onClick={onChangePlaylist}>Другие источники</button></div>
    <div className='block'><div className='block-title'>Треков в игре <b className='grad'>{tracks}</b>{' '}<span className='muted'>из {maxTotal}{S > 1 ? ` (по ${perSource} с каждого источника)` : ''}</span></div>
      <div className='count-row'><input className='range' type='range' min={S} max={maxTotal} step={S} value={tracks} onChange={e => { setCountDraft(null); setTrackCount(+e.target.value); }}/><input className='input count-input' type='text' inputMode='numeric' maxLength={4} aria-label='Количество треков' value={countDraft ?? String(tracks)} onChange={e => setCountDraft(e.target.value.replace(/\D/g, ''))} onFocus={e => e.target.select()} onBlur={commitCount} onKeyDown={e => e.key === 'Enter' && e.currentTarget.blur()}/></div>
      <div className='chips'>{[5, 10, 20, 30, 50].filter(n => n % S === 0 && n < maxTotal).map(n => <button key={n} className={`chip ${tracks === n ? 'on' : ''}`} onClick={() => { setCountDraft(null); setTrackCount(n); }}>{n}</button>)}<button className={`chip ${tracks === maxTotal ? 'on' : ''}`} onClick={() => { setCountDraft(null); setTrackCount(maxTotal); }}>Максимум ({maxTotal})</button></div>
      {S > 1 && <ul className='attempts'>{sources.map((s, i) => <li key={i} className='yes'><b>{s.label}</b>: {s.count} треков в пуле → в игре {perSource}</li>)}</ul>}
      <div className='seg'><button className={randomOrder ? 'on' : ''} onClick={() => setRandomOrder(true)}><Icon name='shuffle' size={16}/> Случайные</button><button className={!randomOrder ? 'on' : ''} onClick={() => setRandomOrder(false)}><Icon name='list' size={16}/> По порядку</button></div>
    </div>
    <div className='block'><div className='block-title'>Режим</div>
      <div className='seg mode-selector'><button className={gameMode === 'start' ? 'on' : ''} onClick={() => setGameMode('start')}>С начала</button><button className={gameMode === 'mid' ? 'on' : ''} onClick={() => setGameMode('mid')}>Не с начала</button><button className={songless ? 'on' : ''} onClick={() => setGameMode('songless')} disabled={!!room.code}>Сонглесс</button><button className={reverse ? 'on' : ''} onClick={() => setGameMode('reverse')} disabled={!onReverseStart}>Перевертыш</button></div>
      {gameMode === 'mid' && <p className='muted small'>Каждый трек начинается со случайного места, у каждого трека своё.</p>}
      {songless && <p className='muted small'>Сначала звучит 0,5 с трека с самого начала. Угадали — 6 баллов. Не узнали — жмите «Пропустить»: дадут 1 с (5 баллов), затем 2 с (4 балла), 5 с (3 балла), 10 с (2 балла) и 20 с (1 балл). Неверный ответ тоже тратит попытку и открывает следующий отрезок. Не угадали и за 20 с — 0 баллов, и показывается карточка трека. Режим одиночный. Авторы идеи: <a href='https://songless.ru' target='_blank' rel='noreferrer'>songless.ru</a>.</p>}
      {reverse && <p className='muted small'>Первые выбранные секунды трека звучат задом наперёд. Без комнаты — одиночная игра с одним ответом на трек. В комнате — как в классике: нажмите «ЖМУ!», ответьте за отведённое время; после ошибки право ответа у остальных. Первый правильный ответ — 1 балл и конец раунда. Создайте комнату ниже или выберите режим в уже открытой комнате. Нужен настроенный сервер обработки. Используйте музыку, на загрузку и обработку которой у вас есть разрешение.</p>}
      {!!room.code && <p className='muted small'>Сонглесс недоступен, пока открыта комната. Перевертыш поддерживает игру по сети.</p>}
    </div>
    {!songless && <div className='grid-2'><div className='block'><div className='block-title'>Секунд фрагмента</div><NumberField value={clipText} onChange={setClipText} min={1} max={60}/></div>{(!reverse || !!room.code) && <div className='block'><div className='block-title'>Секунд на ответ</div><NumberField value={answerText} onChange={setAnswerText} min={3} max={60}/></div>}</div>}
    <div className='block'><div className='block-title'>{solo ? 'Игрок' : 'Игроков за этим устройством'}</div>{!solo && <div className='chips'>{Array.from({ length: MAX_PLAYERS + 1 }, (_, n) => n).map(n => <button key={n} className={`chip ${localCount === n ? 'on' : ''}`} onClick={() => setLocalCount(n)}>{n}</button>)}</div>}
      <div className='grid-names'>{names.slice(0, effLocal).map((n, i) => <div key={i} className='name-field'><AvatarPicker value={avatars[i]} index={i} onChange={id => setAvatars(p => p.map((x, k) => k === i ? id : x))}/><input className='input' value={n} onChange={e => setNames(p => p.map((x, k) => k === i ? e.target.value : x))}/></div>)}</div>
      {effLocal > 0 && <p className='muted small'>Нажмите на аватарку для выбора.</p>}
    </div>
    {!songless && <div className='block'><div className='block-title'>Игра по сети (со своих устройств)</div>{!room.code ? <><button className='btn btn-ghost' onClick={room.open} disabled={room.connecting}><Icon name='globe' size={16}/> {room.connecting ? 'Создаём комнату...' : 'Создать комнату'}</button>{room.error && <div className='error'>{room.error}</div>}</> : <div className='glass-inner'><div className='muted small'>Код комнаты</div><div className='room-code'>{room.code}</div><div className='muted small'>Или ссылка: <a href={joinLink}>{joinLink}</a>{' '}<button className='chip' onClick={() => navigator.clipboard.writeText(joinLink)}>Копировать</button></div><ul className='attempts'>{guests.length === 0 && <li className='no'>Пока никто не подключился</li>}{guests.map((g, i) => <li key={g.id} className='yes'><span className='row'><Avatar id={g.avatar} index={effLocal + i}/>{g.name}</span></li>)}</ul><button className='btn btn-ghost' onClick={room.close}>Закрыть комнату</button></div>}</div>}
    <button className='btn btn-primary btn-lg' onClick={start} disabled={!playersOk}>Начать игру ({totalPlayers} {playersWord(totalPlayers)})</button>
    {!playersOk && <p className='muted small'>Нужно от 1 до {MAX_PLAYERS} игроков суммарно (сейчас {totalPlayers}).</p>}
  </section>;
}
