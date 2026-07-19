# Franchise Card Enhancement — Design

**Date:** 2026-07-19
**Status:** Approved
**Resolves:** Future Scope item — "Franchise card enhancement: Let players select from previously pitched movies via UI"

## Problem

Franchise cards (17 in the deck) prompt the holder with text like "Choose a plot previously pitched by another player. Your movie is a broadway adaptation of their idea." Currently this is handled verbally with no UI support: the player references some prior pitch from memory, audience/other players may not know which movie is being referenced, and nothing is recorded on the movie object.

## Solution

Track movie history across rounds. When a franchise-card holder prepares their movie during card-selection, they pick a prior movie from a UI list. Server records the association as `Movie.franchiseSourceMovieId`. When the franchise pitch is revealed, audience/players see both the franchise card and the referenced prior movie's cards displayed alongside.

## Behavior

- Franchise holder sees a "Pick a previously pitched movie" panel during card-selection (after selecting their franchise card) if `movieHistory.length > 0`.
- Picker lists all movies from `movieHistory` EXCEPT those pitched by the franchise holder themselves (cards say "another player's").
- Each entry shows: source player's name, chosen card text, random (blind) card text.
- Ready to Pitch button is **disabled** until a prior movie is picked (when the picker is shown).
- If `movieHistory.length === 0` (round 1 with franchise card): picker is not shown, Ready works normally, `franchiseSourceMovieId` stays `null`. Player pitches verbally referencing any external movie (the card text allows this for cards like "your favourite movie").
- On reveal (during pitching), if `movie.franchiseSourceMovieId` is set: audience and all players see the franchise card AND the referenced prior movie's chosen + random cards displayed alongside, with a label like "References: [Player]'s Round N pitch".
- Franchise cards remain filtered out in 2-player games and when the host disables them — unchanged.

## Architecture

### Shared — `shared/types.ts`

```ts
export interface Movie {
  playerId: string;
  chosenCard: Card;
  randomCard: Card;
  notesPlayed: Card[];
  revealed: boolean;
  franchiseSourceMovieId: string | null;  // NEW
}

export interface Room {
  // ... existing fields ...
  movieHistory: Movie[];  // NEW — prior rounds' movies, cleared on playAgain
}

export interface PublicRoomState {
  // ... existing fields ...
  movieHistory: Movie[];  // NEW — exposed to clients for picker + reveal display
}

export interface AudienceRoomState {
  // ... existing fields ...
  movieHistory: Movie[];  // NEW — audience also needs it for reveal display
}

// New client→server event
export interface ClientToServerEvents {
  // ... existing ...
  select_franchise_source: (sourceMovieId: string) => void;
}
```

### Server — `state-machine.ts`

1. `setupRound` — at the start, append current `room.movies` to `movieHistory` (skip if empty):
   ```ts
   const updatedHistory = room.movies.length > 0
     ? [...room.movieHistory, ...room.movies]
     : room.movieHistory;
   store.saveRoom({
     ...room,
     movieHistory: updatedHistory,
     // ... rest of setupRound
   });
   ```

2. `selectCard` — when the chosen card `isFranchise`, set `franchiseSourceMovieId: null` on the new movie (placeholder). Existing movie-creation code unchanged except for this field.

3. New exported function `selectFranchiseSource(store, room, playerId, sourceMovieId)`:
   - Throws if `room.phase !== "card-selection"` and `room.phase !== "setup"` (can pick during either).
   - Throws if the player's movie doesn't exist or chosen card isn't franchise.
   - Throws if `sourceMovieId` is not in `room.movieHistory`.
   - Throws if the source movie's `playerId === playerId` (can't reference own).
   - Updates `room.movies[idx].franchiseSourceMovieId = sourceMovieId` and saves.

4. `checkAllMoviesReady` — a movie is "ready" only if:
   - Its chosen card is NOT a franchise card, OR
   - Its chosen card IS a franchise card AND `franchiseSourceMovieId !== null`, OR
   - Its chosen card IS a franchise card AND `movieHistory.length === 0` (round 1 edge case — no prior movies to pick).

5. `playAgain` — clear `movieHistory: []`.

### Server — `sockets/handlers.ts`

