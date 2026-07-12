import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { PhaseIndicator } from "../src/components/PhaseIndicator.js";

describe("PhaseIndicator", () => {
  it("renders setup step as active during setup phase (writer)", () => {
    const { container } = render(<PhaseIndicator phase="setup" isExecutive={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep).toBeTruthy();
    expect(activeStep!.textContent).toContain("Choose Deck");
  });

  it("renders card-selection step as active during card-selection phase (writer)", () => {
    const { container } = render(<PhaseIndicator phase="card-selection" isExecutive={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Build Movie");
  });

  it("renders pitching step as active during pitching phase", () => {
    const { container } = render(<PhaseIndicator phase="pitching" isExecutive={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Pitching");
  });

  it("renders round-end step as active during round-end phase", () => {
    const { container } = render(<PhaseIndicator phase="round-end" isExecutive={false} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Results");
  });

  it("shows executive labels when isExecutive is true", () => {
    const { container } = render(<PhaseIndicator phase="setup" isExecutive={true} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Setup");
  });

  it("shows Pick Winner for executive during round-end", () => {
    const { container } = render(<PhaseIndicator phase="round-end" isExecutive={true} />);
    const activeStep = container.querySelector(".phase-step.active");
    expect(activeStep!.textContent).toContain("Pick Winner");
  });

  it("marks earlier steps as done", () => {
    const { container } = render(<PhaseIndicator phase="pitching" isExecutive={false} />);
    const doneSteps = container.querySelectorAll(".phase-step.done");
    expect(doneSteps.length).toBe(2);
  });

  it("returns null for game-end phase", () => {
    const { container } = render(<PhaseIndicator phase="game-end" isExecutive={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null for lobby phase", () => {
    const { container } = render(<PhaseIndicator phase="lobby" isExecutive={false} />);
    expect(container.firstChild).toBeNull();
  });
});