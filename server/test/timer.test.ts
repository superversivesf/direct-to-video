import { describe, it, expect } from "vitest";
import {
  createTimer,
  startTimer,
  pauseTimer,
  pauseForNote,
  tickTimer,
  isTimerExpired,
  shouldResumeFromNote,
} from "../src/timer.js";

describe("timer", () => {
  it("creates a timer with full duration", () => {
    const timer = createTimer(45);
    expect(timer.secondsRemaining).toBe(45);
    expect(timer.running).toBe(false);
    expect(timer.pausedAt).toBeNull();
    expect(timer.pausedForNote).toBe(false);
    expect(timer.noteResumeAt).toBeNull();
  });

  it("starts the timer", () => {
    const timer = startTimer(createTimer(45));
    expect(timer.running).toBe(true);
    expect(timer.pausedAt).toBeNull();
    expect(timer.pausedForNote).toBe(false);
    expect(timer.noteResumeAt).toBeNull();
  });

  it("pauses the timer and records remaining seconds", () => {
    let timer = startTimer(createTimer(45));
    timer = { ...timer, secondsRemaining: 30 };
    timer = pauseTimer(timer);
    expect(timer.running).toBe(false);
    expect(timer.secondsRemaining).toBe(30);
    expect(timer.pausedForNote).toBe(false);
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

  it("pauseForNote sets pausedForNote flag and noteResumeAt", () => {
    const timer = startTimer(createTimer(45));
    const paused = pauseForNote(timer, 5);
    expect(paused.running).toBe(false);
    expect(paused.pausedForNote).toBe(true);
    expect(paused.noteResumeAt).not.toBeNull();
    expect(paused.noteResumeAt).toBeGreaterThan(Date.now());
  });

  it("pauseForNote sets resume time 5 seconds in the future", () => {
    const timer = startTimer(createTimer(45));
    const paused = pauseForNote(timer, 5);
    const expectedResume = Date.now() + 5000;
    expect(paused.noteResumeAt).toBeGreaterThan(Date.now());
    expect(paused.noteResumeAt!).toBeLessThanOrEqual(expectedResume + 100);
  });

  it("shouldResumeFromNote returns false when not paused for note", () => {
    const timer = pauseTimer(createTimer(45));
    expect(shouldResumeFromNote(timer)).toBe(false);
  });

  it("shouldResumeFromNote returns false when resume time is in the future", () => {
    const timer = pauseForNote(createTimer(45), 5);
    expect(shouldResumeFromNote(timer)).toBe(false);
  });

  it("shouldResumeFromNote returns true when resume time has passed", () => {
    const timer = {
      running: false,
      secondsRemaining: 30,
      pausedAt: Date.now() - 6000,
      pausedForNote: true,
      noteResumeAt: Date.now() - 1000,
    };
    expect(shouldResumeFromNote(timer)).toBe(true);
  });

  it("startTimer clears note pause state", () => {
    const paused = pauseForNote(startTimer(createTimer(45)), 5);
    const resumed = startTimer(paused);
    expect(resumed.running).toBe(true);
    expect(resumed.pausedForNote).toBe(false);
    expect(resumed.noteResumeAt).toBeNull();
  });
});
