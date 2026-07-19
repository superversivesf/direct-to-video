# Force-Start for Slow Writers — Design

**Date:** 2026-07-19
**Status:** Approved
**Resolves:** Known Issue #4 (force-start for slow writers not implemented)

## Problem

During `setup` and `card-selection` phases, if a writer goes AFK the game soft-locks — the host has no way to advance to pitching. The game currently requires every writer (including the note giver, who is also a writer) to choose a deck type and select a card before the phase can advance.

## Solution

Add a host-only `force_start` action that auto-picks defaults for unprepared writers and advances to pitching.

## Behavior

- Host sees a "Force Start (skip unprepared writers)" button only when:
  - The phase is `setup` or `card-selection`, AND
  - At least one writer (including possibly the note giver) is unprepared.
- On click, server auto-picks for each unprepared writer:
  - If hand is empty (no deck chosen): auto-select `plot` deck → draws 3 cards.
  - If hand has cards but no movie selected: auto-select first card in hand.
- Note giver is treated the same as any writer.
- After all writers are prepared, the existing `checkAllMoviesReady` → `startPitching` flow runs unchanged.
- Skipped writers still pitch and vote normally — they're just assigned default cards.

## Architecture

### Shared

No new shared types required. The `force_start` event is client→server only; no new server→client events. Existing `room_joined` re-broadcast on `broadcastAllStates` carries the updated state.

### Server — `state-machine.ts`

New exported function:

```ts
export function forceStart(store: RoomStore, room: Room): void
```

- Throws `Error("Cannot force-start outside setup or card-selection phase")` if `room.phase` is not `setup` or `card-selection`.
- For each writer (players in `getWriterPlayers(room)`, which includes the note giver):
  - If `player.hand.length === 0`: call `selectDeckType(store, room, playerId, "plot")`. Re-fetch room.
  - If `player.hand.length > 0` but no movie for this player in `room.movies`: call `selectCard(store, room, playerId, player.hand[0].id)`. Re-fetch room.
- Existing `checkAllMoviesReady` (invoked inside `selectCard`) handles the transition to `pitching` when all movies are ready.

### Server — `sockets/handlers.ts`

New event handler:

```ts
socket.on("force_start", () => {
  if (!checkSocketEventRate(socket)) return;
  const ctx = getPlayerContext(socket.id, store);
  if (!ctx) return;
  try {
    const player = ctx.room.players.find((p) => p.id === ctx.playerId);
    if (!player?.isHost) {
      socket.emit("error", "Only the host can force-start");
      return;
    }
    forceStart(store, ctx.room);
    broadcastAllStates(io, store.getRoom(ctx.room.code)!);
  } catch (err) {
    socket.emit("error", (err as Error).message);
  }
});
```

### Client — `hooks/useRoom.ts`

Add `forceStart: () => socket.emit("force_start")` to the returned hook API.

### Client — `pages/Game.tsx`

Compute `hasUnpreparedWriters` from `state`:

```ts
const writers = state.players.filter((p) => !p.isDisconnected);
const hasUnpreparedWriters = writers.some((w) => {
  if (w.hand.length !== 3) return true; // setup not done (note: hand is private — use movies length instead)
  const movie = state.movies.find((m) => m.playerId === w.id);
  return !movie || movie.chosenCard.id === "" || movie.randomCard.id === "";
});
```

**Correction:** hands are private to the owning player, so the client can't see other writers' hand sizes. Use this signal instead:

```ts
const hasUnpreparedWriters = writers.some((w) => {
  const movie = state.movies.find((m) => m.playerId === w.id);
  return !movie;
});
```

A writer with no `movie` entry in `room.movies` is unprepared. This works for both setup and card-selection phases.

Render button only when:

```tsx
{isHost && (state.phase === "setup" || state.phase === "card-selection") && hasUnpreparedWriters && (
  <button onClick={room.forceStart}>Force Start (skip unprepared writers)</button>
)}
```

## Testing

### Server — `state-machine.test.ts`

New `describe("forceStart")` block:

1. Throws when phase is `lobby`.
2. Throws when phase is `pitching`.
3. In `setup` phase: auto-draws plot for writers with empty hands, advances through card-selection to pitching.
4. In `card-selection` phase: auto-selects first card for writers without movies, advances to pitching.
5. Note giver edge case: if note giver has no deck/card, auto-picks for them; note giver remains last in pitch order.
6. Host check lives in socket handler, not state-machine — state-machine function operates on the room directly.

### Server — `sockets.test.ts`

New `force_start` handler test:

1. Non-host emits `force_start` → receives `error` event with "Only the host can force-start".
2. Host emits `force_start` during setup with one unprepared writer → all writers get movies, phase advances to pitching.

### Client — `Game.test.tsx`

Add test: when host and phase is setup with unprepared writers, the Force Start button is visible and clicking it emits `force_start`.

## Edge Cases

- **Host is also a writer:** Host clicking force-start auto-picks for themselves too if unprepared.
- **All writers prepared:** Button hidden (existing `checkAllMoviesReady` already auto-advances).
- **Only one player:** Single-player edge case — force-start would still pick defaults for that player.
- **Disconnected players:** Disconnected writers should be skipped by `getWriterPlayers` (which filters by `isDisconnected`) — no auto-pick for them.

## Out of Scope

- No auto-timeout: this is a manual host action only.
- No "abort round" option — writers always pitch once force-started.
- No scoring penalty for force-started writers.
- No UI indication of which writers were force-started vs. chose their own cards.