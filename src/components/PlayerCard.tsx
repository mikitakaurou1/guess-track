interface Props {
  name: string;
  index: number;
  score: number;
  active: boolean;
  locked: boolean;
  disabled: boolean;
  remote?: boolean;
  keyHint?: string;
  onBuzz: () => void;
}

export default function PlayerCard({ name, index, score, active, locked, disabled, remote, keyHint, onBuzz }: Props) {
  const cls = ['player', active && 'active', locked && 'locked'].filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className="player-head">
        <span className={`avatar c${index}`}>{name.slice(0, 1).toUpperCase()}</span>
        <div>
          <div className="player-name">{name}</div>
          <div className="muted small">{keyHint ?? (remote ? '📱 своё устройство' : '')}</div>
        </div>
        <div className="player-score">{score}</div>
      </div>
      <button
        className="buzz"
        disabled={disabled}
        onClick={(e) => {
          e.currentTarget.blur();
          onBuzz();
        }}
      >
        {locked ? 'Выбыл' : 'ЖМУ!'}
      </button>
    </div>
  );
}