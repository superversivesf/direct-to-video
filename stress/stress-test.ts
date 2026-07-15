import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { PublicRoomState, AudienceRoomState, DeckType } from "@direct-to-video/shared";

const TARGET = process.env.STRESS_TARGET || "http://localhost:3000";
const NUM_PLAYERS = parseInt(process.env.STRESS_PLAYERS || "10", 10);
const NUM_ROUNDS = parseInt(process.env.STRESS_ROUNDS || "3", 10);
const NUM_AUDIENCE = parseInt(process.env.STRESS_AUDIENCE || "0", 10);

interface Player {
  name: string;
  socket: ClientSocket;
  playerId: string;
  roomCode: string;
  state: PublicRoomState | null;
}

interface AudienceMember {
  name: string;
  socket: ClientSocket;
  state: AudienceRoomState | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function waitForState(socket: ClientSocket, timeout = 10000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timeout waiting for room_joined")), timeout);
    const handler = (state: PublicRoomState) => {
      clearTimeout(timer);
      socket.off("room_joined", handler);
      resolve(state);
    };
    socket.on("room_joined", handler);
  });
}

function waitForPhase(socket: ClientSocket, phase: string, timeout = 15000): Promise<PublicRoomState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for phase ${phase}`)), timeout);
    const handler = (state: PublicRoomState) => {
      if (state.phase === phase) {
        clearTimeout(timer);
        socket.off("room_joined", handler);
        resolve(state);
      }
    };
    socket.on("room_joined", handler);
  });
}

function waitForHand(socket: ClientSocket, getState: () => PublicRoomState | null, timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myHand && state.myHand.length > 0) {
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for hand"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForMovieReady(socket: ClientSocket, getState: () => PublicRoomState | null, timeout = 10000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const state = getState();
      if (state && state.myMovieReady) {
        resolve();
        return;
      }
      if (Date.now() - start > timeout) {
        reject(new Error("Timeout waiting for movie ready"));
        return;
      }
      setTimeout(check, 100);
    };
    check();
  });
}

function waitForPhaseAll(players: Player[], phase: string, timeout = 15000): Promise<void> {
  return Promise.all(players.map((p) => {
    if (p.state?.phase === phase) return Promise.resolve();
    return waitForPhase(p.socket, phase, timeout);
  })).then(() => {});
}

function connectPlayer(target: string, roomCode: string, name: string): Promise<Player> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout connecting ${name}`));
    }, 15000);

    socket.on("room_joined", (state: PublicRoomState) => {
      clearTimeout(timer);
      resolve({ name, socket, playerId: state.myPlayerId!, roomCode: state.code, state });
    });

    socket.on("connect", () => {
      socket.emit("join_room", roomCode, name);
    });

    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(`${name} error: ${msg}`));
    });
  });
}

function connectAudience(target: string, roomCode: string, name: string): Promise<AudienceMember> {
  return new Promise((resolve, reject) => {
    const socket = ioClient(target, { forceNew: true, transports: ["websocket"] });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`Timeout connecting audience ${name}`));
    }, 15000);

    socket.on("audience_joined", (state: AudienceRoomState) => {
      clearTimeout(timer);
      resolve({ name, socket, state });
    });

    socket.on("connect", () => {
      socket.emit("join_audience", roomCode);
    });

    socket.on("error", (msg: string) => {
      clearTimeout(timer);
      reject(new Error(`Audience ${name} error: ${msg}`));
    });
  });
}

function printBanner(text: string): void {
  const line = "=".repeat(60);
  console.log(`\n${line}\n${text}\n${line}`);
}

