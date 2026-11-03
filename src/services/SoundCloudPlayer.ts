import type { Track } from '../types/game';

export const LOAD_TIMEOUT_MS = 10_000;

const API_SRC = 'https://w.soundcloud.com/player/api.js';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ProgressListener = (positionMs: number) => void;

export class SoundCloudPlayer {
  private widget: SCWidget;
  private listeners = new Set<ProgressListener>();
  private ready = false; // игнорируем «старые» события прогресса при смене трека
  private token = 0; // защита от одновременных загрузок треков

  constructor(iframe: HTMLIFrameElement) {
    this.widget = SC.Widget(iframe);
    this.widget.bind(SC.Widget.Events.PLAY_PROGRESS, (e) => {
      if (this.ready) this.listeners.forEach((l) => l(e.currentPosition));
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

                // убираем дубликаты по id
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
              }
            : null,
        );
      });
    });
  }

  // undefined — запуск устарел (начали другой), null — трек не загрузился
  async playTrack(track: Track): Promise<Track | null | undefined> {
    const myToken = ++this.token;
    this.ready = false;
    this.widget.pause();

    const src =
      track.id < 0 && track.url
        ? track.url
        : `https://api.soundcloud.com/tracks/${track.id}`;

    const loaded = await new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
      this.widget.bind(SC.Widget.Events.ERROR, () => finish(false));
      this.widget.load(src, { auto_play: false, visual: false, callback: () => finish(true) });
    });
    if (myToken !== this.token) return undefined;
    if (!loaded) return null;

    const info = await this.getCurrent();
    if (myToken !== this.token) return undefined;
    if (!info) return null;

    this.widget.seekTo(0);
    this.widget.play();
    await sleep(400);
    if (myToken === this.token) this.ready = true;
    return info;
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