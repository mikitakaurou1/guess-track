import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import type { GuestSnapshot } from '../types/room';

export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'failed';

export function useGuestAudio(
  player: SoundCloudPlayer | null,
  snap: GuestSnapshot | null,
  enabled: boolean,
) {
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const loaded = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const prevPhase = useRef<string | null>(null);
  const run = useRef(0);
  const lastPlayAt = useRef(0);

  const phase = snap?.phase ?? null;
  const key = snap?.audio?.key ?? null;
  const srcRef = useRef<string | null>(null);
  srcRef.current = snap?.audio?.src ?? null;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // Событие «виджет реально начал играть»
  useEffect(() => {
    if (!player) return;
    return player.onPlay(() => {
      lastPlayAt.current = Date.now();
      setAudioState('playing');
    });
  }, [player]);

  useEffect(() => {
    if (!player) return;
    const myRun = ++run.current;
    const prev = prevPhase.current;
    prevPhase.current = phase;

    if (!enabled || !phase || !key || !srcRef.current) {
      player.pause();
      setAudioState('idle');
      return;
    }

    // трек грузим один раз на раунд, заранее (пока у хоста идёт загрузка)
    if (loaded.current?.key !== key) {
      console.log('[guestAudio] загружаем', key, srcRef.current);
      setAudioState('loading');
      loaded.current = { key, promise: player.loadOnly(srcRef.current) };
    }

    // если за 3 секунды событие PLAY не пришло — браузер заблокировал звук
    const tryPlay = (fn: () => void) => {
      const t0 = Date.now();
      fn();
      setTimeout(() => {
        if (myRun === run.current && lastPlayAt.current < t0) {
          console.warn('[guestAudio] воспроизведение не началось (автозапуск заблокирован?)');
          setAudioState('blocked');
        }
      }, 3000);
    };

    loaded.current.promise.then((ok) => {
      if (myRun !== run.current) return;
      if (!ok) {
        console.warn('[guestAudio] трек не загрузился на этом устройстве');
        setAudioState('failed');
        return;
      }
      if (phase === 'playing') {
        tryPlay(() => (prev === 'answering' ? player.resume() : player.playFromStart()));
      } else if (phase === 'reveal') {
        tryPlay(() => player.playFromStart());
      } else {
        player.pause();
        setAudioState('ready');
      }
    });
  }, [player, phase, key, enabled]);

  // Кнопка «Включить звук» — запуск по жесту пользователя
  const resync = useCallback(() => {
    if (!player) return;
    if (phaseRef.current === 'playing' || phaseRef.current === 'reveal') player.resume();
  }, [player]);

  return { resync, audioState };
}
