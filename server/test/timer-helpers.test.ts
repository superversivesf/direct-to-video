import { describe, it, expect } from "vitest";
import {
  timerRunning,
  timerIdle,
  timerPaused,
  timerExpired,
} from "../../shared/timer-helpers.js";
import type { TimerState } from "@direct-to-video/shared";

function assertTimerShape(t: TimerState) {
  expect(t).toHaveProperty("running");
  expect(t).toHaveProperty("secondsRemaining");
  expect(t).toHaveProperty("pausedAt");
  expect(t).toHaveProperty("pausedForNote");
  expect(t).toHaveProperty("noteResumeAt");
}

describe("timer-helpers", () => {
  it("timerRunning returns running state with the given seconds remaining", () => {
    const t = timerRunning(30);
    assertTimerShape(t);
    expect(t.running).toBe(true);
    expect(t.secondsRemaining).toBe(30);
    expect(t.pausedAt).toBeNull();
    expect(t.pausedForNote).toBe(false);
    expect(t.noteResumeAt).toBeNull();
  });

  it("timerIdle returns idle state with the given seconds remaining", () => {
    const t = timerIdle(45);
    assertTimerShape(t);
    expect(t.running).toBe(false);
    expect(t.secondsRemaining).toBe(45);
    expect(t.pausedAt).toBeNull();
    expect(t.pausedForNote).toBe(false);
    expect(t.noteResumeAt).toBeNull();
  });

  it("timerPaused returns paused state with a timestamp", () => {
    const before = Date.now();
    const t = timerPaused(20);
    const after = Date.now();
    assertTimerShape(t);
    expect(t.running).toBe(false);
    expect(t.secondsRemaining).toBe(20);
    expect(t.pausedAt).not.toBeNull();
    expect(t.pausedAt!).toBeGreaterThanOrEqual(before);
    expect(t.pausedAt!).toBeLessThanOrEqual(after);
    expect(t.pausedForNote).toBe(false);
    expect(t.noteResumeAt).toBeNull();
  });

  it("timerExpired returns expired state with zero seconds", () => {
    const t = timerExpired();
    assertTimerShape(t);
    expect(t.running).toBe(false);
    expect(t.secondsRemaining).toBe(0);
    expect(t.pausedAt).toBeNull();
    expect(t.pausedForNote).toBe(false);
    expect(t.noteResumeAt).toBeNull();
  });
});