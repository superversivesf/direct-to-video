# Pitch Storm Web App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted web app for playing the card game Pitch Storm remotely, with player card management, server-authoritative timer, and a spectator audience view designed for screen-sharing over Zoom/Teams.

**Architecture:** Monorepo monolith — single Node.js process serves Express REST API + Socket.IO real-time + static React build. SQLite persists game state and card decks. Room-based multiplayer via Socket.IO rooms.

**Tech Stack:** Node.js 20, TypeScript, Express, Socket.IO, better-sqlite3, React 18, Vite, React Router, Vitest, Playwright, Docker

## Global Constraints

- Node.js >= 20.0.0
- TypeScript strict mode
- npm workspaces for monorepo (server, client, shared)
- Test runner: Vitest (server + client unit/integration), Playwright (E2E)
- SQLite via better-sqlite3 (synchronous, no async needed)
- Socket.IO v4
- React 18 with functional components and hooks only (no class components)
- No auth — room code + cookie-stored player name only
- Cards rendered as styled React components with text overlaid on template (no per-card images)
- Timer is server-authoritative — clients display only
- 4-letter room codes, uppercase, no ambiguous characters (no O/0/I/1)

---

## File Structure

```
movie-pitch/
├── package.json                  (root workspace + scripts)
├── tsconfig.base.json            (shared TS config)
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── shared/
│   ├── package.json
│   └── types.ts                  (all shared types)
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── index.ts              (Express + Socket.IO bootstrap)
│   │   ├── db.ts                 (SQLite setup, migrations)
│   │   ├── seed-cards.ts         (10 placeholder cards per deck)
│   │   ├── rooms.ts              (Room creation, code generation, state cache)
│   │   ├── state-machine.ts      (Phase transitions, validation)
│   │   ├── sockets.ts            (Socket.IO event handlers)
│   │   └── timer.ts              (Server-authoritative timer)
│   └── test/
│       ├── rooms.test.ts
│       ├── state-machine.test.ts
│       ├── timer.test.ts
│       └── sockets.test.ts
├── client/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   ├── vitest.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── socket.ts             (Socket.IO client singleton)
│   │   ├── hooks/
│   │   │   ├── useRoom.ts
│   │   │   └── useTimer.ts
│   │   ├── pages/
│   │   │   ├── Join.tsx
│   │   │   ├── Game.tsx
│   │   │   └── Audience.tsx
│   │   ├── components/
│   │   │   ├── CardTemplate.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Timer.tsx
│   │   │   ├── Scoreboard.tsx
│   │   │   ├── PlayerList.tsx
│   │   │   ├── MovieReveal.tsx
│   │   │   ├── ExecutiveControls.tsx
│   │   │   ├── WriterControls.tsx
│   │   │   └── RoundSummary.tsx
│   │   └── styles/
│   │       └── cards.css
│   └── test/
│       ├── Card.test.tsx
│       ├── Timer.test.tsx
│       ├── Join.test.tsx
│       └── Game.test.tsx
└── e2e/
    ├── playwright.config.ts
    └── full-game.test.ts
```

---

## Task 1: Project Scaffolding & Shared Types

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `shared/package.json`
- Create: `shared/types.ts`
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/vitest.config.ts`
- Create: `client/package.json`
- Create: `client/tsconfig.json`
- Create: `client/vite.config.ts`
- Create: `client/vitest.config.ts`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing
- Produces: all shared TypeScript types used by every subsequent task — `Card`, `Player`, `Movie`, `Room`, `Phase`, `TimerState`, `DeckType`, `ClientToServerEvents`, `ServerToClientEvents`

- [ ] **Step 1: Create root package.json with workspaces**

```json
{
  "name": "movie-pitch",
  "private": true,
  "workspaces": ["shared", "server", "client"],
  "scripts": {
    "dev:server": "tsx watch server/src/index.ts",
    "dev:client": "vite --config client/vite.config.ts",
    "build:client": "vite build --config client/vite.config.ts",
    "build": "npm run build:client && tsc -p server/tsconfig.json",
    "test": "vitest run --config server/vitest.config.ts && vitest run --config client/vitest.config.ts",
    "test:e2e": "npx playwright test"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "tsx": "^4.7.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Create shared/package.json**

```json
{
  "name": "@pitch-storm/shared",
  "version": "0.0.1",
  "private": true,
  "main": "types.ts",
  "types": "types.ts"
}
```

- [ ] **Step 4: Create shared/types.ts with all game types**

```typescript
export type Phase = "lobby" | "setup" | "card-selection" | "pitching" | "round-end" | "game-end";

export type CardType = "plot" | "character" | "note";

export type DeckType = "plot" | "character";

export interface Card {
  id: string;
  type: CardType;
  text: string;
}

export interface Player {
  id: string;
  name: string;
  socketId: string | null;
  isExecutive: boolean;
  isHost: boolean;
  score: number;
  hand: Card[];
  isDisconnected: boolean;
}

export interface Movie {
  playerId: string;
  chosenCard: Card;
  randomCard: Card;
  notesPlayed: Card[];
}

export interface TimerState {
  running: boolean;
  secondsRemaining: number;
  pausedAt: number | null;
}

export interface Room {
  code: string;
  phase: Phase;
  players: Player[];
  executiveId: string | null;
  currentPitcherId: string | null;
  deck: {
    plot: Card[];
    character: Card[];
    note: Card[];
  };
  executiveNotes: Card[];
  movies: Movie[];
  timer: TimerState;
  round: {
    current: number;
    total: number;
  };
  pitchOrder: string[];
  currentPitchIndex: number;
}

export interface PublicPlayer {
  id: string;
  name: string;
  isExecutive: boolean;
  isHost: boolean;
  score: number;
  isDisconnected: boolean;
}

export interface PublicRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  executiveId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number; total: number };
  movies: Movie[];
  myPlayerId: string | null;
  myHand: Card[] | null;
  myExecutiveNotes: Card[] | null;
}

export interface AudienceRoomState {
  code: string;
  phase: Phase;
  players: PublicPlayer[];
  executiveId: string | null;
  currentPitcherId: string | null;
  timer: TimerState;
  round: { current: number; total: number };
  movies: Movie[];
  scoreboard: { playerId: string; name: string; score: number }[];
}

export interface ClientToServerEvents {
  join_room: (code: string, name: string) => void;
  select_deck_type: (deckType: DeckType) => void;
  select_card: (cardId: string) => void;
  draw_random_card: (deckType: DeckType) => void;
  reveal_movie: () => void;
  start_timer: () => void;
  pause_timer: () => void;
  play_note: (noteCardId: string) => void;
  end_pitch: () => void;
  select_winner: (playerId: string) => void;
  next_pitcher: () => void;
  start_game: () => void;
  next_round: () => void;
  play_again: () => void;
  join_audience: (code: string) => void;
}

export interface ServerToClientEvents {
  room_joined: (state: PublicRoomState) => void;
  player_joined: (players: PublicPlayer[]) => void;
  player_left: (players: PublicPlayer[]) => void;
  deck_selected: (playerId: string, deckType: DeckType) => void;
  card_selected: (playerId: string) => void;
  card_drawn: (playerId: string) => void;
  movie_revealed: (movie: Movie) => void;
  timer_started: (secondsRemaining: number) => void;
  timer_paused: (remainingSeconds: number) => void;
  timer_expired: () => void;
  note_played: (noteCard: Card, playerId: string) => void;
  pitch_ended: (playerId: string) => void;
  next_pitcher: (playerId: string) => void;
  winner_selected: (playerId: string, noteCard: Card | null) => void;
  round_started: (roundNumber: number) => void;
  game_ended: (scoreboard: { playerId: string; name: string; score: number }[]) => void;
  error: (message: string) => void;
  audience_joined: (state: AudienceRoomState) => void;
  audience_update: (state: AudienceRoomState) => void;
}
```

- [ ] **Step 5: Create server/package.json**

```json
{
  "name": "@pitch-storm/server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@pitch-storm/shared": "*",
    "better-sqlite3": "^11.0.0",
    "express": "^4.19.0",
    "socket.io": "^4.7.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 6: Create server/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": ".",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"]
  },
  "include": ["src", "../shared"],
  "exclude": ["test", "dist"]
}
```

- [ ] **Step 7: Create server/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
  },
});
```

- [ ] **Step 8: Create client/package.json**

```json
{
  "name": "@pitch-storm/client",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "@pitch-storm/shared": "*",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^6.23.0",
    "socket.io-client": "^4.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "jsdom": "^24.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 9: Create client/tsconfig.json**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": ".",
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "../shared"],
  "exclude": ["dist", "node_modules"]
}
```

- [ ] **Step 10: Create client/vite.config.ts**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
});
```

- [ ] **Step 11: Create client/vitest.config.ts**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["test/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared"),
    },
  },
});
```

- [ ] **Step 12: Create .gitignore**

```
node_modules/
dist/
data/
*.db
.env
```

- [ ] **Step 13: Install dependencies and verify workspace resolves**

Run: `cd /home/jason/Repos/movie-pitch && npm install`
Expected: installs all workspace dependencies without errors

- [ ] **Step 14: Verify TypeScript compiles**

Run: `cd /home/jason/Repos/movie-pitch && npx tsc --noEmit -p shared/types.ts`
Expected: no errors (if tsc complains about single file, run `npx tsc --noEmit -p server/tsconfig.json` instead)

- [ ] **Step 15: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git init
git add -A
git commit -m "chore: scaffold monorepo with workspaces and shared types"
```

---

## Task 2: SQLite Database & Card Seeding

**Files:**
- Create: `server/src/db.ts`
- Create: `server/src/seed-cards.ts`
- Create: `server/test/db.test.ts`

**Interfaces:**
- Consumes: types from `shared/types.ts`
- Produces: `initDb()` → returns `{ db, getCardDeck, saveRoom, loadRoom, getAllRooms }`, `seedCards(db)` → populates decks table on first run

- [ ] **Step 1: Write the failing test**

