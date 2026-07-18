# Direct to Video

A self-hosted web app for playing a remote party game with a group. Players connect via a room code, manage their cards in a private browser view, and pitch verbally over Zoom/Teams. A separate audience/spectator page displays the full game state and is designed to be screen-shared.

> **Note:** Direct to Video is an unofficial clone of [Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm) by Cutlass & Cape Games. All credit for the game design and card content goes to them.

## Features

- **No login required** — players join with a 4-letter room code and their name
- **Note giver role** — a randomly selected player manages the timer and plays Note cards; the role rotates each round (no repeats until everyone has been note giver once)
- **Player view** — draw cards, select your movie, pitch, see your hand privately
- **Audience view** — large-screen spectator layout optimized for Zoom/Teams screen-sharing
- **Ready indicators** — during setup, the note giver sees ✓ ready / "choosing..." next to each writer
- **Host kick** — host can remove non-host players from the lobby
- **Automatic voting** — a 15-second voting timer starts automatically when all pitches are done; every player + audience member votes (one vote each, 1x weight; players cannot vote for themselves)
- **Cumulative scoring** — vote counts accumulate across rounds; the player with the highest total at game end wins (ties shown as ties)
- **Fixed round count** — host selects 3/5/7/10 rounds in the lobby (default 5)
- **Server-authoritative timer** — 45-second pitches with auto-pause when the Note Giver plays a Note card (5-second read window, then auto-resumes)
- **493 real cards** — 166 Plot, 161 Character, 166 Note cards transcribed from the physical game
- **Auto-draw mechanics** — cards with `____` placeholders automatically draw from the appropriate deck and substitute the text
- **Franchise cards** — special cards that reference previously pitched movies; host can toggle them on/off in the lobby
- **Cookie-based name persistence** — your name is remembered between sessions
- **Stale-disconnect cleanup** — 60s after disconnect, a player is fully removed; note giver reassigned if needed, host promoted if needed
- **Docker deployment** — single container, SQLite persistence via volume
- **Game logging** — connection IPs, player names, game events logged to `data/directtovideo.log` and `data/games.log`

## Tech Stack

- **Backend:** Node.js 20, TypeScript, Express, Socket.IO, better-sqlite3
- **Frontend:** React 18, Vite, React Router
- **Testing:** Vitest (218 unit/integration tests), Playwright (E2E)
- **Deployment:** Docker, docker-compose

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

App runs at `http://localhost:3000`

### Local development

```bash
npm install
npm run dev:server   # terminal 1 — server on :3000
npm run dev:client   # terminal 2 — Vite dev server on :5173
```

Use `http://localhost:5173` for development (proxies WebSocket to :3000).

## How to Play

1. Open the app in your browser
2. Leave the room code blank, enter your name, click **Join as Player** — you're the host
3. Share the 4-letter room code (or the room link) with friends
4. Friends enter the code + their name, click **Join as Player**
5. Anyone wanting to spectate enters the code and clicks **Join as Audience**
6. Host selects the total number of rounds (3/5/7/10, default 5) and optionally toggles franchise cards, then clicks **Start Game**
7. Each round: a **Note Giver** is randomly selected and draws 3 Note cards. Writers choose Plot or Character deck, select a card (a blind card auto-draws from the opposite deck), click **Ready to Pitch**, then pitch verbally over Zoom while the Note Giver controls the timer and plays Note cards. The Note Giver also pitches (they go last).
8. When all pitches are done, a 15-second voting timer starts automatically. Every player + audience member votes once (players cannot vote for themselves). The round winner is the player with the most votes; vote counts are added to each player's cumulative score.
9. Rounds continue until the host-selected total is reached. The player with the highest cumulative vote total wins (ties are shown as ties). Click **Play Again** to start a new game with the same players.

Full rules at `/rules` in the app.

### Voting

Voting is automatic — there is no manual winner selection:

- When the last pitcher ends, the server starts a **15-second voting timer** (`voting_started` event).
- **Every player + audience member** may vote, once each. Players cannot vote for themselves (enforced server-side).
- All votes are **1x weight** — there is no executive 2x vote (the executive role no longer exists).
- `vote_update` events stream running tallies to clients during voting.
- When the timer expires (or all eligible voters have voted), `tallyAndAdvance` finalizes the round: it computes the `roundWinnerId` (highest vote count; `null` on a tie), adds each player's vote count to their cumulative `score`, and emits `voting_ended`.
- Cumulative scores persist across rounds; the final winner is the player with the highest total at game end.

## Game Flow

```
Lobby → Setup → Card Selection → Pitching → Round End (auto-vote) → (next round) → Game End
```

- **Lobby:** Players join. Host selects total rounds (3/5/7/10) and optionally toggles franchise cards. Host can kick non-host players. Host clicks "Start Game".
- **Setup:** A **Note Giver** is randomly selected from a per-game permutation (no repeats until everyone has been note giver once). 3 Note cards are drawn for the Note Giver. Writers choose Plot or Character deck (3 cards). The Note Giver sees ✓ ready / "choosing..." next to each writer.
- **Card Selection:** Writers select a card from their hand. A blind card is auto-drawn from the opposite deck. Writers click "Ready to Pitch". Phase auto-advances when all writers are ready.
- **Pitching:** Writers pitch one at a time. The Note Giver is also a writer and pitches last (franchise card holders also go last). 45-second timer. The Note Giver can pause to play Note cards (5-second read window, auto-resumes).
- **Round End:** A 15-second voting timer starts automatically. All players + audience vote once (1x weight; players cannot vote for themselves). `tallyAndAdvance` computes the round winner and adds vote counts to each player's cumulative score.
- **Game End:** After the host-selected `totalRounds` is reached. Highest cumulative vote total wins. Ties displayed as ties. "Play Again" resets to lobby (note giver order re-permuted).

