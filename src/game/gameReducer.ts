import type { Attempt, GameConfig, Phase, RoundRecord, RoundResult, Track } from '../types/game';
import { shuffle } from '../utils/shuffle';
import { isCorrectAnswer } from '../utils/answerMatcher';

export interface GameState {
  phase: Phase;
  config: GameConfig | null;
  tracks: Track[];
  order: number[];
  reserve: number[][]; // запасные треки по источникам
  round: number;
  scores: number[];
  locked: number[];
  current: number | null;
  resumePlaying: boolean;
  result: RoundResult | null;
  attempts: Attempt[];
  lastAttempt: Attempt | null;
  history: RoundRecord[];
  attempt: number;
  failStreak: number;
  stalled: boolean;
}

export type GameAction =
  | { type: 'START'; config: GameConfig; tracks: Track[] }
  | { type: 'TRACK_INFO'; trackIndex: number; info: Track }
  | { type: 'TRACK_STARTED' }
  | { type: 'TRACK_FAILED'; attempt: number }
  | { type: 'RETRY' }
  | { type: 'CLIP_ENDED' }
  | { type: 'BUZZ'; player: number }
  | { type: 'ANSWER'; text: string }
  | { type: 'TIMEOUT' }
  | { type: 'SKIP' }
  | { type: 'NEXT' }
  | { type: 'FINISH' }
  | { type: 'RESET' };

export const initialState: GameState = {
  phase: 'setup',
  config: null,
  tracks: [],
  order: [],
  reserve: [],
  round: 0,
  scores: [],
  locked: [],
  current: null,
  resumePlaying: false,
  result: null,
  attempts: [],
  lastAttempt: null,
  history: [],
  attempt: 0,
  failStreak: 0,
  stalled: false,
};

export function selectCurrentTrack(s: GameState): Track | null {
  return s.order.length ? s.tracks[s.order[s.round]] ?? null : null;
}

function endRound(
  state: GameState,
  result: RoundResult,
  attempts: Attempt[],
  patch: Partial<GameState> = {},
): GameState {
  const track = selectCurrentTrack(state);
  return {
    ...state,
    ...patch,
    phase: 'reveal',
    result,
    attempts,
    current: null,
    history: track ? [...state.history, { track, result, attempts }] : state.history,
  };
}

