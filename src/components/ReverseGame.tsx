import { useEffect, useRef, useState } from 'react';
import type { GameConfig, RoundRecord, Track } from '../types/game';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { API_BASE } from '../config';
import { shuffle } from '../utils/shuffle';
import { isCorrectAnswer } from '../utils/answerMatcher';
import FinalScreen from './FinalScreen';
import ReverseAudio from './ReverseAudio';
import Icon from './Icon';
import '../styles/reverse.css';

const BASE = String(import.meta.env.VITE_REVERSE_API_URL || API_BASE).replace(/\/$/, '');
type Session = { tracks: Track[]; reserve: Track[]; seconds: number };
type Phase = 'loading' | 'ready' | 'reveal' | 'error' | 'final';
function permalink(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    const parts = u.pathname.split('/').filter(Boolean);
    if (!['http:', 'https:'].includes(u.protocol) || !['soundcloud.com', 'www.soundcloud.com'].includes(u.hostname) || u.port || u.username || u.password || parts.length !== 2 || ['sets', 'likes', 'tracks', 'albums', 'popular-tracks'].includes(parts[1])) return null;
    return `https://soundcloud.com/${parts.join('/')}`;
  } catch { return null; }
}
export default function ReverseGame({ playlist, player, config, onExit }: { playlist: Track[]; player: SoundCloudPlayer | null; config: GameConfig; onExit: () => void }) {
  const [session, setSession] = useState<Session>(() => {
    const all = config.randomOrder ? shuffle(playlist) : playlist.slice();
    const n = Math.min(all.length, Math.max(1, Math.floor(config.trackCount) || 1));
    return { tracks: all.slice(0, n), reserve: all.slice(n), seconds: Math.min(60, Math.max(1, Math.floor(config.clipSeconds) || 10)) };
  });
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [retry, setRetry] = useState(0);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [history, setHistory] = useState<RoundRecord[]>([]);
  const [score, setScore] = useState(0);
  const [resolved, setResolved] = useState<Track | null>(null);
  const cache = useRef(new Map<number, Track>());
  const submitted = useRef(false);
  const track = session.tracks[round];
  const currentTrack = resolved ?? track;
  useEffect(() => {
    if (!track) return;
    const controller = new AbortController();
    let active = true;
    let objectUrl = '';
    let resolving = false;
    const timer = setTimeout(() => controller.abort(), 185000);
    submitted.current = false;
    setPhase('loading'); setText(''); setError(''); setNotice(''); setAudioUrl(''); setResolved(null);
    (async () => {
      try {
        let info = cache.current.get(track.id) ?? track;
        let url = permalink(info.url);
        if (!url) {
          if (!player) throw new Error('Плеер SoundCloud ещё не готов. Нажмите «Повторить загрузку».');
          player.setStartMode(undefined);
          resolving = true;
          const fetched = await player.prepareTrack(track, false);
          resolving = false;
          if (!active || controller.signal.aborted) return;
          player.detach();
          if (!fetched || fetched.id !== track.id) throw new Error('Не удалось получить данные этого трека по ID. Повторите загрузку или замените трек.');
          url = permalink(fetched.url);
          info = { ...track, title: fetched.title || track.title, artist: fetched.artist || track.artist, artwork: fetched.artwork || track.artwork, url: url ?? '' };
        }
        if (!url) throw new Error('SoundCloud не вернул полную ссылку на этот трек. Нажмите «Заменить трек».');
        if (!active || controller.signal.aborted) return;
        info = { ...info, url };
        cache.current.set(track.id, info);
        setResolved(info);
        const query = new URLSearchParams({ url, seconds: String(session.seconds) });
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
    return () => { active = false; controller.abort(); clearTimeout(timer); if (resolving) player?.detach(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [session, track, round, retry, player]);
  const finish = (skip: boolean) => {
    if (phase !== 'ready' || !currentTrack || submitted.current || (!skip && !text.trim())) return;
    submitted.current = true;
    const correct = !skip && isCorrectAnswer(text.trim(), currentTrack.title);
    setHistory(h => [...h, { track: currentTrack, result: correct ? { kind: 'correct', playerIndex: 0 } : skip ? { kind: 'skipped' } : { kind: 'nobody' }, attempts: skip ? [] : [{ playerIndex: 0, text: text.trim(), correct }] }]);
    if (correct) setScore(s => s + 1);
    setPhase('reveal');
  };
  const replace = () => {
    if (phase !== 'ready' && phase !== 'error') return;
    if (!session.reserve.length) { setNotice('Запасных треков нет. Повторите загрузку или вернитесь к настройкам.'); return; }
    const [replacement, ...reserve] = session.reserve;
    setSession({ ...session, reserve, tracks: session.tracks.map((t, i) => i === round ? replacement : t) });
  };
  if (phase === 'final') return <><FinalScreen names={config.playerNames} avatars={config.avatars} scores={[score]} history={history} onRestart={onExit}/><button className='btn btn-ghost' onClick={onExit}>К режимам</button></>;
  return <section className='glass reverse-game'>
    <div className='row between'><h2>Перевертыш</h2><span>Трек {round + 1} / {session.tracks.length} · {score} очков</span></div>
    {phase === 'loading' && <p className='muted'>Получаем ссылку SoundCloud, загружаем и переворачиваем отрывок… Это может занять несколько минут.</p>}
    {phase === 'error' && <><div className='error'>{error}</div><div className='row'><button className='btn btn-primary' onClick={() => setRetry(n => n + 1)}>Повторить загрузку</button><button className='btn btn-ghost' onClick={replace}>Заменить трек</button></div></>}
    {notice && <p className='muted small'>{notice}</p>}
    {audioUrl && (phase === 'ready' || phase === 'reveal') && <ReverseAudio key={audioUrl} src={audioUrl} paused={phase !== 'ready'} onError={() => { setError('Не удалось воспроизвести подготовленный отрывок.'); setPhase('error'); }}/>}
    {phase === 'ready' && <><p className='muted'>Обратный отрывок · до {session.seconds} с</p><form className='answer-form' onSubmit={e => { e.preventDefault(); finish(false); }}><input className='input' aria-label='Название трека' placeholder='Название трека' value={text} onChange={e => setText(e.target.value)}/><button className='btn btn-primary' disabled={!text.trim()}>Ответить</button></form><div className='row'><button className='btn btn-ghost' onClick={() => finish(true)}>Пропустить</button><button className='btn btn-ghost' onClick={replace}>Нет звука — заменить</button></div></>}
    {phase === 'reveal' && currentTrack && <><div className='reverse-card'>
      {currentTrack.artwork ? <img className='reverse-cover' src={currentTrack.artwork.replace('-large', '-t300x300')} alt=''/> : <div className='reverse-cover reverse-cover-empty'><Icon name='disc' size={48}/></div>}
      <div className='reverse-track-info'><div className='reverse-track-title'>{currentTrack.title}</div><div className='muted'>{currentTrack.artist}</div></div>
      <div className='reverse-points'><b className='grad'>{history[history.length - 1]?.result.kind === 'correct' ? '+1' : '0'}</b><span>баллов</span></div>
    </div><button className='btn btn-primary btn-lg' onClick={() => { setAudioUrl(''); if (round + 1 === session.tracks.length) setPhase('final'); else setRound(r => r + 1); }}>{round + 1 === session.tracks.length ? 'Итоги' : 'Следующий трек'}</button></>}
    <button className='btn btn-ghost' onClick={onExit}>Выйти в настройки</button>
  </section>;
}
