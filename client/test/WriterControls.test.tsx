import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WriterControls } from "../src/components/WriterControls.js";
import type { Card as CardType } from "@pitch-storm/shared";

const plotCard: CardType = { id: "p1", type: "plot", text: "A heist gone wrong" };
const charCard: CardType = { id: "c1", type: "character", text: "A retired villain" };
const blindCard: CardType = { id: "b1", type: "character", text: "A talking dog" };

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

describe("WriterControls", () => {
  it("renders hand cards with click prompt when no card selected", () => {
    render(
      <WriterControls hand={hand} selectedCard={null} hasSelectedCard={false} hasDrawnBlind={false}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    expect(screen.getByText(/click a card to play it/i)).toBeTruthy();
    expect(screen.getByText("Plot A")).toBeTruthy();
  });

  it("calls onSelectCard when a hand card is clicked", () => {
    render(
      <WriterControls hand={hand} selectedCard={null} hasSelectedCard={false} hasDrawnBlind={false}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    fireEvent.click(screen.getByText("Plot A"));
    expect(mockFns.onSelectCard).toHaveBeenCalledWith("p1");
  });

  it("shows selected card and blind draw button after selecting", () => {
    render(
      <WriterControls hand={[plotCard]} selectedCard={plotCard} hasSelectedCard={true} hasDrawnBlind={false}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    expect(screen.getByText("Card Selected")).toBeTruthy();
    expect(screen.getByText(/draw a blind card/i)).toBeTruthy();
    expect(screen.getByText("Character Deck")).toBeTruthy();
  });

  it("only shows opposite deck for blind draw", () => {
    render(
      <WriterControls hand={[charCard]} selectedCard={charCard} hasSelectedCard={true} hasDrawnBlind={false}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    expect(screen.getByText("Plot Deck")).toBeTruthy();
    expect(screen.queryByText("Character Deck")).toBeNull();
  });

  it("calls onDrawBlind with correct deck type", () => {
    render(
      <WriterControls hand={[plotCard]} selectedCard={plotCard} hasSelectedCard={true} hasDrawnBlind={false}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    fireEvent.click(screen.getByText("Character Deck"));
    expect(mockFns.onDrawBlind).toHaveBeenCalledWith("character");
  });

  it("shows face-down blind card and Ready to Pitch button after blind draw", () => {
    render(
      <WriterControls hand={[]} selectedCard={plotCard} hasSelectedCard={true} hasDrawnBlind={true}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    expect(screen.getByText(/blind card will be revealed/i)).toBeTruthy();
    expect(screen.getByText("Ready to Pitch")).toBeTruthy();
  });

  it("calls onReady when Ready to Pitch is clicked", () => {
    render(
      <WriterControls hand={[]} selectedCard={plotCard} hasSelectedCard={true} hasDrawnBlind={true}
        blindCard={null} blindRevealed={false} {...mockFns} />
    );
    fireEvent.click(screen.getByText("Ready to Pitch"));
    expect(mockFns.onReady).toHaveBeenCalled();
  });

  it("shows both cards face-up after reveal (character on top)", () => {
    render(
      <WriterControls hand={[]} selectedCard={charCard} hasSelectedCard={true} hasDrawnBlind={true}
        blindCard={plotCard} blindRevealed={true} {...mockFns} />
    );
    const cards = screen.getAllByText(/CHARACTER|PLOT/);
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});