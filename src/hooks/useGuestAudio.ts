import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import type { GuestSnapshot } from '../types/room';
export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'failed';
export function useGuestAudio(player: SoundCloudPlayer | null, snap: GuestSnapshot | null, enabled: boolean, go: { key: string; n: number; at?: number; wait?: number } | null, onReady: (key: string) => void) {
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const loaded = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const prevPhase = useRef<string | null>(null); const startedKey = useRef<string | null>(null);
  const readySent = useRef<string | null>(null); const run = useRef(0); const lastPlayAt = useRef(0);
  const phase = snap?.phase ?? null; const key = snap?.audio?.key ?? null;
  const srcRef = useRef<string | null>(null); srcRef.current = snap?.audio?.src ?? null;
  const origRef = useRef<string | null>(null); origRef.current = snap?.audio?.orig ?? null;
  const phaseRef = useRef(phase); phaseRef.current = phase;
  const keyRef = useRef(key); keyRef.current = key;
  const resultRef = useRef(snap?.reveal?.result.kind); resultRef.current = snap?.reveal?.result.kind;
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady;
  useEffect(() => { if (!player) return; return player.onPlay(() => { lastPlayAt.current = Date.now(); setAudioState('playing'); }); }, [player]);
  const tryPlay = useCallback((fn: () => void) => {
    const t0 = Date.now(); fn();
    setTimeout(() => { const p = phaseRef.current; if (lastPlayAt.current < t0 && (p === 'loading' || p === 'playing' || p === 'reveal')) setAudioState('blocked'); }, 3000);
  }, []);
  useEffect(() => {
    if (!player) return;
    if (!key) { loaded.current = null; startedKey.current = null; readySent.current = null; return; }
    if (!enabled) { if (readySent.current !== key) { readySent.current = key; onReadyRef.current(key); } return; }
    if (!srcRef.current || loaded.current?.key === key) return;
    startedKey.current = null; setAudioState('loading');
    const promise = player.loadOnly(srcRef.current, true); loaded.current = { key, promise };
    promise.then(ok => {
      if (!ok && loaded.current?.key === key) setAudioState('failed');
      if (loaded.current?.key === key && readySent.current !== key) { readySent.current = key; onReadyRef.current(key); }
    });
  }, [player, key, enabled]);
  useEffect(() => {
    if (!player || !go || !enabled) return;
    const cur = loaded.current; if (!cur || cur.key !== go.key || keyRef.current !== go.key) return;
    const goKey = go.key; startedKey.current = goKey;
    const receivedAt = go.at ?? performance.now(); const planned = go.wait ?? 0;
    cur.promise.then(ok => {
      if (!ok) return;
      const wait = Math.max(0, planned - (performance.now() - receivedAt));
      setTimeout(() => { if (startedKey.current === goKey && keyRef.current === goKey) tryPlay(() => player.playWarmed()); }, wait);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);
  useEffect(() => {
    if (!player) return;
    const myRun = ++run.current; const prev = prevPhase.current; prevPhase.current = phase;
    if (!enabled || !phase || !key) { player.pause(); setAudioState('idle'); return; }
    const cur = loaded.current; if (!cur || cur.key !== key) return;
    cur.promise.then(ok => {
      if (myRun !== run.current || !ok) return;
      if (phase === 'playing') {
        if (prev === 'answering') tryPlay(() => player.resume());
        else if (startedKey.current !== key) { startedKey.current = key; tryPlay(() => player.playFromStart()); }
      } else if (phase === 'reveal') {
        const rp = player as unknown as { playOriginal?: (src: string) => void };
        if (origRef.current && rp.playOriginal) { rp.playOriginal(origRef.current); setAudioState('playing'); }
        else if (resultRef.current === 'nobody') { player.resume(); setAudioState('playing'); }
        else tryPlay(() => player.playFromStart());
      } else if (phase === 'loading') {
        if (startedKey.current !== key) { player.pause(); setAudioState('ready'); }
      } else { player.pause(); setAudioState('ready'); }
    });
  }, [player, phase, key, enabled, tryPlay]);
  const resync = useCallback(() => { if (player && (phaseRef.current === 'playing' || phaseRef.current === 'reveal')) player.resume(); }, [player]);
  return { resync, audioState };
}
