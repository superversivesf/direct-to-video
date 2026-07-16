import { nanoid } from "nanoid";
import type { Room, Player, Card, CardType } from "@direct-to-video/shared";
import type { DbHandle } from "./db.js";

const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || "20", 10);
const MAX_ROOMS = parseInt(process.env.MAX_ROOMS || "20", 10);
const MAX_NAME_LENGTH = 20;

export function validateName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Name is required");
  if (trimmed.length > MAX_NAME_LENGTH) throw new Error(`Name must be ${MAX_NAME_LENGTH} characters or fewer`);
  if (!/^[a-zA-Z0-9 ]+$/.test(trimmed)) throw new Error("Name can only contain letters, numbers, and spaces");
  return trimmed;
}

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
    timer: { running: false, secondsRemaining: 45, pausedAt: null, pausedForNote: false, noteResumeAt: null },
    round: { current: 0, total: 0 },
    pitchOrder: [],
    currentPitchIndex: 0,
    votes: {},
    votingActive: false,
    roundWinnerId: null,
    franchiseEnabled: true,
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
  const name = validateName(hostName);
  const activeRooms = store.getAllCachedRooms().filter(r => r.phase !== "game-end").length;
  if (activeRooms >= MAX_ROOMS) throw new Error("Too many active rooms. Please try again later.");
  const code = generateRoomCode(store);
  const room = createEmptyRoom(code);
  const player = createPlayer(name, true);
  room.players.push(player);
  store.saveRoom(room);
  return { room, playerId: player.id };
}

export function joinRoom(store: RoomStore, code: string, name: string): { room: Room; playerId: string } {
  const validatedName = validateName(name);
  const room = store.getRoom(code);
  if (!room) throw new Error("Room not found");

  const existing = room.players.find(
    (p) => p.name.toLowerCase() === validatedName.toLowerCase()
  );
  if (existing) {
    store.saveRoom(room);
    return { room, playerId: existing.id };
  }

  if (room.players.length >= MAX_PLAYERS) throw new Error("Room is full");
  const player = createPlayer(validatedName, false);
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
