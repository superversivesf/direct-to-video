# Spectator Mode for Missed Pitches — Design

**Date:** 2026-07-19
**Status:** Approved
**Resolves:** Known Issue #6 (no reconnection state recovery)

## Problem

Currently when a player disconnects mid-pitching phase and their pitch slot passes, the game proceeds without them. If they reconnect within the 60s grace period, they rejoin as a full player — but they've missed their pitch, which creates inconsistencies (their movie is in `room.movies` but never got pitched/revealed; the audience/players see a movie with a "missing" pitcher).

## Solution

Add a `Player.isSpectator` flag. When a player reconnects during the pitching phase and their pitch slot has already passed, they are marked as a spectator for the remainder of the round. Spectators:
- Cannot pitch (their movie is removed from `room.movies` and `pitchOrder`).
- Cannot be voted for (their movie is not shown as a voting option).
- CAN vote in the round they missed (1x weight, same as players).
- Resume as a full player at the start of the next round (`isSpectator = false`).

## Behavior

- **Trigger:** On `join_room` when the player is reconnecting (same-name match) and `room.phase === "pitching"` and `room.currentPitchIndex > player's position in pitchOrder` (slot already passed).
- **Setup/card-selection rejoin:** No spectator mode — player resumes normally with their hand/movie.
- **Lobby rejoin:** No spectator mode — player is just back in the lobby.
- **Round-end/game-end rejoin:** No spectator mode — round is over, they resume as full player next round.

## Architecture

### Shared — `shared/types.ts`

Add `isSpectator: boolean` to `Player` interface. Default `false`.

### Server — `rooms.ts`

`createPlayer` initializes `isSpectator: false`.

### Server — `sockets/handlers.ts`

In the `join_room` handler, after same-name rejoin detection, before saving the room:

```ts
const existing = room.players.find((p) => p.name.toLowerCase() === name.toLowerCase() && p.isDisconnected);
if (existing && room.phase === "pitching") {
  const pitchIndex = room.pitchOrder.findIndex((id) => id === existing.id);
  if (pitchIndex >= 0 && pitchIndex < room.currentPitchIndex) {
    // Past their pitch slot — become spectator
    room = {
      ...room,
      players: room.players.map((p) =>
        p.id === existing.id ? { ...p, isSpectator: true, socketId: socket.id, isDisconnected: false } : p
      ),
      movies: room.movies.filter((m) => m.playerId !== existing.id),
      pitchOrder: room.pitchOrder.filter((id) => id !== existing.id),
    };
  }
}
```

### Server — `state-machine.ts`

- `getWriterPlayers` should exclude spectators for pitching/setup:
  ```ts
  function getWriterPlayers(room: Room): Player[] {
    return room.players.filter((p) => !p.isDisconnected && !p.isSpectator);
  }
  ```
- `nextRound` (via `setupRound`) clears `isSpectator` for all players:
  ```ts
  players: room.players.map((p) => ({ ...p, isSpectator: false }))
  ```
- `playAgain` similarly clears `isSpectator`.

### Server — `sockets/handlers.ts`

- `cast_vote` handler: spectators CAN vote. No change needed (already any connected player can vote). However, spectators cannot vote for themselves — but since they have no movie, this is moot.

### Client — `sockets/state-mapper.ts`

`isSpectator` is already exposed via the player list (since `isDisconnected` is). Add `isSpectator` to public state.

### Client — `pages/Game.tsx`

- Show spectator badge (like the disconnected icon) in `PlayerList`.
- During voting, a spectator sees the voting UI normally.
- During pitching, a spectator sees the audience-style view (no "Your turn to pitch" prompt).

## Testing

### Server — `state-machine.test.ts`

1. `getWriterPlayers` excludes spectators (verified indirectly via setupRound flow).
2. `nextRound` clears `isSpectator` on all players.
3. `playAgain` clears `isSpectator` on all players.

### Server — `sockets.test.ts`

1. Player disconnects during pitching, slot passes, reconnects → becomes spectator, movie removed, pitchOrder filtered.
2. Player disconnects during pitching, reconnects BEFORE their slot → NOT spectator, resumes normally.
3. Player disconnects during setup, reconnects → NOT spectator.
4. Spectator can cast a vote in the round they're spectating.
5. After `tallyAndAdvance` → `nextRound`, spectator's `isSpectator` flag is cleared.

## Edge Cases

- **Host rejoin as spectator:** Host privileges preserved. Spectator flag doesn't affect host status.
- **Note giver rejoin as spectator:** If the note giver's slot passed, they become a spectator. They keep their note-giver privileges (timer control, NOTE card play) since those are useful to the round regardless. Actually, simpler: if the note giver reconnects mid-pitching, they get timer/NOTE controls back as before. The spectator flag only excludes them from pitching/being-voted-for.
- **All players spectators:** Unlikely edge case. Game still proceeds to round-end when pitchOrder empties.
- **Rejoin during voting:** Phase is `round-end`, not `pitching`, so no spectator mode. Player votes normally.

## Out of Scope

- Mid-pitch state recovery (resuming a pitch in progress) — not implemented.
- UI indication of "you are a spectator" beyond the badge in player list.
- Penalty for being a spectator (e.g., losing a point).
- Persistent spectator flag across rounds (it's cleared at next round start).