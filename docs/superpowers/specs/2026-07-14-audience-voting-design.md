# Audience Voting — Design Spec

**Date:** 2026-07-14
**Status:** Approved
**Feature:** Allow audience members to vote on the best movie alongside the Executive

## Overview

When audience members are present during the round-end phase, the Executive can start a voting period. Audience members each get one vote. The Executive's vote counts as 2x. The highest total wins. If no audience is present, the Executive picks the winner directly (current behavior unchanged).

## Voting Flow

```
round-end (all movies revealed)
  │
  ├── No audience → Executive clicks "Pick This Movie" → winner selected (current behavior)
  │
  └── Audience present → Executive clicks "Start Voting"
      │
      ▼
    voting (30-second timer)
      │  Audience members see vote buttons on each movie
      │  Executive also votes (their pick = 2x weight)
      │  Live vote counts shown to all players + audience
      │  Timer expires OR Executive clicks "End Voting"
      │
      ▼
    Votes tallied → winner = highest total
      │  Ties → Executive's pick wins among tied movies
      │  If Executive didn't vote → their pick is random among tied
      │
      ▼
    selectWinner (existing flow continues)
```

## Weight System

| Voter | Weight |
|-------|--------|
| Executive | 2 votes |
| Each audience member | 1 vote |
| Players (non-exec) | 0 votes (they pitched, they don't vote) |

## Edge Cases

| Scenario | Resolution |
|----------|-----------|
| No audience members | No voting phase — Executive picks directly (current behavior) |
| 1 audience member | Voting available — audience vote (1) vs Exec vote (2), Exec always outvotes |
| Tie between movies | Executive's voted movie wins among tied. If Exec didn't vote, random pick among tied. |
| Audience member joins mid-vote | Can vote if timer hasn't expired |
| Audience member disconnects after voting | Vote still counts |
| Executive doesn't vote before timer expires | Their vote is not counted (but their 2x weight is forfeit, not reassigned) |
| Executive disconnects during voting | Host takes over as Exec (existing host succession), gets the 2x vote |

## Data Model Changes

### Room (server-internal)
```typescript
votes: Record<string, string>;  // voterId → playerId they voted for
votingActive: boolean;           // true during voting phase
```

### PublicRoomState (player view)
```typescript
votingActive: boolean;
voteCounts: { playerId: string; votes: number }[];  // live tally
myVote: string | null;  // playerId the player voted for (always null for non-exec players)
```

### AudienceRoomState (audience view)
```typescript
votingActive: boolean;
voteCounts: { playerId: string; votes: number }[];
hasVoted: boolean;  // whether this audience member has voted
```

## Socket.IO Event Changes

### New Client → Server Events
| Event | Payload | Description |
|-------|---------|-------------|
| `start_voting` | () | Executive starts the voting phase |
| `cast_vote` | (playerId: string) | Audience member votes for a movie |
| `end_voting` | () | Executive ends voting early |

### New Server → Client Events
| Event | Payload | Description |
|-------|---------|-------------|
| `voting_started` | (secondsRemaining: number) | Voting phase begun, timer started |
| `vote_update` | (voteCounts: { playerId: string; votes: number }[]) | Live vote tally update |
| `voting_ended` | (winnerId: string) | Voting complete, winner announced |

## State Machine Changes

### New Phase
No new phase — voting happens within `round-end`. The `votingActive` boolean on Room controls whether vote buttons are shown vs the normal Executive pick UI.

### New Functions
- `startVoting(store, room)` — sets `votingActive: true`, starts 30s timer
- `castVote(store, room, voterId, playerId)` — records a vote, broadcasts updated counts
- `endVoting(store, room)` — tallies votes, calls `selectWinner` with the winner

### Timer Reuse
The existing timer infrastructure is reused with a 30-second duration. Timer expiry triggers `endVoting`.

## Client UI Changes

### Player View (Game.tsx) — round-end phase
- If `votingActive`:
  - Show live vote tally under each movie
  - Executive sees "End Voting" button
  - Non-exec players see "Voting in progress..." message
- If not `votingActive` and audience is present:
  - Executive sees "Start Voting" button alongside "Pick This Movie" buttons
- If not `votingActive` and no audience:
  - Executive sees "Pick This Movie" buttons (current behavior)

### Audience View (Audience.tsx) — round-end phase
- If `votingActive` and `!hasVoted`:
  - Show "Vote" button under each movie
- If `votingActive` and `hasVoted`:
  - Show "Voted!" indicator, live tally visible
- If not `votingActive`:
  - Show "Executive is choosing the winner..." (current behavior)