import type { Room, Player, Card, DeckType } from "@direct-to-video/shared";
import type { RoomStore } from "./rooms.js";
import { createTimer } from "./timer.js";
import { shuffle, drawFromDeck, substituteDraws } from "./card-ops.js";

function getWriterPlayers(room: Room): Player[] {
  return room.players.filter((p) => !p.isDisconnected);
}

export function startGame(store: RoomStore, room: Room): void {
  if (room.players.length < 2) throw new Error("Need at least 2 players");
  const filterFranchise = (cards: Card[]) =>
    !room.franchiseEnabled ? cards.filter((c) => !c.isFranchise) : cards;
  const plotDeck = filterFranchise(store.getCardsByType("plot"));
  const characterDeck = filterFranchise(store.getCardsByType("character"));
  const noteDeck = store.getCardsByType("note");
  const noteGiverOrder = shuffle(room.players.map((p) => p.id));
  const updated: Room = {
    ...room,
    phase: "setup",
    round: { current: 1 },
    noteGiverOrder,
    noteGiverIndex: 0,
    deck: { plot: plotDeck, character: characterDeck, note: noteDeck },
  };
  setupRound(store, updated);
}

export function setupRound(store: RoomStore, room: Room): void {
  const noteGiverId = pickNoteGiver(room);
  const { drawn: notes, remaining: noteRemaining } = drawFromDeck(
    store,
    room.deck.note,
    3,
    "note",
    room,
  );
  store.saveRoom({
    ...room,
    phase: "setup",
    noteGiverId,
    noteGiverNotes: notes,
    deck: { ...room.deck, note: noteRemaining },
    movies: [],
    timer: createTimer(45),
    pitchOrder: [],
    currentPitchIndex: 0,
    currentPitcherId: null,
    players: room.players.map((p) => ({
      ...p,
      isNoteGiver: p.id === noteGiverId,
      hand: [],
      chosenCard: null,
    })),
    votes: {},
    votingActive: false,
  });
}

function pickNoteGiver(room: Room): string {
  const connected = new Set(room.players.filter((p) => !p.isDisconnected).map((p) => p.id));
  let order = room.noteGiverOrder;
  let index = room.noteGiverIndex;
  for (let attempts = 0; attempts < order.length; attempts++) {
    const candidateId = order[index % order.length];
    if (connected.has(candidateId)) {
      room.noteGiverIndex = (index % order.length) + 1;
      return candidateId;
    }
    index++;
  }
  if (order.length === 0 || !connected.has(order[0])) {
    const connectedIds = Array.from(connected);
    if (connectedIds.length === 0) {
      throw new Error("No connected players to assign note-giver");
    }
    order = shuffle(connectedIds);
    room.noteGiverOrder = order;
    room.noteGiverIndex = 1;
    return order[0];
  }
  room.noteGiverIndex = 1;
  return order[0];
}

export function selectDeckType(
  store: RoomStore,
  room: Room,
  playerId: string,
  deckType: DeckType,
): void {
  if (room.phase !== "setup") throw new Error("Cannot select deck outside setup phase");
  const { drawn, remaining } = drawFromDeck(store, room.deck[deckType], 3, deckType, room);
  const updated: Room = {
    ...room,
    deck: { ...room.deck, [deckType]: remaining },
    players: room.players.map((p) => (p.id === playerId ? { ...p, hand: drawn } : p)),
  };
  checkAllWritersReady(store, updated);
}

function checkAllWritersReady(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  if (writers.every((w) => w.hand.length === 3)) {
    store.saveRoom({ ...room, phase: "card-selection" });
  } else {
    store.saveRoom(room);
  }
}

