import { useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom.js";
import { PlayerList } from "../components/PlayerList.js";
import { Timer } from "../components/Timer.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { MovieReveal } from "../components/MovieReveal.js";
import { WriterControls } from "../components/WriterControls.js";
import { ExecutiveControls } from "../components/ExecutiveControls.js";
import { RoundSummary } from "../components/RoundSummary.js";
import type { DeckType } from "@pitch-storm/shared";

export function Game() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const room = useRoom();
  const joinedRef = useRef(false);

  useEffect(() => {
    const name = getCookie("playerName") || "";
    if (name && code) {
      const emitCode = code === "_create" ? "" : code;
      room.joinRoom(emitCode, name);
    }
  }, [code]);

  useEffect(() => {
    if (room.roomState && code === "_create") {
      const realCode = room.roomState.code;
      if (realCode && !joinedRef.current) {
        joinedRef.current = true;
        navigate(`/room/${realCode}`, { replace: true });
      }
    }
  }, [room.roomState, code, navigate]);

  function getCookie(key: string): string | undefined {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match?.[2];
  }

  if (!room.roomState) {
    return <div className="loading">Connecting...</div>;
  }

  const state = room.roomState;
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isExecutive = state.myPlayerId === state.executiveId;
  const isHost = myPlayer?.isHost ?? false;

  // LOBBY
  if (state.phase === "lobby") {
    return (
      <div className="game-view">
        <h1>Pitch Storm — Room {state.code}</h1>
        <PlayerList players={state.players} />
        {isHost && <button onClick={room.startGame}>Start Game</button>}
      </div>
    );
  }

  // SETUP (choose deck type)
  if (state.phase === "setup" && !isExecutive && (!state.myHand || state.myHand.length === 0)) {
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <p>You are a Writer. Choose your deck:</p>
        <button onClick={() => room.selectDeckType("plot" as DeckType)}>Draw PLOT cards</button>
        <button onClick={() => room.selectDeckType("character" as DeckType)}>Draw CHARACTER cards</button>
      </div>
    );
  }

  // CARD SELECTION
  if (state.phase === "setup" || state.phase === "card-selection") {
    if (isExecutive) {
      return (
        <div className="game-view">
          <h2>Round {state.round.current} of {state.round.total}</h2>
          <p>You are the Executive. Waiting for writers to prepare their movies...</p>
          <PlayerList players={state.players} />
        </div>
      );
    }
    const myMovie = state.movies.find((m) => m.playerId === state.myPlayerId);
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <WriterControls
          hand={state.myHand || []}
          hasSelectedCard={!!myMovie?.chosenCard}
          hasDrawnBlind={!!myMovie?.randomCard}
          onSelectCard={room.selectCard}
          onDrawBlind={room.drawRandomCard}
          onReady={room.revealMovie}
        />
      </div>
    );
  }

  // PITCHING
  if (state.phase === "pitching") {
    const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
    const isMyPitch = state.currentPitcherId === state.myPlayerId;
    const pitcher = state.players.find((p) => p.id === state.currentPitcherId);

    return (
      <div className="game-view">
        <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} />
        {isMyPitch && <p>YOUR TURN TO PITCH!</p>}
        {!isMyPitch && <p>{pitcher?.name} is pitching...</p>}
        {currentMovie && <MovieReveal movie={currentMovie} large={true} />}
        {isExecutive && (
          <ExecutiveControls
            notes={state.myExecutiveNotes || []}
            timerRunning={state.timer.running}
            onStartTimer={room.startTimer}
            onPauseTimer={room.pauseTimer}
            onPlayNote={room.playNote}
            onEndPitch={room.endPitch}
          />
        )}
        {isMyPitch && <button onClick={room.endPitch}>I'm Done Pitching</button>}
      </div>
    );
  }

  // ROUND END (Executive picks winner)
  if (state.phase === "round-end") {
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <RoundSummary
          movies={state.movies}
          players={state.players}
          isExecutive={isExecutive}
          onSelectWinner={room.selectWinner}
        />
      </div>
    );
  }

  // GAME END
  if (state.phase === "game-end") {
    return (
      <div className="game-view game-end-screen">
        <h1>Game Over!</h1>
        <Scoreboard players={state.players} large={true} />
        {isHost && <button onClick={room.playAgain}>Play Again</button>}
      </div>
    );
  }

  return <div>Unknown state</div>;
}