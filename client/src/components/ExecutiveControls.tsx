import type { Card as CardType } from "@direct-to-video/shared";
import { Card } from "./Card.js";

interface ExecutiveControlsProps {
  notes: CardType[];
  timerRunning: boolean;
  timerStarted: boolean;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onPlayNote: (noteCardId: string) => void;
  onEndPitch: () => void;
}

export function ExecutiveControls({ notes, timerRunning, timerStarted, onStartTimer, onPauseTimer, onPlayNote, onEndPitch }: ExecutiveControlsProps) {
  return (
    <div className="executive-controls">
      <div className="timer-controls">
        {!timerStarted && <button onClick={onStartTimer}>Start Timer</button>}
        {timerStarted && timerRunning && <button onClick={onPauseTimer}>Pause Timer</button>}
        {timerStarted && !timerRunning && <button onClick={onStartTimer}>Resume Timer</button>}
        <button onClick={onEndPitch}>End Pitch</button>
      </div>
      <h3>{timerStarted ? "Your NOTE Cards — click to play on the pitcher" : "Start the timer to enable Note cards"}</h3>
      <div className="card-row">
        {notes.map((note) => (
          <Card
            key={note.id}
            card={note}
            onClick={timerStarted ? () => onPlayNote(note.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}