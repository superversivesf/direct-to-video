import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Scoreboard } from "../src/components/Scoreboard.js";
import type { PublicPlayer } from "@direct-to-video/shared";

const players: PublicPlayer[] = [
  { id: "1", name: "Jason", isExecutive: false, isHost: true, score: 3, isDisconnected: false },
  { id: "2", name: "Sarah", isExecutive: false, isHost: false, score: 5, isDisconnected: false },
  { id: "3", name: "Mike", isExecutive: false, isHost: false, score: 1, isDisconnected: false },
];

describe("Scoreboard", () => {
  it("renders all player names", () => {
    render(<Scoreboard players={players} />);
    expect(screen.getByText("Jason")).toBeTruthy();
    expect(screen.getByText("Sarah")).toBeTruthy();
    expect(screen.getByText("Mike")).toBeTruthy();
  });

  it("sorts players by score descending", () => {
    const { container } = render(<Scoreboard players={players} />);
    const rows = container.querySelectorAll(".scoreboard-name");
    expect(rows[0].textContent).toBe("Sarah");
    expect(rows[1].textContent).toBe("Jason");
    expect(rows[2].textContent).toBe("Mike");
  });

  it("renders scores", () => {
    render(<Scoreboard players={players} />);
    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("applies large class when large prop is true", () => {
    const { container } = render(<Scoreboard players={players} large={true} />);
    expect(container.firstChild).toHaveClass("scoreboard-large");
  });

  it("applies podium class when podium prop is true", () => {
    const { container } = render(<Scoreboard players={players} large={true} podium={true} />);
    expect(container.firstChild).toHaveClass("podium-scoreboard");
  });

  it("shows trophy for first place", () => {
    render(<Scoreboard players={players} />);
    expect(screen.getByText("🏆")).toBeTruthy();
  });

  it("shows silver medal for second place", () => {
    render(<Scoreboard players={players} />);
    expect(screen.getByText("🥈")).toBeTruthy();
  });

  it("shows bronze medal for third place", () => {
    render(<Scoreboard players={players} />);
    expect(screen.getByText("🥉")).toBeTruthy();
  });

  it("renders with empty players list", () => {
    render(<Scoreboard players={[]} />);
    expect(screen.getByText("Scoreboard")).toBeTruthy();
  });
});