# Pitch Storm Web App — Design Spec

**Date:** 2026-07-10
**Status:** Approved (pending spec review)
**Game:** Pitch Storm by Cutlass & Cape Games

## Overview

A self-hosted web application for playing the card game Pitch Storm with a group remotely. Players connect via a room code, manage their cards in a private browser view, and pitch verbally over an external Zoom/Teams call. A separate audience/spectator page displays the full game state and is designed to be screen-shared so everyone on the call can see what's happening.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Backend | Node.js + Express + Socket.IO | Huge ecosystem, excellent real-time support, easy Docker deployment |
| Frontend | React + Vite | Large ecosystem, component libraries, good for interactive game UIs |
| Persistence | SQLite (file-based) | Survives restarts, easy to Dockerize, no external DB service needed |
| Architecture | Monorepo monolith (Approach A) | Single container, shared TypeScript types, simplest to build and self-host |
| Game scope (MVP) | Standard 3-5 player mode only | Team mode (5-12 players) and Writers' Room variant deferred to future work |
| Card content | 10 placeholder cards per deck | User will provide real card text later; cards rendered as styled components with text overlaid on a template graphic |
| Pitch capture | Voice via external Zoom/Teams | App handles cards, timer, and scoring only; no built-in voice chat |
| Game length | Fixed: 1 round per player (each player gets one turn as Executive) | Consistent game length, simple to implement |
| Spectator visibility | Full game state (revealed cards, timer, scores, notes played) | Audience sees everything except players' private hands |
| Authentication | None — room code + player name in cookie | Party game, no login/password needed |

## Game Rules Summary (Standard 3-5 Player Mode)

**Components:** Three card decks — NOTE (Executive), PLOT (Writers), CHARACTER (Writers).

**Round flow:**
1. The first Executive is chosen (host). In subsequent rounds, the Executive role rotates to the next player.
2. The Executive draws 3 NOTE cards.
3. Each writer chooses to draw 3 PLOT cards OR 3 CHARACTER cards (not both).
4. Each writer selects 1 card from their hand (face-down), then draws 1 card from either the PLOT or CHARACTER deck **without looking at it** — this becomes their "blind draw." The selected card + blind draw together form their "movie."
5. The writer to the Executive's left pitches first. They flip both cards and read them aloud.
6. The Executive starts a 45-second timer. The writer pitches their movie verbally (over Zoom).
7. At any point during the pitch, the Executive may PAUSE the timer and play a NOTE card, which the writer must incorporate into their pitch verbally.
8. After each pitch, the Executive refills their NOTE hand to 3 cards.
9. After all writers have pitched, the Executive selects the winning movie.
10. The winning writer keeps the NOTE card that was given to them as 1 point. If no note was given to them, they may take a NOTE card from the deck as a point.

