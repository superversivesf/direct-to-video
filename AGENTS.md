# AGENTS.md — Direct to Video

> **Status snapshot:** 2026-07-17. v2.1.0. All 218 tests pass (140 server + 78 client), build and typecheck clean. Redesigned in v2.0 (note giver replaces executive; automatic voting) and v2.1 (ready indicators, host kick, stale-disconnect cleanup). Security-hardened for public internet exposure.

## Project Overview

Direct to Video is a self-hosted web app for playing a remote party game. It is an unofficial clone of [Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm) by Cutlass & Cape Games — all credit for the game design and card content goes to them. Players join via a 4-letter room code, manage cards in a private browser view, and pitch verbally over Zoom/Teams. A separate audience page displays the full game state for screen-sharing.

**Repository:** `https://github.com/superversivesf/direct-to-video` — git repo on `master` branch.
**Production:** `https://dtv.superversive.net` (behind nginx HTTPS proxy).

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 20, TypeScript, Express, Socket.IO v4, better-sqlite3 |
| Frontend | React 18, Vite 5, React Router v6 |
| Shared | TypeScript types package (`@direct-to-video/shared`) |
| Testing | Vitest 1.6 (unit/integration), Playwright 1.45 (E2E) |
| Deployment | Docker multi-stage build, docker-compose, SQLite volume |
| Security | helmet, express-rate-limit, socket rate limiting, non-root Docker |

## Project Structure

