# Franchise Card Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let franchise-card holders pick a previously pitched movie via UI during card-selection; display the referenced movie alongside the franchise pitch on reveal.

**Architecture:** Track movie history across rounds in `Room.movieHistory`. New `Movie.franchiseSourceMovieId` field. New `select_franchise_source` socket event. Client renders a picker during card-selection when the chosen card is a franchise card and history is non-empty; renders the referenced movie alongside on reveal.

**Tech Stack:** TypeScript, Express, Socket.IO v4, React 18, Vitest, Playwright.

## Global Constraints

- Server is ESM; all imports use `.js` extensions for TypeScript files.
- State-machine functions are pure: take `RoomStore` + `Room`, mutate via `store.saveRoom()`, caller re-fetches.
- Socket handlers re-fetch room after state-machine calls: `store.getRoom(ctx.room.code)!`.
- Timer is server-authoritative — never compute timer values on the client.
- `tallyAndAdvance` is the only path to finalize a round; no manual winner selection.
- Server tests use in-memory SQLite (`:memory:`) with `seedCards(db)` in `beforeEach`, `db.close()` in `afterEach`.
- Client tests use jsdom + `@testing-library/react`; existing pattern uses `mockState` + `mockFns` in `Game.test.tsx`.
- ESLint 9 flat config; `npm run lint` must exit 0 (4 intentional react-hooks warnings allowed).
- Test commands: `cd server && npx vitest run`, `cd client && npx vitest run`. Full: `npm test`.
- Typecheck: `npx tsc --noEmit -p server/tsconfig.json` and `npx tsc --noEmit -p client/tsconfig.json`.
- Lint: `npm run lint`. Format: `npm run format`.
- Commits: one per task, conventional-commit format.
- Franchise cards are filtered out in 2-player games and when host disables — unchanged.

**Reference spec:** `docs/superpowers/specs/2026-07-19-franchise-card-enhancement-design.md`

---

## File Structure

**Shared (modified):**
- `shared/types.ts` — add `Movie.id`, `Movie.franchiseSourceMovieId`, `Room.movieHistory`, `PublicRoomState.movieHistory`, `AudienceRoomState.movieHistory`, `ClientToServerEvents.select_franchise_source`.

**Server (modified):**
- `server/src/rooms.ts` — `createEmptyRoom` initializes `movieHistory: []`.
- `server/src/state-machine.ts` — `setupRound` appends current movies to history; `selectCard` generates `Movie.id` and sets `franchiseSourceMovieId: null`; new `selectFranchiseSource` function; `checkAllMoviesReady` extended; `forceStart` auto-picks franchise source; `playAgain` clears history.
- `server/src/sockets/handlers.ts` — new `select_franchise_source` socket handler.
- `server/src/sockets/state-mapper.ts` — include `movieHistory` in public + audience state.
- `server/test/state-machine.test.ts` — new `describe("franchise card selection")` block.
- `server/test/sockets.test.ts` — new `select_franchise_source` handler test.

**Client (modified):**
- `client/src/hooks/useRoom.ts` — add `selectFranchiseSource` callback.
- `client/src/components/WriterControls.tsx` — new props `movieHistory`, `franchiseSourceMovieId`, `myPlayerId`, `onSelectFranchiseSource`; render picker; disable Ready when franchise card has no source.
- `client/src/components/MovieReveal.tsx` — new optional prop `movieHistory`; render referenced movie alongside when `movie.franchiseSourceMovieId` is set.
- `client/src/pages/Game.tsx` — pass `movieHistory`, `franchiseSourceMovieId`, `myPlayerId`, `onSelectFranchiseSource` to `WriterControls`; pass `movieHistory` to `MovieReveal`.
- `client/src/pages/Audience.tsx` — pass `movieHistory` to `MovieReveal`.
- `client/test/WriterControls.test.tsx` — franchise picker tests.
- `client/test/MovieReveal.test.tsx` — referenced-movie-render test.

---

## Task 1: Shared Types — Movie.id, Movie.franchiseSourceMovieId, Room.movieHistory

**Files:**
- Modify: `shared/types.ts`

**Interfaces:**
- Produces: `Movie.id: string`, `Movie.franchiseSourceMovieId: string | null`, `Room.movieHistory: Movie[]`, `PublicRoomState.movieHistory: Movie[]`, `AudienceRoomState.movieHistory: Movie[]`, `ClientToServerEvents.select_franchise_source: (sourceMovieId: string) => void`.

- [ ] **Step 1: Edit `shared/types.ts`**

Add `id` and `franchiseSourceMovieId` to `Movie`:

```ts
export interface Movie {
  id: string;
  playerId: string;
  chosenCard: Card;
  randomCard: Card;
  notesPlayed: Card[];
  revealed: boolean;
  franchiseSourceMovieId: string | null;
}
```

Add `movieHistory: Movie[]` to `Room` (after `movies: Movie[]`):

```ts
export interface Room {
  // ... existing ...
  movies: Movie[];
  movieHistory: Movie[];
  // ... rest ...
}
```

Add `movieHistory: Movie[]` to `PublicRoomState` (after `movies: Movie[]`):

```ts
export interface PublicRoomState {
  // ... existing ...
  movies: Movie[];
  movieHistory: Movie[];
  // ... rest ...
}
```

Add `movieHistory: Movie[]` to `AudienceRoomState` (after `movies: Movie[]`):

```ts
export interface AudienceRoomState {
  // ... existing ...
  movies: Movie[];
  movieHistory: Movie[];
  // ... rest ...
}
```

Add `select_franchise_source` to `ClientToServerEvents` (after `force_start`):

```ts
export interface ClientToServerEvents {
  // ... existing ...
  force_start: () => void;
  select_franchise_source: (sourceMovieId: string) => void;
  play_again: () => void;
  // ... rest ...
}
```

- [ ] **Step 2: Run typecheck — expect errors in server files that don't yet set `Movie.id` or `movieHistory`**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: errors in `rooms.ts` (createEmptyRoom missing `movieHistory`) and `state-machine.ts` (newMovie missing `id` and `franchiseSourceMovieId`). Note the exact errors.

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: similar errors. Note them.