function handleAnswer(state: GameState, attempt: Attempt): GameState {
  if (state.phase !== 'answering' || state.current === null || !state.config) return state;
  const attempts = [...state.attempts, attempt];

  if (attempt.correct) {
    const scores = [...state.scores];
    scores[attempt.playerIndex] += 1;
    return endRound(state, { kind: 'correct', playerIndex: attempt.playerIndex }, attempts, {
      scores,
      lastAttempt: attempt,
    });
  }

  const locked = [...state.locked, attempt.playerIndex];
  if (locked.length >= state.config.playerNames.length) {
    return endRound(state, { kind: 'nobody' }, attempts, { locked, lastAttempt: attempt });
  }
  return {
    ...state,
    attempts,
    locked,
    current: null,
    lastAttempt: attempt,
    phase: state.resumePlaying ? 'playing' : 'clipDone',
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START': {
      const sources = action.tracks.reduce((m, t) => Math.max(m, (t.source ?? 0) + 1), 1);
      const bySource: number[][] = Array.from({ length: sources }, () => []);
      action.tracks.forEach((t, i) => bySource[t.source ?? 0].push(i));

      // поровну с каждого источника
      const perSource = Math.max(
        1,
        Math.min(Math.floor(action.config.trackCount / sources), ...bySource.map((a) => a.length)),
      );
      const pools = bySource.map((a) => (action.config.randomOrder ? shuffle(a) : a));
      const picked = pools.map((p) => p.slice(0, perSource));
      const reserve = pools.map((p) => shuffle(p.slice(perSource)));

      const interleaved: number[] = [];
      for (let k = 0; k < perSource; k++) {
        for (let s = 0; s < sources; s++) {
          if (picked[s][k] !== undefined) interleaved.push(picked[s][k]);
        }
      }
      const order = action.config.randomOrder ? shuffle(interleaved) : interleaved;

      return {
        ...initialState,
        phase: 'loading',
        config: { ...action.config, trackCount: order.length },
        tracks: action.tracks,
        order,
        reserve,
        scores: action.config.playerNames.map(() => 0),
      };
    }

    case 'TRACK_INFO': {
      const old = state.tracks[action.trackIndex];
      if (!old) return state;
      const tracks = [...state.tracks];
      tracks[action.trackIndex] = {
        id: action.info.id || old.id,
        title: action.info.title || old.title,
        artist: action.info.artist || old.artist,
        url: action.info.url || old.url,
        source: old.source,
        artwork: action.info.artwork || old.artwork,
      };
      return { ...state, tracks };
    }

    case 'TRACK_STARTED':
      return state.phase === 'loading' ? { ...state, phase: 'playing', failStreak: 0 } : state;

    case 'TRACK_FAILED': {
      if (state.phase !== 'loading' || state.stalled || action.attempt !== state.attempt) return state;
      const failStreak = state.failStreak + 1;
      if (failStreak >= 4) return { ...state, failStreak, stalled: true };

      // замена треком из того же источника, чтобы сохранить баланс
      const src = state.tracks[state.order[state.round]]?.source ?? 0;
      const pool = state.reserve[src] ?? [];
      if (pool.length) {
        const [next, ...rest] = pool;
        const order = [...state.order];
        order[state.round] = next;
        const reserve = state.reserve.map((r, i) => (i === src ? rest : r));
        return { ...state, order, reserve, attempt: state.attempt + 1, failStreak };
      }
      if (state.round + 1 >= state.order.length) return { ...state, phase: 'final' };
      return {
        ...state,
        round: state.round + 1,
        attempt: state.attempt + 1,
        failStreak,
        locked: [],
        current: null,
        result: null,
        attempts: [],
        lastAttempt: null,
      };
    }

    case 'RETRY':
      return { ...state, stalled: false, failStreak: 0, attempt: state.attempt + 1 };

    case 'CLIP_ENDED':
      // фрагмент закончился: сразу показываем название, без дополнительного времени на ответ
      return state.phase === 'playing' ? endRound(state, { kind: 'nobody' }, state.attempts) : state;

    case 'BUZZ': {
      const ok =
        state.phase === 'playing' &&
        !state.locked.includes(action.player) &&
        action.player >= 0 &&
        action.player < (state.config?.playerNames.length ?? 0);
      if (!ok) return state;
      return {
        ...state,
        phase: 'answering',
        current: action.player,
        resumePlaying: true,
        lastAttempt: null,
      };
    }

    case 'ANSWER': {
      if (state.current === null) return state;
      const track = selectCurrentTrack(state);
      const correct = !!track?.title && isCorrectAnswer(action.text, track.title);
      return handleAnswer(state, {
        playerIndex: state.current,
        text: action.text.trim(),
        correct,
      });
    }

    case 'TIMEOUT':
      if (state.current === null) return state;
      return handleAnswer(state, { playerIndex: state.current, text: '', correct: false, timeout: true });

    case 'SKIP':
      if (state.phase !== 'playing' && state.phase !== 'clipDone') return state;
      return endRound(state, { kind: 'skipped' }, state.attempts);

    case 'NEXT':
      if (state.round + 1 >= state.order.length) return { ...state, phase: 'final' };
      return {
        ...state,
        round: state.round + 1,
        attempt: state.attempt + 1,
        phase: 'loading',
        locked: [],
        current: null,
        result: null,
        attempts: [],
        lastAttempt: null,
      };

    case 'FINISH':
      return { ...state, phase: 'final', current: null };

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}
