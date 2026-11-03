import { useCallback, useEffect, useRef } from 'react';
import type { SoundCloudPlayer } from '../services/SoundCloudPlayer';
import type { GuestSnapshot } from '../types/room';

export function useGuestAudio(
  player: SoundCloudPlayer | null,
  snap: GuestSnapshot | null,
  enabled: boolean,
) {
  const loaded = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const prevPhase = useRef<string | null>(null);
  const run = useRef(0);

  const phase = snap?.phase ?? null;
  const key = snap?.audio?.key ?? null;
  const srcRef = useRef<string | null>(null);
  srcRef.current = snap?.audio?.src ?? null;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    if (!player) return;
    const myRun = ++run.current;
    const prev = prevPhase.current;
    prevPhase.current = phase;

    if (!enabled || !phase || !key || !srcRef.current) {
      player.pause();
      return;
    }

    // загружаем трек один раз на раунд, заранее (пока у хоста идёт загрузка)
    if (loaded.current?.key !== key) {
      loaded.current = { key, promise: player.loadOnly(srcRef.current) };
    }

    loaded.current.promise.then((ok) => {
      if (!ok || myRun !== run.current) return;
      if (phase === 'playing') {
        if (prev === 'answering') player.resume();
        else player.playFromStart();
      } else if (phase === 'reveal') {
        player.playFromStart();
      } else {
        player.pause();
      }
    });
  }, [player, phase, key, enabled]);

  // Кнопка «Нет звука?» — повторный запуск по жесту пользователя (обход блокировки автозапуска)
  const resync = useCallback(() => {
    if (!player) return;
    if (phaseRef.current === 'playing' || phaseRef.current === 'reveal') player.resume();
  }, [player]);

  return { resync };
}
