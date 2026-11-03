import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { gameReducer, initialState, selectCurrentTrack } from '../game/gameReducer';
import { LOAD_TIMEOUT_MS, type SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { fetchLikes, isProfileUrl } from '../services/likesApi';
import { parseLinks } from '../services/linksImport';
import type { GameConfig, Track } from '../types/game';

const GUEST_WAIT_MS = 4000; // сколько хост ждёт, пока гости подготовят трек
const START_TIMEOUT_MS = 6000; // сколько ждём первого прогресса после запуска

export interface SourceStat {
  label: string;
  count: number;
}

export interface GameNet {
  send: (obj: unknown) => void;
}

function labelOf(url: string): string {
  const m = url.match(/soundcloud\.com\/([^/?#]+)(?:\/sets\/([^/?#]+))?/i);
  if (!m) return url;
  return m[2] ? `${m[1]}/${m[2]}` : m[1];
}

export function useGame(player: SoundCloudPlayer | null, net?: GameNet) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const prevPhase = useRef(state.phase);
  const readyRef = useRef(new Map<string, Set<string>>()); // ключ раунда -> гости, готовые к старту

  const track = selectCurrentTrack(state);

  // Ждём, пока все удалённые игроки подготовят трек (или истечёт таймаут)
  const waitForGuests = (key: string, maxMs: number) =>
    new Promise<void>((resolve) => {
      const t0 = Date.now();
      const tick = () => {
        const owners = stateRef.current.config?.owners ?? [];
        const need = new Set(owners.filter((o): o is string => o !== null));
        const have = readyRef.current.get(key);
        const all = [...need].every((id) => have?.has(id));
        if (all || Date.now() - t0 > maxMs) resolve();
        else setTimeout(tick, 50);
      };
      tick();
    });

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

  // Начало раунда: подготовка трека -> ожидание гостей -> одновременный старт
  useEffect(() => {
    if (state.phase !== 'loading' || !player || !state.order.length || state.stalled) return;

    const attempt = state.attempt;
    const trackIndex = state.order[state.round];
    const key = `${state.round}:${trackIndex}`;
    const remote = (state.config?.owners ?? []).some((o) => o !== null);
    let cancelled = false;
    setPositionMs(0);

    const fail = () => dispatch({ type: 'TRACK_FAILED', attempt });
    const wdLoad = setTimeout(fail, LOAD_TIMEOUT_MS);
    let wdStart: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      const info = await player.prepareTrack(state.tracks[trackIndex], remote);
      if (cancelled || info === undefined) return;
      if (info === null) {
        fail();
        return;
      }
      clearTimeout(wdLoad);
      dispatch({ type: 'TRACK_INFO', trackIndex, info });

      if (remote) await waitForGuests(key, GUEST_WAIT_MS);
      if (cancelled) return;

      net?.send({ t: 'broadcast', data: { k: 'go', key } }); // гости стартуют одновременно с хостом
      const started = await player.startPrepared();
      if (cancelled) return;
      if (!started) {
        fail();
        return;
      }
      wdStart = setTimeout(fail, START_TIMEOUT_MS);
    })();

    return () => {
      cancelled = true;
      clearTimeout(wdLoad);
      if (wdStart) clearTimeout(wdStart);
    };
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
    (config: GameConfig) => {
      readyRef.current.clear();
      dispatch({ type: 'START', config, tracks: playlist });
    },
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
    } else if (data?.k === 'ready') {
      // гость подготовил трек и готов стартовать
      const key = String(data.key);
      const set = readyRef.current.get(key) ?? new Set<string>();
      set.add(guestId);
      readyRef.current.set(key, set);
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
