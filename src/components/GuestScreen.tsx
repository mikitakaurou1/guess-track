import type { GuestSnapshot } from '../types/room';
import type { AudioState } from '../hooks/useGuestAudio';
import PlayerCard from './PlayerCard';
import AnswerPanel from './AnswerPanel';
import RevealPanel from './RevealPanel';
import FinalScreen from './FinalScreen';
import ProgressBar from './ProgressBar';
import Equalizer from './Equalizer';
import Icon from './Icon';
interface Props { snap: GuestSnapshot; myId: string; soundOn: boolean; audioState: AudioState; onToggleSound: () => void; onResync: () => void; onBuzz: (player: number) => void; onAnswer: (text: string) => void; }
export default function GuestScreen({ snap, myId, soundOn, audioState, onBuzz, onAnswer }: Props) {
  const mine = snap.owners.map((o, i) => o === myId ? i : -1).filter(i => i >= 0);
  if (snap.phase === 'setup') return <section className='glass center-text'><h2>Вы в комнате <Icon name='check-circle' size={24} className='ic-ok'/></h2><p className='muted'>Ждём, пока хозяин начнёт игру...</p></section>;
  if (snap.phase === 'final') return <FinalScreen names={snap.names} avatars={snap.avatars} scores={snap.scores} history={snap.history ?? []}/>;
  const canBuzz = snap.phase === 'playing';
  const myTurn = snap.phase === 'answering' && snap.current !== null && mine.includes(snap.current);
  let status = '';
  if (snap.phase === 'loading') status = snap.failStreak > 0 ? 'Трек не отвечает — подбираем другой...' : 'Загружаем трек...';
  else if (snap.phase === 'playing') status = 'Слушайте... кто первый нажмёт?';
  else if (snap.phase === 'answering' && snap.current !== null) status = myTurn ? 'Ваша очередь отвечать!' : `Отвечает: ${snap.names[snap.current]}`;
  const la = snap.lastAttempt;
  return <section className='glass'>
    <div className='round-info'>Трек <b className='grad'>{snap.round + 1}</b> / {snap.total}</div>
    {soundOn && audioState === 'failed' && <div className='toast bad'>Не удалось загрузить этот трек на вашем устройстве (возможно, он недоступен в вашей стране).</div>}
    <Equalizer active={snap.phase === 'playing' || snap.phase === 'reveal'}/><div className='status'>{status}</div>
    {snap.phase !== 'reveal' && <ProgressBar fraction={snap.clipLeft}/>}
    {la && snap.phase !== 'reveal' && <div className='toast bad'><Icon name='x-circle' size={16}/> <b>{snap.names[la.playerIndex]}</b>: {la.timeout ? 'время вышло' : `«${la.text}» — неверно`}</div>}
    <div className='players'>{snap.names.map((name, i) => <PlayerCard key={i} name={name} avatar={snap.avatars?.[i]} index={i} score={snap.scores[i]} active={snap.current === i} locked={snap.locked.includes(i)} remote={!mine.includes(i)} keyHint={mine.includes(i) ? 'это вы' : undefined} disabled={!canBuzz || snap.locked.includes(i) || !mine.includes(i)} onBuzz={() => onBuzz(i)}/>)}</div>
    {snap.phase === 'answering' && snap.current !== null && <AnswerPanel key={snap.answerKey} playerName={snap.names[snap.current]} seconds={snap.answerSeconds} remote={!myTurn} onSubmit={onAnswer} onTimeout={() => {}}/>}
    {snap.phase === 'reveal' && snap.reveal && <RevealPanel record={snap.reveal} playerNames={snap.names}/>}
  </section>;
}
