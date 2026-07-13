import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MovieReveal } from "../src/components/MovieReveal.js";
import type { Movie } from "@direct-to-video/shared";

const plotCard = { id: "p1", type: "plot" as const, text: "A heist gone wrong" };
const charCard = { id: "c1", type: "character" as const, text: "A retired villain" };
const noteCard = { id: "n1", type: "note" as const, text: "Add a musical number" };

const movieWithNotes: Movie = {
  playerId: "1",
  chosenCard: plotCard,
  randomCard: charCard,
  notesPlayed: [noteCard],
  revealed: true,
};

const movieNoNotes: Movie = {
  playerId: "1",
  chosenCard: charCard,
  randomCard: plotCard,
  notesPlayed: [],
  revealed: true,
};

describe("MovieReveal", () => {
  it("renders both card texts", () => {
    render(<MovieReveal movie={movieWithNotes} />);
    expect(screen.getByText("A heist gone wrong")).toBeTruthy();
    expect(screen.getByText("A retired villain")).toBeTruthy();
  });

  it("renders character card before plot card (character on top)", () => {
    const { container } = render(<MovieReveal movie={movieWithNotes} />);
    const cards = container.querySelectorAll(".movie-cards .card-template");
    expect(cards.length).toBe(2);
    expect(cards[0]).toHaveClass("card--character");
    expect(cards[1]).toHaveClass("card--plot");
  });

  it("shows notes section when notes have been played", () => {
    render(<MovieReveal movie={movieWithNotes} />);
    expect(screen.getByText(/notes from executive/i)).toBeTruthy();
    expect(screen.getByText("Add a musical number")).toBeTruthy();
  });

  it("hides notes section when no notes played", () => {
    const { container } = render(<MovieReveal movie={movieNoNotes} />);
    expect(container.querySelector(".movie-notes")).toBeNull();
  });

  it("renders multiple note cards", () => {
    const movie: Movie = {
      ...movieWithNotes,
      notesPlayed: [
        noteCard,
        { id: "n2", type: "note", text: "Everyone rhymes" },
        { id: "n3", type: "note", text: "Add a car chase" },
      ],
    };
    render(<MovieReveal movie={movie} />);
    expect(screen.getByText("Add a musical number")).toBeTruthy();
    expect(screen.getByText("Everyone rhymes")).toBeTruthy();
    expect(screen.getByText("Add a car chase")).toBeTruthy();
  });

  it("applies large class to cards when large prop is true", () => {
    const { container } = render(<MovieReveal movie={movieWithNotes} large={true} />);
    const cards = container.querySelectorAll(".movie-cards .card-template");
    expect(cards[0]).toHaveClass("card-large");
  });
});