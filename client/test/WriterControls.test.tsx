import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WriterControls } from "../src/components/WriterControls.js";
import type { Card as CardType, Movie as MovieType } from "@direct-to-video/shared";

const plotCard: CardType = { id: "p1", type: "plot", text: "A heist gone wrong" };
const charCard: CardType = { id: "c1", type: "character", text: "A retired villain" };
const __blindCard: CardType = { id: "b1", type: "character", text: "A talking dog" };

const hand: CardType[] = [
  { id: "p1", type: "plot", text: "Plot A" },
  { id: "p2", type: "plot", text: "Plot B" },
  { id: "p3", type: "plot", text: "Plot C" },
];

const mockFns = {
  onSelectCard: vi.fn(),
  onDrawBlind: vi.fn(),
  onReady: vi.fn(),
};

const franchiseProps = {
  movieHistory: [],
  franchiseSourceMovieId: null,
  myPlayerId: "me",
  onSelectFranchiseSource: () => {},
};

describe("WriterControls", () => {
  it("renders hand cards with click prompt when no card selected", () => {
    render(
      <WriterControls
        hand={hand}
        selectedCard={null}
        hasSelectedCard={false}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    expect(screen.getByText(/click a card to play it/i)).toBeTruthy();
    expect(screen.getByText("Plot A")).toBeTruthy();
  });

  it("calls onSelectCard when a hand card is clicked", () => {
    render(
      <WriterControls
        hand={hand}
        selectedCard={null}
        hasSelectedCard={false}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    fireEvent.click(screen.getByText("Plot A"));
    expect(mockFns.onSelectCard).toHaveBeenCalledWith("p1");
  });

  it("shows selected card and face-down blind card after selecting (not revealed)", () => {
    render(
      <WriterControls
        hand={[]}
        selectedCard={plotCard}
        hasSelectedCard={true}
        hasDrawnBlind={true}
        blindCard={null}
        blindRevealed={false}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    expect(screen.getByText("Your Movie")).toBeTruthy();
    expect(screen.getByText("A heist gone wrong")).toBeTruthy();
    expect(screen.getByText("CHARACTER")).toBeTruthy();
  });

  it("shows Ready to Pitch button after selecting", () => {
    render(
      <WriterControls
        hand={[]}
        selectedCard={plotCard}
        hasSelectedCard={true}
        hasDrawnBlind={true}
        blindCard={null}
        blindRevealed={false}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    expect(screen.getByText("Ready to Pitch")).toBeTruthy();
  });

  it("calls onReady when Ready to Pitch is clicked", () => {
    render(
      <WriterControls
        hand={[]}
        selectedCard={plotCard}
        hasSelectedCard={true}
        hasDrawnBlind={true}
        blindCard={null}
        blindRevealed={false}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    fireEvent.click(screen.getByText("Ready to Pitch"));
    expect(mockFns.onReady).toHaveBeenCalled();
  });

  it("shows both cards face-up after reveal (character on top)", () => {
    render(
      <WriterControls
        hand={[]}
        selectedCard={charCard}
        hasSelectedCard={true}
        hasDrawnBlind={true}
        blindCard={plotCard}
        blindRevealed={true}
        {...mockFns}
        {...franchiseProps}
      />,
    );
    const cards = screen.getAllByText(/CHARACTER|PLOT/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });

  it("renders franchise picker when selected card is franchise and history is non-empty", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).toContain("Pick a previously pitched movie");
    expect(container.textContent).toContain("Other player's plot");
  });

  it("does not render franchise picker when movieHistory is empty", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Pick a previously pitched movie");
  });

  it("disables Ready button when franchise card has no source and history exists", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    const readyButton = screen.getByText("Ready to Pitch");
    expect(readyButton).toHaveAttribute("disabled");
  });

  it("enables Ready button when franchise source is picked", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId="h1"
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    const readyButton = screen.getByText("Ready to Pitch");
    expect(readyButton).not.toHaveAttribute("disabled");
  });

  it("filters own movies from the franchise picker", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const ownHistoryMovie: MovieType = {
      id: "h-own",
      playerId: "me",
      chosenCard: { id: "hc1", type: "plot", text: "My own prior plot" },
      randomCard: { id: "hc2", type: "character", text: "My own character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const otherHistoryMovie: MovieType = {
      id: "h-other",
      playerId: "other-player",
      chosenCard: { id: "hc3", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc4", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[ownHistoryMovie, otherHistoryMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("My own prior plot");
    expect(container.textContent).toContain("Other player's plot");
  });

  it("calls onSelectFranchiseSource when a prior movie is clicked", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const onSelect = vi.fn();
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={onSelect}
      />,
    );
    fireEvent.click(screen.getByText(/Other player's plot/));
    expect(onSelect).toHaveBeenCalledWith("h1");
  });
});