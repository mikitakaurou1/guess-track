export interface YTPlayerLike { destroy(): void; mute(): void; unMute(): void; playVideo(): void; }
interface YTEvent { target: YTPlayerLike; data: number; }
export interface YTNamespace {
  Player: new (el: HTMLElement, opts: {
    videoId: string;
    playerVars: Record<string, number | string>;
    events: { onReady?: (e: YTEvent) => void; onStateChange?: (e: YTEvent) => void; onError?: (e: YTEvent) => void };
  }) => YTPlayerLike;
}

let apiPromise: Promise<YTNamespace> | null = null;

export function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as unknown as { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (w.YT) resolve(w.YT); else { apiPromise = null; reject(new Error('YouTube API недоступен')); }
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('Не удалось загрузить YouTube API')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}
