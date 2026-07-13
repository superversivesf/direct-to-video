# AGENTS.md — Pitch Storm

> **Status snapshot:** 2026-07-13. All 144 tests pass, build and typecheck clean. Production-ready for standard 3-5 player mode.

## Project Overview

Pitch Storm is a self-hosted web app for playing the card game [Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm) by Cutlass & Cape Games remotely. Players join via a 4-letter room code, manage cards in a private browser view, and pitch verbally over Zoom/Teams. A separate audience page displays the full game state for screen-sharing.

**Repository:** `/home/jason/Repos/movie-pitch` — git repo on `master` branch, clean working tree.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, TypeScript, Express, Socket.IO v4, better-sqlite3 |
| Frontend | React 18, Vite 5, React Router v6 |
| Shared | TypeScript types package (`@pitch-storm/shared`) |
| Testing | Vitest 1.6 (unit/integration), Playwright 1.45 (E2E) |
| Deployment | Docker multi-stage build, docker-compose, SQLite volume |

## Project Structure

```
movie-pitch/
├── package.json              # Root workspace: shared, server, client
├── tsconfig.base.json        # Shared TS config (strict, ES2022, bundler resolution)
├── Dockerfile                # Multi-stage: build client+server → slim runtime
├── docker-compose.yml        # Single service + persistent volume for SQLite
├── shared/
│   ├── package.json          # @pitch-storm/shared
│   └── types.ts              # All shared types: Card, Player, Room, Movie, TimerState, events
├── server/
│   ├── package.json          # @pitch-storm/server (ESM, type: module)
│   ├── tsconfig.json         # Extends base, outDir: dist, rootDir: src
│   ├── vitest.config.ts      # globals: true, environment: node, include: test/**/*.test.ts
│   ├── src/
│   │   ├── index.ts          # Express + Socket.IO bootstrap, room cleanup, static serving
│   │   ├── db.ts             # SQLite init, migrations, room CRUD, card deck queries
│   │   ├── seed-cards.ts     # 493 real cards (166 plot, 161 character, 166 note)
│   │   ├── rooms.ts          # RoomStore (in-memory cache + DB), room creation, code generation
│   │   ├── state-machine.ts  # Game phase transitions, card drawing, winner selection
│   │   ├── sockets.ts        # Socket.IO event handlers, timer tick loop, state broadcasting
│   │   ├── timer.ts          # Server-authoritative timer: start, pause, tick, note-pause, resume
│   │   └── logger.ts         # File logging to data/pitchstorm.log + data/games.log
│   └── test/
│       ├── db.test.ts        # 7 tests
│       ├── rooms.test.ts     # 8 tests
│       ├── timer.test.ts     # 15 tests
│       ├── state-machine.test.ts  # 32 tests
│       └── sockets.test.ts   # 4 tests
├── client/
│   ├── package.json          # @pitch-storm/client (ESM, type: module)
│   ├── tsconfig.json         # JSX: react-jsx, noEmit, DOM libs
│   ├── vite.config.ts        # Vite + React plugin, dev proxy /socket.io → :3000
│   ├── vitest.config.ts      # globals: true, environment: jsdom, include: test/**/*.test.tsx
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx          # React root + BrowserRouter
│   │   ├── App.tsx           # Router: /, /room/:code, /audience/:code, /rules
│   │   ├── socket.ts         # Socket.IO client singleton (autoConnect: false)
│   │   ├── hooks/
│   │   │   └── useRoom.ts    # useRoom() + useAudience() — socket state subscriptions
│   │   ├── pages/
│   │   │   ├── Join.tsx      # Room code + name input, cookie persistence
│   │   │   ├── Game.tsx      # Player view — renders all 6 phases
│   │   │   ├── Audience.tsx  # Spectator view — large-screen layout
│   │   │   └── Rules.tsx     # How-to-play page
│   │   ├── components/
│   │   │   ├── Card.tsx              # Card renderer (text, header, franchise, face-down)
│   │   │   ├── CardTemplate.tsx      # Background graphic wrapper
│   │   │   ├── Timer.tsx             # SVG ring countdown display
│   │   │   ├── Scoreboard.tsx        # Ranked player scores with podium
│   │   │   ├── PlayerList.tsx        # Player list with exec/host/disconnected icons
│   │   │   ├── MovieReveal.tsx       # 2-card movie display (chosen + blind)
│   │   │   ├── WriterControls.tsx    # Deck choice, hand, card selection, ready button
│   │   │   ├── ExecutiveControls.tsx # Timer controls + NOTE card hand
│   │   │   ├── RoundSummary.tsx      # All movies displayed for winner selection
│   │   │   └── PhaseIndicator.tsx    # Progress dots for current phase
│   │   └── styles/
│   │       ├── app.css       # Main app styles
│   │       └── cards.css     # Card template styling
│   └── test/
│       ├── setup.ts          # Vitest setup (jest-dom matchers)
│       ├── Card.test.tsx             # 4 tests
│       ├── WriterControls.test.tsx   # 6 tests
│       ├── Timer.test.tsx            # 5 tests
│       ├── ExecutiveControls.test.tsx # 12 tests
│       ├── Join.test.tsx             # 5 tests
│       ├── Scoreboard.test.tsx       # 9 tests
│       ├── PlayerList.test.tsx       # 6 tests
│       ├── PhaseIndicator.test.tsx   # 9 tests
│       ├── MovieReveal.test.tsx      # 6 tests
│       └── Game.test.tsx             # 16 tests
├── e2e/
│   ├── playwright.config.ts  # Port 3100, chromium
│   └── full-game.test.ts     # Full 2-player game via socket clients + audience browser
└── docs/superpowers/
    ├── specs/                # Design spec (2026-07-10)
    └── plans/                # Implementation plan (2026-07-10)
```

