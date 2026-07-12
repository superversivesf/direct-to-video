import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAudience } from "../hooks/useRoom.js";
import { Timer } from "../components/Timer.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { MovieReveal } from "../components/MovieReveal.js";

export function Audience() {
  const { code } = useParams<{ code: string }>();
  const { audienceState, join } = useAudience();

  useEffect(() => {
    if (code) join(code.toUpperCase());
  }, [code]);

  if (!audienceState) {
    return <div className="audience-loading">Connecting to room {code}...</div>;
  }

  const state = audienceState;
  const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
  const pitcher = state.players.find((p) => p.id === state.currentPitcherId);
  const executive = state.players.find((p) => p.id === state.executiveId);

  return (
    <div className="audience-view">
      <header className="audience-header">
        <h1>PITCH STORM</h1>
        <div className="audience-meta">
          Room: {state.code} | Round {state.round.current}/{state.round.total}
          {executive && ` | Executive: ${executive.name}`}
        </div>
      </header>

      {state.phase === "lobby" && (
        <div className="audience-lobby">
          <h2>Waiting for game to start...</h2>
          <div className="audience-player-list">
            {state.players.map((p) => (
              <div key={p.id} className="audience-player">
                {p.isHost && "👑 "}
                {p.name}
                {p.isDisconnected && " (disconnected)"}
              </div>
            ))}
          </div>
        </div>
      )}

      {state.phase === "setup" && (
        <div className="audience-setup">
          <h2>Writers are choosing their cards...</h2>
        </div>
      )}

      {(state.phase === "card-selection" || state.phase === "pitching") && (
        <div className="audience-pitching">
          <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} pausedForNote={state.timer.pausedForNote} />
          {pitcher && <h2 className="audience-pitcher-name">Now Pitching: {pitcher.name}</h2>}
          {currentMovie && <MovieReveal movie={currentMovie} large={true} />}
        </div>
      )}

      {state.phase === "round-end" && (
        <div className="audience-round-end">
          <h2>Executive is choosing the winner...</h2>
          {state.movies.map((movie) => {
            const player = state.players.find((p) => p.id === movie.playerId);
            return (
              <div key={movie.playerId}>
                <h3>{player?.name}'s Movie</h3>
                <MovieReveal movie={movie} />
              </div>
            );
          })}
        </div>
      )}

      {state.phase === "game-end" && (
        <div className="audience-game-end">
          <div className="winner-spotlight">
            <div className="winner-trophy">🏆</div>
            {(() => {
              const sorted = [...state.players].sort((a, b) => b.score - a.score);
              const isTie = sorted.length > 1 && sorted[0].score === sorted[1].score;
              return isTie ? (
                <div className="winner-name">It's a tie!</div>
              ) : (
                <div className="winner-name">{sorted[0].name} wins!</div>
              );
            })()}
          </div>
        </div>
      )}

      <footer className="audience-footer">
        <Scoreboard players={state.players} large={state.phase === "game-end"} podium={state.phase === "game-end"} />
      </footer>
    </div>
  );
}