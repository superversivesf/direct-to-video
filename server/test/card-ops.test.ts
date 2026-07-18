import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, RoomStore } from "../src/rooms.js";
import {
  shuffle,
  drawCards,
  getRefillDeck,
  drawFromDeck,
  substituteDraws,
} from "../src/card-ops.js";
import type { Card, Room } from "@direct-to-video/shared";
import type { Database } from "better-sqlite3";

function makeCard(id: string, type: Card["type"], text: string, draws?: Card["draws"]): Card {
  return { id, type, text, draws };
}

describe("card-ops", () => {
  let db: Database;
  let store: RoomStore;
  let room: Room;

  beforeEach(() => {
    const handle = initDb(":memory:");
    db = handle.db;
    seedCards(db);
    store = new RoomStore(handle);
    const created = createRoom(store, "Host");
    const _joined = joinRoom(store, created.room.code, "Writer");
    joinRoom(store, created.room.code, "Writer2");
    room = store.getRoom(created.room.code)!;
    room = {
      ...room,
      deck: {
        plot: store.getCardsByType("plot"),
        character: store.getCardsByType("character"),
        note: store.getCardsByType("note"),
      },
    };
    store.saveRoom(room);
  });

  afterEach(() => {
    db.close();
  });

  describe("shuffle", () => {
    it("returns a new array with the same elements", () => {
      const input = [1, 2, 3, 4, 5];
      const result = shuffle(input);
      expect(result).toHaveLength(input.length);
      expect(result.sort()).toEqual(input);
      expect(input).toEqual([1, 2, 3, 4, 5]);
    });

    it("handles empty arrays", () => {
      expect(shuffle([])).toEqual([]);
    });

    it("handles single-element arrays", () => {
      expect(shuffle([42])).toEqual([42]);
    });
  });

  describe("drawCards", () => {
    it("draws the requested count from a sufficiently large deck", () => {
      const deck = [1, 2, 3, 4, 5].map((n) => makeCard(`c${n}`, "plot", `t${n}`));
      const { drawn, remaining } = drawCards(deck, 3);
      expect(drawn).toHaveLength(3);
      expect(remaining).toHaveLength(2);
    });

    it("returns all cards and empty remaining when deck is smaller than count and no refill", () => {
      const deck = [makeCard("a", "plot", "x")];
      const { drawn, remaining } = drawCards(deck, 3);
      expect(drawn).toHaveLength(1);
      expect(remaining).toHaveLength(0);
    });

    it("refills from refillDeck when deck is too small", () => {
      const deck = [makeCard("a", "plot", "x")];
      const refill = [makeCard("b", "plot", "y"), makeCard("c", "plot", "z")];
      const { drawn, remaining } = drawCards(deck, 2, refill);
      expect(drawn).toHaveLength(2);
      expect(remaining.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("getRefillDeck", () => {
    it("returns all cards of type when franchise enabled", () => {
      room = { ...room, franchiseEnabled: true };
      const refill = getRefillDeck(store, "plot", room);
      const allPlot = store.getCardsByType("plot");
      expect(refill.length).toBe(allPlot.length);
    });

    it("filters franchise cards when franchise disabled", () => {
      room = { ...room, franchiseEnabled: false };
      const refill = getRefillDeck(store, "plot", room);
      expect(refill.every((c) => !c.isFranchise)).toBe(true);
    });
  });

  describe("drawFromDeck", () => {
    it("delegates to drawCards with the refill for the deck type", () => {
      const deck = store.getCardsByType("plot").slice(0, 5);
      const { drawn, remaining } = drawFromDeck(store, deck, 2, "plot", room);
      expect(drawn).toHaveLength(2);
      expect(remaining.length).toBeLessThanOrEqual(deck.length - 1);
    });
  });

  describe("substituteDraws", () => {
    it("returns the card unchanged when it has no draws", () => {
      const card = makeCard("c1", "plot", "A simple plot with no placeholders.");
      const { card: result, deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(result).toBe(card);
      expect(resultDeck).toBe(room.deck);
    });

    it("substitutes a single ____ with drawn card text", () => {
      const card = makeCard("c1", "plot", "has a steamy affair with ____.", [
        { deck: "character", count: 1 },
      ]);
      const beforeChar = room.deck.character.length;
      const { card: result, deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(result.substitutedText).toBeDefined();
      expect(result.substitutedText).not.toContain("____");
      expect(resultDeck.character.length).toBe(beforeChar - 1);
    });

    it("substitutes multiple ____ with count > 1 from the same deck", () => {
      const card = makeCard("c1", "plot", "____ and ____ team up.", [
        { deck: "character", count: 2 },
      ]);
      const beforeChar = room.deck.character.length;
      const { card: result, deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(result.substitutedText).not.toContain("____");
      expect(resultDeck.character.length).toBe(beforeChar - 2);
    });

    it("substitutes draws from multiple different decks", () => {
      const card = makeCard("c1", "character", "____ meets ____.", [
        { deck: "character", count: 1 },
        { deck: "plot", count: 1 },
      ]);
      const beforeChar = room.deck.character.length;
      const beforePlot = room.deck.plot.length;
      const { card: result, deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(result.substitutedText).not.toBe(card.text);
      expect(result.substitutedText!.startsWith("____ meets ")).toBe(false);
      expect(resultDeck.character.length).toBe(beforeChar - 1);
      expect(resultDeck.plot.length).toBe(beforePlot - 1);
    });

    it("reduces the deck by the number of cards drawn", () => {
      const card = makeCard("c1", "plot", "____ and ____ and ____.", [
        { deck: "character", count: 3 },
      ]);
      const before = room.deck.character.length;
      const { deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(resultDeck.character.length).toBe(before - 3);
    });

    it("draws from the note deck when specified", () => {
      const card = makeCard("c1", "note", "Note: ____", [{ deck: "note", count: 1 }]);
      const before = room.deck.note.length;
      const { deck: resultDeck } = substituteDraws(store, room.deck, card, room);
      expect(resultDeck.note.length).toBe(before - 1);
    });
  });
});
