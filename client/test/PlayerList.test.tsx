import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerList } from "../src/components/PlayerList.js";
import type { PublicPlayer } from "@direct-to-video/shared";

const players: PublicPlayer[] = [
  { id: "1", name: "Jason", isExecutive: true, isHost: true, score: 0, isDisconnected: false },
  { id: "2", name: "Sarah", isExecutive: false, isHost: false, score: 0, isDisconnected: false },
  { id: "3", name: "Mike", isExecutive: false, isHost: false, score: 0, isDisconnected: true },
];

describe("PlayerList", () => {
  it("renders all player names", () => {
    render(<PlayerList players={players} />);
    expect(screen.getByText(/Jason/)).toBeTruthy();
    expect(screen.getByText(/Sarah/)).toBeTruthy();
    expect(screen.getByText(/Mike/)).toBeTruthy();
  });

  it("renders Players heading", () => {
    render(<PlayerList players={players} />);
    expect(screen.getByText("Players")).toBeTruthy();
  });

  it("shows executive icon for executive player", () => {
    render(<PlayerList players={players} />);
    const execPlayer = screen.getByText(/Jason/).closest("li");
    expect(execPlayer!.textContent).toContain("🎬");
  });

  it("shows host icon for host player", () => {
    render(<PlayerList players={players} />);
    const hostPlayer = screen.getByText(/Jason/).closest("li");
    expect(hostPlayer!.textContent).toContain("👑");
  });

  it("shows disconnected indicator for disconnected player", () => {
    const { container } = render(<PlayerList players={players} />);
    const disconnectedLi = container.querySelector(".player-disconnected");
    expect(disconnectedLi).toBeTruthy();
    expect(disconnectedLi!.textContent).toContain("Mike");
  });

  it("renders with empty players list", () => {
    render(<PlayerList players={[]} />);
    expect(screen.getByText("Players")).toBeTruthy();
  });
});