import { useEffect, useRef, useState } from 'react';
import type { Attempt, GameConfig, RoundRecord, Track } from '../types/game';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { isCorrectAnswer } from '../utils/answerMatcher';
import { shuffle } from '../utils/shuffle';
import Icon from './Icon';
import FinalScreen from './FinalScreen';
import '../styles/songless.css';

// Режим «Сонглесс» (идея: songless.ru). Играется на одном устройстве, игроки ходят по очереди.
// Отрезки с начала трека и баллы за угадывание с соответствующей попытки:
const CLIPS_MS = [500, 1000, 2000, 5000, 10000, 20000];
const POINTS = [6, 5, 4, 3, 2, 1];
const clipLabel = (ms: number) => `${String(ms / 1000).replace('.', ',')} с`;
const pointsWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'очко' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'очка' : 'очков';

type Row = { kind: 'skip' } | { kind: 'wrong'; text: string } | { kind: 'right'; text: string };
type Phase = 'loading' | 'guess' | 'reveal' | 'error' | 'final';
type Clip = { key: number; ms: number; state: 'idle' | 'run' | 'done' };
type Preload = { round: number; idx: number; promise: Promise<Track | null | undefined> };

// Выбор треков: поровну с каждого источника, остальные уходят в запас (на случай, если трек не загрузится)
function buildOrder(tracks: Track[], count: number, randomOrder: boolean): { order: number[]; reserve: number[] } {
  const sources = tracks.reduce((m, t) => Math.max(m, (t.source ?? 0) + 1), 1);
  const by: number[][] = Array.from({ length: sources }, () => []);
  tracks.forEach((t, i) => by[t.source ?? 0].push(i));
  const perSource = Math.max(1, Math.min(Math.floor(count / sources), ...by.map(a => a.length)));
  const pools = by.map(a => (randomOrder ? shuffle(a) : a));
  const picked = pools.map(p => p.slice(0, perSource));
  const reserve = shuffle(pools.flatMap(p => p.slice(perSource)));
  const inter: number[] = [];
  for (let k = 0; k < perSource; k++) for (let s = 0; s < sources; s++) if (picked[s][k] !== undefined) inter.push(picked[s][k]);
  return { order: randomOrder ? shuffle(inter) : inter, reserve };
}

const mergeInfo = (old: Track, info: Track): Track => ({
  id: info.id || old.id,
  title: info.title || old.title,
  artist: info.artist || old.artist,
  url: info.url || old.url,
  source: old.source,
  artwork: info.artwork || old.artwork,
});

interface Props { players: SoundCloudPlayer[] | null; playlist: Track[]; config: GameConfig; onExit: () => void; }

