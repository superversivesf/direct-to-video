import type { TimerState } from "@pitch-storm/shared";

export function createTimer(durationSeconds: number): TimerState {
  return {
    running: false,
    secondsRemaining: durationSeconds,
    pausedAt: null,
  };
}

export function startTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: true,
    pausedAt: null,
  };
}

export function pauseTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: false,
    pausedAt: Date.now(),
  };
}

export function tickTimer(timer: TimerState): TimerState {
  if (!timer.running) return timer;
  const next = timer.secondsRemaining - 1;
  if (next <= 0) {
    return { running: false, secondsRemaining: 0, pausedAt: null };
  }
  return { ...timer, secondsRemaining: next };
}

export function isTimerExpired(timer: TimerState): boolean {
  return timer.secondsRemaining <= 0;
}