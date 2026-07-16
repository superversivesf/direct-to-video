import type { Room, Player, Card, DeckType, CardType } from "@direct-to-video/shared";
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

function drawCards(deck: Card[], count: number, refillDeck?: Card[]): { drawn: Card[]; remaining: Card[] } {
  if (deck.length >= count) {
    const shuffled = shuffle(deck);
    return { drawn: shuffled.slice(0, count), remaining: shuffled.slice(count) };
  }
  if (refillDeck && refillDeck.length > 0) {
    const refilled = shuffle([...deck, ...refillDeck]);
    return { drawn: refilled.slice(0, count), remaining: refilled.slice(count) };
  }
  return { drawn: shuffle(deck), remaining: [] };
}

function getWriterPlayers(room: Room): Player[] {
  return room.players.filter((p) => p.id !== room.executiveId && !p.isDisconnected);
}

export function startGame(store: RoomStore, room: Room): void {
  if (room.players.length < 2) throw new Error("Need at least 2 players");
  const filterFranchise = (cards: Card[]) => !room.franchiseEnabled ? cards.filter(c => !c.isFranchise) : cards;
  const plotDeck = filterFranchise(store.getCardsByType("plot"));
  const characterDeck = filterFranchise(store.getCardsByType("character"));
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

function getRefillDeck(store: RoomStore, type: CardType, room: Room): Card[] {
  if (!room.franchiseEnabled) {
    return store.getCardsByType(type).filter(c => !c.isFranchise);
  }
  return store.getCardsByType(type);
}

function drawFromDeck(store: RoomStore, deck: Card[], count: number, type: CardType, room: Room): { drawn: Card[]; remaining: Card[] } {
  const refill = getRefillDeck(store, type, room);
  return drawCards(deck, count, refill);
}

export function setupRound(store: RoomStore, room: Room): void {
  const { drawn: notes, remaining: noteRemaining } = drawFromDeck(store, room.deck.note, 3, "note", room);
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
  const { drawn, remaining } = drawFromDeck(store, room.deck[deckType], 3, deckType, room);
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
    for (const draw of card.draws) {
      for (let i = 0; i < draw.count; i++) {
        const { drawn, remaining } = drawFromDeck(store, updatedDeck[draw.deck], 1, draw.deck, room);
        updatedDeck = { ...updatedDeck, [draw.deck]: remaining };
        if (drawn[0]) {
          resolvedText = resolvedText.replace("____", drawn[0].text);
        }
      }
    }
    chosenCard = { ...card, substitutedText: resolvedText };
  }

  const blindDeckType: DeckType = card.type === "plot" ? "character" : "plot";
  const { drawn: blindDrawn, remaining: blindRemaining } = drawFromDeck(store, updatedDeck[blindDeckType], 1, blindDeckType, room);
  updatedDeck = { ...updatedDeck, [blindDeckType]: blindRemaining };
  const blindCard = blindDrawn[0];

  const newMovie = {
    playerId,
    chosenCard,
    randomCard: blindCard,
    notesPlayed: [] as Card[],
    revealed: false,
  };

  let updatedRoom: Room = {
    ...room,
    deck: updatedDeck,
    players: room.players.map((p) =>
      p.id === playerId
        ? { ...p, hand: p.hand.filter((c) => c.id !== cardId), chosenCard }
        : p
    ),
    movies: [
      ...room.movies.filter((m) => m.playerId !== playerId),
      newMovie,
    ],
  };

  checkAllMoviesReady(store, updatedRoom);
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
  pitchOrder.sort((a, b) => {
    const movieA = room.movies.find(m => m.playerId === a);
    const movieB = room.movies.find(m => m.playerId === b);
    const aFranchise = movieA?.chosenCard.isFranchise || movieA?.randomCard.isFranchise || false;
    const bFranchise = movieB?.chosenCard.isFranchise || movieB?.randomCard.isFranchise || false;
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
    movies: room.movies.map((m) =>
      m.playerId === firstPitcherId ? { ...m, revealed: true } : m
    ),
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
  if (nextIndex >= room.pitchOrder.length) {
    const allRevealed = room.movies.map((m) => ({ ...m, revealed: true }));
    store.saveRoom({ ...room, phase: "round-end", currentPitcherId: null, timer: createTimer(45), movies: allRevealed });
  } else {
    const nextPitcherId = room.pitchOrder[nextIndex];
    const movies = room.movies.map((m) =>
      m.playerId === nextPitcherId ? { ...m, revealed: true } : m
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
        const { drawn, remaining } = drawFromDeck(store, updatedDeck[draw.deck], 1, draw.deck, room);
        updatedDeck = { ...updatedDeck, [draw.deck]: remaining };
        if (drawn[0]) {
          resolvedText = resolvedText.replace("____", drawn[0].text);
        }
      }
    }
    playedCard = { ...noteCard, substitutedText: resolvedText };
  }

  const { drawn, remaining } = drawFromDeck(store, updatedDeck.note, 1, "note", room);
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

export function selectWinner(store: RoomStore, room: Room, playerId: string, hasAudience: boolean = false): void {
  if (room.phase !== "round-end") throw new Error("Can only select winner during round-end");
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for player");

  if (hasAudience && room.votingActive) {
    const votes = { ...room.votes, [room.executiveId!]: playerId };
    store.saveRoom({
      ...room,
      votes,
      timer: createTimer(10),
    });
    return;
  }

  const noteGiven = movie.notesPlayed.length > 0 ? movie.notesPlayed[movie.notesPlayed.length - 1] : null;

  let updated: Room = {
    ...room,
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, score: p.score + 1 } : p
    ),
    votes: {},
    votingActive: false,
    roundWinnerId: playerId,
  };

  if (!noteGiven && updated.deck.note.length > 0) {
    const { remaining } = drawFromDeck(store, updated.deck.note, 1, "note", updated);
    updated = { ...updated, deck: { ...updated.deck, note: remaining } };
  }

  if (updated.round.current >= updated.round.total) {
    store.saveRoom({ ...updated, phase: "game-end" });
  } else {
    nextRound(store, updated);
  }
}

