import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards, getCardDeck } from "../src/db.js";
import type { Database } from "better-sqlite3";

describe("database", () => {
  let db: Database;

  beforeEach(() => {
    db = initDb(":memory:").db;
    seedCards(db);
  });

  afterEach(() => {
    db.close();
  });

  it("seeds plot cards", () => {
    const cards = getCardDeck(db, "plot");
    expect(cards.length).toBeGreaterThan(100);
    expect(cards[0].type).toBe("plot");
    expect(cards[0].text).toBeTruthy();
    expect(cards[0].id).toBeTruthy();
  });

  it("seeds character cards", () => {
    const cards = getCardDeck(db, "character");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].type).toBe("character");
  });

  it("seeds note cards", () => {
    const cards = getCardDeck(db, "note");
    expect(cards.length).toBeGreaterThan(0);
    expect(cards[0].type).toBe("note");
  });

  it("does not re-seed if cards already exist", () => {
    const before = getCardDeck(db, "plot").length;
    seedCards(db);
    const after = getCardDeck(db, "plot").length;
    expect(after).toBe(before);
  });

  it("stores and retrieves card with structured fields", () => {
    const cards = getCardDeck(db, "plot");
    const drawCard = cards.find((c) => c.draws);
    expect(drawCard).toBeDefined();
    expect(drawCard!.draws![0].deck).toBe("character");
  });

  it("saves and loads a room", () => {
    const { saveRoom, loadRoom } = initDb(":memory:");
    saveRoom("ABCD", { code: "ABCD", phase: "lobby", players: [] });
    const loaded = loadRoom("ABCD");
    expect(loaded).not.toBeNull();
    expect(loaded!.code).toBe("ABCD");
    expect(loaded!.phase).toBe("lobby");
  });

  it("getAllRooms returns all saved rooms", () => {
    const handle = initDb(":memory:");
    handle.saveRoom("AAAA", { code: "AAAA", phase: "lobby", players: [] });
    handle.saveRoom("BBBB", { code: "BBBB", phase: "pitching", players: [] });
    handle.saveRoom("CCCC", { code: "CCCC", phase: "voting", players: [] });
    const rooms = handle.getAllRooms();
    expect(rooms).toHaveLength(3);
    const codes = rooms.map((r) => r.code);
    expect(codes).toContain("AAAA");
    expect(codes).toContain("BBBB");
    expect(codes).toContain("CCCC");
  });
});
