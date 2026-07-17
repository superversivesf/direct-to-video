import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAudience } from "../hooks/useRoom.js";
import { Timer } from "../components/Timer.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { MovieReveal } from "../components/MovieReveal.js";
import type { AudienceRoomState } from "@direct-to-video/shared";

function AudienceRoundWinner({ winnerId, state, onDismiss }: {
  winnerId: string;
  state: AudienceRoomState;
  onDismiss: () => void;
}) {
  const winner = state.players.find((p) => p.id === winnerId);
  const movie = state.movies.find((m) => m.playerId === winnerId);
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
      </div>
    </div>
  );
}

export function Audience() {
  const { code } = useParams<{ code: string }>();
  const { audienceState, error, join, castVote } = useAudience();
  const [showRoundWinner, setShowRoundWinner] = useState(false);

  useEffect(() => {
    if (code) join(code.toUpperCase());
  }, [code]);

  useEffect(() => {
    if (audienceState?.roundWinnerId && audienceState.phase !== "game-end") {
      setShowRoundWinner(true);
    }
  }, [audienceState?.roundWinnerId]);

  if (error) {
    return (
      <div className="audience-loading">
        <div className="error-banner">{error}</div>
        <a href="/" className="rules-back-btn">← Back to Join</a>
      </div>
    );
  }

  if (!audienceState) {
    return <div className="audience-loading">Connecting to room {code}...</div>;
  }

  const state = audienceState;
  const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
  const pitcher = state.players.find((p) => p.id === state.currentPitcherId);
  const noteGiver = state.players.find((p) => p.id === state.noteGiverId);

  return (
    <div className="audience-view">
      {showRoundWinner && state.roundWinnerId ? (
        <AudienceRoundWinner
          key={state.roundWinnerId + state.round.current}
          winnerId={state.roundWinnerId}
          state={state}
          onDismiss={() => setShowRoundWinner(false)}
        />
      ) : null}
      <header className="audience-header">
        <h1>DIRECT TO VIDEO</h1>
        <div className="audience-meta">
          Room: {state.code} | Round {state.round.current}/{state.totalRounds}
          {noteGiver && ` | Note Giver: ${noteGiver.name}`}
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
          {currentMovie && (
            <MovieReveal
              movie={currentMovie}
              large={true}
              blindFaceDown={!currentMovie.revealed}
            />
          )}
        </div>
      )}

      {state.phase === "round-end" && (
        <div className="audience-round-end">
          {state.votingActive ? (
            <>
              <h2>Vote for the Best Movie!</h2>
              <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} />
              {state.hasVoted ? (
                <p className="audience-vote-hint">You voted! Waiting for others...</p>
              ) : (
                <p className="audience-vote-hint">Cast your vote now!</p>
              )}
            </>
          ) : (
            <h2>Voting has ended. Next round starting...</h2>
          )}
          {state.movies.map((movie) => {
            const player = state.players.find((p) => p.id === movie.playerId);
            const voteCount = state.voteCounts?.find((v) => v.playerId === movie.playerId)?.votes || 0;
            return (
              <div key={movie.playerId} className="audience-movie-card">
                <h3>{player?.name}'s Movie</h3>
                <MovieReveal movie={movie} />
                {state.votingActive && !state.hasVoted && (
                  <button onClick={() => castVote(movie.playerId)} className="btn-vote">
                    Vote for this movie
                  </button>
                )}
                {state.votingActive && state.hasVoted && (
                  <div className="vote-tally">{voteCount} vote{voteCount > 1 ? "s" : ""}</div>
                )}
                {!state.votingActive && voteCount > 0 && (
                  <div className="vote-tally">{voteCount} vote{voteCount > 1 ? "s" : ""}</div>
                )}
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