async function runGame(target: string, numPlayers: number, numRounds: number, numAudience: number): Promise<void> {
  printBanner(`STRESS TEST: ${numPlayers} players, ${numAudience} audience, ${numRounds} rounds, target ${target}`);

  const players: Player[] = [];
  const audienceMembers: AudienceMember[] = [];
  let roomCode = "";

  // Phase 1: Connect all players
  printBanner("PHASE 1: Connecting players");
  for (let i = 0; i < numPlayers; i++) {
    const name = `Player${i + 1}`;
    const code = i === 0 ? "" : roomCode;
    try {
      const player = await connectPlayer(target, code, name);
      if (i === 0) roomCode = player.roomCode;
      players.push(player);
      console.log(`  [OK] ${name} joined room ${player.roomCode}`);
    } catch (err) {
      console.error(`  [FAIL] ${name}: ${(err as Error).message}`);
      throw err;
    }
    await sleep(200);
  }

  // Connect audience members
  if (numAudience > 0) {
    printBanner(`PHASE 1b: Connecting ${numAudience} audience members`);
    for (let i = 0; i < numAudience; i++) {
      const name = `Audience${i + 1}`;
      try {
        const audience = await connectAudience(target, roomCode, name);
        audienceMembers.push(audience);
        console.log(`  [OK] ${name} joined room ${roomCode}`);
      } catch (err) {
        console.error(`  [FAIL] ${name}: ${(err as Error).message}`);
        throw err;
      }
      await sleep(100);
    }
  }

  // Subscribe all players to state updates
  for (const p of players) {
    p.socket.on("room_joined", (state: PublicRoomState) => {
      p.state = state;
    });
  }

  // Subscribe audience to state updates
  for (const a of audienceMembers) {
    a.socket.on("audience_update", (state: AudienceRoomState) => {
      a.state = state;
    });
    a.socket.on("vote_update", (voteCounts: { playerId: string; votes: number }[]) => {
      if (a.state) a.state = { ...a.state, voteCounts };
    });
    a.socket.on("voting_started", (secondsRemaining: number) => {
      if (a.state) a.state = { ...a.state, votingActive: true, timer: { running: true, secondsRemaining, pausedAt: null, pausedForNote: false, noteResumeAt: null } };
    });
    a.socket.on("voting_ended", (_winnerId: string) => {
      if (a.state) a.state = { ...a.state, votingActive: false };
    });
  }

  console.log(`\n  All ${players.length} players and ${audienceMembers.length} audience connected to room ${roomCode}`);

  // Phase 2: Start game
  printBanner("PHASE 2: Starting game");
  const host = players[0];
  console.log(`  Host ${host.name} starting game...`);

  const startPromises = players.map((p) => waitForState(p.socket));
  host.socket.emit("start_game");
  await Promise.all(startPromises);
  console.log("  Game started — all players received setup state");

  // Phase 3: Play rounds
  for (let round = 1; round <= numRounds; round++) {
    printBanner(`PHASE 3: Round ${round}`);

    // All players wait for setup phase
    await waitForPhaseAll(players, "setup").catch(() => null);
    await sleep(500);

    // Re-read state to get current executive
    const currentState = players[0].state!;
    const executiveId = currentState.executiveId;
    const executive = players.find((p) => p.playerId === executiveId);
    const writers = players.filter((p) => p.playerId !== executiveId);

    console.log(`  Executive: ${executive?.name}`);
    console.log(`  Writers: ${writers.map((w) => w.name).join(", ")}`);

    // Writers select deck type and cards
    // First: all writers select their deck type (hands are cleared each round)
    for (const writer of writers) {
      const writerState = writer.state!;
      if (!writerState.myHand || writerState.myHand.length === 0) {
        const deckType: DeckType = Math.random() < 0.5 ? "plot" : "character";
        console.log(`  ${writer.name} selecting deck: ${deckType}`);
        const handPromise = waitForHand(writer.socket, () => writer.state);
        writer.socket.emit("select_deck_type", deckType);
        await handPromise;
      }
    }

    // Then: all writers select a card from their hand
    for (const writer of writers) {
      const deckState = writer.state!;
      const cardId = deckState.myHand?.[0]?.id;
      if (cardId) {
        console.log(`  ${writer.name} selecting card ${cardId}`);
        const moviePromise = waitForMovieReady(writer.socket, () => writer.state).catch(() => null);
        writer.socket.emit("select_card", cardId);
        await moviePromise;
      } else {
        console.log(`  ${writer.name} has no cards in hand! (phase: ${deckState.phase}, hand: ${deckState.myHand?.length ?? 0})`);
      }
    }

    // Wait for pitching phase
    console.log("  Waiting for pitching phase...");
    await waitForPhaseAll(players, "pitching");
    console.log("  Pitching phase reached");

    const pitchState = players[0].state!;
    // All writers are pitchers; use currentPitcherId to determine order
    const pitcherIds = writers.map((w) => w.playerId);
    console.log(`  Pitchers: ${pitcherIds.map((id) => players.find((p) => p.playerId === id)?.name).join(", ")}`);

    // Play through each pitcher
    for (let pi = 0; pi < pitcherIds.length; pi++) {
      const pitcherId = pitcherIds[pi];
      const pitcher = players.find((p) => p.playerId === pitcherId);
      if (!pitcher) continue;

      console.log(`\n  Pitch ${pi + 1}/${pitcherIds.length}: ${pitcher.name}`);

      // Reveal movie
      pitcher.socket.emit("reveal_movie");
      await sleep(300);

      // Executive starts timer
      console.log(`    Starting timer...`);
      executive?.socket.emit("start_timer");
      await sleep(500);

      // Executive plays a note card 70% of the time
      const execState = executive!.state!;
      const notes = execState.myExecutiveNotes || [];
      if (notes.length > 0 && Math.random() < 0.7) {
        const noteId = notes[0].id;
        console.log(`    Exec playing note card`);
        executive?.socket.emit("play_note", noteId);
        await sleep(1500);
      } else {
        await sleep(1000);
      }

      // Executive ends pitch
      console.log(`    Ending pitch...`);
      executive?.socket.emit("end_pitch");
      await sleep(500);

      // If there are more pitchers, wait for next_pitcher or state update
      if (pi < pitcherIds.length - 1) {
        await sleep(500);
      }
    }

    // Wait for round-end
    console.log("\n  Waiting for round-end...");
    await sleep(1000);
    await waitForPhaseAll(players, "round-end");
    console.log("  Round-end phase reached");

    // If audience is present, use voting; otherwise direct pick
    const movies = players[0].state?.movies || [];
    if (movies.length > 0) {
      if (audienceMembers.length > 0) {
        // Executive starts voting
        console.log(`\n  Executive starting audience voting...`);
        executive?.socket.emit("start_voting");
        await sleep(2000);

        // Audience members cast random votes
        for (const audience of audienceMembers) {
          const movie = movies[Math.floor(Math.random() * movies.length)];
          audience.socket.emit("cast_vote", movie.playerId);
        }
        console.log(`  ${audienceMembers.length} audience members cast votes`);

        // Executive also votes (2x weight)
        const execMovie = movies[Math.floor(Math.random() * movies.length)];
        executive?.socket.emit("cast_vote", execMovie.playerId);
        console.log(`  Executive cast vote (2x weight)`);

        await sleep(1000);

        // Executive ends voting
        console.log(`  Executive ending voting...`);
        executive?.socket.emit("end_voting");

        await sleep(2000);
      } else {
        // No audience — direct winner pick
        const winnerMovie = movies[Math.floor(Math.random() * movies.length)];
        const winnerName = players.find((p) => p.playerId === winnerMovie.playerId)?.name;
        console.log(`\n  Executive selecting winner: ${winnerName}`);
        executive?.socket.emit("select_winner", winnerMovie.playerId);
        await sleep(2000);
      }

      // Check if game ended
      const postWinState = players[0].state!;
      if (postWinState.phase === "game-end") {
        printBanner("GAME ENDED");
        const sorted = [...postWinState.players].sort((a, b) => b.score - a.score);
        for (const p of sorted) {
          console.log(`  ${p.name}: ${p.score} pts`);
        }
        break;
      }

      console.log(`  Round ${round} complete, transitioning to next round`);
    }
  }

  // Phase 4: Disconnect all
  printBanner("PHASE 4: Disconnecting all players and audience");
  for (const p of players) {
    p.socket.disconnect();
    console.log(`  [OK] ${p.name} disconnected`);
  }
  for (const a of audienceMembers) {
    a.socket.disconnect();
    console.log(`  [OK] ${a.name} disconnected`);
  }

  printBanner("STRESS TEST PASSED");
}

runGame(TARGET, NUM_PLAYERS, NUM_ROUNDS, NUM_AUDIENCE).catch((err) => {
  console.error("\n!!! STRESS TEST FAILED !!!");
  console.error(err);
  process.exit(1);
});