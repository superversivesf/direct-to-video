# v2.0 Sub-project 1: Core Gameplay Redesign

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove executive role, add random note-giver, redesign voting to everyone-votes with cumulative scoring, add host-selectable round count, fold in the refactor (split sockets.ts, extract card-ops, timer-helpers).

**Architecture:** Bottom-up — types first, then state machine, then socket handlers (split into directory), then client hooks/components. Each task leaves the codebase in a working state with tests passing.

**Tech Stack:** TypeScript, Node.js 20, Vitest 1.6, Socket.IO, React 18

## Global Constraints

- Server imports use `.js` extensions (ESM requirement)
- All existing tests must pass after each task (update them as needed)
- Run `npx tsc --noEmit -p server/tsconfig.json` and `npx tsc --noEmit -p client/tsconfig.json` after every task
- No comments in code unless explicitly requested
- `@direct-to-video/shared` resolves via workspace symlink; subpath imports work under `moduleResolution: "bundler"`
- Version starts at 2.0.0 for this sub-project

---

## Task 1: Update shared types

**Files:** Modify `shared/types.ts`

Replace entire file with the v2.0 types. Key changes:
- `Player.isExecutive` → `Player.isNoteGiver`
- `Room.executiveId` → `Room.noteGiverId`; `Room.executiveNotes` → `Room.noteGiverNotes`
- Add `Room.noteGiverOrder: string[]`, `Room.noteGiverIndex: number`, `Room.totalRounds: number`
- Remove `Room.round.total` (now top-level `totalRounds`)
- `PublicRoomState.myExecutiveNotes` → `myNoteGiverNotes`; `executiveId` → `noteGiverId`
- Add `PublicRoomState.totalRounds`, `AudienceRoomState.totalRounds`
- `PublicPlayer.isExecutive` → `isNoteGiver`
- Remove `select_winner`, `start_voting`, `end_voting` from `ClientToServerEvents`
- Add `set_total_rounds: (rounds: number) => void`, `kick_player: (playerId: string) => void`
- Remove `winner_selected` from `ServerToClientEvents`
- `voting_ended` now sends `roundWinnerId: string` (not `winnerId`)
- Add `kicked: () => void`
- Bump `VERSION` to `"2.0.0"`

- [ ] Replace `shared/types.ts` with the full v2.0 types (see spec Section 1-3 for all fields)
- [ ] Verify no syntax errors: `npx tsc --noEmit shared/types.ts 2>&1 | head -5`
- [ ] Commit: `git add shared/types.ts && git commit -m "refactor: v2.0 types — note-giver, totalRounds, voting redesign"`

---

## Task 2: Update rooms.ts

**Files:** Modify `server/src/rooms.ts`

- [ ] Update `createEmptyRoom`: remove `executiveId`, `executiveNotes`, `round.total`; add `noteGiverId: null`, `noteGiverOrder: []`, `noteGiverIndex: 0`, `totalRounds: 5`, `noteGiverNotes: []`, `round: { current: 0 }`
- [ ] Update `createPlayer`: `isExecutive: false` → `isNoteGiver: false`
- [ ] Run typecheck: `npx tsc --noEmit -p server/tsconfig.json 2>&1 | grep rooms.ts` (should be clean for rooms.ts)
- [ ] Commit: `git add server/src/rooms.ts && git commit -m "refactor: rooms.ts for v2.0"`

---

## Task 3: Extract card-ops.ts and timer-helpers.ts

**Files:** Create `server/src/card-ops.ts`, create `shared/timer-helpers.ts`, create `server/test/card-ops.test.ts`, create `server/test/timer-helpers.test.ts`

- [ ] Create `server/src/card-ops.ts` — move `shuffle`, `drawCards`, `getRefillDeck`, `drawFromDeck`, `substituteDraws` from state-machine.ts. Export all of them.
- [ ] Create `server/test/card-ops.test.ts` — test `substituteDraws`: no draws, single draw, multiple draws, multi-count, multiple decks, deck reduction
- [ ] Create `shared/timer-helpers.ts` — `timerRunning(s)`, `timerIdle(s)`, `timerPaused(s)`, `timerExpired()` (all return `TimerState`)
- [ ] Create `server/test/timer-helpers.test.ts` — 4 tests, one per helper, verify shape
- [ ] Run tests: `cd server && npx vitest run test/card-ops.test.ts test/timer-helpers.test.ts`
- [ ] Commit: `git add server/src/card-ops.ts server/test/card-ops.test.ts shared/timer-helpers.ts server/test/timer-helpers.test.ts && git commit -m "refactor: extract card-ops and timer-helpers"`

