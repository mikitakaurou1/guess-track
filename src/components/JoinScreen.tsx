import { useState } from 'react';
import Icon from './Icon';

interface Props {
  initialCode: string;
  busy: boolean;
  error: string | null;
  onJoin: (code: string, name: string) => void;
  onBack: () => void;
}

export default function JoinScreen({ initialCode, busy, error, onJoin, onBack }: Props) {
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState(localStorage.getItem('guestName') ?? '');

  const submit = () => {
    if (code.trim().length < 4) return;
    localStorage.setItem('guestName', name);
    onJoin(code.trim().toUpperCase(), name.trim());
  };

  return (
    <section className="glass">
      <div className="step">Игра по сети</div>
      <h2>Подключиться к комнате</h2>
      <input
        className="input code-input"
        value={code}
        maxLength={4}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="КОД"
      />
      <input
        className="input"
        value={name}
        maxLength={20}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="Ваше имя"
      />
      <button className="btn btn-primary btn-lg" onClick={submit} disabled={busy || code.length < 4}>
        {busy ? 'Подключаемся...' : 'Подключиться'}
      </button>
      <button className="btn btn-ghost btn-lg" onClick={onBack}>
        <Icon name="arrow-left" size={16} /> Я хозяин игры
      </button>
      {error && <div className="error">{error}</div>}
    </section>
  );
}
