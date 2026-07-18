import type { TimerState } from "./types.js";

export function timerRunning(secondsRemaining: number): TimerState {
  return {
    running: true,
    secondsRemaining,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function timerIdle(secondsRemaining: number): TimerState {
  return {
    running: false,
    secondsRemaining,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function timerPaused(remainingSeconds: number): TimerState {
  return {
    running: false,
    secondsRemaining: remainingSeconds,
    pausedAt: Date.now(),
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function timerExpired(): TimerState {
  return {
    running: false,
    secondsRemaining: 0,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  };
}
