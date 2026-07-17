import type { PublicPlayer, Movie } from "@direct-to-video/shared";

interface PlayerListProps {
  players: PublicPlayer[];
  movies?: Movie[];
  canKick?: boolean;
  onKick?: (playerId: string) => void;
}

export function PlayerList({ players, movies, canKick, onKick }: PlayerListProps) {
  return (
    <div className="player-list">
      <h3>Players</h3>
      <ul>
        {players.map((p) => {
          const isReady = movies?.some((m) => m.playerId === p.id);
          const canKickThis = canKick && onKick && !p.isHost && !p.isDisconnected;
          return (
            <li key={p.id} className={p.isDisconnected ? "player-disconnected" : ""}>
              {p.isNoteGiver && "📝 "}
              {p.isHost && "👑 "}
              {p.name}
              {p.isDisconnected && " (disconnected)"}
              {movies && !p.isNoteGiver && !p.isDisconnected && (
                <span className={`ready-status ${isReady ? "ready-yes" : "ready-no"}`}>
                  {isReady ? " ✓ ready" : " choosing..."}
                </span>
              )}
              {canKickThis && (
                <button
                  className="btn-kick"
                  onClick={() => onKick!(p.id)}
                  aria-label={`Kick ${p.name}`}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
