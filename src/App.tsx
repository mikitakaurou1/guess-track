import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import HiddenPlayer from './components/HiddenPlayer';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import FinalScreen from './components/FinalScreen';
import GuestApp from './components/GuestApp';
import SonglessGame from './components/SonglessGame';
import Deco from './components/Deco';
import Logo from './components/Logo';
import { useSoundCloud } from './hooks/useSoundCloud';
import { useGame } from './hooks/useGame';
import { useHostRoom } from './hooks/useRoom';
import { buildSnapshot } from './game/snapshot';
import { createReversePlayer } from './services/ReversePlayer';
import type { GameConfig } from './types/game';
const roomFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';
export default function App() {
  const iframeA = useRef<HTMLIFrameElement>(null);
  const iframeB = useRef<HTMLIFrameElement>(null);
  const { players, player, error } = useSoundCloud([iframeA, iframeB]);
  const [reverseSeconds, setReverseSeconds] = useState<number | null>(null);
  const secondsRef = useRef(10); secondsRef.current = reverseSeconds ?? 10;
  const reversePlayers = useMemo(() => players?.map(p => createReversePlayer(p, () => secondsRef.current)) ?? null, [players]);
  useEffect(() => () => reversePlayers?.forEach(p => p.detach()), [reversePlayers]);
  const sendRef = useRef<(obj: unknown) => void>(() => {});
  const game = useGame(reverseSeconds === null ? players : reversePlayers, { send: obj => sendRef.current(obj) });
  const room = useHostRoom(game.handleRemote); sendRef.current = room.send;
  const [mode, setMode] = useState<'host' | 'join'>(roomFromUrl() ? 'join' : 'host');
  const [songless, setSongless] = useState<GameConfig | null>(null);
  const { state } = game;
  const rsSeed = state.config?.randomStart ? (state.config.startSeed ?? 0) : null;
  const rsClip = state.config?.clipSeconds ?? 10;
  useLayoutEffect(() => { const m = rsSeed === null ? undefined : { seed: rsSeed, clipMs: rsClip * 1000 }; players?.forEach(p => p.setStartMode(m)); }, [players, rsSeed, rsClip]);
  const bucket = Math.floor(game.positionMs / 500);
  useEffect(() => {
    if (room.code) room.send({ t: 'broadcast', data: { ...buildSnapshot(state, game.positionMs), hp: game.nextPing() } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code, room.guests, state, bucket]);
  useEffect(() => { if (room.code) room.send({ t: 'set_open', open: state.phase === 'setup' }); }, [room.code, state.phase, room.send]);
  const reset = () => { reversePlayers?.forEach(p => p.detach()); setReverseSeconds(null); game.reset(); };
  return <><div className='bg-orb orb-1'/><div className='bg-orb orb-2'/><div className='bg-orb orb-3'/><Deco/>
    <main className='wrap'><Logo/><HiddenPlayer refA={iframeA} refB={iframeB}/>
      {mode === 'join' && <GuestApp player={player} initialCode={roomFromUrl()} onBack={() => setMode('host')}/>}
      {mode === 'host' && <>
        {state.phase === 'setup' && <div hidden={!!songless}>
          <SetupScreen ready={!!player} busy={game.isLoadingPlaylist} error={error ?? game.loadError} playlist={game.playlist} sources={game.sources} room={room} onLoadSources={game.loadSources} onChangePlaylist={game.clearPlaylist} onStart={cfg => { setReverseSeconds(null); player?.unlock(); if (cfg.songless) setSongless(cfg); else game.startGame(cfg); }} onReverseStart={cfg => { players?.forEach(p => p.detach()); setReverseSeconds(cfg.clipSeconds); game.startGame({ ...cfg, reverse: true }); }} onJoinMode={() => setMode('join')}/>
        </div>}
        {state.phase === 'setup' && songless && <SonglessGame players={players} playlist={game.playlist} config={songless} onExit={() => setSongless(null)}/>}
        {state.phase !== 'setup' && state.phase !== 'final' && state.config && <>{state.config.reverse && <div className='step'>Перевертыш{room.code ? ' · игра в комнате' : ''}</div>}<GameScreen state={state} track={game.track} positionMs={game.positionMs} soundBlocked={game.soundBlocked} nextBusy={game.nextBusy} onEnableSound={game.enableSound} onBuzz={game.buzz} onSubmit={game.submitAnswer} onTimeout={game.answerTimeout} onSkip={game.skip} onNext={game.next} onFinish={game.finish} onRetry={() => { (reverseSeconds === null ? player : reversePlayers?.[state.round % 2])?.unlock(); game.retry(); }}/></>}
        {state.phase === 'final' && state.config && <FinalScreen names={state.config.playerNames} avatars={state.config.avatars} scores={state.scores} history={state.history} onRestart={reset}/>}
      </>}
      <p className='muted small center-text'>разработчик: mikitakaurou</p>
    </main></>;
}