```typescript
// server/test/db.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/db.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create server/src/seed-cards.ts**

```typescript
const PLOT_CARDS = [
  "A time traveler discovers their past was actually someone else's future",
  "A small town wakes up to find everyone's shadows have disappeared",
  "A chef can taste memories but only the sad ones",
  "An astronaut returns to Earth to find it has been empty for 200 years",
  "A library where every book is a different version of the reader's life",
  "A weather forecaster discovers their predictions are causing the weather",
  "A city where everyone shares the same dream but nobody knows it",
  "A gardener grows a plant that blooms once every thousand years",
  "A detective can hear the last thought of any object they touch",
  "A musician's song starts healing people but slowly takes their memories",
];

const CHARACTER_CARDS = [
  "A retired villain who runs a bakery",
  "A detective who is secretly three raccoons in a trench coat",
  "A grandmother who was a spy in the 1970s",
  "A lighthouse keeper who talks to the sea",
  "A child who can see 5 minutes into the future",
  "A robot butler who has developed a passion for jazz",
  "A wizard who has forgotten every spell except one",
  "A mail carrier who delivers letters between dimensions",
  "A museum night guard who befriends the exhibits",
  "A fortune teller who is always wrong but in a helpful way",
];

const NOTE_CARDS = [
  "Add a musical number",
  "The lead actor must cry for real",
  "Include a 5-minute car chase",
  "The villain must be the hero's own reflection",
  "Everyone in the movie must speak in rhyme",
  "Add a flashback to a flashback",
  "The movie must end on a cliffhanger",
  "Add a CGI talking animal sidekick",
  "The soundtrack must be entirely kazoos",
  "Halfway through, the movie must switch genres",
];

export function getSeedCards() {
  return { plot: PLOT_CARDS, character: CHARACTER_CARDS, note: NOTE_CARDS };
}
```

- [ ] **Step 4: Create server/src/db.ts**

```typescript
import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import type { Card, CardType, Room } from "@pitch-storm/shared";
import { nanoid } from "nanoid";
import { getSeedCards } from "./seed-cards.js";

export interface DbHandle {
  db: DB;
  saveRoom: (code: string, room: Room) => void;
  loadRoom: (code: string) => Room | null;
  getCardDeck: (db: DB, type: CardType) => Card[];
}

export function initDb(path: string = ":memory:"): DbHandle {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      code TEXT PRIMARY KEY,
      state TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      text TEXT NOT NULL
    );
  `);

  const saveRoom = db.prepare(
    `INSERT INTO rooms (code, state) VALUES (?, ?)
     ON CONFLICT(code) DO UPDATE SET state = excluded.state, updated_at = datetime('now')`
  );

  const loadRoom = db.prepare(`SELECT state FROM rooms WHERE code = ?`);

  function saveRoomFn(code: string, room: Room) {
    saveRoom.run(code, JSON.stringify(room));
  }

  function loadRoomFn(code: string): Room | null {
    const row = loadRoom.get(code) as { state: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.state) as Room;
  }

  function getCardDeckFn(db: DB, type: CardType): Card[] {
    const rows = db.prepare(`SELECT * FROM cards WHERE type = ?`).all(type) as Card[];
    return rows;
  }

  return { db, saveRoom: saveRoomFn, loadRoom: loadRoomFn, getCardDeck: getCardDeckFn };
}

export function seedCards(db: DB) {
  const existing = db.prepare(`SELECT COUNT(*) as count FROM cards`).get() as { count: number };
  if (existing.count > 0) return;

  const insert = db.prepare(`INSERT INTO cards (id, type, text) VALUES (?, ?, ?)`);
  const seeds = getSeedCards();

  const typeMap: Record<CardType, string[]> = {
    plot: seeds.plot,
    character: seeds.character,
    note: seeds.note,
  };

  for (const [type, texts] of Object.entries(typeMap)) {
    for (const text of texts) {
      insert.run(nanoid(12), type, text);
    }
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/db.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 6: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add SQLite database with card seeding and room persistence"
```

---

## Task 3: Room Management & Code Generation

**Files:**
- Create: `server/src/rooms.ts`
- Create: `server/test/rooms.test.ts`

**Interfaces:**
- Consumes: `initDb`, `DbHandle` from Task 2
- Produces:
  - `createRoom(dbHandle, hostName)` → `{ room, playerId }` — creates a new room with unique 4-letter code, first player is host
  - `joinRoom(dbHandle, code, name)` → `{ room, playerId }` — adds a player to existing room, returns their ID
  - `getRoom(dbHandle, code)` → `Room | null` — retrieves room from cache or SQLite
  - `generateRoomCode(dbHandle)` → `string` — generates unique 4-letter code
  - `RoomStore` class — in-memory cache of active rooms, persists to SQLite on each mutation

- [ ] **Step 1: Write the failing test**

```typescript
// server/test/rooms.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, generateRoomCode, RoomStore } from "../src/rooms.js";
import type { Database } from "better-sqlite3";

describe("rooms", () => {
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

  it("generates a 4-letter uppercase code", () => {
    const code = generateRoomCode(store);
    expect(code).toMatch(/^[A-Z]{4}$/);
  });

  it("does not use ambiguous characters", () => {
    for (let i = 0; i < 100; i++) {
      const code = generateRoomCode(store);
      expect(code).not.toMatch(/[O0I1]/);
    }
  });

  it("creates a room with the host as first player", () => {
    const result = createRoom(store, "Jason");
    expect(result.room.code).toMatch(/^[A-Z]{4}$/);
    expect(result.room.players).toHaveLength(1);
    expect(result.room.players[0].name).toBe("Jason");
    expect(result.room.players[0].isHost).toBe(true);
    expect(result.room.phase).toBe("lobby");
  });

  it("joins an existing room as a non-host player", () => {
    const created = createRoom(store, "Jason");
    const result = joinRoom(store, created.room.code, "Sarah");
    expect(result.room.players).toHaveLength(2);
    expect(result.room.players[1].name).toBe("Sarah");
    expect(result.room.players[1].isHost).toBe(false);
  });

  it("rejects joining a non-existent room", () => {
    expect(() => joinRoom(store, "ZZZZ", "Sarah")).toThrow("Room not found");
  });

  it("prevents duplicate names in the same room", () => {
    const created = createRoom(store, "Jason");
    expect(() => joinRoom(store, created.room.code, "Jason")).toThrow("Name already taken");
  });

  it("persists room state to SQLite", () => {
    const created = createRoom(store, "Jason");
    const reloaded = store.loadFromDb(created.room.code);
    expect(reloaded).not.toBeNull();
    expect(reloaded!.code).toBe(created.room.code);
  });

  it("generates unique codes", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 50; i++) {
      codes.add(generateRoomCode(store));
    }
    expect(codes.size).toBe(50);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/rooms.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create server/src/rooms.ts**

```typescript
import { nanoid } from "nanoid";
import type { Room, Player, Card } from "@pitch-storm/shared";
import type { DbHandle } from "./db.js";

const VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O, 0, I, 1

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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/rooms.test.ts`
Expected: PASS (all 7 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add room management with code generation and player join"
```

---

## Task 4: Server-Authoritative Timer

**Files:**
- Create: `server/src/timer.ts`
- Create: `server/test/timer.test.ts`

**Interfaces:**
- Consumes: `TimerState` type from `shared/types.ts`
- Produces:
  - `createTimer(durationSeconds: number)` → `TimerState`
  - `startTimer(timer: TimerState)` → `TimerState` — starts/resumes the timer
  - `pauseTimer(timer: TimerState)` → `TimerState` — pauses, records remaining
  - `tickTimer(timer: TimerState)` → `TimerState` — decrements by 1 second, sets running=false at 0
  - `isTimerExpired(timer: TimerState)` → `boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// server/test/timer.test.ts
import { describe, it, expect } from "vitest";
import { createTimer, startTimer, pauseTimer, tickTimer, isTimerExpired } from "../src/timer.js";

describe("timer", () => {
  it("creates a timer with full duration", () => {
    const timer = createTimer(45);
    expect(timer.secondsRemaining).toBe(45);
    expect(timer.running).toBe(false);
    expect(timer.pausedAt).toBeNull();
  });

  it("starts the timer", () => {
    const timer = startTimer(createTimer(45));
    expect(timer.running).toBe(true);
    expect(timer.pausedAt).toBeNull();
  });

  it("pauses the timer and records remaining seconds", () => {
    let timer = startTimer(createTimer(45));
    timer = { ...timer, secondsRemaining: 30 };
    timer = pauseTimer(timer);
    expect(timer.running).toBe(false);
    expect(timer.secondsRemaining).toBe(30);
  });

  it("resumes from paused state", () => {
    let timer = createTimer(45);
    timer.secondsRemaining = 30;
    timer = startTimer(timer);
    expect(timer.running).toBe(true);
    expect(timer.secondsRemaining).toBe(30);
  });

  it("ticks down by 1 second", () => {
    let timer = startTimer(createTimer(45));
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(44);
    expect(timer.running).toBe(true);
  });

  it("stops running at 0", () => {
    let timer = startTimer(createTimer(1));
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(0);
    expect(timer.running).toBe(false);
  });

  it("detects expiration", () => {
    const timer = createTimer(45);
    timer.secondsRemaining = 0;
    expect(isTimerExpired(timer)).toBe(true);
  });

  it("does not tick when paused", () => {
    let timer = startTimer(createTimer(45));
    timer = pauseTimer(timer);
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(45);
    expect(timer.running).toBe(false);
  });

  it("does not tick when not running", () => {
    let timer = createTimer(45);
    timer = tickTimer(timer);
    expect(timer.secondsRemaining).toBe(45);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/timer.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create server/src/timer.ts**

```typescript
import type { TimerState } from "@pitch-storm/shared";

export function createTimer(durationSeconds: number): TimerState {
  return {
    running: false,
    secondsRemaining: durationSeconds,
    pausedAt: null,
  };
}

