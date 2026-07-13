import type { Movie } from "@direct-to-video/shared";
import type { PublicPlayer } from "@direct-to-video/shared";
import { MovieReveal } from "./MovieReveal.js";

interface RoundSummaryProps {
  movies: Movie[];
  players: PublicPlayer[];
  isExecutive: boolean;
  onSelectWinner: (playerId: string) => void;
}

export function RoundSummary({ movies, players, isExecutive, onSelectWinner }: RoundSummaryProps) {
  return (
    <div className="round-summary">
      {isExecutive ? (
        <h2>Select the Best Movie!</h2>
      ) : (
        <h2>The Executive is choosing the winner...</h2>
      )}
      {movies.length === 0 && <p>Waiting for movies to be revealed...</p>}
      {movies.map((movie) => {
        const player = players.find((p) => p.id === movie.playerId);
        return (
          <div key={movie.playerId} className="round-summary-movie">
            <h3>{player?.name}'s Movie</h3>
            <MovieReveal movie={movie} />
            {isExecutive && (
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
