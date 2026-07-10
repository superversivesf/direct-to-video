import { describe, it, expect } from "vitest";
import { createTimer, startTimer, pauseTimer, tickTimer, isTimerExpired } from "../src/timer.js";

describe("timer", () => {
  it("creates a timer with full duration", () => {
    const timer = createTimer(45);
    expect(timer.secondsRemaining).toBe(45);
    expect(timer.running).toBe(false);
    expect(timer.pausedAt).toBeNull();
  });

  it("starts the timer", () => {
    const timer = startTimer(createTimer(45));
    expect(timer.running).toBe(true);
    expect(timer.pausedAt).toBeNull();
  });

  it("pauses the timer and records remaining seconds", () => {
    let timer = startTimer(createTimer(45));
    timer = { ...timer, secondsRemaining: 30 };
    timer = pauseTimer(timer);
    expect(timer.running).toBe(false);
    expect(timer.secondsRemaining).toBe(30);
  });

  it("resumes from paused state", () => {
    let timer = createTimer(45);
    timer.secondsRemaining = 30;
    timer = startTimer(timer);
    expect(timer.running).toBe(true);
    expect(timer.secondsRemaining).toBe(30);
  });

  it("ticks down by 1 second", () => {
    let timer = startTimer(createTimer(45));
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(44);
    expect(timer.running).toBe(true);
  });

  it("stops running at 0", () => {
    let timer = startTimer(createTimer(1));
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(0);
    expect(timer.running).toBe(false);
  });

  it("detects expiration", () => {
    const timer = createTimer(45);
    timer.secondsRemaining = 0;
    expect(isTimerExpired(timer)).toBe(true);
  });

  it("does not tick when paused", () => {
    let timer = startTimer(createTimer(45));
    timer = pauseTimer(timer);
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(45);
    expect(timer.running).toBe(false);
  });

  it("does not tick when not running", () => {
    let timer = createTimer(45);
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(45);
  });
});