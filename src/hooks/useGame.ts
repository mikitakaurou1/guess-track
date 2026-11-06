import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { gameReducer, initialState, selectCurrentTrack } from '../game/gameReducer';
import { LOAD_TIMEOUT_MS, type SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { fetchLikes, resolveShortUrl } from '../services/likesApi';
import { parseSoundCloudUrl } from '../services/soundcloudUrl';
import type { GameConfig, Track } from '../types/game';
const GUEST_WAIT_MS = 4000;
const START_TIMEOUT_MS = 6000;
// На телефонах и планшетах браузер может не дать запустить звук без нажатия пользователя
const TOUCH =
  typeof window !== 'undefined' &&
  (/iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || !!window.matchMedia?.('(pointer: coarse)').matches);
export interface SourceStat { label: string; count: number; }
export interface GameNet { send: (obj: unknown) => void; }
type Preload = { round: number; trackIndex: number; ok: boolean; promise: Promise<Track | null | undefined> };
function labelOf(raw: string): string {
  const p = parseSoundCloudUrl(raw); const prefix = 'https://soundcloud.com/';
  if (!p || !p.url.startsWith(prefix)) return raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
  const parts = p.url.slice(prefix.length).split('/');
  return p.kind === 'playlist' ? `${parts[0]}/${parts[2]}` : parts[0];
}
export function useGame(players: SoundCloudPlayer[] | null, net?: GameNet) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false); // браузер не дал запустить звук сам
  const [preloadDone, setPreloadDone] = useState(true); // следующий трек уже загружен (или загрузка закончилась неудачей)
  const stateRef = useRef(state); stateRef.current = state;
  const playersRef = useRef(players); playersRef.current = players;
  const preloadRef = useRef<Preload | null>(null); // следующий трек, уже загруженный во втором плеере
  const tapStartRef = useRef<{ round: number; trackIndex: number } | null>(null); // трек уже запущен по нажатию «Дальше»
  const readyRef = useRef(new Map<string, Set<string>>());
  const first = players?.[0] ?? null;
  const track = selectCurrentTrack(state);
  const waitForGuests = (key: string, maxMs: number) => new Promise<void>(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const need = new Set((stateRef.current.config?.owners ?? []).filter((o): o is string => o !== null));
      if ([...need].every(id => readyRef.current.get(key)?.has(id)) || Date.now() - t0 > maxMs) resolve(); else setTimeout(tick, 50);
    }; tick();
  });

  // Прогресс слушаем у обоих плееров, но учитываем только тот, что играет текущий раунд (раунды чередуют плееры)
  useEffect(() => {
    if (!players) return;
    const offs = players.map((p, i) => p.onProgress(pos => {
      const s = stateRef.current;
      if (i !== s.round % 2) return;
      if (s.phase === 'loading') dispatch({ type: 'TRACK_STARTED' });
      if (s.phase === 'playing' || s.phase === 'loading') {
        setPositionMs(pos);
        if (s.config && pos >= s.config.clipSeconds * 1000) dispatch({ type: 'CLIP_ENDED' });
      }
    }));
    return () => offs.forEach(off => off());
  }, [players]);

  useEffect(() => { if (state.phase !== 'loading') setSoundBlocked(false); }, [state.phase]);

  // Пока играет текущий трек, второй плеер заранее загружает следующий
  useEffect(() => {
    if (!players || state.phase !== 'playing') return;
    const nextRound = state.round + 1;
    const nextIdx = state.order[nextRound];
    if (nextIdx === undefined) { setPreloadDone(true); return; }
    const pre = preloadRef.current;
    if (pre && pre.round === nextRound && pre.trackIndex === nextIdx) return;
    const entry: Preload = { round: nextRound, trackIndex: nextIdx, ok: false, promise: Promise.resolve(undefined) };
    setPreloadDone(false);
    // В играх с гостями следующий трек сразу прогреваем (буферизуем): тогда после общей команды «go» он стартует мгновенно
    const warmPreload = (state.config?.owners ?? []).some(o => o !== null);
    entry.promise = players[nextRound % 2].prepareTrack(state.tracks[nextIdx], warmPreload, true)
      .then(info => {
        if (info) { entry.ok = true; dispatch({ type: 'TRACK_INFO', trackIndex: nextIdx, info }); }
        return info;
      })
      .finally(() => { if (preloadRef.current === entry) setPreloadDone(true); });
    preloadRef.current = entry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, players]);

  // Начало раунда: подготовка (или готовый предзагруженный трек) -> ожидание гостей -> старт
  useEffect(() => {
    if (state.phase !== 'loading' || !players || !state.order.length || state.stalled) return;
    const player = players[state.round % 2];
    const attempt = state.attempt; const trackIndex = state.order[state.round]; const key = `${state.round}:${trackIndex}`;
    const remote = (state.config?.owners ?? []).some(o => o !== null);
    let cancelled = false; setPositionMs(0); setSoundBlocked(false);
    const fail = () => { tapStartRef.current = null; dispatch({ type: 'TRACK_FAILED', attempt }); };
    const wdLoad = setTimeout(fail, LOAD_TIMEOUT_MS);
    let wdStart: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let info: Track | null | undefined;
      const pre = preloadRef.current;
      if (pre && pre.round === state.round && pre.trackIndex === trackIndex) {
        info = await pre.promise;
        if (cancelled) return;
      }
      if (!info) info = await player.prepareTrack(state.tracks[trackIndex], remote);
      if (cancelled || info === undefined) return;
      if (info === null) { fail(); return; }
      clearTimeout(wdLoad); dispatch({ type: 'TRACK_INFO', trackIndex, info });
      const tapped = tapStartRef.current?.round === state.round && tapStartRef.current.trackIndex === trackIndex;
      if (!tapped) {
        if (remote) await waitForGuests(key, GUEST_WAIT_MS);
        if (cancelled) return;
        net?.send({ t: 'broadcast', data: { k: 'go', key } });
        const started = await player.startPrepared(remote);
        if (cancelled) return;
        if (!started) { fail(); return; }
      }
      // Звук не пошёл: на телефоне это блокировка браузера, предлагаем нажать кнопку; на компьютере меняем трек
      wdStart = setTimeout(() => { if (TOUCH) setSoundBlocked(true); else fail(); }, START_TIMEOUT_MS);
    })();
    return () => { cancelled = true; clearTimeout(wdLoad); if (wdStart) clearTimeout(wdStart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, state.attempt, state.stalled, players]);

  // Нажатие «Включить звук» (запасной вариант): запуск внутри жеста пользователя
  const enableSound = useCallback(() => {
    const s = stateRef.current;
    const p = playersRef.current?.[s.round % 2];
    if (!p) return;
    const attempt = s.attempt;
    setSoundBlocked(false);
    void p.startPrepared();
    setTimeout(() => {
      const cur = stateRef.current;
      if (cur.phase === 'loading' && cur.attempt === attempt) dispatch({ type: 'TRACK_FAILED', attempt });
    }, START_TIMEOUT_MS);
  }, []);

  // «Дальше»: старый трек выключаем сразу (в любом режиме). Если следующий трек уже загружен и игра без гостей,
  // запускаем его прямо в этом нажатии (так телефон разрешает звук)
  const next = useCallback(() => {
    const s = stateRef.current;
    const ps = playersRef.current;
    const remote = (s.config?.owners ?? []).some(o => o !== null);
    const nextRound = s.round + 1;
    const pre = preloadRef.current;
    ps?.[s.round % 2].detach();
    if (ps && !remote && pre && pre.ok && pre.round === nextRound && pre.trackIndex === s.order[nextRound]) {
      void ps[nextRound % 2].startPrepared();
      tapStartRef.current = { round: nextRound, trackIndex: pre.trackIndex };
    }
    dispatch({ type: 'NEXT' });
  }, []);

  // На телефоне кнопка «Дальше» ждёт, пока следующий трек загрузится: тогда нажатие гарантированно запускает готовый трек
  const remoteGame = (state.config?.owners ?? []).some(o => o !== null);
  const nextBusy = TOUCH && !remoteGame && state.phase === 'reveal' && !preloadDone && state.order[state.round + 1] !== undefined;

  useEffect(() => {
    if (!players) return;
    if (state.phase === 'final' || state.phase === 'setup') { players.forEach(p => p.pause()); return; }
    const p = players[state.round % 2];
    if (state.phase === 'answering') p.pause();
    if (state.phase === 'playing' && prevPhase.current === 'answering') p.resume();
    if (state.phase === 'reveal') {
      if (state.result?.kind === 'nobody') p.resume(); else p.playFull();
    }
    prevPhase.current = state.phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, players]);
  const prevPhase = useRef(state.phase);

  const loadSources = useCallback(async (urls: string[]) => {
    if (!first) return;
    const clean = urls.map(u => u.trim()).filter(Boolean); setLoadError(null); setIsLoadingPlaylist(true);
    try {
      if (!clean.length) throw new Error('Вставьте хотя бы одну ссылку.');
      const lists: Track[][] = []; const resolved: string[] = [];
      for (const raw of clean) {
        try {
          let p = parseSoundCloudUrl(raw);
          if (p?.short) p = parseSoundCloudUrl(await resolveShortUrl(raw));
          if (!p) throw new Error('это не похоже на ссылку SoundCloud');
          if (p.kind === 'playlist') lists.push(await first.loadPlaylist(p.url));
          else if (p.kind === 'profile' || p.kind === 'likes') lists.push(await fetchLikes(p.url));
          else if (p.kind === 'track') throw new Error('это ссылка на один трек. Вставьте ссылку на профиль или плейлист');
          else throw new Error(p.reason ?? 'такая ссылка не поддерживается');
          resolved.push(p.url);
        } catch (e) { throw new Error(`${labelOf(raw)}: ${(e as Error).message}`); }
      }
      const seen = new Set<number>(); const merged: Track[] = []; const stats: SourceStat[] = [];
      lists.forEach((list, s) => {
        let n = 0;
        for (const t of list) { if (seen.has(t.id)) continue; seen.add(t.id); merged.push({ ...t, source: s }); n++; }
        if (!n) throw new Error(`${labelOf(resolved[s])}: нет уникальных треков`);
        stats.push({ label: labelOf(resolved[s]), count: n });
      });
      setPlaylist(merged); setSources(stats);
    } catch (e) { setLoadError((e as Error).message); } finally { setIsLoadingPlaylist(false); }
  }, [first]);
  const startGame = useCallback((config: GameConfig) => {
    readyRef.current.clear(); preloadRef.current = null; tapStartRef.current = null; setPreloadDone(true);
    dispatch({ type: 'START', config, tracks: playlist });
  }, [playlist]);
  const buzz = useCallback((p: number) => dispatch({ type: 'BUZZ', player: p }), []);
  const submitAnswer = useCallback((text: string) => dispatch({ type: 'ANSWER', text }), []);
  const handleRemote = useCallback((guestId: string, data: any) => {
    const s = stateRef.current; const owners = s.config?.owners; if (!owners) return;
    if (data?.k === 'buzz') { const p = Number(data.player); if (owners[p] === guestId) dispatch({ type: 'BUZZ', player: p }); }
    else if (data?.k === 'answer') { if (s.phase === 'answering' && s.current !== null && owners[s.current] === guestId) dispatch({ type: 'ANSWER', text: String(data.text ?? '').slice(0, 200) }); }
    else if (data?.k === 'ready') { const key = String(data.key); const set = readyRef.current.get(key) ?? new Set<string>(); set.add(guestId); readyRef.current.set(key, set); }
  }, []);
  return { state, track, playlist, sources, positionMs, loadError, isLoadingPlaylist, soundBlocked, enableSound, nextBusy, loadSources,
    clearPlaylist: () => { setPlaylist([]); setSources([]); }, startGame, buzz, submitAnswer, handleRemote,
    answerTimeout: useCallback(() => dispatch({ type: 'TIMEOUT' }), []), skip: () => dispatch({ type: 'SKIP' }),
    next, finish: () => dispatch({ type: 'FINISH' }), reset: () => { preloadRef.current = null; tapStartRef.current = null; setPreloadDone(true); dispatch({ type: 'RESET' }); }, retry: () => dispatch({ type: 'RETRY' }),
  };
}