```
movie-pitch/
├── package.json              # Root workspace: shared, server, client, stress
├── tsconfig.base.json        # Shared TS config (strict, ES2022, bundler resolution)
├── Dockerfile                # Multi-stage: build client+server → slim non-root runtime
├── docker-compose.yml        # Single service + persistent volume, resource limits
├── shared/
│   ├── package.json          # @direct-to-video/shared
│   ├── types.ts              # All shared types + VERSION constant (2.1.0)
│   └── timer-helpers.ts      # Timer state predicates: timerRunning, timerIdle, timerPaused, timerExpired
├── server/
│   ├── package.json          # @direct-to-video/server (ESM, type: module)
│   ├── tsconfig.json         # Extends base, outDir: dist, rootDir: src
│   ├── vitest.config.ts      # globals: true, environment: node, include: test/**/*.test.ts
│   ├── src/
│   │   ├── index.ts          # Express + Socket.IO bootstrap, helmet, rate limiting, room cleanup
│   │   ├── db.ts             # SQLite init, migrations, room CRUD, card deck queries
│   │   ├── seed-cards.ts     # 493 real cards (166 plot, 161 character, 166 note)
│   │   ├── rooms.ts          # RoomStore, room creation, code generation, name validation, limits
│   │   ├── state-machine.ts  # Game phase transitions, card drawing, deck reshuffling, tallyAndAdvance
│   │   ├── card-ops.ts       # Deck operations: shuffle, drawCards, getRefillDeck, drawFromDeck, substituteDraws
│   │   ├── timer.ts          # Server-authoritative timer: start, pause, tick, note-pause, resume
│   │   ├── logger.ts         # File logging to data/directtovideo.log + data/games.log
│   │   └── sockets/          # Socket.IO layer (split from former sockets.ts)
│   │       ├── rate-limits.ts  # Per-IP, per-socket, join-throttle limiters
│   │       ├── state-mapper.ts # toPublicRoomState / toAudienceRoomState visibility filtering
│   │       └── handlers.ts     # Event handlers, timer tick loop, stale-disconnect timers, kick, broadcastAllStates
│   └── test/
│       ├── db.test.ts              # 7 tests
│       ├── rooms.test.ts           # 14 tests (includes name validation + room capacity)
│       ├── timer.test.ts           # 15 tests
│       ├── timer-helpers.test.ts   # 5 tests
│       ├── card-ops.test.ts        # deck ops tests
│       ├── state-machine.test.ts   # phase transitions + tallyAndAdvance + auto-draw
│       └── sockets.test.ts         # handler setup, kick, stale-disconnect, voting flow
├── client/
│   ├── package.json          # @direct-to-video/client (ESM, type: module)
│   ├── tsconfig.json         # JSX: react-jsx, noEmit, DOM libs
│   ├── vite.config.ts        # Vite + React plugin, dev proxy /socket.io → :3000
│   ├── vitest.config.ts      # globals: true, environment: jsdom, include: test/**/*.test.tsx
│   ├── index.html            # Includes Google Fonts (Permanent Marker) + favicon
│   ├── public/
│   │   └── favicon.svg       # Clapperboard emoji SVG
│   ├── src/
│   │   ├── main.tsx          # React root + BrowserRouter
│   │   ├── App.tsx           # Router: /, /room/:code, /audience/:code, /rules
│   │   ├── socket.ts         # Socket.IO client singleton (autoConnect: false)
│   │   ├── hooks/
│   │   │   └── useRoom.ts    # useRoom() + useAudience() — socket state subscriptions + leaveGame
│   │   ├── pages/
│   │   │   ├── Join.tsx      # Room code + name input, ?code= prefill, cookie persistence, version tag
│   │   │   ├── Game.tsx      # Player view — renders all phases, voting UI inlined, share link, leave button
│   │   │   ├── Audience.tsx  # Spectator view — large-screen layout
│   │   │   └── Rules.tsx     # How-to-play page with clone acknowledgment
│   │   ├── components/
│   │   │   ├── Card.tsx              # Card renderer (text, header, franchise, face-down, note paragraphs)
│   │   │   ├── CardTemplate.tsx      # Background graphic wrapper
│   │   │   ├── Timer.tsx             # SVG ring countdown display
│   │   │   ├── Scoreboard.tsx        # Ranked player scores with podium
│   │   │   ├── PlayerList.tsx        # Player list with note-giver/host/disconnected icons + host kick ✕ button
│   │   │   ├── MovieReveal.tsx       # 2-card movie display (chosen + blind)
│   │   │   ├── WriterControls.tsx    # Deck choice, hand, card selection, ready button
│   │   │   ├── NoteGiverControls.tsx # Timer controls + NOTE card hand (replaces former ExecutiveControls)
│   │   │   └── PhaseIndicator.tsx    # Progress dots for current phase
│   │   └── styles/
│   │       ├── app.css       # Main app styles (share link, leave button, version tag, subtitle)
│   │       └── cards.css     # Card template styling (note cards: Permanent Marker font, 20% larger)
│   └── test/
│       ├── setup.ts                      # Vitest setup (jest-dom matchers)
│       ├── Card.test.tsx                 # 4 tests
│       ├── WriterControls.test.tsx       # 6 tests
│       ├── Timer.test.tsx                # 5 tests
│       ├── NoteGiverControls.test.tsx    # 12 tests
│       ├── Join.test.tsx                 # 5 tests
│       ├── Scoreboard.test.tsx           # 9 tests
│       ├── PlayerList.test.tsx           # 6 tests
│       ├── PhaseIndicator.test.tsx       # 9 tests
│       ├── MovieReveal.test.tsx          # 6 tests
│       └── Game.test.tsx                 # 16 tests
├── stress/
│   ├── package.json          # @direct-to-video/stress
│   ├── stress-test.ts        # Full single-room game simulation (configurable players/audience/rounds/target)
│   └── multi-room-stress.ts  # Multi-room concurrent load simulation
├── e2e/
│   ├── playwright.config.ts  # Port 3100, chromium
│   ├── helpers.ts            # E2E socket + browser helpers
│   ├── journeys/             # E2E journey specs
│   └── full-game.test.ts     # Full game via socket clients + audience browser
└── docs/
    ├── reference/            # Original Pitch Storm card images + raw text transcriptions
    └── superpowers/
        ├── specs/            # Design spec (2026-07-10)
        └── plans/            # Implementation plan (2026-07-10)
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
npm test                     # Runs both server + client test suites from root
cd server && npx vitest run  # 140 server tests
cd client && npx vitest run  # 78 client tests

# E2E (requires build first + running server on :3100):
npm run build
npx playwright test --config e2e/playwright.config.ts

# Stress test (requires running server):
npm run stress:local         # 10 players, 3 rounds, localhost
npm run stress:heavy         # 20 players, 5 rounds, localhost
npm run stress:voting        # 10 players + 30 audience, 3 rounds
npm run stress:extreme       # 20 players + 40 audience, 5 rounds
npm run stress:multiroom     # 4 rooms, 5 players + 10 audience each
STRESS_TARGET=https://dtv.superversive.net STRESS_PLAYERS=20 STRESS_ROUNDS=20 npx tsx stress/stress-test.ts
```

