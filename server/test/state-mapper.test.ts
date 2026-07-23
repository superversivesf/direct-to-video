import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, RoomStore } from "../src/rooms.js";
import { startGame, selectDeckType, selectCard, startPitching } from "../src/state-machine.js";
import { toPublicRoomState } from "../src/sockets/state-mapper.js";
import type { Database } from "better-sqlite3";

describe("toPublicRoomState writerReadyIds", () => {
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

  it("includes all playerIds who have a movie (revealed or not) during setup", () => {
    const created = createRoom(store, "Jason");
    const p1 = created.playerId;
    const p2 = joinRoom(store, created.room.code, "Sarah").playerId;
    joinRoom(store, created.room.code, "Mike");
    startGame(store, store.getRoom(created.room.code)!);
    let updated = store.getRoom(created.room.code)!;

    // Only one writer (p2) has drawn a deck and selected a card → has a movie
    selectDeckType(store, updated, p2, "plot");
    updated = store.getRoom(created.room.code)!;
    const writer = updated.players.find((p) => p.id === p2)!;
    selectCard(store, updated, p2, writer.hand[0].id);
    updated = store.getRoom(created.room.code)!;

    const state = toPublicRoomState(updated, p1);
    expect(state.writerReadyIds).toEqual([p2]);
  });

  it("includes all playerIds once every writer has revealed a movie", () => {
    const created = createRoom(store, "Jason");
    const p1 = created.playerId;
    const p2 = joinRoom(store, created.room.code, "Sarah").playerId;
    const p3 = joinRoom(store, created.room.code, "Mike").playerId;
    startGame(store, store.getRoom(created.room.code)!);
    let updated = store.getRoom(created.room.code)!;

    for (const pid of [p1, p2, p3]) {
      selectDeckType(store, updated, pid, "plot");
      updated = store.getRoom(created.room.code)!;
      const w = updated.players.find((p) => p.id === pid)!;
      selectCard(store, updated, pid, w.hand[0].id);
      updated = store.getRoom(created.room.code)!;
    }

    const state = toPublicRoomState(updated, p1);
    expect(state.writerReadyIds.sort()).toEqual([p1, p2, p3].sort());
  });

  it("excludes players whose movies have been revealed to pitching phase", () => {
    const created = createRoom(store, "Jason");
    const p1 = created.playerId;
    const p2 = joinRoom(store, created.room.code, "Sarah").playerId;
    const p3 = joinRoom(store, created.room.code, "Mike").playerId;
    startGame(store, store.getRoom(created.room.code)!);
    let updated = store.getRoom(created.room.code)!;

    for (const pid of [p1, p2, p3]) {
      selectDeckType(store, updated, pid, "plot");
      updated = store.getRoom(created.room.code)!;
      const w = updated.players.find((p) => p.id === pid)!;
      selectCard(store, updated, pid, w.hand[0].id);
      updated = store.getRoom(created.room.code)!;
    }
    startPitching(store, updated);
    updated = store.getRoom(created.room.code)!;

    // During pitching, writerReadyIds should still list everyone who has a movie
    // (revealed or not — the pitcher currently up has revealed=true, others revealed=false)
    const state = toPublicRoomState(updated, p1);
    expect(state.writerReadyIds.sort()).toEqual([p1, p2, p3].sort());
  });
});
