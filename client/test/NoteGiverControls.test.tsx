import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NoteGiverControls } from "../src/components/NoteGiverControls.js";
import type { Card as CardType } from "@direct-to-video/shared";

const notes: CardType[] = [
  { id: "n1", type: "note", text: "Add a musical number" },
  { id: "n2", type: "note", text: "Everyone speaks in rhyme" },
  { id: "n3", type: "note", text: "Add a CGI animal" },
];

const mockFns = {
  onStartTimer: vi.fn(),
  onPauseTimer: vi.fn(),
  onPlayNote: vi.fn(),
  onEndPitch: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NoteGiverControls", () => {
  it("renders Start Timer when timer not started", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    expect(screen.getByText("Start Timer")).toBeTruthy();
  });

  it("renders Pause Timer when running", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />,
    );
    expect(screen.getByText("Pause Timer")).toBeTruthy();
  });

  it("renders Resume Timer when paused after starting", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={true} {...mockFns} />,
    );
    expect(screen.getByText("Resume Timer")).toBeTruthy();
  });

  it("renders End Pitch button", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    expect(screen.getByText("End Pitch")).toBeTruthy();
  });

  it("renders all note cards", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={true} {...mockFns} />,
    );
    expect(screen.getByText("Add a musical number")).toBeTruthy();
    expect(screen.getByText("Everyone speaks in rhyme")).toBeTruthy();
    expect(screen.getByText("Add a CGI animal")).toBeTruthy();
  });

  it("calls onStartTimer when Start Timer clicked", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    fireEvent.click(screen.getByText("Start Timer"));
    expect(mockFns.onStartTimer).toHaveBeenCalled();
  });

  it("calls onPauseTimer when Pause Timer clicked", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />,
    );
    fireEvent.click(screen.getByText("Pause Timer"));
    expect(mockFns.onPauseTimer).toHaveBeenCalled();
  });

  it("calls onEndPitch when End Pitch clicked", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    fireEvent.click(screen.getByText("End Pitch"));
    expect(mockFns.onEndPitch).toHaveBeenCalled();
  });

  it("calls onPlayNote with card id when note card is clicked and timer started", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />,
    );
    fireEvent.click(screen.getByText("Add a musical number"));
    expect(mockFns.onPlayNote).toHaveBeenCalledWith("n1");
  });

  it("does not call onPlayNote when timer not started", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    fireEvent.click(screen.getByText("Add a musical number"));
    expect(mockFns.onPlayNote).not.toHaveBeenCalled();
  });

  it("shows hint text when timer not started", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    expect(screen.getByText(/Start the timer to enable Note cards/i)).toBeTruthy();
  });

  it("renders timer controls above note cards", () => {
    const { container } = render(
      <NoteGiverControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />,
    );
    const controls = container.querySelector(".timer-controls");
    const notesSection = container.querySelector(".card-row");
    expect(controls!.compareDocumentPosition(notesSection!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("hides note cards when canPlayNotes is false but keeps timer controls", () => {
    const { container } = render(
      <NoteGiverControls
        notes={notes}
        timerRunning={true}
        timerStarted={true}
        canPlayNotes={false}
        {...mockFns}
      />,
    );
    expect(screen.getByText("Pause Timer")).toBeTruthy();
    expect(screen.getByText("End Pitch")).toBeTruthy();
    expect(container.querySelector(".card-row")).toBeNull();
    expect(screen.queryByText("Add a musical number")).toBeNull();
  });

  it("shows note cards when canPlayNotes is true", () => {
    render(
      <NoteGiverControls
        notes={notes}
        timerRunning={true}
        timerStarted={true}
        canPlayNotes={true}
        {...mockFns}
      />,
    );
    expect(screen.getByText("Add a musical number")).toBeTruthy();
  });

  it("shows note cards when canPlayNotes is not provided (default)", () => {
    render(
      <NoteGiverControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />,
    );
    expect(screen.getByText("Add a musical number")).toBeTruthy();
  });
});
