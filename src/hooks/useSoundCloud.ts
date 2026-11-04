import { useEffect, useState, type RefObject } from 'react';
import { SoundCloudPlayer } from '../services/SoundCloudPlayer';

// Два скрытых плеера: пока играет один, второй заранее загружает следующий трек
export function useSoundCloud(refs: RefObject<HTMLIFrameElement>[]) {
  const [players, setPlayers] = useState<SoundCloudPlayer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    SoundCloudPlayer.loadApi()
      .then(() => {
        if (!cancelled && refs.every((r) => r.current)) {
          setPlayers(refs.map((r) => new SoundCloudPlayer(r.current!)));
        }
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { players, player: players?.[0] ?? null, error };
}
