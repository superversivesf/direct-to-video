import { useEffect, useRef, useState } from "react";
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
import type { DeckType, PublicRoomState } from "@direct-to-video/shared";

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

function RoundWinnerBanner({ winnerId, players, movies, onDismiss }: {
  winnerId: string;
  players: PublicRoomState["players"];
  movies: PublicRoomState["movies"];
  onDismiss: () => void;
}) {
  const winner = players.find((p) => p.id === winnerId);
  const movie = movies.find((m) => m.playerId === winnerId);
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  if (!winner) return null;
  return (
    <div className="round-winner-overlay" onClick={onDismiss}>
      <div className="round-winner-banner">
        <div className="round-winner-trophy">🏆</div>
        <div className="round-winner-text">{winner.name} wins this round!</div>
        {movie && (
          <div className="round-winner-movie">
            <MovieReveal movie={movie} />
          </div>
        )}
        <div className="round-winner-hint">Click to continue</div>
      </div>
    </div>
  );
}

export function Game() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const room = useRoom();
  const joinedRef = useRef(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showRoundWinner, setShowRoundWinner] = useState(false);

  useEffect(() => {
    const name = getCookie("playerName") || "";
    if (!name && code && code !== "_create") {
      navigate(`/?code=${code}`, { replace: true });
      return;
    }
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

  useEffect(() => {
    if (room.roomState?.roundWinnerId && room.roomState.phase !== "game-end") {
      setShowRoundWinner(true);
    }
  }, [room.roomState?.roundWinnerId]);

  function getCookie(key: string): string | undefined {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match?.[2];
  }

  function copyRoomLink() {
    const link = `${window.location.origin}/room/${state.code}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  function handleLeave() {
    room.leaveGame();
    navigate("/", { replace: true });
  }

  if (!room.roomState) {
    return <div className="loading">Connecting...</div>;
  }

  const state = room.roomState;
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isExecutive = state.myPlayerId === state.executiveId;
  const isHost = myPlayer?.isHost ?? false;

  const roundWinnerOverlay = showRoundWinner && state.roundWinnerId ? (
    <RoundWinnerBanner
      key={state.roundWinnerId + state.round.current}
      winnerId={state.roundWinnerId}
      players={state.players}
      movies={state.movies}
      onDismiss={() => setShowRoundWinner(false)}
    />
  ) : null;

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
        <h1>Direct to Video — Room {state.code}</h1>
        <PlayerList players={state.players} />
        {isHost && (
          <div className="lobby-options">
            <label className="franchise-toggle">
              <input
                type="checkbox"
                checked={state.franchiseEnabled}
                onChange={(e) => room.setFranchiseEnabled(e.target.checked)}
              />
              Include FRANCHISE PITCH cards
            </label>
            <button onClick={room.startGame}>Start Game</button>
          </div>
        )}
        {!isHost && (
          <p className="lobby-waiting">Waiting for host to start the game{state.franchiseEnabled ? "" : " (franchise cards disabled)"}...</p>
        )}
        <div className="share-link-section">
          <p>Share this link with your friends:</p>
          <div className="share-link-row">
            <code className="share-link-url">{window.location.origin}/room/{state.code}</code>
            <button onClick={copyRoomLink} className="btn-copy-link">
              {linkCopied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </div>
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
      </div>
    );
  }

  // SETUP (choose deck type)
  if (state.phase === "setup" && !isExecutive && (!state.myHand || state.myHand.length === 0)) {
    return (
      <div className="game-view">
        {roundWinnerOverlay}
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <p>You are a Writer. Choose your deck:</p>
        <button onClick={() => room.selectDeckType("plot" as DeckType)}>Draw PLOT cards</button>
        <button onClick={() => room.selectDeckType("character" as DeckType)}>Draw CHARACTER cards</button>
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
      </div>
    );
  }

  // CARD SELECTION
  if (state.phase === "setup" || state.phase === "card-selection") {
    if (isExecutive) {
      return (
        <div className="game-view">
          {roundWinnerOverlay}
          <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
          <h2>Round {state.round.current} of {state.round.total}</h2>
          <p>You are the Executive. Waiting for writers to prepare their movies...</p>
          <PlayerList players={state.players} />
          <button onClick={handleLeave} className="btn-leave">Leave Game</button>
        </div>
      );
    }
    const hasSelectedCard = !!state.myChosenCard;
    const hasDrawnBlind = state.myMovieReady;
    return (
      <div className="game-view">
        {roundWinnerOverlay}
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <WriterControls
          hand={state.myHand || []}
          selectedCard={state.myChosenCard}
          hasSelectedCard={hasSelectedCard}
          hasDrawnBlind={hasDrawnBlind}
          blindCard={state.myBlindCard}
          blindRevealed={false}
          onSelectCard={room.selectCard}
          onReady={room.revealMovie}
        />
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
      </div>
    );
  }

  // PITCHING
  if (state.phase === "pitching") {
    const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
    const isMyPitch = state.currentPitcherId === state.myPlayerId;
    const pitcher = state.players.find((p) => p.id === state.currentPitcherId);
    const timerStarted = state.timer.secondsRemaining < 45 || state.timer.running || state.timer.pausedForNote;

    return (
      <div className="game-view">
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} pausedForNote={state.timer.pausedForNote} />
        {isMyPitch && !timerStarted && <p>Your cards are ready — waiting for the Executive to start the timer...</p>}
        {isMyPitch && timerStarted && <p>YOUR TURN TO PITCH!</p>}
        {!isMyPitch && !timerStarted && <p>Waiting for {pitcher?.name} to start pitching...</p>}
        {!isMyPitch && timerStarted && <p>{pitcher?.name} is pitching...</p>}
        {currentMovie && <MovieReveal movie={currentMovie} large={true} blindFaceDown={!timerStarted} />}
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
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
      </div>
    );
  }

  // ROUND END (Executive picks winner, audience votes)
  if (state.phase === "round-end") {
    const timerRunning = state.timer.running;
    return (
      <div className="game-view">
        <PhaseIndicator phase={state.phase} isExecutive={isExecutive} />
        <h2>Round {state.round.current} of {state.round.total}</h2>
        {state.votingActive && timerRunning && (
          <>
            <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} />
            <p>Audience voting in progress — the Executive's pick counts as 2x!</p>
          </>
        )}
        {state.votingActive && !timerRunning && (
          <p>Audience is voting. Pick a movie to start the final countdown (your pick = 2x)!</p>
        )}
        <RoundSummary
          movies={state.movies}
          players={state.players}
          isExecutive={isExecutive && !timerRunning}
          onSelectWinner={room.selectWinner}
          votingActive={state.votingActive}
          voteCounts={state.voteCounts}
        />
        {isExecutive && state.votingActive && timerRunning && (
          <button onClick={room.endVoting} className="btn-voting">End Voting Now</button>
        )}
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
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
        <button onClick={handleLeave} className="btn-leave">Leave Game</button>
      </div>
    );
  }

  return <div>Unknown state</div>;
}
