import type { GameState } from './gameReducer';

// Справедливый выбор «кто нажал первым» в играх с гостями.
// Каждый игрок меряет время реакции от загорания СВОЕЙ кнопки до нажатия (по своим часам),
// хозяин сравнивает эти времена, а не порядок прихода сообщений по сети.

export const DEFAULT_RTT_MS = 250; // пинг гостя, если замеров ещё нет
const MAX_WAIT_MS = 500; // дольше этого окно ожидания не длится
const JITTER_MS = 30; // запас на дрожание сети

// Номер «окна нажатия»: меняется при каждой новой возможности нажать (новый трек, попытка, выбывший игрок)
export const windowKey = (s: GameState): string => `${s.round}:${s.attempt}:${s.locked.length}`;

export interface BuzzCandidate {
  player: number;
  owner: string | null; // id гостя или null, если нажал хозяин
  r: number; // время реакции, мс
  at: number; // когда нажатие дошло до хозяина (performance.now)
}

// Замеры времени «туда и обратно» по каждому гостю
export class RttTracker {
  private samples = new Map<string, number[]>();

  add(id: string, ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0 || ms > 5000) return;
    const arr = this.samples.get(id) ?? [];
    arr.push(ms);
    if (arr.length > 7) arr.shift();
    this.samples.set(id, arr);
  }

  private sorted(id: string): number[] | null {
    const a = this.samples.get(id);
    return a && a.length ? [...a].sort((x, y) => x - y) : null;
  }

  median(id: string): number | null {
    const s = this.sorted(id);
    return s ? s[Math.floor((s.length - 1) / 2)] : null;
  }

  // Верхняя оценка (75-й процентиль): для длины окна ожидания
  high(id: string): number {
    const s = this.sorted(id);
    return s ? s[Math.floor((s.length - 1) * 0.75)] : DEFAULT_RTT_MS;
  }
}

// Время реакции гостя. Присланное значение зажимается около оценки по времени прихода,
// чтобы ошибки и подделка не давали выигрыш; без значения берём саму оценку.
export function reactionFromGuest(reported: unknown, arrival: number, litAt: number, rtt: number | null): number {
  const est = Math.max(0, arrival - litAt - (rtt ?? 0));
  const tol = rtt === null ? 500 : 250;
  if (typeof reported === 'number' && Number.isFinite(reported) && reported >= 0) {
    return Math.max(0, Math.min(Math.max(reported, est - tol), est + tol));
  }
  return est;
}

// Сколько ждать после первого нажатия: пока не успеет дойти нажатие более быстрого, но более «далёкого» игрока
export function arbitrationWaitMs(first: BuzzCandidate, s: GameState, rtt: RttTracker): number {
  const owners = s.config?.owners ?? [];
  const firstRtt = first.owner === null ? 0 : (rtt.median(first.owner) ?? DEFAULT_RTT_MS);
  const seen = new Set<string>();
  let others = 0;
  owners.forEach((o, i) => {
    if (o === null || o === first.owner || s.locked.includes(i) || seen.has(o)) return;
    seen.add(o);
    others = Math.max(others, rtt.high(o));
  });
  const wait = others - firstRtt;
  return wait <= 0 ? 0 : Math.min(MAX_WAIT_MS, wait + JITTER_MS);
}

// Победитель: наименьшее время реакции, при равенстве тот, чьё нажатие пришло раньше
export function pickWinner(cands: BuzzCandidate[]): BuzzCandidate {
  return cands.reduce((best, c) => (c.r < best.r || (c.r === best.r && c.at < best.at) ? c : best));
}