## Build & Run Commands

### Development

```bash
npm install                  # Install all workspace dependencies
npm run dev:server           # tsx watch server/src/index.ts — server on :3000
npm run dev:client           # Vite dev server on :5173 (proxies WS to :3000)
```

Use `http://localhost:5173` for development.

### Build

```bash
npm run build                # Builds client (vite) + compiles server (tsc)
npm run build:client         # Builds client only
```

Build output: `client/dist/` (static files) + `server/dist/` (compiled JS).

### Test

```bash
# IMPORTANT: Root `npm test` is broken (see Known Issues #1).
# Run tests from each workspace instead:
cd server && npx vitest run   # 66 server tests
cd client && npx vitest run   # 78 client tests

# E2E (requires build first + running server on :3100):
npm run build
npx playwright test --config e2e/playwright.config.ts
```

### Typecheck

```bash
npx tsc --noEmit -p server/tsconfig.json   # Server typecheck
npx tsc --noEmit -p client/tsconfig.json   # Client typecheck
```

Both pass clean as of this snapshot.

### Docker

```bash
docker compose up --build    # App at http://localhost:3000
```

### Lint

**No linter configured.** No ESLint, no Prettier, no lint script in any package.json.

## Architecture

### Monorepo Monolith

Single Node.js process serves:
1. Express REST API (static file serving + SPA fallback)
2. Socket.IO real-time game state
3. Built React static files from `client/dist/`

Socket.IO rooms map to game rooms: players join `room:CODE`, spectators join `audience:CODE`.

### Data Flow

```
Client (React) ──socket.io──▶ Server (Socket.IO handlers)
                                  │
                                  ├──▶ State Machine (phase transitions)
                                  ├──▶ RoomStore (in-memory cache + SQLite)
                                  ├──▶ Timer (server-authoritative, 1s tick loop)
                                  └──▶ Logger (file-based)
                                      │
                                      ▼
                              broadcastAllStates()
                              ├──▶ Per-player room_joined (filtered by visibility)
                              └──▶ audience_update (full public state)
```

### State Management

- **Server:** `RoomStore` class caches rooms in a `Map<string, Room>` and persists to SQLite on every mutation via `dbHandle.saveRoom()`.
- **Client:** `useRoom()` hook subscribes to Socket.IO events and maintains `PublicRoomState` in React `useState`. No Redux/Zustand — pure socket-driven state.
- **Timer:** Server-authoritative. A 1-second `setInterval` loop in `sockets.ts` ticks all running timers, emits `timer_tick`, and handles expiry. Clients only display the server-pushed values.

