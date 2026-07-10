import { nanoid } from "nanoid";
import type { Room, Player, Card, CardType } from "@pitch-storm/shared";
import type { DbHandle } from "./db.js";

const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";

export function generateRoomCode(store: RoomStore): string {
  let code: string;
  let attempts = 0;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += VALID_CHARS[Math.floor(Math.random() * VALID_CHARS.length)];
    }
    attempts++;
    if (attempts > 1000) throw new Error("Failed to generate unique room code");
  } while (store.getRoom(code) !== null);
  return code;
}

function createEmptyRoom(code: string): Room {
  return {
    code,
    phase: "lobby",
    players: [],
    executiveId: null,
    currentPitcherId: null,
    deck: { plot: [], character: [], note: [] },
    executiveNotes: [],
    movies: [],
    timer: { running: false, secondsRemaining: 45, pausedAt: null },
    round: { current: 0, total: 0 },
    pitchOrder: [],
    currentPitchIndex: 0,
  };
}

function createPlayer(name: string, isHost: boolean): Player {
  return {
    id: nanoid(12),
    name,
    socketId: null,
    isExecutive: false,
    isHost,
    score: 0,
    hand: [],
    chosenCard: null,
    isDisconnected: false,
  };
}

export function createRoom(store: RoomStore, hostName: string): { room: Room; playerId: string } {
  const code = generateRoomCode(store);
  const room = createEmptyRoom(code);
  const player = createPlayer(hostName, true);
  room.players.push(player);
  store.saveRoom(room);
  return { room, playerId: player.id };
}

export function joinRoom(store: RoomStore, code: string, name: string): { room: Room; playerId: string } {
  const room = store.getRoom(code);
  if (!room) throw new Error("Room not found");

  const existingDisconnected = room.players.find(
    (p) => p.isDisconnected && p.name.toLowerCase() === name.toLowerCase()
  );
  if (existingDisconnected) {
    store.saveRoom(room);
    return { room, playerId: existingDisconnected.id };
  }

  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("Name already taken");
  }
  const player = createPlayer(name, false);
  room.players.push(player);
  store.saveRoom(room);
  return { room, playerId: player.id };
}

export class RoomStore {
  private cache = new Map<string, Room>();
  private dbHandle: DbHandle;

  constructor(dbHandle: DbHandle) {
    this.dbHandle = dbHandle;
  }

  getRoom(code: string): Room | null {
    if (this.cache.has(code)) {
      return this.cache.get(code)!;
    }
    const loaded = this.dbHandle.loadRoom(code);
    if (loaded) {
      this.cache.set(code, loaded);
      return loaded;
    }
    return null;
  }

  saveRoom(room: Room): void {
    this.cache.set(room.code, room);
    this.dbHandle.saveRoom(room.code, room);
  }

  loadFromDb(code: string): Room | null {
    return this.dbHandle.loadRoom(code);
  }

  removeFromCache(code: string): void {
    this.cache.delete(code);
  }

  getAllCachedRooms(): Room[] {
    return Array.from(this.cache.values());
  }

  getCardsByType(type: CardType): Card[] {
    return this.dbHandle.getCardDeck(this.dbHandle.db, type);
  }
}