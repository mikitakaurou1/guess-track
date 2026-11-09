import type { RoundRecord } from '../types/game';
import TrackResultCard from './TrackResultCard';
import Icon from './Icon';
import Avatar from './Avatar';
import '../styles/awards.css';
interface Props { names: string[]; avatars?: string[]; scores: number[]; history: RoundRecord[]; onRestart?: () => void; }
const fmt = (ms: number) => `${(ms / 1000).toFixed(2)} с`;
const avg = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
export default function FinalScreen({ names, avatars, scores, history, onRestart }: Props) {
  const rows = names.map((name, i) => ({ name, score: scores[i], i })).sort((a, b) => b.score - a.score);
  const guessed = history.filter(h => h.result.kind === 'correct').length;
  const stats = names.map(() => ({ reactions: [] as number[], answers: [] as number[] }));
  let fastest: { i: number; ms: number } | null = null;
  let slowest: { i: number; ms: number } | null = null;
  for (const h of history) {
    for (const a of h.attempts) {
      const s = stats[a.playerIndex];
      if (!s) continue;
      if (typeof a.reactionMs === 'number') { s.reactions.push(a.reactionMs); if (!fastest || a.reactionMs < fastest.ms) fastest = { i: a.playerIndex, ms: a.reactionMs }; }
      if (typeof a.answerMs === 'number') { s.answers.push(a.answerMs); if (!slowest || a.answerMs > slowest.ms) slowest = { i: a.playerIndex, ms: a.answerMs }; }
    }
  }
  const awards = [
    fastest && { key: 'fast', emoji: '⚡', title: 'Скорострел', hint: 'самая быстрая реакция на «Жму»', who: fastest },
    slowest && { key: 'slow', emoji: '🐢', title: 'Тугодум', hint: 'самый долгий ответ', who: slowest },
  ].filter((x): x is NonNullable<typeof x> => !!x);
  const hasStats = stats.some(s => s.reactions.length || s.answers.length);
  return <><section className='glass'><h2 className='center-text'>Итоги игры</h2><p className='muted center-text'>Угадано {guessed} из {history.length}</p><div className='leaderboard'>{rows.map((r, pos) => <div key={r.i} className={`lb-row ${pos === 0 ? 'first' : ''}`}><span className='lb-pos'>{pos < 3 ? <Icon name='medal' size={26} className={`m${pos}`}/> : pos + 1}</span><Avatar id={avatars?.[r.i]} index={r.i}/><span className='lb-name'>{r.name}</span><b className='lb-score'>{r.score}</b></div>)}</div>
    {awards.length > 0 && <div className='awards'>{awards.map(a => <div key={a.key} className='award'><span className='award-emoji'>{a.emoji}</span><div className='award-body'><span className='award-title'>{a.title}</span><span className='award-who'><Avatar id={avatars?.[a.who.i]} index={a.who.i}/><span className='lb-name'>{names[a.who.i]}</span></span><span className='award-time'>{fmt(a.who.ms)} · {a.hint}</span></div></div>)}</div>}
    {hasStats && <div className='pstats'><div className='pstats-row pstats-head'><span>Игрок</span><span>Реакция (в среднем)</span><span>Ответ (в среднем)</span></div>{names.map((name, i) => { const r = avg(stats[i].reactions); const t = avg(stats[i].answers); return <div key={i} className='pstats-row'><span className='pstats-name'><Avatar id={avatars?.[i]} index={i}/><span className='lb-name'>{name}</span></span><span>{r === null ? '—' : fmt(r)}</span><span>{t === null ? '—' : fmt(t)}</span></div>; })}</div>}
    {onRestart && <div className='row center'><button className='btn btn-primary btn-lg' onClick={onRestart}>Играть снова</button></div>}</section><section className='glass'><h2>Разбор треков</h2><div className='tracks'>{history.map((rec, i) => <TrackResultCard key={rec.track.id + '-' + i} index={i} record={rec} playerNames={names}/>)}</div></section></>;
}