New event handler:
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
```

### Server — `sockets/state-mapper.ts`

- Include `movieHistory` in both `toPublicRoomState` and `toAudienceRoomState`.
- `franchiseSourceMovieId` is part of `Movie`, already exposed via `movies` array.

### Client — `hooks/useRoom.ts`

Add `selectFranchiseSource: (sourceMovieId: string) => socket.emit("select_franchise_source", sourceMovieId)`.

### Client — `pages/Game.tsx` + `components/WriterControls.tsx`

`WriterControls` receives new props:
```ts
movieHistory: Movie[];          // prior movies this game
franchiseSourceMovieId: string | null;  // current selection on my movie
onSelectFranchiseSource: (id: string) => void;
```

Renders a "Pick a previously pitched movie" panel when:
- `selectedCard?.isFranchise && movieHistory.length > 0`.

Filter out movies where `movie.playerId === myPlayerId` from the list.

Each entry is a clickable button showing the source player's name + chosen card text snippet. Clicking calls `onSelectFranchiseSource(movie.playerId + ":" + movie.chosenCard.id)` — actually we need a stable movie ID.

Wait — `Movie` currently has no `id` field. Need to add one, OR use a composite key (`playerId + round.current` at time of pitching). Let me add `Movie.id: string` (nanoid) for a stable, simple identifier.

**Correction:** Add `Movie.id: string` to the Movie type. Generated when the movie is created in `selectCard`.

`WriterControls` ready button is disabled when:
- `selectedCard?.isFranchise && movieHistory.length > 0 && !franchiseSourceMovieId`.

### Client — `components/MovieReveal.tsx`

When rendering a revealed movie, if `movie.franchiseSourceMovieId` is set, look up the source movie in `movieHistory` and render it alongside with a "References:" label.

### Client — `pages/Audience.tsx`

Same — show referenced prior movie in the audience reveal view.

## Testing

### Server — `state-machine.test.ts`

New `describe("franchise card selection")` block:
1. `setupRound` appends prior round's movies to `movieHistory`.
2. `selectCard` with a franchise card creates a movie with `franchiseSourceMovieId: null`.
3. `selectFranchiseSource` throws if phase is not card-selection/setup.
4. `selectFranchiseSource` throws if player's chosen card isn't franchise.
5. `selectFranchiseSource` throws if sourceMovieId not in movieHistory.
6. `selectFranchiseSource` throws if source movie's playerId is self.
7. `selectFranchiseSource` succeeds and updates movie.franchiseSourceMovieId.
8. `checkAllMoviesReady` does not advance to pitching if a franchise movie has no source picked (when movieHistory non-empty).
9. `checkAllMoviesReady` DOES advance if franchise movie has no source but movieHistory is empty (round 1 edge case).
10. `checkAllMoviesReady` advances when franchise movie has source picked.
11. `playAgain` clears `movieHistory`.

### Server — `sockets.test.ts`

New `select_franchise_source` handler test:
- Non-existent sourceMovieId → error event.
- Valid source → movie updated, state broadcast.

### Client — `WriterControls.test.tsx`

1. Franchise card selected, movieHistory has entries, no selection yet → Ready button disabled, picker panel visible.
2. Franchise card selected, movieHistory empty → picker not shown, Ready enabled.
3. Non-franchise card selected → picker not shown, Ready enabled.
4. Click a prior movie in picker → `onSelectFranchiseSource` called with that movie's id.
5. Self-pitched movies filtered from picker.
6. Ready button enabled after `franchiseSourceMovieId` is set.

### Client — `MovieReveal.test.tsx`

1. Movie with `franchiseSourceMovieId` set → renders referenced movie alongside.
2. Movie without `franchiseSourceMovieId` → no referenced movie rendered.

## Edge Cases

- **Round 1 franchise card with no prior history:** picker not shown, Ready works without selection, `franchiseSourceMovieId` stays null. Player pitches verbally.
- **Force-start with unprepared franchise holder:** `forceStart` auto-picks first card in hand. If that card is a franchise card and `movieHistory` is non-empty, `forceStart` should also auto-pick the first available prior movie (excluding self) so the movie is "ready". Otherwise `checkAllMoviesReady` won't advance.
- **Spectator's movies in history:** spectators' movies were removed from `room.movies` when they became spectators, so they won't be added to `movieHistory` for that round. Their previous rounds' movies (before becoming spectator) are still in history.
- **Reconnect as spectator mid-pitching:** spectator's movie was removed from current `room.movies`, so not added to history for that round. Already-handled by existing spectator logic.
- **`playAgain`:** `movieHistory` cleared along with `movies`. Fresh game starts with empty history.

## Force-start Interaction

The existing `forceStart` function auto-picks plot deck + first card for unprepared writers. If the first card in hand is a franchise card and `movieHistory.length > 0`, `forceStart` must also auto-pick a franchise source (first entry in movieHistory not pitched by the player) so `checkAllMoviesReady` advances. Add this to the `forceStart` implementation:

```ts
// After auto-selecting card, if card is franchise and movieHistory non-empty:
if (chosenCard.isFranchise && current.movieHistory.length > 0) {
  const sourceMovie = current.movieHistory.find(m => m.playerId !== writer.id);
  if (sourceMovie) {
    // Update the movie's franchiseSourceMovieId
    current = {
      ...current,
      movies: current.movies.map(m =>
        m.playerId === writer.id ? { ...m, franchiseSourceMovieId: sourceMovie.id } : m
      ),
    };
    store.saveRoom(current);
  }
}
```

## Out of Scope

- No drag-and-drop reordering of picker entries.
- No search/filter UI for the picker (just a scrollable list).
- No persistent history across games (cleared on playAgain).
- No editing the franchise source after Ready is clicked (can re-select during card-selection, but once Ready is clicked the movie is locked).
- No change to 2-player filtering (franchise cards stay filtered out).
- No new franchise card content (existing 17 cards unchanged).