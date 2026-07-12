interface TimerProps {
  seconds: number;
  running: boolean;
  large: boolean;
  pausedForNote?: boolean;
  maxSeconds?: number;
}

export function Timer({ seconds, running, large, pausedForNote, maxSeconds = 45 }: TimerProps) {
  const radius = large ? 50 : 28;
  const circumference = 2 * Math.PI * radius;
  const progress = seconds / maxSeconds;
  const dashOffset = circumference * (1 - progress);
  const stateClass = pausedForNote ? "note-paused" : running ? "running" : "paused";
  const className = `timer timer--${stateClass}${large ? " timer-large" : ""}`;

  return (
    <div className={className}>
      {pausedForNote && <div className="timer-note-badge">PAUSED — Read your note!</div>}
      <div className="timer-ring-wrapper">
        <svg className="timer-ring" width={radius * 2 + 8} height={radius * 2 + 8}>
          <circle
            className="timer-ring-bg"
            cx={radius + 4}
            cy={radius + 4}
            r={radius}
            fill="none"
            strokeWidth={large ? 5 : 3}
          />
          <circle
            className="timer-ring-progress"
            cx={radius + 4}
            cy={radius + 4}
            r={radius}
            fill="none"
            strokeWidth={large ? 5 : 3}
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            transform={`rotate(-90 ${radius + 4} ${radius + 4})`}
          />
        </svg>
        <div className="timer-display">{seconds}</div>
      </div>
    </div>
  );
}