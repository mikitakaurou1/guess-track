import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { gameReducer, initialState, selectCurrentTrack } from '../game/gameReducer';
import { LOAD_TIMEOUT_MS, type SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { fetchLikes, isProfileUrl } from '../services/likesApi';
import { parseLinks } from '../services/linksImport';
import type { GameConfig, Track } from '../types/game';

export interface SourceStat {
  label: string;
  count: number;
}

function labelOf(url: string): string {
  const m = url.match(/soundcloud\.com\/([^/?#]+)(?:\/sets\/([^/?#]+))?/i);
  if (!m) return url;
  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

export function useGame(player: SoundCloudPlayer | null) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const prevPhase = useRef(state.phase);

  const track = selectCurrentTrack(state);

  // Прогресс воспроизведения
  useEffect(() => {
    if (!player) return;
    return player.onProgress((pos) => {
      const s = stateRef.current;
      if (s.phase === 'loading') dispatch({ type: 'TRACK_STARTED' });
      if (s.phase === 'playing' || s.phase === 'loading') {
        setPositionMs(pos);
        if (s.config && pos >= s.config.clipSeconds * 1000) {
          player.pause();
          dispatch({ type: 'CLIP_ENDED' });
        }
      }
    });
  }, [player]);

  // Старт раунда + сторожевой таймер
  useEffect(() => {
    if (state.phase !== 'loading' || !player || !state.order.length || state.stalled) return;

    const attempt = state.attempt;
    const trackIndex = state.order[state.round];
    setPositionMs(0);

    const watchdog = setTimeout(() => dispatch({ type: 'TRACK_FAILED', attempt }), LOAD_TIMEOUT_MS);

    player.playTrack(state.tracks[trackIndex]).then((info) => {
      if (info === undefined) return;
      if (info === null) dispatch({ type: 'TRACK_FAILED', attempt });
      else dispatch({ type: 'TRACK_INFO', trackIndex, info });
    });

    return () => clearTimeout(watchdog);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, state.attempt, state.stalled, player]);

  // Побочные эффекты при смене фазы
  useEffect(() => {
    if (!player) return;
    const prev = prevPhase.current;
    prevPhase.current = state.phase;

    if (state.phase === 'answering') player.pause();
    if (state.phase === 'playing' && prev === 'answering') player.resume();
    if (state.phase === 'reveal') player.playFull();
    if (state.phase === 'final' || state.phase === 'setup') player.pause();
  }, [state.phase, player]);

  // Загрузка нескольких источников и объединение
  const loadSources = useCallback(
    async (urls: string[]) => {
      if (!player) return;
      const clean = urls.map((u) => u.trim()).filter(Boolean);
      setLoadError(null);
      setIsLoadingPlaylist(true);
      try {
        if (!clean.length) throw new Error('Вставьте хотя бы одну ссылку.');

        const lists: Track[][] = [];
        for (const url of clean) {
          try {
            lists.push(isProfileUrl(url) ? await fetchLikes(url) : await player.loadPlaylist(url));
          } catch (e) {
            throw new Error(`${labelOf(url)}: ${(e as Error).message}`);
          }
        }

        const seen = new Set<number>();
        const merged: Track[] = [];
        const stats: SourceStat[] = [];
        lists.forEach((list, s) => {
          let n = 0;
          for (const t of list) {
            if (seen.has(t.id)) continue; // трек, лайкнутый обоими, берём только у первого
            seen.add(t.id);
            merged.push({ ...t, source: s });
            n++;
          }
          if (!n) throw new Error(`${labelOf(clean[s])}: нет уникальных треков`);
          stats.push({ label: labelOf(clean[s]), count: n });
        });

        setPlaylist(merged);
        setSources(stats);
      } catch (e) {
        setLoadError((e as Error).message);
      } finally {
        setIsLoadingPlaylist(false);
      }
    },
    [player],
  );

  const loadFromLinks = useCallback((text: string) => {
    const tracks = parseLinks(text).map((t) => ({ ...t, source: 0 }));
    if (!tracks.length) {
      setLoadError('Не нашёл ни одной ссылки на трек SoundCloud.');
      return;
    }
    setLoadError(null);
    localStorage.setItem('savedLinks', text);
    setPlaylist(tracks);
    setSources([{ label: 'Список ссылок', count: tracks.length }]);
  }, []);

  const startGame = useCallback(
    (config: GameConfig) => dispatch({ type: 'START', config, tracks: playlist }),
    [playlist],
  );

  const buzz = useCallback((p: number) => dispatch({ type: 'BUZZ', player: p }), []);
  const submitAnswer = useCallback((text: string) => dispatch({ type: 'ANSWER', text }), []);

  // Сообщения от удалённых игроков (проверяем, что игрок управляет только своим)
  const handleRemote = useCallback((guestId: string, data: any) => {
    const s = stateRef.current;
    const owners = s.config?.owners;
    if (!owners) return;
    if (data?.k === 'buzz') {
      const p = Number(data.player);
      if (owners[p] === guestId) dispatch({ type: 'BUZZ', player: p });
    } else if (data?.k === 'answer') {
      if (s.phase === 'answering' && s.current !== null && owners[s.current] === guestId) {
        dispatch({ type: 'ANSWER', text: String(data.text ?? '').slice(0, 200) });
      }
    }
  }, []);

  return {
    state,
    track,
    playlist,
    sources,
    positionMs,
    loadError,
    isLoadingPlaylist,
    loadSources,
    loadFromLinks,
    clearPlaylist: () => {
      setPlaylist([]);
      setSources([]);
    },
    startGame,
    buzz,
    submitAnswer,
    handleRemote,
    answerTimeout: useCallback(() => dispatch({ type: 'TIMEOUT' }), []),
    skip: () => dispatch({ type: 'SKIP' }),
    next: () => dispatch({ type: 'NEXT' }),
    finish: () => dispatch({ type: 'FINISH' }),
    reset: () => dispatch({ type: 'RESET' }),
    retry: () => dispatch({ type: 'RETRY' }),
  };
}