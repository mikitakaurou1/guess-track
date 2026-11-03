import { useEffect, useRef, useState } from 'react';
import HiddenPlayer from './components/HiddenPlayer';
import SetupScreen from './components/SetupScreen';
import GameScreen from './components/GameScreen';
import FinalScreen from './components/FinalScreen';
import GuestApp from './components/GuestApp';
import { useSoundCloud } from './hooks/useSoundCloud';
import { useGame } from './hooks/useGame';
import { useHostRoom } from './hooks/useRoom';
import { buildSnapshot } from './game/snapshot';

const roomFromUrl = () => new URLSearchParams(location.search).get('room')?.toUpperCase() ?? '';

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { player, error } = useSoundCloud(iframeRef);
  const game = useGame(player);
  const room = useHostRoom(game.handleRemote);
  const [mode, setMode] = useState<'host' | 'join'>(roomFromUrl() ? 'join' : 'host');
  const { state } = game;

  // Рассылка состояния гостям (раз в 0.5 с для прогресс-бара и при каждом изменении игры)
  const bucket = Math.floor(game.positionMs / 500);
  useEffect(() => {
    if (room.code) room.send({ t: 'broadcast', data: buildSnapshot(state, game.positionMs) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room.code, room.guests, state, bucket]);

  // Подключаться к комнате можно только пока игра не идёт
  useEffect(() => {
    if (room.code) room.send({ t: 'set_open', open: state.phase === 'setup' });
  }, [room.code, state.phase, room.send]);

  return (
    <>
      <div className="bg-orb orb-1" />
      <div className="bg-orb orb-2" />
      <div className="bg-orb orb-3" />
      <main className="wrap">
        <header className="logo">
          <span className="logo-icon">♪</span>
          <h1>Guess<span>Track</span></h1>
        </header>

        <HiddenPlayer ref={iframeRef} />

        {mode === 'join' && (
          <GuestApp player={player} initialCode={roomFromUrl()} onBack={() => setMode('host')} />
        )}

        {mode === 'host' && (
          <>
            {state.phase === 'setup' && (
              <SetupScreen
                ready={!!player}
                busy={game.isLoadingPlaylist}
                error={error ?? game.loadError}
                playlist={game.playlist}
                sources={game.sources}
                room={room}
                onLoadSources={game.loadSources}
                onLoadLinks={game.loadFromLinks}
                onChangePlaylist={game.clearPlaylist}
                onStart={game.startGame}
                onJoinMode={() => setMode('join')}
              />
            )}

            {state.phase !== 'setup' && state.phase !== 'final' && state.config && (
              <GameScreen
                state={state}
                track={game.track}
                positionMs={game.positionMs}
                onBuzz={game.buzz}
                onSubmit={game.submitAnswer}
                onTimeout={game.answerTimeout}
                onSkip={game.skip}
                onNext={game.next}
                onFinish={game.finish}
                onRetry={game.retry}
              />
            )}

            {state.phase === 'final' && state.config && (
              <FinalScreen
                names={state.config.playerNames}
                scores={state.scores}
                history={state.history}
                onRestart={game.reset}
              />
            )}
          </>
        )}
      </main>
    </>
  );
}
