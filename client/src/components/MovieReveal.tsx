import type { Movie as MovieType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface MovieRevealProps {
  movie: MovieType;
  large?: boolean;
}

export function MovieReveal({ movie, large = false }: MovieRevealProps) {
  return (
    <div className="movie-reveal">
      <div className="movie-cards">
        <Card card={movie.chosenCard} large={large} />
        <Card card={movie.randomCard} large={large} />
      </div>
      {movie.notesPlayed.length > 0 && (
        <div className="movie-notes">
          <h4>Notes from Executive:</h4>
          {movie.notesPlayed.map((note) => (
            <Card key={note.id} card={note} />
          ))}
        </div>
      )}
    </div>
  );
}