### Typecheck

```bash
npx tsc --noEmit -p server/tsconfig.json   # Server typecheck
npx tsc --noEmit -p client/tsconfig.json   # Client typecheck
```

### Docker

```bash
docker compose up --build    # App at http://localhost:3000
```

### Lint

**No linter configured.** No ESLint, no Prettier, no lint script in any package.json.

## Architecture

### Monorepo Monolith

Single Node.js process serves:
1. Express REST API (static file serving + SPA fallback) with helmet security headers + rate limiting
2. Socket.IO real-time game state with per-IP connection limits + per-socket event rate limiting
3. Built React static files from `client/dist/`

Socket.IO rooms map to game rooms: players join `room:CODE`, spectators join `audience:CODE`.

### Data Flow

```
Client (React) ──socket.io──▶ Server (sockets/handlers.ts)
                                  │
                                  ├──▶ State Machine (phase transitions, deck reshuffling, tallyAndAdvance)
                                  ├──▶ card-ops (shuffle, drawFromDeck, substituteDraws)
                                  ├──▶ RoomStore (in-memory cache + SQLite)
                                  ├──▶ Timer (server-authoritative, 1s tick loop)
                                  ├──▶ Rate Limiters (per-IP, per-socket, join throttle)
                                  ├──▶ Stale-Disconnect Timers (60s post-disconnect removal)
                                  └──▶ Logger (file-based)
                                      │
                                      ▼
                              broadcastAllStates()
                              ├──▶ Per-player room_joined (filtered by visibility via state-mapper)
                              └──▶ audience_update (full public state)
```

### State Management

- **Server:** `RoomStore` class caches rooms in a `Map<string, Room>` and persists to SQLite on every mutation via `dbHandle.saveRoom()`.
- **Client:** `useRoom()` hook subscribes to Socket.IO events and maintains `PublicRoomState` in React `useState`. No Redux/Zustand — pure socket-driven state.
- **Timer:** Server-authoritative. A 1-second `setInterval` loop in `sockets/handlers.ts` ticks all running timers, emits `timer_tick`, and handles expiry. Clients only display the server-pushed values.
- **Timer predicates:** `shared/timer-helpers.ts` exports `timerRunning`, `timerIdle`, `timerPaused`, `timerExpired` — shared by server and client to avoid drift.

### Game State Machine

```
lobby → setup → card-selection → pitching → round-end (auto-vote) → setup (next round) → ... → game-end
                                                                                              │
                                                                                       playAgain → lobby
```

- **lobby:** Players join, host selects total rounds (3/5/7/10, default 5) and optionally toggles franchise cards, host clicks "Start Game". Shareable room link available. Host can kick non-host players via ✕ button.
- **setup:** A **note giver** is assigned from `noteGiverOrder` (random permutation of player IDs, no repeats until everyone has been note giver once). 3 NOTE cards drawn for the note giver. Writers choose deck type (PLOT or CHARACTER) and draw 3 cards. The note giver sees ✓ ready / "choosing..." indicators next to each writer.
- **card-selection:** Writers select 1 card from hand, blind card auto-drawn from opposite deck, click "Ready to Pitch". Phase auto-advances when all writers ready.
- **pitching:** Writers pitch one at a time. Pitch order places the note giver last (they are also a writer); franchise card holders go last otherwise. 45s timer. Note giver can pause to play NOTE cards (5s read window, auto-resumes).
- **round-end:** No manual winner selection. A 15-second voting timer starts automatically when all pitches are done. Every player + audience member votes (one vote each, 1x weight; players cannot vote for themselves). `tallyAndAdvance` computes the round winner from `Room.votes` and adds vote counts to each player's cumulative `score`.
- **game-end:** After the host-selected `totalRounds` is reached. Highest cumulative vote total wins. Ties displayed as ties. "Play Again" resets to lobby (note giver order re-permuted).

### Note Giver Rotation

