import type { RoundRecord } from '../types/game';

interface Props {
  record: RoundRecord;
  playerNames: string[];
  isLast?: boolean;
  onNext?: () => void; // у гостей кнопки «Дальше» нет
}

export default function RevealPanel({ record, playerNames, isLast, onNext }: Props) {
  const { result, track, attempts } = record;
  const ok = result.kind === 'correct';
  const verdict =
    result.kind === 'correct'
      ? `Верно! Угадал(а): ${playerNames[result.playerIndex]}`
      : result.kind === 'nobody'
        ? 'Никто не угадал'
        : 'Трек пропущен';

  return (
    <div className={`reveal glass-inner ${ok ? 'ok' : 'bad'}`}>
      <div className="verdict">{ok ? '✅' : result.kind === 'skipped' ? '⏭' : '❌'} {verdict}</div>
      <div className="reveal-title">{track.title || 'Название недоступно'}</div>
      {track.artist && <div className="muted">{track.artist}</div>}

      {attempts.length > 0 && (
        <ul className="attempts">
          {attempts.map((a, i) => (
            <li key={i} className={a.correct ? 'yes' : 'no'}>
              <b>{playerNames[a.playerIndex]}</b>: {a.timeout ? 'не успел(а) ответить' : `«${a.text}»`}
              <span>{a.correct ? ' — верно' : ' — неверно'}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="row center">
        <a className="btn btn-ghost" href={track.url} target="_blank" rel="noreferrer">Открыть в SoundCloud</a>
        {onNext && (
          <button className="btn btn-primary" onClick={onNext}>
            {isLast ? 'К итогам' : 'Дальше ▶'}
          </button>
        )}
      </div>
    </div>
  );
}