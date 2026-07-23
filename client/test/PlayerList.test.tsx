import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerList } from "../src/components/PlayerList.js";
import type { PublicPlayer } from "@direct-to-video/shared";

const players: PublicPlayer[] = [
  {
    id: "1",
    name: "Jason",
    isNoteGiver: true,
    isHost: true,
    score: 0,
    isDisconnected: false,
    isSpectator: false,
  },
  {
    id: "2",
    name: "Sarah",
    isNoteGiver: false,
    isHost: false,
    score: 0,
    isDisconnected: false,
    isSpectator: false,
  },
  {
    id: "3",
    name: "Mike",
    isNoteGiver: false,
    isHost: false,
    score: 0,
    isDisconnected: true,
    isSpectator: false,
  },
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

  it("shows note-giver icon for note-giver player", () => {
    render(<PlayerList players={players} />);
    const execPlayer = screen.getByText(/Jason/).closest("li");
    expect(execPlayer!.textContent).toContain("📝");
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

  it("shows spectator indicator for spectator player", () => {
    const spectatorPlayers: PublicPlayer[] = [
      {
        id: "1",
        name: "Jason",
        isNoteGiver: false,
        isHost: false,
        score: 0,
        isDisconnected: false,
        isSpectator: true,
      },
    ];
    const { container } = render(<PlayerList players={spectatorPlayers} />);
    const spectatorLi = container.querySelector(".player-spectator");
    expect(spectatorLi).toBeTruthy();
    expect(spectatorLi!.textContent).toContain("spectating");
  });

  it("renders ready indicator from readyPlayerIds when no movies prop", () => {
    const { container } = render(<PlayerList players={players} readyPlayerIds={["2"]} />);
    const liElements = container.querySelectorAll("li");
    expect(liElements[0]?.textContent).toContain("Jason");
    expect(liElements[0]?.textContent).toContain("📝");
    expect(liElements[1]?.textContent).toContain("Sarah");
    expect(liElements[1]?.textContent).toContain("✓ ready");
    expect(liElements[2]?.textContent).toContain("Mike");
    expect(liElements[2]?.textContent).toContain("disconnected");
    expect(liElements[2]?.textContent).not.toContain("choosing");
    expect(liElements[2]?.textContent).not.toContain("ready");
  });

  it("readyPlayerIds takes precedence over movies-derived readiness", () => {
    const movies = [{ playerId: "2" }, { playerId: "3" }] as never;
    const { container } = render(
      <PlayerList players={players} movies={movies} readyPlayerIds={["2"]} />,
    );
    const liElements = container.querySelectorAll("li");
    expect(liElements[1]?.textContent).toContain("✓ ready");
    expect(liElements[2]?.textContent).toContain("disconnected");
  });
});