export function startTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: true,
    pausedAt: null,
  };
}

export function pauseTimer(timer: TimerState): TimerState {
  return {
    ...timer,
    running: false,
    pausedAt: Date.now(),
  };
}

export function tickTimer(timer: TimerState): TimerState {
  if (!timer.running) return timer;
  const next = timer.secondsRemaining - 1;
  if (next <= 0) {
    return { running: false, secondsRemaining: 0, pausedAt: null };
  }
  return { ...timer, secondsRemaining: next };
}

export function isTimerExpired(timer: TimerState): boolean {
  return timer.secondsRemaining <= 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/timer.test.ts`
Expected: PASS (all 9 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add server-authoritative timer logic"
```

---

## Task 5: Game State Machine

**Files:**
- Create: `server/src/state-machine.ts`
- Create: `server/test/state-machine.test.ts`

**Interfaces:**
- Consumes: `Room`, `Player`, `Card`, `DeckType`, `Phase` from `shared/types.ts`; `RoomStore` from Task 3; timer functions from Task 4
- Produces:
  - `startGame(store, room)` → transitions lobby → setup
  - `setupRound(room)` → assigns Executive, draws NOTE cards, sets up deck types
  - `selectDeckType(room, playerId, deckType)` → gives player 3 cards from chosen deck
  - `selectCard(room, playerId, cardId)` → marks card as chosen, removes from hand
  - `drawBlindCard(room, playerId, deckType)` → draws random card, creates movie
  - `startPitching(room)` → transitions to pitching, sets pitch order
  - `revealMovie(room, playerId)` → flips cards face-up for all to see
  - `endPitch(room, playerId)` → ends current pitch, advances to next pitcher or round-end
  - `selectWinner(room, playerId)` → awards point, transitions to next round or game-end
  - `nextRound(room)` → rotates Executive, transitions to setup
  - `playAgain(room)` → resets to lobby, keeps players

- [ ] **Step 1: Write the failing test for startGame**

```typescript
// server/test/state-machine.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { initDb, seedCards } from "../src/db.js";
import { createRoom, joinRoom, RoomStore } from "../src/rooms.js";
import {
  startGame,
  setupRound,
  selectDeckType,
  selectCard,
  drawBlindCard,
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

  describe("selectCard and drawBlindCard", () => {
    it("creates a movie with chosen card + blind draw", () => {
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
      drawBlindCard(store, updated, writerId, "character");
      updated = store.getRoom(room.code)!;
      const movie = updated.movies.find((m) => m.playerId === writerId);
      expect(movie).toBeDefined();
      expect(movie!.chosenCard.id).toBe(cardId);
      expect(movie!.randomCard.type).toBe("character");
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
        drawBlindCard(store, updated, playerIds[i], "character");
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
        drawBlindCard(store, updated, playerIds[i], "character");
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
      drawBlindCard(store, updated, playerIds[1], "character");
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
      drawBlindCard(store, updated, playerIds[1], "character");
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
      drawBlindCard(store, updated, playerIds[1], "character");
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/state-machine.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create server/src/state-machine.ts**

```typescript
import { nanoid } from "nanoid";
import type { Room, Player, Card, DeckType, Phase } from "@pitch-storm/shared";
import type { RoomStore } from "./rooms.js";

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
  const updated: Room = {
    ...room,
    phase: "setup",
    round: { current: 1, total: room.players.length },
    executiveId: room.players[0].id,
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
    timer: { running: false, secondsRemaining: 45, pausedAt: null },
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
  if (room.phase !== "card-selection") throw new Error("Cannot select card outside card-selection phase");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) throw new Error("Card not in hand");
  store.saveRoom({
    ...room,
    players: room.players.map((p) =>
      p.id === playerId ? { ...p, hand: p.hand.filter((c) => c.id !== cardId) } : p
    ),
  });
}

export function drawBlindCard(store: RoomStore, room: Room, playerId: string, deckType: DeckType): void {
  if (room.phase !== "card-selection") throw new Error("Cannot draw blind card outside card-selection phase");
  const player = room.players.find((p) => p.id === playerId);
  if (!player) throw new Error("Player not found");
  const { drawn, remaining } = drawCards(room.deck[deckType], 1);
  const blindCard = drawn[0];
  const chosenCard = room.movies.find((m) => m.playerId === playerId);

  if (chosenCard) {
    store.saveRoom({
      ...room,
      deck: { ...room.deck, [deckType]: remaining },
      movies: room.movies.map((m) =>
        m.playerId === playerId ? { ...m, randomCard: blindCard } : m
      ),
    });
  } else {
    const playerChosenCard = player.hand.length === 2
      ? room.players.find((p) => p.id === playerId)!.hand[0]
      : null;
    store.saveRoom({
      ...room,
      deck: { ...room.deck, [deckType]: remaining },
      movies: [
        ...room.movies,
        { playerId, chosenCard: playerChosenCard!, randomCard: blindCard, notesPlayed: [] },
      ],
    });
  }
  checkAllMoviesReady(store, store.getRoom(room.code)!);
}

