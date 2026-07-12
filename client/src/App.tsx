import { Routes, Route } from "react-router-dom";
import { Join } from "./pages/Join.js";
import { Game } from "./pages/Game.js";
import { Audience } from "./pages/Audience.js";
import { Rules } from "./pages/Rules.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Join />} />
      <Route path="/room/:code" element={<Game />} />
      <Route path="/audience/:code" element={<Audience />} />
      <Route path="/rules" element={<Rules />} />
    </Routes>
  );
}