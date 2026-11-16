import { SoundCloudPlayer, trackSrc } from './SoundCloudPlayer';
import { adminBlockRegion, adminMarkRegionOk, adminReplaceTrack, adminRepostCandidates, artistLabel, fetchArtistPool, type RepostCandidate } from './artistsApi';
import { repairCount, takeRepair } from './repairQueue';
import { gameLog } from '../utils/gameLog';
import type { Track } from '../types/game';

// Проверка «играет ли трек у меня». SoundCloud решает по IP смотрящего, поэтому сервер это узнать не может:
// проверяем в браузере админа (в Беларуси — по Беларуси) скрытым виджетом без звука.
const SRC = 'https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/';
const LOAD_MS = 8000;
const PLAY_MS = 6000;
const MAX_REPOSTS_TRIED = 5;
const OK_MARK_BATCH = 25;

interface LooseWidget {
  bind(ev: string, cb: (e?: any) => void): void;
  unbind(ev: string): void;
  load(url: string, opts: object): void;
  play(): void;
  pause(): void;
  setVolume(v: number): void;
  getCurrentSound(cb: (s: unknown) => void): void;
}
interface ProbeResult { verdict: 'ok' | 'blocked'; why: string; }

class Prober {
  private events: Record<string, string>;
  constructor(private w: LooseWidget) { this.events = SC.Widget.Events as unknown as Record<string, string>; }

  async check(src: string): Promise<ProbeResult> {
    const w = this.w;
    try { w.pause(); } catch { /* нечего останавливать */ }
    const loaded = await new Promise<boolean>(resolve => {
      const t = setTimeout(() => resolve(false), LOAD_MS);
      w.load(src, { auto_play: false, visual: false, callback: () => { clearTimeout(t); resolve(true); } });
    });
    if (!loaded) return { verdict: 'blocked', why: 'виджет не загрузил трек за 8 с' };
    const sound = await new Promise<unknown>(resolve => {
      const t = setTimeout(() => resolve(null), 3000);
      w.getCurrentSound(s => { clearTimeout(t); resolve(s); });
    });
    if (!sound) return { verdict: 'blocked', why: 'плеер не вернул данные трека' };
    const progress = this.events.PLAY_PROGRESS ?? 'playProgress';
    const error = this.events.ERROR ?? 'error';
    return new Promise<ProbeResult>(resolve => {
      let done = false;
      const finish = (r: ProbeResult) => {
        if (done) return;
        done = true; clearTimeout(timer);
        try { w.unbind(progress); w.unbind(error); w.pause(); w.setVolume(100); } catch { /* виджет уже закрыт */ }
        resolve(r);
      };
      const timer = setTimeout(() => finish({ verdict: 'blocked', why: 'звук не пошёл за 6 с' }), PLAY_MS);
      w.bind(error, () => finish({ verdict: 'blocked', why: 'плеер показал ошибку (трек недоступен)' }));
      w.bind(progress, e => { if ((e?.currentPosition ?? 0) > 0) finish({ verdict: 'ok', why: 'играет' }); });
      w.setVolume(0);
      w.play();
    });
  }
}

let proberPromise: Promise<Prober> | null = null;
function getProber(): Promise<Prober> {
  if (!proberPromise) {
    proberPromise = (async () => {
      await SoundCloudPlayer.loadApi();
      const iframe = document.createElement('iframe');
      iframe.title = 'soundcloud-check'; iframe.allow = 'autoplay'; iframe.src = SRC;
      Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '300px', height: '166px', border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1' });
      document.body.appendChild(iframe);
      await new Promise<void>(resolve => { const t = setTimeout(resolve, 5000); iframe.addEventListener('load', () => { clearTimeout(t); resolve(); }, { once: true }); });
      return new Prober(SC.Widget(iframe) as unknown as LooseWidget);
    })().catch(e => { proberPromise = null; throw e; });
  }
  return proberPromise;
}

const nameOf = (t: { id: number; title: string; artist?: string }): string => `«${t.title}»${t.artist ? ` — ${t.artist}` : ''} [${t.id}]`;
const candidateSrc = (c: RepostCandidate): string => trackSrc({ id: c.id, url: c.url });

let busy = false;
let stopFlag = false;
export const isRegionCheckBusy = (): boolean => busy;
export const stopRegionCheck = (): void => { stopFlag = true; };

// Ищем перезалив трека на SoundCloud и проверяем его воспроизведением. Возвращает первый рабочий вариант.
async function findRepost(prober: Prober, artistId: string, trackId: number, name: string): Promise<RepostCandidate | null> {
  let list: RepostCandidate[] = [];
  try { list = await adminRepostCandidates(artistId, trackId); }
  catch (e) { gameLog('warn', `Поиск перезаливов не удался (${name}): ${(e as Error).message}`); return null; }
  if (!list.length) { gameLog('info', `Перезаливов не найдено: ${name}`); return null; }
  gameLog('info', `Перезаливов найдено: ${list.length}, проверяем в вашем регионе: ${name}`);
  for (const c of list.slice(0, MAX_REPOSTS_TRIED)) {
    if (stopFlag) return null;
    const r = await prober.check(candidateSrc(c));
    gameLog(r.verdict === 'ok' ? 'ok' : 'warn', `Перезалив ${nameOf(c)}: ${r.verdict === 'ok' ? 'играет' : r.why}`);
    if (r.verdict === 'ok') return c;
  }
  return null;
}