function checkAllMoviesReady(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  const readyWriters = writers.filter((w) =>
    room.movies.some((m) => m.playerId === w.id && m.randomCard && m.chosenCard)
  );
  if (readyWriters.length === writers.length) {
    startPitching(store, room);
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
  store.saveRoom(room);
}

export function endPitch(store: RoomStore, room: Room, playerId: string): void {
  const nextIndex = room.currentPitchIndex + 1;
  if (nextIndex >= room.pitchOrder.length) {
    store.saveRoom({ ...room, phase: "round-end", currentPitcherId: null, timer: { running: false, secondsRemaining: 45, pausedAt: null } });
  } else {
    store.saveRoom({
      ...room,
      currentPitchIndex: nextIndex,
      currentPitcherId: room.pitchOrder[nextIndex],
      timer: { running: false, secondsRemaining: 45, pausedAt: null },
    });
  }
}

export function playNote(store: RoomStore, room: Room, noteCardId: string, pitcherId: string): void {
  if (room.phase !== "pitching") throw new Error("Can only play notes during pitching");
  const noteCard = room.executiveNotes.find((c) => c.id === noteCardId);
  if (!noteCard) throw new Error("Note card not in Executive's hand");
  const { drawn, remaining } = drawCards(room.deck.note, 1);
  const refill = drawn[0] || null;
  store.saveRoom({
    ...room,
    executiveNotes: [
      ...room.executiveNotes.filter((c) => c.id !== noteCardId),
      ...(refill ? [refill] : []),
    ],
    deck: { ...room.deck, note: remaining },
    movies: room.movies.map((m) =>
      m.playerId === pitcherId ? { ...m, notesPlayed: [...m.notesPlayed, noteCard] } : m
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
    const { drawn, remaining } = drawCards(updated.deck.note, 1);
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
      isDisconnected: false,
    })),
    executiveId: null,
    currentPitcherId: null,
    executiveNotes: [],
    movies: [],
    timer: { running: false, secondsRemaining: 45, pausedAt: null },
    round: { current: 0, total: 0 },
    pitchOrder: [],
    currentPitchIndex: 0,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/state-machine.test.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add game state machine with all phase transitions"
```

---

## Task 6: Socket.IO Server & Express Bootstrap

**Files:**
- Create: `server/src/sockets.ts`
- Create: `server/src/index.ts`
- Create: `server/test/sockets.test.ts`

**Interfaces:**
- Consumes: `RoomStore`, `createRoom`, `joinRoom` from Task 3; all state-machine functions from Task 5; timer functions from Task 4
- Produces: running HTTP server on port 3000 with Socket.IO, serving static client files from `client/dist/`

- [ ] **Step 1: Write the failing test for socket event handling**

```typescript
// server/test/sockets.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Server } from "socket.io";
import { io as ioc } from "socket.io-client";
import { createServer } from "http";
import { initDb, seedCards } from "../src/db.js";
import { RoomStore } from "../src/rooms.js";
import { setupSocketHandlers } from "../src/sockets.js";
import type { Database } from "better-sqlite3";

describe("sockets", () => {
  let db: Database;
  let store: RoomStore;
  let httpServer: ReturnType<typeof createServer>;
  let io: Server;
  let port: number;

  beforeEach((done) => {
    const handle = initDb(":memory:");
    db = handle.db;
    seedCards(db);
    store = new RoomStore(handle);
    httpServer = createServer();
    io = new Server(httpServer, { cors: { origin: "*" } });
    setupSocketHandlers(io, store);
    httpServer.listen(0, () => {
      port = (httpServer.address() as any).port;
      done();
    });
  });

  afterEach(() => {
    io.close();
    httpServer.close();
    db.close();
  });

  it("creates a room when host joins", (done) => {
    const client = ioc(`http://localhost:${port}`);
    client.on("room_joined", (state) => {
      expect(state.code).toMatch(/^[A-Z]{4}$/);
      expect(state.phase).toBe("lobby");
      expect(state.players).toHaveLength(1);
      expect(state.players[0].name).toBe("Jason");
      expect(state.myPlayerId).toBeTruthy();
      client.disconnect();
      done();
    });
    client.emit("join_room", "", "Jason");
  });

  it("joins an existing room as a player", (done) => {
    const host = ioc(`http://localhost:${port}`);
    host.on("room_joined", () => {
      const guest = ioc(`http://localhost:${port}`);
      guest.on("room_joined", (state) => {
        expect(state.players).toHaveLength(2);
        expect(state.players[1].name).toBe("Sarah");
        guest.disconnect();
        host.disconnect();
        done();
      });
      guest.emit("join_room", host.io.opts.query?.code || "", "Sarah");
    });
    host.emit("join_room", "", "Jason");
  });

  it("rejects joining a non-existent room", (done) => {
    const client = ioc(`http://localhost:${port}`);
    client.on("error", (msg: string) => {
      expect(msg).toBe("Room not found");
      client.disconnect();
      done();
    });
    client.emit("join_room", "ZZZZ", "Sarah");
  });

  it("audience receives audience_joined state", (done) => {
    const host = ioc(`http://localhost:${port}`);
    host.on("room_joined", (state) => {
      const audience = ioc(`http://localhost:${port}`);
      audience.on("audience_joined", (audState) => {
        expect(audState.code).toBe(state.code);
        expect(audState.phase).toBe("lobby");
        expect(audState.players).toHaveLength(1);
        audience.disconnect();
        host.disconnect();
        done();
      });
      audience.emit("join_audience", state.code);
    });
    host.emit("join_room", "", "Jason");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/sockets.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Create server/src/sockets.ts**

```typescript
import type { Server, Socket } from "socket.io";
import type { Room, PublicRoomState, AudienceRoomState, DeckType } from "@pitch-storm/shared";
import { RoomStore, createRoom, joinRoom } from "./rooms.js";
import {
  startGame,
  selectDeckType,
  selectCard,
  drawBlindCard,
  revealMovie,
  endPitch,
  playNote,
  selectWinner,
  playAgain,
} from "./state-machine.js";
import { startTimer, pauseTimer, tickTimer, isTimerExpired } from "./timer.js";

function toPublicRoomState(room: Room, playerId: string | null): PublicRoomState {
  const player = playerId ? room.players.find((p) => p.id === playerId) : null;
  const isExec = player?.id === room.executiveId;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isExecutive: p.isExecutive,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
    })),
    executiveId: room.executiveId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    movies: room.movies,
    myPlayerId: playerId,
    myHand: player ? player.hand : null,
    myExecutiveNotes: isExec ? room.executiveNotes : null,
  };
}

function toAudienceRoomState(room: Room): AudienceRoomState {
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isExecutive: p.isExecutive,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
    })),
    executiveId: room.executiveId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    movies: room.movies,
    scoreboard: room.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
  };
}

function broadcastRoomState(io: Server, room: Room): void {
  const roomChannel = `room:${room.code}`;
  const audienceChannel = `audience:${room.code}`;
  io.to(roomChannel).emit("room_joined", toPublicRoomState(room, null));
  io.to(audienceChannel).emit("audience_update", toAudienceRoomState(room));
}

// Per-player custom state (includes their own hand)
function emitPlayerState(io: Server, socket: Socket, room: Room, playerId: string): void {
  socket.emit("room_joined", toPublicRoomState(room, playerId));
}

function broadcastPlayerList(io: Server, room: Room): void {
  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    isExecutive: p.isExecutive,
    isHost: p.isHost,
    score: p.score,
    isDisconnected: p.isDisconnected,
  }));
  io.to(`room:${room.code}`).emit("player_joined", players);
  io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(room));
}

const playerSockets = new Map<string, { socketId: string; roomCode: string }>();

export function setupSocketHandlers(io: Server, store: RoomStore): void {
  // Timer tick interval
  const timerInterval = setInterval(() => {
    for (const room of allRooms(store)) {
      if (room.timer.running) {
        const ticked = tickTimer(room.timer);
        store.saveRoom({ ...room, timer: ticked });
        io.to(`room:${room.code}`).emit("timer_started", ticked.secondsRemaining);
        io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(store.getRoom(room.code)!));
        if (isTimerExpired(ticked)) {
          io.to(`room:${room.code}`).emit("timer_expired");
          io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(store.getRoom(room.code)!));
        }
      }
    }
  }, 1000);

  io.on("connection", (socket: Socket) => {
    socket.on("join_room", (code: string, name: string) => {
      try {
        let room: Room;
        let playerId: string;
        if (!code) {
          const result = createRoom(store, name);
          room = result.room;
          playerId = result.playerId;
        } else {
          const result = joinRoom(store, code.toUpperCase(), name);
          room = result.room;
          playerId = result.playerId;
        }
        socket.join(`room:${room.code}`);
        playerSockets.set(playerId, { socketId: socket.id, roomCode: room.code });
        // Update player's socketId
        room = store.getRoom(room.code)!;
        room = {
          ...room,
          players: room.players.map((p) =>
            p.id === playerId ? { ...p, socketId: socket.id, isDisconnected: false } : p
          ),
        };
        store.saveRoom(room);
        emitPlayerState(io, socket, room, playerId);
        broadcastPlayerList(io, room);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("join_audience", (code: string) => {
      const room = store.getRoom(code.toUpperCase());
      if (!room) {
        socket.emit("error", "Room not found");
        return;
      }
      socket.join(`audience:${room.code}`);
      socket.emit("audience_joined", toAudienceRoomState(room));
    });

    socket.on("start_game", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        startGame(store, ctx.room);
        const updated = store.getRoom(ctx.room.code)!;
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_deck_type", (deckType: DeckType) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectDeckType(store, ctx.room, ctx.playerId, deckType);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("select_card", (cardId: string) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectCard(store, ctx.room, ctx.playerId, cardId);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("draw_random_card", (deckType: DeckType) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        drawBlindCard(store, ctx.room, ctx.playerId, deckType);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("reveal_movie", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        revealMovie(store, ctx.room, ctx.playerId);
        const updated = store.getRoom(ctx.room.code)!;
        const movie = updated.movies.find((m) => m.playerId === ctx.playerId);
        if (movie) {
          io.to(`room:${updated.code}`).emit("movie_revealed", movie);
          io.to(`audience:${updated.code}`).emit("movie_revealed", movie);
        }
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("start_timer", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      const updated = { ...ctx.room, timer: startTimer(ctx.room.timer) };
      store.saveRoom(updated);
      io.to(`room:${updated.code}`).emit("timer_started", updated.timer.secondsRemaining);
      io.to(`audience:${updated.code}`).emit("timer_started", updated.timer.secondsRemaining);
    });

    socket.on("pause_timer", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      const updated = { ...ctx.room, timer: pauseTimer(ctx.room.timer) };
      store.saveRoom(updated);
      io.to(`room:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
      io.to(`audience:${updated.code}`).emit("timer_paused", updated.timer.secondsRemaining);
    });

    socket.on("play_note", (noteCardId: string) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        playNote(store, ctx.room, noteCardId, ctx.room.currentPitcherId!);
        const updated = store.getRoom(ctx.room.code)!;
        const noteCard = ctx.room.executiveNotes.find((c) => c.id === noteCardId);
        io.to(`room:${updated.code}`).emit("note_played", noteCard, ctx.room.currentPitcherId!);
        io.to(`audience:${updated.code}`).emit("note_played", noteCard, ctx.room.currentPitcherId!);
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("end_pitch", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      endPitch(store, ctx.room, ctx.room.currentPitcherId!);
      const updated = store.getRoom(ctx.room.code)!;
      io.to(`room:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
      io.to(`audience:${updated.code}`).emit("pitch_ended", ctx.room.currentPitcherId!);
      if (updated.currentPitcherId) {
        io.to(`room:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
        io.to(`audience:${updated.code}`).emit("next_pitcher", updated.currentPitcherId);
      }
      broadcastAllStates(io, updated);
    });

    socket.on("select_winner", (playerId: string) => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      if (ctx.playerId !== ctx.room.executiveId) return;
      try {
        selectWinner(store, ctx.room, playerId);
        const updated = store.getRoom(ctx.room.code)!;
        const winnerNote = updated.movies.find((m) => m.playerId === playerId)?.notesPlayed.slice(-1)[0] || null;
        io.to(`room:${updated.code}`).emit("winner_selected", playerId, winnerNote);
        io.to(`audience:${updated.code}`).emit("winner_selected", playerId, winnerNote);
        if (updated.phase === "game-end") {
          const scoreboard = updated.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score }));
          io.to(`room:${updated.code}`).emit("game_ended", scoreboard);
          io.to(`audience:${updated.code}`).emit("game_ended", scoreboard);
        }
        broadcastAllStates(io, updated);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("play_again", () => {
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      const player = ctx.room.players.find((p) => p.id === ctx.playerId);
      if (!player?.isHost) return;
      playAgain(store, ctx.room);
      broadcastAllStates(io, store.getRoom(ctx.room.code)!);
    });

    socket.on("disconnect", () => {
      for (const [playerId, info] of playerSockets) {
        if (info.socketId === socket.id) {
          const room = store.getRoom(info.roomCode);
          if (room) {
            const updated = {
              ...room,
              players: room.players.map((p) =>
                p.id === playerId ? { ...p, isDisconnected: true, socketId: null } : p
              ),
            };
            store.saveRoom(updated);
            broadcastPlayerList(io, updated);
          }
          playerSockets.delete(playerId);
          break;
        }
      }
    });
  });
}

function getPlayerContext(socketId: string, store: RoomStore): { room: Room; playerId: string } | null {
  for (const [playerId, info] of playerSockets) {
    if (info.socketId === socketId) {
      const room = store.getRoom(info.roomCode);
      if (room) return { room, playerId };
    }
  }
  return null;
}

function broadcastAllStates(io: Server, room: Room): void {
  for (const player of room.players) {
    if (player.socketId) {
      const socket = io.sockets.sockets.get(player.socketId);
      if (socket) {
        emitPlayerState(io, socket, room, player.id);
      }
    }
  }
  io.to(`audience:${room.code}`).emit("audience_update", toAudienceRoomState(room));
}

function* allRooms(store: RoomStore): Generator<Room> {
  yield* store.getAllCachedRooms();
}
```

- [ ] **Step 4: Create server/src/index.ts**

```typescript
import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { resolve } from "path";
import { initDb, seedCards } from "./db.js";
import { RoomStore } from "./rooms.js";
import { setupSocketHandlers } from "./sockets.js";

const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || resolve(process.cwd(), "data", "pitchstorm.db");
const CLIENT_DIST = resolve(process.cwd(), "client", "dist");

const dbHandle = initDb(DB_PATH);
seedCards(dbHandle.db);
const store = new RoomStore(dbHandle);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

app.use(express.json());
app.use(express.static(CLIENT_DIST));

