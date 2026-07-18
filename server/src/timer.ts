import type { TimerState } from "@direct-to-video/shared";

export function createTimer(durationSeconds: number): TimerState {
  return {
    running: false,
    secondsRemaining: durationSeconds,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function startTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: true,
    pausedAt: null,
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function pauseTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: false,
    pausedAt: Date.now(),
    pausedForNote: false,
    noteResumeAt: null,
  };
}

export function pauseForNote(timer: TimerState, readSeconds: number): TimerState {
  return {
    ...timer,
    running: false,
    pausedAt: Date.now(),
    pausedForNote: true,
    noteResumeAt: Date.now() + readSeconds * 1000,
  };
}

export function tickTimer(timer: TimerState): TimerState {
  if (!timer.running) return timer;
  const next = timer.secondsRemaining - 1;
  if (next <= 0) {
    return {
      running: false,
      secondsRemaining: 0,
      pausedAt: null,
      pausedForNote: false,
      noteResumeAt: null,
    };
  }
  return { ...timer, secondsRemaining: next };
}

export function isTimerExpired(timer: TimerState): boolean {
  return timer.secondsRemaining <= 0;
}

export function shouldResumeFromNote(timer: TimerState): boolean {
  return timer.pausedForNote && timer.noteResumeAt !== null && Date.now() >= timer.noteResumeAt;
}
