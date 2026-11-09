import { useState } from 'react';
import type { RoundRecord } from '../types/game';
import Icon from './Icon';
import Cover from './Cover';

interface Props {
  index: number;
  record: RoundRecord;
  playerNames: string[];
}

const secLabel = (ms: number) => `${String(ms / 1000).replace('.', ',')} с`;
const pointsWord = (n: number) => n % 10 === 1 && n % 100 !== 11 ? 'очко' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? 'очка' : 'очков';

export default function TrackResultCard({ index, record, playerNames }: Props) {
  const [open, setOpen] = useState(false);
  const { track, result, attempts, songless } = record;

  const ok = result.kind === 'correct';
  const badge = songless ? (
    ok && songless.clipMs !== null ? (
      <>
        <Icon name="check" size={14} /> Угадано за {secLabel(songless.clipMs)} · +{songless.points} {pointsWord(songless.points)}
      </>
    ) : (
      <>
        <Icon name="x" size={14} /> Не угадано · 0 очков
      </>
    )
  ) : result.kind === 'correct' ? (
    <>
      <Icon name="check" size={14} /> {playerNames[result.playerIndex]}
    </>
  ) : result.kind === 'nobody' ? (
    <>
      <Icon name="x" size={14} /> Никто не угадал
    </>
  ) : (
    <>
      <Icon name="skip" size={14} /> Пропущен
    </>
  );

  const widgetSrc =
    'https://w.soundcloud.com/player/?url=' + encodeURIComponent(track.url) +
    '&color=%238b5cf6&auto_play=false&hide_related=true&show_comments=false&show_teaser=false&visual=false';

  return (
    <div className={`track-card ${ok ? 'ok' : 'bad'}`}>
      <div className="track-head">
        <span className="track-num">{index + 1}</span>
        <Cover src={track.artwork} size="sm" />
        <div className="track-info">
          <div className="track-title">{track.title || 'Название недоступно'}</div>
          <div className="muted small">{track.artist}</div>
        </div>
        <span className={`badge ${ok ? 'ok' : 'bad'}`}>{badge}</span>
        <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)}>
          {open ? 'Скрыть' : (
            <>
              <Icon name="play" size={14} /> Слушать
            </>
          )}
        </button>
      </div>

      {attempts.length > 0 && (
        <ul className="attempts">
          {attempts.map((a, i) => (
            <li key={i} className={a.correct ? 'yes' : 'no'}>
              {songless ? null : <><b>{playerNames[a.playerIndex]}</b>: </>}{a.timeout ? 'не успел(а)' : `«${a.text}»`}
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