export function startVoting(store: RoomStore, room: Room): void {
  if (room.phase !== "round-end") throw new Error("Can only start voting during round-end");
  if (room.votingActive) throw new Error("Voting is already active");
  store.saveRoom({
    ...room,
    votingActive: true,
    votes: {},
    timer: createTimer(30),
  });
}

export function castVote(store: RoomStore, room: Room, voterId: string, playerId: string): void {
  if (!room.votingActive) throw new Error("Voting is not active");
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("No movie found for voted player");
  store.saveRoom({
    ...room,
    votes: { ...room.votes, [voterId]: playerId },
  });
}

export function tallyVotes(room: Room): string {
  const counts: Record<string, number> = {};
  for (const [voterId, votedFor] of Object.entries(room.votes)) {
    const weight = voterId === room.executiveId ? 2 : 1;
    counts[votedFor] = (counts[votedFor] || 0) + weight;
  }
  let maxVotes = 0;
  let winners: string[] = [];
  for (const [playerId, voteCount] of Object.entries(counts)) {
    if (voteCount > maxVotes) {
      maxVotes = voteCount;
      winners = [playerId];
    } else if (voteCount === maxVotes) {
      winners.push(playerId);
    }
  }
  if (winners.length === 0) return "";
  if (winners.length === 1) return winners[0];
  const execVote = room.votes[room.executiveId || ""];
  if (execVote && winners.includes(execVote)) return execVote;
  return winners[Math.floor(Math.random() * winners.length)];
}

export function endVoting(store: RoomStore, room: Room): string {
  if (!room.votingActive) throw new Error("Voting is not active");
  const winnerId = tallyVotes(room);
  store.saveRoom({ ...room, votingActive: false, timer: createTimer(45) });
  if (winnerId) {
    selectWinner(store, store.getRoom(room.code)!, winnerId, false);
  }
  return winnerId;
}

export function nextRound(store: RoomStore, room: Room): void {
  const currentExecIndex = room.players.findIndex((p) => p.id === room.executiveId);
  let nextExecIndex = (currentExecIndex + 1) % room.players.length;
  while (nextExecIndex !== currentExecIndex && room.players[nextExecIndex].isDisconnected) {
    nextExecIndex = (nextExecIndex + 1) % room.players.length;
  }
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
    votes: {},
    votingActive: false,
    roundWinnerId: null,
  });
}
