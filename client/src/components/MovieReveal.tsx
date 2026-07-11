import type { Movie as MovieType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface MovieRevealProps {
  movie: MovieType;
  large?: boolean;
}

export function MovieReveal({ movie, large = false }: MovieRevealProps) {
  const cards = [movie.chosenCard, movie.randomCard];
  const characterFirst = [...cards].sort((a, b) => {
    if (a.type === "character" && b.type !== "character") return -1;
    if (b.type === "character" && a.type !== "character") return 1;
    return 0;
  });

  return (
    <div className="movie-reveal">
      <div className="movie-cards">
        {characterFirst.map((card, i) => (
          <Card key={card.id + i} card={card} large={large} />
        ))}
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