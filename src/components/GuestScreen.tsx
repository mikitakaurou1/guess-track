import type { GuestSnapshot } from '../types/room';
import PlayerCard from './PlayerCard';
import AnswerPanel from './AnswerPanel';
import RevealPanel from './RevealPanel';
import FinalScreen from './FinalScreen';
import ProgressBar from './ProgressBar';
import Equalizer from './Equalizer';

interface Props {
  snap: GuestSnapshot;
  myId: string;
  onBuzz: (player: number) => void;
  onAnswer: (text: string) => void;
}

export default function GuestScreen({ snap, myId, onBuzz, onAnswer }: Props) {
  const mine = snap.owners.map((o, i) => (o === myId ? i : -1)).filter((i) => i >= 0);

  if (snap.phase === 'setup') {
    return (
      <section className="glass center-text">
        <h2>Вы в комнате ✅</h2>
        <p className="muted">Ждём, пока хозяин начнёт игру...</p>
      </section>
    );
  }

  if (snap.phase === 'final') {
    return <FinalScreen names={snap.names} scores={snap.scores} history={snap.history ?? []} />;
  }

  const canBuzz = snap.phase === 'playing' || snap.phase === 'clipDone';
  const myTurn = snap.phase === 'answering' && snap.current !== null && mine.includes(snap.current);

  let status = '';
  if (snap.phase === 'loading') status = snap.failStreak > 0 ? 'Трек не отвечает — подбираем другой...' : 'Загружаем трек...';
  else if (snap.phase === 'playing') status = 'Слушайте... кто первый нажмёт?';
  else if (snap.phase === 'clipDone') status = 'Фрагмент закончился — можно ещё попробовать';
  else if (snap.phase === 'answering' && snap.current !== null) {
    status = myTurn ? 'Ваша очередь отвечать!' : `Отвечает: ${snap.names[snap.current]}`;
  }

  const la = snap.lastAttempt;

  return (
    <section className="glass">
      <div className="round-info">
        Трек <b className="grad">{snap.round + 1}</b> / {snap.total}
      </div>

      <Equalizer active={snap.phase === 'playing' || snap.phase === 'reveal'} />
      <div className="status">{status}</div>
      {snap.phase !== 'reveal' && <ProgressBar fraction={snap.clipLeft} />}

      {la && snap.phase !== 'reveal' && (
        <div className="toast bad">
          ❌ <b>{snap.names[la.playerIndex]}</b>: {la.timeout ? 'время вышло' : `«${la.text}» — неверно`}
        </div>
      )}

      <div className="players">
        {snap.names.map((name, i) => (
          <PlayerCard
            key={i}
            name={name}
            index={i}
            score={snap.scores[i]}
            active={snap.current === i}
            locked={snap.locked.includes(i)}
            remote={!mine.includes(i)}
            keyHint={mine.includes(i) ? 'это вы' : undefined}
            disabled={!canBuzz || snap.locked.includes(i) || !mine.includes(i)}
            onBuzz={() => onBuzz(i)}
          />
        ))}
      </div>

      {snap.phase === 'answering' && snap.current !== null && (
        <AnswerPanel
          key={snap.answerKey}
          playerName={snap.names[snap.current]}
          seconds={snap.answerSeconds}
          remote={!myTurn}
          onSubmit={onAnswer}
          onTimeout={() => {}}
        />
      )}

      {snap.phase === 'reveal' && snap.reveal && <RevealPanel record={snap.reveal} playerNames={snap.names} />}
    </section>
  );
}