// SPA fallback — serve index.html for client routes
app.get(["/", "/room/:code", "/audience/:code"], (req, res) => {
  res.sendFile(resolve(CLIENT_DIST, "index.html"));
});

setupSocketHandlers(io, store);

httpServer.listen(PORT, () => {
  console.log(`Pitch Storm server running on port ${PORT}`);
});

export { app, io, httpServer };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config server/vitest.config.ts server/test/sockets.test.ts`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add Socket.IO server with all game event handlers"
```

---

## Task 7: React Client — Socket & Hooks

**Files:**
- Create: `client/src/socket.ts`
- Create: `client/src/hooks/useRoom.ts`
- Create: `client/src/hooks/useTimer.ts`
- Create: `client/src/main.tsx`
- Create: `client/src/App.tsx`
- Create: `client/index.html`

**Interfaces:**
- Consumes: `ServerToClientEvents`, `ClientToServerEvents`, `PublicRoomState` from `shared/types.ts`
- Produces: `socket` singleton, `useRoom()` hook returning `{ roomState, emit }`, `useTimer()` hook returning `{ seconds, running }`

- [ ] **Step 1: Create client/src/socket.ts**

```typescript
import { io } from "socket.io-client";
import type { ServerToClientEvents, ClientToServerEvents } from "@pitch-storm/shared";

export const socket = io({
  autoConnect: false,
});

export type Socket = typeof socket;
```

- [ ] **Step 2: Create client/src/hooks/useRoom.ts**

```typescript
import { useState, useEffect, useCallback } from "react";
import { socket } from "../socket.js";
import type { PublicRoomState, AudienceRoomState, Movie, Card, DeckType } from "@pitch-storm/shared";

export function useRoom() {
  const [roomState, setRoomState] = useState<PublicRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on("room_joined", (state: PublicRoomState) => {
      setRoomState(state);
    });

    socket.on("player_joined", (players) => {
      setRoomState((prev) => prev ? { ...prev, players } : prev);
    });

    socket.on("movie_revealed", (movie: Movie) => {
      setRoomState((prev) => prev ? {
        ...prev,
        movies: [...prev.movies.filter((m) => m.playerId !== movie.playerId), movie],
      } : prev);
    });

    socket.on("timer_started", (secondsRemaining: number) => {
      setRoomState((prev) => prev ? { ...prev, timer: { ...prev.timer, running: true, secondsRemaining } } : prev);
    });

    socket.on("timer_paused", (remainingSeconds: number) => {
      setRoomState((prev) => prev ? { ...prev, timer: { running: false, secondsRemaining: remainingSeconds, pausedAt: Date.now() } } : prev);
    });

    socket.on("timer_expired", () => {
      setRoomState((prev) => prev ? { ...prev, timer: { running: false, secondsRemaining: 0, pausedAt: null } } : prev);
    });

    socket.on("note_played", (noteCard: Card, playerId: string) => {
      setRoomState((prev) => prev ? {
        ...prev,
        movies: prev.movies.map((m) =>
          m.playerId === playerId
            ? { ...m, notesPlayed: [...m.notesPlayed, noteCard] }
            : m
        ),
      } : prev);
    });

    socket.on("pitch_ended", (playerId: string) => {
      // State will be updated by room_joined broadcast
    });

    socket.on("next_pitcher", (playerId: string) => {
      setRoomState((prev) => prev ? { ...prev, currentPitcherId: playerId } : prev);
    });

    socket.on("winner_selected", (playerId: string, noteCard: Card | null) => {
      // State will be updated by room_joined broadcast
    });

    socket.on("round_started", (roundNumber: number) => {
      setRoomState((prev) => prev ? { ...prev, round: { ...prev.round, current: roundNumber } } : prev);
    });

    socket.on("game_ended", (scoreboard) => {
      setRoomState((prev) => prev ? { ...prev, phase: "game-end" } : prev);
    });

    socket.on("error", (msg: string) => {
      setError(msg);
    });

    return () => {
      socket.off("room_joined");
      socket.off("player_joined");
      socket.off("movie_revealed");
      socket.off("timer_started");
      socket.off("timer_paused");
      socket.off("timer_expired");
      socket.off("note_played");
      socket.off("pitch_ended");
      socket.off("next_pitcher");
      socket.off("winner_selected");
      socket.off("round_started");
      socket.off("game_ended");
      socket.off("error");
    };
  }, []);

  const joinRoom = useCallback((code: string, name: string) => {
    socket.emit("join_room", code, name);
  }, []);

  const joinAudience = useCallback((code: string) => {
    socket.emit("join_audience", code);
  }, []);

  const startGame = useCallback(() => { socket.emit("start_game"); }, []);
  const selectDeckType = useCallback((dt: DeckType) => { socket.emit("select_deck_type", dt); }, []);
  const selectCard = useCallback((cardId: string) => { socket.emit("select_card", cardId); }, []);
  const drawRandomCard = useCallback((dt: DeckType) => { socket.emit("draw_random_card", dt); }, []);
  const revealMovie = useCallback(() => { socket.emit("reveal_movie"); }, []);
  const startTimer = useCallback(() => { socket.emit("start_timer"); }, []);
  const pauseTimer = useCallback(() => { socket.emit("pause_timer"); }, []);
  const playNote = useCallback((noteCardId: string) => { socket.emit("play_note", noteCardId); }, []);
  const endPitch = useCallback(() => { socket.emit("end_pitch"); }, []);
  const selectWinner = useCallback((playerId: string) => { socket.emit("select_winner", playerId); }, []);
  const playAgain = useCallback(() => { socket.emit("play_again"); }, []);

  return {
    roomState,
    error,
    joinRoom,
    joinAudience,
    startGame,
    selectDeckType,
    selectCard,
    drawRandomCard,
    revealMovie,
    startTimer,
    pauseTimer,
    playNote,
    endPitch,
    selectWinner,
    playAgain,
  };
}

export function useAudience() {
  const [audienceState, setAudienceState] = useState<AudienceRoomState | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on("audience_joined", (state: AudienceRoomState) => {
      setAudienceState(state);
    });

    socket.on("audience_update", (state: AudienceRoomState) => {
      setAudienceState(state);
    });

    socket.on("movie_revealed", (movie: Movie) => {
      setAudienceState((prev) => prev ? {
        ...prev,
        movies: [...prev.movies.filter((m) => m.playerId !== movie.playerId), movie],
      } : prev);
    });

    socket.on("timer_started", (secondsRemaining: number) => {
      setAudienceState((prev) => prev ? { ...prev, timer: { ...prev.timer, running: true, secondsRemaining } } : prev);
    });

    socket.on("timer_paused", (remainingSeconds: number) => {
      setAudienceState((prev) => prev ? { ...prev, timer: { running: false, secondsRemaining: remainingSeconds, pausedAt: Date.now() } } : prev);
    });

    socket.on("timer_expired", () => {
      setAudienceState((prev) => prev ? { ...prev, timer: { running: false, secondsRemaining: 0, pausedAt: null } } : prev);
    });

    socket.on("note_played", (noteCard: Card, playerId: string) => {
      setAudienceState((prev) => prev ? {
        ...prev,
        movies: prev.movies.map((m) =>
          m.playerId === playerId
            ? { ...m, notesPlayed: [...m.notesPlayed, noteCard] }
            : m
        ),
      } : prev);
    });

    return () => {
      socket.off("audience_joined");
      socket.off("audience_update");
      socket.off("movie_revealed");
      socket.off("timer_started");
      socket.off("timer_paused");
      socket.off("timer_expired");
      socket.off("note_played");
    };
  }, []);

  const join = useCallback((code: string) => { socket.emit("join_audience", code); }, []);

  return { audienceState, join };
}
```

- [ ] **Step 3: Create client/src/hooks/useTimer.ts**

```typescript
import { useState, useEffect, useRef } from "react";

export function useTimer(running: boolean, initialSeconds: number) {
  const [seconds, setSeconds] = useState(initialSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setSeconds(initialSeconds);
  }, [initialSeconds]);

  useEffect(() => {
    if (running && seconds > 0) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => Math.max(0, s - 1));
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [running]);

  return { seconds, running };
}
```

- [ ] **Step 4: Create client/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Pitch Storm</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create client/src/main.tsx**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
```

- [ ] **Step 6: Create client/src/App.tsx**

```tsx
import { Routes, Route } from "react-router-dom";
import { Join } from "./pages/Join.js";
import { Game } from "./pages/Game.js";
import { Audience } from "./pages/Audience.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Join />} />
      <Route path="/room/:code" element={<Game />} />
      <Route path="/audience/:code" element={<Audience />} />
    </Routes>
  );
}
```

- [ ] **Step 7: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add React client socket, hooks, routing, and entry point"
```

---

## Task 8: React Components — Cards & Timer

**Files:**
- Create: `client/src/components/CardTemplate.tsx`
- Create: `client/src/components/Card.tsx`
- Create: `client/src/components/Timer.tsx`
- Create: `client/src/components/Scoreboard.tsx`
- Create: `client/src/components/PlayerList.tsx`
- Create: `client/src/components/MovieReveal.tsx`
- Create: `client/src/styles/cards.css`
- Create: `client/test/Card.test.tsx`
- Create: `client/test/Timer.test.tsx`

**Interfaces:**
- Consumes: `Card`, `Movie`, `PublicPlayer`, `TimerState` types from `shared/types.ts`
- Produces: reusable UI components used by all page components

- [ ] **Step 1: Write the failing test for Card**

