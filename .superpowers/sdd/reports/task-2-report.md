# Task 2 Report: SQLite Database & Card Seeding

## What I Implemented

- **server/src/seed-cards.ts** — 10 placeholder card texts per deck (plot, character, note) with `getSeedCards()` exporter.
- **server/src/db.ts** — SQLite setup via better-sqlite3:
  - `initDb(path)` → creates tables (`rooms`, `cards`), returns `{ db, saveRoom, loadRoom, getCardDeck }`
  - `seedCards(db)` → idempotent insert of 30 cards (10 × 3 decks), skips if rows exist
  - `getCardDeck(db, type)` → standalone function querying cards by type
  - Room state stored as JSON blob in `rooms.state` with upsert on save
- **server/test/db.test.ts** — 5 tests covering card seeding (plot/character/note), idempotent re-seed guard, room save/load round-trip.

### Deviation from brief
The brief defined `getCardDeck` only as a method on the `DbHandle` return object, but the test imports it as a standalone named export (`import { getCardDeck } from "../src/db.js"`). I exported `getCardDeck` as a top-level function AND included it in the `DbHandle` return so both usages work. This is consistent with the test's expectation and the brief's interface contract.

## TDD Evidence

### RED — before implementation
Command: `cd server && npx vitest run test/db.test.ts`
```
 FAIL  test/db.test.ts [ test/db.test.ts ]
Error: Failed to load url ../src/db.js (resolved id: ../src/db.js) in
/home/jason/Repos/movie-pitch/server/test/db.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

### GREEN — after implementation
Command: `cd server && npx vitest run test/db.test.ts`
```
 ✓ test/db.test.ts  (5 tests) 5ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Test Results

All 5 tests pass:
- seeds 10 plot cards ✓
- seeds 10 character cards ✓
- seeds 10 note cards ✓
- does not re-seed if cards already exist ✓
- saves and loads a room ✓

TypeScript typecheck: `npx tsc -p server/tsconfig.json --noEmit` → exit 0 (no errors)

## Files Changed

- `server/src/seed-cards.ts` (new)
- `server/src/db.ts` (new)
- `server/test/db.test.ts` (new)

## Self-Review Findings

- **Completeness:** All spec requirements met — 3 files created, all interfaces produced, 30 cards seeded, idempotent seeding, room save/load.
- **Quality:** Clean separation between seed data and DB logic. Standalone `getCardDeck` satisfies both the test's import style and the handle-based interface.
- **Discipline:** No overbuilding — exactly what the brief specifies, nothing more.
- **Testing:** Tests verify real behavior (actual SQLite queries, actual JSON round-trip), not mocks. Output is pristine with no stray warnings.

## Issues or Concerns

None.

---

## Fix: Add `getAllRooms` to DbHandle

### Problem
The brief's prose contract lists `getAllRooms` as a produced interface, but the code template omitted it. Task 6 (Socket.IO server) needs this method for the timer tick loop to iterate over all active rooms.

### TDD Evidence

**RED** — wrote test `getAllRooms returns all saved rooms` before implementation:
```
FAIL  test/db.test.ts > database > getAllRooms returns all saved rooms
TypeError: handle.getAllRooms is not a function
```

**GREEN** — after adding `getAllRooms` to interface, implementing query, and including in return:
```
 ✓ test/db.test.ts  (6 tests) 6ms
 Test Files  1 passed (1)
      Tests  6 passed (6)
```

### Changes
- `server/src/db.ts`:
  - Added `getAllRooms: () => Room[]` to `DbHandle` interface
  - Added prepared statement `SELECT state FROM rooms`
  - Added `getAllRoomsFn()` — queries all rooms, parses each as `Room`, returns array
  - Included `getAllRooms: getAllRoomsFn` in `initDb` return object
- `server/test/db.test.ts`: Added test verifying `getAllRooms` returns all 3 saved rooms with correct codes

### Verification
- `npx vitest run test/db.test.ts` → 6/6 tests pass ✓
- `npx tsc --noEmit -p server/tsconfig.json` → exit 0 (no errors) ✓