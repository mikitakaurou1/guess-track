import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { gameReducer, initialState, selectCurrentTrack } from '../game/gameReducer';
import { LOAD_TIMEOUT_MS, type SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { fetchLikes, resolveShortUrl } from '../services/likesApi';
import { parseSoundCloudUrl } from '../services/soundcloudUrl';
import type { GameConfig, Track } from '../types/game';
const GUEST_WAIT_MS = 4000;
const START_TIMEOUT_MS = 6000;
export interface SourceStat { label: string; count: number; }
export interface GameNet { send: (obj: unknown) => void; }
function labelOf(raw: string): string {
  const p = parseSoundCloudUrl(raw); const prefix = 'https://soundcloud.com/';
  if (!p || !p.url.startsWith(prefix)) return raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
  const parts = p.url.slice(prefix.length).split('/');
  return p.kind === 'playlist' ? `${parts[0]}/${parts[2]}` : parts[0];
}
export function useGame(player: SoundCloudPlayer | null, net?: GameNet) {
  const [state, dispatch] = useReducer(gameReducer, initialState);
  const [playlist, setPlaylist] = useState<Track[]>([]);
  const [sources, setSources] = useState<SourceStat[]>([]);
  const [positionMs, setPositionMs] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoadingPlaylist, setIsLoadingPlaylist] = useState(false);
  const stateRef = useRef(state); stateRef.current = state;
  const prevPhase = useRef(state.phase);
  const readyRef = useRef(new Map<string, Set<string>>());
  const track = selectCurrentTrack(state);
  const waitForGuests = (key: string, maxMs: number) => new Promise<void>(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const need = new Set((stateRef.current.config?.owners ?? []).filter((o): o is string => o !== null));
      if ([...need].every(id => readyRef.current.get(key)?.has(id)) || Date.now() - t0 > maxMs) resolve(); else setTimeout(tick, 50);
    }; tick();
  });
  useEffect(() => {
    if (!player) return;
    return player.onProgress(pos => {
      const s = stateRef.current;
      if (s.phase === 'loading') dispatch({ type: 'TRACK_STARTED' });
      if (s.phase === 'playing' || s.phase === 'loading') {
        setPositionMs(pos);
        if (s.config && pos >= s.config.clipSeconds * 1000) dispatch({ type: 'CLIP_ENDED' });
      }
    });
  }, [player]);
  useEffect(() => {
    if (state.phase !== 'loading' || !player || !state.order.length || state.stalled) return;
    const attempt = state.attempt; const trackIndex = state.order[state.round]; const key = `${state.round}:${trackIndex}`;
    const remote = (state.config?.owners ?? []).some(o => o !== null);
    let cancelled = false; setPositionMs(0);
    const fail = () => dispatch({ type: 'TRACK_FAILED', attempt });
    const wdLoad = setTimeout(fail, LOAD_TIMEOUT_MS);
    let wdStart: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      const info = await player.prepareTrack(state.tracks[trackIndex], remote);
      if (cancelled || info === undefined) return;
      if (info === null) { fail(); return; }
      clearTimeout(wdLoad); dispatch({ type: 'TRACK_INFO', trackIndex, info });
      if (remote) await waitForGuests(key, GUEST_WAIT_MS);
      if (cancelled) return;
      net?.send({ t: 'broadcast', data: { k: 'go', key } });
      const started = await player.startPrepared();
      if (cancelled) return;
      if (!started) { fail(); return; }
      wdStart = setTimeout(fail, START_TIMEOUT_MS);
    })();
    return () => { cancelled = true; clearTimeout(wdLoad); if (wdStart) clearTimeout(wdStart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, state.attempt, state.stalled, player]);
  useEffect(() => {
    if (!player) return;
    const prev = prevPhase.current; prevPhase.current = state.phase;
    if (state.phase === 'answering') player.pause();
    if (state.phase === 'playing' && prev === 'answering') player.resume();
    if (state.phase === 'reveal') {
      if (state.result?.kind === 'nobody') player.resume(); else player.playFull();
    }
    if (state.phase === 'final' || state.phase === 'setup') player.pause();
  }, [state.phase, player]);
  const loadSources = useCallback(async (urls: string[]) => {
    if (!player) return;
    const clean = urls.map(u => u.trim()).filter(Boolean); setLoadError(null); setIsLoadingPlaylist(true);
    try {
      if (!clean.length) throw new Error('Вставьте хотя бы одну ссылку.');
      const lists: Track[][] = []; const resolved: string[] = [];
      for (const raw of clean) {
        try {
          let p = parseSoundCloudUrl(raw);
          if (p?.short) p = parseSoundCloudUrl(await resolveShortUrl(raw));
          if (!p) throw new Error('это не похоже на ссылку SoundCloud');
          if (p.kind === 'playlist') lists.push(await player.loadPlaylist(p.url));
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
  }, [player]);
  const startGame = useCallback((config: GameConfig) => { readyRef.current.clear(); dispatch({ type: 'START', config, tracks: playlist }); }, [playlist]);
  const buzz = useCallback((p: number) => dispatch({ type: 'BUZZ', player: p }), []);
  const submitAnswer = useCallback((text: string) => dispatch({ type: 'ANSWER', text }), []);
  const handleRemote = useCallback((guestId: string, data: any) => {
    const s = stateRef.current; const owners = s.config?.owners; if (!owners) return;
    if (data?.k === 'buzz') { const p = Number(data.player); if (owners[p] === guestId) dispatch({ type: 'BUZZ', player: p }); }
    else if (data?.k === 'answer') { if (s.phase === 'answering' && s.current !== null && owners[s.current] === guestId) dispatch({ type: 'ANSWER', text: String(data.text ?? '').slice(0, 200) }); }
    else if (data?.k === 'ready') { const key = String(data.key); const set = readyRef.current.get(key) ?? new Set<string>(); set.add(guestId); readyRef.current.set(key, set); }
  }, []);
  return { state, track, playlist, sources, positionMs, loadError, isLoadingPlaylist, loadSources,
    clearPlaylist: () => { setPlaylist([]); setSources([]); }, startGame, buzz, submitAnswer, handleRemote,
    answerTimeout: useCallback(() => dispatch({ type: 'TIMEOUT' }), []), skip: () => dispatch({ type: 'SKIP' }),
    next: () => dispatch({ type: 'NEXT' }), finish: () => dispatch({ type: 'FINISH' }), reset: () => dispatch({ type: 'RESET' }), retry: () => dispatch({ type: 'RETRY' }),
  };
}
