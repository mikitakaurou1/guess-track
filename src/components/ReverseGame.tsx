import { useEffect, useRef, useState } from 'react';
import type { RoundRecord, Track } from '../types/game';
import { API_BASE } from '../config';
import { shuffle } from '../utils/shuffle';
import { isCorrectAnswer } from '../utils/answerMatcher';
import FinalScreen from './FinalScreen';
import Cover from './Cover';

const BASE = String(import.meta.env.VITE_REVERSE_API_URL || API_BASE).replace(/\/$/, '');
type Session = { tracks: Track[]; reserve: Track[]; seconds: number };
type Phase = 'loading' | 'ready' | 'reveal' | 'error' | 'final';

export default function ReverseGame({ playlist, onExit }: { playlist: Track[]; onExit: () => void }) {
  const [seconds, setSeconds] = useState(10);
  const [count, setCount] = useState(Math.min(10, playlist.length));
  const [session, setSession] = useState<Session | null>(null);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [score, setScore] = useState(0);
  const audio = useRef<HTMLAudioElement>(null);
  const submitted = useRef(false);
  const track = session?.tracks[round];

  useEffect(() => {
    if (!session || !track) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    const timer = setTimeout(() => controller.abort(), 185000);
    submitted.current = false;
    setPhase('loading'); setText(''); setError(''); setNotice(''); setAudioUrl('');
    (async () => {
      try {
        const query = new URLSearchParams({ url: track.url, seconds: String(session.seconds) });
        const response = await fetch(`${BASE}/api/reverse?${query}`, { signal: controller.signal });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || `Сервис обработки вернул ${response.status}`);
        }
        if (!(response.headers.get('content-type') || '').startsWith('audio/')) throw new Error('Сервис не вернул аудио. Проверьте VITE_REVERSE_API_URL и настройку backend.');
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setAudioUrl(objectUrl); setPhase('ready');
      } catch (e) {
        if (!active) return;
        setError(controller.signal.aborted ? 'Истекло время загрузки. Повторите запрос или замените трек.' : (e as Error).message);
        setPhase('error');
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; controller.abort(); clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [session, track, round, retry]);

  useEffect(() => {
    if (phase !== 'ready' || !audioUrl) return;
    void audio.current?.play().catch(() => setNotice('Нажмите кнопку воспроизведения: браузер не разрешил автоматический звук.'));
  }, [phase, audioUrl]);

  const start = () => {
    const all = shuffle(playlist);
    const n = Math.min(all.length, Math.max(1, Math.floor(count) || 1));
    setSession({ tracks: all.slice(0, n), reserve: all.slice(n), seconds: Math.min(60, Math.max(1, seconds || 1)) });
    setRound(0); setHistory([]); setScore(0);
  };
  const finish = (skip: boolean) => {
    if (phase !== 'ready' || !track || submitted.current || (!skip && !text.trim())) return;
    submitted.current = true;
    audio.current?.pause();
    const correct = !skip && isCorrectAnswer(text.trim(), track.title);
    setHistory(h => [...h, { track, result: correct ? { kind: 'correct', playerIndex: 0 } : { kind: 'skipped' }, attempts: skip ? [] : [{ playerIndex: 0, text: text.trim(), correct }] }]);
    if (correct) setScore(s => s + 1);
    setPhase('reveal');
  };
  const replace = () => {
    if (!session || (phase !== 'ready' && phase !== 'error')) return;
    if (!session.reserve.length) { setNotice('Запасных треков нет. Повторите загрузку или вернитесь к настройкам.'); return; }
    audio.current?.pause();
    const [replacement, ...reserve] = session.reserve;
    setSession({ ...session, reserve, tracks: session.tracks.map((t, i) => i === round ? replacement : t) });
  };

  if (!session) return <section className='glass'>
    <div className='step'>Шаг 2 · отдельный режим</div><h2>Перевертыш</h2>
    <p className='muted'>Первые выбранные секунды трека воспроизводятся в обратном направлении. Один ответ на трек, за верный ответ — 1 балл. Одиночная игра, порядок случайный.</p>
    <p className='muted small'>Используйте музыку, на загрузку и обработку которой у вас есть разрешение. Подготовка аудио выполняется сервером; до настройки сервиса на Render режим не сможет воспроизводить треки.</p>
    <label>Длина отрывка: {seconds} с<input className='range' type='range' min={1} max={60} value={seconds} onChange={e => setSeconds(Number(e.target.value))}/></label>
    <label>Количество треков<input className='input' type='number' min={1} max={playlist.length} value={count} onChange={e => setCount(Number(e.target.value))}/></label>
    <button className='btn btn-primary btn-lg' disabled={!playlist.length} onClick={start}>Начать</button>
    <button className='btn btn-ghost' onClick={onExit}>Назад к режимам</button>
  </section>;
  if (phase === 'final') return <><FinalScreen names={['Игрок']} scores={[score]} history={history} onRestart={() => setSession(null)}/><button className='btn btn-ghost' onClick={onExit}>К режимам</button></>;
  return <section className='glass'>
    <div className='row between'><h2>Перевертыш</h2><span>Трек {round + 1} / {session.tracks.length} · {score} очков</span></div>
    {phase === 'loading' && <p className='muted'>Загружаем и переворачиваем отрывок… Это может занять несколько минут.</p>}
    {phase === 'error' && <><div className='error'>{error}</div><div className='row'><button className='btn btn-primary' onClick={() => setRetry(n => n + 1)}>Повторить загрузку</button><button className='btn btn-ghost' onClick={replace}>Заменить трек</button></div></>}
    {notice && <p className='muted small'>{notice}</p>}
    {audioUrl && <audio ref={audio} src={audioUrl} controls preload='auto' style={{ width: '100%' }} onError={() => { setError('Не удалось воспроизвести подготовленный отрывок.'); setPhase('error'); }}/>}
    {phase === 'ready' && <><p className='muted'>Обратный отрывок · до {session.seconds} с</p><form className='answer-form' onSubmit={e => { e.preventDefault(); finish(false); }}><input className='input' aria-label='Название трека' placeholder='Название трека' value={text} onChange={e => setText(e.target.value)}/><button className='btn btn-primary' disabled={!text.trim()}>Ответить</button></form><div className='row'><button className='btn btn-ghost' onClick={() => finish(true)}>Пропустить</button><button className='btn btn-ghost' onClick={replace}>Нет звука — заменить</button></div></>}
    {phase === 'reveal' && track && <><div className='track-card'><div className='track-head'><Cover src={track.artwork} size='sm'/><div className='track-info'><div className='track-title'>{track.title}</div><div className='muted'>{track.artist}</div></div><span className='badge'>{history[history.length - 1]?.result.kind === 'correct' ? '+1 балл' : '0 баллов'}</span></div></div><button className='btn btn-primary btn-lg' onClick={() => { setAudioUrl(''); if (round + 1 === session.tracks.length) setPhase('final'); else setRound(r => r + 1); }}>{round + 1 === session.tracks.length ? 'Итоги' : 'Следующий трек'}</button></>}
    <button className='btn btn-ghost' onClick={onExit}>Выйти в настройки</button>
  </section>;
}
