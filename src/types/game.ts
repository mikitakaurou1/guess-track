export interface Track {
  id: number;
  title: string;
  artist: string;
  url: string;
  source?: number; // индекс источника (профиль/плейлист)
  artwork?: string; // обложка (узнаём, когда трек загружен в плеер)
}

export interface GameConfig {
  playerNames: string[];
  owners: (string | null)[]; // null — играет на устройстве хоста, иначе id гостя
  clipSeconds: number;
  answerSeconds: number;
  trackCount: number;
  randomOrder: boolean;
}

export type Phase =
  | 'setup'
  | 'loading'
  | 'playing'
  | 'clipDone'
  | 'answering'
  | 'reveal'
  | 'final';

export interface Attempt {
  playerIndex: number;
  text: string;
  correct: boolean;
  timeout?: boolean;
}

export type RoundResult =
  | { kind: 'correct'; playerIndex: number }
  | { kind: 'nobody' }
  | { kind: 'skipped' };

export interface RoundRecord {
  track: Track;
  result: RoundResult;
  attempts: Attempt[];
}