These will be fixed in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add shared/types.ts
git commit -m "feat(shared): add Movie.id, franchiseSourceMovieId, movieHistory types"
```

---

## Task 2: Server — Initialize movieHistory in createEmptyRoom

**Files:**
- Modify: `server/src/rooms.ts:34-65` (the `createEmptyRoom` function)

**Interfaces:**
- Consumes: `Room.movieHistory: Movie[]` from Task 1.
- Produces: `createEmptyRoom` returns a Room with `movieHistory: []`.

- [ ] **Step 1: Edit `createEmptyRoom` in `server/src/rooms.ts`**

Add `movieHistory: []` immediately after `movies: []`:

```ts
function createEmptyRoom(code: string): Room {
  return {
    code,
    phase: "lobby",
    players: [],
    noteGiverId: null,
    currentPitcherId: null,
    deck: { plot: [], character: [], note: [] },
    noteGiverNotes: [],
    movies: [],
    movieHistory: [],
    timer: {
      running: false,
      secondsRemaining: 45,
      pausedAt: null,
      pausedForNote: false,
      noteResumeAt: null,
    },
    round: { current: 0 },
    totalRounds: 5,
    noteGiverOrder: [],
    noteGiverIndex: 0,
    pitchOrder: [],
    currentPitchIndex: 0,
    votes: {},
    votingActive: false,
    roundWinnerId: null,
    franchiseEnabled: true,
  };
}
```

- [ ] **Step 2: Run server typecheck — one error resolved**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: one fewer error (the `createEmptyRoom` missing `movieHistory` error is gone). The `state-machine.ts` errors about `newMovie` missing `id`/`franchiseSourceMovieId` remain — those are Task 3.

- [ ] **Step 3: Commit**

```bash
git add server/src/rooms.ts
git commit -m "feat(server): initialize movieHistory in createEmptyRoom"
```

---

## Task 3: Server — selectCard generates Movie.id + sets franchiseSourceMovieId; setupRound appends to movieHistory

**Files:**
- Modify: `server/src/state-machine.ts:29-50` (setupRound), `server/src/state-machine.ts:112-145` (selectCard)
- Test: `server/test/state-machine.test.ts`

**Interfaces:**
- Consumes: `Movie.id`, `Movie.franchiseSourceMovieId`, `Room.movieHistory` from Task 1; `createEmptyRoom` with `movieHistory` from Task 2.
- Produces: `setupRound` appends prior round's movies to `movieHistory`; `selectCard` creates movies with `id` (nanoid) and `franchiseSourceMovieId: null`.

- [ ] **Step 1: Add `nanoid` import to `state-machine.ts`**

At the top of `server/src/state-machine.ts`, add:

```ts
import { nanoid } from "nanoid";
```

(The `nanoid` package is already a dependency; `rooms.ts` imports it.)

- [ ] **Step 2: Write failing test for `setupRound` appending to `movieHistory`**

Add to `server/test/state-machine.test.ts`, inside the outer `describe("state machine")` block, before the closing `});`:

```ts
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
      startPitching(store, updated);

      const otherWriter = playerIds.find((id) => id !== writerId && id !== noteGiverId)!;
      if (otherWriter) {
        updated = store.getRoom(room.code)!;
        selectDeckType(store, updated, otherWriter, "plot");
        updated = store.getRoom(room.code)!;
        const ow = updated.players.find((p) => p.id === otherWriter)!;
        selectCard(store, updated, otherWriter, ow.hand[0].id);
      }

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
  });
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "franchise card selection"`
Expected: FAIL — `updated.movieHistory` is undefined; `movie.id` is undefined.

- [ ] **Step 4: Modify `setupRound` to append movies to history**

In `server/src/state-machine.ts`, edit `setupRound` (around line 29). At the start of the `store.saveRoom` call, compute the updated history and add it:

```ts
export function setupRound(store: RoomStore, room: Room): void {
  const noteGiverId = pickNoteGiver(room);
  const { drawn: notes, remaining: noteRemaining } = drawFromDeck(
    store,
    room.deck.note,
    3,
    "note",
    room,
  );
  const updatedHistory =
    room.movies.length > 0 ? [...room.movieHistory, ...room.movies] : room.movieHistory;
  store.saveRoom({
    ...room,
    phase: "setup",
    noteGiverId,
    noteGiverNotes: notes,
    deck: { ...room.deck, note: noteRemaining },
    movies: [],
    movieHistory: updatedHistory,
    timer: createTimer(45),
    pitchOrder: [],
    currentPitchIndex: 0,
    currentPitcherId: null,
    players: room.players.map((p) => ({
      ...p,
      isNoteGiver: p.id === noteGiverId,
      hand: [],
      chosenCard: null,
      isSpectator: false,
    })),
    votes: {},
    votingActive: false,
  });
}
```

- [ ] **Step 5: Modify `selectCard` to set `id` and `franchiseSourceMovieId: null` on new movies**

In `server/src/state-machine.ts`, edit `selectCard` (around line 130). Update the `newMovie` object:

```ts
  const newMovie = {
    id: nanoid(12),
    playerId,
    chosenCard,
    randomCard: blindCard,
    notesPlayed: [] as Card[],
    revealed: false,
    franchiseSourceMovieId: null,
  };
```

- [ ] **Step 6: Run the new tests to verify they pass**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "franchise card selection"`
Expected: PASS (2 tests).

- [ ] **Step 7: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass (existing tests may need movie objects to include `id` and `franchiseSourceMovieId` — most use the state-machine functions which now set them. If any tests directly construct Movie objects, fix them by adding `id: "test-id-N"` and `franchiseSourceMovieId: null`).

- [ ] **Step 8: Run server typecheck**

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: no errors (or only errors in other server files not yet updated — to be fixed in later tasks).

- [ ] **Step 9: Commit**

```bash
git add server/src/state-machine.ts server/test/state-machine.test.ts
git commit -m "feat(server): selectCard generates Movie.id; setupRound appends to movieHistory"
```

---

## Task 4: Server — New `selectFranchiseSource` state-machine function

**Files:**
- Modify: `server/src/state-machine.ts` (add new exported function after `selectCard`)
- Test: `server/test/state-machine.test.ts` (add tests to `franchise card selection` block)

**Interfaces:**
- Consumes: `Movie.id`, `Movie.franchiseSourceMovieId`, `Room.movieHistory` from Tasks 1-3.
- Produces: `selectFranchiseSource(store, room, playerId, sourceMovieId): void` — updates the player's movie's `franchiseSourceMovieId`.

- [ ] **Step 1: Write failing tests for `selectFranchiseSource`**

Add these tests to the `franchise card selection` describe block in `server/test/state-machine.test.ts`:

```ts
    it("selectFranchiseSource throws if phase is not card-selection or setup", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
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
        // Force a franchise card into the hand for the test
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
      // Inject my own movie into history to test the self-reference guard
      updated = {
        ...updated,
        movieHistory: [
          { ...myMovie, id: "own-history-id" },
        ],
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
      // Other writer selects a card so we have a movie to put in history
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const otherWriter = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, otherWriter.hand[0].id);
      updated = store.getRoom(room.code)!;
      const otherMovie = updated.movies.find((m) => m.playerId === otherWriterId)!;
      // Inject otherMovie into history
      updated = { ...updated, movieHistory: [{ ...otherMovie, id: "history-id-1" }] };
      store.saveRoom(updated);
      // Writer selects a franchise card
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
```

