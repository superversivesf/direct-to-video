interface TimerProps {
  seconds: number;
  running: boolean;
  large: boolean;
}

export function Timer({ seconds, running, large }: TimerProps) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${secs.toString().padStart(2, "0")}`;
  const className = `timer timer--${running ? "running" : "paused"}${large ? " timer-large" : ""}`;

  return <div className={className}>{display}</div>;
}