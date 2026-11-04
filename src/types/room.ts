import type { Attempt, Phase, RoundRecord } from './game';
export interface GuestInfo { id: string; name: string; avatar?: string; }
export interface GuestSnapshot {
  phase: Phase; round: number; total: number; names: string[]; avatars?: string[];
  owners: (string | null)[]; scores: number[]; locked: number[]; current: number | null;
  answerSeconds: number; answerKey: string; clipLeft: number; lastAttempt: Attempt | null;
  reveal: RoundRecord | null; history: RoundRecord[] | null; failStreak: number;
  audio: { key: string; src: string } | null;
}
