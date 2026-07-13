import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export function Join() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState(searchParams.get("code") || "");
  const [name, setName] = useState(getCookie("playerName") || "");

  function getCookie(key: string): string | undefined {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match?.[2];
  }

  function setCookie(key: string, value: string) {
    document.cookie = `${key}=${value};path=/;max-age=31536000`;
  }

  function handleJoinAsPlayer() {
    if (!name.trim()) return;
    setCookie("playerName", name);
    const roomCode = code.trim().toUpperCase();
    if (roomCode) {
      navigate(`/room/${roomCode}`);
    } else {
      navigate(`/room/_create`);
    }
  }

  function handleJoinAsAudience() {
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;
    navigate(`/audience/${roomCode}`);
  }

  return (
    <div className="join-screen">
      <div className="join-logo">
        <div className="clapperboard">🎬</div>
        <h1>PITCH STORM</h1>
        <div className="subtitle">Pitch terrible movies to the world's worst executives</div>
      </div>
      <div className="join-form">
        <input
          type="text"
          placeholder="Room Code (leave empty to create)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="join-input"
        />
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="join-input"
        />
        <button onClick={handleJoinAsPlayer} className="join-btn join-btn-player">
          Join as Player
        </button>
        <button onClick={handleJoinAsAudience} className="join-btn join-btn-audience">
          Join as Audience
        </button>
        <div className="join-hint">
          Share the 4-letter room code with your friends.<br />
          Audience can join to watch on a shared screen.
        </div>
        <a href="/rules" className="rules-link">How to Play →</a>
      </div>
      <div className="join-footer-links">
        <a href="https://boardgamegeek.com/boardgame/254132/pitchstorm" target="_blank" rel="noopener noreferrer" className="footer-link">
          Original Game
        </a>
        <span className="footer-link-divider">·</span>
        <a href="https://github.com/superversivesf/pitch-storm" target="_blank" rel="noopener noreferrer" className="footer-link">
          GitHub
        </a>
      </div>
    </div>
  );
}