export default function SonglessGame({ players, playlist, config, onExit }: Props) {
  const names = config.playerNames;
  const N = Math.max(1, names.length);
  const [built] = useState(() => buildOrder(playlist, config.trackCount, config.randomOrder));
  const total = built.order.length;
  const orderRef = useRef<number[]>(built.order.slice());
  const reserveRef = useRef<number[]>(built.reserve.slice());

  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [stage, setStage] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [text, setText] = useState('');
  const [info, setInfo] = useState<Track | null>(null);
  const [result, setResult] = useState<{ correct: boolean; points: number } | null>(null);
  const [scores, setScores] = useState<number[]>(() => names.map(() => 0));
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [clip, setClip] = useState<Clip>({ key: 0, ms: CLIPS_MS[0], state: 'idle' });
  const [silent, setSilent] = useState(false);
  const [notice, setNotice] = useState('');

  const live = useRef({ round: 0, stage: 0, rows: [] as Row[], phase: 'loading' as Phase, info: null as Track | null });
  live.current = { round, stage, rows, phase, info };
  const awaitRef = useRef<{ token: number; ms: number; idx: number } | null>(null);
  const tokenRef = useRef(0);
  const loadRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const preloadRef = useRef<Preload | null>(null);
  const startedRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const endClipRef = useRef<() => void>(() => {});

  const clearTimers = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    if (safetyRef.current) { clearTimeout(safetyRef.current); safetyRef.current = null; }
  };
  const endClip = () => {
    clearTimers();
    awaitRef.current = null;
    setClip(c => (c.state === 'run' ? { ...c, state: 'done' } : c));
  };
  endClipRef.current = endClip;

  // Звук отрезка отсчитываем от момента, когда плеер реально начал играть (событие PLAY)
  useEffect(() => {
    if (!players) return;
    const offs = players.map((p, i) => p.onPlay(() => {
      const aw = awaitRef.current;
      if (!aw || aw.idx !== i || aw.token !== tokenRef.current) return;
      awaitRef.current = null;
      clearTimers();
      setSilent(false);
      setClip(c => ({ key: c.key + 1, ms: aw.ms, state: 'run' }));
      timerRef.current = setTimeout(() => { players[i].pause(); endClipRef.current(); }, aw.ms);
    }));
    return () => offs.forEach(off => off());
  }, [players]);

  const startClip = async (r: number, st: number, first: boolean) => {
    const p = players?.[r % 2];
    if (!p) return;
    clearTimers();
    const token = ++tokenRef.current;
    awaitRef.current = { token, ms: CLIPS_MS[st], idx: r % 2 };
    setSilent(false);
    setClip(c => ({ key: c.key, ms: CLIPS_MS[st], state: 'idle' }));
    // Если плеер так и не начал играть, считаем, что у трека нет звука
    safetyRef.current = setTimeout(() => { p.pause(); endClipRef.current(); setSilent(true); }, CLIPS_MS[st] + 4000);
    if (first) {
      const ok = await p.startPrepared(false);
      if (token !== tokenRef.current) return;
      if (!ok) { endClipRef.current(); setSilent(true); }
    } else {
      p.playFromStart();
    }
  };

  const preloadNext = (r: number) => {
    const idx = orderRef.current[r];
    if (idx === undefined || !players) return;
    preloadRef.current = { round: r, idx, promise: players[r % 2].prepareTrack(playlist[idx], false, true) };
  };

  const loadRound = async (r: number) => {
    const my = ++loadRef.current;
    setRound(r); setPhase('loading'); setStage(0); setRows([]); setText(''); setResult(null); setInfo(null);
    setSilent(false); setNotice('');
    setClip({ key: 0, ms: CLIPS_MS[0], state: 'idle' });
    let tries = 0;
    for (;;) {
      const idx = orderRef.current[r];
      const p = players![r % 2];
      const track = playlist[idx];
      let got: Track | null | undefined;
      let warmed = false;
      const pre = preloadRef.current;
      if (pre && pre.round === r && pre.idx === idx) got = await pre.promise;
      if (my !== loadRef.current) return;
      if (!got) { got = await p.prepareTrack(track, true); warmed = true; }
      if (my !== loadRef.current || got === undefined) return;
      if (got === null) {
        const nxt = reserveRef.current.shift();
        if (nxt === undefined || ++tries > 5) { setPhase('error'); return; }
        orderRef.current[r] = nxt;
        continue;
      }
      if (!warmed) { await p.warmPrepared(); if (my !== loadRef.current) return; }
      setInfo(mergeInfo(track, got));
      setPhase('guess');
      void startClip(r, 0, true);
      preloadNext(r + 1);
      return;
    }
  };

  useEffect(() => {
    if (!players || startedRef.current) return;
    startedRef.current = true;
    players.forEach(p => p.setStartMode(undefined));
    void loadRound(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  useEffect(() => () => {
    loadRef.current++; tokenRef.current++;
    clearTimers();
    players?.forEach(p => p.detach());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players]);

  useEffect(() => { if (phase === 'guess') inputRef.current?.focus(); }, [phase, stage]);

  const finishRound = (correct: boolean, st: number, rowsBefore: Row[], guess: string) => {
    const L = live.current;
    const r = L.round;
    const track = L.info ?? playlist[orderRef.current[r]];
    const pi = r % N;
    const points = correct ? POINTS[st] : 0;
    const attempts: Attempt[] = rowsBefore.flatMap(x => (x.kind === 'wrong' ? [{ playerIndex: pi, text: x.text, correct: false }] : []));
    if (correct) attempts.push({ playerIndex: pi, text: guess, correct: true });
    endClip();
    setHistory(h => [...h, { track, result: correct ? { kind: 'correct', playerIndex: pi } : { kind: 'nobody' }, attempts }]);
    setScores(s => s.map((v, k) => (k === pi ? v + points : v)));
    setRows(correct ? [...rowsBefore, { kind: 'right', text: `${track.artist} — ${track.title}` }] : rowsBefore);
    setResult({ correct, points });
    setPhase('reveal');
    players?.[r % 2].playFull();
  };

  // Неверный ответ и «Пропустить» одинаково тратят попытку и открывают следующий отрезок
  const advance = (row: Row) => {
    const L = live.current;
    if (L.phase !== 'guess') return;
    const rows2 = [...L.rows, row];
    endClip();
    players?.[L.round % 2].pause();
    if (L.stage >= CLIPS_MS.length - 1) { finishRound(false, L.stage, rows2, ''); return; }
    setRows(rows2); setStage(L.stage + 1); setText('');
    void startClip(L.round, L.stage + 1, false);
  };

  const submit = () => {
    const L = live.current;
    const t = text.trim();
    if (L.phase !== 'guess' || !L.info || !t) return;
    if (!!L.info.title && isCorrectAnswer(t, L.info.title)) {
      players?.[L.round % 2].pause();
      finishRound(true, L.stage, L.rows, t);
    } else {
      advance({ kind: 'wrong', text: t });
    }
  };

  // «Нет звука»: текущий трек заменяется запасным, раунд начинается заново без потери попыток и баллов
  const noSound = () => {
    const L = live.current;
    if (L.phase !== 'guess' && L.phase !== 'loading') return;
    const nxt = reserveRef.current.shift();
    if (nxt === undefined) { setNotice('Запасных треков не осталось. Попробуйте «Послушать» ещё раз или «Пропустить».'); return; }
    const r = L.round;
    tokenRef.current++; loadRef.current++;
    endClip();
    players?.[r % 2].detach();
    orderRef.current[r] = nxt;
    void loadRound(r);
  };

  const next = () => {
    const r = live.current.round;
    endClip();
    players?.[r % 2].detach();
    if (r + 1 >= total) { setPhase('final'); return; }
    void loadRound(r + 1);
  };

  if (phase === 'final') return <FinalScreen names={names} avatars={config.avatars} scores={scores} history={history} onRestart={onExit}/>;
  if (!players) return <section className='glass center-text'><h2>Подключаем SoundCloud...</h2><button className='btn btn-ghost' onClick={onExit}>Назад</button></section>;

  const cur = round % N;
  const turns = Math.floor((total - cur + N - 1) / N);
  const art = info?.artwork ? info.artwork.replace('-large', '-t300x300') : '';
  const nextMs = CLIPS_MS[Math.min(stage + 1, CLIPS_MS.length - 1)];
  const skipLabel = stage < CLIPS_MS.length - 1 ? `Пропустить · ${clipLabel(nextMs)}` : 'Пропустить';

  return <section className='glass sl'>
    <div className='sl-head'>
      <button className='sl-icon-btn' onClick={onExit} aria-label='Назад'><Icon name='arrow-left' size={20}/></button>
      <div className='sl-title'><b>Сонглесс</b><span>по идее songless.ru</span></div>
      <div className='sl-score'><b>{scores[cur] ?? 0}</b><i>/{turns * POINTS[0]}</i><span>очки</span></div>
    </div>
    {N > 1 && <div className='sl-turn'>Ходит: <b>{names[cur]}</b></div>}
    {total <= 10
      ? <div className='sl-chips'>{Array.from({ length: total }, (_, i) => <div key={i} className={`sl-chip ${i === round ? 'on' : i < round ? 'done' : ''}`}>{i + 1}</div>)}</div>
      : <div className='sl-chips'><div className='sl-chip on'>Трек {round + 1} / {total}</div></div>}
    <div className='sl-rows'>{CLIPS_MS.map((ms, i) => {
      const row = rows[i];
      if (row) return <div key={i} className={`sl-row ${row.kind === 'skip' ? 'skip' : row.kind}`}>{row.kind === 'skip' ? 'Пропущено' : row.text}</div>;
      if (phase === 'guess' && i === rows.length) return <div key={i} className='sl-row active'><input ref={inputRef} className='sl-input' value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} placeholder={`Название трека (${clipLabel(ms)} · +${POINTS[i]})`} autoComplete='off'/></div>;
      if (phase === 'guess' || phase === 'loading') return <div key={i} className='sl-row future'>{clipLabel(ms)} · +{POINTS[i]}</div>;
      return <div key={i} className='sl-row future'/>;
    })}</div>
    {phase === 'loading' && <><div className='status'>Загружаем трек...</div><button className='btn btn-ghost' onClick={noSound}><Icon name='mute' size={16}/> Нет звука — заменить трек</button></>}
    {phase === 'error' && <><div className='error'>Не удалось загрузить трек. Возможно, он недоступен в вашей стране.</div><button className='btn btn-primary btn-lg' onClick={next}>{round + 1 >= total ? 'Итоги' : 'Дальше'}</button></>}
    {notice && <div className='toast bad'>{notice}</div>}
    {phase === 'guess' && silent && <div className='toast bad'>Похоже, звука нет. Нажмите «Нет звука» — трек заменится на другой.</div>}
    {phase === 'guess' && <>
      <div className='sl-fill-wrap'><div key={clip.key} className={`sl-fill ${clip.state}`} style={clip.state === 'run' ? { animationDuration: `${clip.ms}ms` } : undefined}/></div>
      <div className='sl-actions'>
        <button className='btn btn-ghost' onClick={() => void startClip(round, stage, false)}><Icon name='play' size={16}/> Послушать</button>
        <button className='btn btn-ghost' onClick={() => advance({ kind: 'skip' })}><Icon name='skip' size={16}/> {skipLabel}</button>
        <button className={`btn ${silent ? 'btn-primary' : 'btn-ghost'}`} onClick={noSound}><Icon name='mute' size={16}/> Нет звука</button>
        <button className='btn btn-primary' onClick={submit} disabled={!text.trim()}>Ответить</button>
      </div>
    </>}
    {phase === 'reveal' && info && result && <>
      <div className='sl-card'>
        {art ? <img className='sl-art' src={art} alt=''/> : <div className='sl-art sl-art-empty'><Icon name='disc' size={40}/></div>}
        <div className='sl-card-info'>
          <div className='sl-card-title'>{info.title}</div>
          <div className='sl-card-artist'>{info.artist}</div>
          <button className='btn btn-ghost sl-listen' onClick={() => players[round % 2].playFull()}><Icon name='play' size={14}/> Послушать</button>
        </div>
        <div className={`sl-card-points ${result.points ? '' : 'zero'}`}><b>+{result.points}</b><span>{pointsWord(result.points)}</span></div>
      </div>
      <button className='btn btn-primary btn-lg' onClick={next}>{round + 1 >= total ? 'Итоги' : 'Следующий трек'}</button>
    </>}
  </section>;
}
