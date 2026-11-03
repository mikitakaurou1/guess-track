import { useState } from 'react';
import type { RoundRecord } from '../types/game';

interface Props {
  index: number;
  record: RoundRecord;
  playerNames: string[];
}

export default function TrackResultCard({ index, record, playerNames }: Props) {
  const [open, setOpen] = useState(false);
  const { track, result, attempts } = record;

  const ok = result.kind === 'correct';
  const badge =
    result.kind === 'correct'
      ? `✅ ${playerNames[result.playerIndex]}`
      : result.kind === 'nobody'
        ? '❌ Никто не угадал'
        : '⏭ Пропущен';

  const widgetSrc =
    'https://w.soundcloud.com/player/?url=' + encodeURIComponent(track.url) +
    '&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_teaser=false&visual=false';

  return (
    <div className={`track-card ${ok ? 'ok' : 'bad'}`}>
      <div className="track-head">
        <span className="track-num">{index + 1}</span>
        <div className="track-info">
          <div className="track-title">{track.title || 'Название недоступно'}</div>
          <div className="muted small">{track.artist}</div>
        </div>
        <span className={`badge ${ok ? 'ok' : 'bad'}`}>{badge}</span>
        <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Скрыть' : '▶ Слушать'}
        </button>
      </div>

      {attempts.length > 0 && (
        <ul className="attempts">
          {attempts.map((a, i) => (
            <li key={i} className={a.correct ? 'yes' : 'no'}>
              <b>{playerNames[a.playerIndex]}</b>: {a.timeout ? 'не успел(а)' : `«${a.text}»`}
              <span>{a.correct ? ' — верно' : ' — неверно'}</span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <iframe
          title={track.title}
          className="sc-widget"
          width="100%"
          height="120"
          allow="autoplay"
          src={widgetSrc}
        />
      )}
    </div>
  );
}