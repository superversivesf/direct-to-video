import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Timer } from "../src/components/Timer.js";

describe("Timer", () => {
  it("displays remaining seconds", () => {
    render(<Timer seconds={45} running={false} large={false} />);
    expect(screen.getByText("0:45")).toBeTruthy();
  });

  it("formats minutes:seconds", () => {
    render(<Timer seconds={65} running={false} large={false} />);
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("shows 0:00 at zero", () => {
    render(<Timer seconds={0} running={false} large={false} />);
    expect(screen.getByText("0:00")).toBeTruthy();
  });

  it("shows running state class when running", () => {
    const { container } = render(<Timer seconds={30} running={true} large={false} />);
    expect(container.firstChild).toHaveClass("timer--running");
  });

  it("shows paused state class when not running", () => {
    const { container } = render(<Timer seconds={30} running={false} large={false} />);
    expect(container.firstChild).toHaveClass("timer--paused");
  });
});