**Game end:** After each player has taken one turn as Executive, the player with the most points wins. Ties are displayed as ties in the MVP (lightning round tie-breaker deferred to future scope).

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Docker Container                    │
│                                                        │
│  ┌──────────────┐     ┌─────────────────────────┐    │
│  │  Node.js API  │     │   React Static Files    │    │
│  │  (Express +   │────▶│   (served by Express)   │    │
│  │  Socket.IO)   │     │                         │    │
│  │               │     │  3 routes:              │    │
│  │  - Room mgmt  │     │  /        → Join screen  │    │
│  │  - Game state │     │  /room/:code → Game view │    │
│  │  - Timer      │     │  /audience/:code → Spect. │    │
│  │  - Card decks │     │                         │    │
│  │               │     └─────────────────────────┘    │
│  │    SQLite     │     ┌─────────────────────────┐    │
│  │  (game state  │     │   Socket.IO Rooms        │    │
│  │   + decks)    │     │                           │    │
│  └──────────────┘     │  room:CODE → players      │    │
│                       │  audience:CODE → specs    │    │
│                       └─────────────────────────┘    │
│                                                        │
└─────────────────────────────────────────────────────┘
```

- Single Node.js process serves both the REST/WS API and the built React static files.
- Socket.IO "rooms" naturally map to game rooms — players join `room:CODE`, spectators join `audience:CODE`.
- Game state lives in SQLite (survives restarts). Active game state is cached in memory during play and synced to SQLite on each state transition.
- Three client routes: join screen (`/`), player game view (`/room/:code`), audience/spectator view (`/audience/:code`).
- Room codes: 4-letter codes (e.g., `ABCD`), generated server-side, easy to share verbally.

## Data Model

```
Room
├── code: "ABCD"                    (4-letter room code)
├── phase: "lobby" | "setup" | "card-selection" | "pitching" | "round-end" | "game-end"
├── players: Player[]
│   └── Player
│       ├── id: "uuid"
│       ├── name: "Jason"
│       ├── socketId: "socket-xyz"
│       ├── isExecutive: boolean
│       ├── score: number
│       └── hand: Card[]            (PLOT or CHARACTER cards, 3 max)
├── executiveId: "uuid"             (current round's executive)
├── currentPitcherId: "uuid"        (whose turn to pitch)
│
├── deck: Deck
│   ├── plot: Card[]                (remaining PLOT cards)
│   ├── character: Card[]           (remaining CHARACTER cards)
│   └── note: Card[]                (remaining NOTE cards)
│
├── executiveNotes: Card[]          (Executive's hand of 3 NOTE cards)
│
├── movies: Movie[]                 (each writer's 2-card movie)
│   └── Movie
│       ├── playerId: "uuid"
│       ├── chosenCard: Card        (the card they picked from hand)
│       └── randomCard: Card        (the blind-draw attached card)
│
├── timer
│   ├── running: boolean
│   ├── secondsRemaining: number    (45 in standard mode)
│   ├── pausedAt: timestamp | null
│
├── round
│   ├── current: number             (1 to N players)
│   ├── total: number               (count of players)
│
└── pitchOrder: string[]            (playerIds in pitch order — Exec's left first)

Card
├── id: "uuid"
├── type: "plot" | "character" | "note"
└── text: "A time traveler discovers..."

GameState (SQLite persistence)
├── rooms table: serialized Room objects keyed by code
├── decks table: card definitions (type + text, seeded at startup)
└── created_at, updated_at timestamps
```

**Design decisions:**
- State machine phases: `lobby → setup → card-selection → pitching → round-end → (next round) → game-end`
- Each round: Exec is set → writers draw & select cards → pitchers go one at a time → Exec picks winner → rotate Exec role → repeat until all players have been Exec.
- Timer is server-authoritative — clients just display the countdown, server controls start/pause/expire.
- Card text stored in SQLite, seeded from a JSON fixture on first startup (10 placeholders per deck for now, easily replaceable with real card text later).
- Cards rendered as styled React components with text overlaid on a card template graphic — no per-card image assets needed.
- Room state cached in memory during active play, persisted to SQLite after each state transition (card draw, phase change, score update).

## Socket.IO Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `(code, name)` | Player joins a game room |
| `select_deck_type` | `("plot" \| "character")` | Writer chooses which deck to draw from |
| `select_card` | `(cardId)` | Writer selects a card from their hand to play |
| `draw_random_card` | `(deckType)` | Writer draws a blind card from PLOT or CHARACTER deck |
| `reveal_movie` | `(playerId)` | Writer reveals their 2-card movie |
| `start_timer` | `()` | Executive starts the 45-second timer |
| `pause_timer` | `()` | Executive pauses the timer |
| `play_note` | `(noteCardId, playerId)` | Executive plays a NOTE card onto a pitcher |
| `end_pitch` | `()` | Executive ends the current pitch |
| `select_winner` | `(playerId)` | Executive selects the winning movie |
| `next_pitcher` | `()` | Advance to next pitcher |
| `next_round` | `()` | Start the next round |
| `join_audience` | `(code)` | Spectator joins the audience for a room |

### Server → Client (room:CODE)

| Event | Payload | Description |
|-------|---------|-------------|
| `room_joined` | `(roomState)` | Full room state on join |
| `player_joined` | `(players)` | Updated player list |
| `deck_selected` | `(playerId, type)` | A writer chose their deck type |
| `card_selected` | `(playerId)` | A writer selected a card (face-down) |
| `card_drawn` | `(playerId, card)` | Blind card drawn for a writer |
| `movie_revealed` | `(movie)` | A writer's 2-card movie is revealed |
| `timer_started` | `(secondsRemaining)` | Timer started/resumed |
| `timer_paused` | `(remainingSeconds)` | Timer paused |
| `note_played` | `(noteCard, playerId)` | NOTE card played on a pitcher |
| `pitch_ended` | `(playerId)` | Pitch concluded |
| `next_pitcher` | `(playerId)` | Next pitcher's turn |
| `winner_selected` | `(playerId, noteCard)` | Round winner announced |
| `round_started` | `(roundNumber)` | New round begun |

### Server → Client (audience:CODE)

| Event | Description |
|-------|-------------|
| `audience_joined` | Full visible game state on join (no private hands) |
| *(all game events mirrored)* | Audience receives all events except private hand data |

### Event Flow (Single Pitch)

```
Player flips cards ──▶ reveal_movie
                   ──▶ movie_revealed (to room + audience)
Exec starts timer  ──▶ start_timer
                   ──▶ timer_started (room + audience: countdown display)
Exec pauses        ──▶ pause_timer
                   ──▶ timer_paused
Exec plays NOTE    ──▶ play_note(noteCard, pitcherId)
                   ──▶ note_played (room + audience: NOTE card shown)
Exec resumes       ──▶ start_timer
                   ──▶ timer_started (resumes from remaining)
Timer expires OR
Exec ends pitch   ──▶ end_pitch
                   ──▶ pitch_ended
Next pitcher       ──▶ next_pitcher
                   ──▶ next_pitcher
```

### Visibility Rules

| Event | Players see | Audience sees |
|-------|-------------|---------------|
| Player hands | Only own hand | Never |
| Executive NOTE hand | Only Exec | Never |
| NOTE played on pitcher | All players + audience | Yes |
| Movies (revealed) | All players + audience | Yes |
| Timer state | All players + audience | Yes |
| Scores | All players + audience | Yes |
| Card selection (face-down) | "Player X has selected" only | Same — no card content |

### Cookie Handling

Player name stored in browser cookie on first join. On reconnect, if cookie present and socket joins same room, server restores player identity and hand.

## Client UI Screens

### Route: `/` — Join Screen

- Room code input (4 letters)
- Player name input (pre-filled from cookie if present)
- "Join as Player" button → navigates to `/room/:code`
- "Join as Audience" button → navigates to `/audience/:code`

### Route: `/room/:code` — Player Game View

State-dependent, renders differently for each phase:

- **Lobby:** Player list, host sees "Start Game" button
- **Card Selection (pre-pitch):** Deck type choice (PLOT or CHARACTER), hand of 3 cards, select 1 card to play, draw 1 blind card, "Ready to Pitch" button
- **Pitching (your turn):** Timer countdown, your 2-card movie revealed, NOTE cards from Executive displayed, "I'm Done Pitching" button
- **Pitching (someone else's turn):** Timer countdown, current pitcher's name, their 2-card movie revealed, NOTE cards displayed, waiting state
- **Executive View (during someone's pitch):** Timer countdown, pitcher's movie, own NOTE hand (3 cards), "Pause & Play Note" button, "Start Timer" / "End Pitch" buttons
- **Round End:** All movies displayed with cards + notes, "Pick This Movie" buttons for each
- **Game End:** Final scores ranked, winner highlighted, "Play Again" button

### Route: `/audience/:code` — Spectator View

Designed for screen-sharing over Zoom/Teams — large fonts, high contrast, TV-friendly:

- Room code and round number
- Large timer countdown
- Current pitcher's name
- Pitcher's 2-card movie (chosen + blind draw) displayed large
- NOTE cards from Executive displayed prominently as played
- Scoreboard at bottom
- Auto-updates via Socket.IO — no manual refresh
- Shows everything players see except private hands

## Game State Machine & Round Flow

```
LOBBY
  │  host clicks "Start Game"
  ▼
SETUP (round start)
  │  Server assigns Executive (first: host, then rotates)
  │  Executive draws 3 NOTE cards from deck
  │  Players choose deck type via UI (PLOT or CHARACTER)
  │  All writers draw 3 cards from chosen deck type
  ▼
CARD_SELECTION
  │  Each writer:
  │    1. Selects 1 card from hand (face-down)
  │    2. Draws 1 blind card from PLOT or CHARACTER deck (not looked at)
  │    3. Presses "Ready to Pitch"
  │  When all writers ready →
  ▼
PITCHING
  │  Pitch order: Executive's left first (circular)
  │  For each pitcher:
  │    1. Reveal their 2-card movie (to room + audience)
  │    2. Executive starts timer (45s)
  │    3. Pitcher pitches verbally over Zoom
  │    4. Executive may PAUSE timer, play a NOTE card
  │       → NOTE card displayed to room + audience
  │       → Pitcher must incorporate (verbally)
  │       → Executive resumes timer
  │    5. Timer hits 0 OR Executive clicks "End Pitch"
  │    6. Executive refills NOTE hand to 3 cards
  │    7. → Next pitcher
  │  When all writers have pitched →
  ▼
ROUND_END (Executive selects winner)
  │  All movies displayed with their cards + notes played
  │  Executive clicks winner
  │  Winner keeps the NOTE card as 1 point
  │     (if no note was given to them, draw from NOTE deck)
  │  Scores updated
  │  Round counter increments
  │  If round < total players → SETUP (next round, rotate Executive)
  │  If round = total players → GAME_END
  ▼
GAME_END
  │  Final scores displayed
  │  Winner highlighted
  │  "Play Again" → resets room to LOBBY (keeps players, clears scores/hands)
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Player disconnects mid-round | Marked as "disconnected", skipped in pitch order. If Executive disconnects, host takes over Exec role for remainder of round. |
| Player reconnects | Cookie restores identity. If their pitch hasn't happened yet, rejoin normally. If their pitch already passed, they rejoin as spectator until round end. |
| Audience member joins mid-game | Gets current full visible game state immediately on join. |
| Timer running and Exec pauses + plays last NOTE card | Timer stays paused until Exec resumes. Exec can still end pitch while paused. |
| Writer doesn't select cards before all others ready | Wait for all writers. Host can force-start with auto-random selection. |
| All NOTE cards exhausted from deck | Executive draws fewer cards. Game continues with remaining NOTE cards. |
| 2 players only | Both are Exec for alternating rounds. Writer pitches to Exec. |

## Project Structure

```
movie-pitch/
├── server/
│   ├── index.ts                  (Express + Socket.IO bootstrap)
│   ├── db.ts                     (SQLite setup, migrations, seed)
│   ├── seed-cards.ts             (10 placeholder cards per deck)
│   ├── rooms.ts                  (Room management, code generation)
│   ├── state-machine.ts          (Game phase transitions, validation)
│   ├── sockets.ts               (Socket.IO event handlers)
│   ├── timer.ts                  (Server-authoritative timer logic)
│   └── types.ts                  (Shared game types re-export)
│
├── shared/
│   └── types.ts                  (Player, Card, Movie, Room, Phase, Events)
│
├── client/
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx               (Router: /, /room/:code, /audience/:code)
│   │   ├── socket.ts             (Socket.IO client singleton)
│   │   ├── hooks/
│   │   │   ├── useRoom.ts        (Room state + socket subscription)
│   │   │   └── useTimer.ts       (Client countdown display)
│   │   ├── pages/
│   │   │   ├── Join.tsx
│   │   │   ├── Game.tsx          (Player game view — all phases)
│   │   │   └── Audience.tsx      (Spectator big-screen view)
│   │   ├── components/
│   │   │   ├── Card.tsx          (Renders card text on template)
│   │   │   ├── CardTemplate.tsx  (Background graphic + text overlay)
│   │   │   ├── Timer.tsx        (Countdown display)
│   │   │   ├── Scoreboard.tsx
│   │   │   ├── PlayerList.tsx
│   │   │   ├── MovieReveal.tsx   (2-card movie display)
│   │   │   ├── ExecutiveControls.tsx  (Timer + note playing)
│   │   │   ├── WriterControls.tsx     (Card selection + draw)
│   │   │   └── RoundSummary.tsx
│   │   └── styles/
│   │       └── cards.css         (Card template styling)
│   ├── vite.config.ts
│   └── tsconfig.json
│
├── Dockerfile                    (multi-stage: build client, bundle with server)
├── docker-compose.yml
├── package.json                  (workspaces: server, client, shared)
├── tsconfig.base.json
└── .dockerignore
```

## Docker Configuration

### Dockerfile (multi-stage)

```dockerfile
# Stage 1: Build client
FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY client ./client
COPY server ./server
RUN npm ci
RUN npm run build:client

# Stage 2: Production
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared ./shared
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
RUN npm ci --omit=dev
EXPOSE 3000
VOLUME ["/app/data"]              # SQLite persistence
CMD ["node", "server/index.js"]
```

### docker-compose.yml

```yaml
services:
  pitchstorm:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - pitchstorm-data:/app/data    # SQLite file persistence
    environment:
      - PORT=3000
volumes:
  pitchstorm-data:
```

### Build & Dev Workflow

- `npm run dev:server` — runs server with tsx (hot reload)
- `npm run dev:client` — runs Vite dev server (hot reload, proxies WS to server)
- `npm run build:client` — builds React to `client/dist/`
- `npm run build` — builds client, then compiles server
- `docker compose up --build` — full self-hosted deployment

**SQLite location:** `/app/data/pitchstorm.db` — persisted via Docker volume so game state and card decks survive container restarts.

## Testing Strategy

- **Server unit tests:** State machine transitions, timer logic, room management, card deck shuffling/drawing. Jest or Vitest.
- **Socket integration tests:** Simulate client connections joining rooms, playing through rounds, verify correct events emitted to room vs audience.
- **Client component tests:** React Testing Library — verify each screen renders correctly for each game phase, cards display properly, timer counts down.
- **End-to-end test:** Playwright — create a room, join 3 players + 1 audience, play through a full game verifying the spectator sees the correct state at each phase.

## Future Scope (Deferred)

- **Team mode (5-12 players):** Teams of 2, one draws CHARACTER, one draws PLOT, can't discuss. Each executive on a team draws own NOTE cards. 60-second pitches.
- **Writers' Room variant:** TV show seasons instead of movies, winner becomes next Executive, previous pitch becomes canon, "6 Seasons and a Movie" finale.
- **Custom card support:** Let players create custom cards/decks in addition to or instead of the official ones.
- **Tie-breaker lightning round:** 50-second lightning round judged by everyone else at the table.