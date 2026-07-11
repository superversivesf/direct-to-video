import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, generateRoomCode, RoomStore } from "../src/rooms.js";
import type { Database } from "better-sqlite3";

describe("rooms", () => {
  let db: Database;
  let store: RoomStore;

  beforeEach(() => {
    const handle = initDb(":memory:");
    db = handle.db;
    seedCards(db);
    store = new RoomStore(handle);
  });

  afterEach(() => {
    db.close();
  });

  it("generates a 4-letter uppercase code", () => {
    const code = generateRoomCode(store);
    expect(code).toMatch(/^[A-Z]{4}$/);
  });

  it("does not use ambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(store);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("creates a room with the host as first player", () => {
    const result = createRoom(store, "Jason");
    expect(result.room.code).toMatch(/^[A-Z]{4}$/);
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0].name).toBe("Jason");
    expect(result.room.players[0].isHost).toBe(true);
    expect(result.room.phase).toBe("lobby");
  });

  it("joins an existing room as a non-host player", () => {
    const created = createRoom(store, "Jason");
    const result = joinRoom(store, created.room.code, "Sarah");
    expect(result.room.players).toHaveLength(2);
    expect(result.room.players[1].name).toBe("Sarah");
    expect(result.room.players[1].isHost).toBe(false);
  });

  it("rejects joining a non-existent room", () => {
    expect(() => joinRoom(store, "ZZZZ", "Sarah")).toThrow("Room not found");
  });

  it("restores player identity when same name rejoins", () => {
    const created = createRoom(store, "Jason");
    const rejoined = joinRoom(store, created.room.code, "Jason");
    expect(rejoined.playerId).toBe(created.playerId);
    expect(rejoined.room.players).toHaveLength(1);
  });

  it("persists room state to SQLite", () => {
    const created = createRoom(store, "Jason");
    const reloaded = store.loadFromDb(created.room.code);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.code).toBe(created.room.code);
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRoomCode(store));
    }
    expect(codes.size).toBe(50);
  });
});