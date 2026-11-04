import type { GuestSnapshot } from '../types/room';
import type { GameState } from './gameReducer';
import { selectCurrentTrack } from './gameReducer';
import { trackSrc } from '../services/SoundCloudPlayer';
export function buildSnapshot(state: GameState, positionMs: number): GuestSnapshot {
  const c = state.config;
  const clipLeft = !c || state.phase === 'clipDone' || state.phase === 'reveal' ? 0 : Math.max(0, 1 - positionMs / (c.clipSeconds * 1000));
  const track = selectCurrentTrack(state);
  const hasAudio = !!track && ['loading', 'playing', 'clipDone', 'answering', 'reveal'].includes(state.phase);
  return {
    phase: state.phase, round: state.round, total: state.order.length,
    names: c?.playerNames ?? [], avatars: c?.avatars ?? [], owners: c?.owners ?? [],
    scores: state.scores, locked: state.locked, current: state.current,
    answerSeconds: c?.answerSeconds ?? 10, answerKey: `${state.round}-${state.locked.length}`,
    clipLeft, lastAttempt: state.lastAttempt,
    reveal: state.phase === 'reveal' ? state.history[state.history.length - 1] ?? null : null,
    history: state.phase === 'final' ? state.history : null, failStreak: state.failStreak,
    audio: hasAudio ? { key: `${state.round}:${state.order[state.round]}`, src: trackSrc(track!) } : null,
  };
}
