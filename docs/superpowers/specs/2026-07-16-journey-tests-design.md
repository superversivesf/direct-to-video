# E2E Journey Tests Design

**Date:** 2026-07-16
**Status:** Approved design
**Motivation:** Comprehensive end-to-end testing of all game workflows via Playwright browser automation

## Problem

The existing E2E test (`full-game.test.ts`) covers a single 2-player game where players act via raw sockets and only the audience uses the browser. It doesn't test:
- The actual player UI (buttons, card selection, deck choice, timer controls)
- 3+ player games with round rotation
- Audience voting end-to-end
- Reconnection and host succession
- NOTE card play with timer pause/resume
- Timer expiry auto-advancing the game
- Deck reshuffling
- Auto-draw card substitution
- Franchise card pitch ordering
- Tie-breaker in voting

## Design

### Test Level

Playwright E2E tests. Players driven through real browser pages (clicking buttons, typing names, selecting cards). Server runs via `webServer` config on port 3100 with an in-memory or temp-file SQLite database.

### Architecture

```
e2e/
├── playwright.config.ts          # Existing config (port 3100, webServer)
├── helpers.ts                    # Shared test helpers
├── full-game.test.ts             # Existing 2-player test (kept as-is)
└── journeys/
    ├── full-three-player.test.ts # 3-player full game with role rotation
    ├── audience-voting.test.ts   # Audience voting flow with tie-breaker
    ├── reconnection.test.ts      # Player disconnect + same-name rejoin
    ├── host-succession.test.ts   # Host leaves, next player promoted
    ├── note-card-timer.test.ts   # Executive plays NOTE, timer pauses/resumes
    ├── timer-expiry.test.ts      # Pitch timer expires, game auto-advances
    ├── deck-reshuffle.test.ts    # Deck exhaustion + reshuffle verification
    ├── auto-draw-cards.test.ts   # ____ placeholder substitution via UI
    └── franchise-cards.test.ts   # Franchise card holder pitches last
```

### Helper Functions (`e2e/helpers.ts`)

All helpers return Playwright `Page` objects or state assertions. No test hooks added to app code — selectors use existing CSS classes and text content.

```ts
import type { Page, Browser } from "@playwright/test";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, DeckType } from "@direct-to-video/shared";

const BASE = "http://localhost:3100";

interface PlayerSession {
  page: Page;
  socket: ClientSocket;   // parallel socket connection for state inspection
  playerId: string;
  roomCode: string;
}

// Create a player by navigating the Join page UI
async function createPlayer(browser: Browser, roomCode: string, name: string): Promise<PlayerSession> {
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.fill('input[placeholder*="Room Code"]', roomCode);
  await page.fill('input[placeholder*="Your Name"]', name);
  await page.click("text=Join as Player");
  await page.waitForURL("**/room/**");
  await page.waitForSelector(".game-view", { timeout: 10000 });

  // Connect a parallel socket to inspect server state directly
  const socket = ioClient(BASE, { forceNew: true });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("socket timeout")), 10000);
    socket.on("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve();
    });
    socket.on("connect", () => {
      socket.emit("join_room", roomCode, name);
    });
  });

  const state = await getState(socket);
  return { page, socket, playerId: state.myPlayerId!, roomCode: state.code };
}

async function createAudience(browser: Browser, roomCode: string): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(BASE);
  await page.fill('input[placeholder*="Room Code"]', roomCode);
  await page.click("text=Join as Audience");
  await page.waitForURL(`**/audience/${roomCode}`);
  await page.waitForSelector(".audience-view", { timeout: 10000 });
  return page;
}

// Wait for a specific phase to appear in the UI
async function waitForPhase(page: Page, phase: string, timeout = 15000): Promise<void> {
  // PhaseIndicator renders dots; we infer phase from visible text
  const phaseTexts: Record<string, string> = {
    lobby: "Start Game",
    setup: "Choose your deck",
    "card-selection": "Your Hand",
    pitching: "Now Pitching",
    "round-end": "Executive is choosing",
    "game-end": "wins",
  };
  await page.waitForSelector(`text=/${phaseTexts[phase]}/i`, { timeout });
}

// Get current server state via the parallel socket
function getState(socket: ClientSocket, timeout = 10000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("getState timeout")), timeout);
    socket.once("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve(state);
    });
  });
}

// Trigger a state broadcast by emitting a no-op event (play_again isn't a no-op...)
// Actually, we need to receive room_joined events that the server sends on every state change.
// We do this by listening, not requesting. The parallel socket receives all broadcasts.
function onStateUpdate(socket: ClientSocket): Promise<PublicRoomState> {
  return new Promise((resolve) => {
    socket.once("room_joined", (state: PublicRoomState) => resolve(state));
  });
}

// UI action helpers
async function clickStartGame(page: Page): Promise<void> {
  await page.click("text=Start Game");
}

async function clickDrawCards(page: Page, deckType: "plot" | "character"): Promise<void> {
  await page.click(`text=Draw ${deckType.toUpperCase()} cards`);
}

async function clickSelectFirstCard(page: Page): Promise<void> {
  await page.waitForSelector(".card-row .card");
  await page.click(".card-row .card >> nth=0");
}

async function clickReadyToPitch(page: Page): Promise<void> {
  await page.click("text=Ready to Pitch");
}

async function clickStartTimer(page: Page): Promise<void> {
  await page.click("text=Start Timer");
}

async function clickPauseTimer(page: Page): Promise<void> {
  await page.click("text=Pause Timer");
}

async function clickEndPitch(page: Page): Promise<void> {
  await page.click("text=End Pitch");
}

async function clickPickMovie(page: Page, playerName: string): Promise<void> {
  await page.click(`text=Pick This Movie >> .. >> text=${playerName}'s Movie`);
  // Or more reliably: click the Pick This Movie button in the round-summary-movie containing the player's name
}

