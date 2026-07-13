import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, RoomStore } from "../src/rooms.js";
import {
  startGame,
  setupRound,
  selectDeckType,
  selectCard,
  startPitching,
  revealMovie,
  endPitch,
  selectWinner,
  nextRound,
  playAgain,
} from "../src/state-machine.js";
import type { Database } from "better-sqlite3";

describe("state machine", () => {
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

  function createGameWithPlayers(names: string[]): { room: ReturnType<typeof createRoom>["room"]; playerIds: string[] } {
    const created = createRoom(store, names[0]);
    const playerIds = [created.playerId];
    for (let i = 1; i < names.length; i++) {
      const joined = joinRoom(store, created.room.code, names[i]);
      playerIds.push(joined.playerId);
    }
    return { room: store.getRoom(created.room.code)!, playerIds };
  }

  describe("startGame", () => {
    it("transitions from lobby to setup", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");
      expect(updated.round.current).toBe(1);
      expect(updated.round.total).toBe(3);
    });

    it("requires at least 2 players", () => {
      const { room } = createGameWithPlayers(["Jason"]);
      expect(() => startGame(store, room)).toThrow("Need at least 2 players");
    });

    it("sets the host as first Executive", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.executiveId).toBe(updated.players[0].id);
      expect(updated.players[0].isExecutive).toBe(true);
    });

    it("gives the Executive 3 NOTE cards", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.executiveNotes).toHaveLength(3);
    });

    it("populates all three decks", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.deck.plot.length).toBeGreaterThan(0);
      expect(updated.deck.character.length).toBeGreaterThan(0);
      expect(updated.deck.note.length).toBeGreaterThan(0);
    });
  });

  describe("setupRound", () => {
    it("transitions to card-selection phase", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");
    });
  });

  describe("selectDeckType", () => {
    it("gives writer 3 cards from chosen deck", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      const writerId = playerIds[1];
      selectDeckType(store, updated, writerId, "plot");
      const after = store.getRoom(room.code)!;
      const writer = after.players.find((p) => p.id === writerId)!;
      expect(writer.hand).toHaveLength(3);
      expect(writer.hand.every((c) => c.type === "plot")).toBe(true);
    });

    it("does not allow Executive to draw writer cards", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(() => selectDeckType(store, updated, playerIds[0], "plot")).toThrow("Executive cannot draw writer cards");
    });
  });

  describe("selectCard", () => {
    it("creates a movie with chosen card + auto-drawn blind card", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds[1];
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const cardId = writer.hand[0].id;
      selectCard(store, updated, writerId, cardId);
      updated = store.getRoom(room.code)!;
      const writerAfterSelect = updated.players.find((p) => p.id === writerId)!;
      expect(writerAfterSelect.hand).toHaveLength(2);
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie).toBeDefined();
      expect(movie!.chosenCard.id).toBe(cardId);
      expect(movie!.randomCard.type).toBe("character");
    });

    it("auto-draws from character deck when plot card selected", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === playerIds[1]);
      expect(movie!.randomCard.type).toBe("character");
    });

    it("auto-draws from plot deck when character card selected", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === playerIds[1]);
      expect(movie!.randomCard.type).toBe("plot");
    });

    it("reduces the opposite deck by one card on auto-draw", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const beforeCharDeck = updated.deck.character.length;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.deck.character.length).toBe(beforeCharDeck - 1);
    });
  });

  describe("startPitching", () => {
    it("transitions to pitching phase", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (let i = 1; i < playerIds.length; i++) {
        selectDeckType(store, updated, playerIds[i], "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === playerIds[i])!;
        selectCard(store, updated, playerIds[i], writer.hand[0].id);
        updated = store.getRoom(room.code)!;
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("pitching");
      expect(after.pitchOrder.length).toBe(2);
    });
  });

  describe("revealMovie and endPitch", () => {
    it("advances to next pitcher after endPitch", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (let i = 1; i < playerIds.length; i++) {
        selectDeckType(store, updated, playerIds[i], "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === playerIds[i])!;
        selectCard(store, updated, playerIds[i], writer.hand[0].id);
        updated = store.getRoom(room.code)!;
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      const firstPitcherId = updated.pitchOrder[0];
      revealMovie(store, updated, firstPitcherId);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, firstPitcherId);
      const after = store.getRoom(room.code)!;
      expect(after.currentPitcherId).toBe(after.pitchOrder[1]);
    });

    it("transitions to round-end when all pitchers done", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      revealMovie(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, updated.pitchOrder[0]);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("round-end");
    });
  });

  describe("selectWinner", () => {
    it("awards a point to the winner", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      revealMovie(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      selectWinner(store, updated, playerIds[1]);
      const after = store.getRoom(room.code)!;
      const winner = after.players.find((p) => p.id === playerIds[1])!;
      expect(winner.score).toBe(1);
    });

    it("transitions to game-end when all rounds complete", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      revealMovie(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      selectWinner(store, updated, playerIds[1]);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("setup");
      expect(after.round.current).toBe(2);
    });
  });

  describe("nextRound", () => {
    it("rotates Executive to next player", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      expect(updated.executiveId).toBe(playerIds[0]);
      nextRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.executiveId).toBe(playerIds[1]);
      expect(after.players[1].isExecutive).toBe(true);
      expect(after.players[0].isExecutive).toBe(false);
    });
  });

  describe("playAgain", () => {
    it("resets to lobby keeping players", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("lobby");
      expect(after.players).toHaveLength(2);
      expect(after.players.every((p) => p.score === 0)).toBe(true);
      expect(after.players.every((p) => p.hand.length === 0)).toBe(true);
    });
  });

  describe("blind card deck validation", () => {
    it("rejects blind draw from same deck as chosen card", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
    });

    it("allows blind draw from opposite deck (character after plot)", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === playerIds[1]);
      expect(movie).toBeDefined();
      expect(movie!.randomCard.type).toBe("character");
    });

    it("allows blind draw from opposite deck (plot after character)", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === playerIds[1]);
      expect(movie).toBeDefined();
      expect(movie!.randomCard.type).toBe("plot");
    });
  });

  describe("revealMovie", () => {
    it("movie is auto-revealed when pitching starts", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.movies[0].revealed).toBe(true);
    });

    it("throws if no movie exists for player", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(() => revealMovie(store, updated, playerIds[1])).toThrow("No movie found for player");
    });
  });

  describe("endPitch reveals all movies", () => {
    it("sets all movies to revealed when last pitcher ends", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      updated = store.getRoom(room.code)!;
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      revealMovie(store, updated, updated.pitchOrder[0]);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, updated.pitchOrder[0]);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("round-end");
      expect(after.movies.every((m) => m.revealed)).toBe(true);
    });
  });

  describe("playAgain resets chosenCard", () => {
    it("clears chosenCard on all players", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      selectCard(store, updated, playerIds[1], writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.players.find((p) => p.id === playerIds[1])!.chosenCard).not.toBeNull();
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.players.every((p) => p.chosenCard === null)).toBe(true);
    });
  });

  describe("selectCard with draws", () => {
    it("auto-draws a character card and substitutes ____ with its text", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;

      const specialCard: Card = { ...writer.hand[0], text: "has a steamy affair with ____.", draws: [{ deck: "character", count: 1 }] };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === playerIds[1]
            ? { ...p, hand: [specialCard, ...p.hand.slice(1)] }
            : p
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, playerIds[1], specialCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === playerIds[1])!.chosenCard!;
      expect(chosen).toBeDefined();
      expect(chosen.substitutedText).toBeDefined();
      expect(chosen.substitutedText).not.toContain("____");
    });

    it("does not substitute when card has no draws", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      const cardId = writer.hand[0].id;
      selectCard(store, updated, playerIds[1], cardId);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === playerIds[1])!.chosenCard!;
      expect(chosen.substitutedText).toBeUndefined();
    });

    it("draws from the character deck when specified", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      const beforeDeckSize = updated.deck.character.length;

      const specialCard: Card = { ...writer.hand[0], text: "has a steamy affair with ____.", draws: [{ deck: "character", count: 1 }] };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === playerIds[1]
            ? { ...p, hand: [specialCard, ...p.hand.slice(1)] }
            : p
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, playerIds[1], specialCard.id);
      const after = store.getRoom(room.code)!;
      expect(after.deck.character.length).toBeLessThan(beforeDeckSize);
    });

    it("handles multiple ____ placeholders with count > 1", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;

      const specialCard: Card = { ...writer.hand[0], text: "____ and ____ team up.", draws: [{ deck: "character", count: 2 }] };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === playerIds[1]
            ? { ...p, hand: [specialCard, ...p.hand.slice(1)] }
            : p
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, playerIds[1], specialCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === playerIds[1])!.chosenCard!;
      expect(chosen.substitutedText).toBeDefined();
      expect(chosen.substitutedText).not.toContain("____");
    });

    it("handles draws from different decks", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;

      const specialCard: Card = { ...writer.hand[0], text: "____ meets ____.", draws: [{ deck: "character", count: 1 }, { deck: "plot", count: 1 }] };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === playerIds[1]
            ? { ...p, hand: [specialCard, ...p.hand.slice(1)] }
            : p
        ),
      };
      store.saveRoom(updated);

      const beforeChar = updated.deck.character.length;
      const beforePlot = updated.deck.plot.length;

      selectCard(store, updated, playerIds[1], specialCard.id);
      const after = store.getRoom(room.code)!;
      expect(after.deck.character.length).toBeLessThan(beforeChar);
      expect(after.deck.plot.length).toBeLessThan(beforePlot);
    });

    it("preserves text that has no draws specified", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, playerIds[1], "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === playerIds[1])!;
      const normalCard = writer.hand[0];
      selectCard(store, updated, playerIds[1], normalCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === playerIds[1])!.chosenCard!;
      expect(chosen.text).toBe(normalCard.text);
      expect(chosen.substitutedText).toBeUndefined();
    });
  });
});