- [ ] **Step 2: Add `selectFranchiseSource` to imports in the test file**

In `server/test/state-machine.test.ts`, add `selectFranchiseSource` to the import from `../src/state-machine.js`:

```ts
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
```

- [ ] **Step 3: Run the new tests to verify they fail**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "selectFranchiseSource"`
Expected: FAIL — `selectFranchiseSource is not a function`.

- [ ] **Step 4: Implement `selectFranchiseSource` in `state-machine.ts`**

Add this after the `selectCard` function (around line 145):

```ts
export function selectFranchiseSource(
  store: RoomStore,
  room: Room,
  playerId: string,
  sourceMovieId: string,
): void {
  if (room.phase !== "card-selection" && room.phase !== "setup") {
    throw new Error("Cannot select franchise source outside setup or card-selection phase");
  }
  const movie = room.movies.find((m) => m.playerId === playerId);
  if (!movie) throw new Error("Player has not selected a card yet");
  if (!movie.chosenCard.isFranchise) {
    throw new Error("Selected card is not a franchise card");
  }
  const sourceMovie = room.movieHistory.find((m) => m.id === sourceMovieId);
  if (!sourceMovie) throw new Error("Source movie not found in history");
  if (sourceMovie.playerId === playerId) {
    throw new Error("Cannot reference your own previously pitched movie");
  }
  store.saveRoom({
    ...room,
    movies: room.movies.map((m) =>
      m.id === movie.id ? { ...m, franchiseSourceMovieId: sourceMovieId } : m,
    ),
  });
}
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "selectFranchiseSource"`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add server/src/state-machine.ts server/test/state-machine.test.ts
git commit -m "feat(server): add selectFranchiseSource state-machine function"
```

---

## Task 5: Server — Extend `checkAllMoviesReady` for franchise cards

**Files:**
- Modify: `server/src/state-machine.ts:155-170` (checkAllMoviesReady)
- Test: `server/test/state-machine.test.ts`

**Interfaces:**
- Consumes: `Movie.franchiseSourceMovieId`, `Room.movieHistory` from Tasks 3-4.
- Produces: `checkAllMoviesReady` does not advance to pitching if a franchise card has no source picked and movieHistory is non-empty.

- [ ] **Step 1: Write failing test for `checkAllMoviesReady` blocking on missing franchise source**

Add to the `franchise card selection` describe block:

```ts
    it("checkAllMoviesReady does not advance if franchise card has no source and history exists", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      // Inject a movie into history so movieHistory is non-empty
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
      // Writer selects a franchise card
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
      // Note giver also selects so we have all movies
      const noteGiverId = updated.noteGiverId!;
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;
      // Other writer selects too
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const ow = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, ow.hand[0].id);
      updated = store.getRoom(room.code)!;
      // Phase should NOT be pitching because writer's franchise card has no source
      expect(updated.phase).not.toBe("pitching");
    });

    it("checkAllMoviesReady advances if franchise card has no source but history is empty", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      const noteGiverId = updated.noteGiverId!;
      // Force a franchise card into writer's hand
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
      // Other writers select normally
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
      // movieHistory is empty, so franchise card with no source should still advance
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
      // Other writer selects first so we have a movie to put in history
      selectDeckType(store, updated, otherWriterId, "plot");
      updated = store.getRoom(room.code)!;
      const ow = updated.players.find((p) => p.id === otherWriterId)!;
      selectCard(store, updated, otherWriterId, ow.hand[0].id);
      updated = store.getRoom(room.code)!;
      const otherMovie = updated.movies.find((m) => m.playerId === otherWriterId)!;
      updated = { ...updated, movieHistory: [{ ...otherMovie, id: "hist-1" }] };
      store.saveRoom(updated);
      // Writer selects a franchise card
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
      // Pick the franchise source
      selectFranchiseSource(store, updated, writerId, "hist-1");
      updated = store.getRoom(room.code)!;
      // Note giver selects
      selectDeckType(store, updated, noteGiverId, "plot");
      updated = store.getRoom(room.code)!;
      const ng = updated.players.find((p) => p.id === noteGiverId)!;
      selectCard(store, updated, noteGiverId, ng.hand[0].id);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
    });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "checkAllMoviesReady"`
Expected: FAIL — first test should fail because currently `checkAllMoviesReady` doesn't check `franchiseSourceMovieId`, so it advances to pitching even without a source. (Second test should already pass since current behavior advances. Third test should already pass.)

- [ ] **Step 3: Extend `checkAllMoviesReady` in `state-machine.ts`**

Edit `checkAllMoviesReady` (around line 155):

```ts
function checkAllMoviesReady(store: RoomStore, room: Room): void {
  const writers = getWriterPlayers(room);
  const readyWriters = writers.filter((w) => {
    const movie = room.movies.find(
      (m) =>
        m.playerId === w.id &&
        m.chosenCard.id !== "" &&
        m.randomCard.id !== "",
    );
    if (!movie) return false;
    // Franchise cards require a source pick, unless history is empty (round 1)
    if (movie.chosenCard.isFranchise && room.movieHistory.length > 0) {
      return movie.franchiseSourceMovieId !== null;
    }
    return true;
  });
  if (readyWriters.length === writers.length) {
    startPitching(store, room);
  } else {
    store.saveRoom(room);
  }
}
```

- [ ] **Step 4: Run the new tests to verify they pass**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "checkAllMoviesReady"`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/state-machine.ts server/test/state-machine.test.ts
git commit -m "feat(server): checkAllMoviesReady requires franchise source when history exists"
```

---

## Task 6: Server — Clear `movieHistory` on `playAgain`

**Files:**
- Modify: `server/src/state-machine.ts` (playAgain function, around line 380)
- Test: `server/test/state-machine.test.ts`

**Interfaces:**
- Consumes: `Room.movieHistory` from Task 1.
- Produces: `playAgain` resets `movieHistory: []`.

- [ ] **Step 1: Write failing test for `playAgain` clearing `movieHistory`**

Add to the `franchise card selection` describe block:

```ts
    it("playAgain clears movieHistory", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      // Inject some movieHistory
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "playAgain clears movieHistory"`
Expected: FAIL — `updated.movieHistory` is the array we set, not cleared.

- [ ] **Step 3: Edit `playAgain` to clear `movieHistory`**