// Трек недоступен: заменяем рабочим перезаливом, а если его нет — открепляем (пропускаем). alreadyUnpinned: трек уже убран из каталога.
async function repairTrack(prober: Prober, artistId: string, t: { id: number; title: string; artist?: string }, alreadyUnpinned: boolean): Promise<'replaced' | 'dropped' | 'kept'> {
  const name = nameOf(t);
  const rep = await findRepost(prober, artistId, t.id, name);
  if (rep) {
    try {
      await adminReplaceTrack(artistId, t.id, rep.id);
      gameLog('ok', `Заменён перезаливом: ${name} → ${nameOf(rep)}`);
      return 'replaced';
    } catch (e) { gameLog('warn', `Не удалось заменить ${name}: ${(e as Error).message}`); }
  }
  if (alreadyUnpinned) { gameLog('info', `Трек остаётся откреплённым (перезалива нет): ${name}`); return 'kept'; }
  try {
    await adminBlockRegion(artistId, t.id);
    gameLog('ok', `Откреплён, рабочего перезалива нет: ${name}`);
    return 'dropped';
  } catch (e) { gameLog('warn', `Не удалось открепить ${name}: ${(e as Error).message}`); return 'kept'; }
}

export interface RegionSummary { summary: string; aborted: boolean; }

// Проверяет все ещё не проверенные треки артиста. Недоступные применяем только в конце и только если большая часть треков сыграла
// (иначе случайный сбой, например запрет автозапуска в браузере, открепил бы живые треки).
export async function checkArtistRegion(artistId: string, onProgress: (text: string) => void): Promise<RegionSummary> {
  if (busy) throw new Error('Проверка уже идёт');
  busy = true; stopFlag = false;
  const label = artistLabel(artistId);
  try {
    const pool = await fetchArtistPool(artistId);
    const todo = pool.filter(t => !t.checked && !(t as Track & { manual?: boolean }).manual);
    if (!todo.length) { const s = 'Все треки уже проверены в вашем регионе'; gameLog('info', `${label}: ${s}`); return { summary: s, aborted: false }; }
    gameLog('info', `Проверка «${label}» в вашем регионе: ${todo.length} треков (звук выключен, страницу не закрывайте)`);
    const prober = await getProber();
    const okIds: number[] = []; const failed: Track[] = [];
    let checked = 0; let okCount = 0; let aborted = false; let stopped = false;
    const flushOk = async () => {
      if (!okIds.length) return;
      const ids = okIds.splice(0, okIds.length);
      try { await adminMarkRegionOk(artistId, ids); } catch (e) { gameLog('warn', `Не удалось сохранить отметки «проверен»: ${(e as Error).message}`); }
    };
    for (const t of todo) {
      if (stopFlag) { stopped = true; break; }
      onProgress(`Проверено ${checked} из ${todo.length}, работают: ${okCount}`);
      const r = await prober.check(trackSrc(t));
      checked++;
      if (r.verdict === 'ok') { okCount++; okIds.push(t.id); gameLog('ok', `Играет: ${nameOf(t)}`); if (okIds.length >= OK_MARK_BATCH) await flushOk(); }
      else { failed.push(t); gameLog('warn', `Не играет: ${nameOf(t)} — ${r.why}`); }
      if (okCount === 0 && checked >= 8) { aborted = true; gameLog('error', 'Ни один из первых 8 треков не заиграл. Вероятно, браузер не даёт воспроизводить звук в скрытом плеере. Проверка остановлена, треки не тронуты'); break; }
    }
    await flushOk();
    if (!aborted && checked >= 15 && okCount / checked < 0.1) {
      aborted = true;
      gameLog('error', `Играет только ${okCount} из ${checked}. Такое бывает при сбое сети или блокировке автозапуска: треки не тронуты`);
    }
    let replaced = 0; let dropped = 0;
    if (!aborted) {
      stopFlag = false;
      for (const t of failed) {
        const res = await repairTrack(prober, artistId, t, false);
        if (res === 'replaced') replaced++; else if (res === 'dropped') dropped++;
      }
    }
    const summary = aborted ? `Проверка остановлена без изменений (работает ${okCount} из ${checked})`
      : `${stopped ? 'Остановлено. ' : ''}Проверено ${checked}: работают ${okCount}, заменено перезаливами ${replaced}, откреплено ${dropped}`;
    gameLog(aborted ? 'warn' : 'ok', `${label}: ${summary}`);
    return { summary, aborted };
  } finally { busy = false; }
}

// После игры: для треков, откреплённых из-за незагрузки, ищем перезаливы, доступные в регионе админа
export async function processRepairQueue(): Promise<void> {
  if (busy || !repairCount()) return;
  busy = true; stopFlag = false;
  try {
    const prober = await getProber();
    let item = takeRepair();
    while (item) {
      await repairTrack(prober, item.artistId, { id: item.trackId, title: `трек ${item.trackId}` }, true);
      item = takeRepair();
    }
  } catch (e) { gameLog('error', `Поиск перезаливов: ${(e as Error).message}`); }
  finally { busy = false; }
}
