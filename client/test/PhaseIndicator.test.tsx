import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseIndicator } from "../src/components/PhaseIndicator.js";

describe("PhaseIndicator", () => {
  it("renders setup step as active during setup phase (writer)", () => {
    const { container } = render(<PhaseIndicator phase="setup" isNoteGiver={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep).toBeTruthy();
    expect(activeStep!.textContent).toContain("Choose Deck");
  });

  it("renders card-selection step as active during card-selection phase (writer)", () => {
    const { container } = render(<PhaseIndicator phase="card-selection" isNoteGiver={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Build Movie");
  });

  it("renders pitching step as active during pitching phase", () => {
    const { container } = render(<PhaseIndicator phase="pitching" isNoteGiver={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Pitching");
  });

  it("renders round-end step as active during round-end phase", () => {
    const { container } = render(<PhaseIndicator phase="round-end" isNoteGiver={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Results");
  });

  it("shows note-giver labels when isNoteGiver is true", () => {
    const { container } = render(<PhaseIndicator phase="setup" isNoteGiver={true} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Setup");
  });

  it("shows Voting for note-giver during round-end", () => {
    const { container } = render(<PhaseIndicator phase="round-end" isNoteGiver={true} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Voting");
  });

  it("marks earlier steps as done", () => {
    const { container } = render(<PhaseIndicator phase="pitching" isNoteGiver={false} />);
    const doneSteps = container.querySelectorAll(".phase-step.done");
    expect(doneSteps.length).toBe(2);
  });

  it("returns null for game-end phase", () => {
    const { container } = render(<PhaseIndicator phase="game-end" isNoteGiver={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for lobby phase", () => {
    const { container } = render(<PhaseIndicator phase="lobby" isNoteGiver={false} />);
    expect(container.firstChild).toBeNull();
  });
});