In `server/src/state-machine.ts`, edit the `playAgain` function's `store.saveRoom` call to add `movieHistory: []`:

```ts
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
      isSpectator: false,
    })),
    noteGiverId: null,
    currentPitcherId: null,
    noteGiverNotes: [],
    movies: [],
    movieHistory: [],
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "playAgain clears movieHistory"`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/state-machine.ts server/test/state-machine.test.ts
git commit -m "feat(server): playAgain clears movieHistory"
```

---

## Task 7: Server — Update `forceStart` to auto-pick franchise source

**Files:**
- Modify: `server/src/state-machine.ts:169-194` (forceStart function)
- Test: `server/test/state-machine.test.ts`

**Interfaces:**
- Consumes: `selectFranchiseSource` from Task 4, `Room.movieHistory` from Task 1.
- Produces: `forceStart` auto-picks the first available non-self source movie for unprepared franchise-card holders.

- [ ] **Step 1: Write failing test**

Add to the `franchise card selection` describe block:

```ts
    it("forceStart auto-picks franchise source for unprepared franchise holder", () => {
      const { room, playerIds } = createGameWithPlayers(["Jason", "Sarah", "Mike"]);
      startGame(store, room);
      let updated = store.getRoom(room.code)!;
      const writerId = playerIds.find((id) => id !== updated.noteGiverId)!;
      const otherWriterId = playerIds.find((id) => id !== updated.noteGiverId && id !== writerId)!;
      // Inject history with another player's movie
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
      // Force a franchise card into writer's hand
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      // Call forceStart — writer is unprepared (no deck drawn, no card selected)
      forceStart(store, updated);
      updated = store.getRoom(room.code)!;
      expect(updated.phase).toBe("pitching");
      const writerMovie = updated.movies.find((m) => m.playerId === writerId)!;
      expect(writerMovie.chosenCard.isFranchise).toBe(true);
      expect(writerMovie.franchiseSourceMovieId).toBe("hist-1");
    });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "forceStart auto-picks"`
Expected: FAIL — either `updated.phase` is not `"pitching"` (because `checkAllMoviesReady` blocked on missing franchise source) or `writerMovie.franchiseSourceMovieId` is `null`.

- [ ] **Step 3: Update `forceStart` to auto-pick franchise source**

In `server/src/state-machine.ts`, edit `forceStart` (around line 169). After the `selectCard` call inside the loop, add the auto-pick logic:

```ts
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
      (m) =>
        m.playerId === writer.id &&
        m.chosenCard.id !== "" &&
        m.randomCard.id !== "",
    );
    if (!hasMovie) {
      const updatedPlayer = current.players.find((p) => p.id === writer.id)!;
      if (updatedPlayer.hand.length > 0) {
        selectCard(store, current, writer.id, updatedPlayer.hand[0].id);
        current = store.getRoom(current.code)!;
      }
    }
    // If the selected card is a franchise card and history is non-empty, auto-pick a source
    const writerMovie = current.movies.find((m) => m.playerId === writer.id);
    if (
      writerMovie &&
      writerMovie.chosenCard.isFranchise &&
      writerMovie.franchiseSourceMovieId === null &&
      current.movieHistory.length > 0
    ) {
      const sourceMovie = current.movieHistory.find((m) => m.playerId !== writer.id);
      if (sourceMovie) {
        selectFranchiseSource(store, current, writer.id, sourceMovie.id);
        current = store.getRoom(current.code)!;
      }
    }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd server && npx vitest run test/state-machine.test.ts -t "forceStart auto-picks"`
Expected: PASS.

- [ ] **Step 5: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/src/state-machine.ts server/test/state-machine.test.ts
git commit -m "feat(server): forceStart auto-picks franchise source for unprepared writers"
```

---

## Task 8: Server — Expose `movieHistory` in state-mapper; add `select_franchise_source` socket handler

**Files:**
- Modify: `server/src/sockets/state-mapper.ts:27-50` (toPublicRoomState) and `toAudienceRoomState` (around line 75)
- Modify: `server/src/sockets/handlers.ts` (add `select_franchise_source` handler after `force_start`)
- Test: `server/test/sockets.test.ts`

**Interfaces:**
- Consumes: `selectFranchiseSource` from Task 4, `Room.movieHistory` from Task 1.
- Produces: `PublicRoomState.movieHistory` and `AudienceRoomState.movieHistory` populated; `select_franchise_source` socket event handler.

- [ ] **Step 1: Write failing socket handler test**

Add a new describe block in `server/test/sockets.test.ts` before the final closing `});`:

