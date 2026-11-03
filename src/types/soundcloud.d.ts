interface SCSound {
  id: number;
  title?: string;
  permalink_url?: string;
  user?: { username?: string };
}

interface SCWidget {
  bind(event: string, handler: (e?: any) => void): void;
  load(url: string, options?: Record<string, unknown>): void;
  play(): void;
  pause(): void;
  seekTo(ms: number): void;
  skip(index: number): void;
  getSounds(cb: (sounds: SCSound[]) => void): void;
  getCurrentSound(cb: (sound: SCSound | null) => void): void;
}

declare const SC: {
  Widget: {
    (iframe: HTMLIFrameElement): SCWidget;
    Events: { READY: string; PLAY: string; PLAY_PROGRESS: string; ERROR: string };
  };
};