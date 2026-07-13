import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { resolve } from "path";
import { initDb, seedCards } from "./db.js";
import { RoomStore } from "./rooms.js";
import { setupSocketHandlers } from "./sockets.js";
import { logger } from "./logger.js";
import type { DbHandle } from "./db.js";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "pitchstorm.db");
const CLIENT_DIST = resolve(process.cwd(), "client", "dist");
const ROOM_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const dbHandle: DbHandle = initDb(DB_PATH);
seedCards(dbHandle.db);
const store = new RoomStore(dbHandle);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use((req, _res, next) => {
  logger.http(req.method, req.path, req.ip || "unknown");
  next();
});
app.use(express.static(CLIENT_DIST));

app.get("*", (req, res) => {
  res.sendFile(resolve(CLIENT_DIST, "index.html"));
});

setupSocketHandlers(io, store);

function cleanupStaleRooms(): void {
  const now = Date.now();
  for (const room of store.getAllCachedRooms()) {
    const meta = dbHandle.loadRoomMeta(room.code);
    const updatedAt = meta ? new Date(meta.updated_at).getTime() : now;
    const age = now - updatedAt;
    const allDisconnected = room.players.every((p) => p.isDisconnected);
    const isStale = allDisconnected || room.phase === "game-end";

    if (isStale && age > ROOM_TTL_MS) {
      dbHandle.deleteRoom(room.code);
      store.removeFromCache(room.code);
    }
  }
}

setInterval(cleanupStaleRooms, CLEANUP_INTERVAL_MS);

httpServer.listen(PORT, () => {
  logger.info(`Pitch Storm server running on port ${PORT}`);
});

export { app, io, httpServer };