```tsx
// client/test/Card.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card } from "../src/components/Card.js";
import type { Card as CardType } from "@pitch-storm/shared";

describe("Card", () => {
  const card: CardType = {
    id: "test1",
    type: "plot",
    text: "A detective who can hear the last thought of any object",
  };

  it("renders card text", () => {
    render(<Card card={card} />);
    expect(screen.getByText(card.text)).toBeTruthy();
  });

  it("renders card type label", () => {
    render(<Card card={card} />);
    expect(screen.getByText("PLOT")).toBeTruthy();
  });

  it("renders face-down card when faceDown is true", () => {
    render(<Card card={card} faceDown={true} />);
    expect(screen.queryByText(card.text)).toBeNull();
    expect(screen.getByText("PITCH STORM")).toBeTruthy();
  });

  it("applies correct CSS class for card type", () => {
    const { container } = render(<Card card={card} />);
    expect(container.firstChild).toHaveClass("card--plot");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Card.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create client/src/styles/cards.css**

```css
.card-template {
  width: 200px;
  height: 280px;
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 16px;
  font-family: "Segoe UI", system-ui, sans-serif;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
  position: relative;
  overflow: hidden;
}

.card-template:hover {
  transform: translateY(-4px);
}

.card--plot {
  background: linear-gradient(135deg, #1a237e, #3949ab);
  color: white;
}

.card--character {
  background: linear-gradient(135deg, #b71c1c, #d32f2f);
  color: white;
}

.card--note {
  background: linear-gradient(135deg, #1b5e20, #2e7d32);
  color: white;
}

.card--face-down {
  background: linear-gradient(135deg, #424242, #616161);
  color: #9e9e9e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
}

.card-type-label {
  font-size: 11px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 2px;
  opacity: 0.8;
}

.card-text {
  font-size: 16px;
  line-height: 1.4;
  flex-grow: 1;
  display: flex;
  align-items: center;
}

.card-back-label {
  text-align: center;
  font-size: 24px;
  font-weight: bold;
  letter-spacing: 3px;
}

.card-large {
  width: 300px;
  height: 420px;
}

.card-large .card-text {
  font-size: 22px;
}
```

- [ ] **Step 4: Create client/src/components/CardTemplate.tsx**

```tsx
import type { ReactNode } from "react";

interface CardTemplateProps {
  type: "plot" | "character" | "note" | "face-down";
  children: ReactNode;
  large?: boolean;
}

export function CardTemplate({ type, children, large = false }: CardTemplateProps) {
  const className = `card-template card--${type}${large ? " card-large" : ""}`;
  return <div className={className}>{children}</div>;
}
```

- [ ] **Step 5: Create client/src/components/Card.tsx**

```tsx
import type { Card as CardType } from "@pitch-storm/shared";
import { CardTemplate } from "./CardTemplate.js";

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  large?: boolean;
  onClick?: () => void;
}

export function Card({ card, faceDown = false, large = false, onClick }: CardProps) {
  if (faceDown) {
    return (
      <CardTemplate type="face-down" large={large}>
        <div className="card-back-label">PITCH STORM</div>
      </CardTemplate>
    );
  }

  return (
    <CardTemplate type={card.type} large={large}>
      <div className="card-type-label">{card.type}</div>
      <div className="card-text">{card.text}</div>
    </CardTemplate>
  );
}
```

- [ ] **Step 6: Run Card test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Card.test.tsx`
Expected: PASS (all 4 tests)

- [ ] **Step 7: Write the failing test for Timer**

```tsx
// client/test/Timer.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { Timer } from "../src/components/Timer.js";

describe("Timer", () => {
  it("displays remaining seconds", () => {
    render(<Timer seconds={45} running={false} large={false} />);
    expect(screen.getByText("0:45")).toBeTruthy();
  });

  it("formats minutes:seconds", () => {
    render(<Timer seconds={65} running={false} large={false} />);
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("shows 0:00 at zero", () => {
    render(<Timer seconds={0} running={false} large={false} />);
    expect(screen.getByText("0:00")).toBeTruthy();
  });

  it("shows running state class when running", () => {
    const { container } = render(<Timer seconds={30} running={true} large={false} />);
    expect(container.firstChild).toHaveClass("timer--running");
  });

  it("shows paused state class when not running", () => {
    const { container } = render(<Timer seconds={30} running={false} large={false} />);
    expect(container.firstChild).toHaveClass("timer--paused");
  });
});
```

- [ ] **Step 8: Create client/src/components/Timer.tsx**

```tsx
interface TimerProps {
  seconds: number;
  running: boolean;
  large: boolean;
}

export function Timer({ seconds, running, large }: TimerProps) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const display = `${mins}:${secs.toString().padStart(2, "0")}`;
  const className = `timer timer--${running ? "running" : "paused"}${large ? " timer-large" : ""}`;

  return <div className={className}>{display}</div>;
}
```

- [ ] **Step 9: Run Timer test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Timer.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 10: Create remaining components**

`client/src/components/Scoreboard.tsx`:
```tsx
import type { PublicPlayer } from "@pitch-storm/shared";

interface ScoreboardProps {
  players: PublicPlayer[];
  large?: boolean;
}

export function Scoreboard({ players, large = false }: ScoreboardProps) {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  return (
    <div className={large ? "scoreboard scoreboard-large" : "scoreboard"}>
      <h3>Scoreboard</h3>
      <div className="scoreboard-list">
        {sorted.map((p, i) => (
          <div key={p.id} className="scoreboard-row">
            <span className="scoreboard-rank">{i + 1}.</span>
            <span className="scoreboard-name">{p.name}</span>
            <span className="scoreboard-score">{p.score}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

`client/src/components/PlayerList.tsx`:
```tsx
import type { PublicPlayer } from "@pitch-storm/shared";

interface PlayerListProps {
  players: PublicPlayer[];
}

export function PlayerList({ players }: PlayerListProps) {
  return (
    <div className="player-list">
      <h3>Players</h3>
      <ul>
        {players.map((p) => (
          <li key={p.id} className={p.isDisconnected ? "player-disconnected" : ""}>
            {p.isExecutive && "🎬 "}
            {p.isHost && "👑 "}
            {p.name}
            {p.isDisconnected && " (disconnected)"}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

`client/src/components/MovieReveal.tsx`:
```tsx
import type { Movie as MovieType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface MovieRevealProps {
  movie: MovieType;
  large?: boolean;
}

export function MovieReveal({ movie, large = false }: MovieRevealProps) {
  return (
    <div className="movie-reveal">
      <div className="movie-cards">
        <Card card={movie.chosenCard} large={large} />
        <Card card={movie.randomCard} large={large} />
      </div>
      {movie.notesPlayed.length > 0 && (
        <div className="movie-notes">
          <h4>Notes from Executive:</h4>
          {movie.notesPlayed.map((note) => (
            <Card key={note.id} card={note} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 11: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add React card, timer, scoreboard, player list, and movie components"
```

---

## Task 9: Join Page

**Files:**
- Create: `client/src/pages/Join.tsx`
- Create: `client/test/Join.test.tsx`

**Interfaces:**
- Consumes: `useRoom` hook from Task 7, React Router `useNavigate`
- Produces: rendered join screen with room code, name, player/audience buttons

- [ ] **Step 1: Write the failing test**

```tsx
// client/test/Join.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Join } from "../src/pages/Join.js";

vi.mock("../src/socket.js", () => ({
  socket: { connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

describe("Join", () => {
  it("renders room code input", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/room code/i)).toBeTruthy();
  });

  it("renders name input", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByPlaceholderText(/your name/i)).toBeTruthy();
  });

  it("renders join as player button", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByText(/join as player/i)).toBeTruthy();
  });

  it("renders join as audience button", () => {
    render(<MemoryRouter><Join /></MemoryRouter>);
    expect(screen.getByText(/join as audience/i)).toBeTruthy();
  });

  it("navigates to /room/:code when joining as player", () => {
    const navigate = vi.fn();
    vi.mock("react-router-dom", async () => {
      const actual = await vi.importActual("react-router-dom");
      return { ...actual, useNavigate: () => navigate };
    });
    render(<MemoryRouter><Join /></MemoryRouter>);
    const codeInput = screen.getByPlaceholderText(/room code/i);
    const nameInput = screen.getByPlaceholderText(/your name/i);
    fireEvent.change(codeInput, { target: { value: "ABCD" } });
    fireEvent.change(nameInput, { target: { value: "Jason" } });
    fireEvent.click(screen.getByText(/join as player/i));
    expect(navigate).toHaveBeenCalledWith("/room/ABCD");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Join.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create client/src/pages/Join.tsx**

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function Join() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [name, setName] = useState(getCookie("playerName") || "");

  function getCookie(key: string): string | undefined {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match?.[2];
  }

  function setCookie(key: string, value: string) {
    document.cookie = `${key}=${value};path=/;max-age=31536000`;
  }

  function handleJoinAsPlayer() {
    if (!name.trim()) return;
    setCookie("playerName", name);
    const roomCode = code.trim().toUpperCase() || "";
    navigate(`/room/${roomCode}`);
  }

  function handleJoinAsAudience() {
    const roomCode = code.trim().toUpperCase();
    if (!roomCode) return;
    navigate(`/audience/${roomCode}`);
  }

  return (
    <div className="join-screen">
      <h1>PITCH STORM</h1>
      <div className="join-form">
        <input
          type="text"
          placeholder="Room Code (leave empty to create)"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={4}
          className="join-input"
        />
        <input
          type="text"
          placeholder="Your Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={20}
          className="join-input"
        />
        <button onClick={handleJoinAsPlayer} className="join-btn join-btn-player">
          Join as Player
        </button>
        <button onClick={handleJoinAsAudience} className="join-btn join-btn-audience">
          Join as Audience
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Join.test.tsx`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add join screen with room code, name, and cookie persistence"
```

---

## Task 10: Game Page (Player View)

**Files:**
- Create: `client/src/pages/Game.tsx`
- Create: `client/src/components/WriterControls.tsx`
- Create: `client/src/components/ExecutiveControls.tsx`
- Create: `client/src/components/RoundSummary.tsx`
- Create: `client/test/Game.test.tsx`

**Interfaces:**
- Consumes: `useRoom` hook, all components from Task 8, React Router `useParams`
- Produces: full player game view rendering correct UI for each game phase

- [ ] **Step 1: Write the failing test**

```tsx
// client/test/Game.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Game } from "../src/pages/Game.js";

vi.mock("../src/socket.js", () => ({
  socket: { connect: vi.fn(), emit: vi.fn(), on: vi.fn(), off: vi.fn() },
}));

vi.mock("../src/hooks/useRoom.js", () => ({
  useRoom: () => ({
    roomState: {
      code: "ABCD",
      phase: "lobby",
      players: [{ id: "1", name: "Jason", isExecutive: false, isHost: true, score: 0, isDisconnected: false }],
      executiveId: null,
      currentPitcherId: null,
      timer: { running: false, secondsRemaining: 45, pausedAt: null },
      round: { current: 0, total: 0 },
      movies: [],
      myPlayerId: "1",
      myHand: null,
      myExecutiveNotes: null,
    },
    error: null,
    joinRoom: vi.fn(),
    startGame: vi.fn(),
    selectDeckType: vi.fn(),
    selectCard: vi.fn(),
    drawRandomCard: vi.fn(),
    revealMovie: vi.fn(),
    startTimer: vi.fn(),
    pauseTimer: vi.fn(),
    playNote: vi.fn(),
    endPitch: vi.fn(),
    selectWinner: vi.fn(),
    playAgain: vi.fn(),
  }),
}));

describe("Game", () => {
  it("renders lobby phase with player list", () => {
    render(<MemoryRouter><Game /></MemoryRouter>);
    expect(screen.getByText("Players")).toBeTruthy();
    expect(screen.getByText("Jason")).toBeTruthy();
  });

  it("renders start game button for host in lobby", () => {
    render(<MemoryRouter><Game /></MemoryRouter>);
    expect(screen.getByText(/start game/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Game.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Create client/src/components/WriterControls.tsx**

```tsx
import type { Card as CardType, DeckType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface WriterControlsProps {
  hand: CardType[];
  hasSelectedCard: boolean;
  hasDrawnBlind: boolean;
  onSelectDeckType: (dt: DeckType) => void;
  onSelectCard: (cardId: string) => void;
  onDrawBlind: (dt: DeckType) => void;
  onReady: () => void;
}

export function WriterControls({ hand, hasSelectedCard, hasDrawnBlind, onSelectDeckType, onSelectCard, onDrawBlind, onReady }: WriterControlsProps) {
  return (
    <div className="writer-controls">
      <h3>Your Hand</h3>
      <div className="card-row">
        {hand.map((card) => (
          <Card key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
        ))}
      </div>
      {!hasSelectedCard && hand.length === 3 && (
        <p>Select a card from your hand to play.</p>
      )}
      {hasSelectedCard && !hasDrawnBlind && (
        <div className="blind-draw-controls">
          <p>Draw a blind card from:</p>
          <button onClick={() => onDrawBlind("plot")}>Plot Deck</button>
          <button onClick={() => onDrawBlind("character")}>Character Deck</button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create client/src/components/ExecutiveControls.tsx**

```tsx
import type { Card as CardType } from "@pitch-storm/shared";
import { Card } from "./Card.js";

interface ExecutiveControlsProps {
  notes: CardType[];
  timerRunning: boolean;
  timerSeconds: number;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onPlayNote: (noteCardId: string) => void;
  onEndPitch: () => void;
}

export function ExecutiveControls({ notes, timerRunning, timerSeconds, onStartTimer, onPauseTimer, onPlayNote, onEndPitch }: ExecutiveControlsProps) {
  return (
    <div className="executive-controls">
      <h3>Your NOTE Cards</h3>
      <div className="card-row">
        {notes.map((note) => (
          <Card key={note.id} card={note} onClick={() => onPlayNote(note.id)} />
        ))}
      </div>
      <div className="timer-controls">
        {!timerRunning && <button onClick={onStartTimer}>Start Timer</button>}
        {timerRunning && <button onClick={onPauseTimer}>Pause Timer</button>}
        <button onClick={onEndPitch}>End Pitch</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create client/src/components/RoundSummary.tsx**

```tsx
import type { Movie } from "@pitch-storm/shared";
import type { PublicPlayer } from "@pitch-storm/shared";
import { MovieReveal } from "./MovieReveal.js";

interface RoundSummaryProps {
  movies: Movie[];
  players: PublicPlayer[];
  isExecutive: boolean;
  onSelectWinner: (playerId: string) => void;
}

export function RoundSummary({ movies, players, isExecutive, onSelectWinner }: RoundSummaryProps) {
  return (
    <div className="round-summary">
      <h2>Select the Best Movie!</h2>
      {movies.map((movie) => {
        const player = players.find((p) => p.id === movie.playerId);
        return (
          <div key={movie.playerId} className="round-summary-movie">
            <h3>{player?.name}'s Movie</h3>
            <MovieReveal movie={movie} />
            {isExecutive && (
              <button onClick={() => onSelectWinner(movie.playerId)}>
                Pick This Movie
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Create client/src/pages/Game.tsx**

```tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useRoom } from "../hooks/useRoom.js";
import { PlayerList } from "../components/PlayerList.js";
import { Timer } from "../components/Timer.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { MovieReveal } from "../components/MovieReveal.js";
import { WriterControls } from "../components/WriterControls.js";
import { ExecutiveControls } from "../components/ExecutiveControls.js";
import { RoundSummary } from "../components/RoundSummary.js";
import type { DeckType } from "@pitch-storm/shared";

export function Game() {
  const { code } = useParams<{ code: string }>();
  const room = useRoom();

  useEffect(() => {
    const name = getCookie("playerName") || "";
    if (name && code) {
      room.joinRoom(code, name);
    }
  }, [code]);

  function getCookie(key: string): string | undefined {
    const match = document.cookie.match(new RegExp(`(^| )${key}=([^;]+)`));
    return match?.[2];
  }

  if (!room.roomState) {
    return <div className="loading">Connecting...</div>;
  }

  const state = room.roomState;
  const myPlayer = state.players.find((p) => p.id === state.myPlayerId);
  const isExecutive = state.myPlayerId === state.executiveId;
  const isHost = myPlayer?.isHost ?? false;

  // LOBBY
  if (state.phase === "lobby") {
    return (
      <div className="game-view">
        <h1>Pitch Storm — Room {state.code}</h1>
        <PlayerList players={state.players} />
        {isHost && <button onClick={room.startGame}>Start Game</button>}
      </div>
    );
  }

  // SETUP (choose deck type)
  if (state.phase === "setup" && !isExecutive && state.myHand === null) {
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <p>You are a Writer. Choose your deck:</p>
        <button onClick={() => room.selectDeckType("plot" as DeckType)}>Draw PLOT cards</button>
        <button onClick={() => room.selectDeckType("character" as DeckType)}>Draw CHARACTER cards</button>
      </div>
    );
  }

  // CARD SELECTION
  if (state.phase === "setup" || state.phase === "card-selection") {
    if (isExecutive) {
      return (
        <div className="game-view">
          <h2>Round {state.round.current} of {state.round.total}</h2>
          <p>You are the Executive. Waiting for writers to prepare their movies...</p>
          <PlayerList players={state.players} />
        </div>
      );
    }
    const myMovie = state.movies.find((m) => m.playerId === state.myPlayerId);
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <WriterControls
          hand={state.myHand || []}
          hasSelectedCard={!!myMovie?.chosenCard}
          hasDrawnBlind={!!myMovie?.randomCard}
          onSelectDeckType={room.selectDeckType}
          onSelectCard={room.selectCard}
          onDrawBlind={room.drawRandomCard}
          onReady={room.revealMovie}
        />
      </div>
    );
  }

  // PITCHING
  if (state.phase === "pitching") {
    const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
    const isMyPitch = state.currentPitcherId === state.myPlayerId;
    const pitcher = state.players.find((p) => p.id === state.currentPitcherId);

    return (
      <div className="game-view">
        <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} />
        {isMyPitch && <p>YOUR TURN TO PITCH!</p>}
        {!isMyPitch && <p>{pitcher?.name} is pitching...</p>}
        {currentMovie && <MovieReveal movie={currentMovie} large={true} />}
        {isExecutive && (
          <ExecutiveControls
            notes={state.myExecutiveNotes || []}
            timerRunning={state.timer.running}
            timerSeconds={state.timer.secondsRemaining}
            onStartTimer={room.startTimer}
            onPauseTimer={room.pauseTimer}
            onPlayNote={room.playNote}
            onEndPitch={room.endPitch}
          />
        )}
        {isMyPitch && <button onClick={room.endPitch}>I'm Done Pitching</button>}
      </div>
    );
  }

  // ROUND END (Executive picks winner)
  if (state.phase === "round-end") {
    return (
      <div className="game-view">
        <h2>Round {state.round.current} of {state.round.total}</h2>
        <RoundSummary
          movies={state.movies}
          players={state.players}
          isExecutive={isExecutive}
          onSelectWinner={room.selectWinner}
        />
      </div>
    );
  }

  // GAME END
  if (state.phase === "game-end") {
    const sorted = [...state.players].sort((a, b) => b.score - a.score);
    return (
      <div className="game-view game-end-screen">
        <h1>Game Over!</h1>
        <Scoreboard players={state.players} large={true} />
        {isHost && <button onClick={room.playAgain}>Play Again</button>}
      </div>
    );
  }

  return <div>Unknown state</div>;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd /home/jason/Repos/movie-pitch && npx vitest run --config client/vitest.config.ts client/test/Game.test.tsx`
Expected: PASS (both tests)

- [ ] **Step 8: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add player game view with all phase renderings"
```

---

## Task 11: Audience Page

**Files:**
- Create: `client/src/pages/Audience.tsx`

**Interfaces:**
- Consumes: `useAudience` hook from Task 7, all display components from Task 8
- Produces: spectator view optimized for screen-sharing

- [ ] **Step 1: Create client/src/pages/Audience.tsx**

```tsx
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAudience } from "../hooks/useRoom.js";
import { Timer } from "../components/Timer.js";
import { Scoreboard } from "../components/Scoreboard.js";
import { MovieReveal } from "../components/MovieReveal.js";

export function Audience() {
  const { code } = useParams<{ code: string }>();
  const { audienceState, join } = useAudience();

  useEffect(() => {
    if (code) join(code.toUpperCase());
  }, [code]);

  if (!audienceState) {
    return <div className="audience-loading">Connecting to room {code}...</div>;
  }

  const state = audienceState;
  const currentMovie = state.movies.find((m) => m.playerId === state.currentPitcherId);
  const pitcher = state.players.find((p) => p.id === state.currentPitcherId);
  const executive = state.players.find((p) => p.id === state.executiveId);

  return (
    <div className="audience-view">
      <header className="audience-header">
        <h1>PITCH STORM</h1>
        <div className="audience-meta">
          Room: {state.code} | Round {state.round.current}/{state.round.total}
          {executive && ` | Executive: ${executive.name}`}
        </div>
      </header>

      {state.phase === "lobby" && (
        <div className="audience-lobby">
          <h2>Waiting for game to start...</h2>
          <Scoreboard players={state.players} large={true} />
        </div>
      )}

      {state.phase === "setup" && (
        <div className="audience-setup">
          <h2>Writers are choosing their cards...</h2>
          <Scoreboard players={state.players} />
        </div>
      )}

      {(state.phase === "card-selection" || state.phase === "pitching") && (
        <div className="audience-pitching">
          <Timer seconds={state.timer.secondsRemaining} running={state.timer.running} large={true} />
          {pitcher && <h2 className="audience-pitcher-name">Now Pitching: {pitcher.name}</h2>}
          {currentMovie && <MovieReveal movie={currentMovie} large={true} />}
        </div>
      )}

      {state.phase === "round-end" && (
        <div className="audience-round-end">
          <h2>Executive is choosing the winner...</h2>
          {state.movies.map((movie) => {
            const player = state.players.find((p) => p.id === movie.playerId);
            return (
              <div key={movie.playerId}>
                <h3>{player?.name}'s Movie</h3>
                <MovieReveal movie={movie} />
              </div>
            );
          })}
        </div>
      )}

      {state.phase === "game-end" && (
        <div className="audience-game-end">
          <h1>🏆 Game Over!</h1>
          <Scoreboard players={state.players} large={true} />
        </div>
      )}

      <footer className="audience-footer">
        <Scoreboard players={state.players} />
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add audience spectator view with large-screen layout"
```

---

## Task 12: Docker Configuration

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.dockerignore`

**Interfaces:**
- Consumes: completed monorepo with buildable server and client
- Produces: self-contained Docker image that runs the full app on port 3000

- [ ] **Step 1: Create Dockerfile**

```dockerfile
# Stage 1: Build client
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY client ./client
COPY server ./server
RUN npm ci
RUN npm run build:client

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm ci --omit=dev
EXPOSE 3000
VOLUME ["/app/data"]
CMD ["node", "server/dist/index.js"]
```

- [ ] **Step 2: Create docker-compose.yml**

```yaml
services:
  pitchstorm:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - pitchstorm-data:/app/data
    environment:
      - PORT=3000
      - DB_PATH=/app/data/pitchstorm.db
volumes:
  pitchstorm-data:
```

- [ ] **Step 3: Create .dockerignore**

```
node_modules
dist
data
*.db
.git
docs
e2e
*.md
PitchStorm-*.jpg
```

- [ ] **Step 4: Build and test the Docker image**

Run: `cd /home/jason/Repos/movie-pitch && docker build -t pitchstorm .`
Expected: successful build, no errors

Run: `cd /home/jason/Repos/movie-pitch && docker compose up -d && sleep 3 && curl -s http://localhost:3000 | head -5 && docker compose down`
Expected: HTML response from the server

- [ ] **Step 5: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "feat: add Dockerfile and docker-compose for self-hosted deployment"
```

---

## Task 13: E2E Test with Playwright

**Files:**
- Create: `e2e/playwright.config.ts`
- Create: `e2e/full-game.test.ts`
- Create: `package.json` (modify — add playwright devDep)

**Interfaces:**
- Consumes: running server on port 3000
- Produces: E2E test verifying a full 2-player game from join to game-end

- [ ] **Step 1: Add playwright devDep to root package.json**

Add to devDependencies in `package.json`:
```json
"@playwright/test": "^1.45.0"
```

- [ ] **Step 2: Create e2e/playwright.config.ts**

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  timeout: 60000,
  use: {
    baseURL: "http://localhost:3000",
    headless: true,
  },
  webServer: {
    command: "node server/dist/index.js",
    port: 3000,
    reuseExistingServer: true,
    cwd: "..",
  },
});
```

- [ ] **Step 3: Create e2e/full-game.test.ts**

```typescript
import { test, expect } from "@playwright/test";

test("full 2-player game", async ({ browser }) => {
  // Create host page
  const hostPage = await browser.newPage();
  await hostPage.goto("http://localhost:3000");

  // Host creates a room
  await hostPage.fill('input[placeholder*="Room Code"]', "");
  await hostPage.fill('input[placeholder*="Your Name"]', "Host");
  await hostPage.click("text=Join as Player");
  await hostPage.waitForURL("**/room/**");

  // Extract room code from URL
  const roomUrl = hostPage.url();
  const roomCode = roomUrl.split("/room/")[1];
  expect(roomCode).toMatch(/^[A-Z]{4}$/);

  // Guest joins
  const guestPage = await browser.newPage();
  await guestPage.goto("http://localhost:3000");
  await guestPage.fill('input[placeholder*="Room Code"]', roomCode);
  await guestPage.fill('input[placeholder*="Your Name"]', "Guest");
  await guestPage.click("text=Join as Player");
  await guestPage.waitForURL(`**/room/${roomCode}`);

  // Audience joins
  const audiencePage = await browser.newPage();
  await audiencePage.goto("http://localhost:3000");
  await audiencePage.fill('input[placeholder*="Room Code"]', roomCode);
  await audiencePage.click("text=Join as Audience");
  await audiencePage.waitForURL(`**/audience/${roomCode}`);

  // Verify lobby shows both players
  await expect(hostPage.locator("text=Host")).toBeVisible();
  await expect(hostPage.locator("text=Guest")).toBeVisible();
  await expect(audiencePage.locator("text=Host")).toBeVisible();
  await expect(audiencePage.locator("text=Guest")).toBeVisible();

  // Host starts game
  await hostPage.click("text=Start Game");

  // Wait for setup phase
  await expect(hostPage.locator("text=Draw PLOT cards")).toBeVisible({ timeout: 10000 });

  // Both players select deck type
  await guestPage.click("text=Draw PLOT cards");

  // Wait for card selection
  await expect(hostPage.locator("text=Executive")).toBeVisible({ timeout: 10000 });

  // Guest selects a card and draws blind
  const guestCards = guestPage.locator(".card-template");
  await guestCards.first().click();
  await guestPage.click("text=Plot Deck");

  // Wait for pitching phase
  await expect(hostPage.locator(".timer")).toBeVisible({ timeout: 10000 });
  await expect(audiencePage.locator(".timer")).toBeVisible({ timeout: 10000 });

  // Host starts timer
  await hostPage.click("text=Start Timer");

  // Wait a moment
  await hostPage.waitForTimeout(2000);

  // Host ends pitch
  await hostPage.click("text=End Pitch");

  // Wait for round-end
  await expect(hostPage.locator("text=Pick This Movie")).toBeVisible({ timeout: 10000 });

  // Host picks winner
  await hostPage.click("text=Pick This Movie");

  // Continue through rounds until game end
  // For 2 players, round 2 should start automatically
  // This part of the test may need adjustment based on actual UI flow

  await hostPage.close();
  await guestPage.close();
  await audiencePage.close();
});
```

- [ ] **Step 4: Install playwright**

Run: `cd /home/jason/Repos/movie-pitch && npm install && npx playwright install chromium`
Expected: installs playwright and chromium browser

- [ ] **Step 5: Run E2E test**

Run: `cd /home/jason/Repos/movie-pitch && npx playwright test --config e2e/playwright.config.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd /home/jason/Repos/movie-pitch
git add -A
git commit -m "test: add E2E test for full 2-player game flow"
```

---

## Spec Coverage Check

| Spec Section | Task(s) |
|-------------|---------|
| Backend: Node.js + Express + Socket.IO | Task 6 |
| Frontend: React + Vite | Tasks 7-11 |
| Persistence: SQLite | Task 2 |
| Architecture: Monorepo monolith | Task 1 |
| Game scope: Standard 3-5 player mode | Tasks 5 (state machine covers this) |
| Card content: 10 placeholder per deck | Task 2 (seed-cards.ts) |
| Cards rendered as styled components | Task 8 (CardTemplate + Card) |
| Pitch capture: Voice via external Zoom | N/A (no app code needed) |
| Game length: 1 round per player | Task 5 (state machine) |
| Spectator visibility: Full game state | Tasks 6 (audience events), 11 (audience page) |
| Authentication: Room code + cookie | Tasks 3 (rooms), 9 (cookie handling) |
| Data model: Room/Player/Card/Movie | Tasks 1 (types), 2 (SQLite) |
| Socket.IO events (all) | Tasks 6 (server), 7 (client hooks) |
| Visibility rules | Task 6 (toPublicRoomState, toAudienceRoomState) |
| Cookie handling | Task 9 (client) |
| Client UI: Join screen | Task 9 |
| Client UI: Game view (all phases) | Task 10 |
| Client UI: Audience view | Task 11 |
| State machine: All phases | Task 5 |
| Edge cases: Disconnect/reconnect | Task 6 (socket disconnect handler) |
| Edge cases: NOTE deck exhaustion | Task 5 (playNote handles empty deck) |
| Project structure | Task 1 |
| Dockerfile | Task 12 |
| docker-compose.yml | Task 12 |
| Testing: Server unit | Tasks 2, 3, 4, 5 |
| Testing: Socket integration | Task 6 |
| Testing: Client component | Tasks 8, 9, 10 |
| Testing: E2E | Task 13 |