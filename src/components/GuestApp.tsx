import { useGuestRoom } from '../hooks/useRoom';
import JoinScreen from './JoinScreen';
import GuestScreen from './GuestScreen';

export default function GuestApp({ initialCode, onBack }: { initialCode: string; onBack: () => void }) {
  const g = useGuestRoom();

  if (g.status === 'closed') {
    return (
      <section className="glass center-text">
        <h2>Комната закрыта</h2>
        <p className="muted">Хозяин вышел или потерялось соединение.</p>
        <button className="btn btn-primary" onClick={g.leave}>Подключиться заново</button>
      </section>
    );
  }

  if (g.status !== 'joined' || !g.myId) {
    return (
      <JoinScreen
        initialCode={initialCode}
        busy={g.status === 'connecting'}
        error={g.error}
        onJoin={g.join}
        onBack={onBack}
      />
    );
  }

  if (!g.snapshot) {
    return (
      <section className="glass center-text">
        <h2>Подключено ✅</h2>
        <p className="muted">Получаем состояние игры...</p>
      </section>
    );
  }

  return (
    <GuestScreen
      snap={g.snapshot}
      myId={g.myId}
      onBuzz={(player) => g.send({ k: 'buzz', player })}
      onAnswer={(text) => g.send({ k: 'answer', text })}
    />
  );
}