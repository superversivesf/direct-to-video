import type { PublicPlayer } from "@pitch-storm/shared";

interface ScoreboardProps {
  players: PublicPlayer[];
  large?: boolean;
}

export function Scoreboard({ players, large = false }: ScoreboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className={large ? "scoreboard scoreboard-large" : "scoreboard"}>
      <h3>Scoreboard</h3>
      <div className="scoreboard-list">
        {sorted.map((p, i) => (
          <div key={p.id} className="scoreboard-row">
            <span className="scoreboard-rank">{i + 1}.</span>
            <span className="scoreboard-name">{p.name}</span>
            <span className="scoreboard-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}