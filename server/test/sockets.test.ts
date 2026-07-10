import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import { createServer } from "http";
import { initDb, seedCards } from "../src/db.js";
import { RoomStore } from "../src/rooms.js";
import { setupSocketHandlers } from "../src/sockets.js";
import type { Database } from "better-sqlite3";

describe("sockets", () => {
  let db: Database;
  let store: RoomStore;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let port: number;

  beforeEach((done) => {
    const handle = initDb(":memory:");
    db = handle.db;
    seedCards(db);
    store = new RoomStore(handle);
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: "*" } });
    setupSocketHandlers(io, store);
    httpServer.listen(0, () => {
      port = (httpServer.address() as any).port;
      done();
    });
  });

  afterEach(() => {
    io.close();
    httpServer.close();
    db.close();
  });

  it("creates a room when host joins", (done) => {
    const client = ioc(`http://localhost:${port}`);
    client.on("room_joined", (state) => {
      expect(state.code).toMatch(/^[A-Z]{4}$/);
      expect(state.phase).toBe("lobby");
      expect(state.players).toHaveLength(1);
      expect(state.players[0].name).toBe("Jason");
      expect(state.myPlayerId).toBeTruthy();
      client.disconnect();
      done();
    });
    client.emit("join_room", "", "Jason");
  });

  it("joins an existing room as a player", (done) => {
    const host = ioc(`http://localhost:${port}`);
    host.on("room_joined", (state) => {
      const guest = ioc(`http://localhost:${port}`);
      guest.on("room_joined", (guestState) => {
        expect(guestState.players).toHaveLength(2);
        expect(guestState.players[1].name).toBe("Sarah");
        guest.disconnect();
        host.disconnect();
        done();
      });
      guest.emit("join_room", state.code, "Sarah");
    });
    host.emit("join_room", "", "Jason");
  });

  it("rejects joining a non-existent room", (done) => {
    const client = ioc(`http://localhost:${port}`);
    client.on("error", (msg: string) => {
      expect(msg).toBe("Room not found");
      client.disconnect();
      done();
    });
    client.emit("join_room", "ZZZZ", "Sarah");
  });

  it("audience receives audience_joined state", (done) => {
    const host = ioc(`http://localhost:${port}`);
    host.on("room_joined", (state) => {
      const audience = ioc(`http://localhost:${port}`);
      audience.on("audience_joined", (audState) => {
        expect(audState.code).toBe(state.code);
        expect(audState.phase).toBe("lobby");
        expect(audState.players).toHaveLength(1);
        audience.disconnect();
        host.disconnect();
        done();
      });
      audience.emit("join_audience", state.code);
    });
    host.emit("join_room", "", "Jason");
  });
});