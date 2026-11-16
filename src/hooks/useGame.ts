import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { gameReducer, initialState, selectCurrentTrack } from '../game/gameReducer';
import { LOAD_TIMEOUT_MS, type SoundCloudPlayer } from '../services/SoundCloudPlayer';
import { fetchLikes, resolveShortUrl } from '../services/likesApi';
import { ARTIST_PREFIX, artistLabel, artistOfTrack, fetchArtistPool, unpinUnplayable } from '../services/artistsApi';
import { parseSoundCloudUrl } from '../services/soundcloudUrl';
import { DEFAULT_RTT_MS, RttTracker, arbitrationWaitMs, pickWinner, reactionFromGuest, windowKey, type BuzzCandidate } from '../game/buzz';
import { CATALOG_CHANGED } from '../utils/catalogEvents';
import { gameLog } from '../utils/gameLog';
import type { GameConfig, Track } from '../types/game';
const GUEST_WAIT_MS = 4000;
const START_TIMEOUT_MS = 6000;
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const TOUCH = typeof window !== 'undefined' && (/iPad|iPhone|iPod|Android/i.test(navigator.userAgent) || !!window.matchMedia?.('(pointer: coarse)').matches);
export interface SourceStat { label: string; count: number; }
export interface GameNet { send: (obj: unknown) => void; }
type Preload = { round: number; trackIndex: number; ok: boolean; promise: Promise<Track | null | undefined> };
const trackName = (t: Track | null | undefined): string => t ? `«${t.title || 'без названия'}»${t.artist ? ` — ${t.artist}` : ''} [${t.id}]` : 'неизвестный трек';
const RESULT_TEXT = { correct: 'угадали', nobody: 'никто не угадал', skipped: 'пропущен' } as const;
function labelOf(raw: string): string {
  if (raw.startsWith(ARTIST_PREFIX)) return artistLabel(raw);
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
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [preloadDone, setPreloadDone] = useState(true);
  const stateRef = useRef(state); stateRef.current = state;
  const playlistRef = useRef(playlist); playlistRef.current = playlist;
  const playersRef = useRef(players); playersRef.current = players;
  const preloadRef = useRef<Preload | null>(null);
  const tapStartRef = useRef<{ round: number; trackIndex: number } | null>(null);
  const readyRef = useRef(new Map<string, Set<string>>());
  const pendingFailsRef = useRef(new Map<number, string>());
  const okInGameRef = useRef(false);
  const startLogRef = useRef('');
  const loadStartRef = useRef<{ key: string; t0: number } | null>(null);
  const lastUrlsRef = useRef<string[]>([]);
  // Трек, который не загрузился, открепляется от артиста, как только в этой же игре заиграл другой трек (значит, плеер и интернет в порядке) или игра закончилась
  const flushFailures = useCallback(() => {
    if (!pendingFailsRef.current.size) return;
    const items = [...pendingFailsRef.current]; pendingFailsRef.current.clear();
    for (const [id, why] of items) {
      const t = playlistRef.current.find(x => x.id === id) as (Track & { manual?: boolean }) | undefined;
      const name = t ? trackName(t) : `[${id}]`;
      const artistId = artistOfTrack(id);
      if (!artistId) { gameLog('info', `Трек не из каталога артиста, открепление не нужно: ${name}`); continue; }
      if (t?.manual) { gameLog('warn', `Не откреплён (добавлен вручную): ${name} — ${why}`); continue; }
      const label = artistLabel(artistId);
      gameLog('info', `Открепляем от «${label}»: ${name} — ${why}`);
      void unpinUnplayable(artistId, id).then(r => {
        if (r.unpinned) { gameLog('ok', `Откреплён от «${label}»: ${name} (${r.note})`); setPlaylist(p => p.filter(x => x.id !== id)); }
        else gameLog('warn', `Не откреплён от «${label}»: ${name} — ${r.note}`);
      });
    }
  }, []);
  const first = players?.[0] ?? null;
  const track = selectCurrentTrack(state);
  const waitForGuests = (key: string, maxMs: number) => new Promise<void>(resolve => {
    const t0 = Date.now();
    const tick = () => {
      const s = stateRef.current;
      const currentKey = `${s.round}:${s.order[s.round]}${s.config?.reverse ? `:${s.attempt}` : ''}`;
      const need = new Set((s.config?.owners ?? []).filter((o): o is string => o !== null));
      if (s.phase !== 'loading' || currentKey !== key || [...need].every(id => readyRef.current.get(key)?.has(id)) || Date.now() - t0 > maxMs) resolve(); else setTimeout(tick, 50);
    }; tick();
  });
  const answerStartRef = useRef(0);
  useEffect(() => { if (state.phase === 'answering') answerStartRef.current = performance.now(); }, [state.phase, state.current]);
  const answerMs = useCallback(() => Math.max(0, Math.round(performance.now() - answerStartRef.current)), []);
  const rttRef = useRef(new RttTracker());
  const pingSentRef = useRef(new Map<number, number>());
  const pingSeqRef = useRef(0);
  const goLead = (): { ms: number; d: Record<string, number> } => {
    const ids = [...new Set((stateRef.current.config?.owners ?? []).filter((o): o is string => o !== null))];
    if (!ids.length) return { ms: 0, d: {} };
    const oneWay = (id: string) => (rttRef.current.median(id) ?? DEFAULT_RTT_MS) / 2;
    const ms = Math.round(Math.min(1500, Math.max(300, Math.max(...ids.map(oneWay)) + 200)));
    const d: Record<string, number> = {};
    ids.forEach(id => { d[id] = Math.max(0, Math.round(ms - oneWay(id))); });
    return { ms, d };
  };
  const litRef = useRef<{ win: string; at: number } | null>(null);
  const candsRef = useRef<BuzzCandidate[]>([]);
  const candWinRef = useRef<string | null>(null);
  const buzzTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearBuzz = useCallback(() => {
    candsRef.current = []; candWinRef.current = null;
    if (buzzTimerRef.current) { clearTimeout(buzzTimerRef.current); buzzTimerRef.current = null; }
  }, []);
  const decide = useCallback(() => {
    if (buzzTimerRef.current) { clearTimeout(buzzTimerRef.current); buzzTimerRef.current = null; }
    const cands = candsRef.current; const win = candWinRef.current;
    candsRef.current = []; candWinRef.current = null;
    const s = stateRef.current;
    if (!cands.length || s.phase !== 'playing' || windowKey(s) !== win) return;
    const winner = pickWinner(cands);
    dispatch({ type: 'BUZZ', player: winner.player, reactionMs: Math.round(winner.r) });
  }, []);
  const enqueueBuzz = useCallback((player: number, owner: string | null, reported?: unknown, win?: string) => {
    const s = stateRef.current;
    if (s.phase !== 'playing' || s.locked.includes(player)) return;
    const key = windowKey(s);
    if (win !== undefined && win !== key) return;
    const lit = litRef.current;
    if (!lit || lit.win !== key) { dispatch({ type: 'BUZZ', player }); return; }
    if (candWinRef.current !== null && candWinRef.current !== key) clearBuzz();
    if (candsRef.current.some(c => c.player === player)) return;
    const arrival = performance.now();
    const r = owner === null ? Math.max(0, arrival - lit.at) : reactionFromGuest(reported, arrival, lit.at, rttRef.current.median(owner));
    candWinRef.current = key;
    candsRef.current.push({ player, owner, r, at: arrival });
    if (candsRef.current.length === 1) {
      const wait = arbitrationWaitMs(candsRef.current[0], s, rttRef.current);
      if (wait <= 0) decide(); else buzzTimerRef.current = setTimeout(decide, wait);
    } else {
      const free = (s.config?.playerNames ?? []).map((_, i) => i).filter(i => !s.locked.includes(i));
      if (free.every(i => candsRef.current.some(c => c.player === i))) decide();
    }
  }, [clearBuzz, decide]);
  useEffect(() => {
    if (state.phase === 'playing') {
      const key = windowKey(state);
      if (litRef.current?.win !== key) litRef.current = { win: key, at: performance.now() };
    } else { litRef.current = null; clearBuzz(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.attempt, state.locked.length]);
  useEffect(() => () => clearBuzz(), [clearBuzz]);
  const nextPing = useCallback((): { n: number } => {
    const n = ++pingSeqRef.current; const m = pingSentRef.current;
    m.set(n, performance.now());
    if (m.size > 40) { const oldest = m.keys().next().value; if (oldest !== undefined) m.delete(oldest); }
    return { n };
  }, []);
  useEffect(() => {
    if (!players) return;
    const offs = players.map((p, i) => p.onProgress(pos => {
      const s = stateRef.current;
      if (i !== s.round % 2) return;
      if (s.phase === 'loading') {
        dispatch({ type: 'TRACK_STARTED' });
        okInGameRef.current = true;
        const k = `${s.round}:${s.attempt}`;
        if (startLogRef.current !== k) {
          startLogRef.current = k;
          const ls = loadStartRef.current;
          gameLog('ok', `Играет: ${trackName(s.tracks[s.order[s.round]])}${ls && ls.key === k ? ` (старт за ${Math.round(performance.now() - ls.t0)} мс)` : ''}`);
        }
        flushFailures();
      }
      if (s.phase === 'playing' || s.phase === 'loading') {
        setPositionMs(pos);
        if (s.config && pos >= s.config.clipSeconds * 1000) dispatch({ type: 'CLIP_ENDED' });
      }
    }));
    return () => offs.forEach(off => off());
  }, [players, flushFailures]);
  useEffect(() => { if (state.phase !== 'loading') setSoundBlocked(false); }, [state.phase]);
  useEffect(() => {
    if (!players || state.phase !== 'playing') return;
    const nextRound = state.round + 1; const nextIdx = state.order[nextRound];
    if (nextIdx === undefined) { setPreloadDone(true); return; }
    const pre = preloadRef.current;
    if (pre && pre.round === nextRound && pre.trackIndex === nextIdx) return;
    const entry: Preload = { round: nextRound, trackIndex: nextIdx, ok: false, promise: Promise.resolve(undefined) };
    const nextTrack = state.tracks[nextIdx];
    setPreloadDone(false);
    gameLog('info', `Предзагрузка следующего: ${trackName(nextTrack)}`);
    entry.promise = players[nextRound % 2].prepareTrack(nextTrack, false, true)
      .then(info => {
        if (info) { entry.ok = true; dispatch({ type: 'TRACK_INFO', trackIndex: nextIdx, info }); gameLog('info', `Предзагружен: ${trackName(nextTrack)}`); }
        else if (info === null) gameLog('warn', `Предзагрузка не удалась: ${trackName(nextTrack)}`);
        return info;
      })
      .finally(() => { if (preloadRef.current === entry) setPreloadDone(true); });
    preloadRef.current = entry;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, players]);
  useEffect(() => {
    if (state.phase !== 'loading' || !players || !state.order.length || state.stalled) return;
    const player = players[state.round % 2];
    const attempt = state.attempt; const trackIndex = state.order[state.round];
    const key = `${state.round}:${trackIndex}${state.config?.reverse ? `:${attempt}` : ''}`;
    const remote = (state.config?.owners ?? []).some(o => o !== null);
    const reverse = !!state.config?.reverse;
    const cur = state.tracks[trackIndex]; const t0 = performance.now();
    let cancelled = false; setPositionMs(0); setSoundBlocked(false);
    loadStartRef.current = { key: `${state.round}:${attempt}`, t0 };
    gameLog('info', `Загрузка ${state.round + 1}/${state.order.length}: ${trackName(cur)}${state.failStreak > 0 ? ` (замена, неудач подряд: ${state.failStreak})` : ''}`);
    const fail = (why: string) => { tapStartRef.current = null; gameLog('error', `Не загрузился: ${trackName(cur)} — ${why}`); dispatch({ type: 'TRACK_FAILED', attempt }); };
    const failTrack = (why: string) => {
      const t = stateRef.current.tracks[trackIndex];
      if (t && !reverse) { if (navigator.onLine) pendingFailsRef.current.set(t.id, why); else gameLog('warn', 'Нет интернета: трек не будет откреплён'); }
      fail(why);
    };
    const loadMs = reverse ? 200000 : LOAD_TIMEOUT_MS;
    const wdLoad = setTimeout(() => failTrack(`таймаут загрузки (${Math.round(loadMs / 1000)} с)`), loadMs);
    let wdStart: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      let info: Track | null | undefined; let fromPreload = false;
      const pre = preloadRef.current;
      if (pre && pre.round === state.round && pre.trackIndex === trackIndex) {
        info = await pre.promise; fromPreload = !!info;
        if (cancelled) return;
        if (fromPreload) gameLog('info', 'Трек уже был предзагружен');
      }
      if (!info) info = await player.prepareTrack(state.tracks[trackIndex], remote);
      if (cancelled || info === undefined) return;
      if (info === null) { failTrack('плеер SoundCloud не загрузил трек'); return; }
      clearTimeout(wdLoad); dispatch({ type: 'TRACK_INFO', trackIndex, info });
      gameLog('info', `Загружен за ${Math.round(performance.now() - t0)} мс: ${trackName(info)}`);
      const tapped = tapStartRef.current?.round === state.round && tapStartRef.current.trackIndex === trackIndex;
      if (!tapped) {
        if (remote) await Promise.all([fromPreload ? player.warmPrepared() : Promise.resolve(), waitForGuests(key, reverse ? 185000 : GUEST_WAIT_MS)]);
        if (cancelled) return;
        const lead = goLead();
        net?.send({ t: 'broadcast', data: { k: 'go', key, d: lead.d } });
        if (lead.ms > 0) { await sleep(lead.ms); if (cancelled) return; }
        const started = await player.startPrepared(remote);
        if (cancelled) return;
        if (!started) { fail('плеер не смог запустить воспроизведение'); return; }
      }
      wdStart = setTimeout(() => {
        if (TOUCH || reverse) { setSoundBlocked(true); gameLog('warn', 'Браузер не дал включить звук сам: нужно нажать «Включить звук»'); }
        else failTrack(`трек загрузился, но не начал играть за ${Math.round(START_TIMEOUT_MS / 1000)} с`);
      }, START_TIMEOUT_MS);
    })();
    return () => { cancelled = true; clearTimeout(wdLoad); if (wdStart) clearTimeout(wdStart); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.round, state.order, state.attempt, state.stalled, players]);
  useEffect(() => { if (state.stalled) gameLog('error', 'Остановка: несколько треков подряд не загрузились или браузер не дал включить звук. Нужно нажать «Повторить»'); }, [state.stalled]);
  useEffect(() => {
    if (state.phase === 'reveal') {
      const r = state.history[state.history.length - 1];
      if (r) gameLog('info', `Ответ показан: ${trackName(r.track)} — ${RESULT_TEXT[r.result.kind]}`);
    } else if (state.phase === 'final') {
      gameLog('info', 'Игра завершена');
      if (okInGameRef.current) flushFailures();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  const enableSound = useCallback(() => {
    const s = stateRef.current; const p = playersRef.current?.[s.round % 2];
    if (!p) return;
    const attempt = s.attempt;
    setSoundBlocked(false); void p.startPrepared();
    setTimeout(() => { const cur = stateRef.current; if (cur.phase === 'loading' && cur.attempt === attempt) dispatch({ type: 'TRACK_FAILED', attempt }); }, START_TIMEOUT_MS);
  }, []);
  const next = useCallback(() => {
    const s = stateRef.current; const ps = playersRef.current;
    const remote = (s.config?.owners ?? []).some(o => o !== null);
    const nextRound = s.round + 1; const pre = preloadRef.current;
    // После последнего трека плеер не останавливаем: на итогах трек доигрывает до конца
    if (s.order[nextRound] !== undefined) ps?.[s.round % 2].detach();
    if (ps && !remote && pre && pre.ok && pre.round === nextRound && pre.trackIndex === s.order[nextRound]) {
      void ps[nextRound % 2].startPrepared(); tapStartRef.current = { round: nextRound, trackIndex: pre.trackIndex };
    }
    dispatch({ type: 'NEXT' });
  }, []);
  const remoteGame = (state.config?.owners ?? []).some(o => o !== null);
  const nextBusy = TOUCH && !remoteGame && state.phase === 'reveal' && !preloadDone && state.order[state.round + 1] !== undefined;
  useEffect(() => {
    if (!players) return;
    const from = prevPhase.current; prevPhase.current = state.phase;
    // Итоги сразу после показа трека: он играет дальше. Остановка при выходе из итогов (возврат в настройки)
    if (state.phase === 'final' && (from === 'reveal' || from === 'final')) return;
    if (state.phase === 'final' || state.phase === 'setup') { players.forEach(p => p.pause()); return; }
    const p = players[state.round % 2];
    if (state.phase === 'answering') p.pause();
    if (state.phase === 'playing' && from === 'answering') p.resume();
    if (state.phase === 'reveal') { if (state.result?.kind === 'nobody' && !state.config?.reverse) p.resume(); else p.playFull(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, players]);
  const prevPhase = useRef(state.phase);
  const loadSources = useCallback(async (urls: string[]) => {
    if (!first) return;
    const clean = urls.map(u => u.trim()).filter(Boolean); setLoadError(null); setIsLoadingPlaylist(true);
    if (clean.length) lastUrlsRef.current = clean;
    try {
      if (!clean.length) throw new Error('Вставьте хотя бы одну ссылку.');
      const lists: Track[][] = []; const resolved: string[] = [];
      for (const raw of clean) {
        try {
          if (raw.startsWith(ARTIST_PREFIX)) {
            lists.push(await fetchArtistPool(raw.slice(ARTIST_PREFIX.length)));
            resolved.push(raw);
            continue;
          }
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
      gameLog('info', `Источники загружены: ${merged.length} треков (${stats.map(s => `${s.label}: ${s.count}`).join(', ')})`);
    } catch (e) { setLoadError((e as Error).message); gameLog('error', `Ошибка загрузки источников: ${(e as Error).message}`); } finally { setIsLoadingPlaylist(false); }
  }, [first]);
  const loadSourcesRef = useRef(loadSources); loadSourcesRef.current = loadSources;
  useEffect(() => {
    const onChanged = () => {
      // Перезагружаем источники только когда треки уже загружены (шаг 2); на шаге 1 админские правки не должны перебрасывать дальше
      if (stateRef.current.phase !== 'setup' || !lastUrlsRef.current.length || !playlistRef.current.length) return;
      void loadSourcesRef.current(lastUrlsRef.current);
    };
    window.addEventListener(CATALOG_CHANGED, onChanged);
    return () => window.removeEventListener(CATALOG_CHANGED, onChanged);
  }, []);
  const startGame = useCallback((config: GameConfig) => {
    readyRef.current.clear(); preloadRef.current = null; tapStartRef.current = null; pendingFailsRef.current.clear(); okInGameRef.current = false; startLogRef.current = ''; setPreloadDone(true);
    gameLog('info', `Старт игры: ${playlist.length} треков в пуле, играем ${config.trackCount}, фрагмент ${config.clipSeconds} с${config.reverse ? ', режим «наоборот»' : ''}`);
    dispatch({ type: 'START', config, tracks: playlist });
  }, [playlist]);
  const buzz = useCallback((p: number) => enqueueBuzz(p, null), [enqueueBuzz]);
  const submitAnswer = useCallback((text: string) => dispatch({ type: 'ANSWER', text, ms: answerMs() }), [answerMs]);
  const handleRemote = useCallback((guestId: string, data: any) => {
    const s = stateRef.current; const owners = s.config?.owners; if (!owners) return;
    if (data?.k === 'buzz') {
      const p = Number(data.player);
      if (Number.isInteger(p) && p >= 0 && p < owners.length && owners[p] === guestId) enqueueBuzz(p, guestId, data.r, typeof data.win === 'string' ? data.win : undefined);
    } else if (data?.k === 'answer') {
      if (s.config?.reverse && data.answerKey !== `${s.round}-${s.locked.length}`) return;
      if (s.phase === 'answering' && s.current !== null && owners[s.current] === guestId) dispatch({ type: 'ANSWER', text: String(data.text ?? '').slice(0, 200), ms: answerMs() });
    } else if (data?.k === 'ready') {
      const key = String(data.key); const set = readyRef.current.get(key) ?? new Set<string>(); set.add(guestId); readyRef.current.set(key, set);
    } else if (data?.k === 'hpong') {
      const sent = pingSentRef.current.get(Number(data.n)); if (sent !== undefined) rttRef.current.add(guestId, performance.now() - sent);
    }
  }, [enqueueBuzz, answerMs]);
  return { state, track, playlist, sources, positionMs, loadError, isLoadingPlaylist, soundBlocked, enableSound, nextBusy, loadSources, nextPing,
    clearPlaylist: () => { setPlaylist([]); setSources([]); }, startGame, buzz, submitAnswer, handleRemote,
    answerTimeout: useCallback(() => dispatch({ type: 'TIMEOUT', ms: answerMs() }), [answerMs]), skip: () => dispatch({ type: 'SKIP' }),
    next, finish: () => dispatch({ type: 'FINISH' }), reset: () => { preloadRef.current = null; tapStartRef.current = null; pendingFailsRef.current.clear(); okInGameRef.current = false; setPreloadDone(true); dispatch({ type: 'RESET' }); }, retry: () => dispatch({ type: 'RETRY' }),
  };
}