- `Room.noteGiverOrder` is a random permutation of player IDs, generated at game start.
- `Room.noteGiverIndex` advances each round.
- Once every player has been note giver once, the order is re-permuted (so in games where `totalRounds` > player count, a player may be note giver twice, but never twice in a row within a single permutation).
- The note giver is also a writer — they draw and pitch a card like everyone else, but are sorted to the end of `pitchOrder`.

### Voting

- Triggered automatically by `tallyAndAdvance` path: when the last pitcher ends, the server starts a 15-second voting phase (`voting_started` event with secondsRemaining).
- All players + audience members may vote once. Players cannot vote for themselves (enforced server-side).
- All votes are 1x weight — no 2x executive vote (the executive role no longer exists).
- `vote_update` events stream running tallies to clients during voting.
- When the timer expires (or all eligible voters have voted), `tallyAndAdvance` finalizes the round: it computes `roundWinnerId` (highest vote count; `null` on a tie), adds each player's vote count to their cumulative `score`, and emits `voting_ended` with `roundWinnerId`.
- Cumulative scores persist across rounds; the final winner is the player with the highest total at `game-end`.

### Card Deck Reshuffling

When any deck (plot, character, or note) runs out, it automatically refills and reshuffles from the full card set via `card-ops.ts:getRefillDeck`. This allows games with more players than the physical game was designed for. In 2-player games, franchise cards are filtered from both the initial deck and the refill deck. Franchise cards can also be disabled by the host in the lobby via `set_franchise_enabled`.

### Socket.IO Events

**Client → Server:** `join_room`, `join_audience`, `start_game`, `set_franchise_enabled`, `set_total_rounds`, `kick_player`, `select_deck_type`, `select_card`, `reveal_movie`, `start_timer`, `pause_timer`, `play_note`, `end_pitch`, `cast_vote`, `play_again`

**Server → Client:** `room_joined` (full per-player state), `player_list_updated`, `movie_revealed`, `timer_started`, `timer_tick`, `timer_paused`, `timer_expired`, `note_played`, `pitch_ended`, `next_pitcher`, `round_started`, `game_ended`, `error`, `audience_joined`, `audience_update`, `voting_started`, `vote_update`, `voting_ended` (sends `roundWinnerId: string | null`), `kicked`

**Removed in v2.0:** `select_winner`, `start_voting`, `end_voting` (client→server) and `winner_selected` (server→client). Voting is now automatic.

### Visibility Rules

- Player hands: only own hand visible to that player
- Note giver NOTE cards: only visible to the note giver (`PublicRoomState.myNoteGiverNotes`)
- Revealed movies, timer, scores, votes, notes played: visible to all players + audience
- Audience never sees private hands

### Special Card Mechanics

- **Auto-draw cards:** Cards with `draws: [{ deck, count }]` and `____` in text automatically draw from the specified deck and substitute the placeholder. E.g., `"has a steamy affair with ____"` draws a character card. Substitution lives in `card-ops.ts:substituteDraws`.
- **Franchise cards:** Cards with `isFranchise: true` and `header: "FRANCHISE PITCH:"` reference previously pitched movies (display-only, handled verbally). Filtered out in 2-player games, and when the host disables franchise cards. Franchise card holders pitch last.
- **Multi-line notes:** Note cards with ` / ` separator display as separate paragraphs (note + note-giver commentary).
- **Note card draws:** Some note cards draw plot, character, or even other note cards when played.
- **Card rendering:** Note cards use "Permanent Marker" handwritten font. Character cards have red location header above typewriter-font text. Note cards are 20% larger than other cards.

## Security Hardening

| Layer | Protection | Limit |
|-------|-----------|-------|
| HTTP | Rate limiting per IP | 60 req/min |
| HTTP | Security headers | helmet + CSP (allows Google Fonts + WebSocket) |
| HTTP | Trust proxy | enabled (for nginx X-Forwarded-For) |
| Socket | Max payload size | 4KB |
| Socket | Connections per IP | 25 |
| Socket | Join attempts per IP | 20/min |
| Socket | Game events per socket | 50 per 10s |
| Rooms | Max active rooms | 20 (`MAX_ROOMS` env) |
| Rooms | Max players per room | 20 (`MAX_PLAYERS` env) |
| Names | Validation | 20 chars, alphanumeric + spaces only |
| Lobby | Host kick | host-only, cannot kick self or other hosts |
| Docker | Runs as | non-root `appuser` |
| Docker | Filesystem | read-only (data volume writable) |
| Docker | Memory | 512MB limit |
| Docker | CPU | 1 core limit |
| Docker | Restart | unless-stopped |

