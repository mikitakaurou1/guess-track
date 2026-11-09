import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGuestRoom } from '../hooks/useRoom';
import { useGuestAudio } from '../hooks/useGuestAudio';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { createReversePlayer } from '../services/ReversePlayer';
import JoinScreen from './JoinScreen';
import GuestScreen from './GuestScreen';
import Icon from './Icon';
interface Props { player: SoundCloudPlayer | null; initialCode: string; onBack: () => void; }
export default function GuestApp({ player, initialCode, onBack }: Props) {
  const g = useGuestRoom();
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('guestSound') !== 'off');
  const seconds = useRef(10); seconds.current = g.snapshot?.reverseSeconds ?? 10;
  const reversed = useMemo(() => player ? createReversePlayer(player, () => seconds.current) : null, [player]);
  const reverse = g.snapshot?.reverseSeconds !== undefined;
  const activePlayer = reverse ? reversed : player;
  useEffect(() => { if (reverse) player?.detach(); else reversed?.detach(); }, [reverse, player, reversed]);
  useEffect(() => () => reversed?.detach(), [reversed]);
  const { resync, audioState } = useGuestAudio(activePlayer, g.snapshot, soundOn && g.status === 'joined', g.go, key => g.send({ k: 'ready', key }));
  const rsSeed = g.snapshot?.rs?.seed ?? null;
  const rsClip = g.snapshot?.rs?.clipMs ?? 0;
  useLayoutEffect(() => { activePlayer?.setStartMode(rsSeed === null ? undefined : { seed: rsSeed, clipMs: rsClip }); }, [activePlayer, rsSeed, rsClip]);
  const litWin = useRef<string | null>(null);
  const litAt = useRef(0);
  const snapPhase = g.snapshot?.phase; const snapWin = g.snapshot?.win;
  useEffect(() => {
    if (snapPhase === 'playing' && snapWin && litWin.current !== snapWin) { litWin.current = snapWin; litAt.current = performance.now(); }
  }, [snapPhase, snapWin]);
  const toggleSound = () => setSoundOn(v => { localStorage.setItem('guestSound', v ? 'off' : 'on'); return !v; });
  if (g.status === 'closed') return <section className='glass center-text'><h2>Комната закрыта</h2><p className='muted'>Хозяин вышел или потерялось соединение.</p><button className='btn btn-primary' onClick={g.leave}>Подключиться заново</button></section>;
  if (g.status !== 'joined' || !g.myId) return <JoinScreen initialCode={initialCode} busy={g.status === 'connecting'} error={g.error} onJoin={(code, name) => { player?.unlock(); g.join(code, name); }} onBack={onBack}/>;
  if (!g.snapshot) return <section className='glass center-text'><h2>Подключено <Icon name='check-circle' size={24} className='ic-ok'/></h2><p className='muted'>Получаем состояние игры...</p></section>;
  return <GuestScreen snap={g.snapshot} myId={g.myId} soundOn={soundOn} audioState={audioState} onToggleSound={toggleSound} onResync={resync} onBuzz={playerIndex => {
    const win = g.snapshot?.win;
    const r = win && litWin.current === win ? Math.round(performance.now() - litAt.current) : undefined;
    g.send({ k: 'buzz', player: playerIndex, win, r });
  }} onAnswer={text => g.send({ k: 'answer', text, answerKey: g.snapshot?.answerKey })}/>;
}
