import { useCallback, useEffect, useRef, useState } from 'react';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import type { GuestSnapshot } from '../types/room';

export type AudioState = 'idle' | 'loading' | 'ready' | 'playing' | 'blocked' | 'failed';

export function useGuestAudio(
  player: SoundCloudPlayer | null,
  snap: GuestSnapshot | null,
  enabled: boolean,
  go: { key: string; n: number } | null,
  onReady: (key: string) => void,
) {
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const loaded = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const prevPhase = useRef<string | null>(null);
  const startedKey = useRef<string | null>(null);
  const readySent = useRef<string | null>(null);
  const run = useRef(0);
  const lastPlayAt = useRef(0);

  const phase = snap?.phase ?? null;
  const key = snap?.audio?.key ?? null;
  const srcRef = useRef<string | null>(null);
  srcRef.current = snap?.audio?.src ?? null;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const keyRef = useRef(key);
  keyRef.current = key;
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  // Событие «виджет реально начал играть»
  useEffect(() => {
    if (!player) return;
    return player.onPlay(() => {
      lastPlayAt.current = Date.now();
      setAudioState('playing');
    });
  }, [player]);

  // Запуск с проверкой: если за 3 секунды событие PLAY не пришло — браузер заблокировал звук
  const tryPlay = useCallback((fn: () => void) => {
    const t0 = Date.now();
    fn();
    setTimeout(() => {
      const p = phaseRef.current;
      if (lastPlayAt.current < t0 && (p === 'loading' || p === 'playing' || p === 'reveal')) {
        console.warn('[guestAudio] воспроизведение не началось (автозапуск заблокирован?)');
        setAudioState('blocked');
      }
    }, 3000);
  }, []);

  // 1. Заранее грузим и «прогреваем» трек раунда, потом сообщаем хосту, что готовы
  useEffect(() => {
    if (!player) return;
    if (!key) {
      loaded.current = null;
      startedKey.current = null;
      readySent.current = null;
      return;
    }
    if (!enabled) {
      if (readySent.current !== key) {
        readySent.current = key;
        onReadyRef.current(key);
      }
      return;
    }
    if (!srcRef.current || loaded.current?.key === key) return;

    startedKey.current = null;
    setAudioState('loading');
    const promise = player.loadOnly(srcRef.current, true);
    loaded.current = { key, promise };
    promise.then((ok) => {
      if (!ok) {
        console.warn('[guestAudio] трек не загрузился на этом устройстве');
        if (loaded.current?.key === key) setAudioState('failed');
      }
      if (loaded.current?.key === key && readySent.current !== key) {
        readySent.current = key;
        onReadyRef.current(key);
      }
    });
  }, [player, key, enabled]);

  // 2. Сигнал «старт» от хоста — включаем звук сразу, не дожидаясь смены фазы
  useEffect(() => {
    if (!player || !go || !enabled) return;
    const cur = loaded.current;
    if (!cur || cur.key !== go.key || keyRef.current !== go.key) return;
    const goKey = go.key;
    startedKey.current = goKey;
    cur.promise.then((ok) => {
      if (!ok || startedKey.current !== goKey) return;
      tryPlay(() => player.resume());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [go]);

  // 3. Фазы игры: пауза во время ответа, продолжение, полный трек на раскрытии
  useEffect(() => {
    if (!player) return;
    const myRun = ++run.current;
    const prev = prevPhase.current;
    prevPhase.current = phase;

    if (!enabled || !phase || !key) {
      player.pause();
      setAudioState('idle');
      return;
    }
    const cur = loaded.current;
    if (!cur || cur.key !== key) return;

    cur.promise.then((ok) => {
      if (myRun !== run.current || !ok) return;
      if (phase === 'playing') {
        if (prev === 'answering') {
          tryPlay(() => player.resume());
        } else if (startedKey.current !== key) {
          // запасной вариант: сигнал «старт» не дошёл
          startedKey.current = key;
          tryPlay(() => player.playFromStart());
        }
      } else if (phase === 'reveal') {
        tryPlay(() => player.playFromStart());
      } else if (phase === 'loading') {
        if (startedKey.current !== key) {
          player.pause();
          setAudioState('ready');
        }
      } else {
        player.pause();
        setAudioState('ready');
      }
    });
  }, [player, phase, key, enabled, tryPlay]);

  // Кнопка «Включить звук» — запуск по жесту пользователя
  const resync = useCallback(() => {
    if (!player) return;
    if (phaseRef.current === 'playing' || phaseRef.current === 'reveal') player.resume();
  }, [player]);

  return { resync, audioState };
}
