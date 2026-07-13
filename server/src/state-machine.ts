import type { Room, Player, Card, CardType, DeckType } from "@pitch-storm/shared";
import type { RoomStore } from "./rooms.js";
import { createTimer } from "./timer.js";

function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCards(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  const shuffled = shuffle(deck);
  return { drawn: shuffled.slice(0, count), remaining: shuffled.slice(count) };
}

function getWriterPlayers(room: Room): Player[] {
  return room.players.filter((p) => p.id !== room.executiveId);
}

export function startGame(store: RoomStore, room: Room): void {
  if (room.players.length < 2) throw new Error("Need at least 2 players");
  const plotDeck = store.getCardsByType("plot");
  const characterDeck = store.getCardsByType("character");
  const noteDeck = store.getCardsByType("note");
  const updated: Room = {
    ...room,
    phase: "setup",
    round: { current: 1, total: room.players.length },
    executiveId: room.players[0].id,
    deck: { plot: plotDeck, character: characterDeck, note: noteDeck },
  };
  updated.players = updated.players.map((p) => ({
    ...p,
    isExecutive: p.id === updated.executiveId,
  }));
  setupRound(store, updated);
}

export function setupRound(store: RoomStore, room: Room): void {
  const { drawn: notes, remaining: noteRemaining } = drawCards(room.deck.note, 3);
  store.saveRoom({
    ...room,
    phase: "setup",
    executiveNotes: notes,
    deck: { ...room.deck, note: noteRemaining },
    movies: [],
    timer: createTimer(45),
    pitchOrder: [],
    currentPitchIndex: 0,
    currentPitcherId: null,
  });
}

export function selectDeckType(store: RoomStore, room: Room, playerId: string, deckType: DeckType): void {
  if (room.phase !== "setup") throw new Error("Cannot select deck outside setup phase");
  if (playerId === room.executiveId) throw new Error("Executive cannot draw writer cards");
  const { drawn, remaining } = drawCards(room.deck[deckType], 3);
  const updated: Room = {
    ...room,
    deck: { ...room.deck, [deckType]: remaining },
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, hand: drawn } : p
    ),
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
  if (room.phase !== "card-selection" && room.phase !== "setup") throw new Error("Cannot select card outside card-selection phase");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not in hand");

  let chosenCard = { ...card };
  let updatedDeck = room.deck;

  if (card.draws && card.draws.length > 0) {
    let resolvedText = card.text;
    let drawIndex = 0;
    for (const draw of card.draws) {
      for (let i = 0; i < draw.count; i++) {
        const { drawn, remaining } = drawCards(updatedDeck[draw.deck], 1);
        updatedDeck = { ...updatedDeck, [draw.deck]: remaining };
        if (drawn[0]) {
          resolvedText = resolvedText.replace("____", drawn[0].text);
          drawIndex++;
        }
      }
    }
    chosenCard = { ...card, substitutedText: resolvedText };
  }

  store.saveRoom({
    ...room,
    deck: updatedDeck,
    players: room.players.map((p) =>
      p.id === playerId
        ? { ...p, hand: p.hand.filter((c) => c.id !== cardId), chosenCard }
        : p
    ),
  });
}

export function drawBlindCard(store: RoomStore, room: Room, playerId: string, deckType: DeckType): void {
  if (room.phase !== "card-selection" && room.phase !== "setup") throw new Error("Cannot draw blind card outside card-selection phase");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  if (!player.chosenCard) throw new Error("Must select a card before drawing blind");
  const handDeckType = player.chosenCard.type;
  if (deckType === handDeckType) throw new Error(`Blind draw must be from the ${handDeckType === "plot" ? "character" : "plot"} deck, not the ${handDeckType} deck`);
  const { drawn, remaining } = drawCards(room.deck[deckType], 1);
  const blindCard = drawn[0];
  const newMovie = {
    playerId,
    chosenCard: player.chosenCard,
    randomCard: blindCard,
    notesPlayed: [] as Card[],
    revealed: false,
  };
  const updated: Room = {
    ...room,
    deck: { ...room.deck, [deckType]: remaining },
    movies: [
      ...room.movies.filter((m) => m.playerId !== playerId),
      newMovie,
    ],
  };
  checkAllMoviesReady(store, updated);
}

function checkAllMoviesReady(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  const readyWriters = writers.filter((w) =>
    room.movies.some(
      (m) =>
        m.playerId === w.id &&
        m.chosenCard.id !== "" &&
        m.randomCard.id !== ""
    )
  );
  if (readyWriters.length === writers.length) {
    startPitching(store, room);
  } else {
    store.saveRoom(room);
  }
}

