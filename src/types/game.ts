export interface Track { id: number; title: string; artist: string; url: string; source?: number; artwork?: string; }
export interface GameConfig { playerNames: string[]; avatars?: string[]; owners: (string | null)[]; clipSeconds: number; answerSeconds: number; trackCount: number; randomOrder: boolean; randomStart?: boolean; startSeed?: number; songless?: boolean; reverse?: boolean; }
export type Phase = 'setup' | 'loading' | 'playing' | 'clipDone' | 'answering' | 'reveal' | 'final';
export interface Attempt { playerIndex: number; text: string; correct: boolean; timeout?: boolean; reactionMs?: number; answerMs?: number; }
export type RoundResult = { kind: 'correct'; playerIndex: number } | { kind: 'nobody' } | { kind: 'skipped' };
export interface RoundRecord { track: Track; result: RoundResult; attempts: Attempt[]; songless?: { clipMs: number | null; points: number }; }
