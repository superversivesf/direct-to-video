import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { resolve } from "path";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { initDb, seedCards } from "./db.js";
import { RoomStore } from "./rooms.js";
import { setupSocketHandlers } from "./sockets.js";
import { logger } from "./logger.js";
import type { DbHandle } from "./db.js";

const VERSION = "1.2.1";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "directtovideo.db");
const CLIENT_DIST = resolve(process.cwd(), "client", "dist");
const ROOM_TTL_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

const dbHandle: DbHandle = initDb(DB_PATH);
seedCards(dbHandle.db);
const store = new RoomStore(dbHandle);

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);
const io = new Server(httpServer, {
  maxHttpBufferSize: 4096,
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      upgradeInsecureRequests: null,
    },
  },
}));

const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please slow down.",
});

app.use(express.json());
app.use(generalLimiter);
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
  logger.info(`Direct to Video v${VERSION} server running on port ${PORT}`);
});

export { app, io, httpServer };
