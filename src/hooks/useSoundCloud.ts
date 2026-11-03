import { useEffect, useState, type RefObject } from 'react';
import { SoundCloudPlayer } from '../services/SoundCloudPlayer';

export function useSoundCloud(iframeRef: RefObject<HTMLIFrameElement>) {
  const [player, setPlayer] = useState<SoundCloudPlayer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    SoundCloudPlayer.loadApi()
      .then(() => {
        if (!cancelled && iframeRef.current) setPlayer(new SoundCloudPlayer(iframeRef.current));
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [iframeRef]);

  return { player, error };
}