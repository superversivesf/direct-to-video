# Refactor: Bug-Risk Reduction Pass

**Date:** 2026-07-15
**Status:** Approved design
**Motivation:** Reduce bug risk by eliminating duplication and splitting oversized files
**Scope:** Conservative — same architecture, no behavior changes, 159 tests as safety net

## Problem Summary

The codebase is production-tested (20 players, 20 rounds) with all 159 tests passing. However, five areas carry bug risk through duplication or oversized files:

1. **Auto-draw substitution** — ~15-line `____` placeholder resolution block copy-pasted between `selectCard` and `playNote` in `state-machine.ts`. A bug in one could diverge from the other.
2. **Weighted vote computation** — exec-2x weighting implemented independently in `sockets.ts:computeVoteCounts` and `state-machine.ts:tallyVotes`. They could silently disagree.
3. **Host succession** — game logic inline in the socket disconnect handler, mixed with transport concerns.
4. **`sockets.ts` (650 lines)** — rate limiting, socket tracking, state serialization, broadcasting, 12 event handlers, timer tick loop, and disconnect logic all in one file.
5. **Timer state construction** — the `TimerState` object literal reconstructed 6+ times across `useRoom.ts` and `useAudience.ts` with subtle variations. Adding a field to `TimerState` requires updating every literal; missing one is a silent bug.

## Design

### 1. Extract auto-draw substitution → `server/src/card-ops.ts`

Extract the `____` placeholder substitution logic that is duplicated between `selectCard` (state-machine.ts) and `playNote` (state-machine.ts) into a single pure function.

```ts
// server/src/card-ops.ts
import type { Card, Room } from "@direct-to-video/shared";
import type { RoomStore } from "./rooms.js";

export function substituteDraws(
  store: RoomStore,
  deck: Room["deck"],
  card: Card,
  room: Room
): { card: Card; deck: Room["deck"] } {
  // Iterates card.draws, draws from the appropriate deck, replaces "____" placeholders.
  // Returns the card with substitutedText set and the updated deck state.
  // If card has no draws, returns it unchanged.
}
```

Both `selectCard` and `playNote` call this function instead of inline loops. The function is pure (input deck → output deck + card), testable in isolation.

**Call site changes:**
- `state-machine.ts:selectCard` — replace lines 108-122 with `const { card: chosenCard, deck: updatedDeck } = substituteDraws(store, room.deck, card, room)`
- `state-machine.ts:playNote` — replace lines 200-214 with the same call

**Tests:** New `server/test/card-ops.test.ts` — single draw, multiple draws, multi-count draws, empty deck fallback, no-draws card. Existing state-machine tests verify call sites still work.

### 2. Extract weighted vote computation → shared function

Extract the executive-2x weighted vote counting into one source-of-truth function in `state-machine.ts`:

```ts
// server/src/state-machine.ts
export function weightedVoteCounts(room: Room): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const [voterId, votedFor] of Object.entries(room.votes)) {
    const weight = voterId === room.executiveId ? 2 : 1;
    counts[votedFor] = (counts[votedFor] || 0) + weight;
  }
  return counts;
}
```

Consumers:
- `tallyVotes` (state-machine.ts) calls `weightedVoteCounts` then picks winner from the map
- `computeVoteCounts` (sockets.ts) calls `weightedVoteCounts` and maps to `{ playerId, votes }[]` for broadcasting

One weighting rule, two thin consumers.

**Tests:** Add unit test for `weightedVoteCounts` directly — exec 2x, audience 1x, no votes, multiple votes. Existing sockets voting tests (6 tests) and state-machine voting tests cover both paths.

### 3. Extract host succession → `rooms.ts`

Move host promotion logic out of the socket disconnect handler into a pure function in `rooms.ts`:

```ts
// server/src/rooms.ts
export function promoteNextHost(room: Room, leavingPlayerId: string): Room {
  const leavingPlayer = room.players.find((p) => p.id === leavingPlayerId);
  if (!leavingPlayer?.isHost) return room;
  const nextHost = room.players.find((p) => !p.isDisconnected && p.id !== leavingPlayerId);
  if (!nextHost) return room;
  return {
    ...room,
    players: room.players.map((p) =>
      p.id === nextHost.id ? { ...p, isHost: true } : p
    ),
  };
}
```

The disconnect handler in `sockets/handlers.ts` calls `promoteNextHost(updated, playerId)` — one line replacing the inline block.

**Tests:** Add to `server/test/rooms.test.ts` — host leaves → first connected player promoted; host leaves, no one else connected → no promotion; non-host leaves → no change; disconnected players skipped for promotion.

### 4. Split `sockets.ts` → `server/src/sockets/` directory

Split the 650-line file into three focused files:

```
server/src/sockets/
├── rate-limits.ts    (~80 lines)
├── state-mapper.ts   (~70 lines)
└── handlers.ts       (~350 lines)
```

**`rate-limits.ts`** — connection, join, and socket event rate limiting:
- Exports: `resetRateLimits`, `checkConnectionLimit`, `releaseConnection`, `checkJoinRateLimit`, `checkSocketEventRate`
- Self-contained: uses only `socket.handshake.address` and `socket.id`
- Constants: `MAX_CONNECTIONS_PER_IP`, `MAX_JOIN_ATTEMPTS_PER_IP`, `JOIN_WINDOW_MS`, `SOCKET_EVENT_WINDOW_MS`, `MAX_SOCKET_EVENTS`