async function clickPlayAgain(page: Page): Promise<void> {
  await page.click("text=Play Again");
}

async function clickLeaveGame(page: Page): Promise<void> {
  await page.click(".btn-leave");
}
```

### Journey Tests

#### 1. Full 3-Player Game (`full-three-player.test.ts`)

**Tests:** lobby → setup → card-selection → pitching → round-end → setup (round 2) → pitching → round-end → setup (round 3) → pitching → round-end → game-end → play again → lobby

**Key assertions:**
- All 3 players visible in lobby
- Executive role rotates each round (player 0 → player 1 → player 2)
- Each round has 2 writers (non-executive players)
- Pitch order: executive's left first, circular
- After 3 rounds, game-end screen appears with confetti
- Scoreboard shows all 3 players with correct scores
- Play Again resets to lobby with all players retained
- Audience page reflects each phase transition in real-time

**Detailed flow:**
1. Create room with player "Alice"
2. Join "Bob" and "Charlie"
3. Audience page joins
4. Alice starts game
5. Round 1: Alice=Executive, Bob+Charlie=Writers
   - Bob draws PLOT cards, selects first card, clicks Ready
   - Charlie draws CHARACTER cards, selects first card, clicks Ready
   - Phase auto-advances to pitching
   - Alice sees both movies revealed (first pitcher auto-revealed)
   - Alice starts timer, waits, ends pitch for first pitcher
   - Second pitcher auto-revealed, Alice starts timer, ends pitch
   - Round-end: Alice picks winner (Bob)
6. Round 2: Bob=Executive, Alice+Charlie=Writers
   - Same flow, Bob picks winner (Alice)
7. Round 3: Charlie=Executive, Alice+Bob=Writers
   - Same flow, Charlie picks winner (Charlie)
8. Game-end: all 3 players have been executive once
   - Scoreboard visible, confetti visible
   - Alice (host) clicks Play Again
   - Back to lobby, all 3 players present

#### 2. Audience Voting Flow (`audience-voting.test.ts`)

**Tests:** audience voting end-to-end including tie-breaker with executive 2x weight

**Key assertions:**
- Executive can start voting when audience is present
- "Start Audience Voting" button appears for executive
- Audience member sees vote buttons for each movie
- Audience casts vote, vote count updates
- Executive casts vote (2x weight)
- Timer expiry tallies votes and selects winner
- Tie scenario: executive's 2x vote breaks the tie
- Winner is announced, round advances

**Detailed flow:**
1. 3 players join, play to round-end (using helper that plays through setup+pitching)
2. 2 audience members join
3. Executive clicks "Start Audience Voting"
4. All players + audience see voting timer (30s)
5. Audience page shows "Vote for the Best Movie!" with vote buttons
6. Audience member 1 clicks vote for movie A
7. Vote count updates to 1 for movie A
8. Audience member 2 clicks vote for movie B
9. Executive votes for movie A (2x weight → A has 3, B has 1)
10. Wait for timer to expire or executive ends voting
11. Winner announced (movie A), round advances
12. **Second test:** setup a tie (1 audience vote each, no exec vote), then exec votes → breaks tie

#### 3. Reconnection (`reconnection.test.ts`)

**Tests:** player disconnects mid-game, same name rejoins, identity restored

**Key assertions:**
- Player disconnects during pitching
- Other players see "disconnected" status
- Disconnected player's page shows they left
- Same name rejoins via Join page
- Player identity restored (same player ID, same score)
- Game state preserved (phase, round, scores unchanged)
- Rejoined player can continue playing

**Detailed flow:**
1. 3 players join, start game, reach pitching phase
2. Bob closes his page (simulating disconnect)
3. Alice and Charlie see Bob marked as disconnected
4. Wait 2 seconds
5. Bob opens new page, joins same room with same name
6. Bob's new page shows the current game state (pitching phase)
7. Bob's player ID matches original
8. Bob's score matches (0 at this point, or whatever it was)

#### 4. Host Succession (`host-succession.test.ts`)

**Tests:** host leaves, next connected player promoted to host

**Key assertions:**
- Host leaves during lobby
- Another player sees "Start Game" button (promoted to host)
- Game can proceed with new host
- Host leaves during game-end
- New host sees "Play Again" button

**Detailed flow:**
1. Alice creates room (host), Bob joins
2. Alice clicks Leave Game
3. Bob's page now shows "Start Game" button (Bob is new host)
4. Bob starts game, plays through with a third player Charlie
5. At game-end, Bob (current host) leaves
6. Charlie now sees "Play Again" button

#### 5. NOTE Card Timer (`note-card-timer.test.ts`)

**Tests:** executive plays a NOTE card during pitch, timer pauses, auto-resumes after 5s

**Key assertions:**
- Executive sees 3 NOTE cards during pitching
- Executive clicks a NOTE card
- Timer pauses (timer_paused event)
- Audience + all players see the NOTE card played
- After 5 seconds, timer auto-resumes (timer_started event)
- Timer continues counting down from where it paused
- Executive can play multiple NOTE cards
- NOTE card with draws auto-substitutes `____`

**Detailed flow:**
1. 2 players join, play to pitching phase
2. Executive (Alice) sees "Start Timer" button + 3 note cards
3. Alice starts timer
4. Wait 2 seconds (timer at ~43s)
5. Alice clicks a NOTE card
6. Timer pauses, all pages show paused timer
7. NOTE card text appears on the movie (notesPlayed)
8. Wait 5 seconds
9. Timer auto-resumes
10. Timer continues from ~43s (not reset to 45)

#### 6. Timer Expiry (`timer-expiry.test.ts`)

**Tests:** pitch timer runs out without end_pitch, game auto-advances to next pitcher or round-end

**Key assertions:**
- Timer counts down to 0
- timer_expired event fires
- If more pitchers remain: next pitcher's movie revealed, timer reset to 45
- If last pitcher: phase transitions to round-end
- Audience page reflects the transition

**Detailed flow:**
1. 2 players join, play to pitching phase
2. Executive starts timer
3. Wait 47 seconds (45s timer + buffer)
4. Verify phase transition: either next pitcher or round-end
5. For 2-player game: round-end (only 1 writer)
6. Verify round-end UI appears

#### 7. Deck Reshuffle (`deck-reshuffle.test.ts`)

**Tests:** deck runs out and refills from full card set

**Key assertions:**
- Plot deck starts with 166 cards (or 164 in 2-player)
- After drawing enough, deck refills
- Game continues without errors
- Drawn cards after reshuffle are valid

**Approach:** This is hard to test via UI since we can't see deck sizes. Use the parallel socket to inspect server state. Play multiple rounds, draw many cards, verify no errors and game completes. Alternatively, use a socket-only test (not full E2E) for the reshuffle mechanics, and an E2E test that just plays a 4-player game (more card draws) to verify no crashes.

**Detailed flow:**
1. 4 players join (more card draws per round)
2. Play 2 full rounds (8 card draws per round × 2 = 16 draws, plus note cards)
3. Verify game completes without errors
4. Verify all rounds complete, game-end reached

#### 8. Auto-Draw Cards (`auto-draw-cards.test.ts`)

**Tests:** card with `____` placeholder draws from deck and substitutes text in UI

**Key assertions:**
- Writer selects a card with `draws` property
- The chosen card displays with substituted text (no `____` visible)
- The displayed text includes the drawn card's text
- Blind card is from the opposite deck

**Approach:** We can't control which cards are drawn (random shuffle). Two options:
- A) Play many games until an auto-draw card appears naturally (flaky)
- B) Use socket to inspect state and find an auto-draw card, then select it via UI

**Detailed flow (option B):**
1. 2 players join, start game
2. Writer draws PLOT cards via UI
3. Inspect hand via parallel socket
4. Find a card with `draws` property (if none, redraw by leaving and rejoining — or accept that some games won't have one)
5. Select that card via UI
6. Verify the selected card text has no `____`
7. Verify `substitutedText` contains the drawn card's text

**Fallback:** If no auto-draw card appears after 3 attempts, skip the test with a warning. This is acceptable because auto-draw substitution is already tested in unit tests (`state-machine.test.ts`).

#### 9. Franchise Cards (`franchise-cards.test.ts`)

**Tests:** franchise card holder pitches last in 3+ player games

**Key assertions:**
- In a 3+ player game, if a writer has a franchise card, they pitch last
- The pitch order reflects this: non-franchise writers first, franchise holders last
- Franchise card displays with "FRANCHISE PITCH:" header
- In 2-player games, franchise cards are filtered out

**Approach:** Similar to auto-draw — franchise cards are random. Use socket inspection to detect if any writer has a franchise card, then verify pitch order. If no franchise cards appear, skip.

**Detailed flow:**
1. 3 players join, start game
2. All writers draw cards and select
3. Inspect movies via socket for `isFranchise` flag
4. If any franchise cards: verify pitch order (franchise holders last)
5. If no franchise cards: skip test

## What This Design Does NOT Do

- No load/stress testing (already covered by `stress/` package)
- No unit testing (already covered by server/client Vitest suites)
- No visual regression testing (no screenshot comparison)
- No mobile viewport testing
- No accessibility testing
- No network condition testing

## Test Execution

```bash
npm run build                          # Build client + server first
npx playwright test --config e2e/playwright.config.ts
```

Each test file runs sequentially (workers: 1, fullyParallel: false). Tests use a fresh temp database (`/tmp/directtovideo-e2e-test.db`) deleted between runs.

## Timeout Considerations

- Timer expiry test needs 47+ seconds (45s timer + buffer) → test timeout 120s
- Full 3-player game needs ~60 seconds → test timeout 120s
- Other tests: 90s (default)

## Files Changed

| File | Change |
|------|---------|
| `e2e/helpers.ts` | **New** — shared test helpers |
| `e2e/journeys/full-three-player.test.ts` | **New** — 3-player full game |
| `e2e/journeys/audience-voting.test.ts` | **New** — audience voting + tie-breaker |
| `e2e/journeys/reconnection.test.ts` | **New** — disconnect + rejoin |
| `e2e/journeys/host-succession.test.ts` | **New** — host leaves, promotion |
| `e2e/journeys/note-card-timer.test.ts` | **New** — NOTE card play + timer pause/resume |
| `e2e/journeys/timer-expiry.test.ts` | **New** — timer expiry auto-advances |
| `e2e/journeys/deck-reshuffle.test.ts` | **New** — 4-player game, deck exhaustion |
| `e2e/journeys/auto-draw-cards.test.ts` | **New** — ____ substitution via UI |
| `e2e/journeys/franchise-cards.test.ts` | **New** — franchise pitch order |
| `e2e/playwright.config.ts` | Modify: add `testDir` to include `journeys/` |

## Verification

After implementation:
1. `npm run build` — must succeed
2. `npx playwright test --config e2e/playwright.config.ts` — all tests pass
3. Existing `full-game.test.ts` still passes