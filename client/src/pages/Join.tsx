import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
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
      <h1>PITCH STORM</h1>
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
      </div>
    </div>
  );
}