## What Works (Verified 2026-07-17)

### Tests — All Passing

| Suite | Tests | Status |
|-------|-------|--------|
| server/test/db.test.ts | 7 | PASS |
| server/test/rooms.test.ts | 14 | PASS |
| server/test/timer.test.ts | 15 | PASS |
| server/test/timer-helpers.test.ts | 5 | PASS |
| server/test/card-ops.test.ts | — | PASS |
| server/test/state-machine.test.ts | — | PASS |
| server/test/sockets.test.ts | — | PASS |
| **Server subtotal** | **140** | **ALL PASS** |
| client/test/Card.test.tsx | 4 | PASS |
| client/test/WriterControls.test.tsx | 6 | PASS |
| client/test/Timer.test.tsx | 5 | PASS |
| client/test/NoteGiverControls.test.tsx | 12 | PASS |
| client/test/Join.test.tsx | 5 | PASS |
| client/test/Scoreboard.test.tsx | 9 | PASS |
| client/test/PlayerList.test.tsx | 6 | PASS |
| client/test/PhaseIndicator.test.tsx | 9 | PASS |
| client/test/MovieReveal.test.tsx | 6 | PASS |
| client/test/Game.test.tsx | 16 | PASS |
| **Client subtotal** | **78** | **ALL PASS** |
| **Total** | **218** | **ALL PASS** |

> Note: `cd server && npx vitest run` reports 56 unhandled timer errors after all 140 tests pass — these are from stale-disconnect `setTimeout` callbacks firing against closed in-memory SQLite handles in `sockets.test.ts`. All 140 tests pass; the errors are post-test cleanup noise, not test failures.

### Build & Typecheck

- `npm run build` — succeeds (client vite build + server tsc compile)
- `npx tsc --noEmit -p server/tsconfig.json` — clean
- `npx tsc --noEmit -p client/tsconfig.json` — clean

### Features Working

- Full game flow: lobby → setup → card-selection → pitching → round-end (auto-voting) → game-end → play again
- 493 real cards transcribed from the physical game (166 plot, 161 character, 166 note)
- Card deck reshuffling when decks run out (supports large player counts) via `card-ops.ts`
- Room creation with 4-letter codes (no ambiguous chars: no O, 0, I, 1)
- Player join with name persistence via cookie
- Same-name rejoin restores player identity (case-insensitive match)
- Shareable room link with copy button in lobby
- Join page pre-fills room code from `?code=` query parameter
- Leave game button in all phases (marks disconnected, can rejoin later)
- Host succession: if host leaves, first connected player promoted to host
- Host kick: host can remove non-host players from the lobby via ✕ button (`kick_player` → `kicked` event)
- Note giver role: randomly selected each round from `noteGiverOrder` permutation, rotates with no repeats until everyone has been note giver; note giver also pitches (sorted last)
- Ready indicators: during setup the note giver sees ✓ ready / "choosing..." next to each writer
- Audience/spectator view for screen-sharing
- Automatic voting: 15-second timer starts when all pitches done; all players + audience vote; players can't vote for themselves; all votes 1x weight
- Cumulative scoring: vote counts accumulate across rounds; highest total at game-end wins; ties shown as ties
- Fixed round count: host selects 3/5/7/10 rounds in lobby (default 5)
- Server-authoritative 45-second pitch timer + 15-second voting timer, both with SVG ring display
- Note giver NOTE card play with 5-second pause window and auto-resume
- Auto-draw cards with `____` placeholder substitution (`card-ops.ts:substituteDraws`)
- Franchise card display (filtered in 2-player games; host can disable via `set_franchise_enabled`; holders pitch last)
- Blind card auto-draw from opposite deck on card selection
- Pitch order: note giver sorted last; franchise holders last; otherwise circular from note giver's left
- Stale-disconnect handling: 60s after disconnect, player is fully removed; note giver reassigned if needed; host promoted if needed
- Stale room cleanup (1-hour TTL after all disconnected or game-end)
- SQLite persistence (survives restarts)
- Docker deployment with non-root user, read-only fs, resource limits
- Logging to `data/directtovideo.log` and `data/games.log`
- Rules page at `/rules` with clone acknowledgment
- Confetti animation on game end
- Phase indicator progress dots
- Note cards: Permanent Marker handwritten font, paragraph breaks on `/`
- Character cards: red location header, typewriter-font text
- Favicon (clapperboard SVG)
- Version tag in bottom-right corner

