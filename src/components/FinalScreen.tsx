import type { RoundRecord } from '../types/game';
import TrackResultCard from './TrackResultCard';
import Icon from './Icon';

interface Props {
  names: string[];
  scores: number[];
  history: RoundRecord[];
  onRestart?: () => void;
}

export default function FinalScreen({ names, scores, history, onRestart }: Props) {
  const rows = names
    .map((name, i) => ({ name, score: scores[i], i }))
    .sort((a, b) => b.score - a.score);
  const guessed = history.filter((h) => h.result.kind === 'correct').length;

  return (
    <>
      <section className="glass">
        <h2 className="center-text">Итоги игры</h2>
        <p className="muted center-text">Угадано {guessed} из {history.length}</p>
        <div className="leaderboard">
          {rows.map((r, pos) => (
            <div key={r.i} className={`lb-row ${pos === 0 ? 'first' : ''}`}>
              <span className="lb-pos">
                {pos < 3 ? <Icon name="medal" size={26} className={`m${pos}`} /> : pos + 1}
              </span>
              <span className={`avatar c${r.i}`}>{r.name.slice(0, 1).toUpperCase()}</span>
              <span className="lb-name">{r.name}</span>
              <b className="lb-score">{r.score}</b>
            </div>
          ))}
        </div>
        {onRestart && (
          <div className="row center">
            <button className="btn btn-primary btn-lg" onClick={onRestart}>Играть снова</button>
          </div>
        )}
      </section>

      <section className="glass">
        <h2>Разбор треков</h2>
        <div className="tracks">
          {history.map((rec, i) => (
            <TrackResultCard key={rec.track.id + '-' + i} index={i} record={rec} playerNames={names} />
          ))}
        </div>
      </section>
    </>
  );
}
