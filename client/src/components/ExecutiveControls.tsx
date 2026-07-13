import type { Card as CardType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface ExecutiveControlsProps {
  notes: CardType[];
  timerRunning: boolean;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onPlayNote: (noteCardId: string) => void;
  onEndPitch: () => void;
}

export function ExecutiveControls({ notes, timerRunning, onStartTimer, onPauseTimer, onPlayNote, onEndPitch }: ExecutiveControlsProps) {
  return (
    <div className="executive-controls">
      <div className="timer-controls">
        {!timerRunning && <button onClick={onStartTimer}>Start Timer</button>}
        {timerRunning && <button onClick={onPauseTimer}>Pause Timer</button>}
        <button onClick={onEndPitch}>End Pitch</button>
      </div>
      <h3>Your NOTE Cards — click to play on the pitcher</h3>
      <div className="card-row">
        {notes.map((note) => (
          <Card key={note.id} card={note} onClick={() => onPlayNote(note.id)} />
        ))}
      </div>
    </div>
  );
}