**`state-mapper.ts`** — state serialization and broadcasting:
- Exports: `toPublicRoomState`, `toAudienceRoomState`, `broadcastAllStates`, `broadcastPlayerList`, `computeVoteCounts` (delegates to `weightedVoteCounts`)
- Owns: `playerSockets`, `audienceSockets` tracking maps, `countAudience`, `getPlayerContext`, `findRoomBySocket`
- Imports: `weightedVoteCounts` from state-machine

**`handlers.ts`** — event handlers and timer loop:
- Exports: `setupSocketHandlers(io, store)` — the only public API
- Imports: rate-limit checks from `rate-limits.ts`, state mappers + tracking from `state-mapper.ts`, `promoteNextHost` from `rooms.ts`
- Contains: timer tick interval, 12 event handlers, disconnect handler

**What stays the same:**
- `index.ts` imports `setupSocketHandlers` from `./sockets/handlers.js` (path changes, signature identical)
- `setupSocketHandlers` is the only export the rest of the codebase calls
- All behavior identical — this is a pure file split

**Tests:** Existing 4 socket tests + 6 audience voting tests + 3 timer-pause edge case tests run unchanged. They import `setupSocketHandlers` from the new path.

### 5. Extract timer state constructor → `shared/timer-helpers.ts`

Extract the repeated `TimerState` object literals from `useRoom.ts` and `useAudience.ts` into constructor helpers:

```ts
// shared/timer-helpers.ts
import type { TimerState } from "./types.js";

export function timerRunning(secondsRemaining: number): TimerState {
  return { running: true, secondsRemaining, pausedAt: null, pausedForNote: false, noteResumeAt: null };
}

export function timerIdle(secondsRemaining: number): TimerState {
  return { running: false, secondsRemaining, pausedAt: null, pausedForNote: false, noteResumeAt: null };
}

export function timerPaused(remainingSeconds: number): TimerState {
  return { running: false, secondsRemaining: remainingSeconds, pausedAt: Date.now(), pausedForNote: false, noteResumeAt: null };
}

export function timerExpired(): TimerState {
  return { running: false, secondsRemaining: 0, pausedAt: null, pausedForNote: false, noteResumeAt: null };
}
```

Consumers:
- `useRoom.ts` — 6 socket event handlers (`timer_started`, `timer_tick`, `timer_paused`, `timer_expired`, `voting_started`) replace inline literals
- `useAudience.ts` — same 5 timer event handlers replace inline literals

Server's `timer.ts` functions (`createTimer`, `startTimer`, `pauseTimer`) stay as-is — they are server-side pure state transitions, not event-reconstruction helpers.

**Tests:** New `shared/timer-helpers.test.ts` — 4 assertions, each helper returns the right shape. Existing `useRoom`/`useAudience` tests (via `Game.test.tsx` 16 tests) cover the integration.

## What This Refactor Does NOT Do

- No architectural changes — same Express + Socket.IO + React structure
- No new abstractions or layers — just extraction of existing logic
- No changes to `Game.tsx` (264 lines) — stays as monolithic phase router
- No changes to `useRoom.ts` hook structure — the two hooks stay separate
- No new dependencies
- No changes to the socket event protocol
- No changes to the database schema or persistence layer

## Files Changed

| File | Change |
|------|--------|
| `server/src/card-ops.ts` | **New** — `substituteDraws` function |
| `server/src/state-machine.ts` | Remove duplicate substitution from `selectCard` + `playNote`, call `substituteDraws`. Add `weightedVoteCounts`, refactor `tallyVotes` to use it. Export `weightedVoteCounts`. |
| `server/src/rooms.ts` | Add `promoteNextHost` function |
| `server/src/sockets.ts` | **Deleted** — replaced by `sockets/` directory |
| `server/src/sockets/rate-limits.ts` | **New** — rate limiting extracted |
| `server/src/sockets/state-mapper.ts` | **New** — state serialization + broadcasting + socket tracking |
| `server/src/sockets/handlers.ts` | **New** — event handlers + timer loop, calls `promoteNextHost` |
| `server/src/index.ts` | Update import path: `./sockets.js` → `./sockets/handlers.js` |
| `shared/timer-helpers.ts` | **New** — `timerRunning`, `timerIdle`, `timerPaused`, `timerExpired` |
| `client/src/hooks/useRoom.ts` | Replace inline timer literals with `timer-helpers` calls |
| `server/test/card-ops.test.ts` | **New** — unit tests for `substituteDraws` |
| `server/test/rooms.test.ts` | Add `promoteNextHost` tests |
| `server/test/sockets.test.ts` | Update import path for `setupSocketHandlers` |
| `shared/timer-helpers.test.ts` | **New** — unit tests for timer helpers |

## Verification

After each section:
1. Run `npm test` — all 159 existing tests must pass
2. Run `npx tsc --noEmit -p server/tsconfig.json` — clean typecheck
3. Run `npx tsc --noEmit -p client/tsconfig.json` — clean typecheck
4. Run `npm run build` — build succeeds

The refactor is done in 5 independent sections. Each section can be committed separately, and each leaves the codebase in a fully working state.