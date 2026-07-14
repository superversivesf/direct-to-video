# AGENTS.md — Direct to Video

> **Status snapshot:** 2026-07-14. v1.0.2. All 150 tests pass, build and typecheck clean. Production-deployed and stress-tested with 20 players, 20 rounds. Security-hardened for public internet exposure.

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
direct-to-video/
├── package.json              # Root workspace: shared, server, client, stress
├── tsconfig.base.json        # Shared TS config (strict, ES2022, bundler resolution)
├── Dockerfile                # Multi-stage: build client+server → slim non-root runtime
├── docker-compose.yml        # Single service + persistent volume, resource limits
├── shared/
│   ├── package.json          # @direct-to-video/shared
│   └── types.ts              # All shared types + VERSION constant
├── server/
│   ├── package.json          # @direct-to-video/server (ESM, type: module)
│   ├── tsconfig.json         # Extends base, outDir: dist, rootDir: src
│   ├── vitest.config.ts      # globals: true, environment: node, include: test/**/*.test.ts
│   ├── src/
│   │   ├── index.ts          # Express + Socket.IO bootstrap, helmet, rate limiting, room cleanup
│   │   ├── db.ts             # SQLite init, migrations, room CRUD, card deck queries
│   │   ├── seed-cards.ts     # 493 real cards (166 plot, 161 character, 166 note)
│   │   ├── rooms.ts          # RoomStore, room creation, code generation, name validation, limits
│   │   ├── state-machine.ts  # Game phase transitions, card drawing, deck reshuffling, winner selection
│   │   ├── sockets.ts        # Socket.IO handlers, timer tick loop, rate limiting, state broadcasting
│   │   ├── timer.ts          # Server-authoritative timer: start, pause, tick, note-pause, resume
│   │   └── logger.ts         # File logging to data/directtovideo.log + data/games.log
│   └── test/
│       ├── db.test.ts        # 7 tests
│       ├── rooms.test.ts     # 14 tests (includes name validation + room capacity)
│       ├── timer.test.ts     # 15 tests
│       ├── state-machine.test.ts  # 32 tests
│       └── sockets.test.ts   # 4 tests
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
│   │   │   ├── Game.tsx      # Player view — renders all 6 phases, share link, leave button
│   │   │   ├── Audience.tsx  # Spectator view — large-screen layout
│   │   │   └── Rules.tsx     # How-to-play page with clone acknowledgment
│   │   ├── components/
│   │   │   ├── Card.tsx              # Card renderer (text, header, franchise, face-down, note paragraphs)
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
│   │       ├── app.css       # Main app styles (share link, leave button, version tag, subtitle)
│   │       └── cards.css     # Card template styling (note cards: Permanent Marker font, 20% larger)
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
├── stress/
│   ├── package.json          # @direct-to-video/stress
│   └── stress-test.ts        # Full game simulation (configurable players/rounds/target)
├── e2e/
│   ├── playwright.config.ts  # Port 3100, chromium
│   └── full-game.test.ts     # Full 2-player game via socket clients + audience browser
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
cd server && npx vitest run  # 72 server tests
cd client && npx vitest run  # 78 client tests

# E2E (requires build first + running server on :3100):
npm run build
npx playwright test --config e2e/playwright.config.ts

# Stress test (requires running server):
npm run stress:local         # 10 players, 3 rounds, localhost
npm run stress:heavy         # 20 players, 5 rounds, localhost
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
Client (React) ──socket.io──▶ Server (Socket.IO handlers)
                                  │
                                  ├──▶ State Machine (phase transitions, deck reshuffling)
                                  ├──▶ RoomStore (in-memory cache + SQLite)
                                  ├──▶ Timer (server-authoritative, 1s tick loop)
                                  ├──▶ Rate Limiters (per-IP, per-socket, join throttle)
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