export function selectCard(store: RoomStore, room: Room, playerId: string, cardId: string): void {
  if (room.phase !== "card-selection" && room.phase !== "setup")
    throw new Error("Cannot select card outside card-selection phase");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not in hand");

  const { card: chosenCard, deck: deckAfterDraws } = substituteDraws(store, room.deck, card, room);

  const blindDeckType: DeckType = card.type === "plot" ? "character" : "plot";
  const { drawn: blindDrawn, remaining: blindRemaining } = drawFromDeck(
    store,
    deckAfterDraws[blindDeckType],
    1,
    blindDeckType,
    room,
  );
  const updatedDeck = {
    ...deckAfterDraws,
    [blindDeckType]: blindRemaining,
  };
  const blindCard = blindDrawn[0];

  const newMovie = {
    playerId,
    chosenCard,
    randomCard: blindCard,
    notesPlayed: [] as Card[],
    revealed: false,
  };

  const updatedRoom: Room = {
    ...room,
    deck: updatedDeck,
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, hand: p.hand.filter((c) => c.id !== cardId), chosenCard } : p,
    ),
    movies: [...room.movies.filter((m) => m.playerId !== playerId), newMovie],
  };

  checkAllMoviesReady(store, updatedRoom);
}

function checkAllMoviesReady(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  const readyWriters = writers.filter((w) =>
    room.movies.some(
      (m) => m.playerId === w.id && m.chosenCard.id !== "" && m.randomCard.id !== "",
    ),
  );
  if (readyWriters.length === writers.length) {
    startPitching(store, room);
  } else {
    store.saveRoom(room);
  }
}

export function forceStart(store: RoomStore, room: Room): void {
  if (room.phase !== "setup" && room.phase !== "card-selection") {
    throw new Error("Cannot force-start outside setup or card-selection phase");
  }
  let current = room;
  const writers = getWriterPlayers(current);
  for (const writer of writers) {
    const player = current.players.find((p) => p.id === writer.id)!;
    if (player.hand.length === 0) {
      selectDeckType(store, current, writer.id, "plot");
      current = store.getRoom(current.code)!;
    }
    const hasMovie = current.movies.some(
      (m) => m.playerId === writer.id && m.chosenCard.id !== "" && m.randomCard.id !== "",
    );
    if (!hasMovie) {
      const updatedPlayer = current.players.find((p) => p.id === writer.id)!;
      if (updatedPlayer.hand.length > 0) {
        selectCard(store, current, writer.id, updatedPlayer.hand[0].id);
        current = store.getRoom(current.code)!;
      }
    }
  }
}

export function startPitching(store: RoomStore, room: Room): void {
  const noteGiverIndex = room.players.findIndex((p) => p.id === room.noteGiverId);
  const writers = getWriterPlayers(room);
  const pitchOrder: string[] = [];
  for (let i = 1; i <= writers.length; i++) {
    const idx = (noteGiverIndex + i) % room.players.length;
    pitchOrder.push(room.players[idx].id);
  }
  pitchOrder.sort((a, b) => {
    const movieA = room.movies.find((m) => m.playerId === a);
    const movieB = room.movies.find((m) => m.playerId === b);
    const aFranchise = movieA?.chosenCard.isFranchise || movieA?.randomCard.isFranchise || false;
    const bFranchise = movieB?.chosenCard.isFranchise || movieB?.randomCard.isFranchise || false;
    const aIsNoteGiver = a === room.noteGiverId;
    const bIsNoteGiver = b === room.noteGiverId;
    if (aIsNoteGiver && !bIsNoteGiver) return 1;
    if (!aIsNoteGiver && bIsNoteGiver) return -1;
    if (aFranchise && !bFranchise) return 1;
    if (!aFranchise && bFranchise) return -1;
    return 0;
  });
  const firstPitcherId = pitchOrder[0];
  store.saveRoom({
    ...room,
    phase: "pitching",
    pitchOrder,
    currentPitchIndex: 0,
    currentPitcherId: firstPitcherId,
    movies: room.movies.map((m) => (m.playerId === firstPitcherId ? { ...m, revealed: true } : m)),
  });
}

export function revealMovie(store: RoomStore, room: Room, playerId: string): void {
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for player");
  store.saveRoom({
    ...room,
    movies: room.movies.map((m) => (m.playerId === playerId ? { ...m, revealed: true } : m)),
  });
}

export function endPitch(store: RoomStore, room: Room, _playerId: string): void {
  const nextIndex = room.currentPitchIndex + 1;
  if (nextIndex >= room.pitchOrder.length) {
    const allRevealed = room.movies.map((m) => ({ ...m, revealed: true }));
    store.saveRoom({
      ...room,
      phase: "round-end",
      currentPitcherId: null,
      timer: createTimer(15),
      movies: allRevealed,
      votingActive: true,
      votes: {},
    });
  } else {
    const nextPitcherId = room.pitchOrder[nextIndex];
    const movies = room.movies.map((m) =>
      m.playerId === nextPitcherId ? { ...m, revealed: true } : m,
    );
    store.saveRoom({
      ...room,
      currentPitchIndex: nextIndex,
      currentPitcherId: nextPitcherId,
      timer: createTimer(45),
      movies,
    });
  }
}

