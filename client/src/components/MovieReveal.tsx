import type { Movie as MovieType } from "@direct-to-video/shared";
import { Card } from "./Card.js";

interface MovieRevealProps {
  movie: MovieType;
  large?: boolean;
  blindFaceDown?: boolean;
  movieHistory?: MovieType[];
}

export function MovieReveal({
  movie,
  large = false,
  blindFaceDown = false,
  movieHistory = [],
}: MovieRevealProps) {
  const cards = [movie.chosenCard, movie.randomCard];
  const characterFirst = [...cards].sort((a, b) => {
    if (a.type === "character" && b.type !== "character") return -1;
    if (b.type === "character" && a.type !== "character") return 1;
    return 0;
  });

  const referencedMovie = movie.franchiseSourceMovieId
    ? movieHistory.find((m) => m.id === movie.franchiseSourceMovieId)
    : null;

  return (
    <div className="movie-reveal">
      <div className="movie-cards">
        {characterFirst.map((card, i) => (
          <Card
            key={card.id + i}
            card={card}
            large={large}
            faceDown={blindFaceDown && card.id === movie.randomCard.id}
          />
        ))}
      </div>
      {referencedMovie && (
        <div className="franchise-reference">
          <h4>References:</h4>
          <div className="movie-cards">
            {[referencedMovie.chosenCard, referencedMovie.randomCard].map((card, i) => (
              <Card key={card.id + i} card={card} />
            ))}
          </div>
        </div>
      )}
      {movie.notesPlayed.length > 0 && (
        <div className="movie-notes">
          <h4>Notes from Note Giver:</h4>
          {movie.notesPlayed.map((note) => (
            <Card key={note.id} card={note} />
          ))}
        </div>
      )}
    </div>
  );
}
