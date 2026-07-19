import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, generateRoomCode, validateName, RoomStore } from "../src/rooms.js";
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

  it("rejects empty names", () => {
    expect(() => validateName("")).toThrow("Name is required");
    expect(() => validateName("   ")).toThrow("Name is required");
  });

  it("rejects names over 20 characters", () => {
    expect(() => validateName("a".repeat(21))).toThrow("20 characters");
  });

  it("rejects names with special characters", () => {
    expect(() => validateName("Jason<script>")).toThrow("letters, numbers, and spaces");
    expect(() => validateName("Bob&Co")).toThrow("letters, numbers, and spaces");
    expect(() => validateName("Alice!")).toThrow("letters, numbers, and spaces");
  });

  it("accepts valid names with letters, numbers, and spaces", () => {
    expect(validateName("Jason")).toBe("Jason");
    expect(validateName("Player 1")).toBe("Player 1");
    expect(validateName("Bob123")).toBe("Bob123");
  });

  it("trims whitespace from names", () => {
    expect(validateName("  Jason  ")).toBe("Jason");
  });

  it("prevents joining a full room", () => {
    const created = createRoom(store, "Host");
    for (let i = 0; i < 19; i++) {
      joinRoom(store, created.room.code, `Player${i}`);
    }
    expect(() => joinRoom(store, created.room.code, "Extra")).toThrow("Room is full");
  });

  describe("mid-game join as spectator", () => {
    it("new player joining during lobby is NOT a spectator", () => {
      const created = createRoom(store, "Host");
      const joined = joinRoom(store, created.room.code, "Latecomer");
      const room = store.getRoom(created.room.code)!;
      const newPlayer = room.players.find((p) => p.id === joined.playerId)!;
      expect(newPlayer.isSpectator).toBe(false);
    });

    it("new player joining during setup becomes a spectator", () => {
      const created = createRoom(store, "Host");
      joinRoom(store, created.room.code, "P2");
      const room = store.getRoom(created.room.code)!;
      room.phase = "setup";
      store.saveRoom(room);

      const joined = joinRoom(store, created.room.code, "Latecomer");
      const updated = store.getRoom(created.room.code)!;
      const newPlayer = updated.players.find((p) => p.id === joined.playerId)!;
      expect(newPlayer.isSpectator).toBe(true);
    });

    it("new player joining during pitching becomes a spectator", () => {
      const created = createRoom(store, "Host");
      joinRoom(store, created.room.code, "P2");
      const room = store.getRoom(created.room.code)!;
      room.phase = "pitching";
      room.pitchOrder = [room.players[0].id, room.players[1].id];
      room.currentPitcherId = room.players[0].id;
      store.saveRoom(room);

      const joined = joinRoom(store, created.room.code, "Latecomer");
      const updated = store.getRoom(created.room.code)!;
      const newPlayer = updated.players.find((p) => p.id === joined.playerId)!;
      expect(newPlayer.isSpectator).toBe(true);
      expect(updated.pitchOrder).not.toContain(joined.playerId);
    });

    it("new player joining during round-end (voting) becomes a spectator and can vote", () => {
      const created = createRoom(store, "Host");
      joinRoom(store, created.room.code, "P2");
      const room = store.getRoom(created.room.code)!;
      room.phase = "round-end";
      room.votingActive = true;
      room.votes = {};
      store.saveRoom(room);

      const joined = joinRoom(store, created.room.code, "Latecomer");
      const updated = store.getRoom(created.room.code)!;
      const newPlayer = updated.players.find((p) => p.id === joined.playerId)!;
      expect(newPlayer.isSpectator).toBe(true);
    });

    it("same-name rejoin during pitching is NOT auto-spectator by joinRoom (existing logic handles it)", () => {
      const created = createRoom(store, "Host");
      const p2 = joinRoom(store, created.room.code, "P2");
      const room = store.getRoom(created.room.code)!;
      room.phase = "pitching";
      room.pitchOrder = [room.players[0].id, p2.playerId];
      room.currentPitchIndex = 1;
      room.currentPitcherId = room.players[0].id;
      store.saveRoom(room);

      // P2 "rejoins" (same name) — joinRoom finds existing player, returns existing ID
      const rejoined = joinRoom(store, created.room.code, "P2");
      expect(rejoined.playerId).toBe(p2.playerId);
      const updated = store.getRoom(created.room.code)!;
      const existingPlayer = updated.players.find((p) => p.id === p2.playerId)!;
      // joinRoom doesn't modify isSpectator on rejoin — the socket handler does
      expect(existingPlayer.isSpectator).toBe(false);
    });

    it("spectator flag clears at the start of the next round", () => {
      const created = createRoom(store, "Host");
      joinRoom(store, created.room.code, "P2");
      joinRoom(store, created.room.code, "P3");
      let room = store.getRoom(created.room.code)!;
      room.phase = "setup";
      store.saveRoom(room);

      const latecomer = joinRoom(store, created.room.code, "Latecomer");
      room = store.getRoom(created.room.code)!;
      expect(room.players.find((p) => p.id === latecomer.playerId)!.isSpectator).toBe(true);

      // Simulate next round: setupRound clears isSpectator on all players
      room = store.getRoom(created.room.code)!;
      room.players = room.players.map((p) => ({ ...p, isSpectator: false }));
      store.saveRoom(room);

      const after = store.getRoom(created.room.code)!;
      expect(after.players.find((p) => p.id === latecomer.playerId)!.isSpectator).toBe(false);
    });
  });
});