## Card Types

| Type      | Count | Description                                                               |
| --------- | ----- | ------------------------------------------------------------------------- |
| Plot      | 166   | Story premises (6 with auto-draw `____`, 7 franchise)                     |
| Character | 161   | Characters with location headers (10 franchise, 2 "Pick a...")            |
| Note      | 166   | Note Giver twist notes (8 with auto-draw: plot, character, or note cards) |

### Special card mechanics

- **Auto-draw cards:** Cards with `____` in the text automatically draw from the specified deck and substitute the placeholder. E.g., "has a steamy affair with ____" draws a character card.
- **Franchise cards:** Cards with `FRANCHISE PITCH:` header that reference previously pitched movies (display-only, player handles verbally). Filtered out in 2-player games; host can disable them in the lobby.
- **Multi-line notes:** Note cards with `/` separator display as two lines (note + note-giver commentary).
- **Note card draws:** Some note cards draw plot, character, or even other note cards when played.

## Testing

```bash
# Unit + integration tests
cd server && npx vitest run    # 140 server tests
cd client && npx vitest run    # 78 client tests

# E2E test (requires build first)
npm run build
npx playwright test --config e2e/playwright.config.ts

# Stress tests (requires running server)
npm run stress:local     # 10 players, 3 rounds
npm run stress:heavy     # 20 players, 5 rounds
npm run stress:voting    # 10 players + 30 audience, 3 rounds
npm run stress:extreme   # 20 players + 40 audience, 5 rounds
npm run stress:multiroom # 4 rooms, 5 players + 10 audience each
```

218 total unit/integration tests (140 server + 78 client).

> Note: `cd server && npx vitest run` reports 56 unhandled timer errors after all 140 tests pass — these are stale-disconnect `setTimeout` callbacks firing against closed in-memory SQLite handles. All tests pass; the errors are post-test cleanup noise.

## Project Structure

```
movie-pitch/
├── server/              # Node.js backend
│   ├── src/
│   │   ├── index.ts          # Express + Socket.IO bootstrap
│   │   ├── db.ts             # SQLite setup, migrations, card storage
│   │   ├── seed-cards.ts     # 493 card definitions
│   │   ├── rooms.ts          # Room management, code generation
│   │   ├── state-machine.ts  # Game phase transitions, tallyAndAdvance
│   │   ├── card-ops.ts       # Deck operations: shuffle, draw, refill, substitute
│   │   ├── sockets/          # Socket.IO layer (split module)
│   │   │   ├── handlers.ts       # Event handlers, timer tick, stale-disconnect, kick
│   │   │   ├── rate-limits.ts    # Per-IP, per-socket, join-throttle limiters
│   │   │   └── state-mapper.ts   # Visibility filtering (toPublicRoomState)
│   │   ├── timer.ts          # Server-authoritative timer
│   │   └── logger.ts         # Connection + game logging
│   └── test/                 # Server tests (140 tests, 7 files)
├── client/              # React frontend
│   ├── src/
│   │   ├── pages/         # Join, Game, Audience, Rules
│   │   ├── components/    # Card, Timer, Scoreboard, NoteGiverControls, etc.
│   │   ├── hooks/         # useRoom, useAudience
│   │   └── styles/        # cards.css, app.css
│   └── test/              # Client tests (78 tests, 10 files)
├── shared/              # TypeScript types + timer helpers shared between server/client
├── stress/              # Single-room + multi-room load simulations
├── e2e/                 # Playwright E2E tests
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Single service + volume
└── docs/                # Reference card images + design specs
```

## Configuration

| Environment Variable | Default                 | Description                 |
| -------------------- | ----------------------- | --------------------------- |
| `PORT`               | `3000`                  | Server listen port          |
| `DB_PATH`            | `data/directtovideo.db` | SQLite database path        |
| `MAX_PLAYERS`        | `20`                    | Max players per room        |
| `MAX_ROOMS`          | `20`                    | Max concurrent active rooms |

Stale-disconnect timeout (`STALE_DISCONNECT_MS`, 60s) and room cleanup TTL are hardcoded constants in the server source.

## Logging

Logs are written to the `data/` directory (persisted via Docker volume):

- `directtovideo.log` — all server events (HTTP, connections, joins, errors)
- `games.log` — game events (player joins with IP, game start, round winners, final scores)

## Future Scope

- **Team mode** (5-12 players): Teams of 2, 60-second pitches, dual note givers
- **Writers' Room variant**: TV show seasons, winner becomes next note giver, canon building, "6 Seasons and a Movie"
- **Tie-breaker lightning round**: 50-second pitch judged by everyone
- **Franchise card enhancement**: Let players select from previously pitched movies via UI

## Credits

- Original game design: Ben Kasner / Cutlass & Cape Games ([Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm))
- Web app: Jason Sherwin
- Card data: Transcribed from the physical card game