- **lobby:** Players join, host clicks "Start Game". Shareable room link available.
- **setup:** Executive assigned (rotates each round), 3 NOTE cards drawn, writers choose deck type (PLOT or CHARACTER) and draw 3 cards
- **card-selection:** Writers select 1 card from hand, blind card auto-drawn from opposite deck, click "Ready to Pitch". Phase auto-advances when all writers ready.
- **pitching:** Writers pitch one at a time (Executive's left first, franchise card holders go last). 45s timer. Executive can pause to play NOTE cards (5s read window, auto-resumes).
- **round-end:** Executive picks winning movie. Winner gets 1 point.
- **game-end:** After every player has been Executive once. Highest score wins. "Play Again" resets to lobby.

### Card Deck Reshuffling

When any deck (plot, character, or note) runs out, it automatically refills and reshuffles from the full card set. This allows games with more players than the physical game was designed for. In 2-player games, franchise cards are filtered from both the initial deck and the refill deck.

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
- **Franchise cards:** Cards with `isFranchise: true` and `header: "FRANCHISE PITCH:"` reference previously pitched movies (display-only, handled verbally). Filtered out in 2-player games. Franchise card holders pitch last.
- **Multi-line notes:** Note cards with ` / ` separator display as separate paragraphs (note + executive commentary).
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
| Docker | Runs as | non-root `appuser` |
| Docker | Filesystem | read-only (data volume writable) |
| Docker | Memory | 512MB limit |
| Docker | CPU | 1 core limit |
| Docker | Restart | unless-stopped |

## What Works (Verified 2026-07-14)

### Tests — All Passing

| Suite | Tests | Status |
|-------|-------|--------|
| server/test/timer.test.ts | 15 | PASS |
| server/test/db.test.ts | 7 | PASS |
| server/test/rooms.test.ts | 14 | PASS |
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
| **Total** | **150** | **ALL PASS** |

### Build & Typecheck

- `npm run build` — succeeds (client vite build + server tsc compile)
- `npx tsc --noEmit -p server/tsconfig.json` — clean
- `npx tsc --noEmit -p client/tsconfig.json` — clean

### Stress Test

- Full 20-player, 20-round game completed successfully against production
- 380 pitches, deck reshuffling, note cards, winner selection — all verified
- No crashes, no rate-limit false positives, no memory issues

### Features Working

- Full game flow: lobby → setup → card-selection → pitching → round-end → game-end → play again
- 493 real cards transcribed from the physical game (166 plot, 161 character, 166 note)
- Card deck reshuffling when decks run out (supports large player counts)
- Room creation with 4-letter codes (no ambiguous chars: no O, 0, I, 1)
- Player join with name persistence via cookie
- Same-name rejoin restores player identity (case-insensitive match)
- Shareable room link with copy button in lobby
- Join page pre-fills room code from `?code=` query parameter
- Leave game button in all phases (marks disconnected, can rejoin later)
- Host succession: if host leaves, first connected player promoted to host
- Audience/spectator view for screen-sharing
- Server-authoritative 45-second timer with SVG ring display
- Executive NOTE card play with 5-second pause window and auto-resume
- Auto-draw cards with `____` placeholder substitution
- Franchise card display (filtered in 2-player games, holders pitch last)
- Blind card auto-draw from opposite deck on card selection
- Pitch order: Executive's left first, circular rotation, franchise holders last
- Round rotation: Executive role rotates to next player each round
- Winner selection and scoring (1 point per win)
- Game end after all players have been Executive once
- Tie detection and display
- Disconnect handling (player marked as disconnected, not removed)
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

### 2. No CI/CD pipeline

No GitHub Actions, no CI configuration of any kind. Tests and build are only verified manually.

### 3. E2E test not verified

The Playwright E2E test (`e2e/full-game.test.ts`) uses port 3100 and requires a built server running. The stress test (`stress/stress-test.ts`) is more comprehensive and has been verified against production.

### 4. `round_started` dead code after timer expiry

In `sockets.ts`, the timer tick loop has a dead code block that checks for `setup` phase immediately after `endPitch` on timer expiry, which will never be true (endPitch transitions to `round-end`, not `setup`). This is harmless but redundant.

### 5. Executive disconnect soft-lock

When the Executive disconnects, they are marked `isDisconnected: true` but the Executive role does not transfer. The game can soft-lock if the Executive disconnects during pitching or round-end. Host succession only covers the host role, not the executive role.

### 6. Force-start for slow writers not implemented

There is no force-start mechanism. If a writer goes AFK during card selection, the game is stuck.

### 7. React Router v7 future flag warnings

Client tests emit warnings about React Router v6 future flags. These are warnings only, not errors.

### 8. No reconnection state recovery

If a player disconnects mid-game and reconnects, they get the current room state. No "spectator until round end" mode for missed pitches.

### 9. Room codes are letters-only

The implementation plan specified letters + numbers. The actual implementation is letters only (`ABCDEFGHJKLMNPQRSTUVWXYZ`). This is a deliberate deviation — better for verbal communication.

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `DB_PATH` | `data/directtovideo.db` | SQLite database path |
| `MAX_PLAYERS` | `20` | Max players per room |
| `MAX_ROOMS` | `20` | Max concurrent active rooms |

Note: `ROOM_TTL_MS` and `CLEANUP_INTERVAL_MS` are hardcoded constants in `server/src/index.ts`.

## Testing Notes

- **Server tests** use in-memory SQLite (`:memory:`) — no file cleanup needed
- **Client tests** use jsdom + @testing-library/react + jest-dom matchers
- **Socket tests** (4 tests) test the socket handler setup, not full game flow
- **E2E test** uses raw socket.io-client connections for player actions + a Playwright browser page for the audience UI. Port 3100. Requires `npm run build` + running server first.
- **Stress test** simulates a full N-player game via socket connections. Configurable via `STRESS_TARGET`, `STRESS_PLAYERS`, `STRESS_ROUNDS` env vars. Verified with 20 players × 20 rounds against production.
- State-machine tests are comprehensive (32 tests) — cover startGame, setupRound, selectDeckType, selectCard, startPitching, revealMovie, endPitch, selectWinner, nextRound, playAgain, and auto-draw mechanics.

## Future Scope (From README)

- **Team mode** (5-12 players): Teams of 2, 60-second pitches, dual executives
- **Writers' Room variant**: TV show seasons, winner becomes next Executive, canon building, "6 Seasons and a Movie"
- **Tie-breaker lightning round**: 50-second pitch judged by everyone
- **Franchise card enhancement**: Let players select from previously pitched movies via UI

## Gotchas for Agents

1. **Root `npm test` works** — it runs both server and client test suites. You can also run them individually from each workspace.
2. **Server imports use `.js` extensions** — ESM requires this even for TypeScript files. Don't remove them.
3. **`seed-cards.ts` is huge** — 493 cards, ~600 lines. Don't read the whole file unless necessary. Use grep/search for specific cards.
4. **State machine is pure** — `state-machine.ts` functions take a `RoomStore` and `Room`, mutate via `store.saveRoom()`, and the caller re-fetches with `store.getRoom()`. Always re-fetch after calling a state-machine function.
5. **Socket handlers re-fetch room after state-machine calls** — `ctx.room` is a snapshot. After calling any state-machine function, use `store.getRoom(ctx.room.code)!` to get updated state.
6. **Timer is server-authoritative** — never compute timer values on the client. The `useRoom` hook always uses server-pushed `timer_tick` values.
7. **Visibility filtering happens in `toPublicRoomState`** — don't add private fields to `PublicRoomState`. Hands are only included for the requesting player.
8. **`broadcastAllStates` sends per-player state** — each player gets their own `room_joined` event with their own hand. Don't broadcast raw room state to all sockets.
9. **Room codes exclude ambiguous characters** — `ABCDEFGHJKLMNPQRSTUVWXYZ` only (no O, 0, I, 1). No numbers.
10. **The `selectCard` function auto-draws the blind card** — there is no separate "draw blind card" event. Card selection + blind draw + movie creation happen atomically in `state-machine.ts:selectCard`.
11. **Deck reshuffling is automatic** — when a deck runs out, `drawFromDeck` refills from the full card set. In 2-player games, franchise cards are filtered from refills too.
12. **Security limits are env-configurable** — `MAX_PLAYERS` and `MAX_ROOMS` can be set via environment variables. Socket/HTTP rate limits are hardcoded in `sockets.ts` and `index.ts`.
13. **`trust proxy` is enabled** — Express trusts one proxy hop for correct client IP identification behind nginx.
14. **VERSION is duplicated** — `shared/types.ts` has `VERSION` for the client, `server/src/index.ts` has its own copy for the server (because the server can't import runtime values from the shared `.ts` file in production).