import { useState } from 'react';
import { useGuestRoom } from '../hooks/useRoom';
import { useGuestAudio } from '../hooks/useGuestAudio';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import JoinScreen from './JoinScreen';
import GuestScreen from './GuestScreen';
import Icon from './Icon';
interface Props { player: SoundCloudPlayer | null; initialCode: string; onBack: () => void; }
export default function GuestApp({ player, initialCode, onBack }: Props) {
  const g = useGuestRoom();
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem('guestSound') !== 'off');
  const { resync, audioState } = useGuestAudio(player, g.snapshot, soundOn && g.status === 'joined', g.go, key => g.send({ k: 'ready', key }));
  const toggleSound = () => setSoundOn(v => { localStorage.setItem('guestSound', v ? 'off' : 'on'); return !v; });
  if (g.status === 'closed') return <section className='glass center-text'><h2>Комната закрыта</h2><p className='muted'>Хозяин вышел или потерялось соединение.</p><button className='btn btn-primary' onClick={g.leave}>Подключиться заново</button></section>;
  if (g.status !== 'joined' || !g.myId) return <JoinScreen initialCode={initialCode} busy={g.status === 'connecting'} error={g.error} onJoin={(code, name) => { player?.unlock(); g.join(code, name); }} onBack={onBack}/>;
  if (!g.snapshot) return <section className='glass center-text'><h2>Подключено <Icon name='check-circle' size={24} className='ic-ok'/></h2><p className='muted'>Получаем состояние игры...</p></section>;
  return <GuestScreen snap={g.snapshot} myId={g.myId} soundOn={soundOn} audioState={audioState} onToggleSound={toggleSound} onResync={resync} onBuzz={playerIndex => g.send({ k: 'buzz', player: playerIndex })} onAnswer={text => g.send({ k: 'answer', text })}/>;
}
