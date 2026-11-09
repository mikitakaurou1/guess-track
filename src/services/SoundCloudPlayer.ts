import type { Track } from '../types/game';

export const LOAD_TIMEOUT_MS = 10_000;

export const trackSrc = (t: { id: number; url: string }) =>
  t.id < 0 && t.url ? t.url : `https://api.soundcloud.com/tracks/${t.id}`;

const API_SRC = 'https://w.soundcloud.com/player/api.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

type ProgressListener = (positionMs: number) => void;

// Режим «Не с начала»: зерно игры и длина фрагмента
export interface StartMode { seed: number; clipMs: number; }
const MIN_START_MS = 5000; // не раньше 5-й секунды
const END_MARGIN_MS = 3000; // и не ближе 3 секунд к концу после фрагмента

// Число от 0 до 1, одинаковое для одной и той же строки (хозяин и гости получают одну точку старта)
function hashFrac(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// Точка старта в мс; 0, если длительность неизвестна или трек слишком короткий
function computeStartOffset(durationMs: number, clipMs: number, frac: number): number {
  const maxStart = durationMs - clipMs - END_MARGIN_MS;
  if (!durationMs || maxStart <= MIN_START_MS + 5000) return 0;
  return Math.round(MIN_START_MS + frac * (maxStart - MIN_START_MS));
}

export class SoundCloudPlayer {
  private widget: SCWidget;
  private listeners = new Set<ProgressListener>();
  private playListeners = new Set<() => void>();
  private ready = false; // игнорируем «старые» события прогресса при смене трека
  private token = 0; // защита от одновременных загрузок треков
  private preparedToken = -1;
  private warming = false;
  private warmResolve: (() => void) | null = null;
  private unlockingAudio = false;
  // Контроль старта: виджет может запомнить позицию уже игравшегося трека
  private expectStart = false;
  private expectUntil = 0;
  private expectOffset = 0; // с какой позиции (мс) должен стартовать трек
  private fixCount = 0;
  private lastFix = 0;
  private sawProgress = false;
  private kickToken = 0;
  // Режим «Не с начала»
  private startMode: StartMode | undefined;
  private startOffset = 0; // точка старта текущего подготовленного трека (мс)
  private progressBase = 0; // позиция, от которой считается прогресс фрагмента (мс)

  constructor(iframe: HTMLIFrameElement) {
    this.widget = SC.Widget(iframe);
    this.widget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
      this.sawProgress = true;
      if (this.expectStart && Date.now() < this.expectUntil) {
        // Трек стартовал не оттуда, откуда нужно: возвращаем на точку старта и это событие наружу не отдаём
        if (Math.abs(e.currentPosition - this.expectOffset) > 1500 && this.fixCount < 3) {
          if (Date.now() - this.lastFix > 400) {
            this.lastFix = Date.now();
            this.fixCount++;
            this.widget.seekTo(this.expectOffset);
          }
          return;
        }
        this.expectStart = false;
      }
      if (this.ready) {
        const pos = Math.max(0, e.currentPosition - this.progressBase);
        this.listeners.forEach((l) => l(pos));
      }
    });
    this.widget.bind(SC.Widget.Events.PLAY, () => {
      if (this.warming) {
        this.warmResolve?.();
        return;
      }
      if (this.unlockingAudio) return;
      this.playListeners.forEach((l) => l());
    });
  }

  static loadApi(): Promise<void> {
    if (typeof SC !== 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = API_SRC;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Не удалось загрузить SoundCloud API'));
      document.head.appendChild(s);
    });
  }

  onProgress(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onPlay(listener: () => void): () => void {
    this.playListeners.add(listener);
    return () => this.playListeners.delete(listener);
  }

  // Включить или выключить режим «Не с начала» (действует на треки, которые загружаются после вызова)
  setStartMode(mode: StartMode | undefined): void {
    this.startMode = mode;
  }

  // Начало запуска: включаем проверку позиции по первому событию прогресса
  private markStart(offset: number): void {
    this.expectStart = true;
    this.expectUntil = Date.now() + 3000;
    this.expectOffset = offset;
    this.progressBase = offset;
    this.fixCount = 0;
    this.sawProgress = false;
  }

  // Если после запуска не пришло ни одного события прогресса, повторяем play() (первый мог быть проигнорирован)
  private kick(): void {
    const t = ++this.kickToken;
    [1200, 2600].forEach((ms) =>
      setTimeout(() => {
        if (t === this.kickToken && !this.sawProgress) this.widget.play();
      }, ms),
    );
  }

  // Вызывать прямо из обработчика нажатия (синхронно): на телефоне это даёт браузеру жест пользователя,
  // после которого звук виджета можно запускать без новых нажатий. Работает только если в виджет уже что-то загружено.
  unlock(): void {
    if (this.unlockingAudio) return;
    this.unlockingAudio = true;
    const startedToken = this.token;
    this.setVolume(0);
    this.widget.play();
    setTimeout(() => {
      // Если затем уже началась загрузка трека (token изменился), паузу не ставим: она остановила бы уже запущенный трек
      if (this.token === startedToken) this.widget.pause();
      this.setVolume(100);
      this.unlockingAudio = false;
    }, 400);
  }

  // Остановить плеер и перестать слушать его прогресс (когда звук передан второму плееру)
  detach(): void {
    this.ready = false;
    this.expectStart = false;
    this.kickToken++;
    this.widget.pause();
  }

  loadPlaylist(url: string): Promise<Track[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Таймаут загрузки. Проверьте ссылку: плейлист должен быть публичным.')),
        20000,
      );
      this.widget.load(url, {
        auto_play: false,
        visual: false,
        callback: () => {
          let last = -1;
          let tries = 0;
          const poll = () =>
            this.widget.getSounds((list) => {
              tries++;
              const len = list?.length ?? 0;
              if (len > 0 && (len === last || tries >= 6)) {
                clearTimeout(timeout);
                const seen = new Set<number>();
                const unique = list.filter((s) => {
                  if (seen.has(s.id)) return false;
                  seen.add(s.id);
                  return true;
                });
                resolve(
                  unique.map((s) => ({
                    id: s.id,
                    title: s.title ?? '',
                    artist: s.user?.username ?? '',
                    url: s.permalink_url ?? '',
                    artwork: s.artwork_url || s.user?.avatar_url || undefined,
                  })),
                );
              } else {
                last = len;
                setTimeout(poll, 700);
              }
            });
          poll();
        },
      });
    });
  }

  private getCurrent(timeoutMs = 1500): Promise<Track | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      this.widget.getCurrentSound((s) => {
        clearTimeout(timer);
        resolve(
          s
            ? {
                id: s.id,
                title: s.title ?? '',
                artist: s.user?.username ?? '',
                url: s.permalink_url ?? '',
                artwork: s.artwork_url || s.user?.avatar_url || undefined,
              }
            : null,
        );
      });
    });
  }

  // Длительность загруженного трека в мс (0, если узнать не удалось)
  private getDurationMs(timeoutMs = 2000): Promise<number> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(0), timeoutMs);
      (this.widget as unknown as { getDuration: (cb: (ms: number) => void) => void }).getDuration((ms) => {
        clearTimeout(timer);
        resolve(typeof ms === 'number' && ms > 0 ? ms : 0);
      });
    });
  }

  // Точка старта для загруженного трека: 0, если режим «Не с начала» выключен
  private async pickOffset(src: string): Promise<number> {
    const mode = this.startMode;
    if (!mode) return 0;
    const duration = await this.getDurationMs();
    return computeStartOffset(duration, mode.clipMs, hashFrac(`${mode.seed}:${src}`));
  }

  private loadSrc(src: string): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
      this.widget.load(src, { auto_play: false, visual: false, callback: () => finish(true) });
    });
  }

  private setVolume(v: number): void {
    (this.widget as unknown as { setVolume: (n: number) => void }).setVolume(v);
  }

  // «Прогрев»: беззвучно запускаем трек, чтобы браузер заранее загрузил поток.
  // Тогда настоящий старт происходит почти мгновенно. На iOS громкость не работает — пропускаем.
  // В режиме «Не с начала» прогреваем именно тот участок, с которого будет старт.
  private async warmUp(): Promise<void> {
    if (isIOS) return;
    this.warming = true;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), 2000);
      this.warmResolve = () => {
        clearTimeout(timer);
        resolve();
      };
      this.setVolume(0);
      if (this.startOffset > 0) this.widget.seekTo(this.startOffset);
      this.widget.play();
    });
    this.warmResolve = null;
    await sleep(300); // даём буферу набраться
    this.widget.pause();
    this.widget.seekTo(this.startOffset);
    this.setVolume(100);
    this.warming = false;
  }

  // Хост: прогреть уже подготовленный (предзагруженный) трек.
  // Вызывать только когда другой плеер молчит: два встроенных плеера SoundCloud не играют одновременно,
  // запуск одного ставит на паузу другой.
  async warmPrepared(): Promise<void> {
    if (this.preparedToken !== this.token) return;
    await this.warmUp();
  }

  // Хост, шаг 1: загрузить трек (и прогреть). Без запуска звука.
  // lenient: если плеер загрузил трек, но не успел сообщить его данные, берём данные из списка (для предзагрузки).
  // undefined — запуск устарел, null — трек не загрузился
  async prepareTrack(track: Track, warm: boolean, lenient = false): Promise<Track | null | undefined> {
    const myToken = ++this.token;
    this.ready = false;
    this.expectStart = false;
    this.kickToken++;
    this.startOffset = 0;
    this.widget.pause();

    const loaded = await this.loadSrc(trackSrc(track));
    if (myToken !== this.token) return undefined;
    if (!loaded) return null;

    let info = await this.getCurrent(lenient ? 4000 : 1500);
    if (myToken !== this.token) return undefined;
    if (!info && lenient) info = { ...track };
    if (!info) return null;

    const offset = await this.pickOffset(trackSrc(track));
    if (myToken !== this.token) return undefined;
    this.startOffset = offset;

    if (warm) await this.warmUp();
    if (myToken !== this.token) return undefined;

    this.preparedToken = myToken;
    return info;
  }

  // Хост, шаг 2: запустить подготовленный трек.
  // fast: трек уже прогрет и стоит на точке старта (игра с гостями): события прогресса принимаем сразу, без паузы 400 мс,
  // а если звук не пошёл, повторяем play().
  async startPrepared(fast = false): Promise<boolean> {
    const myToken = this.token;
    if (this.preparedToken !== myToken) return false;
    this.markStart(this.startOffset);
    if (fast) {
      if (isIOS && this.startOffset > 0) this.widget.seekTo(this.startOffset);
      this.widget.play();
      this.ready = true;
      this.kick();
      return true;
    }
    this.widget.seekTo(this.startOffset);
    this.widget.play();
    await sleep(400);
    if (myToken !== this.token) return false;
    this.ready = true;
    return true;
  }

  // Гость: загрузить трек без запуска (с прогревом)
  async loadOnly(src: string, warm = false): Promise<boolean> {
    const myToken = ++this.token;
    this.ready = false;
    this.expectStart = false;
    this.kickToken++;
    this.startOffset = 0;
    this.widget.pause();
    const ok = await this.loadSrc(src);
    if (!ok || myToken !== this.token) return false;
    const offset = await this.pickOffset(src);
    if (myToken !== this.token) return false;
    this.startOffset = offset;
    if (warm) await this.warmUp();
    return myToken === this.token;
  }

  // Гость: запуск уже прогретого трека по общей команде «go»: трек стоит на точке старта, позицию контролируем по первому событию
  playWarmed(): void {
    this.markStart(this.startOffset);
    if (isIOS && this.startOffset > 0) this.widget.seekTo(this.startOffset);
    this.widget.play();
    this.kick();
  }

  playFromStart(): void {
    this.markStart(this.startOffset);
    this.widget.seekTo(this.startOffset);
    this.widget.play();
  }

  // Полное воспроизведение (после ответа): всегда с начала трека
  playFull(): void {
    this.ready = false;
    this.markStart(0);
    this.widget.seekTo(0);
    this.widget.play();
  }

  pause(): void {
    this.expectStart = false;
    this.kickToken++;
    this.widget.pause();
  }

  resume(): void {
    this.expectStart = false;
    this.widget.play();
  }
}
