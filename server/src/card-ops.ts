import type { Card, CardType, Room } from "@direct-to-video/shared";
import type { RoomStore } from "./rooms.js";

export function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function drawCards(
  deck: Card[],
  count: number,
  refillDeck?: Card[],
): { drawn: Card[]; remaining: Card[] } {
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

export function getRefillDeck(store: RoomStore, type: CardType, room: Room): Card[] {
  if (!room.franchiseEnabled) {
    return store.getCardsByType(type).filter((c) => !c.isFranchise);
  }
  return store.getCardsByType(type);
}

export function drawFromDeck(
  store: RoomStore,
  deck: Card[],
  count: number,
  type: CardType,
  room: Room,
): { drawn: Card[]; remaining: Card[] } {
  const refill = getRefillDeck(store, type, room);
  return drawCards(deck, count, refill);
}

export function substituteDraws(
  store: RoomStore,
  deck: Room["deck"],
  card: Card,
  room: Room,
): { card: Card; deck: Room["deck"] } {
  if (!card.draws || card.draws.length === 0) {
    return { card, deck };
  }
  let updatedDeck = deck;
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
  return { card: { ...card, substitutedText: resolvedText }, deck: updatedDeck };
}