export function startPitching(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  const execIndex = room.players.findIndex((p) => p.id === room.executiveId);
  const pitchOrder: string[] = [];
  for (let i = 1; i <= writers.length; i++) {
    const idx = (execIndex + i) % room.players.length;
    pitchOrder.push(room.players[idx].id);
  }
  store.saveRoom({
    ...room,
    phase: "pitching",
    pitchOrder,
    currentPitchIndex: 0,
    currentPitcherId: pitchOrder[0],
  });
}

export function revealMovie(store: RoomStore, room: Room, playerId: string): void {
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for player");
  store.saveRoom({
    ...room,
    movies: room.movies.map((m) =>
      m.playerId === playerId ? { ...m, revealed: true } : m
    ),
  });
}

export function endPitch(store: RoomStore, room: Room, playerId: string): void {
  const nextIndex = room.currentPitchIndex + 1;
  const allRevealed = room.movies.map((m) => ({ ...m, revealed: true }));
  if (nextIndex >= room.pitchOrder.length) {
    store.saveRoom({ ...room, phase: "round-end", currentPitcherId: null, timer: createTimer(45), movies: allRevealed });
  } else {
    store.saveRoom({
      ...room,
      currentPitchIndex: nextIndex,
      currentPitcherId: room.pitchOrder[nextIndex],
      timer: createTimer(45),
      movies: allRevealed,
    });
  }
}

export function playNote(store: RoomStore, room: Room, noteCardId: string, pitcherId: string): void {
  if (room.phase !== "pitching") throw new Error("Can only play notes during pitching");
  const noteCard = room.executiveNotes.find((c) => c.id === noteCardId);
  if (!noteCard) throw new Error("Note card not in Executive's hand");

  let playedCard = { ...noteCard };
  let updatedDeck = room.deck;

  if (noteCard.draws && noteCard.draws.length > 0) {
    let resolvedText = noteCard.text;
    for (const draw of noteCard.draws) {
      for (let i = 0; i < draw.count; i++) {
        const { drawn, remaining } = drawCards(updatedDeck[draw.deck], 1);
        updatedDeck = { ...updatedDeck, [draw.deck]: remaining };
        if (drawn[0]) {
          resolvedText = resolvedText.replace("____", drawn[0].text);
        }
      }
    }
    playedCard = { ...noteCard, substitutedText: resolvedText };
  }

  const { drawn, remaining } = drawCards(updatedDeck.note, 1);
  const refill = drawn[0] || null;
  store.saveRoom({
    ...room,
    executiveNotes: [
      ...room.executiveNotes.filter((c) => c.id !== noteCardId),
      ...(refill ? [refill] : []),
    ],
    deck: { ...updatedDeck, note: remaining },
    movies: room.movies.map((m) =>
      m.playerId === pitcherId ? { ...m, notesPlayed: [...m.notesPlayed, playedCard] } : m
    ),
  });
}

export function selectWinner(store: RoomStore, room: Room, playerId: string): void {
  if (room.phase !== "round-end") throw new Error("Can only select winner during round-end");
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for player");
  const noteGiven = movie.notesPlayed.length > 0 ? movie.notesPlayed[movie.notesPlayed.length - 1] : null;

  let updated: Room = {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, score: p.score + 1 } : p
    ),
  };

  if (!noteGiven && updated.deck.note.length > 0) {
    const { remaining } = drawCards(updated.deck.note, 1);
    updated = { ...updated, deck: { ...updated.deck, note: remaining } };
  }

  if (updated.round.current >= updated.round.total) {
    store.saveRoom({ ...updated, phase: "game-end" });
  } else {
    nextRound(store, updated);
  }
}

export function nextRound(store: RoomStore, room: Room): void {
  const currentExecIndex = room.players.findIndex((p) => p.id === room.executiveId);
  const nextExecIndex = (currentExecIndex + 1) % room.players.length;
  const nextExecId = room.players[nextExecIndex].id;
  const updated: Room = {
    ...room,
    phase: "setup",
    round: { ...room.round, current: room.round.current + 1 },
    executiveId: nextExecId,
    players: room.players.map((p) => ({
      ...p,
      isExecutive: p.id === nextExecId,
      hand: [],
      chosenCard: null,
    })),
    executiveNotes: [],
    movies: [],
    pitchOrder: [],
    currentPitchIndex: 0,
    currentPitcherId: null,
  };
  setupRound(store, updated);
}

export function playAgain(store: RoomStore, room: Room): void {
  store.saveRoom({
    ...room,
    phase: "lobby",
    players: room.players.map((p) => ({
      ...p,
      isExecutive: false,
      score: 0,
      hand: [],
      chosenCard: null,
      isDisconnected: false,
    })),
    executiveId: null,
    currentPitcherId: null,
    executiveNotes: [],
    movies: [],
    timer: createTimer(45),
    round: { current: 0, total: 0 },
    pitchOrder: [],
    currentPitchIndex: 0,
  });
}