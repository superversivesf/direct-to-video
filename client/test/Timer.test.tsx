import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timer } from "../src/components/Timer.js";

describe("Timer", () => {
  it("displays remaining seconds", () => {
    render(<Timer seconds={45} running={false} large={false} />);
    expect(screen.getByText("45")).toBeTruthy();
  });

  it("shows 0 at zero", () => {
    render(<Timer seconds={0} running={false} large={false} />);
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("shows running state class when running", () => {
    const { container } = render(<Timer seconds={30} running={true} large={false} />);
    expect(container.firstChild).toHaveClass("timer--running");
  });

  it("shows paused state class when not running", () => {
    const { container } = render(<Timer seconds={30} running={false} large={false} />);
    expect(container.firstChild).toHaveClass("timer--paused");
  });

  it("shows note-paused badge when pausedForNote", () => {
    render(<Timer seconds={30} running={false} large={false} pausedForNote={true} />);
    expect(screen.getByText(/paused/i)).toBeTruthy();
  });
});