import type { PublicPlayer } from "@pitch-storm/shared";

interface PlayerListProps {
  players: PublicPlayer[];
}

export function PlayerList({ players }: PlayerListProps) {
  return (
    <div className="player-list">
      <h3>Players</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id} className={p.isDisconnected ? "player-disconnected" : ""}>
            {p.isExecutive && "🎬 "}
            {p.isHost && "👑 "}
            {p.name}
            {p.isDisconnected && " (disconnected)"}
          </li>
        ))}
      </ul>
    </div>
  );
}
