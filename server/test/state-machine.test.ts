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
  castVote,
  tallyAndAdvance,
  nextRound,
  playAgain,
  forceStart,
  selectFranchiseSource,
} from "../src/state-machine.js";
import { startTimer, pauseForNote, tickTimer, shouldResumeFromNote } from "../src/timer.js";
import type { Card } from "@direct-to-video/shared";
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

  function createGameWithPlayers(names: string[]): {
    room: ReturnType<typeof createRoom>["room"];
    playerIds: string[];
  } {
    const created = createRoom(store, names[0]);
    const playerIds = [created.playerId];
    for (let i = 1; i < names.length; i++) {
      const joined = joinRoom(store, created.room.code, names[i]);
      playerIds.push(joined.playerId);
    }
    return { room: store.getRoom(created.room.code)!, playerIds };
  }

  function setupRoundEnd(names: string[]): {
    room: ReturnType<typeof createRoom>["room"];
    playerIds: string[];
  } {
    const { room, playerIds } = createGameWithPlayers(names);
    startGame(store, room);
    let updated = store.getRoom(room.code)!;
    for (const writerId of playerIds) {
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
    }
    startPitching(store, updated);
    updated = store.getRoom(room.code)!;
    for (const pitcherId of updated.pitchOrder) {
      revealMovie(store, updated, pitcherId);
      updated = store.getRoom(room.code)!;
      endPitch(store, updated, pitcherId);
      updated = store.getRoom(room.code)!;
    }
    return { room: store.getRoom(room.code)!, playerIds };
  }

  describe("startGame", () => {
    it("transitions from lobby to setup", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");
      expect(updated.round.current).toBe(1);
    });

    it("requires at least 2 players", () => {
      const { room } = createGameWithPlayers(["Jason"]);
      expect(() => startGame(store, room)).toThrow("Need at least 2 players");
    });

    it("builds a noteGiverOrder containing all player IDs", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.noteGiverOrder).toHaveLength(3);
      for (const id of playerIds) {
        expect(updated.noteGiverOrder).toContain(id);
      }
    });

    it("sets noteGiverIndex to 0", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.noteGiverIndex).toBe(1);
    });

    it("assigns a note-giver from the shuffled order", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.noteGiverId).toBe(updated.noteGiverOrder[0]);
      expect(playerIds).toContain(updated.noteGiverId);
    });

    it("gives the note-giver 3 note cards", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.noteGiverNotes).toHaveLength(3);
    });

    it("populates all three decks", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.deck.plot.length).toBeGreaterThan(0);
      expect(updated.deck.character.length).toBeGreaterThan(0);
      expect(updated.deck.note.length).toBeGreaterThan(0);
    });

    it("does not set round.total (v2.0 uses totalRounds)", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.round).not.toHaveProperty("total");
      expect(updated.totalRounds).toBe(5);
    });
  });

  describe("setupRound", () => {
    it("transitions to setup phase", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");
    });

    it("rotates note-giver when called directly", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const firstNoteGiver = updated.noteGiverId!;
      expect(playerIds).toContain(firstNoteGiver);

      updated = { ...updated, noteGiverIndex: 1 };
      store.saveRoom(updated);
      setupRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.noteGiverId).toBe(after.noteGiverOrder[1]);
      expect(after.noteGiverId).not.toBe(firstNoteGiver);
    });

    it("skips disconnected players when picking note-giver", () => {
      const { room, _playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;

      const nextId = updated.noteGiverOrder[1];
      updated = {
        ...updated,
        players: updated.players.map((p) => (p.id === nextId ? { ...p, isDisconnected: true } : p)),
        noteGiverIndex: 1,
      };
      store.saveRoom(updated);
      setupRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.noteGiverId).not.toBe(nextId);
      expect(after.players.find((p) => p.id === after.noteGiverId)!.isDisconnected).toBe(false);
    });

    it("reshuffles order when exhausted", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      updated = { ...updated, noteGiverIndex: updated.noteGiverOrder.length };
      store.saveRoom(updated);
      setupRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.noteGiverOrder).toHaveLength(2);
      expect(playerIds).toContain(after.noteGiverId);
    });

    it("clears hands and chosenCard for all players", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.players.every((p) => p.hand.length === 0)).toBe(true);
      expect(updated.players.every((p) => p.chosenCard === null)).toBe(true);
    });
  });

  describe("selectDeckType", () => {
    it("gives writer 3 cards from chosen deck", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      const after = store.getRoom(room.code)!;
      const writer = after.players.find((p) => p.id === writerId)!;
      expect(writer.hand).toHaveLength(3);
      expect(writer.hand.every((c) => c.type === "plot")).toBe(true);
    });

    it("allows the note-giver to draw writer cards (note-giver pitches last)", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(() => selectDeckType(store, updated, updated.noteGiverId!, "plot")).not.toThrow();
      const after = store.getRoom(room.code)!;
      const noteGiver = after.players.find((p) => p.id === updated.noteGiverId)!;
      expect(noteGiver.hand).toHaveLength(3);
    });
  });

  describe("selectCard", () => {
    it("creates a movie with chosen card + auto-drawn blind card", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
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
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie!.randomCard.type).toBe("character");
    });

    it("auto-draws from plot deck when character card selected", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie!.randomCard.type).toBe("plot");
    });

    it("reduces the opposite deck by one card on auto-draw", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const beforeCharDeck = updated.deck.character.length;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.deck.character.length).toBe(beforeCharDeck - 1);
    });
  });

  describe("selectCard with draws", () => {
    it("auto-draws a character card and substitutes ____ with its text", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;

      const specialCard: Card = {
        ...writer.hand[0],
        text: "has a steamy affair with ____.",
        draws: [{ deck: "character", count: 1 }],
      };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [specialCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, writerId, specialCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === writerId)!.chosenCard!;
      expect(chosen).toBeDefined();
      expect(chosen.substitutedText).toBeDefined();
      expect(chosen.substitutedText).not.toContain("____");
    });

    it("does not substitute when card has no draws", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const cardId = writer.hand[0].id;
      selectCard(store, updated, writerId, cardId);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === writerId)!.chosenCard!;
      expect(chosen.substitutedText).toBeUndefined();
    });

    it("draws from the character deck when specified", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const beforeDeckSize = updated.deck.character.length;

      const specialCard: Card = {
        ...writer.hand[0],
        text: "has a steamy affair with ____.",
        draws: [{ deck: "character", count: 1 }],
      };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [specialCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, writerId, specialCard.id);
      const after = store.getRoom(room.code)!;
      expect(after.deck.character.length).toBeLessThan(beforeDeckSize);
    });

    it("handles multiple ____ placeholders with count > 1", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;

      const specialCard: Card = {
        ...writer.hand[0],
        text: "____ and ____ team up.",
        draws: [{ deck: "character", count: 2 }],
      };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [specialCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);

      selectCard(store, updated, writerId, specialCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === writerId)!.chosenCard!;
      expect(chosen.substitutedText).toBeDefined();
      expect(chosen.substitutedText).not.toContain("____");
    });

    it("handles draws from different decks", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;

      const specialCard: Card = {
        ...writer.hand[0],
        text: "____ meets ____.",
        draws: [
          { deck: "character", count: 1 },
          { deck: "plot", count: 1 },
        ],
      };
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [specialCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);

      const beforeChar = updated.deck.character.length;
      const beforePlot = updated.deck.plot.length;

      selectCard(store, updated, writerId, specialCard.id);
      const after = store.getRoom(room.code)!;
      expect(after.deck.character.length).toBeLessThan(beforeChar);
      expect(after.deck.plot.length).toBeLessThan(beforePlot);
    });

    it("preserves text that has no draws specified", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const normalCard = writer.hand.find((c) => !c.draws || c.draws.length === 0)!;
      selectCard(store, updated, writerId, normalCard.id);
      const after = store.getRoom(room.code)!;
      const chosen = after.players.find((p) => p.id === writerId)!.chosenCard!;
      expect(chosen.text).toBe(normalCard.text);
      expect(chosen.substitutedText).toBeUndefined();
    });
  });

  describe("startPitching", () => {
    it("transitions to pitching phase", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("pitching");
      expect(after.pitchOrder.length).toBe(playerIds.length);
    });

    it("sorts the note-giver to the end of pitch order", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie", "Dave"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const noteGiverId = updated.noteGiverId!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.pitchOrder[after.pitchOrder.length - 1]).toBe(noteGiverId);
    });

    it("auto-reveals first pitcher's movie", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      const after = store.getRoom(room.code)!;
      const firstMovie = after.movies.find((m) => m.playerId === after.pitchOrder[0])!;
      expect(firstMovie.revealed).toBe(true);
    });
  });

  describe("revealMovie and endPitch", () => {
    it("advances to next pitcher after endPitch", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
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

    it("transitions to round-end with 15s voting timer when all pitchers done", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      for (const pitcherId of updated.pitchOrder) {
        revealMovie(store, updated, pitcherId);
        updated = store.getRoom(room.code)!;
        endPitch(store, updated, pitcherId);
        updated = store.getRoom(room.code)!;
      }
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("round-end");
      expect(after.timer.secondsRemaining).toBe(15);
      expect(after.votingActive).toBe(true);
      expect(after.votes).toEqual({});
    });

    it("sets all movies to revealed when last pitcher ends", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      for (const pitcherId of updated.pitchOrder) {
        revealMovie(store, updated, pitcherId);
        updated = store.getRoom(room.code)!;
        endPitch(store, updated, pitcherId);
        updated = store.getRoom(room.code)!;
      }
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("round-end");
      expect(after.movies.every((m) => m.revealed)).toBe(true);
    });

    it("throws if no movie exists for player", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      expect(() => revealMovie(store, updated, writerId)).toThrow("No movie found for player");
    });
  });

  describe("castVote", () => {
    it("records a vote", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      const voterId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const target = playerIds.find((id) => id !== voterId && id !== updated.noteGiverId)!;
      castVote(store, updated, voterId, target);
      const after = store.getRoom(room.code)!;
      expect(after.votes[voterId]).toBe(target);
    });

    it("records an audience vote for any player", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      castVote(store, updated, "audience1", playerIds[0]);
      const after = store.getRoom(room.code)!;
      expect(after.votes["audience1"]).toBe(playerIds[0]);
    });

    it("prevents players from voting for themselves", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      expect(() => castVote(store, updated, writerId, writerId)).toThrow(
        "cannot vote for themselves",
      );
    });

    it("allows the note-giver to vote for another player", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      const noteGiverId = updated.noteGiverId!;
      const target = playerIds.find((id) => id !== noteGiverId)!;
      castVote(store, updated, noteGiverId, target);
      const after = store.getRoom(room.code)!;
      expect(after.votes[noteGiverId]).toBe(target);
    });

    it("prevents voting when not active", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(() => castVote(store, updated, "aud1", playerIds[0])).toThrow("not active");
    });

    it("prevents voting for a player with no movie", () => {
      const { room, _playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      const fakeId = "nonexistent-player-id";
      expect(() => castVote(store, updated, "aud1", fakeId)).toThrow("No movie found");
    });
  });

  describe("tallyAndAdvance", () => {
    it("adds vote counts to each player's score (cumulative)", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const target1 = playerIds[0];
      const target2 = playerIds[1];
      const voter = playerIds.find((id) => id !== target1 && id !== target2)!;
      castVote(store, store.getRoom(room.code)!, "aud1", target1);
      castVote(store, store.getRoom(room.code)!, "aud2", target1);
      castVote(store, store.getRoom(room.code)!, voter, target2);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      const p1 = after.players.find((p) => p.id === target1)!;
      const p2 = after.players.find((p) => p.id === target2)!;
      const p3 = after.players.find((p) => p.id === voter)!;
      expect(p1.score).toBe(2);
      expect(p2.score).toBe(1);
      expect(p3.score).toBe(0);
    });

    it("sets roundWinnerId to the player with the most votes", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      castVote(store, store.getRoom(room.code)!, "aud1", playerIds[0]);
      castVote(store, store.getRoom(room.code)!, "aud2", playerIds[0]);
      castVote(store, store.getRoom(room.code)!, "aud3", playerIds[1]);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.roundWinnerId).toBe(playerIds[0]);
    });

    it("sets roundWinnerId to null on a tie", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      castVote(store, store.getRoom(room.code)!, "aud1", playerIds[0]);
      castVote(store, store.getRoom(room.code)!, "aud2", playerIds[1]);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.roundWinnerId).toBeNull();
    });

    it("clears votes and deactivates voting", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const _updated = store.getRoom(room.code)!;
      castVote(store, store.getRoom(room.code)!, "aud1", playerIds[0]);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.votes).toEqual({});
      expect(after.votingActive).toBe(false);
    });

    it("advances to the next round when not the last round", () => {
      const { room } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const updated = store.getRoom(room.code)!;
      expect(updated.totalRounds).toBe(5);
      expect(updated.round.current).toBe(1);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("setup");
      expect(after.round.current).toBe(2);
    });

    it("transitions to game-end when round.current >= totalRounds", () => {
      const { room } = setupRoundEnd(["Jason", "Sarah"]);
      let updated = store.getRoom(room.code)!;
      updated = { ...updated, totalRounds: 1 };
      store.saveRoom(updated);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("game-end");
    });

    it("throws when voting is not active", () => {
      const { room, _playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(() => tallyAndAdvance(store, updated)).toThrow("not active");
    });

    it("handles zero votes without crashing", () => {
      const { room } = setupRoundEnd(["Jason", "Sarah"]);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      const after = store.getRoom(room.code)!;
      expect(after.votingActive).toBe(false);
      expect(after.roundWinnerId).toBeNull();
      expect(after.players.every((p) => p.score === 0)).toBe(true);
    });

    it("accumulates scores across multiple rounds", () => {
      const { room, playerIds } = setupRoundEnd(["Jason", "Sarah", "Mike"]);
      const target = playerIds[0];
      castVote(store, store.getRoom(room.code)!, "aud1", target);
      castVote(store, store.getRoom(room.code)!, "aud2", target);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      let after = store.getRoom(room.code)!;
      expect(after.players.find((p) => p.id === target)!.score).toBe(2);

      for (const writerId of playerIds) {
        selectDeckType(store, after, writerId, "plot");
        after = store.getRoom(room.code)!;
        const writer = after.players.find((p) => p.id === writerId)!;
        selectCard(store, after, writerId, writer.hand[0].id);
        after = store.getRoom(room.code)!;
      }
      startPitching(store, after);
      after = store.getRoom(room.code)!;
      for (const pitcherId of after.pitchOrder) {
        revealMovie(store, after, pitcherId);
        after = store.getRoom(room.code)!;
        endPitch(store, after, pitcherId);
        after = store.getRoom(room.code)!;
      }
      castVote(store, store.getRoom(room.code)!, "aud1", target);
      castVote(store, store.getRoom(room.code)!, "aud2", target);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      after = store.getRoom(room.code)!;
      expect(after.players.find((p) => p.id === target)!.score).toBe(4);
    });
  });

  describe("nextRound", () => {
    it("increments the round counter and transitions to setup", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      const before = updated.round.current;
      nextRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("setup");
      expect(after.round.current).toBe(before + 1);
    });

    it("does not check game-end (tallyAndAdvance does that)", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      updated = { ...updated, totalRounds: 1, round: { current: 1 } };
      store.saveRoom(updated);
      nextRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("setup");
      expect(after.round.current).toBe(2);
    });

    it("picks a new note-giver for the next round", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      const _firstNoteGiver = updated.noteGiverId!;
      nextRound(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.noteGiverId).toBeDefined();
      expect(after.noteGiverId).toBe(
        after.noteGiverOrder[after.noteGiverIndex - 1] ?? after.noteGiverOrder[0],
      );
      expect(playerIds).toContain(after.noteGiverId);
    });
  });

  describe("playAgain", () => {
    it("resets to lobby keeping players", () => {
      const { room, _playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.phase).toBe("lobby");
      expect(after.players).toHaveLength(2);
      expect(after.players.every((p) => p.score === 0)).toBe(true);
      expect(after.players.every((p) => p.hand.length === 0)).toBe(true);
    });

    it("clears noteGiverOrder, noteGiverIndex, and roundWinnerId", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      const updated = store.getRoom(room.code)!;
      expect(updated.noteGiverOrder.length).toBeGreaterThan(0);
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.noteGiverOrder).toEqual([]);
      expect(after.noteGiverIndex).toBe(0);
      expect(after.roundWinnerId).toBeNull();
      expect(after.noteGiverId).toBeNull();
    });

    it("clears chosenCard on all players", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.players.find((p) => p.id === writerId)!.chosenCard).not.toBeNull();
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.players.every((p) => p.chosenCard === null)).toBe(true);
    });

    it("preserves totalRounds for the next game", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      let updated = store.getRoom(room.code)!;
      updated = { ...updated, totalRounds: 7 };
      store.saveRoom(updated);
      startGame(store, updated);
      updated = store.getRoom(room.code)!;
      playAgain(store, updated);
      const after = store.getRoom(room.code)!;
      expect(after.totalRounds).toBe(7);
    });
  });

  describe("blind card deck validation", () => {
    it("rejects blind draw from same deck as chosen card", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
    });

    it("allows blind draw from opposite deck (character after plot)", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie).toBeDefined();
      expect(movie!.randomCard.type).toBe("character");
    });

    it("allows blind draw from opposite deck (plot after character)", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "character");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie).toBeDefined();
      expect(movie!.randomCard.type).toBe("plot");
    });
  });

  describe("timer paused for note edge cases", () => {
    function setupPitching(names: string[]): {
      room: ReturnType<typeof createRoom>["room"];
      playerIds: string[];
    } {
      const { room, playerIds } = createGameWithPlayers(names);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const writerId of playerIds) {
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      startPitching(store, updated);
      return { room: store.getRoom(room.code)!, playerIds };
    }

    it("endPitch while timer is paused for note resets timer correctly", () => {
      const { room } = setupPitching(["Jason", "Sarah", "Mike"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = { ...updated, timer: pauseForNote(updated.timer, 5) };
      store.saveRoom(updated);

      expect(updated.timer.pausedForNote).toBe(true);
      expect(updated.timer.running).toBe(false);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      const after = store.getRoom(room.code)!;
      expect(after.timer.pausedForNote).toBe(false);
      expect(after.timer.running).toBe(false);
      expect(after.timer.secondsRemaining).toBe(45);
      expect(after.timer.noteResumeAt).toBeNull();
      expect(after.currentPitcherId).toBe(updated.pitchOrder[1]);
    });

    it("endPitch on last pitcher while timer paused for note transitions to round-end", () => {
      const { room } = setupPitching(["Jason", "Sarah"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = { ...updated, timer: pauseForNote(updated.timer, 5) };
      store.saveRoom(updated);

      expect(updated.timer.pausedForNote).toBe(true);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      let after = store.getRoom(room.code)!;
      expect(after.phase).toBe("pitching");
      expect(after.currentPitcherId).toBe(updated.pitchOrder[1]);

      after = { ...after, timer: pauseForNote(after.timer, 5) };
      store.saveRoom(after);

      endPitch(store, store.getRoom(room.code)!, after.currentPitcherId!);

      after = store.getRoom(room.code)!;
      expect(after.phase).toBe("round-end");
      expect(after.votingActive).toBe(true);
      expect(after.timer.secondsRemaining).toBe(15);
      expect(after.timer.pausedForNote).toBe(false);
      expect(after.timer.running).toBe(false);
      expect(after.timer.noteResumeAt).toBeNull();
    });

    it("shouldResumeFromNote returns false after endPitch resets timer", () => {
      const { room } = setupPitching(["Jason", "Sarah", "Mike"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = { ...updated, timer: pauseForNote(updated.timer, 5) };
      store.saveRoom(updated);

      expect(shouldResumeFromNote(updated.timer)).toBe(false);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      const after = store.getRoom(room.code)!;
      expect(shouldResumeFromNote(after.timer)).toBe(false);
    });

    it("shouldResumeFromNote returns true when note window expires, but false after endPitch", () => {
      const { room } = setupPitching(["Jason", "Sarah", "Mike"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = { ...updated, timer: pauseForNote(updated.timer, 0) };
      store.saveRoom(updated);

      expect(shouldResumeFromNote(updated.timer)).toBe(true);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      const after = store.getRoom(room.code)!;
      expect(shouldResumeFromNote(after.timer)).toBe(false);
    });

    it("timer tick loop does not resume after endPitch resets paused timer", () => {
      const { room } = setupPitching(["Jason", "Sarah", "Mike"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = { ...updated, timer: pauseForNote(updated.timer, 5) };
      store.saveRoom(updated);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      const after = store.getRoom(room.code)!;

      const ticked = tickTimer(after.timer);
      expect(ticked.secondsRemaining).toBe(45);
      expect(ticked.running).toBe(false);
      expect(shouldResumeFromNote(ticked)).toBe(false);
    });

    it("endPitch while timer running (not paused) still works", () => {
      const { room } = setupPitching(["Jason", "Sarah", "Mike"]);
      let updated = store.getRoom(room.code)!;

      updated = { ...updated, timer: startTimer(updated.timer) };
      store.saveRoom(updated);

      updated = store.getRoom(room.code)!;
      const ticked = tickTimer(updated.timer);
      store.saveRoom({ ...updated, timer: ticked });
      expect(ticked.secondsRemaining).toBe(44);

      endPitch(store, store.getRoom(room.code)!, updated.currentPitcherId!);

      const after = store.getRoom(room.code)!;
      expect(after.timer.running).toBe(false);
      expect(after.timer.secondsRemaining).toBe(45);
      expect(after.currentPitcherId).toBe(updated.pitchOrder[1]);
    });
  });

  describe("forceStart", () => {
    it("throws when phase is lobby", () => {
      const { room } = createGameWithPlayers(["Jason", "Sarah"]);
      expect(() => forceStart(store, room)).toThrow(
        "Cannot force-start outside setup or card-selection phase",
      );
    });

    it("throws when phase is pitching", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const id of playerIds) {
        selectDeckType(store, updated, id, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === id)!;
        selectCard(store, updated, id, writer.hand[0].id);
        updated = store.getRoom(room.code)!;
      }
      expect(updated.phase).toBe("pitching");
      expect(() => forceStart(store, updated)).toThrow(
        "Cannot force-start outside setup or card-selection phase",
      );
    });

    it("auto-picks plot deck and first card for unprepared writers during setup", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");
      const unprepared = playerIds.find((id) => id !== updated.noteGiverId)!;
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
      const unpreparedPlayer = updated.players.find((p) => p.id === unprepared)!;
      expect(unpreparedPlayer.hand).toHaveLength(2);
      const movie = updated.movies.find((m) => m.playerId === unprepared);
      expect(movie).toBeDefined();
      expect(movie!.chosenCard.id).toBeTruthy();
      expect(movie!.randomCard.id).toBeTruthy();
    });

    it("auto-picks first card for writers with hand but no movie during card-selection", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      for (const id of playerIds) {
        selectDeckType(store, updated, id, "plot");
        updated = store.getRoom(room.code)!;
      }
      expect(updated.phase).toBe("card-selection");
      const unprepared = playerIds.find((id) => id !== updated.noteGiverId)!;
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
      const movie = updated.movies.find((m) => m.playerId === unprepared);
      expect(movie).toBeDefined();
      expect(movie!.chosenCard.id).toBeTruthy();
    });

    it("auto-picks for the note giver when unprepared", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const noteGiverId = updated.noteGiverId!;
      const otherWriter = playerIds.find((id) => id !== noteGiverId)!;
      selectDeckType(store, updated, otherWriter, "plot");
      updated = store.getRoom(room.code)!;
      const otherWriterHand = updated.players.find((p) => p.id === otherWriter)!;
      selectCard(store, updated, otherWriter, otherWriterHand.hand[0].id);
      updated = store.getRoom(room.code)!;
      const noteGiverBefore = updated.players.find((p) => p.id === noteGiverId)!;
      expect(noteGiverBefore.hand).toHaveLength(0);
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
      const noteGiverAfter = updated.players.find((p) => p.id === noteGiverId)!;
      expect(noteGiverAfter.hand).toHaveLength(2);
      const noteGiverMovie = updated.movies.find((m) => m.playerId === noteGiverId);
      expect(noteGiverMovie).toBeDefined();
      expect(noteGiverMovie!.chosenCard.id).toBeTruthy();
      expect(updated.pitchOrder[updated.pitchOrder.length - 1]).toBe(noteGiverId);
    });

    it("skips disconnected players when force-starting", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const disconnected = playerIds.find((id) => id !== updated.noteGiverId)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === disconnected ? { ...p, isDisconnected: true } : p,
        ),
      };
      store.saveRoom(updated);
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      const disconnectedMovie = updated.movies.find((m) => m.playerId === disconnected);
      expect(disconnectedMovie).toBeUndefined();
      const connectedPlayers = playerIds.filter((id) => id !== disconnected);
      for (const id of connectedPlayers) {
        const movie = updated.movies.find((m) => m.playerId === id);
        expect(movie).toBeDefined();
        expect(movie!.chosenCard.id).toBeTruthy();
      }
    });
  });

  describe("writer selects card before all writers have drawn", () => {
    it("transitions to pitching when all writers have movies even if one selected during setup", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie", "Dave"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("setup");

      const writer1 = playerIds[0];
      const writer2 = playerIds[1];
      const writer3 = playerIds[2];
      const writer4 = playerIds[3];

      selectDeckType(store, updated, writer1, "plot");
      updated = store.getRoom(room.code)!;

      const writer1Hand = updated.players.find((p) => p.id === writer1)!;
      const cardId = writer1Hand.hand[0].id;
      selectCard(store, updated, writer1, cardId);
      updated = store.getRoom(room.code)!;

      expect(updated.movies.find((m) => m.playerId === writer1)).toBeDefined();
      expect(updated.players.find((p) => p.id === writer1)!.hand).toHaveLength(2);
      expect(updated.phase).toBe("setup");

      selectDeckType(store, updated, writer2, "plot");
      updated = store.getRoom(room.code)!;

      expect(updated.phase).toBe("setup");

      const writer2Hand = updated.players.find((p) => p.id === writer2)!;
      selectCard(store, updated, writer2, writer2Hand.hand[0].id);
      updated = store.getRoom(room.code)!;

      selectDeckType(store, updated, writer3, "plot");
      updated = store.getRoom(room.code)!;

      const writer3Hand = updated.players.find((p) => p.id === writer3)!;
      selectCard(store, updated, writer3, writer3Hand.hand[0].id);
      updated = store.getRoom(room.code)!;

      expect(updated.phase).toBe("setup");

      selectDeckType(store, updated, writer4, "plot");
      updated = store.getRoom(room.code)!;
      const writer4Hand = updated.players.find((p) => p.id === writer4)!;
      selectCard(store, updated, writer4, writer4Hand.hand[0].id);
      updated = store.getRoom(room.code)!;

      expect(updated.phase).toBe("pitching");
    });

    it("game does not soft-lock when a writer disconnects — disconnected writers skipped", () => {
      const { room, playerIds } = createGameWithPlayers(["Alice", "Bob", "Charlie", "Dave"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;

      for (const writerId of playerIds) {
        updated = store.getRoom(room.code)!;
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
      }

      updated = store.getRoom(room.code)!;
      for (const pitcherId of updated.pitchOrder) {
        revealMovie(store, store.getRoom(room.code)!, pitcherId);
        endPitch(store, store.getRoom(room.code)!, pitcherId);
      }

      updated = store.getRoom(room.code)!;
      const voteTarget = playerIds.find((id) => id !== playerIds[0])!;
      castVote(store, updated, "aud1", voteTarget);
      tallyAndAdvance(store, store.getRoom(room.code)!);
      updated = store.getRoom(room.code)!;
      expect(updated.round.current).toBe(2);

      const disconnectedWriter = playerIds.find(
        (id) => id !== updated.noteGiverId && id !== playerIds[0],
      )!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === disconnectedWriter ? { ...p, isDisconnected: true } : p,
        ),
      };
      store.saveRoom(updated);

      const connectedWriters = playerIds.filter((id) => id !== disconnectedWriter);

      for (const writerId of connectedWriters) {
        updated = store.getRoom(room.code)!;
        selectDeckType(store, updated, writerId, "plot");
        updated = store.getRoom(room.code)!;
        const writer = updated.players.find((p) => p.id === writerId)!;
        selectCard(store, updated, writerId, writer.hand[0].id);
      }

      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
    });
  });

  describe("franchise card selection", () => {
    it("setupRound appends current round's movies to movieHistory", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.movies.length).toBeGreaterThan(0);
      expect(updated.movieHistory).toEqual([]);

      const noteGiverId = updated.noteGiverId!;
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;

      const otherWriter = playerIds.find((id) => id !== writerId && id !== noteGiverId)!;
      if (otherWriter) {
        updated = store.getRoom(room.code)!;
        selectDeckType(store, updated, otherWriter, "plot");
        updated = store.getRoom(room.code)!;
        const ow = updated.players.find((p) => p.id === otherWriter)!;
        selectCard(store, updated, otherWriter, ow.hand[0].id);
      }

      updated = store.getRoom(room.code)!;
      startPitching(store, updated);
      updated = store.getRoom(room.code)!;
      for (const pid of updated.pitchOrder) {
        revealMovie(store, store.getRoom(room.code)!, pid);
        endPitch(store, store.getRoom(room.code)!, pid);
      }
      updated = store.getRoom(room.code)!;
      const started = startTimer(updated.timer);
      store.saveRoom({ ...updated, timer: started });
      tallyAndAdvance(store, store.getRoom(room.code)!);

      updated = store.getRoom(room.code)!;
      expect(updated.movieHistory.length).toBeGreaterThan(0);
      expect(updated.movies).toEqual([]);
    });

    it("selectCard creates a movie with id and franchiseSourceMovieId null", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId)!;
      expect(movie.id).toBeTruthy();
      expect(movie.franchiseSourceMovieId).toBeNull();
    });

    it("selectFranchiseSource throws if phase is not card-selection or setup", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      // Don't call startGame — phase stays "lobby"
      const updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      expect(() => selectFranchiseSource(store, updated, writerId, "fake-id")).toThrow(
        "Cannot select franchise source outside setup or card-selection phase",
      );
    });

    it("selectFranchiseSource throws if player's chosen card is not franchise", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const nonFranchiseCard = writer.hand.find((c) => !c.isFranchise) ?? writer.hand[0];
      selectCard(store, updated, writerId, nonFranchiseCard.id);
      updated = store.getRoom(room.code)!;
      expect(() => selectFranchiseSource(store, updated, writerId, "fake-id")).toThrow(
        "Selected card is not a franchise card",
      );
    });

    it("selectFranchiseSource throws if sourceMovieId not in movieHistory", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const franchiseCard = writer.hand.find((c) => c.isFranchise);
      if (!franchiseCard) {
        const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
        updated = {
          ...updated,
          players: updated.players.map((p) =>
            p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
          ),
        };
        store.saveRoom(updated);
        selectCard(store, updated, writerId, fCard.id);
      } else {
        selectCard(store, updated, writerId, franchiseCard.id);
      }
      updated = store.getRoom(room.code)!;
      expect(() => selectFranchiseSource(store, updated, writerId, "nonexistent-id")).toThrow(
        "Source movie not found in history",
      );
    });

    it("selectFranchiseSource throws if source movie is player's own", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      selectCard(store, updated, writerId, writer.hand[0].id);
      updated = store.getRoom(room.code)!;
      const myMovie = updated.movies.find((m) => m.playerId === writerId)!;
      updated = {
        ...updated,
        movieHistory: [{ ...myMovie, id: "own-history-id" }],
      };
      store.saveRoom(updated);
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
        movies: [],
      };
      store.saveRoom(updated);
      selectCard(store, updated, writerId, fCard.id);
      updated = store.getRoom(room.code)!;
      expect(() => selectFranchiseSource(store, updated, writerId, "own-history-id")).toThrow(
        "Cannot reference your own previously pitched movie",
      );
    });

    it("selectFranchiseSource succeeds and updates movie.franchiseSourceMovieId", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const otherWriter = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, otherWriter.hand[0].id);
      updated = store.getRoom(room.code)!;
      const otherMovie = updated.movies.find((m) => m.playerId === otherWriterId)!;
      updated = { ...updated, movieHistory: [{ ...otherMovie, id: "history-id-1" }] };
      store.saveRoom(updated);
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const writer = updated.players.find((p) => p.id === writerId)!;
      const franchiseCard = writer.hand.find((c) => c.isFranchise);
      if (franchiseCard) {
        selectCard(store, updated, writerId, franchiseCard.id);
      } else {
        const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
        updated = {
          ...updated,
          players: updated.players.map((p) =>
            p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
          ),
        };
        store.saveRoom(updated);
        selectCard(store, updated, writerId, fCard.id);
      }
      updated = store.getRoom(room.code)!;
      selectFranchiseSource(store, updated, writerId, "history-id-1");
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId)!;
      expect(movie.franchiseSourceMovieId).toBe("history-id-1");
    });

    it("checkAllMoviesReady does not advance if franchise card has no source and history exists", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      updated = {
        ...updated,
        movieHistory: [
          {
            id: "hist-1",
            playerId: otherWriterId,
            chosenCard: { id: "c1", type: "plot", text: "Plot" },
            randomCard: { id: "c2", type: "character", text: "Character" },
            notesPlayed: [],
            revealed: true,
            franchiseSourceMovieId: null,
          },
        ],
      };
      store.saveRoom(updated);
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      selectCard(store, updated, writerId, fCard.id);
      updated = store.getRoom(room.code)!;
      const noteGiverId = updated.noteGiverId!;
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const ow = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, ow.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).not.toBe("pitching");
    });

    it("checkAllMoviesReady advances if franchise card has no source but history is empty", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      const noteGiverId = updated.noteGiverId!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      selectCard(store, updated, writerId, fCard.id);
      updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const ow = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, ow.hand[0].id);
      updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.movieHistory).toEqual([]);
      expect(updated.phase).toBe("pitching");
    });

    it("checkAllMoviesReady advances when franchise card has source picked", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      const noteGiverId = updated.noteGiverId!;
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const ow = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, ow.hand[0].id);
      updated = store.getRoom(room.code)!;
      const otherMovie = updated.movies.find((m) => m.playerId === otherWriterId)!;
      updated = { ...updated, movieHistory: [{ ...otherMovie, id: "hist-1" }] };
      store.saveRoom(updated);
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(room.code)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      selectCard(store, updated, writerId, fCard.id);
      updated = store.getRoom(room.code)!;
      selectFranchiseSource(store, updated, writerId, "hist-1");
      updated = store.getRoom(room.code)!;
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
    });

    it("playAgain clears movieHistory", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      updated = {
        ...updated,
        movieHistory: [
          {
            id: "h1",
            playerId: playerIds[0],
            chosenCard: { id: "c1", type: "plot", text: "Plot" },
            randomCard: { id: "c2", type: "character", text: "Character" },
            notesPlayed: [],
            revealed: true,
            franchiseSourceMovieId: null,
          },
        ],
      };
      store.saveRoom(updated);
      playAgain(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.movieHistory).toEqual([]);
    });

    it("forceStart auto-picks franchise source for unprepared franchise holder", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      updated = {
        ...updated,
        movieHistory: [
          {
            id: "hist-1",
            playerId: otherWriterId,
            chosenCard: { id: "c1", type: "plot", text: "Plot" },
            randomCard: { id: "c2", type: "character", text: "Character" },
            notesPlayed: [],
            revealed: true,
            franchiseSourceMovieId: null,
          },
        ],
      };
      store.saveRoom(updated);
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
      const writerMovie = updated.movies.find((m) => m.playerId === writerId)!;
      expect(writerMovie.chosenCard.isFranchise).toBe(true);
      expect(writerMovie.franchiseSourceMovieId).toBe("hist-1");
    });
  });
});
