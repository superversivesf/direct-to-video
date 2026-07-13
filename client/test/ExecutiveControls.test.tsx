import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExecutiveControls } from "../src/components/ExecutiveControls.js";
import type { Card as CardType } from "@pitch-storm/shared";

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

describe("ExecutiveControls", () => {
  it("renders Start Timer when timer not started", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    expect(screen.getByText("Start Timer")).toBeTruthy();
  });

  it("renders Pause Timer when running", () => {
    render(<ExecutiveControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />);
    expect(screen.getByText("Pause Timer")).toBeTruthy();
  });

  it("renders Resume Timer when paused after starting", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={true} {...mockFns} />);
    expect(screen.getByText("Resume Timer")).toBeTruthy();
  });

  it("renders End Pitch button", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    expect(screen.getByText("End Pitch")).toBeTruthy();
  });

  it("renders all note cards", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={true} {...mockFns} />);
    expect(screen.getByText("Add a musical number")).toBeTruthy();
    expect(screen.getByText("Everyone speaks in rhyme")).toBeTruthy();
    expect(screen.getByText("Add a CGI animal")).toBeTruthy();
  });

  it("calls onStartTimer when Start Timer clicked", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    fireEvent.click(screen.getByText("Start Timer"));
    expect(mockFns.onStartTimer).toHaveBeenCalled();
  });

  it("calls onPauseTimer when Pause Timer clicked", () => {
    render(<ExecutiveControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />);
    fireEvent.click(screen.getByText("Pause Timer"));
    expect(mockFns.onPauseTimer).toHaveBeenCalled();
  });

  it("calls onEndPitch when End Pitch clicked", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    fireEvent.click(screen.getByText("End Pitch"));
    expect(mockFns.onEndPitch).toHaveBeenCalled();
  });

  it("calls onPlayNote with card id when note card is clicked and timer started", () => {
    render(<ExecutiveControls notes={notes} timerRunning={true} timerStarted={true} {...mockFns} />);
    fireEvent.click(screen.getByText("Add a musical number"));
    expect(mockFns.onPlayNote).toHaveBeenCalledWith("n1");
  });

  it("does not call onPlayNote when timer not started", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    fireEvent.click(screen.getByText("Add a musical number"));
    expect(mockFns.onPlayNote).not.toHaveBeenCalled();
  });

  it("shows hint text when timer not started", () => {
    render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    expect(screen.getByText(/Start the timer to enable Note cards/i)).toBeTruthy();
  });

  it("renders timer controls above note cards", () => {
    const { container } = render(<ExecutiveControls notes={notes} timerRunning={false} timerStarted={false} {...mockFns} />);
    const controls = container.querySelector(".timer-controls");
    const notesSection = container.querySelector(".card-row");
    expect(controls!.compareDocumentPosition(notesSection!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});