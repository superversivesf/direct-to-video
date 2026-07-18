import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../src/components/Card.js";
import type { Card as CardType } from "@direct-to-video/shared";

describe("Card", () => {
  const card: CardType = {
    id: "test1",
    type: "plot",
    text: "A detective who can hear the last thought of any object",
  };

  it("renders card text", () => {
    render(<Card card={card} />);
    expect(screen.getByText(card.text)).toBeTruthy();
  });

  it("renders card type label", () => {
    render(<Card card={card} />);
    expect(screen.getByText("PLOT")).toBeTruthy();
  });

  it("renders face-down card when faceDown is true", () => {
    render(<Card card={card} faceDown={true} />);
    expect(screen.queryByText(card.text)).toBeNull();
    expect(screen.getByText("PLOT")).toBeTruthy();
  });

  it("applies correct CSS class for card type", () => {
    const { container } = render(<Card card={card} />);
    expect(container.firstChild).toHaveClass("card--plot");
  });
});
