import type { PublicPlayer } from "@direct-to-video/shared";

interface ScoreboardProps {
  players: PublicPlayer[];
  large?: boolean;
  podium?: boolean;
}

export function Scoreboard({ players, large = false, podium = false }: ScoreboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  const className = `scoreboard${large ? " scoreboard-large" : ""}${podium ? " podium-scoreboard" : ""}`;
  return (
    <div className={className}>
      <h3>Scoreboard</h3>
      <div className="scoreboard-list">
        {sorted.map((p, i) => (
          <div key={p.id} className="scoreboard-row">
            <span className="scoreboard-rank">
              {i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
            </span>
            <span className="scoreboard-name">{p.name}</span>
            <span className="scoreboard-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
