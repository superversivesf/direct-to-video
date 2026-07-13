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
import { PhaseIndicator } from "../components/PhaseIndicator.js";
import type { DeckType } from "@pitch-storm/shared";

function Confetti() {
  const colors = ["#e94560", "#f57c00", "#ffc107", "#4caf50", "#0f3460", "#e0e0e0"];
  const pieces = Array.from({ length: 50 }, (_, i) => ({
    left: Math.random() * 100,
    delay: Math.random() * 3,
    duration: 2 + Math.random() * 2,
    color: colors[i % colors.length],
    rotation: Math.random() * 360,
  }));
  return (
    <>
      {pieces.map((p, i) => (
        <div
          key={i}
          className="confetti"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            background: p.color,
            transform: `rotate(${p.rotation}deg)`,
          }}
        />
      ))}
    </>
  );
}

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

  if (room.error) {
    return (
      <div className="game-view">
        <div className="error-banner">{room.error}</div>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }

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
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
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
          <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
          <h2>Round {state.round.current} of {state.round.total}</h2>
          <p>You are the Executive. Waiting for writers to prepare their movies...</p>
          <PlayerList players={state.players} />
        </div>
      );
    }
    const hasSelectedCard = !!state.myChosenCard;
    const hasDrawnBlind = state.myMovieReady;
    return (
      <div className="game-view">
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <WriterControls
          hand={state.myHand || []}
          selectedCard={state.myChosenCard}
          hasSelectedCard={hasSelectedCard}
          hasDrawnBlind={hasDrawnBlind}
          blindCard={state.myBlindCard}
          blindRevealed={state.myMovieRevealed}
          onSelectCard={room.selectCard}
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
    const timerStarted = state.timer.secondsRemaining < 45 || state.timer.running;

    return (
      <div className="game-view">
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} pausedForNote={state.timer.pausedForNote} />
        {isMyPitch && !timerStarted && <p>Your cards are ready — waiting for the Executive to start the timer...</p>}
        {isMyPitch && timerStarted && <p>YOUR TURN TO PITCH!</p>}
        {!isMyPitch && !timerStarted && <p>Waiting for {pitcher?.name} to start pitching...</p>}
        {!isMyPitch && timerStarted && <p>{pitcher?.name} is pitching...</p>}
        {currentMovie && <MovieReveal movie={currentMovie} large={true} />}
        {isExecutive && (
          <ExecutiveControls
            notes={state.myExecutiveNotes || []}
            timerRunning={state.timer.running}
            timerStarted={timerStarted}
            onStartTimer={room.startTimer}
            onPauseTimer={room.pauseTimer}
            onPlayNote={room.playNote}
            onEndPitch={room.endPitch}
          />
        )}
        {isMyPitch && timerStarted && <button onClick={room.endPitch}>I'm Done Pitching</button>}
      </div>
    );
  }

  // ROUND END (Executive picks winner)
  if (state.phase === "round-end") {
    return (
      <div className="game-view">
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
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
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    const winner = sorted[0];
    const isTie = sorted.length > 1 && sorted[0].score === sorted[1].score;
    return (
      <div className="game-view game-end-screen">
        <Confetti />
        <div className="winner-spotlight">
          <div className="winner-trophy">🏆</div>
          {isTie ? (
            <div className="winner-name">It's a tie!</div>
          ) : (
            <div className="winner-name">{winner.name} wins!</div>
          )}
        </div>
        <Scoreboard players={state.players} large={true} podium={true} />
        {isHost && <button onClick={room.playAgain}>Play Again</button>}
      </div>
    );
  }

  return <div>Unknown state</div>;
}