export function playNote(
  store: RoomStore,
  room: Room,
  noteCardId: string,
  pitcherId: string,
): void {
  if (room.phase !== "pitching") throw new Error("Can only play notes during pitching");
  const noteCard = room.noteGiverNotes.find((c) => c.id === noteCardId);
  if (!noteCard) throw new Error("Note card not in note-giver's hand");

  const { card: playedCard, deck: deckAfterDraws } = substituteDraws(
    store,
    room.deck,
    noteCard,
    room,
  );

  const { drawn, remaining } = drawFromDeck(store, deckAfterDraws.note, 1, "note", room);
  const refill = drawn[0] || null;
  store.saveRoom({
    ...room,
    noteGiverNotes: [
      ...room.noteGiverNotes.filter((c) => c.id !== noteCardId),
      ...(refill ? [refill] : []),
    ],
    deck: { ...deckAfterDraws, note: remaining },
    movies: room.movies.map((m) =>
      m.playerId === pitcherId ? { ...m, notesPlayed: [...m.notesPlayed, playedCard] } : m,
    ),
  });
}

export function castVote(store: RoomStore, room: Room, voterId: string, playerId: string): void {
  if (!room.votingActive) throw new Error("Voting is not active");
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for voted player");
  const voterIsPlayer = room.players.some((p) => p.id === voterId);
  if (voterIsPlayer && voterId === playerId) {
    throw new Error("Players cannot vote for themselves");
  }
  store.saveRoom({
    ...room,
    votes: { ...room.votes, [voterId]: playerId },
  });
}

export function tallyAndAdvance(store: RoomStore, room: Room): void {
  if (!room.votingActive) throw new Error("Voting is not active");
  const counts: Record<string, number> = {};
  for (const votedFor of Object.values(room.votes)) {
    counts[votedFor] = (counts[votedFor] || 0) + 1;
  }
  let maxVotes = 0;
  let winners: string[] = [];
  for (const [pid, c] of Object.entries(counts)) {
    if (c > maxVotes) {
      maxVotes = c;
      winners = [pid];
    } else if (c === maxVotes) {
      winners.push(pid);
    }
  }
  const roundWinnerId = winners.length === 1 ? winners[0] : null;

  const scored: Room = {
    ...room,
    players: room.players.map((p) => ({
      ...p,
      score: p.score + (counts[p.id] || 0),
    })),
    votes: {},
    votingActive: false,
    roundWinnerId,
  };

  if (scored.round.current >= scored.totalRounds) {
    store.saveRoom({ ...scored, phase: "game-end" });
  } else {
    nextRound(store, scored);
  }
}

export function nextRound(store: RoomStore, room: Room): void {
  const updated: Room = {
    ...room,
    phase: "setup",
    round: { ...room.round, current: room.round.current + 1 },
    players: room.players.map((p) => ({
      ...p,
      isNoteGiver: false,
      hand: [],
      chosenCard: null,
    })),
    noteGiverNotes: [],
    movies: [],
    pitchOrder: [],
    currentPitchIndex: 0,
    currentPitcherId: null,
    votes: {},
    votingActive: false,
  };
  setupRound(store, updated);
}

export function playAgain(store: RoomStore, room: Room): void {
  store.saveRoom({
    ...room,
    phase: "lobby",
    players: room.players.map((p) => ({
      ...p,
      isNoteGiver: false,
      score: 0,
      hand: [],
      chosenCard: null,
      isDisconnected: false,
    })),
    noteGiverId: null,
    currentPitcherId: null,
    noteGiverNotes: [],
    movies: [],
    timer: createTimer(45),
    round: { current: 0 },
    noteGiverOrder: [],
    noteGiverIndex: 0,
    pitchOrder: [],
    currentPitchIndex: 0,
    votes: {},
    votingActive: false,
    roundWinnerId: null,
  });
}
