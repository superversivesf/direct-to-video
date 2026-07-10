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

  it("seeds 10 plot cards", () => {
    const cards = getCardDeck(db, "plot");
    expect(cards).toHaveLength(10);
    expect(cards[0].type).toBe("plot");
    expect(cards[0].text).toBeTruthy();
  });

  it("seeds 10 character cards", () => {
    const cards = getCardDeck(db, "character");
    expect(cards).toHaveLength(10);
    expect(cards[0].type).toBe("character");
  });

  it("seeds 10 note cards", () => {
    const cards = getCardDeck(db, "note");
    expect(cards).toHaveLength(10);
    expect(cards[0].type).toBe("note");
  });

  it("does not re-seed if cards already exist", () => {
    seedCards(db);
    const cards = getCardDeck(db, "plot");
    expect(cards).toHaveLength(10);
  });

  it("saves and loads a room", () => {
    const { saveRoom, loadRoom } = initDb(":memory:");
    saveRoom("ABCD", { code: "ABCD", phase: "lobby", players: [] });
    const loaded = loadRoom("ABCD");
    expect(loaded).not.toBeNull();
    expect(loaded!.code).toBe("ABCD");
    expect(loaded!.phase).toBe("lobby");
  });
});