```ts
  describe("select_franchise_source handler", () => {
    it("rejects if player has not selected a card yet", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
      await waitForEvent<PublicRoomState>(guest, "room_joined");

      const third = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      third.on("connect", () => third.emit("join_room", hostState.code, "Mike"));
      await waitForEvent<PublicRoomState>(third, "room_joined");

      const room = store.getRoom(hostState.code)!;
      startGame(store, room);

      guest.emit("select_franchise_source", "fake-id");
      const err = await waitForEvent<string>(guest, "error");
      expect(err).toBeTruthy();

      host.disconnect();
      guest.disconnect();
      third.disconnect();
    });

    it("updates movie.franchiseSourceMovieId on valid selection", async () => {
      const host = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      host.on("connect", () => host.emit("join_room", "", "Jason"));
      const hostState = await waitForEvent<PublicRoomState>(host, "room_joined");

      const guest = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      guest.on("connect", () => guest.emit("join_room", hostState.code, "Sarah"));
      await waitForEvent<PublicRoomState>(guest, "room_joined");

      const third = ioc(`http://localhost:${port}`, { forceNew: true, transports: ["websocket"] });
      third.on("connect", () => third.emit("join_room", hostState.code, "Mike"));
      await waitForEvent<PublicRoomState>(third, "room_joined");

      const room = store.getRoom(hostState.code)!;
      startGame(store, room);
      let updated = store.getRoom(hostState.code)!;
      const writerId = updated.players.find((p) => p.name === "Sarah")!.id;
      const otherId = updated.players.find((p) => p.name === "Mike")!.id;

      // Inject a movie into history
      updated = {
        ...updated,
        movieHistory: [
          {
            id: "hist-1",
            playerId: otherId,
            chosenCard: { id: "c1", type: "plot", text: "Plot" },
            randomCard: { id: "c2", type: "character", text: "Character" },
            notesPlayed: [],
            revealed: true,
            franchiseSourceMovieId: null,
          },
        ],
      };
      store.saveRoom(updated);

      // Writer (Sarah) draws and gets a franchise card
      selectDeckType(store, updated, writerId, "plot");
      updated = store.getRoom(hostState.code)!;
      const fCard = store.getCardsByType("plot").find((c) => c.isFranchise)!;
      updated = {
        ...updated,
        players: updated.players.map((p) =>
          p.id === writerId ? { ...p, hand: [fCard, ...p.hand.slice(1)] } : p,
        ),
      };
      store.saveRoom(updated);
      selectCard(store, updated, writerId, fCard.id);

      const statePromise = waitForEvent<PublicRoomState>(guest, "room_joined");
      guest.emit("select_franchise_source", "hist-1");
      const state = await statePromise;
      const myMovie = state.movies.find((m) => m.playerId === writerId);
      expect(myMovie).toBeDefined();
      expect(myMovie!.franchiseSourceMovieId).toBe("hist-1");

      host.disconnect();
      guest.disconnect();
      third.disconnect();
    }, 15000);
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd server && npx vitest run test/sockets.test.ts -t "select_franchise_source"`
Expected: FAIL — the first test should error with something else (since the handler doesn't exist, the server emits an error like "Cannot select franchise source outside..." but the test just checks `err` is truthy — that may actually pass spuriously). The second test should FAIL because `select_franchise_source` event is not handled, so no `room_joined` re-broadcast occurs.

- [ ] **Step 3: Add `movieHistory` to `toPublicRoomState` and `toAudienceRoomState` in `state-mapper.ts`**

In `server/src/sockets/state-mapper.ts`, edit `toPublicRoomState` (around line 27). Add `movieHistory: room.movieHistory` after `movies: room.movies.filter((m) => m.revealed),`:

```ts
export function toPublicRoomState(room: Room, playerId: string | null): PublicRoomState {
  const player = playerId ? room.players.find((p) => p.id === playerId) : null;
  const isNoteGiver = player?.id === room.noteGiverId;
  const myMovie = playerId ? room.movies.find((m) => m.playerId === playerId) : null;
  return {
    code: room.code,
    phase: room.phase,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      isNoteGiver: p.isNoteGiver,
      isHost: p.isHost,
      score: p.score,
      isDisconnected: p.isDisconnected,
      isSpectator: p.isSpectator,
    })),
    noteGiverId: room.noteGiverId,
    currentPitcherId: room.currentPitcherId,
    timer: room.timer,
    round: room.round,
    totalRounds: room.totalRounds,
    movies: room.movies.filter((m) => m.revealed),
    movieHistory: room.movieHistory,
    myPlayerId: playerId,
    myHand: player ? player.hand : null,
    // ... rest unchanged ...
  };
}
```

Edit `toAudienceRoomState` similarly — add `movieHistory: room.movieHistory` after `movies: visibleMovies,`:

```ts
export function toAudienceRoomState(room: Room, audienceId: string): AudienceRoomState {
  // ... existing ...
  return {
    // ... existing ...
    movies: visibleMovies,
    movieHistory: room.movieHistory,
    scoreboard: room.players.map((p) => ({ playerId: p.id, name: p.name, score: p.score })),
    // ... rest unchanged ...
  };
}
```

- [ ] **Step 4: Add `select_franchise_source` socket handler in `handlers.ts`**

In `server/src/sockets/handlers.ts`, add `selectFranchiseSource` to the import from `../state-machine.js`:

```ts
import {
  startGame,
  selectDeckType,
  selectCard,
  revealMovie,
  endPitch,
  playNote,
  castVote,
  tallyAndAdvance,
  playAgain,
  forceStart,
  selectFranchiseSource,
} from "../state-machine.js";
```

Add a new socket handler immediately after the `force_start` handler (before `play_again`):

```ts
    socket.on("select_franchise_source", (sourceMovieId: string) => {
      if (!checkSocketEventRate(socket)) return;
      const ctx = getPlayerContext(socket.id, store);
      if (!ctx) return;
      try {
        selectFranchiseSource(store, ctx.room, ctx.playerId, sourceMovieId);
        broadcastAllStates(io, store.getRoom(ctx.room.code)!);
      } catch (err) {
        socket.emit("error", (err as Error).message);
      }
    });

    socket.on("play_again", () => {
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd server && npx vitest run test/sockets.test.ts -t "select_franchise_source"`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full server test suite + typecheck**

Run: `cd server && npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit -p server/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add server/src/sockets/state-mapper.ts server/src/sockets/handlers.ts server/test/sockets.test.ts
git commit -m "feat(server): expose movieHistory + select_franchise_source socket handler"
```

---

## Task 9: Client — Add `selectFranchiseSource` to `useRoom` hook

**Files:**
- Modify: `client/src/hooks/useRoom.ts`

**Interfaces:**
- Consumes: `ClientToServerEvents.select_franchise_source` from Task 1.
- Produces: `useRoom()` returns `{ ..., selectFranchiseSource: (sourceMovieId: string) => void, ... }`.

- [ ] **Step 1: Edit `useRoom.ts` to add `selectFranchiseSource` callback**

In `client/src/hooks/useRoom.ts`, add the callback after `forceStart`:

```ts
  const forceStart = useCallback(() => {
    socket.emit("force_start");
  }, []);
  const selectFranchiseSource = useCallback((sourceMovieId: string) => {
    socket.emit("select_franchise_source", sourceMovieId);
  }, []);
```

And add `selectFranchiseSource` to the returned object:

```ts
  return {
    roomState,
    error,
    joinRoom,
    joinAudience,
    startGame,
    selectDeckType,
    selectCard,
    revealMovie,
    startTimer,
    pauseTimer,
    playNote,
    endPitch,
    castVote,
    playAgain,
    setFranchiseEnabled,
    setTotalRounds,
    kickPlayer,
    forceStart,
    selectFranchiseSource,
    leaveGame,
  };
}
```

- [ ] **Step 2: Run client typecheck**

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors (or only errors in other client files not yet updated).

- [ ] **Step 3: Commit**

```bash
git add client/src/hooks/useRoom.ts
git commit -m "feat(client): add selectFranchiseSource to useRoom hook"
```

---

## Task 10: Client — `WriterControls` franchise picker

**Files:**
- Modify: `client/src/components/WriterControls.tsx`
- Test: `client/test/WriterControls.test.tsx`

**Interfaces:**
- Consumes: `Movie`, `PublicPlayer` from `@direct-to-video/shared`.
- Produces: `WriterControls` renders a picker when `selectedCard?.isFranchise && movieHistory.length > 0`; Ready button disabled until `franchiseSourceMovieId` is set.

- [ ] **Step 1: Write failing tests for the franchise picker**

Add these tests to `client/test/WriterControls.test.tsx`. First, add the new required props to the existing render helper or write fresh renders. Add the imports at the top:

```ts
import type { Movie as MovieType, Card as CardType } from "@direct-to-video/shared";
```

Add these tests inside the existing `describe("WriterControls")` block:

```ts
  it("renders franchise picker when selected card is franchise and history is non-empty", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).toContain("Pick a previously pitched movie");
    expect(container.textContent).toContain("Other player's plot");
  });

  it("does not render franchise picker when movieHistory is empty", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("Pick a previously pitched movie");
  });

  it("disables Ready button when franchise card has no source and history exists", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    const readyButton = screen.getByText("Ready to Pitch");
    expect(readyButton).toHaveAttribute("disabled");
  });

  it("enables Ready button when franchise source is picked", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId="h1"
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    const readyButton = screen.getByText("Ready to Pitch");
    expect(readyButton).not.toHaveAttribute("disabled");
  });

  it("filters own movies from the franchise picker", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const ownHistoryMovie: MovieType = {
      id: "h-own",
      playerId: "me",
      chosenCard: { id: "hc1", type: "plot", text: "My own prior plot" },
      randomCard: { id: "hc2", type: "character", text: "My own character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const otherHistoryMovie: MovieType = {
      id: "h-other",
      playerId: "other-player",
      chosenCard: { id: "hc3", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc4", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const { container } = render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[ownHistoryMovie, otherHistoryMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
      />,
    );
    expect(container.textContent).not.toContain("My own prior plot");
    expect(container.textContent).toContain("Other player's plot");
  });

  it("calls onSelectFranchiseSource when a prior movie is clicked", () => {
    const franchiseCard: CardType = {
      id: "f1",
      type: "plot",
      text: "Choose a plot previously pitched by another player.",
      header: "FRANCHISE PITCH:",
      isFranchise: true,
    };
    const historyMovie: MovieType = {
      id: "h1",
      playerId: "other-player",
      chosenCard: { id: "hc1", type: "plot", text: "Other player's plot" },
      randomCard: { id: "hc2", type: "character", text: "Other player's character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const onSelect = vi.fn();
    render(
      <WriterControls
        hand={[franchiseCard]}
        selectedCard={franchiseCard}
        hasSelectedCard={true}
        hasDrawnBlind={false}
        blindCard={null}
        blindRevealed={false}
        onSelectCard={() => {}}
        onReady={() => {}}
        movieHistory={[historyMovie]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={onSelect}
      />,
    );
    fireEvent.click(screen.getByText(/Other player's plot/));
    expect(onSelect).toHaveBeenCalledWith("h1");
  });
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `cd client && npx vitest run test/WriterControls.test.tsx -t "franchise picker"`
Expected: FAIL — `WriterControls` doesn't accept the new props; the picker is not rendered.

- [ ] **Step 3: Update `WriterControls` to accept new props and render the picker**

In `client/src/components/WriterControls.tsx`, replace the entire file content:

```tsx
import type { Card as CardType, DeckType, Movie as MovieType } from "@direct-to-video/shared";
import { Card } from "./Card.js";

interface WriterControlsProps {
  hand: CardType[];
  selectedCard: CardType | null;
  hasSelectedCard: boolean;
  hasDrawnBlind: boolean;
  blindCard: CardType | null;
  blindRevealed: boolean;
  onSelectCard: (cardId: string) => void;
  onReady: () => void;
  movieHistory: MovieType[];
  franchiseSourceMovieId: string | null;
  myPlayerId: string;
  onSelectFranchiseSource: (sourceMovieId: string) => void;
}

export function WriterControls({
  hand,
  selectedCard,
  hasSelectedCard,
  hasDrawnBlind: _hasDrawnBlind,
  blindCard,
  blindRevealed,
  onSelectCard,
  onReady,
  movieHistory,
  franchiseSourceMovieId,
  myPlayerId,
  onSelectFranchiseSource,
}: WriterControlsProps) {
  const blindDeckType: DeckType = selectedCard?.type === "plot" ? "character" : "plot";
  const isFranchiseCard = selectedCard?.isFranchise === true;
  const showFranchisePicker = isFranchiseCard && movieHistory.length > 0;
  const franchiseSelectionMissing = showFranchisePicker && !franchiseSourceMovieId;
  const readyDisabled = franchiseSelectionMissing === true;

  const pickableHistory = movieHistory.filter((m) => m.playerId !== myPlayerId);

  const renderFranchisePicker = () => (
    <div className="franchise-picker">
      <h4>Pick a previously pitched movie</h4>
      <ul className="franchise-history-list">
        {pickableHistory.map((m) => (
          <li key={m.id}>
            <button
              className={`franchise-history-item${
                franchiseSourceMovieId === m.id ? " selected" : ""
              }`}
              onClick={() => onSelectFranchiseSource(m.id)}
            >
              <span className="franchise-history-text">{m.chosenCard.text}</span>
              <span className="franchise-history-blind"> + {m.randomCard.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="writer-controls">
      {!hasSelectedCard && (
        <>
          <h3>Your Hand — click a card to play it</h3>
          <div className="card-row">
            {hand.map((card) => (
              <Card key={card.id} card={card} onClick={() => onSelectCard(card.id)} />
            ))}
          </div>
        </>
      )}
      {hasSelectedCard && selectedCard && !blindRevealed && (
        <>
          <h3>Your Movie</h3>
          <div className="movie-cards">
            {selectedCard.type === "character" ? (
              <>
                <Card card={selectedCard} />
                <Card
                  card={blindCard || { id: "blank", type: blindDeckType, text: "" }}
                  faceDown={true}
                />
              </>
            ) : (
              <>
                <Card
                  card={blindCard || { id: "blank", type: blindDeckType, text: "" }}
                  faceDown={true}
                />
                <Card card={selectedCard} />
              </>
            )}
          </div>
          <div className="blind-draw-controls">
            <p>Your blind card will be revealed when you start pitching!</p>
          </div>
          {showFranchisePicker && renderFranchisePicker()}
          <button className="btn-ready" onClick={onReady} disabled={readyDisabled}>
            Ready to Pitch
          </button>
        </>
      )}
      {hasSelectedCard && selectedCard && blindRevealed && blindCard && (
        <>
          <h3>Your Movie</h3>
          <div className="movie-cards">
            {selectedCard.type === "character" ? (
              <>
                <Card card={selectedCard} />
                <Card card={blindCard} />
              </>
            ) : (
              <>
                <Card card={blindCard} />
                <Card card={selectedCard} />
              </>
            )}
          </div>
          {showFranchisePicker && renderFranchisePicker()}
          <button className="btn-ready" onClick={onReady} disabled={readyDisabled}>
            Ready to Pitch
          </button>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update existing tests in `WriterControls.test.tsx` to pass the new required props**

Every existing `render(<WriterControls ... />)` call in `client/test/WriterControls.test.tsx` must add the new props. For each existing render, add:

```ts
        movieHistory={[]}
        franchiseSourceMovieId={null}
        myPlayerId="me"
        onSelectFranchiseSource={() => {}}
```

- [ ] **Step 5: Run the new tests to verify they pass**

Run: `cd client && npx vitest run test/WriterControls.test.tsx`
Expected: PASS (all tests including the 6 new franchise picker tests).

- [ ] **Step 6: Run the full client test suite + typecheck**

Run: `cd client && npx vitest run`
Expected: all tests pass (Game.test.tsx may need updates — see Task 11).

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: errors in `Game.tsx` because it passes old props to `WriterControls` — to be fixed in Task 11.

- [ ] **Step 7: Commit**

```bash
git add client/src/components/WriterControls.tsx client/test/WriterControls.test.tsx
git commit -m "feat(client): WriterControls franchise card picker UI"
```

---

## Task 11: Client — Wire `WriterControls` and `MovieReveal` into `Game.tsx` and `Audience.tsx`

**Files:**
- Modify: `client/src/pages/Game.tsx`
- Modify: `client/src/pages/Audience.tsx`
- Modify: `client/src/components/MovieReveal.tsx`
- Modify: `client/test/Game.test.tsx` (update mockState to include `movieHistory: []`)

**Interfaces:**
- Consumes: `WriterControls` new props from Task 10, `selectFranchiseSource` from Task 9, `PublicRoomState.movieHistory` from Task 1.
- Produces: `Game.tsx` passes `movieHistory` + `franchiseSourceMovieId` + `myPlayerId` + `onSelectFranchiseSource` to `WriterControls`; `Game.tsx` and `Audience.tsx` pass `movieHistory` to `MovieReveal`.

- [ ] **Step 1: Update `MovieReveal` to accept optional `movieHistory` and render the referenced movie**

Replace `client/src/components/MovieReveal.tsx` with:

```tsx
import type { Movie as MovieType } from "@direct-to-video/shared";
import { Card } from "./Card.js";

interface MovieRevealProps {
  movie: MovieType;
  large?: boolean;
  blindFaceDown?: boolean;
  movieHistory?: MovieType[];
}

export function MovieReveal({ movie, large = false, blindFaceDown = false, movieHistory = [] }: MovieRevealProps) {
  const cards = [movie.chosenCard, movie.randomCard];
  const characterFirst = [...cards].sort((a, b) => {
    if (a.type === "character" && b.type !== "character") return -1;
    if (b.type === "character" && a.type !== "character") return 1;
    return 0;
  });

  const referencedMovie = movie.franchiseSourceMovieId
    ? movieHistory.find((m) => m.id === movie.franchiseSourceMovieId)
    : null;

  return (
    <div className="movie-reveal">
      <div className="movie-cards">
        {characterFirst.map((card, i) => (
          <Card
            key={card.id + i}
            card={card}
            large={large}
            faceDown={blindFaceDown && card.id === movie.randomCard.id}
          />
        ))}
      </div>
      {referencedMovie && (
        <div className="franchise-reference">
          <h4>References:</h4>
          <div className="movie-cards">
            {[referencedMovie.chosenCard, referencedMovie.randomCard].map((card, i) => (
              <Card key={card.id + i} card={card} />
            ))}
          </div>
        </div>
      )}
      {movie.notesPlayed.length > 0 && (
        <div className="movie-notes">
          <h4>Notes from Note Giver:</h4>
          {movie.notesPlayed.map((note) => (
            <Card key={note.id} card={note} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update `Game.tsx` to pass new props to `WriterControls`**

In `client/src/pages/Game.tsx`, find each `<WriterControls ... />` usage (there are two — one in the note-giver waiting view, one in the writer card-selection view). For each, add the new props:

```tsx
          <WriterControls
            hand={state.myHand || []}
            selectedCard={state.myChosenCard}
            hasSelectedCard={hasSelectedCard}
            hasDrawnBlind={hasDrawnBlind}
            blindCard={state.myBlindCard}
            blindRevealed={false}
            onSelectCard={room.selectCard}
            onReady={room.revealMovie}
            movieHistory={state.movieHistory}
            franchiseSourceMovieId={
              state.movies.find((m) => m.playerId === state.myPlayerId)?.franchiseSourceMovieId ?? null
            }
            myPlayerId={state.myPlayerId ?? ""}
            onSelectFranchiseSource={room.selectFranchiseSource}
          />
```

Do the same for the note-giver's `<WriterControls ... />` usage.

- [ ] **Step 3: Update `Game.tsx` to pass `movieHistory` to `MovieReveal`**

Find each `<MovieReveal movie={...} />` usage in `client/src/pages/Game.tsx` (there are 3 — `RoundWinnerBanner`, current pitcher reveal, round-end voting list). Add `movieHistory={state.movieHistory}`:

```tsx
<MovieReveal movie={currentMovie} large={true} blindFaceDown={!timerStarted} movieHistory={state.movieHistory} />
```

```tsx
<MovieReveal movie={movie} movieHistory={state.movieHistory} />
```

For the `RoundWinnerBanner` component (defined at the top of `Game.tsx`), add `movieHistory` to its props and pass it through.

- [ ] **Step 4: Update `Audience.tsx` to pass `movieHistory` to `MovieReveal`**

Same treatment in `client/src/pages/Audience.tsx` — add `movieHistory={state.movieHistory}` to each `<MovieReveal />` usage.

- [ ] **Step 5: Update `Game.test.tsx` `baseState` to include `movieHistory: []`**

In `client/test/Game.test.tsx`, add `movieHistory: []` to the `baseState` object (after `movies: []`):

```ts
const baseState: PublicRoomState = {
  code: "ABCD",
  phase: "lobby",
  // ... existing ...
  movies: [],
  movieHistory: [],
  // ... rest ...
};
```

Also add `selectFranchiseSource: vi.fn()` to `mockFns`:

```ts
const mockFns = {
  joinRoom: vi.fn(),
  startGame: vi.fn(),
  selectDeckType: vi.fn(),
  selectCard: vi.fn(),
  revealMovie: vi.fn(),
  startTimer: vi.fn(),
  pauseTimer: vi.fn(),
  playNote: vi.fn(),
  endPitch: vi.fn(),
  castVote: vi.fn(),
  playAgain: vi.fn(),
  setFranchiseEnabled: vi.fn(),
  setTotalRounds: vi.fn(),
  kickPlayer: vi.fn(),
  forceStart: vi.fn(),
  selectFranchiseSource: vi.fn(),
  leaveGame: vi.fn(),
};
```

- [ ] **Step 6: Run the full client test suite + typecheck**

Run: `cd client && npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 7: Run lint + format**

Run: `npm run lint:fix && npm run format`
Expected: lint exits 0 (4 react-hooks warnings allowed); format succeeds.

- [ ] **Step 8: Commit**

```bash
git add client/src/components/MovieReveal.tsx client/src/pages/Game.tsx client/src/pages/Audience.tsx client/test/Game.test.tsx
git commit -m "feat(client): wire franchise picker and referenced-movie reveal into Game and Audience"
```

---

## Task 12: Add `MovieReveal` test for referenced movie rendering

**Files:**
- Test: `client/test/MovieReveal.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to `client/test/MovieReveal.test.tsx` (inside the existing `describe("MovieReveal")` block):

```ts
  it("renders referenced movie when franchiseSourceMovieId is set", () => {
    const movie: Movie = {
      id: "m1",
      playerId: "p1",
      chosenCard: { id: "c1", type: "plot", text: "Franchise plot", isFranchise: true },
      randomCard: { id: "c2", type: "character", text: "Random character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: "hist-1",
    };
    const movieHistory: Movie[] = [
      {
        id: "hist-1",
        playerId: "p2",
        chosenCard: { id: "hc1", type: "plot", text: "Prior plot" },
        randomCard: { id: "hc2", type: "character", text: "Prior character" },
        notesPlayed: [],
        revealed: true,
        franchiseSourceMovieId: null,
      },
    ];
    const { container } = render(<MovieReveal movie={movie} movieHistory={movieHistory} />);
    expect(container.textContent).toContain("References:");
    expect(container.textContent).toContain("Prior plot");
    expect(container.textContent).toContain("Prior character");
  });

  it("does not render referenced movie when franchiseSourceMovieId is null", () => {
    const movie: Movie = {
      id: "m1",
      playerId: "p1",
      chosenCard: { id: "c1", type: "plot", text: "Regular plot" },
      randomCard: { id: "c2", type: "character", text: "Random character" },
      notesPlayed: [],
      revealed: true,
      franchiseSourceMovieId: null,
    };
    const movieHistory: Movie[] = [
      {
        id: "hist-1",
        playerId: "p2",
        chosenCard: { id: "hc1", type: "plot", text: "Prior plot" },
        randomCard: { id: "hc2", type: "character", text: "Prior character" },
        notesPlayed: [],
        revealed: true,
        franchiseSourceMovieId: null,
      },
    ];
    const { container } = render(<MovieReveal movie={movie} movieHistory={movieHistory} />);
    expect(container.textContent).not.toContain("References:");
  });
```

Update the existing `Movie` imports at the top of the test file to ensure `Movie` is imported (it already is per the existing test file).

Update existing tests in `MovieReveal.test.tsx` — they will need to add `id: "m1"` and `franchiseSourceMovieId: null` to any `Movie` objects they construct. Check the file and update each `Movie` literal.

- [ ] **Step 2: Run the new tests to verify they pass**

Run: `cd client && npx vitest run test/MovieReveal.test.tsx`
Expected: PASS (all tests including the 2 new ones).

- [ ] **Step 3: Commit**

```bash
git add client/test/MovieReveal.test.tsx
git commit -m "test(client): MovieReveal renders referenced franchise movie"
```

---

## Task 13: Final verification — full suite, lint, build, E2E smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full server test suite**

Run: `cd server && npx vitest run`
Expected: all tests pass (was 153 before; should be 153 + new franchise tests = ~165).

- [ ] **Step 2: Run the full client test suite**

Run: `cd client && npx vitest run`
Expected: all tests pass (was 82 before; should be 82 + new franchise tests = ~90).

- [ ] **Step 3: Run both typechecks**

Run: `npx tsc --noEmit -p server/tsconfig.json && npx tsc --noEmit -p client/tsconfig.json`
Expected: no errors.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: exits 0 (4 intentional react-hooks warnings allowed).

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 6: Run E2E suite**

Run: `npm run build && npx playwright test --config e2e/playwright.config.ts --reporter=line`
Expected: 13 tests pass (existing franchise-cards journey test should still pass; franchise cards in round 1 with no history behave as before).

- [ ] **Step 7: Update AGENTS.md**

In `AGENTS.md`, under "Features Working", add:

```
- Franchise card enhancement: players holding a franchise card pick a previously pitched movie via UI during card-selection; referenced movie displayed alongside the franchise pitch on reveal; franchise source auto-picked on force-start
```

Under "Future Scope", remove the "Franchise card enhancement" bullet.

Update the test counts in the test table to match the new totals.

Update the Status snapshot line to `v2.1.3` and update the test count.

- [ ] **Step 8: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for franchise card enhancement (v2.1.3)"
```

- [ ] **Step 9: Push**

```bash
git push origin master
```

---

## Self-Review

**Spec coverage:**
- Movie.id, Movie.franchiseSourceMovieId, Room.movieHistory, PublicRoomState.movieHistory, AudienceRoomState.movieHistory → Task 1
- createEmptyRoom init → Task 2
- setupRound appends to history → Task 3
- selectCard generates id + null franchiseSourceMovieId → Task 3
- selectFranchiseSource state-machine function → Task 4
- checkAllMoviesReady extended → Task 5
- playAgain clears history → Task 6
- forceStart auto-picks source → Task 7
- state-mapper exposes movieHistory → Task 8
- select_franchise_source socket handler → Task 8
- useRoom.selectFranchiseSource → Task 9
- WriterControls franchise picker → Task 10
- Game.tsx + Audience.tsx wiring → Task 11
- MovieReveal renders referenced movie → Task 11, Task 12
- All tests + lint + build + E2E + docs → Task 13

**Placeholder scan:** None. Every step has complete code or commands.

**Type consistency:**
- `Movie.id: string` — used in Task 3 (nanoid), Task 4 (lookup by id), Task 10 (key + onClick), Task 11 (lookup in movieHistory).
- `Movie.franchiseSourceMovieId: string | null` — used consistently.
- `selectFranchiseSource(store, room, playerId, sourceMovieId)` — same signature in Task 4, Task 7 (forceStart calls it), Task 8 (socket handler calls it), Task 9 (client emit), Task 10 (prop), Task 11 (prop wiring).
- `select_franchise_source: (sourceMovieId: string) => void` — same event name in Task 1, Task 8, Task 9.

All consistent. Plan is complete.