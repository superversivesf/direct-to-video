# Direct to Video

A self-hosted web app for playing a remote party game with a group. Players connect via a room code, manage their cards in a private browser view, and pitch verbally over Zoom/Teams. A separate audience/spectator page displays the full game state and is designed to be screen-shared.

> **Note:** Direct to Video is an unofficial clone of [Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm) by Cutlass & Cape Games. All credit for the game design and card content goes to them.

## Features

- **No login required** — players join with a 4-letter room code and their name
- **Player view** — draw cards, select your movie, pitch, see your hand privately
- **Audience view** — large-screen spectator layout optimized for Zoom/Teams screen-sharing
- **Server-authoritative timer** — 45-second pitches with auto-pause when the Executive plays a Note card (5-second read window, then auto-resumes)
- **493 real cards** — 166 Plot, 161 Character, 166 Note cards transcribed from the physical game
- **Auto-draw mechanics** — cards with `____` placeholders automatically draw from the appropriate deck and substitute the text
- **Franchise cards** — special cards that reference previously pitched movies
- **Cookie-based name persistence** — your name is remembered between sessions
- **Docker deployment** — single container, SQLite persistence via volume
- **Game logging** — connection IPs, player names, game events logged to `data/directtovideo.log` and `data/games.log`

## Tech Stack

- **Backend:** Node.js 20, TypeScript, Express, Socket.IO, better-sqlite3
- **Frontend:** React 18, Vite, React Router
- **Testing:** Vitest (150 unit/integration tests), Playwright (E2E)
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
6. Host clicks **Start Game** when everyone's in
7. Each round: the Executive draws Note cards, writers choose Plot or Character deck, select a card (blind card auto-draws from the opposite deck), click **Ready to Pitch**, then pitch verbally over Zoom while the Executive controls the timer and plays Note cards
8. Executive picks the winner, rounds rotate until everyone has been Executive once

Full rules at `/rules` in the app.

## Game Flow

```
Lobby → Setup → Card Selection → Pitching → Round End → (next round) → Game End
```

- **Setup:** Executive draws 3 Note cards. Writers choose Plot or Character deck (3 cards).
- **Card Selection:** Writers select a card from their hand. A blind card is auto-drawn from the opposite deck. Writers click "Ready to Pitch".
- **Pitching:** Writers pitch one at a time (Executive's left first). 45-second timer. Executive can pause to play Note cards (5-second read window, auto-resumes).
- **Round End:** Executive picks the winning movie. Winner gets 1 point.
- **Game End:** After every player has been Executive once, highest score wins.

## Card Types

| Type | Count | Description |
|------|-------|-------------|
| Plot | 166 | Story premises (6 with auto-draw `____`, 7 franchise) |
| Character | 161 | Characters with location headers (10 franchise, 2 "Pick a...") |
| Note | 166 | Executive twist notes (8 with auto-draw: plot, character, or note cards) |

### Special card mechanics

- **Auto-draw cards:** Cards with `____` in the text automatically draw from the specified deck and substitute the placeholder. E.g., "has a steamy affair with ____" draws a character card.
- **Franchise cards:** Cards with `FRANCHISE PITCH:` header that reference previously pitched movies (display-only, player handles verbally).
- **Multi-line notes:** Note cards with ` / ` separator display as two lines (note + executive commentary).
- **Note card draws:** Some note cards draw plot, character, or even other note cards when played.

## Testing

```bash
# Unit + integration tests
cd server && npx vitest run    # 72 server tests
cd client && npx vitest run    # 78 client tests

# E2E test (requires build first)
npm run build
npx playwright test --config e2e/playwright.config.ts
```

150 total tests (72 server + 78 client + 1 E2E).

## Project Structure

```
movie-pitch/
├── server/              # Node.js backend
│   ├── src/
│   │   ├── index.ts       # Express + Socket.IO bootstrap
│   │   ├── db.ts          # SQLite setup, migrations, card storage
│   │   ├── seed-cards.ts  # 493 card definitions
│   │   ├── rooms.ts       # Room management, code generation
│   │   ├── state-machine.ts # Game phase transitions
│   │   ├── sockets.ts     # Socket.IO event handlers
│   │   ├── timer.ts       # Server-authoritative timer
│   │   └── logger.ts      # Connection + game logging
│   └── test/              # Server tests
├── client/              # React frontend
│   ├── src/
│   │   ├── pages/         # Join, Game, Audience, Rules
│   │   ├── components/    # Card, Timer, Scoreboard, etc.
│   │   ├── hooks/         # useRoom, useAudience
│   │   └── styles/        # cards.css, app.css
│   └── test/              # Client tests
├── shared/              # TypeScript types shared between server/client
├── e2e/                 # Playwright E2E tests
├── Dockerfile           # Multi-stage build
├── docker-compose.yml   # Single service + volume
└── plot.txt, character.txt, notes.txt  # Raw card transcriptions
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `3000` | Server listen port |
| `DB_PATH` | `data/directtovideo.db` | SQLite database path |
| `MAX_PLAYERS` | `20` | Max players per room |
| `MAX_ROOMS` | `20` | Max concurrent active rooms |

## Logging

Logs are written to the `data/` directory (persisted via Docker volume):

- `directtovideo.log` — all server events (HTTP, connections, joins, errors)
- `games.log` — game events (player joins with IP, game start, round winners, final scores)

## Future Scope

- **Team mode** (5-12 players): Teams of 2, 60-second pitches, dual executives
- **Writers' Room variant**: TV show seasons, winner becomes next Executive, canon building, "6 Seasons and a Movie"
- **Tie-breaker lightning round**: 50-second pitch judged by everyone
- **Franchise card enhancement**: Let players select from previously pitched movies via UI

## Credits

- Original game design: Ben Kasner / Cutlass & Cape Games ([Pitch Storm](https://boardgamegeek.com/boardgame/254132/pitchstorm))
- Web app: Jason Sherwin
- Card data: Transcribed from the physical card game