---

## Task 4: Rewrite state-machine.ts

**Files:** Modify `server/src/state-machine.ts`, modify `server/test/state-machine.test.ts`

This is the core rewrite. The full file replaces the executive-centric logic with note-giver logic and the new voting flow.

**Key function changes:**
- `startGame`: build `noteGiverOrder` (shuffled player IDs), set `round.current = 1`, call `setupRound`
- `setupRound`: select note-giver from `noteGiverOrder` (skip disconnected, reshuffle when exhausted), draw 3 note cards, set `noteGiverId`, clear hands, set `phase: "setup"`
- `selectDeckType`: unchanged except `noteGiverId` replaces `executiveId` in the exec check
- `selectCard`: unchanged except uses `substituteDraws` from card-ops.ts
- `startPitching`: sort note-giver to end of pitch order (in addition to franchise holders)
- `revealMovie`: unchanged
- `endPitch`: when last pitcher ends → set `phase: "round-end"`, set `votingActive: true`, set `timer: createTimer(15)` (was 45)
- `playNote`: uses `noteGiverId` instead of `executiveId`, uses `substituteDraws`
- `castVote`: validate `voterId !== playerId` for players (audience can vote for anyone)
- **NEW** `tallyAndAdvance`: replaces `selectWinner`/`endVoting` — tally votes into scores, find round winner, clear votes, advance round or game-end
- `nextRound`: unchanged except uses `totalRounds` for game-end check
- `playAgain`: clear `noteGiverOrder`, `noteGiverIndex`, `roundWinnerId`

**Removed functions:** `selectWinner`, `startVoting`, `endVoting`, `tallyVotes`

- [ ] Rewrite `state-machine.ts` with all the above changes
- [ ] Update `state-machine.test.ts` — replace all executive references with note-giver, remove `selectWinner`/`startVoting`/`endVoting`/`tallyVotes` tests, add `tallyAndAdvance` tests, add note-giver rotation tests, add self-vote prevention test, add cumulative scoring test
- [ ] Run tests: `cd server && npx vitest run test/state-machine.test.ts`
- [ ] Run typecheck: `npx tsc --noEmit -p server/tsconfig.json 2>&1 | grep state-machine`
- [ ] Commit: `git add server/src/state-machine.ts server/test/state-machine.test.ts && git commit -m "refactor: rewrite state-machine for v2.0 — note-giver, voting, scoring"`

---

## Task 5: Split sockets.ts into sockets/ directory

**Files:** Create `server/src/sockets/rate-limits.ts`, `server/src/sockets/state-mapper.ts`, `server/src/sockets/handlers.ts`, delete `server/src/sockets.ts`, modify `server/src/index.ts`, modify `server/test/sockets.test.ts`

Split the 713-line `sockets.ts` into three focused files:
- `rate-limits.ts` — all rate limiting (connection, join, event), `resetRateLimits`, `clearSocketEventCount`
- `state-mapper.ts` — `toPublicRoomState`, `toAudienceRoomState`, broadcasting, socket tracking (`playerSockets`, `audienceSockets`), `computeVoteCounts` (now 1x weight), `checkAllVoted`, `emitRoundResult`
- `handlers.ts` — `setupSocketHandlers` with all event handlers, timer tick loop, disconnect handling

**Handler changes for v2.0:**
- `select_winner`, `start_voting`, `end_voting` handlers → **removed**
- `start_timer`, `pause_timer`, `play_note` → check `noteGiverId` instead of `executiveId`
- `cast_vote` → self-vote prevention, early termination when all voted
- `end_pitch` → when last pitch ends, auto-start 15s voting timer (no exec action needed)
- Timer tick voting expiry → calls `tallyAndAdvance`, emits `voting_ended` with `roundWinnerId`, emits `round_started` or `game_ended`
- New: `set_total_rounds` handler — host only, lobby only
- New: `kick_player` handler — host only, removes player, disconnects socket, reassigns note-giver if needed
- Disconnect handler → 60s stale disconnect timeout (Sub-project 2, but add the structure now)

- [ ] Create `server/src/sockets/rate-limits.ts`
- [ ] Create `server/src/sockets/state-mapper.ts`
- [ ] Create `server/src/sockets/handlers.ts`
- [ ] Delete `server/src/sockets.ts`
- [ ] Update `server/src/index.ts` import: `./sockets.js` → `./sockets/handlers.js`
- [ ] Update `server/test/sockets.test.ts` imports
- [ ] Run tests: `cd server && npx vitest run`
- [ ] Run typecheck: `npx tsc --noEmit -p server/tsconfig.json`
- [ ] Commit: `git add -A && git rm server/src/sockets.ts && git commit -m "refactor: split sockets.ts + v2.0 handlers — note-giver, auto-voting, kick"`

