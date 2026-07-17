import type { Movie } from "@direct-to-video/shared";
import type { PublicPlayer } from "@direct-to-video/shared";
import { MovieReveal } from "./MovieReveal.js";

interface RoundSummaryProps {
  movies: Movie[];
  players: PublicPlayer[];
  isExecutive: boolean;
  onSelectWinner: (playerId: string) => void;
  votingActive?: boolean;
  voteCounts?: { playerId: string; votes: number }[];
  canPick?: boolean;
}

export function RoundSummary({ movies, players, isExecutive, onSelectWinner, votingActive, voteCounts, canPick = true }: RoundSummaryProps) {
  return (
    <div className="round-summary">
      {isExecutive && canPick ? (
        <h2>Select the Best Movie!</h2>
      ) : votingActive ? (
        <h2>Voting in Progress</h2>
      ) : (
        <h2>The Executive is choosing the winner...</h2>
      )}
      {movies.length === 0 && <p>Waiting for movies to be revealed...</p>}
      {movies.map((movie) => {
        const player = players.find((p) => p.id === movie.playerId);
        const voteCount = voteCounts?.find((v) => v.playerId === movie.playerId)?.votes || 0;
        return (
          <div key={movie.playerId} className="round-summary-movie">
            <h3>{player?.name}'s Movie</h3>
            <MovieReveal movie={movie} />
            {votingActive && voteCount > 0 && (
              <div className="vote-tally">{voteCount} vote{voteCount > 1 ? "s" : ""}</div>
            )}
            {isExecutive && canPick && (
              <button onClick={() => onSelectWinner(movie.playerId)}>
                Pick This Movie
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}