import type { Track } from '../types/game';

export const LOAD_TIMEOUT_MS = 10_000;

export const trackSrc = (t: { id: number; url: string }) =>
  t.id < 0 && t.url ? t.url : `https://api.soundcloud.com/tracks/${t.id}`;

const API_SRC = 'https://w.soundcloud.com/player/api.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

type ProgressListener = (positionMs: number) => void;

export class SoundCloudPlayer {
  private widget: SCWidget;
  private listeners = new Set<ProgressListener>();
  private playListeners = new Set<() => void>();
  private ready = false; // игнорируем «старые» события прогресса при смене трека
  private token = 0; // защита от одновременных загрузок треков
  private preparedToken = -1;
  private warming = false;
  private warmResolve: (() => void) | null = null;

  constructor(iframe: HTMLIFrameElement) {
    this.widget = SC.Widget(iframe);
    this.widget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
      if (this.ready) this.listeners.forEach((l) => l(e.currentPosition));
    });
    this.widget.bind(SC.Widget.Events.PLAY, () => {
      if (this.warming) {
        this.warmResolve?.();
        return;
      }
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

  private getCurrent(): Promise<Track | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), 1500);
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
      this.widget.play();
    });
    this.warmResolve = null;
    await sleep(300); // даём буферу набраться
    this.widget.pause();
    this.widget.seekTo(0);
    this.setVolume(100);
    this.warming = false;
  }

  // Хост, шаг 1: загрузить трек (и прогреть). Без запуска звука.
  // undefined — запуск устарел, null — трек не загрузился
  async prepareTrack(track: Track, warm: boolean): Promise<Track | null | undefined> {
    const myToken = ++this.token;
    this.ready = false;
    this.widget.pause();

    const loaded = await this.loadSrc(trackSrc(track));
    if (myToken !== this.token) return undefined;
    if (!loaded) return null;

    const info = await this.getCurrent();
    if (myToken !== this.token) return undefined;
    if (!info) return null;

    if (warm) await this.warmUp();
    if (myToken !== this.token) return undefined;

    this.preparedToken = myToken;
    return info;
  }

  // Хост, шаг 2: запустить подготовленный трек
  async startPrepared(): Promise<boolean> {
    const myToken = this.token;
    if (this.preparedToken !== myToken) return false;
    this.widget.seekTo(0);
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
    this.widget.pause();
    const ok = await this.loadSrc(src);
    if (!ok || myToken !== this.token) return false;
    if (warm) await this.warmUp();
    return myToken === this.token;
  }

  playFromStart(): void {
    this.widget.seekTo(0);
    this.widget.play();
  }

  playFull(): void {
    this.ready = false;
    this.widget.seekTo(0);
    this.widget.play();
  }

  pause(): void {
    this.widget.pause();
  }

  resume(): void {
    this.widget.play();
  }
}