## Known Issues & What Doesn't Work

### 1. No linter or formatter

No ESLint, Prettier, or any lint configuration exists. Code style is enforced only by convention and review.

### 2. E2E test not verified

The Playwright E2E test (`e2e/full-game.test.ts`) uses port 3100 and requires a built server running. The stress test (`stress/stress-test.ts`) is more comprehensive and has been verified against production.

### 3. Stale-disconnect post-test timer errors (RESOLVED)

Previously `cd server && npx vitest run` emitted 56 unhandled errors after tests passed — stale-disconnect `setTimeout` callbacks and the 1-second timer `setInterval` firing against closed in-memory SQLite handles. Fixed in v2.1.2 by exporting `clearStaleDisconnectTimers()` and `clearTimerInterval()` from `sockets/handlers.ts` and invoking them in `afterEach`. Server tests now pass cleanly with zero post-test errors.

### 4. Force-start for slow writers not implemented

There is no force-start mechanism. If a writer goes AFK during card selection, the game is stuck.

### 5. React Router v7 future flag warnings

Client tests emit warnings about React Router v6 future flags. These are warnings only, not errors.

### 6. No reconnection state recovery

If a player disconnects mid-game and reconnects within 60s, they get the current room state. After 60s they are fully removed and must rejoin. No "spectator until round end" mode for missed pitches.

### 7. Room codes are letters-only

The implementation plan specified letters + numbers. The actual implementation is letters only (`ABCDEFGHJKLMNPQRSTUVWXYZ`). This is a deliberate deviation — better for verbal communication.

## Policy: No GitHub Actions / CI pipelines

This project deliberately does **not** use GitHub Actions or any CI/CD pipeline, and never will. Tests and build are verified manually before release. Do not add `.github/workflows/`, CI configuration files, or any related tooling. This is a final decision, not a gap to be closed.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `DB_PATH` | `data/directtovideo.db` | SQLite database path |
| `MAX_PLAYERS` | `20` | Max players per room |
| `MAX_ROOMS` | `20` | Max concurrent active rooms |

Note: `ROOM_TTL_MS`, `CLEANUP_INTERVAL_MS`, and `STALE_DISCONNECT_MS` (60s) are hardcoded constants in `server/src/index.ts` and `server/src/sockets/handlers.ts`.

## Testing Notes

- **Server tests** use in-memory SQLite (`:memory:`) — no file cleanup needed
- **Client tests** use jsdom + @testing-library/react + jest-dom matchers
- **Socket tests** cover handler setup, kick, stale-disconnect, and the automatic voting flow
- **E2E test** uses raw socket.io-client connections for player actions + a Playwright browser page for the audience UI. Port 3100. Requires `npm run build` + running server first.
- **Stress test** simulates a full N-player game via socket connections. Configurable via `STRESS_TARGET`, `STRESS_PLAYERS`, `STRESS_AUDIENCE`, `STRESS_ROUNDS` env vars. Multi-room variant via `stress/multi-room-stress.ts`.
- State-machine tests cover `startGame`, `setupRound`, `selectDeckType`, `selectCard`, `startPitching`, `revealMovie`, `endPitch`, `tallyAndAdvance`, `nextRound`, `playAgain`, and auto-draw mechanics.

## Future Scope (From README)

- **Team mode** (5-12 players): Teams of 2, 60-second pitches, dual note givers
- **Writers' Room variant**: TV show seasons, winner becomes next note giver, canon building, "6 Seasons and a Movie"
- **Tie-breaker lightning round**: 50-second pitch judged by everyone
- **Franchise card enhancement**: Let players select from previously pitched movies via UI

## Gotchas for Agents