---

## Task 6: Update client hooks (useRoom.ts)

**Files:** Modify `client/src/hooks/useRoom.ts`

- [ ] Remove `selectWinner`, `startVoting`, `endVoting` emit helpers
- [ ] Add `setTotalRounds: (rounds: number) => void` — emits `set_total_rounds`
- [ ] Add `kickPlayer: (playerId: string) => void` — emits `kick_player`
- [ ] Update `winner_selected` handler → removed (no longer emitted by server)
- [ ] Update `voting_ended` handler → now receives `roundWinnerId` (was `winnerId`)
- [ ] Add `kicked` handler → redirect to join page
- [ ] Run typecheck: `npx tsc --noEmit -p client/tsconfig.json 2>&1 | grep useRoom`
- [ ] Commit: `git add client/src/hooks/useRoom.ts && git commit -m "refactor: useRoom hooks for v2.0"`

---

## Task 7: Update Game.tsx — remove executive UI, add note-giver UI, update voting

**Files:** Modify `client/src/pages/Game.tsx`, rename `client/src/components/ExecutiveControls.tsx` → `client/src/components/NoteGiverControls.tsx`

- [ ] Rename `ExecutiveControls.tsx` → `NoteGiverControls.tsx`, update all references (`isExecutive` → `isNoteGiver`, `executiveControls` → `noteGiverControls`)
- [ ] In `Game.tsx`: replace all `executiveId`/`isExecutive` with `noteGiverId`/`isNoteGiver`
- [ ] Lobby: add round count dropdown (3/5/7/10, default 5) next to franchise toggle, host-only
- [ ] Setup phase: note-giver sees "You are the Note Giver. Waiting for writers..." with ready indicators
- [ ] Pitching phase: note-giver controls (timer + notes) instead of executive controls
- [ ] Round-end: remove "Pick This Movie" buttons, show vote buttons for all movies (except own), show 15s timer, show vote tallies
- [ ] Game-end: show cumulative scores (already works — `score` now accumulates votes)
- [ ] Round winner banner: show round winner (player with most votes that round)
- [ ] Run typecheck + client tests
- [ ] Commit: `git add -A && git commit -m "refactor: Game.tsx + NoteGiverControls for v2.0"`

---

## Task 8: Update Audience.tsx and remaining components

**Files:** Modify `client/src/pages/Audience.tsx`, `client/src/components/RoundSummary.tsx`, `client/src/components/PlayerList.tsx`

- [ ] `Audience.tsx`: replace `executiveId` references with `noteGiverId`, show note-giver name in header, show vote buttons during voting (all movies), show timer
- [ ] `RoundSummary.tsx`: replace "Pick This Movie" with vote buttons, show vote tallies, remove `canPick`/`onSelectWinner` props, add `onCastVote` prop
- [ ] `PlayerList.tsx`: replace executive icon (briefcase/crown) with note-giver icon (clapperboard or similar)
- [ ] Run typecheck + client tests
- [ ] Commit: `git add -A && git commit -m "refactor: audience + components for v2.0"`

---

## Task 9: Update all tests, bump version, build, rebuild Docker

**Files:** All test files, `server/src/index.ts`

- [ ] Update `server/test/sockets.test.ts` — remove executive/voting tests, add note-giver tests, add auto-voting test, add self-vote prevention test, add kick test
- [ ] Update `client/test/Game.test.tsx` — remove executive references, add note-giver tests
- [ ] Update `client/test/ExecutiveControls.test.tsx` → rename to `NoteGiverControls.test.tsx`
- [ ] Run all server tests: `cd server && npx vitest run`
- [ ] Run all client tests: `cd client && npx vitest run`
- [ ] Run both typechecks
- [ ] Update `server/src/index.ts` VERSION to `"2.0.0"`
- [ ] Run build: `npm run build`
- [ ] Rebuild Docker: `docker compose build`
- [ ] Commit: `git add -A && git commit -m "feat: v2.0.0 — voting redesign, note-giver, cumulative scoring, round count"`
- [ ] Push: `git push origin master`

---

## Sub-project 2: Lobby Management (separate plan, after this one)

Ready indicators, host kick (handler added in Task 5, UI in sub-project 2), stale disconnect (structure added in Task 5, full logic in sub-project 2).

## Sub-project 3: Documentation (separate plan, after sub-project 2)

Update AGENTS.md, README, remove dead code references.