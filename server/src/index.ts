import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { resolve } from "path";
import { initDb, seedCards } from "./db.js";
import { RoomStore } from "./rooms.js";
import { setupSocketHandlers } from "./sockets.js";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "pitchstorm.db");
const CLIENT_DIST = resolve(process.cwd(), "client", "dist");

const dbHandle = initDb(DB_PATH);
seedCards(dbHandle.db);
const store = new RoomStore(dbHandle);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use(express.static(CLIENT_DIST));

app.get(["/", "/room/:code", "/audience/:code"], (req, res) => {
  res.sendFile(resolve(CLIENT_DIST, "index.html"));
});

setupSocketHandlers(io, store);

httpServer.listen(PORT, () => {
  console.log(`Pitch Storm server running on port ${PORT}`);
});

export { app, io, httpServer };