1. **Root `npm test` works** — it runs both server and client test suites. You can also run them individually from each workspace.
2. **Server imports use `.js` extensions** — ESM requires this even for TypeScript files. Don't remove them. This includes imports into `sockets/` submodules.
3. **`sockets.ts` is now `sockets/`** — the old single file was split into `sockets/rate-limits.ts`, `sockets/state-mapper.ts`, `sockets/handlers.ts`. Update imports accordingly.
4. **`seed-cards.ts` is huge** — 493 cards, ~600 lines. Don't read the whole file unless necessary. Use grep/search for specific cards.
5. **State machine is pure** — `state-machine.ts` functions take a `RoomStore` and `Room`, mutate via `store.saveRoom()`, and the caller re-fetches with `store.getRoom()`. Always re-fetch after calling a state-machine function.
6. **`tallyAndAdvance` replaces `selectWinner`/`endVoting`/`tallyVotes`** — there is no manual winner selection. Voting starts automatically after the last pitch and `tallyAndAdvance` finalizes the round. Don't re-add `select_winner`.
7. **Socket handlers re-fetch room after state-machine calls** — `ctx.room` is a snapshot. After calling any state-machine function, use `store.getRoom(ctx.room.code)!` to get updated state.
8. **Timer is server-authoritative** — never compute timer values on the client. The `useRoom` hook always uses server-pushed `timer_tick` / `voting_started` values.
9. **Timer predicates are shared** — use `timerRunning` / `timerIdle` / `timerPaused` / `timerExpired` from `shared/timer-helpers.ts` on both server and client. Don't reimplement.
10. **Visibility filtering happens in `sockets/state-mapper.ts`** — don't add private fields to `PublicRoomState`. Hands are only included for the requesting player; note-giver notes only for the note giver (`myNoteGiverNotes`).
11. **`broadcastAllStates` sends per-player state** — each player gets their own `room_joined` event with their own hand. Don't broadcast raw room state to all sockets.
12. **Room codes exclude ambiguous characters** — `ABCDEFGHJKLMNPQRSTUVWXYZ` only (no O, 0, I, 1). No numbers.
13. **The `selectCard` function auto-draws the blind card** — there is no separate "draw blind card" event. Card selection + blind draw + movie creation happen atomically in `state-machine.ts:selectCard`.
14. **Deck operations live in `card-ops.ts`** — `shuffle`, `drawCards`, `getRefillDeck`, `drawFromDeck`, `substituteDraws` were extracted from `state-machine.ts`. Import from `card-ops.ts`, not `state-machine.ts`.
15. **Deck reshuffling is automatic** — when a deck runs out, `drawFromDeck` refills from the full card set via `getRefillDeck`. In 2-player games, franchise cards are filtered from refills too.
16. **Note giver ≠ executive** — the v2.0 redesign removed the executive entirely. `Player.isNoteGiver`, `Room.noteGiverId`, `Room.noteGiverNotes` replace the old executive fields. Don't reintroduce `isExecutive` / `executiveId` / `executiveNotes`.
17. **Note giver rotation uses `noteGiverOrder` + `noteGiverIndex`** — a random permutation generated at game start. Don't compute the next note giver by "next connected player"; read it from the order array.
18. **Total rounds is host-selected** — `Room.totalRounds` (3/5/7/10, default 5) is set in the lobby via `set_total_rounds`. Game end is `round.current >= totalRounds`, not "everyone has been note giver once".
19. **Stale-disconnect is 60s** — `STALE_DISCONNECT_MS` in `sockets/handlers.ts`. After 60s disconnected, the player is fully removed (not just marked), note giver may be reassigned, host may be promoted. Rejoin creates a fresh player if the old one was purged.
20. **Security limits are env-configurable** — `MAX_PLAYERS` and `MAX_ROOMS` can be set via environment variables. Socket/HTTP rate limits are hardcoded in `sockets/rate-limits.ts` and `index.ts`.
21. **`trust proxy` is enabled** — Express trusts one proxy hop for correct client IP identification behind nginx.
22. **VERSION is duplicated** — `shared/types.ts` has `VERSION` (2.1.0) for the client, `server/src/index.ts` has its own copy for the server (because the server can't import runtime values from the shared `.ts` file in production). Keep both in sync.