### Game State Machine

```
lobby → setup → card-selection → pitching → round-end → setup (next round) → ... → game-end
                                                                                     │
                                                                              playAgain → lobby
```

- **lobby:** Players join, host clicks "Start Game"
- **setup:** Executive assigned (rotates each round), 3 NOTE cards drawn, writers choose deck type (PLOT or CHARACTER) and draw 3 cards
- **card-selection:** Writers select 1 card from hand, blind card auto-drawn from opposite deck, click "Ready to Pitch". Phase auto-advances when all writers ready.
- **pitching:** Writers pitch one at a time (Executive's left first). 45s timer. Executive can pause to play NOTE cards (5s read window, auto-resumes).
- **round-end:** Executive picks winning movie. Winner gets 1 point.
- **game-end:** After every player has been Executive once. Highest score wins. "Play Again" resets to lobby.

### Socket.IO Events

**Client → Server:** `join_room`, `join_audience`, `start_game`, `select_deck_type`, `select_card`, `reveal_movie`, `start_timer`, `pause_timer`, `play_note`, `end_pitch`, `select_winner`, `play_again`

**Server → Client:** `room_joined` (full per-player state), `player_list_updated`, `movie_revealed`, `timer_started`, `timer_tick`, `timer_paused`, `timer_expired`, `note_played`, `pitch_ended`, `next_pitcher`, `winner_selected`, `round_started`, `game_ended`, `error`, `audience_joined`, `audience_update`

### Visibility Rules

- Player hands: only own hand visible to that player
- Executive NOTE cards: only visible to the Executive
- Revealed movies, timer, scores, notes played: visible to all players + audience
- Audience never sees private hands

### Special Card Mechanics

- **Auto-draw cards:** Cards with `draws: [{ deck, count }]` and `____` in text automatically draw from the specified deck and substitute the placeholder. E.g., `"has a steamy affair with ____"` draws a character card.
- **Franchise cards:** Cards with `isFranchise: true` and `header: "FRANCHISE PITCH:"` reference previously pitched movies (display-only, handled verbally).
- **Multi-line notes:** Note cards with ` / ` separator display as multiple lines (note + executive commentary).
- **Note card draws:** Some note cards draw plot, character, or even other note cards when played.

## What Works (Verified 2026-07-13)

### Tests — All Passing

| Suite | Tests | Status |
|-------|-------|--------|
| server/test/timer.test.ts | 15 | PASS |
| server/test/db.test.ts | 7 | PASS |
| server/test/rooms.test.ts | 8 | PASS |
| server/test/sockets.test.ts | 4 | PASS |
| server/test/state-machine.test.ts | 32 | PASS |
| client/test/Card.test.tsx | 4 | PASS |
| client/test/WriterControls.test.tsx | 6 | PASS |
| client/test/Timer.test.tsx | 5 | PASS |
| client/test/ExecutiveControls.test.tsx | 12 | PASS |
| client/test/Join.test.tsx | 5 | PASS |
| client/test/Scoreboard.test.tsx | 9 | PASS |
| client/test/PlayerList.test.tsx | 6 | PASS |
| client/test/PhaseIndicator.test.tsx | 9 | PASS |
| client/test/MovieReveal.test.tsx | 6 | PASS |
| client/test/Game.test.tsx | 16 | PASS |
| **Total** | **144** | **ALL PASS** |

### Build & Typecheck

- `npm run build` — succeeds (client vite build + server tsc compile)
- `npx tsc --noEmit -p server/tsconfig.json` — clean
- `npx tsc --noEmit -p client/tsconfig.json` — clean

### Features Working

- Full game flow: lobby → setup → card-selection → pitching → round-end → game-end → play again
- 493 real cards transcribed from the physical game (166 plot, 161 character, 166 note)
- Room creation with 4-letter codes (no ambiguous chars: no O, 0, I, 1)
- Player join with name persistence via cookie
- Same-name rejoin restores player identity (case-insensitive match)
- Audience/spectator view for screen-sharing
- Server-authoritative 45-second timer with SVG ring display
- Executive NOTE card play with 5-second pause window and auto-resume
- Auto-draw cards with `____` placeholder substitution
- Franchise card display
- Blind card auto-draw from opposite deck on card selection
- Pitch order: Executive's left first, circular rotation
- Round rotation: Executive role rotates to next player each round
- Winner selection and scoring (1 point per win)
- Game end after all players have been Executive once
- Tie detection and display
- Disconnect handling (player marked as disconnected, not removed)
- Stale room cleanup (1-hour TTL after all disconnected or game-end)
- SQLite persistence (survives restarts)
- Docker deployment with volume for SQLite
- Logging to `data/pitchstorm.log` and `data/games.log`
- Rules page at `/rules`
- Confetti animation on game end
- Phase indicator progress dots

## Known Issues & What Doesn't Work

### 1. Root `npm test` is broken

The root `package.json` test script is:
```json
"test": "vitest run --config server/vitest.config.ts && vitest run --config client/vitest.config.ts"
```

When run from the project root, vitest resolves `include: ["test/**/*.test.ts"]` relative to the **invocation directory** (root), not the config file location. Since there's no `test/` directory at root, it fails with "No test files found, exiting with code 1".

**Workaround:** Run tests from each workspace:
```bash
cd server && npx vitest run
cd client && npx vitest run
```

**Fix:** Either change include paths to absolute (`server/test/**/*.test.ts`), or change the root script to `cd server && npx vitest run && cd ../client && npx vitest run`.

### 2. No linter or formatter

No ESLint, Prettier, or any lint configuration exists. No lint scripts in any package.json. Code style is enforced only by convention and review.

### 3. No CI/CD pipeline

No GitHub Actions, no CI configuration of any kind. Tests and build are only verified manually.

### 4. E2E test not verified in this snapshot

The Playwright E2E test (`e2e/full-game.test.ts`) uses port 3100 and requires a built server running. It was not run in this snapshot. The test drives a full 2-player game via raw socket connections and verifies the audience browser UI across all phases. It may have issues with the `round_started` event emission after timer expiry (see #5 below).

### 5. Potential `round_started` event miss after timer expiry

In `sockets.ts`, the timer tick loop handles expiry by calling `endPitch`. After `endPitch`, if the next phase is `round-end` (all pitchers done), the code checks:
```typescript
if (updated.phase === "setup" && updated.round.current > 1) {
  io.to(`room:${updated.code}`).emit("round_started", updated.round.current);
}
```
But `endPitch` transitions to `round-end`, not `setup`. The `round_started` event is only emitted after `select_winner` transitions to `setup` for the next round. When the timer expires on the **last pitcher**, the flow is: timer expires → `endPitch` → phase becomes `round-end` → (Executive must manually `select_winner`) → phase becomes `setup` → `round_started` emitted. This works for the normal flow, but the timer-expiry path has a redundant/dead code block that checks for `setup` phase immediately after `endPitch`, which will never be true.

### 6. `canPlayNotes` dead variable in ExecutiveControls

`ExecutiveControls.tsx` computes `const canPlayNotes = timerRunning || !timerStarted;` but never uses it. The actual click handler uses `timerStarted ? () => onPlayNote(note.id) : undefined`. The variable is dead code.

### 7. Executive disconnect not handled

The design spec says: "If Executive disconnects, host takes over Exec role for remainder of round." This is **not implemented**. When the Executive disconnects, they are marked `isDisconnected: true` but the Executive role does not transfer. The game can soft-lock if the Executive disconnects during pitching or round-end, as no other player can start the timer, play notes, end pitches, or select a winner.

### 8. Force-start for slow writers not implemented

The design spec says: "Writer doesn't select cards before all others ready → Host can force-start with auto-random selection." This is **not implemented**. There is no force-start mechanism. If a writer goes AFK during card selection, the game is stuck.

### 9. Card count discrepancy in README

README states 492 cards (166 plot, 160 character, 166 note). Actual seed data has 493 cards (166 plot, **161** character, 166 note). The character count in the README is wrong by 1.

### 10. React Router v7 future flag warnings

Client tests emit warnings about React Router v6 future flags (`v7_startTransition`, `v7_relativeSplatPath`). These are warnings only, not errors, and don't affect functionality. Will need attention when upgrading to React Router v7.

### 11. No reconnection state recovery

If a player disconnects mid-game and reconnects, they get the current room state via `room_joined`. However, if their pitch already happened while disconnected, there's no mechanism to put them into a "spectator until round end" mode as the spec describes. They simply rejoin with the current state.

### 12. Room codes are letters-only

The implementation plan specified `VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"` (letters + numbers, no ambiguous chars). The actual implementation is `VALID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"` (letters only, no numbers). This reduces the code space but is arguably better for verbal communication. This is a deviation from the plan, not a bug.

## Spec Drift (Design Doc vs Implementation)

The design spec and implementation plan are in `docs/superpowers/specs/` and `docs/superpowers/plans/`. The implementation has evolved significantly from the plan:

### Intentional Improvements

| Area | Plan | Implementation |
|------|------|----------------|
| Card count | 10 placeholder cards per deck | 493 real cards transcribed from the physical game |
| Card fields | `id`, `type`, `text` | Added `header`, `draws`, `substitutedText`, `isFranchise` |
| Movie | `chosenCard` + `randomCard` + `notesPlayed` | Added `revealed` boolean |
| Timer | `running`, `secondsRemaining`, `pausedAt` | Added `pausedForNote`, `noteResumeAt` for 5-second note read window |
| Blind draw | Separate `draw_random_card` event | Auto-drawn in `selectCard` — no separate event needed |
| State push | Granular events (`deck_selected`, `card_selected`, `card_drawn`, `player_joined`, `player_left`) | Simplified to `room_joined` (full state) + `player_list_updated` |
| PublicRoomState | Basic fields | Added `myChosenCard`, `myMovieReady`, `myMovieRevealed`, `myBlindCard` for richer client state |
| Player | Basic fields | Added `chosenCard` field |
| Logger | Not in plan | Full logging system: HTTP, connections, joins, game events, errors |
| DB migration | Not in plan | Cards table migration from old schema (text → data column) |
| Rules page | Not in plan | Full how-to-play page at `/rules` |
| Confetti | Not in plan | Confetti animation on game-end screen |
| Phase indicator | Not in plan | Progress dots showing current phase |
| Timer ring | Not in plan | SVG circular countdown ring |

### Removed/Consolidated Events

| Plan Event | Status | Replacement |
|------------|--------|-------------|
| `draw_random_card` (C→S) | Removed | Auto-drawn in `selectCard` |
| `next_pitcher` (C→S) | Removed | Auto-advanced in `endPitch` |
| `next_round` (C→S) | Removed | Auto-advanced in `selectWinner` |
| `player_joined` (S→C) | Removed | `player_list_updated` |
| `player_left` (S→C) | Removed | `player_list_updated` |
| `deck_selected` (S→C) | Removed | `room_joined` (full state) |
| `card_selected` (S→C) | Removed | `room_joined` (full state) |
| `card_drawn` (S→C) | Removed | `room_joined` (full state) |
| `timer_tick` (S→C) | Added | Not in plan, needed for countdown display |

### Missing From Plan

| Plan Item | Status |
|-----------|--------|
| `useTimer` hook | Not implemented — timer display handled inline in Timer component |
| Cookie-based server-side reconnect | Not implemented as described — cookie stores name client-side, sent on join |
| Executive disconnect → host takeover | Not implemented |
| Force-start for slow writers | Not implemented |
| Spectator-until-round-end for reconnecting players | Not implemented |

## Code Conventions

- **TypeScript strict mode** — all files typecheck clean
- **ESM modules** — `"type": "module"` in server and client packages
- **Import extensions** — `.js` extensions used in server imports (ESM requirement), `.js` in client (Vite resolves)
- **Functional React** — hooks only, no class components
- **Socket singleton** — single `socket.io-client` instance in `client/src/socket.ts`, `autoConnect: false`
- **Immutable state updates** — all state-machine functions return new Room objects via spread, never mutate
- **Server-authoritative** — all game logic runs on server, clients only display server-pushed state
- **No comments in code** — code is self-documenting
- **No external CSS framework** — plain CSS in `styles/app.css` and `styles/cards.css`
- **Test co-location** — tests in `server/test/` and `client/test/` directories, not colocated with source

## Key Files

| File | Role |
|------|------|
| `shared/types.ts` | All shared TypeScript types — single source of truth for data model |
| `server/src/state-machine.ts` | Game logic: all phase transitions, card drawing, winner selection |
| `server/src/sockets.ts` | Socket.IO handlers, timer tick loop, state broadcasting — largest server file (407 lines) |
| `server/src/rooms.ts` | RoomStore: in-memory cache + SQLite persistence, room creation, code generation |
| `server/src/db.ts` | SQLite setup, schema migrations, card deck queries |
| `server/src/seed-cards.ts` | 493 card definitions — largest file in the project |
| `server/src/timer.ts` | Pure timer state transitions (no side effects) |
| `client/src/hooks/useRoom.ts` | Socket state subscriptions — the bridge between server and React |
| `client/src/pages/Game.tsx` | Player view — renders all 6 game phases (216 lines, highest complexity) |
| `client/src/pages/Audience.tsx` | Spectator view for screen-sharing |
| `client/src/components/Card.tsx` | Card renderer with franchise/face-down support |

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `DB_PATH` | `data/pitchstorm.db` | SQLite database path |
| `ROOM_TTL_MS` | `3600000` (1hr) | Stale room cleanup threshold (hardcoded in index.ts, not actually read from env) |

Note: `ROOM_TTL_MS` and `CLEANUP_INTERVAL_MS` are hardcoded constants in `server/src/index.ts`, not read from `process.env` despite the README listing `ROOM_TTL_MS` as an environment variable.

## Testing Notes

- **Server tests** use in-memory SQLite (`:memory:`) — no file cleanup needed
- **Client tests** use jsdom + @testing-library/react + jest-dom matchers
- **Socket tests** (4 tests) test the socket handler setup, not full game flow
- **E2E test** uses raw socket.io-client connections for player actions + a Playwright browser page for the audience UI. Port 3100. Requires `npm run build` + running server first.
- State-machine tests are comprehensive (32 tests) — cover startGame, setupRound, selectDeckType, selectCard, startPitching, revealMovie, endPitch, selectWinner, nextRound, playAgain, and auto-draw mechanics.

## Future Scope (From README)

- **Team mode** (5-12 players): Teams of 2, 60-second pitches, dual executives
- **Writers' Room variant**: TV show seasons, winner becomes next Executive, canon building, "6 Seasons and a Movie"
- **Tie-breaker lightning round**: 50-second pitch judged by everyone
- **Franchise card enhancement**: Let players select from previously pitched movies via UI

## Gotchas for Agents

1. **Don't run `npm test` from root** — it's broken. Use `cd server && npx vitest run` and `cd client && npx vitest run`.
2. **Server imports use `.js` extensions** — ESM requires this even for TypeScript files. Don't remove them.
3. **`seed-cards.ts` is huge** — 493 cards, ~600 lines. Don't read the whole file unless necessary. Use grep/search for specific cards.
4. **State machine is pure** — `state-machine.ts` functions take a `RoomStore` and `Room`, mutate via `store.saveRoom()`, and the caller re-fetches with `store.getRoom()`. Always re-fetch after calling a state-machine function.
5. **Socket handlers re-fetch room after state-machine calls** — `ctx.room` is a snapshot. After calling any state-machine function, use `store.getRoom(ctx.room.code)!` to get updated state.
6. **Timer is server-authoritative** — never compute timer values on the client. The `useRoom` hook always uses server-pushed `timer_tick` values.
7. **Visibility filtering happens in `toPublicRoomState`** — don't add private fields to `PublicRoomState`. Hands are only included for the requesting player.
8. **`broadcastAllStates` sends per-player state** — each player gets their own `room_joined` event with their own hand. Don't broadcast raw room state to all sockets.
9. **Room codes exclude ambiguous characters** — `ABCDEFGHJKLMNPQRSTUVWXYZ` only (no O, 0, I, 1). No numbers.
10. **The `selectCard` function auto-draws the blind card** — there is no separate "draw blind card" event. Card selection + blind draw + movie creation happen atomically in `state-machine.ts:selectCard`.