interface TimerProps {
  seconds: number;
  running: boolean;
  large: boolean;
  pausedForNote?: boolean;
}

export function Timer({ seconds, running, large, pausedForNote }: TimerProps) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${secs.toString().padStart(2, "0")}`;
  const stateClass = pausedForNote ? "note-paused" : running ? "running" : "paused";
  const className = `timer timer--${stateClass}${large ? " timer-large" : ""}`;

  return (
    <div className={className}>
      {pausedForNote && <div className="timer-note-badge">PAUSED — Read your note!</div>}
      <div className="timer-display">{display}</div>
    </div>
  );
}