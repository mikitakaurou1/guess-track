import { useEffect } from 'react';
import type { GameState } from '../game/gameReducer';
import type { Track } from '../types/game';
import PlayerCard from './PlayerCard';
import AnswerPanel from './AnswerPanel';
import RevealPanel from './RevealPanel';
import ProgressBar from './ProgressBar';
import Equalizer from './Equalizer';
import Icon from './Icon';
interface Props { state: GameState; track: Track | null; positionMs: number; soundBlocked: boolean; nextBusy: boolean; onEnableSound: () => void; onBuzz: (player: number) => void; onSubmit: (text: string) => void; onTimeout: () => void; onSkip: () => void; onNext: () => void; onFinish: () => void; onRetry: () => void; }
export default function GameScreen({ state, positionMs, soundBlocked, nextBusy, onEnableSound, onBuzz, onSubmit, onTimeout, onSkip, onNext, onFinish, onRetry }: Props) {
  const config = state.config!; const names = config.playerNames; const owners = config.owners ?? names.map(() => null);
  const canBuzz = state.phase === 'playing';
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if ((e.target as HTMLElement).tagName === 'INPUT') return; const n = parseInt(e.key, 10); if (n >= 1 && n <= names.length && owners[n - 1] === null) onBuzz(n - 1); };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [names.length, owners, onBuzz]);
  const clipLeft = state.phase === 'clipDone' || state.phase === 'reveal' ? 0 : Math.max(0, 1 - positionMs / (config.clipSeconds * 1000));
  let status = '';
  if (state.phase === 'loading') status = soundBlocked ? 'Браузер не дал включить звук сам — нажмите кнопку один раз' : state.failStreak > 0 ? 'Трек не отвечает — подбираем другой...' : 'Загружаем трек...';
  else if (state.phase === 'playing') status = 'Слушайте... кто первый нажмёт?';
  else if (state.phase === 'answering' && state.current !== null) status = 'Пауза — идёт ответ';
  const record = state.history[state.history.length - 1]; const la = state.lastAttempt; const total = state.order.length;
  const done = state.round + (state.phase === 'reveal' ? 1 : 0);
  return <section className='glass'>
    <div className='row between'><div className='round-info'>Трек <b className='grad'>{state.round + 1}</b> / {total}</div><button className='btn btn-ghost' onClick={() => confirm('Завершить игру?') && onFinish()}>Завершить</button></div>
    <div className='mini-progress'><div style={{ width: `${done / total * 100}%` }}/></div>
    <Equalizer active={state.phase === 'playing' || state.phase === 'reveal'}/><div className='status'>{status}</div>
    {state.phase !== 'reveal' && <ProgressBar fraction={clipLeft}/>}
    {state.phase === 'loading' && soundBlocked && !state.stalled && <div className='row center'><button className='btn btn-primary btn-lg' onClick={onEnableSound}><Icon name='volume' size={18}/> Включить звук</button></div>}
    {la && state.phase !== 'reveal' && <div className='toast bad'><Icon name='x-circle' size={16}/> <b>{names[la.playerIndex]}</b>: {la.timeout ? 'время вышло' : `«${la.text}» — неверно`}. Право ответа у остальных!</div>}
    {state.stalled && <div className='toast bad'><b>Не удаётся запустить треки.</b> Несколько подряд не загрузились или браузер не дал включить звук. Нажмите «Повторить» — это нажатие разрешает звук на телефоне.<div className='row center'><button className='btn btn-primary' onClick={onRetry}>Повторить</button></div></div>}
    <div className='players'>{names.map((name, i) => <PlayerCard key={i} name={name} avatar={config.avatars?.[i]} index={i} score={state.scores[i]} active={state.current === i} locked={state.locked.includes(i)} remote={owners[i] !== null} keyHint={owners[i] !== null ? undefined : `клавиша ${i + 1}`} disabled={!canBuzz || state.locked.includes(i) || owners[i] !== null} onBuzz={() => onBuzz(i)}/>)}</div>
    {state.phase === 'answering' && state.current !== null && <AnswerPanel key={`${state.round}-${state.locked.length}`} playerName={names[state.current]} seconds={config.answerSeconds} remote={owners[state.current] !== null} onSubmit={onSubmit} onTimeout={onTimeout}/>}
    {state.phase === 'reveal' && record && <RevealPanel record={record} playerNames={names} isLast={state.round + 1 >= total} nextBusy={nextBusy} onNext={onNext}/>}
    {canBuzz && <div className='row end'><button className='btn btn-ghost' onClick={onSkip}><Icon name='skip' size={16}/> Пропустить трек</button></div>}
  </section>;
}
