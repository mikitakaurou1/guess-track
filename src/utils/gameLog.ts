import { useSyncExternalStore } from 'react';

export type LogLevel = 'info' | 'ok' | 'warn' | 'error';
export interface LogEntry { id: number; at: number; level: LogLevel; text: string; }

const MAX_ENTRIES = 300;
let entries: LogEntry[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = (): void => { listeners.forEach(l => l()); };

// Журнал игры для админа (панель справа внизу). Хранится только в памяти страницы.
export function gameLog(level: LogLevel, text: string): void {
  entries = [...entries.slice(-(MAX_ENTRIES - 1)), { id: ++seq, at: Date.now(), level, text }];
  if (level === 'error' || level === 'warn') console.warn('[GuessTrack]', text); else console.log('[GuessTrack]', text);
  emit();
}

export function clearGameLog(): void { entries = []; emit(); }

const subscribe = (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const snapshot = (): LogEntry[] => entries;
export const useGameLog = (): LogEntry[] => useSyncExternalStore(subscribe, snapshot, snapshot);
